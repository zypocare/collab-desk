<script lang="ts">
	import { ago, day, label, num, when } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { ask, toast } from '../ui.svelte.ts';
	import RecordHead from './RecordHead.svelte';
	import Notes from './Notes.svelte';
	import { REASON } from './lists.ts';

	// One reported account: every report about it, what we know about them, and close / keep paused / unpause.
	let { id, onchange }: { id: string; onchange?: () => void } = $props();

	type R = Record<string, any>;
	let t = $state<R | null>(null);
	let err = $state('');
	let tab = $state('reports');
	let busy = $state(false);

	async function load() {
		const { data, error } = await supabase.rpc('admin_safety_target', { p_key: id });
		err = error ? errMessage(error) : '';
		if (!error) t = data as R;
	}
	$effect(() => {
		void id;
		t = null;
		tab = 'reports';
		load();
	});

	async function act(action: 'close' | 'keep' | 'unpause') {
		if (!t) return;
		const brand = t.kind === 'brand';
		const q =
			action === 'close'
				? { title: `Close ${t.name}?`, body: brand ? 'Their running requests are cancelled and every creator they wrote to is told. Their email and any UPI ID they sent can’t be used again. The people who reported hear back.' : 'Their page goes offline and their running collabs are cancelled; the brands are told. The people who reported hear back.', ok: 'Close the account', danger: true }
				: action === 'keep'
					? { title: `Keep ${t.name} paused?`, body: 'They get an email asking them to reply with anything we should know. The people who reported hear back.', ok: 'Keep paused and email' }
					: { title: `Unpause ${t.name}?`, body: 'They can send requests and messages again. The people who reported hear we didn’t find a reason to act.', ok: 'Not a problem, unpause' };
		if (!(await ask(q))) return;
		busy = true;
		const { error } = await supabase.rpc('admin_safety_act', { p_key: t.key, p_action: action });
		busy = false;
		if (error) return toast(errMessage(error), true);
		toast(action === 'close' ? `${t.name} is closed` : action === 'keep' ? 'Kept paused, email sent' : 'Unpaused');
		await load();
		onchange?.();
	}
	const open = $derived(!!t?.reports.some((r: R) => r.status === 'open'));
	const recordHref = $derived(t ? (t.record_kind === 'creator' ? href('creators', t.id) : t.record_kind === 'brand_login' ? href('brand-logins', t.id) : href('brands', t.id)) : '#');
	const STATE: Record<string, string> = { active: 't-ok', paused: 't-bad', closed: 't-mute', pending: 't-warn', no_login: 't-mute' };
</script>

