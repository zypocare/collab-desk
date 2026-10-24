<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, day, num } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';

	// Switches that stop a feature for everyone, the spam limits, limits for one account, and the AI shares.
	let { onflags }: { onflags?: (off: number) => void } = $props();

	type R = Record<string, any>;
	let d = $state<R | null>(null);
	let err = $state('');
	let edits = $state<Record<string, { new: number; trusted: number | null }>>({});
	let saving = $state(false);

	function take(x: R) {
		d = x;
		edits = Object.fromEntries(x.limits.map((l: R) => [l.key, { new: l.new, trusted: l.trusted }]));
		onflags?.(x.flags.filter((f: R) => !f.on).length);
	}
	async function load() {
		const { data, error } = await supabase.rpc('admin_controls');
		err = error ? errMessage(error) : '';
		if (!error) take(data as R);
	}
	onMount(load);

	async function flip(f: R) {
		const reason = await askText(
			f.on
				? { title: `Switch off “${f.label}” for everyone?`, body: `${f.note}. It stays off until someone switches it back on here.`, ok: 'Switch off', danger: true, input: { label: 'Why', placeholder: 'e.g. Gemini quota hit, pausing until midnight', required: true } }
				: { title: `Switch “${f.label}” back on?`, body: f.note + '.', ok: 'Switch on', input: { label: 'Note (optional)' } }
		);
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_flag_set', { p_key: f.key, p_on: !f.on, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		take(data as R);
		toast(f.on ? `${f.label} is off` : `${f.label} is on`);
	}

	const LIMIT: Record<string, [string, string]> = {
		requests_day: ['Requests to new creators', 'a day, per brand workspace'],
		messages_hour: ['Messages', 'an hour, per person'],
		open_briefs: ['Open briefs live at once', 'per brand workspace'],
		questions_day: ['Questions from a creator’s page', 'a day, per email, per creator'],
		signups_hour: ['Sign-ups', 'an hour, from one network'],
		auto_pause: ['Pause an account by itself', 'reports from different people, in 30 days'],
		ai_day: ['Daily AI share', 'Workers AI units a day']
	};
	async function saveLimits() {
		saving = true;
		const { error } = await supabase.rpc('admin_limits_set', { p: edits });
		saving = false;
		if (error) return toast(errMessage(error), true);
		toast('Limits saved');
		load();
	}
	const changed = $derived(!!d && d.limits.some((l: R) => edits[l.key] && (edits[l.key].new !== l.new || edits[l.key].trusted !== l.trusted)));

	// A limit for one account: pick it by searching, then the limit, the number and an end date.
	let oKey = $state('requests_day');
	let oQ = $state('');
	let oHits = $state<{ kind: 'creator' | 'workspace'; id: string; title: string; sub: string }[]>([]);
	let oPick = $state<{ kind: 'creator' | 'workspace'; id: string; title: string } | null>(null);
	let oValue = $state<number | null>(null);
	let oUntil = $state('');
	let oReason = $state('');
	let oBusy = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function findAccount() {
		clearTimeout(timer);
		const q = oQ.trim();
		if (q.length < 2) return (oHits = []);
		timer = setTimeout(async () => {
			const { data } = await supabase.rpc('admin_search', { p_q: q });
			const groups = (data as { kind: string; items: R[] }[]) ?? [];
			oHits = groups
				.filter((g) => g.kind === 'creator' || g.kind === 'workspace')
				.flatMap((g) => g.items.map((x) => ({ kind: g.kind as 'creator' | 'workspace', id: x.id, title: x.title, sub: x.sub })));
		}, 250);
	}
	const forWorkspaces = $derived(oKey === 'requests_day' || oKey === 'open_briefs');
	async function addOverride(e: SubmitEvent) {
		e.preventDefault();
		if (!oPick || oValue === null) return;
		oBusy = true;
		const { data, error } = await supabase.rpc('admin_override_set', {
			p_key: oKey, p_kind: oPick.kind, p_subject: oPick.id, p_value: oValue, p_until: oUntil ? new Date(oUntil + 'T23:59:59').toISOString() : null, p_reason: oReason
		});
		oBusy = false;
		if (error) return toast(errMessage(error), true);
		take(data as R);
		oPick = null;
		oQ = '';
		oHits = [];
		oValue = null;
		oUntil = '';
		oReason = '';
		toast('Limit set for that account');
	}
	async function removeOverride(o: R) {
		const reason = await askText({ title: `Remove the ${LIMIT[o.key]?.[0].toLowerCase()} limit for ${o.name}?`, body: 'They go back to the usual limit.', ok: 'Remove', input: { label: 'Note (optional)' } });
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_override_delete', { p_id: o.id, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		take(data as R);
		toast('Back to the usual limit');
	}
	const groups = $derived(d ? [...new Set(d.flags.map((f: R) => f.group as string))].map((g) => ({ g, flags: d!.flags.filter((f: R) => f.group === g) })) : []);
	const off = $derived(d ? d.flags.filter((f: R) => !f.on) : []);
