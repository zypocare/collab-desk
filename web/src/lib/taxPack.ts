// The quarterly pack for her CA: one .zip with what GST returns (GSTR-1, GSTR-3B) and income tax
// need for a quarter, worked out from her invoices, payments, TDS and expenses. Figures are in
// rupees (foreign-currency invoices at the rate they were made at).
import { zip } from './exportAll';
import { dmy, n2, toCsv, type FY } from './reports';
import type { Collab, Settings } from './types';

export type Quarter = { q: 1 | 2 | 3 | 4; label: string; from: string; to: string; due: string };

export function quarters(fy: FY): Quarter[] {
	const names = ['Apr–Jun', 'Jul–Sep', 'Oct–Dec', 'Jan–Mar'];
	return names.map((label, i) => {
		const start = new Date(fy.start, 3 + i * 3, 1);
		const end = new Date(fy.start, 6 + i * 3, 0);
		const after = new Date(fy.start, 6 + i * 3, 13);
		const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		return { q: (i + 1) as Quarter['q'], label, from: iso(start), to: iso(end), due: after.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) };
	});
}
export function currentQuarter(fy: FY, today = new Date()) {
	const iso = today.toISOString().slice(0, 10);
	return quarters(fy).find((q) => iso >= q.from && iso <= q.to)?.q ?? 1;
}

const inQ = (d: string | null | undefined, q: Quarter) => !!d && d.slice(0, 10) >= q.from && d.slice(0, 10) <= q.to;

