// Trust scores. How a brand pays, across every creator on Miracle (creators see it on a request), and
// how a creator delivers (brands see it in Discover). Both are worked out by the database; nobody edits them.
import { supabase } from './supabase';

export type PayRecord = {
	invoices: number;
	on_time: number;
	by_bank: number;
	after_demand: number;
	late_now: number;
	creators: number;
	avg_days: number | null;
	gstin: string | null;
	profile_gstin: string | null;
	instagram: string | null;
};
export type CreatorTrust = { deals: number; posted: number; on_time: number; reply_hours: number | null };

export const trust = $state<{ brands: Record<string, PayRecord>; loaded: boolean; loading: boolean }>({ brands: {}, loaded: false, loading: false });

export async function loadBrandTrust(force = false) {
	if (trust.loading || (trust.loaded && !force)) return;
	trust.loading = true;
	const { data } = await supabase.rpc('brand_trust_all');
	trust.brands = (data as Record<string, PayRecord>) ?? {};
	trust.loaded = true;
	trust.loading = false;
}

// GSTIN: 2-digit state, PAN, entity number, Z, and a check character (the GSTN's base-36 checksum).
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function gstinValid(raw: string | null | undefined) {
	const g = (raw ?? '').trim().toUpperCase();
	if (!/^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
	let sum = 0;
	for (let i = 0; i < 14; i++) {
		const p = B36.indexOf(g[i]) * (i % 2 ? 2 : 1);
		sum += Math.floor(p / 36) + (p % 36);
	}
	return B36[(36 - (sum % 36)) % 36] === g[14];
}

export type Chip = { text: string; tone: 'ok' | 'warn' | 'bad' | 'info' };
/** The brand's chips and the line under them. */
export function brandChips(r: PayRecord | undefined, ownGstin: string | null | undefined) {
	const chips: Chip[] = [];
	const g = (ownGstin || r?.gstin || r?.profile_gstin || '').trim().toUpperCase();
	const fresh = !r || (r.invoices === 0 && r.late_now === 0);
	if (fresh) chips.push({ text: 'New on Miracle · no payments yet', tone: 'warn' });
	else if (r.avg_days !== null) {
		const ratio = r.invoices ? r.on_time / r.invoices : 0;
		const tone = r.avg_days > 45 || r.late_now > 1 ? 'bad' : r.avg_days <= 20 && ratio >= 0.7 && !r.late_now ? 'ok' : 'warn';
		chips.push({ text: `Pays in about ${r.avg_days} day${r.avg_days === 1 ? '' : 's'}`, tone });
	}
	const valid = g ? gstinValid(g) : false;
	// A missing GSTIN is normal for most brands she works with; only a wrong one is worth a chip.
	if (g && !valid) chips.push({ text: "GSTIN doesn't check out", tone: 'bad' });
	if (r?.instagram) chips.push({ text: 'Instagram verified', tone: 'info' });

	let line = '';
	if (fresh) line = 'Nothing wrong, just no history. Ask for an advance before you start.';
	else {
		const n = r.invoices;
		const parts = [];
		if (n) parts.push(`From ${n} invoice${n === 1 ? '' : 's'} paid to creators on Miracle in the last year${r.by_bank ? `, ${r.by_bank === n ? 'all' : r.by_bank} checked against bank alerts` : ''}. ${r.on_time} paid on time.`);
		if (r.after_demand) parts.push(`${r.after_demand} ${r.after_demand === 1 ? 'was' : 'were'} paid after a formal demand.`);
		if (r.late_now) parts.push(`${r.late_now} unpaid past the due date right now.`);
		line = parts.join(' ');
	}
	if (g) line += ` ${valid ? `Their GSTIN (${g}) checks out.` : `Their GSTIN (${g}) has a wrong check digit or format: ask them for it again.`}`;
	return { chips, line: line.trim(), fresh, risky: chips.some((c) => c.tone === 'bad') };
}

/** A short line for a phone card: "pays in ~9 days", "new brand" or ''. */
export function payHint(r: PayRecord | undefined) {
	if (!r) return '';
	if (r.invoices === 0 && r.late_now === 0) return 'new brand';
	return r.avg_days !== null ? `pays in ~${r.avg_days} days` : '';
}

/** A creator's badges for brands. */
export function creatorChips(t: CreatorTrust | null | undefined) {
	const chips: Chip[] = [];
	if (!t || (!t.deals && !t.posted)) return [{ text: 'New on Miracle', tone: 'info' as const }];
	if (t.deals) chips.push({ text: `✓ ${t.deals} verified deal${t.deals === 1 ? '' : 's'}`, tone: 'ok' });
	if (t.posted) chips.push({ text: `On time ${t.on_time} of ${t.posted}`, tone: t.on_time / t.posted >= 0.8 ? 'ok' : 'warn' });
	if (t.reply_hours !== null) {
		const h = t.reply_hours;
		chips.push({ text: `Replies in ${h < 1 ? 'under an hour' : h < 24 ? `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'}` : `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}`}`, tone: 'info' });
	}
	return chips;
}
