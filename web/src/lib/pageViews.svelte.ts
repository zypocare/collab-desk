// Who opened her page in the last 30 days, and from where (page_views, counted by the page worker).
import { supabase } from './supabase';

export type Source = { key: string; label: string; views: number };
export const pageViews = $state<{ rows: { day: string; source: string; views: number }[]; loaded: boolean }>({ rows: [], loaded: false });

export async function loadPageViews() {
	const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
	const { data } = await supabase.from('page_views').select('day, source, views').gte('day', since);
	pageViews.rows = (data ?? []) as typeof pageViews.rows;
	pageViews.loaded = true;
}

/** A visitor source in words: "instagram" → "Instagram", "direct" → "Shared link or typed". */
export function sourceLabel(src: string) {
	const s = src.toLowerCase().replace(/^www\.|^m\.|^l\.|^lm\./, '');
	if (s === 'direct') return 'Shared link or typed';
	if (s === 'qr') return 'QR code';
	if (/instagram|^ig$/.test(s)) return 'Instagram';
	if (/whatsapp|wa\.me/.test(s)) return 'WhatsApp';
	if (/google/.test(s)) return 'Google';
	if (/facebook|fb\.com/.test(s)) return 'Facebook';
	if (/youtube|youtu\.be/.test(s)) return 'YouTube';
	if (/linkedin/.test(s)) return 'LinkedIn';
	if (/(^|\.)miracleapp\.live$/.test(s)) return 'Miracle';
	if (/^(t\.co|twitter|x\.com)/.test(s)) return 'X';
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Totals, and the sources as words, biggest first, with the small ones together as "Other". */
export function summarise(rows: { source: string; views: number }[], top = 3) {
	const by = new Map<string, number>();
	for (const r of rows) {
		const label = sourceLabel(r.source);
		by.set(label, (by.get(label) ?? 0) + r.views);
	}
	const total = [...by.values()].reduce((a, n) => a + n, 0);
	const sorted = [...by.entries()].sort((a, b) => b[1] - a[1]);
	const head = sorted.slice(0, top).map(([label, views]) => ({ key: label, label, views }));
	const rest = sorted.slice(top).reduce((a, [, n]) => a + n, 0);
	return { total, sources: rest ? [...head, { key: 'other', label: 'Other', views: rest }] : head };
}
