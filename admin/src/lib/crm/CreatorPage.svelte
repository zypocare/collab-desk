<script lang="ts">
	import { ago, compact, day, inr, inr0, inrShort, label, num, siteOf, STAGE_LABEL, STAGE_TAG, STATUS_LABEL, STATUS_TAG } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { ask, askText, toast } from '../ui.svelte.ts';
	import Icon from '../Icon.svelte';
	import RecordHead from './RecordHead.svelte';
	import Notes from './Notes.svelte';
	import Timeline from './Timeline.svelte';

	let { id, onchange }: { id: string; onchange?: () => void } = $props();

	type R = Record<string, any>;
	let c = $state<R | null>(null);
	let err = $state('');
	let tab = $state('overview');
	let busy = $state(false);

	async function load() {
		const { data, error } = await supabase.rpc('admin_creator', { p_id: Number(id) });
		err = error ? errMessage(error) : '';
		if (!error) c = data as R;
	}
	$effect(() => {
		void id;
		c = null;
		tab = 'overview';
		load();
	});

	async function setStatus(to: 'active' | 'paused' | 'declined') {
		if (!c) return;
		const who = c.name || c.email;
		const q =
			to === 'active' && c.status === 'paused'
				? { title: `Bring back ${who}?`, body: 'Their page opens for brands again and the studio works as before.', ok: 'Bring back' }
				: to === 'active'
					? { title: `Approve ${who}?`, body: `${c.email} gets the welcome email with a link to their studio.`, ok: 'Approve' }
					: to === 'declined'
						? { title: `Decline ${who}?`, body: `${c.email} gets a kind email saying it isn't approved for now. They can ask again.`, ok: 'Decline', danger: true }
						: { title: `Pause ${who}?`, body: 'Their page stops taking requests. Their data stays; you can bring them back any time.', ok: 'Pause', danger: true };
		if (!(await ask(q))) return;
		busy = true;
		if (to === 'active' && c.status === 'declined') {
			const { error } = await supabase.rpc('admin_set_creator', { p_id: c.id, p_status: 'pending' });
			if (error) {
				busy = false;
				return toast(errMessage(error), true);
			}
		}
		const { error } = await supabase.rpc('admin_set_creator', { p_id: c.id, p_status: to });
		busy = false;
		if (error) return toast(errMessage(error), true);
		toast(to === 'active' ? (c.status === 'paused' ? `${who} is back on` : 'Approved, welcome email sent') : to === 'declined' ? 'Declined, they got a kind email' : `${who} is paused`);
		await load();
		onchange?.();
	}
	async function directory(on: boolean) {
		if (!c) return;
		const reason = await askText({
			title: on ? `List ${c.name || c.email} in the directory?` : `Take ${c.name || c.email} out of the directory?`,
			body: on ? 'Brands browsing the creator directory will see their page.' : 'Brands stop finding them in the directory. Their page still works.',
			ok: on ? 'List' : 'Take out',
			input: { label: 'Reason (for the audit trail)', placeholder: 'Optional' }
		});
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_creator_directory', { p_id: c.id, p_listed: on, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		c = data as R;
		toast(on ? 'Listed in the directory' : 'Out of the directory');
	}

	const KINDS = {
		account: { label: 'Account', color: '#1d6b45' },
		collab: { label: 'Collabs', color: '#5b34c4' },
		money: { label: 'Money', color: '#1c539f' },
		support: { label: 'Support', color: '#7a4f00' },
		safety: { label: 'Safety', color: '#a3241a' },
		admin: { label: 'Admin', color: '#6b6570' }
	};
	async function autopilot(key: string, name: string, on: boolean) {
		if (!c) return;
		const reason = await askText({
			title: `${on ? 'Turn on' : 'Turn off'} ${name} for ${c.name || c.email}?`,
			body: on ? 'It starts working on their account again.' : 'It stops on their account straight away. They can turn it back on in Settings.',
			ok: on ? 'Turn on' : 'Turn off',
			danger: !on,
			input: { label: 'Why (for the audit trail)', required: true }
		});
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_creator_autopilot', { p_id: c.id, p_key: key, p_on: on, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		c = data as R;
		toast(`${name} ${on ? 'on' : 'off'}`);
	}
	const AUTOS: [string, string][] = [
		['packages', 'Package replies'], ['counter', 'Counter-offers'], ['nudge', 'Follow-up nudges'], ['review', 'Review asks'], ['brief', 'Brief questions'],
		['invoice', 'Invoices on live'], ['dates', 'Date reminders'], ['track', 'Tracking links'], ['pitch', 'Pitch finder'], ['instant_booking', 'Instant booking'],
		['rebook', 'Rebook offers'], ['demand_pricing', 'Demand pricing']
	];
	const tabs = $derived(
		c
			? [
					{ id: 'overview', label: 'Overview' },
					{ id: 'collabs', label: 'Collabs', n: c.stats.collabs },
					{ id: 'brands', label: 'Brands', n: c.related.brands },
					{ id: 'money', label: 'Invoices', n: c.related.invoices },
					{ id: 'team', label: 'Team', n: c.team.length },
					{ id: 'auto', label: 'Autopilots', n: AUTOS.filter(([k]) => c!.autopilots[k]).length + ' on' },
					{ id: 'support', label: 'Support', n: c.support.length },
					{ id: 'notes', label: 'Notes & log', n: c.notes.length + c.audit.length }
				]
			: []
	);
	const color = $derived(c ? (STATUS_TAG[c.status] === 't-ok' ? '#1d6b45' : c.status === 'pending' ? '#7a4f00' : '#6b6570') : '#6b6570');
