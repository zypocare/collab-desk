// Income from outside Miracle: YouTube/AdSense, affiliate payouts, platform bonuses, UGC and services.
// Logged by hand in Money, so her yearly totals, GST limit and TDS check include everything she earns.
import type { FY } from './reports';
import { supabase } from './supabase';
import { errMessage } from './util';

export type OtherIncome = { id: string; received_on: string; source: Source; payer: string; amount: number; tds: number; note: string };
export type Source = 'youtube' | 'affiliate' | 'platform' | 'ugc' | 'services' | 'other';
export const SOURCES: { value: Source; label: string; hint: string }[] = [
	{ value: 'youtube', label: 'YouTube / AdSense', hint: 'Google AdSense, YouTube memberships and Super Thanks' },
	{ value: 'affiliate', label: 'Affiliate', hint: 'Amazon, Myntra, Flipkart, a brand’s affiliate programme' },
	{ value: 'platform', label: 'Platform bonus', hint: 'Instagram bonuses, gifts, subscriptions' },
	{ value: 'ugc', label: 'UGC', hint: "Content made for a brand's own page or ads" },
	{ value: 'services', label: 'Services', hint: 'Consulting, workshops, events, shoots for others' },
	{ value: 'other', label: 'Other', hint: 'Anything else you earn from your work' }
];
export const sourceLabel = (s: Source) => SOURCES.find((x) => x.value === s)?.label ?? 'Other';

export const otherIncome = $state<{ rows: OtherIncome[]; loaded: boolean }>({ rows: [], loaded: false });

export async function loadOtherIncome() {
	const { data, error } = await supabase.from('other_income').select('id, received_on, source, payer, amount, tds, note').order('received_on', { ascending: false }).limit(2000);
	if (error) throw new Error(errMessage(error));
	otherIncome.rows = ((data as OtherIncome[]) ?? []).map((r) => ({ ...r, amount: Number(r.amount), tds: Number(r.tds) }));
	otherIncome.loaded = true;
}

export async function addOtherIncome(row: Omit<OtherIncome, 'id'>) {
	const { error } = await supabase.from('other_income').insert(row);
	if (error) throw new Error(errMessage(error));
	await loadOtherIncome();
}

export async function removeOtherIncome(id: string) {
	const { error } = await supabase.from('other_income').delete().eq('id', id);
	if (error) throw new Error(errMessage(error));
	otherIncome.rows = otherIncome.rows.filter((r) => r.id !== id);
}

/** A year's other income: the rows, the total and TDS, and how much from each source. */
export function otherInFy(rows: OtherIncome[], fy: FY) {
	const list = rows.filter((r) => r.received_on >= fy.from && r.received_on <= fy.to);
	const by = new Map<Source, number>();
	for (const r of list) by.set(r.source, (by.get(r.source) ?? 0) + r.amount);
	return {
		list,
		total: list.reduce((a, r) => a + r.amount, 0),
		tds: list.reduce((a, r) => a + r.tds, 0),
		bySource: [...by.entries()].map(([source, value]) => ({ source, label: sourceLabel(source), value })).sort((a, b) => b.value - a.value)
	};
}
