<script lang="ts">
	import { inr, num } from './format.ts';
	import type { Overview } from './types.ts';
	import Icon from './Icon.svelte';

	let { overview, pending, onrequests }: { overview: Overview | null; pending: number; onrequests: () => void } = $props();

	const month = new Date().toLocaleDateString('en-IN', { month: 'long' });
	const cs = $derived(overview?.creators ?? {});
	const creatorsAll = $derived(Object.values(cs).reduce((a, n) => a + (n ?? 0), 0));
</script>

{#if !overview}
	<div class="ov-load"><span class="spinner"></span></div>
{:else}
	<div class="ov">
		<!-- Money: paid invoices across every creator. -->
		<section class="ov-money">
			<span class="ov-cap">Paid to creators on Miracle</span>
			<b class="ov-big num">{inr(overview.paid_total)}</b>
			<span class="ov-sub"><strong class="num">{inr(overview.paid_this_month)}</strong> paid in {month}</span>
			<div class="ov-tiles">
				<div><small>Collabs</small><b class="num">{num(overview.collabs)}</b><span>{num(overview.collabs_this_month)} this month</span></div>
				<div><small>Brands</small><b class="num">{num(overview.brands)}</b><span>{num(overview.brand_logins)} brand logins</span></div>
			</div>
		</section>

		<!-- Waiting sign-ups: the one thing that needs an admin. -->
		<button class="ov-wait" class:calm={!pending} onclick={onrequests}>
			<span class="ov-cap">Requests</span>
			<b class="num">{pending}</b>
			<span>{pending ? `creator${pending === 1 ? '' : 's'} waiting for approval` : 'Nobody waiting. All caught up.'}</span>
			<span class="neo white sm">Open requests<Icon name="arrow" /></span>
		</button>

		<section class="ov-card ov-cr">
			<header><span class="ov-cap">Creators</span><b class="num">{num(creatorsAll)}</b></header>
			<ul>
				<li><span class="pill active">Active</span><b class="num">{num(cs.active)}</b></li>
				<li><span class="pill pending">Waiting</span><b class="num">{num(cs.pending)}</b></li>
				<li><span class="pill paused">Paused</span><b class="num">{num(cs.paused)}</b></li>
				<li><span class="pill declined">Declined</span><b class="num">{num(cs.declined)}</b></li>
			</ul>
		</section>

		<section class="ov-card ov-mail">
			<header><span class="ov-cap">Emails</span></header>
			<div class="ov-two">
				<div><b class="num">{num(overview.emails_today)}</b><span>sent in the last day</span></div>
				<div class:bad={overview.emails_failed > 0}><b class="num">{num(overview.emails_failed)}</b><span>failed this week</span></div>
			</div>
		</section>
	</div>
{/if}

<style>
	.ov-load { min-height: 260px; display: grid; place-items: center; }
	.ov { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; }
	.ov-cap { font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }

	.ov-money { position: relative; overflow: hidden; padding: 28px; display: grid; gap: 8px; align-content: start; color: #fff; border-radius: 26px;
		background: radial-gradient(120% 90% at 0% 0%, rgba(242, 90, 144, .35), transparent 55%), radial-gradient(90% 90% at 100% 100%, rgba(156, 123, 255, .3), transparent 60%), linear-gradient(140deg, #2a1424, #160c14 70%); }
	.ov-money .ov-cap { color: rgba(255, 255, 255, .7); }
	.ov-big { font-family: var(--f-serif); font-weight: 400; font-size: clamp(48px, 6vw, 76px); line-height: 1; letter-spacing: -.02em; margin-top: 6px; }
	.ov-sub { color: rgba(255, 255, 255, .75); }
	.ov-sub strong { color: #fff; }
	.ov-tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px; }
	.ov-tiles div { padding: 14px 16px; border-radius: 16px; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .12); display: grid; gap: 2px; }
	.ov-tiles small { font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: rgba(255, 255, 255, .62); }
	.ov-tiles b { font-family: var(--f-serif); font-weight: 400; font-size: 34px; line-height: 1.1; }
	.ov-tiles span { font-size: 13px; color: rgba(255, 255, 255, .7); }

	.ov-wait { padding: 28px; border: 1px solid var(--line); border-radius: 26px; background: var(--surface); color: var(--ink); text-align: left; display: grid; gap: 6px; align-content: start; position: relative; overflow: hidden; }
	.ov-wait::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: var(--grad); }
	.ov-wait > b { font-family: var(--f-serif); font-weight: 400; font-size: 76px; line-height: 1; margin-top: 6px; color: var(--warn); }
	.ov-wait.calm > b { color: var(--ink); }
	.ov-wait > span:not(.ov-cap):not(.neo) { color: var(--ink-2); }
	.ov-wait .neo { justify-self: start; margin-top: 16px; }

	.ov-card { padding: 22px 24px; border: 1px solid var(--line); border-radius: 26px; background: var(--surface); display: grid; gap: 14px; align-content: start; }
	.ov-card header { display: flex; align-items: baseline; justify-content: space-between; }
	.ov-card header b { font-family: var(--f-serif); font-weight: 400; font-size: 34px; line-height: 1; }
	.ov-cr ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
	.ov-cr li { display: grid; gap: 10px; justify-items: start; padding: 14px; border: 1px solid var(--line); background: var(--surface-2); }
	.ov-cr li b { font-family: var(--f-serif); font-weight: 400; font-size: 32px; line-height: 1; }
	.ov-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.ov-two div { display: grid; gap: 4px; padding: 14px; border: 1px solid var(--line); background: var(--surface-2); }
	.ov-two b { font-family: var(--f-serif); font-weight: 400; font-size: 32px; line-height: 1; }
	.ov-two span { font-size: 13px; color: var(--ink-3); }
	.ov-two .bad b { color: var(--bad); }

	@media (max-width: 980px) {
		.ov { grid-template-columns: 1fr; }
	}
	@media (max-width: 560px) {
		.ov { gap: 14px; }
		.ov-money, .ov-wait { padding: 22px 20px; border-radius: 22px; }
		.ov-card { padding: 18px; border-radius: 22px; }
		.ov-cr ul { grid-template-columns: 1fr 1fr; }
		.ov-wait > b { font-size: 60px; }
	}
</style>
