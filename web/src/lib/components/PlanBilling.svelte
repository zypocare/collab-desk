<script lang="ts">
	import { onMount } from 'svelte';
	import { ask } from '../confirm.svelte';
	import { buy, canSell, loadPlan, plan, stopRenewal, type PlanInfo, type PlanState } from '../plan.svelte';
	import { toast } from '../ui.svelte';
	import { errMessage, inr } from '../util';
	import Icon from './Icon.svelte';

	// Plan & billing: what this account is on, what the free plan has left this month, and (on the website
	// and web app only) the plans to buy through Razorpay, monthly or yearly.
	let { side }: { side: 'creator' | 'brand' } = $props();
	let period = $state<'month' | 'year'>('year');
	let busy = $state('');
	onMount(() => {
		loadPlan().catch((e) => toast(errMessage(e), 'alert'));
	});
	const p = $derived(plan.data);
	const sell = canSell();
	const paid = $derived(p ? p.catalog.filter((x) => x.rank > 1) : []);

	const PERKS: Record<string, string[]> = {
		creator_pro: [
			'Every autopilot: invoices, dates, tracking links, nudges and counters',
			'Pitch autopilot: new brands found and pitched for you',
			'Unlimited quotes, invoices and pitches',
			'Payment reminders and bank-credit matching',
			'A live insights page to send brands',
			'Your team: manager, assistant, accountant',
			'6× the daily AI'
		],
		brand_pro: [
			'Unlimited requests and campaigns',
			'Open briefs that creators apply to',
			'Brand autopilots and competitor watch',
			'Sales tracking from your store',
			'Turnaround owners, targets and escalation',
			'A team of 5 with approvals',
			'3× the daily AI'
		],
		agency: [
			'Pro for every creator you manage',
			'Pro for your own brand team',
			'Switch between client workspaces',
			'Roster, commission ledger and pitch decks',
			'15 seats'
		]
	};
	const FREE: Record<string, string> = {
		quotes_month: 'quotes this month',
		invoices_month: 'invoices this month',
		pitches_month: 'pitches this month',
		requests_month: 'requests this month',
		campaigns_month: 'campaigns this month',
		ai_day: 'AI used today',
		seats: 'seats'
	};
	const day = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
	function status(s: PlanState) {
		if (!s.plan || s.rank === 1) return 'Free plan';
		if (s.via_agency) return `Covered by an Agency plan until ${day(s.ends_at)}`;
		if (s.period === 'trial') return `Free trial: ${s.days_left} day${s.days_left === 1 ? '' : 's'} left`;
		if (s.period === 'comp') return `On us until ${day(s.ends_at)}`;
		if (s.status === 'halted') return 'Renewal failed: update your payment in the Razorpay email';
		return s.cancel_at_end ? `Ends ${day(s.ends_at)} (renewal stopped)` : `Renews ${day(s.ends_at)} · ${s.period === 'year' ? 'yearly' : 'monthly'}`;
	}
	const price = (x: PlanInfo) => (period === 'year' ? (p?.offer.on && x.founding_year ? x.founding_year : x.price_year) : x.price_month);
	const founding = (x: PlanInfo) => period === 'year' && !!p?.offer.on && !!x.founding_year;
	const isPaid = (s: PlanState) => s.period === 'month' || s.period === 'year';
	const current = (x: PlanInfo) => p?.plan === x.code && isPaid(p) && !p.cancel_at_end;

	async function choose(x: PlanInfo) {
		busy = x.code;
		try {
			if (await buy(x.code, period, x.side === 'agency')) toast(`You're on ${x.name}. Thank you!`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	async function stop(agency: boolean) {
		const s = agency ? p?.agency : p;
		if (!s || !(await ask({ title: 'Stop renewing?', body: `${s.name} stays on until ${day(s.ends_at)}, then the free plan applies. Nothing you made is deleted.`, ok: 'Stop renewing', danger: true }))) return;
		busy = 'stop';
		try {
			await stopRenewal(agency);
			toast('Renewal stopped', 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
</script>

{#if !p}
	<div class="loader" style="min-height:20vh"><span class="ring"><span></span></span></div>
{:else}
	<section class="panel rv pb-now" class:pro={(p.rank ?? 1) > 1}>
		<div class="panel-h"><h2>Your plan</h2><small>{side === 'creator' ? 'this studio' : 'this brand team'}</small></div>
		<div class="pb-cur">
			<span class="pb-badge"><Icon name={(p.rank ?? 1) > 1 ? 'spark' : 'layers'} /></span>
			<div>
				<b>{p.name ?? 'Free'}</b>
				<small>{status(p)}</small>
			</div>
			{#if sell && p.can_buy && isPaid(p) && !p.cancel_at_end && !p.via_agency}<button class="btn sm ghost" onclick={() => stop(false)} disabled={!!busy}>Stop renewing</button>{/if}
		</div>
		{#if (p.rank ?? 1) === 1 || p.period === 'trial'}
			<div class="pb-use">
				{#each Object.entries(p.limits ?? {}) as [k, cap] (k)}
					{#if FREE[k] && (p.rank ?? 1) === 1 && !(k === 'seats' && cap <= 1)}
						{@const used = p.usage[k] ?? 0}
						<div class="pb-meter" class:full={used >= cap}>
							<span><b class="num">{k === 'ai_day' ? Math.round((used / cap) * 100) + '%' : `${used} of ${cap}`}</b> {FREE[k]}</span>
							<i style="--w:{Math.min(100, (used / Math.max(1, cap)) * 100)}%"></i>
						</div>
					{/if}
				{/each}
				{#if p.period === 'trial'}<p class="hint">Everything is on during your trial. After it, the free plan's limits apply and the autopilots switch off, unless you pick a plan.</p>{/if}
			</div>
		{/if}
		{#if p.agency?.plan}
			<div class="pb-cur pb-ag">
				<span class="pb-badge"><Icon name="users" /></span>
				<div><b>Your Agency plan</b><small>{status(p.agency)}</small></div>
				{#if sell && isPaid(p.agency) && !p.agency.cancel_at_end}<button class="btn sm ghost" onclick={() => stop(true)} disabled={!!busy}>Stop renewing</button>{/if}
			</div>
		{/if}
	</section>

	{#if !sell}
		<p class="hint pb-note">Plan changes aren't available in this app.</p>
	{:else if !p.can_buy}
		<p class="hint pb-note">{side === 'creator' ? 'Only the creator or her manager can change this plan.' : "Only your team's admin can change this plan."}</p>
	{:else}
		<section class="panel rv pb-plans" aria-labelledby="pb-t">
			<div class="panel-h">
				<h2 id="pb-t">Plans</h2>
				<div class="pb-toggle" role="group" aria-label="Billing">
					<button class:on={period === 'month'} aria-pressed={period === 'month'} onclick={() => (period = 'month')}>Monthly</button>
					<button class:on={period === 'year'} aria-pressed={period === 'year'} onclick={() => (period = 'year')}>Yearly <em>2 months free</em></button>
				</div>
			</div>
			{#if period === 'year' && p.offer.on}
				<p class="pb-offer"><Icon name="gift" />Founding member: half price on yearly plans for the first 100, locked while you stay. <b>{p.offer.left} left.</b></p>
			{/if}
			<div class="pb-grid">
				{#each paid as x (x.code)}
					<article class="pb-card" class:hot={x.side !== 'agency'} class:cur={current(x)}>
						<span class="pb-k">{x.side === 'agency' ? 'For agencies' : x.side === 'brand' ? 'For brands' : 'For creators'}</span>
						<h3>{x.name}</h3>
						<p class="pb-tag">{x.tagline}</p>
						<div class="pb-price">
							{#if founding(x)}<s>{inr(x.price_year)}</s>{/if}
							<b class="num">{inr(price(x))}</b><small>/{period === 'year' ? 'year' : 'month'}</small>
						</div>
						<small class="pb-sub">{period === 'year' ? `about ${inr(Math.round(price(x) / 12))} a month · ` : ''}GST included</small>
						<ul>{#each PERKS[x.code] ?? [] as perk (perk)}<li><Icon name="check" />{perk}</li>{/each}</ul>
						{#if current(x)}
							<span class="pb-on"><Icon name="check" />Your plan</span>
						{:else}
							<button class="btn {x.side === 'agency' ? '' : 'grad'}" onclick={() => choose(x)} disabled={!!busy}>{#if busy === x.code}<span class="spinner"></span>{/if}{p.plan === x.code && p.period === 'trial' ? `Keep ${x.name}` : `Get ${x.name}`}</button>
						{/if}
					</article>
				{/each}
			</div>
			<p class="hint pb-fine">Paid securely through Razorpay (UPI AutoPay, cards, net banking). Renews by itself; stop any time and keep it to the end of what you paid. GST invoice by email.</p>
		</section>
	{/if}

	{#if p.payments.length}
		<section class="panel rv">
			<div class="panel-h"><h2>Payments</h2><small>GST invoices from Zyposoft Technologies</small></div>
			<ul class="pb-pay">
				{#each p.payments as y (y.id)}
					<li><span><b>{y.invoice_no}</b><small>{day(y.paid_at)} · {y.period === 'year' ? 'yearly' : 'monthly'}</small></span><b class="num">{inr(y.amount)}</b></li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<style>
	.pb-now,
	.pb-plans {
		margin-bottom: 16px;
	}
	.pb-cur {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 4px 20px 16px;
	}
	.pb-cur > div {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.pb-cur b {
		font: 400 22px/1.15 var(--f-serif, Georgia, serif);
	}
	.pb-cur small {
		color: var(--ink-3);
		font-size: 13px;
	}
	.pb-ag {
		border-top: 1px solid var(--line);
		padding-top: 14px;
	}
	.pb-badge {
		display: grid;
		place-items: center;
		flex: none;
		width: 42px;
		height: 42px;
		border-radius: 12px;
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.pro .pb-badge {
		background: linear-gradient(135deg, var(--g1), var(--g2));
		color: #fff;
	}
	.pb-use {
		display: grid;
		gap: 10px;
		padding: 0 20px 18px;
	}
	.pb-meter {
		display: grid;
		gap: 5px;
		font-size: 13px;
		color: var(--ink-2);
	}
	.pb-meter i {
		display: block;
		height: 6px;
		border-radius: 99px;
		background: linear-gradient(90deg, var(--g1), var(--g2)) 0 0 / var(--w) 100% no-repeat, var(--surface-2);
	}
	.pb-meter.full b {
		color: var(--bad);
	}
	.pb-note {
		margin: 0 0 16px;
	}
	.pb-toggle {
		display: inline-flex;
		border: 1px solid var(--line-strong);
		border-radius: 999px;
		padding: 3px;
	}
	.pb-toggle button {
		border: 0;
		border-radius: 999px;
		padding: 6px 12px;
		background: none;
		color: var(--ink-2);
		font: 600 12.5px var(--f-body, inherit);
		cursor: pointer;
	}
	.pb-toggle button.on {
		background: var(--ink);
		color: var(--bg);
	}
	.pb-toggle em {
		font-style: normal;
		font-size: 10.5px;
		opacity: 0.8;
	}
	.pb-offer {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 20px 14px;
		padding: 10px 12px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--g2) 14%, transparent);
		font-size: 13px;
	}
	.pb-offer :global(.ic) {
		flex: none;
		width: 16px;
		height: 16px;
	}
	.pb-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
		gap: 12px;
		padding: 0 20px 14px;
	}
	.pb-card {
		display: grid;
		align-content: start;
		gap: 8px;
		padding: 18px;
		border-radius: 18px;
		background: var(--surface-2);
		box-shadow: 0 0 0 1px var(--line) inset;
	}
	.pb-card.hot {
		background: radial-gradient(110% 70% at 0% 0%, color-mix(in oklab, var(--g2) 18%, transparent), transparent 60%), var(--surface-2);
		box-shadow: 0 0 0 1px color-mix(in oklab, var(--g2) 45%, var(--line)) inset;
	}
	.pb-card.cur {
		box-shadow: 0 0 0 2px var(--ok) inset;
	}
	.pb-k {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.pb-card h3 {
		margin: 0;
		font: 400 26px/1.1 var(--f-serif, Georgia, serif);
	}
	.pb-tag {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-2);
	}
	.pb-price {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin-top: 6px;
	}
	.pb-price s {
		color: var(--ink-3);
		font-size: 14px;
	}
	.pb-price b {
		font: 400 34px/1 var(--f-serif, Georgia, serif);
	}
	.pb-price small,
	.pb-sub {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.pb-card ul {
		display: grid;
		gap: 6px;
		margin: 8px 0 6px;
		padding: 0;
		list-style: none;
		font-size: 13.5px;
	}
	.pb-card li {
		display: flex;
		gap: 8px;
	}
	.pb-card li :global(.ic) {
		flex: none;
		width: 15px;
		height: 15px;
		margin-top: 2px;
		color: var(--ok);
	}
	.pb-on {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 650;
		color: var(--ok);
	}
	.pb-fine {
		margin: 0 20px 18px;
	}
	.pb-pay {
		margin: 0;
		padding: 0 20px 14px;
		list-style: none;
	}
	.pb-pay li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 0;
		border-top: 1px solid var(--line);
	}
	.pb-pay li span {
		display: grid;
	}
	.pb-pay small {
		font-size: 12px;
		color: var(--ink-3);
	}
	@media (max-width: 760px) {
		.pb-cur,
		.pb-use,
		.pb-grid,
		.pb-pay {
			padding-left: 16px;
			padding-right: 16px;
		}
		.pb-offer,
		.pb-fine {
			margin-left: 16px;
			margin-right: 16px;
		}
		.panel-h:has(.pb-toggle) {
			flex-wrap: wrap;
			gap: 8px;
		}
	}
</style>
