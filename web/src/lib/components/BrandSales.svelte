<script lang="ts">
	import { onMount } from 'svelte';
	import { importOrders, loadSales, perSale, roas, type SalesRow } from '../brandSales';
	import { toast } from '../ui.svelte';
	import { inr } from '../util';
	import Icon from './Icon.svelte';

	// Sales from creators' codes: import orders, then each creator's orders, sales, cost per sale and
	// return on spend. Tracking only.
	let rows = $state<SalesRow[]>([]);
	let loaded = $state(false);
	let busy = $state(false);
	let note = $state('');
	onMount(async () => {
		rows = await loadSales().catch(() => []);
		loaded = true;
	});
	const tot = $derived(rows.reduce((a, r) => ({ fee: a.fee + r.fee, revenue: a.revenue + r.revenue, orders: a.orders + r.orders }), { fee: 0, revenue: 0, orders: 0 }));
	async function pick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const f = input.files?.[0];
		input.value = '';
		if (!f) return;
		busy = true;
		try {
			const r = await importOrders(await f.text());
			note = `${r.imported} orders from ${r.source === 'shopify' ? 'Shopify' : r.source === 'woocommerce' ? 'WooCommerce' : 'your file'}; ${r.matched} used a creator's code.${r.unmatched_codes.length ? ` Codes not linked to a creator: ${r.unmatched_codes.join(', ')}.` : ''}`;
			rows = await loadSales();
			toast('Orders imported', 'check');
		} catch (err) {
			toast(err instanceof Error ? err.message : String(err), 'alert');
		} finally {
			busy = false;
		}
	}
	const x = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}×`);
</script>

<section class="md-card md-wide rv bs" aria-labelledby="bs-t">
	<header class="md-h">
		<div><span class="bx-eb">Sales</span><h2 id="bs-t">From creators' codes</h2></div>
		<label class="btn sm bs-up">
			<input type="file" accept=".csv,text/csv" onchange={pick} disabled={busy} />
			{#if busy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}Import orders
		</label>
	</header>
	{#if note}<p class="hint bs-note">{note}</p>{/if}
	{#if rows.length}
		<div class="bs-k">
			<div><small>Sales</small><b class="num">{inr(tot.revenue)}</b></div>
			<div><small>Orders</small><b class="num">{tot.orders}</b></div>
			<div><small>Return on spend</small><b class="num">{x(roas(tot))}</b></div>
			<div><small>Cost per sale</small><b class="num">{perSale(tot) === null ? '—' : inr(perSale(tot))}</b></div>
		</div>
		<div class="bs-tw">
			<table class="bs-t">
				<thead><tr><th>Creator</th><th>Code</th><th>Clicks</th><th>Orders</th><th>Sales</th><th>Fee</th><th>Per sale</th><th>Return</th></tr></thead>
				<tbody>
					{#each rows as r (r.collab)}
						<tr>
							<td><b>{r.creator}</b><small>{r.collab}</small></td>
							<td>{r.code || '—'}</td>
							<td class="num">{r.clicks}</td>
							<td class="num">{r.orders}</td>
							<td class="num">{inr(r.revenue)}</td>
							<td class="num">{inr(r.fee)}</td>
							<td class="num">{perSale(r) === null ? '—' : inr(perSale(r))}</td>
							<td class="num" class:good={(roas(r) ?? 0) >= 1}>{x(roas(r))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if loaded}
		<p class="hint bs-note">Give each creator a promo code (it's on the request page), then import your orders: in Shopify, Orders › Export; in WooCommerce, Orders › Export CSV. Orders with a creator's code count as their sales.</p>
	{/if}
	<small class="hint bs-note">Only codes and totals are read; customer details in the file aren't stored.</small>
</section>

<style>
	.bs-up {
		position: relative;
		cursor: pointer;
	}
	.bs-up input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.bs-note {
		margin: 0 0 10px;
		line-height: 1.5;
	}
	.bs-k {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 14px;
	}
	.bs-k > div {
		display: grid;
		gap: 2px;
	}
	.bs-k small {
		color: var(--ink-3);
		font-size: 12px;
	}
	.bs-k b {
		font-size: 20px;
	}
	@media (max-width: 700px) {
		.bs-k {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.bs-tw {
		overflow-x: auto;
	}
	.bs-t {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		min-width: 640px;
	}
	.bs-t th {
		text-align: left;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
		padding: 0 8px 8px 0;
	}
	.bs-t td {
		padding: 10px 8px 10px 0;
		border-top: 1px solid var(--line);
		vertical-align: top;
	}
	.bs-t td small {
		display: block;
		color: var(--ink-3);
	}
	.bs-t .good {
		color: var(--ok);
		font-weight: 700;
	}
</style>