export function quarterPack(collabs: Collab[], s: Settings, q: Quarter, fy: FY) {
	const issued = collabs.flatMap((c) => c.invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled').map((inv) => ({ inv, c, r: Number(inv.inr_rate) || 1 })));
	const sales = issued.filter((x) => inQ(x.inv.issue_date, q));
	const paid = issued.filter((x) => inQ(x.inv.paid_on, q) && (x.inv.amount_received > 0 || x.inv.tds_deducted > 0));
	const expenses = collabs.flatMap((c) => (c.expenses ?? []).filter((e) => inQ(e.spent_on, q)).map((e) => ({ e, c })));
	const gstin = (x: (typeof sales)[number]) => (x.inv.bill_to?.gstin || x.c.brand.gstin || '').trim();
	const isExport = (x: (typeof sales)[number]) => x.inv.tax_mode === 'export';
	const b2b = sales.filter((x) => !isExport(x) && gstin(x));
	const b2c = sales.filter((x) => !isExport(x) && !gstin(x));
	const exports = sales.filter(isExport);
	const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((t, x) => t + f(x), 0);

	const totals = {
		invoices: sales.length,
		taxable: sum(sales, (x) => x.inv.subtotal * x.r),
		cgst: sum(sales, (x) => x.inv.cgst * x.r),
		sgst: sum(sales, (x) => x.inv.sgst * x.r),
		igst: sum(sales, (x) => x.inv.igst * x.r),
		exports: sum(exports, (x) => x.inv.subtotal * x.r),
		received: sum(paid, (x) => x.inv.amount_received * x.r),
		tds: sum(paid, (x) => x.inv.tds_deducted * x.r),
		tdsCertsMissing: paid.filter((x) => x.inv.tds_deducted > 0 && !x.inv.tds_certificate).length,
		expenses: sum(expenses, (x) => x.e.amount)
	};
	const gst = totals.cgst + totals.sgst + totals.igst;

	const files: { name: string; text: string }[] = [];
	const title = `${q.label} ${fy.label}`;
	files.push({
		name: '0 Summary.csv',
		text: toCsv([
			[`Quarter summary: ${title}`],
			['Prepared for', s.legal_name || s.display_name],
			['GSTIN', s.gst_registered ? s.gstin : 'Not GST-registered'],
			['PAN', s.pan],
			[],
			['Invoices issued', totals.invoices],
			['Taxable value (₹)', n2(totals.taxable)],
			['CGST (₹)', n2(totals.cgst)],
			['SGST (₹)', n2(totals.sgst)],
			['IGST (₹)', n2(totals.igst)],
			['GST to pay in GSTR-3B (₹, before input credit)', n2(gst)],
			['Exports under LUT, zero-rated (₹)', n2(totals.exports)],
			['LUT ARN', s.lut_arn],
			[],
			['Payments received (₹)', n2(totals.received)],
			['TDS deducted by brands (₹, claim in income tax return)', n2(totals.tds)],
			['TDS certificates (Form 16A) still missing', totals.tdsCertsMissing],
			['Expenses (₹)', n2(totals.expenses)],
			[],
			['GSTR-1 for quarterly filers is due by', q.due]
		])
	});
	if (s.gst_registered) {
		files.push({
			name: '1 GSTR-1 B2B (registered brands).csv',
			text: toCsv([
				['GSTIN of recipient', 'Receiver name', 'Invoice number', 'Invoice date', 'Invoice value (₹)', 'Place of supply', 'Rate %', 'Taxable value (₹)', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)', 'SAC'],
				...b2b.map((x) => [gstin(x), x.inv.bill_to?.name || x.c.brand.name, x.inv.number, dmy(x.inv.issue_date), n2(x.inv.total * x.r), placeOfSupply(gstin(x), x.inv.bill_to?.state || x.c.brand.state), x.inv.gst_rate, n2(x.inv.subtotal * x.r), n2(x.inv.igst * x.r), n2(x.inv.cgst * x.r), n2(x.inv.sgst * x.r), s.sac_code])
			])
		});
		const byState = new Map<string, { taxable: number; igst: number; cgst: number; sgst: number; rate: number }>();
		for (const x of b2c) {
			const k = `${x.inv.bill_to?.state || x.c.brand.state || s.state}|${x.inv.gst_rate}`;
			const v = byState.get(k) ?? { taxable: 0, igst: 0, cgst: 0, sgst: 0, rate: x.inv.gst_rate };
			v.taxable += x.inv.subtotal * x.r;
			v.igst += x.inv.igst * x.r;
			v.cgst += x.inv.cgst * x.r;
			v.sgst += x.inv.sgst * x.r;
			byState.set(k, v);
		}
		files.push({
			name: '2 GSTR-1 B2C (unregistered, by state).csv',
			text: toCsv([['Place of supply', 'Rate %', 'Taxable value (₹)', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)'], ...[...byState].map(([k, v]) => [k.split('|')[0], v.rate, n2(v.taxable), n2(v.igst), n2(v.cgst), n2(v.sgst)])])
		});
		files.push({
			name: '4 SAC summary.csv',
			text: toCsv([['SAC', 'Description', 'Taxable value (₹)', 'IGST (₹)', 'CGST (₹)', 'SGST (₹)'], [s.sac_code, 'Advertising and promotion services', n2(totals.taxable), n2(totals.igst), n2(totals.cgst), n2(totals.sgst)]])
		});
	}
	files.push({
		name: '3 Exports (LUT).csv',
		text: toCsv([
			['Invoice number', 'Invoice date', 'Client', 'Country', 'Currency', 'Value in currency', 'Rate to ₹', 'Value (₹)', 'LUT ARN'],
			...exports.map((x) => [x.inv.number, dmy(x.inv.issue_date), x.c.brand.name, x.inv.bill_to?.country || x.c.brand.country, x.inv.currency || 'INR', n2(x.inv.subtotal), x.r, n2(x.inv.subtotal * x.r), s.lut_arn])
		])
	});
	files.push({
		name: '5 Payments and TDS.csv',
		text: toCsv([
			['Invoice number', 'Brand', 'Brand GSTIN', 'Paid on', 'Received (₹)', 'TDS rate %', 'TDS deducted (₹)', 'Form 16A received', 'Payment ref'],
			...paid.map((x) => [x.inv.number, x.c.brand.name, gstin(x), dmy(x.inv.paid_on), n2(x.inv.amount_received * x.r), x.inv.tds_rate, n2(x.inv.tds_deducted * x.r), x.inv.tds_deducted ? (x.inv.tds_certificate ? 'Yes' : 'No') : '', x.inv.payment_ref])
		])
	});
	files.push({
		name: '6 Expenses.csv',
		text: toCsv([['Date', 'Collab', 'Brand', 'Category', 'What', 'Amount (₹)'], ...expenses.map((x) => [dmy(x.e.spent_on), x.c.code, x.c.brand.name, x.e.category, x.e.label, n2(x.e.amount)])])
	});
	return { totals: { ...totals, gst }, files, title };
}

export function downloadPack(files: { name: string; text: string }[], name: string) {
	// A byte-order mark so Excel opens ₹ and names correctly.
	const blob = zip(files.map((f) => ({ name: f.name, text: '﻿' + f.text })));
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// GST state codes: the first two digits of a GSTIN, or from the state's name.
const STATES: Record<string, string> = {
	'01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
	'10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
	'20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
	'30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
};
function placeOfSupply(gstin: string, state: string) {
	const code = /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : Object.keys(STATES).find((k) => STATES[k].toLowerCase() === (state || '').toLowerCase());
	return code ? `${code}-${STATES[code] ?? state}` : state;
}
