// "Export everything": one .zip with a spreadsheet (CSV) per kind of record, plus a complete
// copy as JSON. Built in the browser from the data already loaded, so it works offline too.
import { studio } from './studio.svelte';
import { toCsv } from './reports';
import { delivText } from './util';

// ---- a minimal .zip writer (files stored as they are, no compression needed for text) ----
const CRC = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(b: Uint8Array) {
	let c = 0xffffffff;
	for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
export function zip(files: { name: string; text: string }[]): Blob {
	const enc = new TextEncoder();
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	const now = new Date();
	const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
	const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
	for (const f of files) {
		const name = enc.encode(f.name);
		const data = enc.encode(f.text);
		const crc = crc32(data);
		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true);
		local.setUint16(6, 0x0800, true); // names are UTF-8
		local.setUint16(10, time, true);
		local.setUint16(12, date, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, data.length, true);
		local.setUint32(22, data.length, true);
		local.setUint16(26, name.length, true);
		parts.push(new Uint8Array(local.buffer), name, data);
		const cen = new DataView(new ArrayBuffer(46));
		cen.setUint32(0, 0x02014b50, true);
		cen.setUint16(4, 20, true);
		cen.setUint16(6, 20, true);
		cen.setUint16(8, 0x0800, true);
		cen.setUint16(12, time, true);
		cen.setUint16(14, date, true);
		cen.setUint32(16, crc, true);
		cen.setUint32(20, data.length, true);
		cen.setUint32(24, data.length, true);
		cen.setUint16(28, name.length, true);
		cen.setUint32(42, offset, true);
		central.push(new Uint8Array(cen.buffer), name);
		offset += 30 + name.length + data.length;
	}
	const size = central.reduce((a, b) => a + b.length, 0);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, files.length, true);
	end.setUint16(10, files.length, true);
	end.setUint32(12, size, true);
	end.setUint32(16, offset, true);
	return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

const BOM = '﻿';
const csv = (rows: unknown[][]) => BOM + toCsv(rows);

export function exportEverything() {
	const cs = studio.collabs;
	const brandName = (id: string) => studio.brands.find((b) => b.id === id)?.name ?? '';
	const files = [
		{
			name: 'collabs.csv',
			text: csv([
				['Code', 'Brand', 'Stage', 'Type', 'Content', 'Fee', 'Product', 'Product value', 'Received on', 'Go-live', 'Payment', 'Received', 'Paid on', 'Contact', 'Contact email', 'Contact phone'],
				...cs.map((c) => [c.code, c.brand.name, c.stage, c.type, delivText(c.deliverables), c.fee, c.product, c.product_value, c.received_on, c.live_date, c.pay_status, c.pay_received, c.paid_on, c.contact_name, c.contact_email, c.contact_phone])
			])
		},
		{
			name: 'brands.csv',
			text: csv([
				['Brand', 'Category', 'Instagram', 'Website', 'State', 'Accounts email', 'Collabs', 'Notes'],
				...studio.brands.map((b) => [b.name, b.category, b.instagram, (b as { website?: string }).website ?? '', b.state, b.accounts_email, cs.filter((c) => c.brand_id === b.id).length, studio.notes[b.id]?.notes ?? ''])
			])
		},
		{
			name: 'invoices.csv',
			text: csv([
				['Number', 'Collab', 'Brand', 'Kind', 'Status', 'Issued', 'Due', 'Subtotal', 'GST', 'Total', 'TDS', 'Payable', 'Received', 'TDS certificate received'],
				...cs.flatMap((c) =>
					(c.invoices ?? []).map((i) => [i.number, c.code, c.brand.name, i.kind, i.status, i.issue_date, i.due_date, i.subtotal, (i.cgst ?? 0) + (i.sgst ?? 0) + (i.igst ?? 0), i.total, i.tds_amount, i.payable, i.amount_received, i.tds_certificate ? 'yes' : 'no'])
				)
			])
		},
		{
			name: 'deliverables.csv',
			text: csv([['Collab', 'Brand', 'Kind', 'Quantity', 'Done'], ...cs.flatMap((c) => c.deliverables.map((d) => [c.code, c.brand.name, d.kind, d.qty, d.done ? 'yes' : 'no']))])
		},
		{
			name: 'messages.csv',
			text: csv([['Collab', 'Brand', 'From', 'When', 'Message'], ...cs.flatMap((c) => (c.messages ?? []).map((m) => [c.code, c.brand.name, m.sender === 'creator' ? 'You' : 'Brand', m.created_at, m.body]))])
		},
		{
			name: 'expenses.csv',
			text: csv([
				['Collab', 'Brand', 'What', 'Amount', 'Date'],
				...cs.flatMap((c) => ((c as unknown as { expenses?: { label?: string; note?: string; amount: number; spent_on?: string; created_at?: string }[] }).expenses ?? []).map((e) => [c.code, c.brand.name, e.label ?? e.note ?? '', e.amount, e.spent_on ?? e.created_at ?? '']))
			])
		},
		{
			name: 'history.csv',
			text: csv([['Collab', 'Brand', 'When', 'What'], ...cs.flatMap((c) => (c.events ?? []).map((e) => [c.code, c.brand.name, e.at, e.text]))])
		},
		{
			name: 'packages.csv',
			text: csv([['Package', 'Price', 'Active'], ...studio.packages.map((p) => [p.name, p.price, p.active ? 'yes' : 'no'])])
		},
		{
			name: 'everything.json',
			text: JSON.stringify({ exported_at: new Date().toISOString(), settings: studio.settings, brands: studio.brands, brand_notes: studio.notes, collabs: cs, packages: studio.packages, instagram: studio.ig, brand_name_by_id: Object.fromEntries(studio.brands.map((b) => [b.id, brandName(b.id)])) }, null, 2)
		},
		{
			name: 'READ ME.txt',
			text: 'Collab Desk export\r\n\r\nEach .csv opens in Excel or Google Sheets. everything.json is the complete copy of your data.\r\nUploaded draft videos and files stay in the app; open a collab to download them.\r\n'
		}
	];
	const blob = zip(files);
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = `collab-desk-export-${new Date().toISOString().slice(0, 10)}.zip`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 5000);
	return files.length;
}
