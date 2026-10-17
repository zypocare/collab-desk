// Money reports for an Indian financial year (April to March), plus CSV export.
import type { Invoice } from './invoice';
import type { Collab } from './types';
import { parse } from './util';
import { saveBlob } from './download';

export type FY = { start: number; label: string; from: string; to: string };
export function fyOf(d: Date): FY {
	const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
	return { start, label: `FY ${start}-${String(start + 1).slice(2)}`, from: `${start}-04-01`, to: `${start + 1}-03-31` };
}
export const fyFromStart = (start: number) => fyOf(new Date(start, 6, 1));
const inFy = (d: string | null | undefined, fy: FY) => !!d && d >= fy.from && d <= fy.to;

export type MonthRow = { key: string; label: string; taxable: number; gst: number; received: number; tds: number; barter: number; invoices: number; costs: number };
export type BrandRow = { name: string; gstin: string; taxable: number; received: number; tds: number; barter: number; tdsCertsMissing: number };

export function buildReport(collabs: Collab[], fy: FY) {
	const months: MonthRow[] = Array.from({ length: 12 }, (_, i) => {
		const d = new Date(fy.start, 3 + i, 1);
		return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), taxable: 0, gst: 0, received: 0, tds: 0, barter: 0, invoices: 0, costs: 0 };
	});
	const month = (d: string) => months.find((m) => d.startsWith(m.key));
	const brands = new Map<string, BrandRow>();
	const brandRow = (c: Collab) => {
		if (!brands.has(c.brand_id)) brands.set(c.brand_id, { name: c.brand.name, gstin: c.brand.gstin ?? '', taxable: 0, received: 0, tds: 0, barter: 0, tdsCertsMissing: 0 });
		return brands.get(c.brand_id)!;
	};
	const register: { inv: Invoice; c: Collab }[] = [];

	for (const c of collabs) {
		const issued = c.invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled');
		for (const i of issued) {
			// Foreign-currency invoices count in rupees, at the rate they were made at.
			const r = Number(i.inr_rate) || 1;
			if (inFy(i.issue_date, fy)) {
				const m = month(i.issue_date)!;
				m.taxable += i.subtotal * r;
				m.gst += (i.cgst + i.sgst + i.igst) * r;
				m.invoices++;
				brandRow(c).taxable += i.subtotal * r;
				register.push({ inv: i, c });
			}
			if (inFy(i.paid_on, fy) && (i.amount_received > 0 || i.tds_deducted > 0)) {
				const m = month(i.paid_on!)!;
				m.received += i.amount_received * r;
				m.tds += i.tds_deducted * r;
				const b = brandRow(c);
				b.received += i.amount_received * r;
				b.tds += i.tds_deducted * r;
				if (i.tds_deducted > 0 && !i.tds_certificate) b.tdsCertsMissing++;
			}
		}
		// Payments tracked by hand (no invoice in the app).
		if (!issued.length && c.type !== 'barter' && inFy(c.paid_on, fy) && c.pay_received > 0) {
			month(c.paid_on!)!.received += c.pay_received;
			brandRow(c).received += c.pay_received;
		}
		// Costs she logged against the collab, by the month they were spent.
		for (const x of c.expenses ?? []) if (inFy(x.spent_on, fy)) month(x.spent_on)!.costs += Number(x.amount) || 0;
		// Products received (barter / paid + product).
		// Only once it actually arrived (a parcel on its way doesn't count yet); an experience counts once it's live.
		const got = c.product_received_at?.slice(0, 10) ?? (c.barter_kind === 'experience' && (c.stage === 'live' || c.stage === 'wrapped') ? c.live_date : null);
		if (c.type !== 'paid' && c.product_value > 0 && c.stage !== 'declined' && inFy(got, fy)) {
			month(got!)!.barter += c.product_value;
			brandRow(c).barter += c.product_value;
		}
	}

	const total = months.reduce(
		(a, m) => ({ taxable: a.taxable + m.taxable, gst: a.gst + m.gst, received: a.received + m.received, tds: a.tds + m.tds, barter: a.barter + m.barter, invoices: a.invoices + m.invoices, costs: a.costs + m.costs }),
		{ taxable: 0, gst: 0, received: 0, tds: 0, barter: 0, invoices: 0, costs: 0 }
	);
	const brandList = [...brands.values()].filter((b) => b.taxable || b.received || b.barter).sort((a, b) => b.received + b.barter - (a.received + a.barter));
	register.sort((a, b) => (a.inv.number ?? '').localeCompare(b.inv.number ?? ''));
	return { months, total, brands: brandList, register };
}

// ---- CSV ----
const cell = (v: unknown) => {
	const s = v === null || v === undefined ? '' : String(v);
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(',')).join('\r\n');

export function downloadCsv(name: string, rows: unknown[][]) {
	// The BOM makes Excel read the ₹ sign and Indian names correctly.
	const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
	void saveBlob(blob, name);
}

export const n2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
export const dmy = (d: string | null | undefined) => (d ? parse(d).toLocaleDateString('en-GB') : '');
