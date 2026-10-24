<script lang="ts">
	import { onMount } from 'svelte';
	import { day, inr, inr0, num, when } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { KIND_LABEL, subjectHref } from './billing.ts';

	// Miracle's own plans: monthly recurring revenue, who's on which plan, trials ending, and the latest payments.
	type R = Record<string, any>;
	let d = $state<R | null>(null);
	let err = $state('');
	onMount(async () => {
		const { data, error } = await supabase.rpc('admin_billing_overview');
		err = error ? errMessage(error) : '';
		if (!error) d = data as R;
	});
	const maxRev = $derived(d ? Math.max(1, ...d.months.map((m: R) => Number(m.revenue))) : 1);
	const SIDE: Record<string, string> = { creator: 'Creators', brand: 'Brands', agency: 'Agencies' };
</script>

<div class="bo">
	<header class="bh">
		<div>
			<div class="eb">Billing</div>
			<h1>Overview</h1>
			<p class="muted lead">Miracle's own plans. Money between brands and creators never goes through here.</p>
		</div>
		<div class="acts"><a class="btn" href={href('plans')}>Plans & settings</a><a class="btn" href={href('subscriptions')}>Subscriptions</a></div>
	</header>
	{#if err}<p class="err">{err}</p>{/if}
	{#if !d}
		<div class="ld"><span class="spinner"></span></div>
	{:else}
		<section class="kpis">
			<div class="card k"><small>Monthly recurring revenue</small><b class="mono">{inr0(d.mrr)}</b><span>{inr0(Number(d.mrr) * 12)} a year</span></div>
			<a class="card k" href={href('subscriptions')}><small>Paying accounts</small><b class="mono">{num(d.paid)}</b><span>+{num(d.new_paid_30d)} · −{num(d.ended_30d)} in 30 days</span></a>
			<div class="card k"><small>On trial</small><b class="mono">{num(d.trials)}</b><span>{num(d.trials_ending.length)} ending this week</span></div>
			<div class="card k"><small>Given free</small><b class="mono">{num(d.comps)}</b><span>partners, early access</span></div>
			<div class="card k" class:warn={d.halted}><small>Payment failed</small><b class="mono">{num(d.halted)}</b><span>{num(d.cancelling)} ending at period end</span></div>
			<a class="card k" href={href('billing-payments')}><small>Collected this month</small><b class="mono">{inr0(d.revenue_month)}</b><span>{inr0(d.gst_month)} of it GST · {num(d.payments_month)} payments</span></a>
		</section>

		<div class="two">
			<section class="card tbl-wrap">
				<div class="card-h"><h2 class="card-t">Plans</h2><a href={href('plans')}>Edit prices</a></div>
				<table class="tbl">
					<thead><tr><th>Plan</th><th class="r">Monthly</th><th class="r">Yearly</th><th class="r">Trial</th><th class="r">Free</th><th class="r">Price</th></tr></thead>
					<tbody>
						{#each d.by_plan as p (p.code)}
							<tr class:off={!p.active}>
								<td><span class="w5">{p.name}</span> <small class="muted">{SIDE[p.side] ?? p.side}{p.active ? '' : ' · hidden'}</small></td>
								<td class="r mono">{num(p.month)}</td><td class="r mono">{num(p.year)}</td><td class="r mono">{num(p.trial)}</td><td class="r mono">{num(p.comp)}</td>
								<td class="r mono">{p.price_month ? `${inr(p.price_month)}/mo` : 'Free'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
			<section class="card">
				<div class="card-h"><h2 class="card-t">Collected by month</h2><span class="muted sm">including GST</span></div>
				<div class="months">
					{#each d.months as m (m.month)}
						<div class="mo" title="{inr(Number(m.revenue))}"><span class="mv mono">{inr0(Number(m.revenue))}</span><span class="mb" style:height="{Math.max(2, (Number(m.revenue) / maxRev) * 100)}%"></span><small class="muted">{new Date(m.month).toLocaleDateString('en-IN', { month: 'short' })}</small></div>
					{/each}
				</div>
			</section>
		</div>

		<div class="two">
			<section class="card tbl-wrap">
				<div class="card-h"><h2 class="card-t">Trials ending this week</h2><a href={href('subscriptions')}>All trials</a></div>
				{#if !d.trials_ending.length}<div class="card-empty">No trials end this week.</div>{:else}
					<table class="tbl"><tbody>{#each d.trials_ending as t (t.id)}<tr><td><a class="w5" href={subjectHref(t.kind, t.subject)}>{t.name ?? t.subject}</a><small class="d">{KIND_LABEL[t.kind]} · {t.email}</small></td><td class="mono">{t.plan}</td><td>{day(t.ends_at)}</td></tr>{/each}</tbody></table>
				{/if}
			</section>
			<section class="card tbl-wrap">
				<div class="card-h"><h2 class="card-t">Latest payments</h2><a href={href('billing-payments')}>All payments</a></div>
				{#if !d.payments.length}<div class="card-empty">No plan payments yet.</div>{:else}
					<table class="tbl"><tbody>{#each d.payments as p (p.id)}<tr><td class="mono">{p.invoice_no ?? '—'}</td><td><a href={subjectHref(p.kind, p.subject)}>{p.name ?? p.subject}</a></td><td class="mono">{p.plan}</td><td class="r mono">{inr(p.amount)}</td><td class="muted">{when(p.paid_at)}</td></tr>{/each}</tbody></table>
				{/if}
			</section>
		</div>
	{/if}
</div>

<style>
	.bo { display: flex; flex-direction: column; gap: 16px; }
	.bh { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.lead { margin-top: 4px; font-size: 13.5px; }
	.acts { display: flex; gap: 8px; flex-wrap: wrap; }
	.ld { padding: 60px; display: grid; place-items: center; }
	.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
	.k { padding: 14px 16px; display: grid; gap: 4px; color: var(--ink); }
	a.k:hover { text-decoration: none; color: var(--ink); border-color: var(--line-strong); }
	.k small { font-size: 12.5px; color: var(--ink-3); }
	.k b { font-size: 24px; font-weight: 500; }
	.k span { font-size: 12px; color: var(--ink-3); }
	.k.warn b { color: var(--bad); }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 16px; align-items: start; }
	.w5 { font-weight: 500; }
	.d { display: block; font-size: 12px; color: var(--ink-3); }
	.sm { font-size: 12px; }
	tr.off td { opacity: .6; }
	.months { display: flex; align-items: flex-end; gap: 10px; height: 200px; padding: 16px; }
	.mo { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; min-width: 0; }
	.mv { font-size: 11px; color: var(--ink-2); white-space: nowrap; }
	.mb { width: 100%; max-width: 44px; background: #dcd3f6; border-top: 2px solid var(--accent); border-radius: 3px 3px 0 0; }
	.mo small { font-size: 11px; }
</style>
