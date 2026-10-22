// A brand's "Download all our data": one .zip with a spreadsheet (CSV) per kind of record, the Reports
// workbook for the financial year in Excel, and a complete copy as JSON.
import { reportsWorkbook } from './brandReports.svelte';
import { saveBlob } from './download';
import { zip } from './exportAll';
import { toCsv } from './reports';
import { supabase } from './supabase';
import { todayIso } from './util';

type Row = Record<string, unknown>;
type Export = {
	company: Row | null;
	team: Row[];
	requests: (Row & { quotes: Row[]; invoices: Row[]; messages: Row[] })[];
	campaigns: (Row & { applications: Row[] })[];
	ratings: Row[];
	pools: { name: string; creators: string[] }[];
};

const csv = (rows: unknown[][]) => '﻿' + toCsv(rows);
const table = (list: Row[], cols: [string, string][]) => csv([cols.map((c) => c[1]), ...list.map((r) => cols.map(([k]) => (typeof r[k] === 'object' && r[k] !== null ? JSON.stringify(r[k]) : r[k] ?? '')))]);

/** Builds and saves the zip; hands back how many files it holds. */
export async function exportBrand(company: string): Promise<number> {
	const { data, error } = await supabase.rpc('brand_export');
	if (error) throw error;
	const x = data as Export;
	const reqs = x.requests ?? [];
	const files: { name: string; text?: string; data?: Uint8Array }[] = [
		{ name: 'requests.csv', text: table(reqs, [['code', 'Code'], ['creator', 'Creator'], ['brand', 'Brand'], ['stage', 'Stage'], ['type', 'Type'], ['fee', 'Fee (₹)'], ['deliverables', 'Content'], ['received_on', 'Sent on'], ['live_date', 'Live date'], ['contact', 'Contact'], ['email', 'Email']]) },
		{ name: 'quotes.csv', text: table(reqs.flatMap((r) => r.quotes.map((q) => ({ code: r.code, creator: r.creator, ...q }))), [['code', 'Request'], ['creator', 'Creator'], ['version', 'Version'], ['status', 'Status'], ['total', 'Total (₹)'], ['items', 'Items']]) },
		{ name: 'invoices.csv', text: table(reqs.flatMap((r) => r.invoices.map((i) => ({ code: r.code, creator: r.creator, ...i }))), [['number', 'Invoice'], ['code', 'Request'], ['creator', 'Creator'], ['issue_date', 'Issued'], ['due_date', 'Due'], ['subtotal', 'Subtotal (₹)'], ['cgst', 'CGST'], ['sgst', 'SGST'], ['igst', 'IGST'], ['total', 'Total (₹)'], ['tds', 'TDS (₹)'], ['payable', 'Payable (₹)'], ['received', 'Paid (₹)'], ['paid_on', 'Paid on'], ['status', 'Status']]) },
		{ name: 'messages.csv', text: table(reqs.flatMap((r) => r.messages.map((m) => ({ code: r.code, creator: r.creator, ...m }))), [['code', 'Request'], ['creator', 'Creator'], ['at', 'When'], ['from', 'From'], ['text', 'Message']]) },
		{ name: 'campaigns.csv', text: table(x.campaigns ?? [], [['name', 'Campaign'], ['status', 'Status'], ['open', 'Open brief'], ['budget', 'Budget (₹)'], ['created_at', 'Created']]) },
		{ name: 'applications.csv', text: table((x.campaigns ?? []).flatMap((k) => k.applications.map((a) => ({ campaign: k.name, ...a }))), [['campaign', 'Campaign'], ['creator', 'Creator'], ['rate', 'Rate (₹)'], ['status', 'Status'], ['note', 'Note'], ['at', 'Applied']]) },
		{ name: 'ratings.csv', text: table(x.ratings ?? [], [['creator', 'Creator'], ['on_time', 'On time'], ['quality', 'Quality'], ['results', 'Results'], ['note', 'Note']]) },
		{ name: 'team.csv', text: table(x.team ?? [], [['name', 'Name'], ['email', 'Email'], ['role', 'Role'], ['joined_at', 'Joined']]) },
		{ name: 'everything.json', text: JSON.stringify(x, null, 2) }
	];
	const book = await reportsWorkbook(company, 'fy').catch(() => null);
	if (book) files.push({ name: 'reports-this-financial-year.xlsx', data: new Uint8Array(await book.arrayBuffer()) });
	await saveBlob(zip(files), `miracle-${company.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'brand'}-${todayIso()}.zip`);
	return files.length;
}
