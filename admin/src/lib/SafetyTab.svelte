<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, num } from './format.ts';
	import { errMessage, supabase } from './supabase.ts';
	import type { Safety, SafetyTarget } from './types.ts';
	import { ask, toast } from './ui.svelte.ts';

	// Reports to act on (one row per reported account), and the spam limits for new accounts.
	let { onload }: { onload?: (s: Safety) => void } = $props();
	let data = $state<Safety | null>(null);
	let err = $state('');
	let openKey = $state<string | null>(null);
	let busy = $state(false);
	let edits = $state<Record<string, { new: number; trusted: number | null }>>({});

	function take(d: Safety) {
		data = d;
		onload?.(d);
		edits = Object.fromEntries(d.limits.map((l) => [l.key, { new: l.new, trusted: l.trusted }]));
		if (!openKey || !d.targets.some((t) => t.key === openKey)) openKey = d.targets[0]?.key ?? null;
	}
	async function load() {
		const { data: d, error } = await supabase.rpc('admin_safety');
		err = error ? errMessage(error) : '';
		if (!error) take(d as Safety);
	}
	onMount(load);
	const cur = $derived(data?.targets.find((t) => t.key === openKey) ?? null);

	const REASON: Record<string, string> = {
		pay_to_work: 'Asking creators to pay', fake: 'Fake brand', not_paid: "Didn't pay", abuse: 'Rude or threatening', spam: 'Spam',
		not_posted: "Got paid, didn't post", fake_followers: 'Fake followers', no_approval: 'Posted without approval', other: 'Something else'
	};
	const LIMIT: Record<string, [string, string]> = {
		requests_day: ['Requests to new creators', 'a day, per brand'],
		messages_hour: ['Messages', 'an hour, per person'],
		open_briefs: ['Open briefs live at once', 'per brand'],
		questions_day: ['Questions from a creator’s page', 'a day, per email, per creator'],
		signups_hour: ['Sign-ups', 'an hour, from one network'],
		auto_pause: ['Pause an account by itself', 'reports from different people, in 30 days']
	};
	const tag = (t: SafetyTarget) => (t.state === 'closed' ? ['Closed', 'mut'] : t.state === 'paused' || t.auto_paused ? [t.auto_paused && t.open ? 'Paused itself' : 'Paused', 'bad'] : t.open ? ['New', 'warn'] : ['Done', 'mut']);

	async function act(action: 'close' | 'keep' | 'unpause') {
		if (!cur) return;
		const q =
			action === 'close'
				? { title: `Close ${cur.name}?`, body: cur.kind === 'brand' ? 'Their running requests are cancelled and every creator they wrote to is told. Their email and any UPI ID they sent can’t be used again. The people who reported hear back.' : 'Their page goes offline and their running collabs are cancelled; the brands are told. The people who reported hear back.', ok: 'Close the account', danger: true }
				: action === 'keep'
					? { title: `Keep ${cur.name} paused?`, body: 'They get an email asking them to reply with anything we should know. The people who reported hear back.', ok: 'Keep paused and email' }
					: { title: `Unpause ${cur.name}?`, body: 'They can send requests and messages again. The people who reported hear we didn’t find a reason to act.', ok: 'Not a problem, unpause' };
		if (!(await ask(q))) return;
		busy = true;
		const { data: d, error } = await supabase.rpc('admin_safety_act', { p_key: cur.key, p_action: action });
		busy = false;
		if (error) return toast(errMessage(error), true);
		take(d as Safety);
		toast(action === 'close' ? `${cur?.name ?? 'The account'} is closed` : action === 'keep' ? 'Kept paused, email sent' : 'Unpaused');
	}
	async function saveLimits() {
		busy = true;
		const { data: d, error } = await supabase.rpc('admin_limits_set', { p: edits });
		busy = false;
		if (error) return toast(errMessage(error), true);
		take(d as Safety);
		toast('Limits saved');
	}
	const changed = $derived(!!data && data.limits.some((l) => edits[l.key] && (edits[l.key].new !== l.new || edits[l.key].trusted !== l.trusted)));