</script>

<div class="ctl">
	<header>
		<div class="eb">System</div>
		<h1>Switches & limits</h1>
		<p class="muted lead">A switch turned off stops that feature for everyone within a minute or two. Each change asks why and goes in the <a href={href('audit')}>audit trail</a>.</p>
	</header>

	{#if err}<p class="err">{err}</p>{/if}
	{#if !d}
		<div class="ld"><span class="spinner"></span></div>
	{:else}
		{#if off.length}
			<div class="warnbar" role="status"><b>{off.length} switch{off.length === 1 ? ' is' : 'es are'} off:</b> {off.map((f: R) => f.label).join(', ')}</div>
		{/if}

		<div class="grid">
			{#each groups as g (g.g)}
				{@const n = g.flags.filter((f: R) => !f.on).length}
				<section class="card">
					<div class="card-h"><h2 class="card-t">{g.g}</h2><span class="tag {n ? 't-warn' : 't-ok'}">{n ? `${n} off` : 'All on'}</span></div>
					{#each g.flags as f (f.key)}
						<div class="flag">
							<div class="ft">
								<b>{f.label}</b>
								<span class="muted">{f.note}</span>
								{#if !f.on}<span class="why">Off since {ago(f.at)} by {f.by}{f.reason ? `: “${f.reason}”` : ''}</span>{/if}
							</div>
							<button class="sw" class:on={f.on} role="switch" aria-checked={f.on} aria-label={f.label} onclick={() => flip(f)}><span></span></button>
						</div>
					{/each}
				</section>
			{/each}
		</div>

		<div class="two">
			<section class="card tbl-wrap">
				<div class="card-h"><h2 class="card-t">Spam limits</h2><button class="btn sm pri" disabled={!changed || saving} onclick={saveLimits}>{saving ? 'Saving…' : 'Save limits'}</button></div>
				<table class="tbl">
					<thead><tr><th>Limit</th><th>New accounts</th><th>Trusted</th></tr></thead>
					<tbody>
						{#each d.limits as l (l.key)}
							<tr>
								<td class="wr"><span class="w5">{LIMIT[l.key]?.[0] ?? l.key}</span><small class="d">{LIMIT[l.key]?.[1] ?? ''}</small></td>
								<td><input class="inp num" type="number" min="0" aria-label="{LIMIT[l.key]?.[0] ?? l.key}, new accounts" bind:value={edits[l.key].new} /></td>
								<td>{#if l.trusted === null}<span class="muted">same</span>{:else}<input class="inp num" type="number" min="0" aria-label="{LIMIT[l.key]?.[0] ?? l.key}, trusted accounts" bind:value={edits[l.key].trusted} />{/if}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="card-b muted sm">“Trusted” brands have finished a collab or connected Instagram.</p>
			</section>

			<section class="card">
				<div class="card-h"><h2 class="card-t">AI shares</h2><span class="muted sm">Cloudflare Workers AI, free tier</span></div>
				<dl class="kv">
					<div><dt>Each creator</dt><dd>{num(d.ai.creator_day)} units a day, then {num(d.ai.creator_gemini)} Gemini calls</dd></div>
					<div><dt>Each brand workspace</dt><dd>{num(d.ai.brand_day)} units a day, then {num(d.ai.brand_gemini)} Gemini calls</dd></div>
					<div><dt>Used today</dt><dd>{num(d.ai.today_creators)} units by creators · {num(d.ai.today_brands)} by brands · {num(d.ai.today_gemini)} Gemini calls</dd></div>
				</dl>
				<p class="card-b muted sm">Lower one account's share below, or see each account's use in <a href={href('ai-usage')}>AI usage</a>.</p>
			</section>
		</div>

		<section class="card">
			<div class="card-h"><h2 class="card-t">Limits for one account</h2><span class="muted sm">Replaces the usual limit for that creator or workspace</span></div>
			<form class="of" onsubmit={addOverride}>
				<div class="f">
					<label for="o-key">Limit</label>
					<select id="o-key" class="inp" bind:value={oKey}>
						<option value="requests_day">Requests to new creators a day</option>
						<option value="open_briefs">Open briefs at once</option>
						<option value="messages_hour">Messages an hour</option>
						<option value="ai_day">Daily AI share (lower only)</option>
					</select>
				</div>
				<div class="f acct">
					<label for="o-q">{forWorkspaces ? 'Brand workspace' : 'Creator or brand workspace'}</label>
					{#if oPick}
						<div class="picked"><span class="tag {oPick.kind === 'creator' ? 't-ok' : 't-info'}">{oPick.kind === 'creator' ? 'Creator' : 'Workspace'}</span><b>{oPick.title}</b><button type="button" class="lnk" onclick={() => (oPick = null)}>Change</button></div>
					{:else}
						<input id="o-q" class="inp" placeholder="Search by name or email" bind:value={oQ} oninput={findAccount} autocomplete="off" />
						{#if oHits.length}
							<ul class="hits">
								{#each oHits.filter((h) => !forWorkspaces || h.kind === 'workspace') as h (h.kind + h.id)}
									<li><button type="button" onclick={() => ((oPick = h), (oHits = []))}><span class="tag {h.kind === 'creator' ? 't-ok' : 't-info'}">{h.kind === 'creator' ? 'Creator' : 'Workspace'}</span>{h.title}<small class="muted">{h.sub}</small></button></li>
								{/each}
							</ul>
						{/if}
					{/if}
				</div>
				<div class="f sm-f"><label for="o-v">New limit</label><input id="o-v" class="inp" type="number" min="0" bind:value={oValue} required /></div>
				<div class="f sm-f"><label for="o-u">Until (optional)</label><input id="o-u" class="inp" type="date" bind:value={oUntil} /></div>
				<div class="f grow"><label for="o-r">Why</label><input id="o-r" class="inp" bind:value={oReason} required placeholder="e.g. Festive season, asked by support #219" /></div>
				<button class="btn pri" disabled={oBusy || !oPick || oValue === null || !oReason.trim() || (forWorkspaces && oPick?.kind !== 'workspace')}>Set limit</button>
			</form>
			{#if !d.overrides.length}
				<div class="card-empty">Every account has the usual limits.</div>
			{:else}
				<div class="tbl-wrap">
					<table class="tbl">
						<thead><tr><th>Account</th><th>Limit</th><th class="r">Value</th><th>Until</th><th>Why</th><th>Set by</th><th></th></tr></thead>
						<tbody>
							{#each d.overrides as o (o.id)}
								<tr class:old={o.expired}>
									<td><a class="w5" href={o.kind === 'creator' ? href('creators', o.subject) : href('workspaces', o.subject)}>{o.name ?? o.subject}</a><small class="d">{o.kind === 'creator' ? 'Creator' : 'Workspace'}</small></td>
									<td>{LIMIT[o.key]?.[0] ?? o.key}</td>
									<td class="r mono">{num(o.value)}</td>
									<td>{o.until ? (o.expired ? 'Ended ' : '') + day(o.until) : 'No end'}</td>
									<td class="wr">{o.reason ?? '—'}</td>
									<td class="muted">{o.by} · {ago(o.at)}</td>
									<td class="r"><button class="btn sm" onclick={() => removeOverride(o)}>Remove</button></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</div>

<style>
	.ctl { display: flex; flex-direction: column; gap: 16px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.lead { margin-top: 4px; font-size: 13.5px; }
	.ld { padding: 60px; display: grid; place-items: center; }
	.warnbar { padding: 10px 14px; border-radius: 8px; background: var(--warn-bg); color: var(--warn); font-size: 13.5px; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; align-items: start; }
	.flag { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--line-soft); }
	.flag:first-of-type { border-top: 0; }
	.ft { flex: 1; min-width: 0; display: grid; gap: 1px; font-size: 13px; }
	.ft b { font-weight: 500; font-size: 13.5px; }
	.ft .muted { font-size: 12px; }
	.why { font-size: 12px; color: var(--warn); }
	.sw { position: relative; width: 38px; height: 22px; border-radius: 11px; border: 0; flex: none; background: var(--line-strong); }
	.sw.on { background: var(--ok); }
	.sw span { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
	.sw.on span { left: 19px; }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 16px; align-items: start; }
	.num { width: 84px; height: 30px; font-family: var(--f-mono); }
	.wr { white-space: normal; min-width: 160px; }
	.w5 { font-weight: 500; }
	.d { display: block; font-size: 12px; color: var(--ink-3); }
	.sm { font-size: 12px; }
	.of { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); }
	.of .f { flex: 0 1 auto; }
	.acct { position: relative; flex: 1 1 240px !important; }
	.sm-f { width: 140px; }
	.grow { flex: 1 1 220px !important; }
	.picked { display: flex; align-items: center; gap: 8px; height: 36px; font-size: 13px; }
	.hits { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; list-style: none; margin: 4px 0 0; padding: 4px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 8px; box-shadow: 0 10px 30px rgba(23, 19, 27, .12); max-height: 260px; overflow: auto; }
	.hits button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; border-radius: 6px; font-size: 13px; cursor: pointer; flex-wrap: wrap; }
	.hits button:hover, .hits button:focus-visible { background: var(--accent-soft); }
	.hits small { font-size: 12px; }
	tr.old td { opacity: .55; }
</style>
