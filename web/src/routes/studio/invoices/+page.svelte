<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';
	import { countUp, ui } from '#lib/ui.svelte.ts';
	import { balanceDue, type Invoice } from '#lib/invoice.ts';
	import { money } from '#lib/currency.ts';
	import { fyOf } from '#lib/reports.ts';
	import { delivText, diff, fmt, inrS, today, todayIso, waShare } from '#lib/util.ts';
	import type { Collab } from '#lib/types.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import PaymentDialog from '#lib/components/PaymentDialog.svelte';

	// Every invoice she has made, one ticket each, with where it stands: late, waiting to be paid, part paid, paid,
	// a draft not sent yet, or cancelled. Payments tracks money per collab; this is the invoices themselves.
	type St = 'late' | 'unpaid' | 'part' | 'paid' | 'draft' | 'cancelled';
	type Row = { inv: Invoice; c: Collab; st: St; left: number };
	const stateOf = (inv: Invoice): St => {
		if (inv.status === 'cancelled') return 'cancelled';
		if (inv.status === 'draft') return 'draft';
		if (inv.status === 'paid' || balanceDue(inv) <= 0) return 'paid';
		if (inv.due_date && inv.due_date < todayIso()) return 'late';
		return inv.status === 'partly_paid' ? 'part' : 'unpaid';
	};
	const all = $derived<Row[]>(studio.collabs.flatMap((c) => (c.invoices ?? []).map((inv) => ({ inv, c, st: stateOf(inv), left: balanceDue(inv) }))));

	let filter = $state<'all' | 'open' | 'late' | 'paid' | 'draft' | 'cancelled'>('all');
	let q = $state('');
	const inFilter = (r: Row, f: typeof filter) =>
		f === 'all' ? true : f === 'open' ? r.st === 'unpaid' || r.st === 'part' || r.st === 'late' : f === 'paid' ? r.st === 'paid' : r.st === f;
	const hay = (r: Row) => `${r.c.brand.name} ${r.inv.number ?? ''} ${r.c.code} ${r.inv.bill_to?.name ?? ''}`.toLowerCase();
	// Late first, then what's waiting by due date, drafts, then paid (newest first), cancelled last.
	const RANK: Record<St, number> = { late: 0, part: 1, unpaid: 1, draft: 2, paid: 3, cancelled: 4 };
	const list = $derived(
		all
			.filter((r) => inFilter(r, filter) && (!q.trim() || hay(r).includes(q.trim().toLowerCase())))
			.sort((a, b) =>
				RANK[a.st] - RANK[b.st] ||
				(a.st === 'paid' || a.st === 'cancelled'
					? (b.inv.paid_on ?? b.inv.issue_date).localeCompare(a.inv.paid_on ?? a.inv.issue_date)
					: (a.inv.due_date ?? '9999').localeCompare(b.inv.due_date ?? '9999'))
			)
	);
	const counts = $derived(Object.fromEntries((['all', 'open', 'late', 'paid', 'draft', 'cancelled'] as const).map((f) => [f, all.filter((r) => inFilter(r, f)).length])) as Record<typeof filter, number>);

	// The card on top: what's still to be paid on her invoices, how much of it is late, and what came in this year.
	const fy = fyOf(today());
	const sum = (rs: Row[], f: (r: Row) => number) => rs.reduce((a, r) => a + f(r), 0);
	const open = $derived(all.filter((r) => r.st === 'unpaid' || r.st === 'part' || r.st === 'late'));
	const openSum = $derived(sum(open, (r) => r.left));
	const lateSum = $derived(sum(all.filter((r) => r.st === 'late'), (r) => r.left));
	const paidYear = $derived(sum(all.filter((r) => r.inv.amount_received > 0 && (r.inv.paid_on ?? r.inv.issue_date) >= fy.from && (r.inv.paid_on ?? r.inv.issue_date) <= fy.to), (r) => r.inv.amount_received));
	const nLate = $derived(counts.late);
	const nextDue = $derived(all.filter((r) => (r.st === 'unpaid' || r.st === 'part') && r.inv.due_date).sort((a, b) => a.inv.due_date!.localeCompare(b.inv.due_date!))[0]);

	let fan = $state(false);
	let paying = $state<Invoice | null>(null);
	const pick = (f: typeof filter) => ((filter = filter === f ? 'all' : f), (fan = false));
	const HUE: Record<St, string> = { late: 'var(--bad)', unpaid: 'var(--warn, #e0a23a)', part: 'var(--warn, #e0a23a)', paid: 'var(--ok)', draft: 'var(--ink-3)', cancelled: 'var(--ink-3)' };
	const FILTERS = [['all', 'All', 'var(--accent)'], ['open', 'Unpaid', HUE.unpaid], ['late', 'Late', HUE.late], ['paid', 'Paid', HUE.paid], ['draft', 'Drafts', HUE.draft], ['cancelled', 'Cancelled', HUE.cancelled]] as const;

	const late = (d: string) => -diff(d);
	const statusLine = (r: Row) => {
		const { inv } = r;
		switch (r.st) {
			case 'late': return `${late(inv.due_date!)} day${late(inv.due_date!) === 1 ? '' : 's'} late`;
			case 'part': return `Part paid · ${money(r.left, inv.currency)} left`;
			case 'unpaid': return inv.due_date ? (diff(inv.due_date) === 0 ? 'Due today' : `Due ${fmt(inv.due_date)}`) : 'Sent · no due date';
			case 'paid': return `Paid ${fmt(inv.paid_on ?? inv.issue_date)}${inv.tds_deducted > 0 ? ` · TDS ${money(inv.tds_deducted, inv.currency)}` : ''}`;
			case 'draft': return 'Draft · not sent yet';
			case 'cancelled': return 'Cancelled';
		}
	};
	const TONE: Record<St, 'ok' | 'warn' | 'calm' | 'hot'> = { late: 'hot', unpaid: 'warn', part: 'warn', paid: 'ok', draft: 'calm', cancelled: 'calm' };
	const what = (r: Row) => (r.inv.items?.length ? r.inv.items.map((x) => x.description).filter(Boolean).join(', ') : '') || delivText(r.c.deliverables) || 'Collab';
	const first = (c: Collab) => (c.contact_name ? c.contact_name.split(' ')[0] : '');
	const waText = (r: Row) =>
		`Hi${first(r.c) ? ' ' + first(r.c) : ''}, ${r.st === 'late' ? `a reminder: invoice ${r.inv.number} for ${money(r.left, r.inv.currency)} was due on ${fmt(r.inv.due_date)}` : `here's invoice ${r.inv.number} for ${money(r.left, r.inv.currency)}${r.inv.due_date ? `, due ${fmt(r.inv.due_date)}` : ''}`}. You can pay by UPI or bank transfer here: ${location.origin}/invoice/${r.inv.public_token}`;
