<script lang="ts">
	import { onMount } from 'svelte';
	import { importOrders, loadSales, perSale, salesPerFee, type SalesRow } from '../brandSales';
	import { toast } from '../ui.svelte';
	import { inr } from '../util';
	import Icon from './Icon.svelte';

	// Sales from creators' codes: import orders, then each creator's orders, sales, fee per sale and sales
	// per rupee of fee. Tracking only. Every number says where it comes from (imported orders, link taps).
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

<section class="bs-card rv" aria-labelledby="bs-t">
	<header class="bs-h">
		<div>
			<span class="bs-eb">Sales</span>
			<h2 id="bs-t">From creators' codes</h2>
		</div>
		<label class="bs-up">
			<input type="file" accept=".csv,text/csv" onchange={pick} disabled={busy} />
			{#if busy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}Import orders
		</label>
	</header>
	{#if note}<p class="bs-note bs-import-note">{note}</p>{/if}
	{#if rows.length}
		<div class="bs-k">
			<div><small>Sales</small><b class="num">{inr(tot.revenue)}</b></div>
			<div><small>Orders</small><b class="num">{tot.orders}</b></div>
			<div><small>Sales per ₹1 of creator fees</small><b class="num bs-good">{x(salesPerFee(tot))}</b></div>
			<div><small>Creator fee per sale</small><b class="num">{perSale(tot) === null ? '—' : inr(perSale(tot))}</b></div>
		</div>
		<div class="bs-tw">
			<table class="bs-t">
				<thead><tr><th>Creator</th><th>Code</th><th>Link taps</th><th>Orders</th><th>Sales</th><th>Fee</th><th>Fee per sale</th><th>Sales ÷ fee</th></tr></thead>
				<tbody>
					{#each rows as r (r.collab)}
						<tr>
							<td><b>{r.creator}</b><small>{r.collab}</small></td>
							<td>{#if r.code}<span class="bs-code">{r.code}</span>{:else}—{/if}</td>
							<td class="num">{r.clicks}</td>
							<td class="num">{r.orders}</td>
							<td class="num">{inr(r.revenue)}</td>
							<td class="num">{inr(r.fee)}</td>
							<td class="num">{perSale(r) === null ? '—' : inr(perSale(r))}</td>
							<td class="num" class:good={(salesPerFee(r) ?? 0) >= 1}>{x(salesPerFee(r))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if loaded}
		<p class="bs-note">Give each creator a promo code (it's on the request page), then import your orders: in Shopify, Orders › Export; in WooCommerce, Orders › Export CSV. Orders with a creator's code count as their sales.</p>
	{/if}
	<small class="bs-fine">
		Where these come from: <b>orders</b> and <b>sales</b> are the orders you imported that used a creator's code, all time;
		<b>link taps</b> are taps on the tracked link, not people or purchases. <b>Sales ÷ fee</b> counts only what you paid the creator,
		not product, shipping, ads or agency costs. Only codes and totals are read; customer details in the file aren't stored.
	</small>
</section>

<style>
	.bs-card {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
		padding: 18px 17px;
		border-radius: 22px;
		background: linear-gradient(180deg, rgba(31, 24, 34, 0.94) 0%, rgba(21, 16, 23, 0.98) 100%);
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
	}
	.bs-h {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.bs-h h2 {
		margin: 3px 0 0;
		font-family: var(--f-serif, 'Instrument Serif', Georgia, serif);
		font-size: 25px;
		font-weight: 400;
		line-height: 1.08;
		color: var(--ink, #faf7fc);
	}
	.bs-eb {
		display: inline-block;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff 0%, #f25a90 52%, #ffae6b 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.bs-up {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: 10px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: #faf7fc;
		font: 600 12px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
		white-space: nowrap;
		transition: border-color 0.16s ease, background 0.16s ease;
	}
	.bs-up:hover {
		border-color: rgba(242, 90, 144, 0.5);
		background: #2e2432;
	}
	.bs-up :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.bs-up input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.bs-note {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.5;
		color: #8f8499;
	}
	.bs-import-note {
		color: #3ce29b;
	}
	.bs-fine {
		font-size: 11px;
		line-height: 1.48;
		color: #8f8499;
	}
	.bs-k {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}
	.bs-k > div {
		display: grid;
		gap: 3px;
		padding: 11px 12px;
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.035);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}
	.bs-k small {
		color: #8f8499;
		font-size: 11px;
	}
	.bs-k b {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 17px;
		color: #faf7fc;
	}
	.bs-good {
		color: #3ce29b !important;
	}
	@media (max-width: 700px) {
		.bs-k {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.bs-tw {
		overflow-x: auto;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(11, 8, 13, 0.45);
	}
	.bs-t {
		width: 100%;
		border-collapse: collapse;
		font-size: 12.5px;
		min-width: 640px;
	}
	.bs-t th {
		text-align: left;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #8f8499;
		padding: 10px 12px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.bs-t td {
		padding: 11px 12px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		color: #cfc6d6;
		vertical-align: middle;
	}
	.bs-t tr:last-child td {
		border-bottom: 0;
	}
	.bs-t td b {
		display: block;
		color: #faf7fc;
		font-weight: 600;
	}
	.bs-t td small {
		display: block;
		font-size: 11px;
		color: #8f8499;
	}
	.bs-code {
		display: inline-block;
		padding: 3px 8px;
		border-radius: 6px;
		background: rgba(156, 123, 255, 0.14);
		border: 1px solid rgba(156, 123, 255, 0.3);
		color: #d2c2ff;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11px;
		font-weight: 700;
	}
	.bs-t .good {
		color: #3ce29b;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-weight: 700;
	}
</style>
