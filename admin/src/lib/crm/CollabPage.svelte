<script lang="ts">
	import { ago, day, inr, inrShort, label, num, siteOf, STAGE_LABEL, STAGE_TAG, when } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';
	import Icon from '../Icon.svelte';
	import RecordHead from './RecordHead.svelte';
	import Notes from './Notes.svelte';
	import Timeline from './Timeline.svelte';

	let { id }: { id: string } = $props();

	type R = Record<string, any>;
	let c = $state<R | null>(null);
	let err = $state('');
	let tab = $state('overview');
	let msgs = $state<R[] | null>(null);
	let busy = $state(false);

	async function load() {
		const { data, error } = await supabase.rpc('admin_collab', { p_id: id });
		err = error ? errMessage(error) : '';
		if (!error) c = data as R;
	}
	$effect(() => {
		void id;
		c = null;
		msgs = null;
		tab = 'overview';
		load();
	});

	// Messages are private to the creator and the brand: reading them asks why, and the reason is logged.
	async function readMessages() {
		if (!c) return;
		const reason = await askText({
			title: 'Read the messages in this collab?',
			body: 'They are private between the creator and the brand. Your name and reason go in the audit trail.',
			ok: 'Read messages',
			input: { label: 'Why do you need to read them?', placeholder: 'e.g. Safety report #61 about this brand', required: true }
		});
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_collab_messages', { p_id: id, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		msgs = data as R[];
		tab = 'messages';
		load();
	}
	async function lifecycle(action: 'pause' | 'cancel' | 'resume') {
		if (!c) return;
		const q =
			action === 'pause'
				? { title: `Pause ${c.code}?`, body: 'Work stops: scheduled posts go on hold and emails about it stop. Both sides see it paused, with your reason after “Miracle:”. Invoices and payments stay.', ok: 'Pause', danger: true }
				: action === 'cancel'
					? { title: `Cancel ${c.code}?`, body: 'The collab ends: scheduled posts are cancelled and emails about it stop. Both sides see it cancelled, with your reason after “Miracle:”. Invoices and payments stay.', ok: 'Cancel collab', danger: true }
					: { title: `Resume ${c.code}?`, body: `It goes back to ${STAGE_LABEL[c.resume_stage ?? 'request']}. Held posts need scheduling again.`, ok: 'Resume' };
		const reason = await askText({ ...q, input: { label: 'Why (both sides see this for a pause or cancel)', required: true } });
		if (reason === null) return;
		busy = true;
		const { data, error } = await supabase.rpc('admin_collab_lifecycle', { p_id: id, p_action: action, p_reason: reason });
		busy = false;
		if (error) return toast(errMessage(error), true);
		c = data as R;
		toast(action === 'resume' ? 'Resumed' : action === 'pause' ? 'Paused' : 'Cancelled');
	}
	async function reminders(inv: R, on: boolean) {
		const reason = await askText({
			title: on ? `Turn reminders on for ${inv.number}?` : `Stop reminders for ${inv.number}?`,
			body: on ? 'The brand gets polite payment reminders again.' : 'The brand stops getting payment reminder emails for this invoice.',
			ok: on ? 'Turn on' : 'Stop reminders',
			input: { label: 'Reason (for the audit trail)' }
		});
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_invoice_reminders', { p_id: inv.id, p_on: on, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		c = data as R;
		toast(on ? 'Reminders on' : 'Reminders off');
	}
	async function cancelPost(p: R) {
		const reason = await askText({ title: 'Cancel this post?', body: "It won't be published. The creator sees it cancelled by Miracle, with your reason.", ok: 'Cancel post', danger: true, input: { label: 'Why', required: true } });
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_post_cancel', { p_id: p.id, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		c = data as R;
		toast('Post cancelled');
	}

	const FLOW = ['request', 'negotiating', 'confirmed', 'creating', 'live', 'wrapped'];
	const at = $derived(c ? FLOW.indexOf(c.stage === 'paused' || c.stage === 'cancelled' ? (c.resume_stage ?? 'request') : c.stage) : -1);
	const KINDS = {
		creator: { label: 'Creator', color: '#1d6b45' },
		brand: { label: 'Brand', color: '#c2416f' },
		system: { label: 'Miracle', color: '#5b34c4' },
		email: { label: 'Emails', color: '#1c539f' },
		admin: { label: 'Admin', color: '#6b6570' }
	};
	const TAG: Record<string, string> = { paid: 't-ok', partly_paid: 't-warn', sent: 't-info', accepted: 't-ok', changes: 't-warn', declined: 't-bad', pending: 't-warn', approved: 't-ok', scheduled: 't-info', published: 't-ok', failed: 't-bad', on_hold: 't-warn', cancelled: 't-mute', matched: 't-ok', unmatched: 't-warn' };
	const title = $derived(c ? `${c.brand?.name ?? 'No brand'} × ${c.creator.name || c.creator.email}` : '');