</script>

{#if err}
	<p class="err">{err}</p>
{:else if !c}
	<div class="ld"><span class="spinner"></span></div>
{:else}
	<RecordHead crumb={c.status === 'pending' ? { label: 'Sign-ups', href: href('signups') } : { label: 'Creators', href: href('creators') }} title={c.name || c.email} {color} bind:tab {tabs}>
		{#snippet tags()}
			<span class="tag {STATUS_TAG[c!.status] ?? 't-mute'}">{STATUS_LABEL[c!.status] ?? c!.status}</span>
			{#if c!.directory}<span class="tag t-acc">In directory</span>{/if}
			<span class="mono muted id">creator #{c!.id}</span>
		{/snippet}
		{#snippet sub()}
			{#if c!.slug}<a href={siteOf(c!.slug)} target="_blank" rel="noopener">{c!.slug}.miracleapp.live</a>{/if}
			<span>{c!.email}</span>
			{#if c!.niche || c!.city}<span>{[c!.niche, c!.city].filter(Boolean).join(' · ')}</span>{/if}
			{#if c!.instagram?.username}<span>@{c!.instagram.username} · {compact(c!.instagram.followers)}</span>{/if}
		{/snippet}
		{#snippet actions()}
			{#if c!.slug}<a class="btn" href={siteOf(c!.slug)} target="_blank" rel="noopener"><Icon name="external" />Open their page</a>{/if}
			{#if c!.status === 'pending' || c!.status === 'declined'}
				<button class="btn pri" disabled={busy} onclick={() => setStatus('active')}>Approve</button>
				{#if c!.status === 'pending'}<button class="btn warn" disabled={busy} onclick={() => setStatus('declined')}>Decline</button>{/if}
			{:else if c!.status === 'paused'}
				<button class="btn pri" disabled={busy} onclick={() => setStatus('active')}><Icon name="play" />Bring back</button>
			{:else if c!.status === 'active'}
				<button class="btn" onclick={() => directory(!c!.directory)}>{c!.directory ? 'Take out of directory' : 'List in directory'}</button>
				<button class="btn warn" disabled={busy} onclick={() => setStatus('paused')}><Icon name="pause" />Pause</button>
			{/if}
		{/snippet}
	</RecordHead>

	<div class="rec">
		<div class="main">
			{#if tab === 'overview'}
				<section class="stats">
					<div class="card st"><small>Collabs</small><b class="mono">{num(c.stats.collabs)}</b><span>{num(c.stats.open)} open now</span></div>
					<div class="card st"><small>Paid to them</small><b class="mono">{inr0(c.stats.paid)}</b><span>{inrShort(c.stats.paid_month)} this month</span></div>
					<div class="card st"><small>Waiting to be paid</small><b class="mono">{inr0(c.stats.waiting)}</b><span>sent, not paid in full</span></div>
					<div class="card st"><small>Average fee</small><b class="mono">{inr0(c.stats.avg_fee)}</b><span>across paid collabs</span></div>
				</section>
				{#if c.status === 'pending' && (c.note || c.signup)}
					<section class="card">
						<div class="card-h"><h2 class="card-t">Their request</h2><span class="muted sm">asked {ago(c.requested_at)}</span></div>
						<dl class="kv">
							{#if c.note}<div><dt>Note</dt><dd>{c.note}</dd></div>{/if}
							{#if c.signup?.followers}<div><dt>Followers</dt><dd>{c.signup.followers}</dd></div>{/if}
							{#if c.signup?.collabs}<div><dt>Collabs a year</dt><dd>{c.signup.collabs}</dd></div>{/if}
							{#if c.signup?.heard}<div><dt>Heard from</dt><dd>{c.signup.heard}</dd></div>{/if}
							{#if c.languages?.length}<div><dt>Languages</dt><dd>{c.languages.join(', ')}</dd></div>{/if}
						</dl>
					</section>
				{/if}
				<Timeline kinds={KINDS} events={c.timeline.map((e: R) => ({ ...e, href: e.collab ? href('collabs', e.collab) : null, text: e.kind === 'money' ? inr(Number(e.text)) : e.text }))} />
			{:else if tab === 'collabs'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Collabs</h2><span class="muted sm">latest 25</span></div>
					{#if !c.collabs.length}<div class="card-empty">No collabs yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Code</th><th>Brand</th><th>Stage</th><th class="r">Fee</th><th>Pay</th><th>Live date</th><th>Created</th></tr></thead>
							<tbody>{#each c.collabs as k (k.id)}<tr><td><a class="mono" href={href('collabs', k.id)}>{k.code}</a></td><td>{k.brand ?? '—'}</td><td><span class="tag {STAGE_TAG[k.stage] ?? 't-mute'}">{STAGE_LABEL[k.stage] ?? k.stage}</span></td><td class="r mono">{inrShort(k.fee)}</td><td>{label(k.pay)}</td><td>{day(k.live)}</td><td>{day(k.at)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'brands'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Brands in their studio</h2></div>
					{#if !c.brands.length}<div class="card-empty">No brands yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Brand</th><th>Category</th><th class="r">Collabs</th><th class="r">Paid</th><th class="r">Brand logins</th></tr></thead>
							<tbody>{#each c.brands as b (b.id)}<tr><td><a class="w5" href={href('brands', b.id)}>{b.name}</a></td><td>{b.category ?? '—'}</td><td class="r mono">{num(b.collabs)}</td><td class="r mono">{inrShort(b.paid)}</td><td class="r mono">{num(b.logins)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'money'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Invoices</h2><span class="muted sm">latest 25</span></div>
					{#if !c.invoices.length}<div class="card-empty">No invoices yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Invoice</th><th>Collab</th><th class="r">Total</th><th class="r">Received</th><th>Status</th><th>Due</th><th>Paid on</th></tr></thead>
							<tbody>{#each c.invoices as i (i.id)}<tr><td class="mono">{#if i.collab_id}<a href={href('collabs', i.collab_id)}>{i.number}</a>{:else}{i.number}{/if}</td><td class="mono">{i.collab ?? '—'}</td><td class="r mono">{inr(i.total)}</td><td class="r mono">{inr(i.received)}</td><td><span class="tag {i.status === 'paid' ? 't-ok' : i.status === 'partly_paid' ? 't-warn' : 't-mute'}">{label(i.status)}</span></td><td>{day(i.due)}</td><td>{day(i.paid_on)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'team'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Their team</h2></div>
					{#if !c.team.length}<div class="card-empty">Works alone.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Member</th><th>Role</th><th>Copied on emails</th><th>Last seen</th></tr></thead>
							<tbody>{#each c.team as t (t.email)}<tr><td><b class="w5">{t.name || t.email}</b><small class="d">{t.email}</small></td><td>{label(t.role)}</td><td>{t.copy_emails ? 'Yes' : 'No'}</td><td>{ago(t.last_seen)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'auto'}
				<section class="card">
					<div class="card-h"><h2 class="card-t">Autopilots</h2><span class="muted sm">Switching one here is the same as the creator flipping it in Settings, and is logged</span></div>
					<ul class="auto">
						{#each AUTOS as [k, name] (k)}
							<li>
								<button class="sw" class:on={c.autopilots[k]} role="switch" aria-checked={!!c.autopilots[k]} aria-label={name} onclick={() => autopilot(k, name, !c!.autopilots[k])}><span></span></button>
								<span>{name}{#if k === 'pitch' && c.autopilots.pitch_mode && c.autopilots[k]}<span class="muted"> · {c.autopilots.pitch_mode === 'auto' ? 'automatic' : 'asks first'}</span>{/if}</span>
							</li>
						{/each}
						<li>
							<button class="sw" class:on={c.autopilots.comment_dm && c.autopilots.comment_dm !== 'off'} role="switch" aria-checked={!!c.autopilots.comment_dm && c.autopilots.comment_dm !== 'off'} aria-label="Comment to DM replies"
								disabled={!c.autopilots.comment_dm || c.autopilots.comment_dm === 'off'} title="Only the creator can turn this on" onclick={() => autopilot('comment_dm', 'Comment → DM replies', false)}><span></span></button>
							<span>Comment → DM replies{#if c.autopilots.comment_dm && c.autopilots.comment_dm !== 'off'}<span class="muted"> · {c.autopilots.comment_dm === 'auto' ? 'automatic' : 'asks first'}</span>{/if}</span>
						</li>
						<li><span class="tag {c.autopilots.grow === 'auto' ? 't-ok' : 't-mute'}">{c.autopilots.grow === 'auto' ? 'Automatic' : 'Asks first'}</span><span>Growth mode</span></li>
					</ul>
				</section>
				<p class="muted sm">To stop one autopilot for everyone, use <a href={href('controls')}>Switches & limits</a>. To lower this creator's daily AI share, add a limit for them there.</p>
			{:else if tab === 'support'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Support tickets</h2><a href={href('support')}>Open support</a></div>
					{#if !c.support.length}<div class="card-empty">No tickets.</div>{:else}
						<table class="tbl">
							<thead><tr><th>#</th><th>Subject</th><th>Status</th><th>Updated</th></tr></thead>
							<tbody>{#each c.support as t (t.id)}<tr><td class="mono">#{t.number}</td><td>{t.subject}</td><td><span class="tag {t.status === 'solved' ? 't-ok' : t.status === 'open' ? 't-warn' : 't-info'}">{label(t.status)}</span></td><td>{ago(t.at)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'notes'}
				<Notes kind="creator" record={String(c.id)} notes={c.notes} audit={c.audit} onsaved={(x) => c && ((c.notes = x.notes), (c.audit = x.audit))} />
			{/if}
		</div>

		<aside class="side">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Details</h2></div>
				<dl class="kv">
					<div><dt>Status</dt><dd>{STATUS_LABEL[c.status] ?? c.status}{#if c.approved_at} since {day(c.approved_at)}{/if}</dd></div>
					<div><dt>Joined</dt><dd>{day(c.joined)}</dd></div>
					<div><dt>Last sign-in</dt><dd>{ago(c.last_sign_in)}</dd></div>
					{#if c.whatsapp}<div><dt>WhatsApp</dt><dd class="mono">{c.whatsapp}</dd></div>{/if}
					<div><dt>Taking requests</dt><dd>{c.accepting ? 'Yes' : 'No'}</dd></div>
					<div><dt>GST</dt><dd>{c.gst}</dd></div>
					<div><dt>Bank / UPI</dt><dd>{c.bank_set ? 'Set (hidden)' : 'Not set'}</dd></div>
					{#if c.rates && Object.keys(c.rates).length}<div><dt>Rates</dt><dd>{Object.entries(c.rates).map(([k, v]) => `${k} ${inrShort(Number(v))}`).join(' · ')}</dd></div>{/if}
					{#if c.instagram}<div><dt>Instagram</dt><dd>{c.instagram.connected ? 'Connected' : 'Disconnected'}{#if c.instagram.synced} · synced {ago(c.instagram.synced)}{/if}{#if c.instagram.error}<br /><span class="err">{c.instagram.error}</span>{/if}</dd></div>{/if}
				</dl>
			</section>
			<section class="card">
				<div class="card-h"><h2 class="card-t">Related</h2></div>
				<ul class="rel">
					<li><button class="lnk-row" onclick={() => (tab = 'collabs')}>Collabs<span class="mono">{num(c.stats.collabs)}</span></button></li>
					<li><button class="lnk-row" onclick={() => (tab = 'brands')}>Brands<span class="mono">{num(c.related.brands)}</span></button></li>
					<li><span class="row">Quotes<span class="mono">{num(c.related.quotes)}</span></span></li>
					<li><button class="lnk-row" onclick={() => (tab = 'money')}>Invoices<span class="mono">{num(c.related.invoices)}</span></button></li>
					<li><span class="row">Drafts<span class="mono">{num(c.related.drafts)}</span></span></li>
					<li><span class="row">Pitches<span class="mono">{num(c.related.pitches)}</span></span></li>
					<li><span class="row">Emails sent<span class="mono">{num(c.related.emails)}</span></span></li>
					<li><span class="row">AI calls (30 days)<span class="mono">{num(c.related.ai_30d)}</span></span></li>
					<li><span class="row">Page views (30 days)<span class="mono">{num(c.related.views_30d)}</span></span></li>
					<li><span class="row">Fans<span class="mono">{num(c.related.fans)}</span></span></li>
					<li><a class="row" href={href('safety')}>Safety reports<span class="mono">{num(c.related.reports)}</span></a></li>
				</ul>
			</section>
			{#if tab !== 'notes'}
				<section class="card">
					<div class="card-h"><h2 class="card-t">Latest note</h2><button class="lnk" onclick={() => (tab = 'notes')}>{c.notes.length ? 'All notes' : 'Add one'}</button></div>
					{#if c.notes[0]}<p class="card-b ln">{c.notes[0].body}<small class="muted d">{c.notes[0].admin} · {ago(c.notes[0].at)}</small></p>{:else}<div class="card-empty">No notes yet.</div>{/if}
				</section>
			{/if}
		</aside>
	</div>
{/if}

<style>
	.ld { padding: 60px; display: grid; place-items: center; }
	.id { font-size: 12px; }
	.rec { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-top: 20px; }
	.main { flex: 999 1 540px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.side { flex: 1 1 290px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
	.st { padding: 12px 14px; display: grid; gap: 2px; }
	.st small { color: var(--ink-3); font-size: 12px; }
	.st b { font-size: 20px; font-weight: 500; }
	.st span { color: var(--ink-3); font-size: 11.5px; }
	.sm { font-size: 12px; }
	.w5 { font-weight: 500; }
	.d { display: block; font-size: 12px; color: var(--ink-3); }
	.auto { list-style: none; margin: 0; padding: 6px 16px 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 16px; }
	.auto li { display: flex; align-items: center; gap: 10px; padding: 7px 0; font-size: 13px; border-bottom: 1px solid var(--line-soft); }
	.auto .tag { min-width: 44px; justify-content: center; }
	.sw { position: relative; width: 34px; height: 20px; border-radius: 10px; border: 0; flex: none; background: var(--line-strong); }
	.sw.on { background: var(--ok); }
	.sw:disabled { opacity: .5; cursor: not-allowed; }
	.sw span { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: left .15s; }
	.sw.on span { left: 17px; }
	.rel { list-style: none; margin: 0; padding: 0; }
	.rel li { border-top: 1px solid var(--line-soft); }
	.rel li:first-child { border-top: 0; }
	.lnk-row, .row { all: unset; box-sizing: border-box; display: flex; justify-content: space-between; width: 100%; padding: 8px 16px; font-size: 13px; color: var(--ink); cursor: default; }
	.lnk-row, a.row { cursor: pointer; }
	.lnk-row:hover, a.row:hover { background: var(--surface-2); text-decoration: none; color: var(--accent); }
	.lnk-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	.row .mono, .lnk-row .mono { color: var(--ink-3); }
	.ln { font-size: 13px; white-space: pre-wrap; display: grid; gap: 6px; }
</style>
