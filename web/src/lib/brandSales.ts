// Sales from creators' codes: the brand imports its orders (a Shopify or WooCommerce export, or any CSV
// with an order number, date, amount and discount code) and sees orders, sales, cost per sale and
// return on spend for each creator. Tracking only: no money moves through Miracle.
import { supabase } from './supabase';
import { errMessage } from './util';

export type SalesRow = { collab: string; creator: string; creator_id: number; brand: string; code: string; clicks: number; orders: number; revenue: number; fee: number; stage: string };
export type Order = { ref: string; date: string; amount: number; code: string };

/** A CSV file as rows of cells (quotes, commas and line breaks inside quotes handled). */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let q = false;
	const t = text.replace(/^﻿/, '');
	for (let i = 0; i < t.length; i++) {
		const ch = t[i];
		if (q) {
			if (ch === '"' && t[i + 1] === '"') (cell += '"'), i++;
			else if (ch === '"') q = false;
			else cell += ch;
		} else if (ch === '"') q = true;
		else if (ch === ',' || ch === ';' || ch === '\t') row.push(cell), (cell = '');
		else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && t[i + 1] === '\n') i++;
			row.push(cell);
			if (row.some((c) => c.trim())) rows.push(row);
			row = [];
			cell = '';
		} else cell += ch;
	}
	row.push(cell);
	if (row.some((c) => c.trim())) rows.push(row);
	return rows;
}

const find = (head: string[], names: string[]) => head.findIndex((h) => names.includes(h.trim().toLowerCase()));
const isoDate = (v: string) => {
	const s = v.trim();
	const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (m) return `${m[1]}-${m[2]}-${m[3]}`;
	const d = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); // 20/10/2026 (Indian order)
	if (d) return `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`;
	const p = Date.parse(s);
	return Number.isNaN(p) ? '' : new Date(p).toISOString().slice(0, 10);
};

/** Orders from an export: Shopify ("Name", "Created at", "Total", "Discount Code"), WooCommerce
 *  ("Order Number", "Order Date", "Order Total", "Coupon Code"), or plain columns. One row per order. */
export function readOrders(text: string): { orders: Order[]; source: 'shopify' | 'woocommerce' | 'csv'; error?: string } {
	const rows = parseCsv(text);
	if (rows.length < 2) return { orders: [], source: 'csv', error: 'That file has no orders in it.' };
	const head = rows[0].map((h) => h.trim().toLowerCase());
	const source = head.includes('discount code') && head.includes('name') ? 'shopify' : head.some((h) => h.startsWith('coupon')) ? 'woocommerce' : 'csv';
	const ref = find(head, ['name', 'order number', 'order id', 'order', 'order_id', 'order no', 'id']);
	const date = find(head, ['created at', 'order date', 'date', 'paid at', 'created_at']);
	const amount = find(head, ['total', 'order total', 'order total amount', 'amount', 'order_total', 'net sales']);
	const code = find(head, ['discount code', 'coupon code', 'coupon', 'coupons', 'coupon code(s)', 'code', 'promo code', 'discount_code']);
	if (ref < 0 || amount < 0 || code < 0) return { orders: [], source, error: 'Couldn\'t find the order number, total and discount code columns. Export orders from Shopify or WooCommerce, or use columns named Order, Date, Amount and Code.' };
	const byRef = new Map<string, Order>();
	for (const r of rows.slice(1)) {
		const id = (r[ref] ?? '').trim();
		if (!id) continue;
		const prev = byRef.get(id);
		// Shopify repeats an order once per item; the total and code are on its first line.
		const amt = Number(String(r[amount] ?? '').replace(/[^0-9.]/g, '')) || 0;
		const c = (r[code] ?? '').trim().split(/[,\s]+/)[0] ?? '';
		if (prev) {
			if (!prev.amount && amt) prev.amount = amt;
			if (!prev.code && c) prev.code = c;
			continue;
		}
		byRef.set(id, { ref: id, date: date >= 0 ? isoDate(r[date] ?? '') : '', amount: amt, code: c });
	}
	return { orders: [...byRef.values()], source };
}

export async function importOrders(text: string) {
	const { orders, source, error } = readOrders(text);
	if (error) throw new Error(error);
	const { data, error: e } = await supabase.rpc('brand_orders_import', { p_rows: orders, p_source: source });
	if (e) throw new Error(errMessage(e));
	return { ...(data as { imported: number; matched: number; unmatched_codes: string[] }), source, withCode: orders.filter((o) => o.code).length };
}

export async function loadSales() {
	const { data, error } = await supabase.rpc('brand_sales');
	if (error) throw new Error(errMessage(error));
	return (data as SalesRow[]) ?? [];
}

/** Cost per sale and return on spend (sales ÷ fee), or null when there's nothing to divide. */
export const perSale = (r: Pick<SalesRow, 'fee' | 'orders'>) => (r.orders > 0 && r.fee > 0 ? r.fee / r.orders : null);
export const roas = (r: Pick<SalesRow, 'fee' | 'revenue'>) => (r.fee > 0 && r.revenue > 0 ? r.revenue / r.fee : null);