</script>

<svelte:head><title>Invoices · {studio.settings?.app_name}</title></svelte:head>

{#if paying}<PaymentDialog inv={paying} onclose={() => (paying = null)} />{/if}

<header class="ph rv">
	<div>
		<div class="eb">Money</div>
		<h1>Invoices</h1>
		<p>Every invoice you've made, and where it stands: sent, paid, late or cancelled.</p>
	</div>
</header>

<section class="hero-card glow m-hero m-pipe" aria-label="Invoices still to be paid">
	<div class="mesh" aria-hidden="true"></div>
	<div class="hc-in">
		<div class="hc-top">
			<span class="hc-eb">Unpaid invoices</span>
			{#if nLate}<button class="glass-chip" onclick={() => pick('late')}><Icon name="alert" />{nLate} late</button>{/if}
		</div>
		<div class="hc-val" use:countUp={{ value: openSum, money: true }}>{inrS(openSum)}</div>
		<div class="hc-sub">{open.length ? `${open.length} invoice${open.length === 1 ? '' : 's'} waiting${nextDue ? ` · next due ${fmt(nextDue.inv.due_date)}, ${nextDue.c.brand.name}` : ''}` : all.length ? 'Every invoice is paid' : 'No invoices yet'}</div>
		<div class="hc-foot">
			<button class:on={filter === 'open'} onclick={() => pick('open')}><small><span class="dt" style="--hue:{HUE.unpaid}"></span>Unpaid</small><b>{inrS(openSum - lateSum)}</b></button>
			<button class:on={filter === 'late'} onclick={() => pick('late')}><small><span class="dt" style="--hue:{HUE.late}"></span>Late</small><b>{inrS(lateSum)}</b></button>
			<button class:on={filter === 'paid'} onclick={() => pick('paid')}><small><span class="dt" style="--hue:{HUE.paid}"></span>Paid this year</small><b>{inrS(paidYear)}</b></button>
		</div>
	</div>
</section>

<label class="search m-search iv-search"><Icon name="search" /><span class="sr">Search invoices</span><input type="search" placeholder="Search brand or invoice number" bind:value={q} autocomplete="off" /></label>
<div class="m-stages" role="tablist" aria-label="Filter invoices">
	{#each FILTERS as [k, label, hue] (k)}
		{#if k === 'all' || counts[k]}
			<button role="tab" aria-selected={filter === k} class:on={filter === k} onclick={() => ((filter = k), (fan = false))}><i class="dt" style="--hue:{hue}"></i>{label}<span>{counts[k]}</span></button>
		{/if}
	{/each}
</div>

<div class="tks m-plist">
	{#each fan ? list : list.slice(0, 6) as r, i (r.inv.id)}
		<Ticket
			name={r.c.brand.name}
			sub={`${r.inv.number ?? 'Draft'} · ${fmt(r.inv.issue_date)}`}
			money={money(r.st === 'paid' || r.st === 'draft' || r.st === 'cancelled' ? r.inv.total : r.left, r.inv.currency)}
			moneySub={r.st === 'paid' ? 'paid' : r.st === 'draft' ? 'draft' : r.st === 'cancelled' ? 'cancelled' : r.st === 'late' ? 'late' : 'to pay'}
			task={what(r)}
			status={statusLine(r)}
			tone={TONE[r.st]}
			onopen={() => (ui.openCollab = r.c.id)}
			{i}
		>
			{#if r.st === 'late'}
				<a class="btn" href="/studio/payments/late/{r.inv.id}">Next steps</a>
				<button class="btn primary" onclick={() => (paying = r.inv)} aria-label="Record a payment for {r.inv.number}">Paid?</button>
			{:else if r.st === 'unpaid' || r.st === 'part'}
				<a class="btn wa" href={waShare(r.c.contact_phone, waText(r))} target="_blank" rel="noopener" aria-label="Send {r.c.brand.name} invoice {r.inv.number} on WhatsApp">WhatsApp</a>
				<button class="btn primary" onclick={() => (paying = r.inv)} aria-label="Record a payment for {r.inv.number}">Paid?</button>
			{:else if r.st === 'draft'}
				<button class="btn primary" onclick={() => (ui.openCollab = r.c.id)}>Finish it</button>
			{:else if r.st === 'paid'}
				<a class="btn" href="/invoice/{r.inv.public_token}" target="_blank" rel="noopener">View</a>
			{:else}
				<button class="btn" onclick={() => (ui.openCollab = r.c.id)}>Open</button>
			{/if}
		</Ticket>
	{:else}
		<div class="clear hero-card glow m-none">
			<div class="mesh" aria-hidden="true"></div>
			<span class="clear-ic"><Icon name="doc" /></span>
			<b>{q.trim() ? 'No invoice matches' : filter === 'late' ? 'Nothing late' : filter === 'paid' ? 'Nothing paid yet' : filter === 'draft' ? 'No drafts' : all.length ? 'Nothing here' : 'No invoices yet'}</b>
			<small>{q.trim() ? 'Try a brand name or an invoice number.' : all.length ? 'Pick another filter to see the rest.' : 'Make one from a collab once its content is live: it is filled in from the agreed quote.'}</small>
		</div>
	{/each}
	{#if !fan && list.length > 6}<span class="cr-edge tk-edge" aria-hidden="true"></span>{/if}
</div>
{#if list.length > 6}<button class="cr-more" onclick={() => (fan = !fan)}>{fan ? 'Show less' : `+${list.length - 6} more`}</button>{/if}

<style>
	.iv-search { margin-top: 14px; }
</style>