{#if err}
	<p class="err">{err}</p>
{:else if !t}
	<div class="ld"><span class="spinner"></span></div>
{:else}
	<RecordHead
		crumb={{ label: 'Safety', href: href('safety') }}
		title={t.name}
		square={t.kind === 'brand'}
		color={t.kind === 'brand' ? '#c2416f' : '#1d6b45'}
		bind:tab
		tabs={[
			{ id: 'reports', label: 'Reports', n: t.reports.length },
			{ id: 'notes', label: 'Notes & log', n: t.notes.length + t.audit.length }
		]}
	>
		{#snippet tags()}
			<span class="tag {open ? 't-warn' : 't-ok'}">{open ? 'To look at' : 'Done'}</span>
			<span class="tag {STATE[t!.state] ?? 't-mute'}">Account {t!.state === 'no_login' ? 'has no login' : label(t!.state)}</span>
		{/snippet}
		{#snippet sub()}
			<span>{t!.kind === 'brand' ? 'Brand' : 'Creator'}</span>
			{#if t!.about?.email}<span>{t!.about.email}</span>{/if}
			{#if t!.about?.joined}<span>Joined {day(t!.about.joined)}</span>{/if}
			<a href={recordHref}>Open their {t!.record_kind === 'creator' ? 'creator' : t!.record_kind === 'brand_login' ? 'login' : 'brand'} page</a>
		{/snippet}
		{#snippet actions()}
			{#if t!.state !== 'closed' && t!.state !== 'no_login'}
				<button class="btn bad" disabled={busy} onclick={() => act('close')}>Close the account</button>
				<button class="btn" disabled={busy} onclick={() => act('keep')}>Keep paused and email them</button>
				<button class="btn" disabled={busy} onclick={() => act('unpause')}>Not a problem, unpause</button>
			{:else if open && t!.state === 'no_login'}
				<button class="btn" disabled={busy} onclick={() => act('keep')}>Mark the reports done</button>
			{/if}
		{/snippet}
	</RecordHead>

	<div class="rec">
		<div class="main">
			{#if tab === 'reports'}
				<section class="card">
					{#each t.reports as r (r.id)}
						<div class="rp" class:done={r.status !== 'open'}>
							<div class="rh"><b>{REASON[r.reason] ?? label(r.reason)}</b>
								<span class="tag {r.status === 'open' ? 't-warn' : 't-mute'}">{r.status === 'open' ? 'Open' : label(r.outcome || 'done')}</span>
								{#if r.auto_paused}<span class="tag t-bad">Paused the account</span>{/if}
								<span class="muted sm">{when(r.at)}</span></div>
							<p>{r.details ? `“${r.details}”` : 'No details added.'}</p>
							<small class="muted">By {r.by || 'someone'} ({r.by_side}){r.by_email ? ' · ' + r.by_email : ''}{#if r.collab_id} · <a href={href('collabs', r.collab_id)}>about this collab</a>{/if}</small>
						</div>
					{/each}
				</section>
				<p class="muted sm">{t.kind === 'brand' ? 'Closing tells the creators they wrote to, and stops the email and UPI ID from being used again.' : 'Closing takes their page offline and tells the brands.'} The people who reported hear back either way.</p>
			{:else}
				<Notes kind={t.record_kind} record={t.id} notes={t.notes} audit={t.audit} onsaved={(x) => t && ((t.notes = x.notes), (t.audit = x.audit))} />
			{/if}
		</div>
		<aside class="side">
			<section class="card">
				<div class="card-h"><h2 class="card-t">What we know</h2></div>
				<dl class="kv">
					{#if t.about?.email}<div><dt>Email</dt><dd>{t.about.email}</dd></div>{/if}
					{#if t.about?.joined}<div><dt>Joined</dt><dd>{ago(t.about.joined)}</dd></div>{/if}
					{#if t.about?.instagram !== undefined}<div><dt>Instagram</dt><dd>{t.about.instagram ? 'Connected' : 'Not connected'}</dd></div>{/if}
					{#if t.about?.requests_2d !== undefined}<div><dt>Requests (2 days)</dt><dd>{num(t.about.requests_2d)}</dd></div>{/if}
					{#if t.about?.collabs !== undefined}<div><dt>Collabs</dt><dd>{num(t.about.collabs)}</dd></div>{/if}
					{#if t.about?.creator}<div><dt>Added by</dt><dd><a href={href('creators', t.about.creator_id)}>{t.about.creator}</a> (no brand login)</dd></div>{/if}
					<div><dt>Blocked by</dt><dd>{num(t.blocked_by)}</dd></div>
				</dl>
			</section>
		</aside>
	</div>
{/if}

<style>
	.ld { padding: 60px; display: grid; place-items: center; }
	.rec { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-top: 20px; }
	.main { flex: 999 1 540px; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
	.side { flex: 1 1 290px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.sm { font-size: 12px; }
	.rp { padding: 12px 16px; border-top: 1px solid var(--line-soft); display: grid; gap: 5px; font-size: 13.5px; }
	.rp:first-child { border-top: 0; }
	.rp.done { opacity: .7; }
	.rh { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	.rh b { font-weight: 600; }
	.rp p { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