</script>

{#if err}<p class="err">{err}</p>{/if}

{#if !data}
	<div class="sf-load"><span class="spinner"></span></div>
{:else}
	<div class="sf-grid">
		<div class="sf-main">
			<div class="sf-list">
				{#each data.targets as t (t.key)}
					{@const [label, tone] = tag(t)}
					<button class="sf-row" class:on={openKey === t.key} onclick={() => (openKey = t.key)}>
						<span class="sf-av">{t.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
						<span class="sf-who"><b>{t.name} <small>· {t.kind}{t.about?.joined ? ` · joined ${ago(t.about.joined)}` : ''}</small></b><small>{REASON[t.reason] ?? t.reason} · {num(t.reports)} report{t.reports === 1 ? '' : 's'} from {num(t.people)} {t.people === 1 ? 'person' : 'people'}</small></span>
						<span class="sf-tag {tone}">{label}</span>
					</button>
				{:else}
					<p class="sf-none">No reports. Nobody has reported anyone in the last 30 days.</p>
				{/each}
			</div>

			{#if cur}
				<section class="sf-open">
					<div class="sf-oh"><b>{cur.name}</b><small>{[cur.about?.email, cur.kind === 'brand' && cur.about ? `${num(cur.about.requests_2d ?? 0)} requests in 2 days` : '', cur.about?.instagram ? 'Instagram connected' : 'Instagram not connected'].filter(Boolean).join(' · ')}</small></div>
					<div class="sf-items">
						{#each cur.items as it (it.id)}
							<div class="sf-item"><small>{it.by || 'Someone'} · {REASON[it.reason] ?? it.reason} · {ago(it.at)}{it.status === 'done' ? ` · ${it.outcome}` : ''}</small><span>{it.details ? `“${it.details}”` : 'No details added'}</span></div>
						{/each}
					</div>
					{#if cur.state !== 'closed'}
						<div class="sf-acts">
							<button class="neo danger" onclick={() => act('close')} disabled={busy}>Close the account</button>
							<button class="neo dark" onclick={() => act('keep')} disabled={busy}>Keep paused and email them</button>
							<button class="neo dark" onclick={() => act('unpause')} disabled={busy}>Not a problem, unpause</button>
						</div>
						<small class="sf-foot">{cur.kind === 'brand' ? 'Closing tells the creators they wrote to, and stops the email and UPI ID from being used again.' : 'Closing takes their page offline and tells the brands.'} The people who reported hear back.</small>
					{/if}
				</section>
			{/if}
		</div>

		<aside class="sf-side">
			<div class="sf-sh"><b>Spam limits</b><small>“New” means no finished collab and Instagram not connected yet.</small></div>
			<div class="sf-lim">
				<div class="sf-lr sf-lh"><span>What</span><span>New</span><span>Trusted</span></div>
				{#each data.limits as l (l.key)}
					<div class="sf-lr">
						<span><b>{LIMIT[l.key]?.[0] ?? l.key}</b><small>{LIMIT[l.key]?.[1] ?? ''}</small></span>
						<input class="inp" type="number" min="0" aria-label="{LIMIT[l.key]?.[0]}, new accounts" bind:value={edits[l.key].new} />
						{#if l.trusted !== null}<input class="inp" type="number" min="0" aria-label="{LIMIT[l.key]?.[0]}, trusted" bind:value={edits[l.key].trusted} />{:else}<small class="sf-dash">—</small>{/if}
					</div>
				{/each}
			</div>
			<button class="neo white" onclick={saveLimits} disabled={busy || !changed}>Save limits</button>

			<div class="sf-sh"><b>Limits hit today</b></div>
			{#each data.hits as h (h.kind + h.who)}
				<div class="sf-hit"><span><b>{h.who || 'Unknown'}</b><small>{LIMIT[h.kind]?.[0] ?? h.kind} · last {ago(h.last)}</small></span><b class="num">{num(h.n)}×</b></div>
			{:else}
				<p class="sf-none">Nobody ran into a limit today.</p>
			{/each}
			<small class="sf-foot">Messages that ask creators to pay, or carry a UPI ID in a first request, are flagged to the creator straight away.</small>
		</aside>
	</div>
{/if}

<style>
	.sf-load { min-height: 200px; display: grid; place-items: center; }
	.sf-grid { display: grid; grid-template-columns: minmax(0, 1fr) 500px; gap: 24px; align-items: start; }
	.sf-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
	.sf-list { display: grid; gap: 8px; }
	.sf-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 14px 16px; border: 1px solid var(--line); background: var(--surface); color: inherit; text-align: left; }
	.sf-row.on { border-color: var(--accent); background: var(--surface-2); }
	.sf-av { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--surface-2); font-size: 13px; font-weight: 700; }
	.sf-who { display: grid; gap: 2px; min-width: 0; }
	.sf-who b { font-size: 15px; }
	.sf-who b small { font-weight: 500; color: var(--ink-3); }
	.sf-who > small { font-size: 12.5px; color: var(--ink-2); }
	.sf-tag { padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; white-space: nowrap; }
	.sf-tag.bad { background: color-mix(in oklab, var(--bad) 18%, transparent); color: var(--bad); }
	.sf-tag.warn { background: color-mix(in oklab, var(--warn) 16%, transparent); color: var(--warn); }
	.sf-tag.mut { background: var(--surface-2); color: var(--ink-3); }
	.sf-none { padding: 16px; color: var(--ink-3); }
	.sf-open { padding: 20px; border: 1px solid var(--line-strong); background: var(--surface); display: grid; gap: 14px; }
	.sf-oh { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
	.sf-oh b { font: 400 28px/1 var(--f-serif); }
	.sf-oh small { font-size: 12.5px; color: var(--ink-3); overflow-wrap: anywhere; }
	.sf-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
	.sf-item { padding: 12px 14px; background: var(--surface-2); display: grid; gap: 4px; }
	.sf-item small { font-size: 12px; color: var(--ink-3); }
	.sf-item span { font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
	.sf-acts { display: flex; flex-wrap: wrap; gap: 10px; }
	.sf-foot { font-size: 12px; line-height: 1.45; color: var(--ink-3); }
	.sf-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
	.sf-sh { display: grid; gap: 4px; }
	.sf-sh b { font: 400 30px/1.1 var(--f-serif); }
	.sf-sh small { font-size: 12.5px; color: var(--ink-3); }
	.sf-lim { border: 1px solid var(--line); background: var(--surface); }
	.sf-lr { display: grid; grid-template-columns: minmax(0, 1fr) 80px 80px; gap: 10px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--line); }
	.sf-lh { border-top: 0; font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3); }
	.sf-lr > span { display: grid; min-width: 0; }
	.sf-lr b { font-size: 13.5px; }
	.sf-lr small { font-size: 11.5px; color: var(--ink-3); }
	.sf-lr .inp { height: 36px; padding: 0 10px; font-weight: 600; }
	.sf-dash { color: var(--ink-3); }
	.sf-hit { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--line); background: var(--surface); }
	.sf-hit span { flex: 1; display: grid; min-width: 0; }
	.sf-hit span b { font-size: 13.5px; overflow-wrap: anywhere; }
	.sf-hit small { font-size: 12px; color: var(--ink-3); }
	@media (max-width: 1100px) { .sf-grid { grid-template-columns: minmax(0, 1fr); } }
	@media (max-width: 560px) { .sf-lr { grid-template-columns: minmax(0, 1fr) 64px 64px; padding: 10px 12px; } }
</style>
