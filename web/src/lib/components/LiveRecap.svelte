<script lang="ts">
	import type { Collab } from '../types';
	import type { Invoice } from '../invoice';
	import { balanceDue } from '../invoice';
	import { money } from '../currency';
	import { studio } from '../studio.svelte';
	import { compact, diff, fmt, latestDraft, mediaLabel, noPost, plural, waShare } from '../util';
	import Icon from './Icon.svelte';

	// A collab that's live (or wrapped), read at a glance: the results first (what its posts did, against her usual),
	// then the journey as a ticket of tear-off stubs, what she made, and the money as an invoice ticket. Editing stays
	// one tap away: each part opens its own section of the page (onopen).
	let { c, onopen, onpay, oninvoice }: { c: Collab; onopen: (id: string) => void; onpay: (inv: Invoice) => void; oninvoice: () => void } = $props();

	// ---- Results ----
	const posts = $derived([...c.posts].map((p) => p.media).sort((a, b) => b.posted_at.localeCompare(a.posted_at)));
	const views = (m: (typeof posts)[number]) => m.views ?? m.reach ?? 0;
	const totalViews = $derived(posts.reduce((a, m) => a + views(m), 0));
	const totalReach = $derived(posts.reduce((a, m) => a + (m.reach ?? 0), 0));
	// Against her usual: her best Reel here over her average views (only said when it's at least as good).
	const usual = $derived.by(() => {
		const avg = Number(studio.ig?.avg_views) || 0;
		const reels = posts.filter((m) => m.product_type === 'REELS');
		if (!avg || !reels.length) return '';
		const x = Math.max(...reels.map(views)) / avg;
		return x >= 1 ? `${x >= 10 ? Math.round(x) : x.toFixed(1)}× your usual Reel` : '';
	});
	const strip = (m: (typeof posts)[number]) =>
		[
			['reach', m.reach],
			['likes', m.likes],
			['comments', m.comments],
			['saves', m.saves],
			['shares', m.shares]
		].filter(([, v]) => typeof v === 'number' && (v as number) > 0) as [string, number][];
	const disclosed = (m: (typeof posts)[number]) => /#(ad|collab|sponsored|paidpartnership|partner)\b/i.test(m.caption ?? '');
	const HUES = [['var(--g2)', 'var(--g1)'], ['var(--g3)', 'var(--g2)'], ['var(--g1)', 'var(--h-live)']];

	// The 7-day report, as one line.
	const report = $derived(c.reports?.[0] ?? null);
	const reportDay = $derived.by(() => {
		const from = c.live_date ?? posts[posts.length - 1]?.posted_at?.slice(0, 10);
		if (!from) return '';
		const d = new Date(from.slice(0, 10) + 'T00:00:00');
		d.setDate(d.getDate() + 7);
		return fmt(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
	});

	// ---- The journey: a stub per step that has a date ----
	type Stub = { label: string; date: string; done: boolean; note?: string; late?: boolean };
	const stubs = $derived.by((): Stub[] => {
		const out: Stub[] = [];
		const shot = c.shot_at?.slice(0, 10) ?? c.shoot_date;
		if (shot) out.push({ label: 'Shot', date: shot, done: !!c.shot_at || c.stage === 'live' || c.stage === 'wrapped' });
		const dr = latestDraft(c);
		const ok = dr?.status === 'approved' ? (dr.responded_at ?? dr.submitted_at)?.slice(0, 10) : c.draft_date;
		if (ok) out.push({ label: 'Draft OK', date: ok, done: dr?.status === 'approved' || c.stage === 'live' || c.stage === 'wrapped' });
		const live = c.live_date ?? posts[posts.length - 1]?.posted_at?.slice(0, 10);
		if (live) out.push({ label: noPost(c) ? 'Delivered' : 'Live', date: live, done: c.stage === 'live' || c.stage === 'wrapped' });
		if (c.type === 'barter') {
			const got = c.product_received_at?.slice(0, 10);
			out.push(got ? { label: c.barter_kind === 'experience' ? 'Done' : 'Product', date: got, done: true } : { label: c.barter_kind === 'experience' ? 'Experience' : 'Product', date: '', done: false, note: 'not in yet' });
		} else if (c.pay_status === 'paid' && c.paid_on) out.push({ label: 'Paid', date: c.paid_on, done: true });
		else if (c.pay_due) {
			const n = diff(c.pay_due);
			out.push({ label: 'Paid', date: c.pay_due, done: false, note: n < 0 ? `${-n} day${n === -1 ? '' : 's'} late` : n === 0 ? 'due today' : `in ${n} day${n === 1 ? '' : 's'}`, late: n < 0 });
		} else out.push({ label: 'Paid', date: '', done: false, note: 'no invoice yet' });
		return out;
	});
	const dayOf = (iso: string) => (iso ? String(Number(iso.slice(8, 10))) : '–');
	const monOf = (iso: string) => (iso ? new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' }).toUpperCase() : '');
	// The notches sit on each perforation: one mask hole at the top and the bottom of every join.
	const notchMask = $derived(
		stubs
			.slice(1)
			.flatMap((_, i) => {
				const x = (((i + 1) / stubs.length) * 100).toFixed(3);
				return [`radial-gradient(circle 7px at ${x}% 0, #0000 97%, #000)`, `radial-gradient(circle 7px at ${x}% 100%, #0000 97%, #000)`];
			})
			.join(', ')
	);

	// ---- Money: the open invoice as a ticket ----
	const live = $derived((c.invoices ?? []).filter((i) => i.status !== 'cancelled' && i.status !== 'draft'));
	const inv = $derived(live.find((i) => i.status === 'sent' || i.status === 'partly_paid') ?? live[0] ?? null);
	const cancelled = $derived((c.invoices ?? []).filter((i) => i.status === 'cancelled').length);
	const others = $derived(live.length - (inv ? 1 : 0));
	const invLeft = $derived(inv ? balanceDue(inv) : 0);
	const invState = $derived.by(() => {
		if (!inv) return null;
		if (inv.status === 'paid' || invLeft <= 0) return { t: `Paid ${fmt(inv.paid_on ?? inv.issue_date)}`, k: 'ok' };
		if (inv.due_date && diff(inv.due_date) < 0) return { t: `${-diff(inv.due_date)} days late`, k: 'bad' };
		return { t: inv.status === 'partly_paid' ? 'Part paid' : 'Sent · waiting', k: 'info' };
	});
	const first = $derived(c.contact_name ? c.contact_name.split(' ')[0] : '');
	const waText = $derived(
		inv
			? `Hi${first ? ' ' + first : ''}, here's invoice ${inv.number} for ${money(invLeft, inv.currency)}${inv.due_date ? `, due ${fmt(inv.due_date)}` : ''}. You can pay by UPI or bank transfer here: ${location.origin}/invoice/${inv.public_token}`
			: ''
	);
</script>

<div class="lr">
	<!-- Results first -->
	{#if posts.length}
		<section class="lr-res" aria-label="Results">
			<span class="lr-eb">It's live · results</span>
			<div class="lr-big"><b>{compact(totalViews)}</b><span>views across {posts.length} post{posts.length === 1 ? '' : 's'}</span></div>
			{#if usual || totalReach}
				<div class="lr-chips">
					{#if usual}<span class="lr-chip ok"><Icon name="arrow" />{usual}</span>{/if}
					{#if totalReach}<span class="lr-chip warm">{compact(totalReach)} people reached</span>{/if}
				</div>
			{/if}
			<div class="lr-posts">
				{#each posts as m, i (m.id)}
					<a class="lr-post" href={m.permalink} target="_blank" rel="noopener" aria-label="{mediaLabel(m.media_type, m.product_type)} from {fmt(m.posted_at.slice(0, 10))} on Instagram: {compact(views(m))} views">
						<span class="lr-poster" style="--a:{HUES[i % 3][0]};--b:{HUES[i % 3][1]}">
							{#if m.thumbnail_url}<img src={m.thumbnail_url} alt="" referrerpolicy="no-referrer" loading="lazy" />{/if}
							<span class="lr-pt"><em>{#if m.product_type === 'REELS'}<Icon name="film" />{/if}{mediaLabel(m.media_type, m.product_type)} · {fmt(m.posted_at.slice(0, 10))}</em><i><Icon name="share" /></i></span>
							<span class="lr-pv"><b>{compact(views(m))}</b><small>views</small></span>
						</span>
						{#if strip(m).length || disclosed(m)}
							<span class="lr-strip">
								{#each strip(m) as [k, v] (k)}<span><b>{compact(v)}</b><small>{k}</small></span>{/each}
								{#if disclosed(m)}<span><b class="ok">#ad ✓</b><small>disclosed</small></span>{/if}
							</span>
						{/if}
					</a>
				{/each}
			</div>
			<button class="lr-row lr-report" onclick={() => onopen('sec-posts')}>
				<span class="lr-ri"><Icon name="chart" /></span>
				<span class="lr-rt"><b>Results report for {c.brand.name}</b><small>{report?.status === 'sent' ? `Sent ${fmt(report.sent_at?.slice(0, 10))}` : report?.status === 'ready' ? 'Ready: send it to the brand' : reportDay ? `Goes to the brand on ${reportDay} · or send it now` : 'Made 7 days after it goes live'}</small></span>
				<Icon name="chevR" />
			</button>
		</section>
	{:else}
		<button class="lr-row lr-nopost" onclick={() => onopen('sec-posts')}>
			<span class="lr-ri"><Icon name="link" /></span>
			<span class="lr-rt"><b>Link the post to see its results</b><small>Views, reach and the brand's report come from it</small></span>
			<Icon name="chevR" />
		</button>
	{/if}

	<!-- The journey: one ticket of tear-off stubs -->
	<section class="lr-sec" aria-label="The journey">
		<div class="lr-h"><span class="lr-eb">The journey</span><button class="lr-lnk" onclick={() => onopen('sec-dates')}>Dates</button></div>
		<div class="lr-stubs" style="-webkit-mask:{notchMask};mask:{notchMask}">
			{#each stubs as st (st.label)}
				<div class="lr-stub" class:open={!st.done} class:late={st.late}>
					<em>{st.label}</em>
					<b>{dayOf(st.date)}</b>
					<small>{monOf(st.date)}</small>
					{#if st.done}<span class="lr-stamp" aria-label="done"><Icon name="check" /></span>{:else if st.note}<span class="lr-due">{st.note}</span>{/if}
				</div>
			{/each}
		</div>
	</section>

	<!-- What she made: done pieces as ticks -->
	{#if c.deliverables.length}
		<section class="lr-sec" aria-label="What you made">
			<div class="lr-h"><span class="lr-eb">What you made</span><button class="lr-lnk" onclick={() => onopen('sec-deliv')}>Edit pieces</button></div>
			<div class="lr-pills">
				{#each c.deliverables as d (d.id)}
					<span class="lr-pill" class:todo={!d.done}><Icon name={d.done ? 'check' : 'clock'} />{d.qty} {plural(d.kind, d.qty)} · {d.done ? (noPost(c) ? 'delivered' : 'published') : 'to do'}</span>
				{/each}
			</div>
		</section>
	{/if}

	<!-- The money: the invoice as a ticket -->
	{#if c.type !== 'barter'}
		<section class="lr-sec" aria-label="The money">
			<div class="lr-h"><span class="lr-eb">The money</span>{#if others > 0}<button class="lr-lnk" onclick={() => onopen('sec-pay')}>{others} more</button>{/if}</div>
			{#if inv && invState}
				<div class="lr-inv">
					<div class="lr-it">
						<span class="lr-in"><b>{inv.number}</b><small>{inv.due_date ? `Due ${fmt(inv.due_date)}` : 'No due date'}{inv.reminders_sent?.length ? ` · ${inv.reminders_sent.length} reminder${inv.reminders_sent.length === 1 ? '' : 's'} sent` : ''}</small></span>
						<span class="lr-ia"><b>{money(invState.k === 'ok' ? inv.total : invLeft, inv.currency)}</b><em class={invState.k}>{invState.t}</em></span>
					</div>
					<i class="lr-cut" aria-hidden="true"></i>
					<div class="lr-acts">
						{#if invState.k !== 'ok'}<a class="lr-act wa" href={waShare(c.contact_phone, waText)} target="_blank" rel="noopener">WhatsApp</a>{/if}
						<a class="lr-act" href="/invoice/{inv.public_token}" target="_blank" rel="noopener">View PDF</a>
						{#if invState.k !== 'ok'}<button class="lr-act pri" onclick={() => onpay(inv)}>Paid?</button>{/if}
					</div>
				</div>
			{:else}
				<div class="lr-inv lr-none">
					<span class="lr-rt"><b>No invoice yet</b><small>Made from the agreed quote in a minute</small></span>
					<button class="lr-act pri" onclick={oninvoice}>Make invoice</button>
				</div>
			{/if}
			{#if cancelled}<button class="lr-muted" onclick={() => onopen('sec-pay')}>{cancelled} cancelled invoice{cancelled === 1 ? '' : 's'} · show</button>{/if}
		</section>
	{/if}
</div>

<style>
	.lr { display: flex; flex-direction: column; gap: 22px; margin: 4px 0 18px; }
	.lr-eb { font-size: 10.5px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	.lr-h { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
	.lr-lnk, .lr-muted { padding: 0; border: 0; background: none; font: inherit; font-size: 13px; font-weight: 600; color: var(--accent); cursor: pointer; }
	.lr-muted { align-self: flex-start; margin-top: 8px; font-weight: 500; color: var(--ink-3); }
	.lr-sec { display: flex; flex-direction: column; }

	/* Results */
	.lr-res { display: flex; flex-direction: column; gap: 8px; }
	.lr-big { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 10px; }
	.lr-big b { font: 400 56px/1 var(--f-serif, Georgia, serif); letter-spacing: -.01em; }
	.lr-big span { font-size: 15px; color: var(--ink-2); }
	.lr-chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.lr-chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
	.lr-chip :global(.ic) { width: 13px; height: 13px; transform: rotate(-45deg); }
	.lr-chip.ok { background: color-mix(in oklab, var(--ok) 15%, transparent); color: var(--ok); }
	.lr-chip.warm { background: color-mix(in oklab, var(--g3) 15%, transparent); color: var(--g3); }
	.lr-posts { display: flex; gap: 12px; margin: 6px -16px 0; padding: 0 16px 4px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
	.lr-posts::-webkit-scrollbar { display: none; }
	.lr-post { flex: none; width: 236px; display: flex; flex-direction: column; border-radius: 22px; overflow: hidden; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); color: var(--ink); text-decoration: none; scroll-snap-align: start; }
	.lr-posts .lr-post:only-child { width: 100%; }
	.lr-poster { position: relative; height: 150px; display: flex; flex-direction: column; justify-content: space-between; padding: 12px 14px; color: #fff; overflow: hidden; isolation: isolate;
		background: radial-gradient(120% 90% at 20% 10%, var(--a), transparent 60%), radial-gradient(120% 100% at 100% 100%, var(--b), transparent 60%), #2A1C30; }
	.lr-poster img { position: absolute; inset: 0; z-index: -1; width: 100%; height: 100%; object-fit: cover; opacity: .55; }
	.lr-poster::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(15, 11, 18, .25), rgba(15, 11, 18, .7)); }
	.lr-pt { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	.lr-pt em { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 999px; background: rgba(15, 11, 18, .55); font-style: normal; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
	.lr-pt em :global(.ic) { width: 12px; height: 12px; }
	.lr-pt i { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: rgba(15, 11, 18, .55); }
	.lr-pt i :global(.ic) { width: 14px; height: 14px; }
	.lr-pv b { display: block; font: 400 44px/1 var(--f-serif, Georgia, serif); }
	.lr-pv small { font-size: 12.5px; font-weight: 600; opacity: .85; }
	.lr-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 8px; padding: 12px 14px 14px; }
	.lr-strip span { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
	.lr-strip b { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
	.lr-strip b.ok { color: var(--ok); }
	.lr-strip small { font-size: 11px; color: var(--ink-3); }

	/* A quiet row (the report, or "link the post") */
	.lr-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; border: 0; border-radius: 18px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); font: inherit; color: var(--ink); text-align: left; cursor: pointer; }
	.lr-report { margin-top: 6px; }
	.lr-ri { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 50%; background: color-mix(in oklab, var(--g1) 16%, transparent); color: color-mix(in oklab, var(--g1) 70%, var(--ink)); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g1) 32%, transparent);}
	.lr-ri :global(.ic) { width: 16px; height: 16px; }
	.lr-rt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.lr-rt b { font-size: 14.5px; font-weight: 700; }
	.lr-rt small { font-size: 12.5px; color: var(--ink-3); }
	.lr-row > :global(.ic:last-child) { width: 18px; height: 18px; color: var(--ink-3); }

	/* The journey: tear-off stubs; the notches are cut by the mask set inline, one pair on each perforation. */
	.lr-stubs { position: relative; display: flex; border-radius: 18px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line-strong); -webkit-mask-composite: source-in; mask-composite: intersect; }
	.lr-stub { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px 4px 16px; }
	.lr-stub + .lr-stub::before { content: ''; position: absolute; left: -1px; top: 14px; bottom: 14px; border-left: 2px dotted var(--line-strong); }
	.lr-stub em { font-style: normal; font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3); white-space: nowrap; }
	.lr-stub b { margin-top: 4px; font: 400 36px/1 var(--f-serif, Georgia, serif); }
	.lr-stub small { min-height: 13px; font-size: 10.5px; font-weight: 700; letter-spacing: .12em; color: var(--ink-2); }
	.lr-stamp { margin-top: 8px; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; border: 1.5px solid var(--ok); color: var(--ok); transform: rotate(-12deg); }
	.lr-stamp :global(.ic) { width: 13px; height: 13px; }
	.lr-stub.open { background: linear-gradient(180deg, color-mix(in oklab, var(--g3) 16%, transparent), color-mix(in oklab, var(--g2) 8%, transparent)); }
	.lr-stub.open:last-child { border-radius: 0 18px 18px 0; }
	.lr-stub.open::after { content: ''; position: absolute; left: 14px; right: 14px; top: 0; height: 2px; border-radius: 2px; background: linear-gradient(90deg, var(--g3), var(--g2)); }
	.lr-stub.open em, .lr-stub.open small, .lr-stub.open b { color: var(--g3); }
	.lr-due { margin-top: 8px; height: 22px; display: inline-flex; align-items: center; padding: 0 8px; border-radius: 999px; background: color-mix(in oklab, var(--g3) 18%, transparent); color: var(--g3); font-size: 10.5px; font-weight: 800; white-space: nowrap; }
	.lr-stub.late em, .lr-stub.late small, .lr-stub.late b { color: var(--bad); }
	.lr-stub.late .lr-due { background: color-mix(in oklab, var(--bad) 16%, transparent); color: var(--bad); }
	.lr-stub.late::after { background: var(--bad); }

	/* What she made */
	.lr-pills { display: flex; flex-wrap: wrap; gap: 8px; }
	.lr-pill { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 999px; background: color-mix(in oklab, var(--ok) 12%, transparent); color: var(--ok); font-size: 13px; font-weight: 700; }
	.lr-pill.todo { background: color-mix(in oklab, var(--g3) 14%, transparent); color: var(--g3); }
	.lr-pill :global(.ic) { width: 14px; height: 14px; }

	/* The money: an invoice ticket */
	.lr-inv { display: flex; flex-direction: column; border-radius: 18px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line-strong); }
	.lr-it { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 16px 16px 14px; }
	.lr-in { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.lr-in b { font-size: 12.5px; font-weight: 800; letter-spacing: .08em; }
	.lr-in small { font-size: 12.5px; color: var(--ink-2); }
	.lr-ia { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
	.lr-ia b { font: 400 30px/1 var(--f-serif, Georgia, serif); }
	.lr-ia em { height: 22px; display: inline-flex; align-items: center; padding: 0 9px; border-radius: 999px; font-style: normal; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
	.lr-ia em.info { background: color-mix(in oklab, var(--h-request) 16%, transparent); color: var(--h-request); }
	.lr-ia em.ok { background: color-mix(in oklab, var(--ok) 16%, transparent); color: var(--ok); }
	.lr-ia em.bad { background: color-mix(in oklab, var(--bad) 16%, transparent); color: var(--bad); }
	.lr-cut { display: block; height: 0; margin: 0 16px; border-top: 2px dashed var(--line-strong); }
	.lr-acts { display: flex; gap: 8px; padding: 12px 16px 14px; }
	.lr-act { flex: 1; height: 42px; display: flex; align-items: center; justify-content: center; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 12px; background: transparent; font: inherit; font-size: 13.5px; font-weight: 700; color: var(--ink); text-decoration: none; cursor: pointer; }
	.lr-act.wa { border-color: transparent; background: #25D366; color: #0F0B12; }
	.lr-act.pri { border-color: transparent; background: var(--ink); color: var(--bg); }
	.lr-none { flex-direction: row; align-items: center; gap: 12px; padding: 14px 16px; }
	.lr-none .lr-act { flex: none; }
</style>