</script>

{#if err}
	<p class="err">{err}</p>
{:else if !c}
	<div class="ld"><span class="spinner"></span></div>
{:else}
	<RecordHead
		crumb={{ label: 'Collabs', href: href('collabs') }}
		{title}
		square
		color="#5b34c4"
		bind:tab
		tabs={[
			{ id: 'overview', label: 'Overview' },
			{ id: 'timeline', label: 'Timeline', n: c.timeline.length },
			{ id: 'messages', label: 'Messages', n: c.messages.n },
			{ id: 'notes', label: 'Notes & log', n: c.notes.length + c.audit.length }
		]}
	>
		{#snippet tags()}
			<span class="tag {STAGE_TAG[c!.stage] ?? 't-mute'}">{STAGE_LABEL[c!.stage] ?? c!.stage}</span>
			<span class="tag {c!.pay === 'paid' ? 't-ok' : 't-mute'}">Pay: {label(c!.pay)}</span>
		{/snippet}
		{#snippet sub()}
			<span class="mono">{c!.code}</span>
			<span>{label(c!.type)} · came from {label(c!.source)}</span>
			<span>{inr(c!.fee)}</span>
			<span>Started {day(c!.created_at)}</span>
		{/snippet}
		{#snippet actions()}
			<button class="btn" onclick={readMessages} disabled={!c!.messages.n}><Icon name="mail" />Read messages</button>
			{#if c!.stage === 'paused' || c!.stage === 'cancelled'}
				<button class="btn pri" disabled={busy} onclick={() => lifecycle('resume')}><Icon name="play" />Resume</button>
			{:else if !['wrapped', 'declined'].includes(c!.stage)}
				<button class="btn warn" disabled={busy} onclick={() => lifecycle('pause')}><Icon name="pause" />Pause</button>
				<button class="btn warn" disabled={busy} onclick={() => lifecycle('cancel')}>Cancel collab</button>
			{/if}
		{/snippet}
	</RecordHead>

	<ol class="flow" aria-label="Stage">
		{#each FLOW as s, i (s)}
			<li class:done={i < at} class:now={i === at}><span></span>{STAGE_LABEL[s]}</li>
		{/each}
	</ol>
	{#if c.lifecycle_reason}
		<div class="held"><b>{c.stage === 'paused' ? 'Paused' : 'Cancelled'} {ago(c.paused_at ?? c.cancelled_at)}</b> {c.lifecycle_reason}{#if c.resume_on} · review on {day(c.resume_on)}{/if}</div>
	{/if}

	<div class="rec">
		<div class="main">
			{#if tab === 'overview'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Quotes</h2></div>
					{#if !c.quotes.length}<div class="card-empty">No quote yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Version</th><th class="r">Total</th><th>Status</th><th>Advance</th><th>Sent</th><th>Answered</th><th>Accepted by</th></tr></thead>
							<tbody>{#each c.quotes as q (q.id)}<tr><td class="mono">v{q.version}</td><td class="r mono">{inr(q.total)}</td><td><span class="tag {TAG[q.status] ?? 't-mute'}">{label(q.status)}</span></td><td>{q.advance_pct ? q.advance_pct + '%' : '—'}</td><td>{ago(q.sent_at)}</td><td>{ago(q.responded_at)}</td><td>{q.accepted_by ?? '—'}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>

				<section class="card">
					<div class="card-h"><h2 class="card-t">Invoices & payments</h2><span class="muted sm">Brands pay creators directly; Miracle takes no cut</span></div>
					{#if !c.invoices.length}<div class="card-empty">No invoice yet.</div>{/if}
					{#each c.invoices as inv (inv.id)}
						<div class="inv">
							<div class="inv-top">
								<span class="mono w5">{inv.number}</span><span class="muted">{label(inv.kind)}</span>
								<span class="tag {TAG[inv.status] ?? 't-mute'}">{label(inv.status)}</span>
								<span class="mono">{inr(inv.total)}</span><span class="muted">received {inr(inv.received)}{inv.tds ? ` + TDS ${inr(inv.tds)}` : ''}</span>
								<span class="muted">due {day(inv.due)}</span>
								<span class="sp"></span>
								{#if inv.status === 'sent' || inv.status === 'partly_paid'}
									<button class="btn sm" onclick={() => reminders(inv, !inv.auto_remind)}>{inv.auto_remind ? 'Stop reminders' : 'Turn reminders on'}</button>
								{/if}
							</div>
							<div class="inv-sub muted">
								<span>Reminders {inv.auto_remind ? 'on' : 'off'} · {num(inv.reminders_sent)} sent</span>
								{#if inv.paid_on}<span>Paid {day(inv.paid_on)}</span>{/if}
								{#if inv.claim_at}<span>Brand said paid {ago(inv.claim_at)}</span>{/if}
								{#each inv.alerts as a (a.id)}<span>Bank alert {inr(a.amount)} {ago(a.at)} · <span class="tag {TAG[a.status] ?? 't-mute'}">{label(a.status)}</span></span>{/each}
								{#each inv.demands as d, i (i)}<span>{label(d.kind)} notice (step {d.step}) by {d.via} {ago(d.sent_at)}</span>{/each}
							</div>
						</div>
					{/each}
				</section>

				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Deliverables</h2><span class="muted sm">{c.deliverables.filter((d: R) => d.done).length} of {c.deliverables.length} done</span></div>
					{#if !c.deliverables.length}<div class="card-empty">No deliverables set.</div>{:else}
						<table class="tbl"><tbody>{#each c.deliverables as d, i (i)}<tr><td class="w5">{d.qty} × {label(d.kind)}</td><td><span class="tag {d.done ? 't-ok' : 't-mute'}">{d.done ? 'Done' : 'Open'}</span></td><td class="muted">{d.items.map((x: R) => `${label(x.status)}${x.due ? ' ' + day(x.due) : ''}`).join(' · ')}</td></tr>{/each}</tbody></table>
					{/if}
				</section>

				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Drafts & posts</h2></div>
					{#if !c.drafts.length && !c.posts.length}<div class="card-empty">No drafts or scheduled posts.</div>{:else}
						<table class="tbl">
							<tbody>
								{#each c.drafts as d (d.id)}<tr><td>Draft round {d.round}</td><td><span class="tag {TAG[d.status] ?? 't-mute'}">{label(d.status)}</span></td><td class="muted">sent {ago(d.submitted_at)}{d.responded_at ? ' · answered ' + ago(d.responded_at) : ''}</td><td class="muted">{num(d.comments)} comments</td><td></td></tr>{/each}
								{#each c.posts as p (p.id)}
									<tr><td>Post {when(p.publish_at)}</td><td><span class="tag {TAG[p.status] ?? 't-mute'}">{label(p.status)}</span></td><td class="muted wr">{p.error ?? ''}{#if p.permalink}<a href={p.permalink} target="_blank" rel="noopener">Open post</a>{/if}</td><td></td>
										<td class="r">{#if ['scheduled', 'on_hold', 'failed'].includes(p.status)}<button class="btn sm warn" onclick={() => cancelPost(p)}>Cancel</button>{/if}</td></tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'timeline'}
				<Timeline kinds={KINDS} events={c.timeline} />
			{:else if tab === 'messages'}
				<section class="card">
					<div class="card-h"><h2 class="card-t">Messages</h2><span class="muted sm">{num(c.messages.creator)} from the creator · {num(c.messages.brand)} from the brand · last {ago(c.messages.last)}</span></div>
					{#if msgs === null}
						<div class="card-empty lock">
							<p>Messages are private between the creator and the brand. Reading them asks why, and puts your name and reason in the audit trail.</p>
							<button class="btn" onclick={readMessages} disabled={!c.messages.n}><Icon name="mail" />Read messages</button>
						</div>
					{:else if !msgs.length}
						<div class="card-empty">No messages.</div>
					{:else}
						<ol class="msgs">
							{#each msgs as m (m.id)}
								<li class:brand={m.sender === 'brand'}>
									<div class="mh"><b>{m.sender === 'brand' ? 'Brand' : 'Creator'}</b> <span class="muted">{m.author ?? ''}{m.auto ? ' · sent by autopilot' : ''} · {when(m.at)}</span></div>
									<p>{m.body}</p>
									{#if m.files}<small class="muted">{m.files} attachment{m.files === 1 ? '' : 's'}</small>{/if}
								</li>
							{/each}
						</ol>
					{/if}
				</section>
			{:else if tab === 'notes'}
				<Notes kind="collab" record={c.id} notes={c.notes} audit={c.audit} onsaved={(x) => c && ((c.notes = x.notes), (c.audit = x.audit))} />
			{/if}
		</div>

		<aside class="side">
			<section class="card">
				<div class="card-h"><h2 class="card-t">People</h2></div>
				<ul class="ppl">
					<li><small>Creator</small><a href={href('creators', c.creator.id)}>{c.creator.name || c.creator.email}</a>{#if c.creator.slug}<a class="muted" href={siteOf(c.creator.slug)} target="_blank" rel="noopener">{c.creator.slug}.miracleapp.live</a>{/if}</li>
					{#if c.brand}<li><small>Brand (company)</small><a href={href('brands', c.brand.id)}>{c.brand.name}</a><span class="muted">{c.brand.category ?? ''}</span></li>{/if}
					{#each c.logins as l (l.id)}<li><small>Brand login</small><a href={href('brand-logins', l.id)}>{l.email}</a><a class="muted" href={href('workspaces', l.workspace)}>{l.workspace_name}</a></li>{/each}
					{#if c.contact_email}<li><small>Brand contact</small><span>{c.contact_name || '—'}</span><span class="muted">{c.contact_email}</span></li>{/if}
				</ul>
			</section>
			<section class="card">
				<div class="card-h"><h2 class="card-t">Deal</h2></div>
				<dl class="kv">
					<div><dt>Fee</dt><dd>{inr(c.fee)}{c.counter_fee ? ` (counter ${inr(c.counter_fee)}, ${label(c.counter_status) || '—'})` : ''}</dd></div>
					{#if c.product}<div><dt>Product</dt><dd>{c.product}{c.product_value ? ` · worth ${inr(c.product_value)}` : ''}</dd></div>{/if}
					{#if c.usage}<div><dt>Usage</dt><dd>{c.usage}{c.usage_ends ? ` · until ${day(c.usage_ends)}` : ''}</dd></div>{/if}
					{#if c.exclusivity}<div><dt>Exclusivity</dt><dd>{c.exclusivity}</dd></div>{/if}
					{#if c.territory}<div><dt>Territory</dt><dd>{c.territory}</dd></div>{/if}
					<div><dt>Draft due</dt><dd>{day(c.draft_date)}</dd></div>
					<div><dt>Live date</dt><dd>{day(c.live_date)}{c.live_time ? ' ' + c.live_time : ''}</dd></div>
					<div><dt>Pay due</dt><dd>{day(c.pay_due)}</dd></div>
					{#if c.ad_code}<div><dt>Ad code</dt><dd class="mono">set</dd></div>{/if}
					{#if c.ship_tracking}<div><dt>Shipping</dt><dd>sent {ago(c.shipped_at)}{c.product_received_at ? ' · received ' + ago(c.product_received_at) : ''}</dd></div>{/if}
					<div><dt>Files</dt><dd>{num(c.files)}</dd></div>
				</dl>
			</section>
			{#if c.links.length}
				<section class="card">
					<div class="card-h"><h2 class="card-t">Tracked links</h2></div>
					<dl class="kv">{#each c.links as l (l.slug)}<div><dt class="mono">{l.slug}</dt><dd>{num(l.clicks)} clicks · {num(l.sales)} sales · {inrShort(l.revenue)}</dd></div>{/each}</dl>
				</section>
			{/if}
			{#if c.reports.length}
				<section class="card">
					<div class="card-h"><h2 class="card-t">Safety reports</h2><a href={href('safety')}>Safety</a></div>
					<dl class="kv">{#each c.reports as r (r.id)}<div><dt>{r.by}</dt><dd>{label(r.reason)} · <span class="tag {r.status === 'open' ? 't-bad' : 't-mute'}">{label(r.status)}</span></dd></div>{/each}</dl>
				</section>
			{/if}
			{#if c.brief}
				<section class="card"><div class="card-h"><h2 class="card-t">Brief</h2></div><p class="card-b brief">{c.brief}</p></section>
			{/if}
		</aside>
	</div>
{/if}

<style>
	.ld { padding: 60px; display: grid; place-items: center; }
	.flow { list-style: none; margin: 18px 0 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
	.flow li { display: grid; gap: 6px; font-size: 12.5px; color: var(--ink-3); }
	.flow li span { height: 6px; border-radius: 3px; background: var(--line); }
	.flow li.done { color: var(--ink-2); }
	.flow li.done span { background: #b6a5ea; }
	.flow li.now { color: var(--ink); font-weight: 600; }
	.flow li.now span { background: var(--accent); }
	.held { margin-top: 12px; padding: 10px 14px; border-radius: 8px; background: var(--warn-bg); color: var(--warn); font-size: 13px; }
	.rec { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-top: 18px; }
	.main { flex: 999 1 540px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.side { flex: 1 1 290px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.sm { font-size: 12px; }
	.w5 { font-weight: 500; }
	.wr { white-space: normal; min-width: 160px; }
	.inv { padding: 12px 16px; border-top: 1px solid var(--line-soft); display: grid; gap: 6px; }
	.inv:first-of-type { border-top: 0; }
	.inv-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 13px; }
	.inv-sub { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; }
	.sp { flex: 1; }
	.lock { display: grid; gap: 12px; justify-items: start; }
	.msgs { list-style: none; margin: 0; padding: 8px 16px 14px; display: grid; gap: 10px; max-height: 640px; overflow: auto; }
	.msgs li { padding: 10px 12px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line-soft); max-width: 86%; }
	.msgs li.brand { justify-self: end; background: #fbf0f4; }
	.mh { font-size: 12px; margin-bottom: 4px; }
	.msgs p { font-size: 13.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
	.ppl { list-style: none; margin: 0; padding: 0; }
	.ppl li { display: grid; gap: 1px; padding: 9px 16px; border-top: 1px solid var(--line-soft); font-size: 13px; }
	.ppl li:first-child { border-top: 0; }
	.ppl small { font-size: 11.5px; color: var(--ink-3); }
	.ppl a.muted { color: var(--ink-3); font-size: 12px; }
	.brief { font-size: 13px; white-space: pre-wrap; }
	@media (max-width: 640px) { .flow { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 10px; } }
</style>
