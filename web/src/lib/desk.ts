// "Search by meaning" for Ask your desk, and her own writing style for drafted replies.
// The database keeps a chunk for every message, linked Instagram DM, brand email, brief and brand
// note (never her personal DMs). This fills in the meaning fingerprints for new chunks (free AI on
// Cloudflare) and finds the chunks closest to a question.
import { askAi } from './ai';
import { supabase } from './supabase';
import { studio } from './studio.svelte';

let indexing: Promise<void> | null = null;
/** Fingerprint chunks that don't have one yet (a few batches at a time; the rest next time). */
export function indexDesk(maxBatches = 6) {
	indexing ??= (async () => {
		try {
			for (let i = 0; i < maxBatches; i++) {
				const { data } = await supabase.from('desk_chunks').select('id, body').is('embedding', null).order('id', { ascending: false }).limit(24);
				const rows = (data ?? []) as { id: number; body: string }[];
				if (!rows.length) return;
				const { vectors } = await askAi<{ vectors: number[][] }>('embed', { texts: rows.map((r) => r.body) });
				if (vectors.length !== rows.length) return;
				await supabase.rpc('desk_embed_save', { p_rows: rows.map((r, k) => ({ id: r.id, v: vectors[k] })) });
				if (rows.length < 24) return;
			}
		} catch {
			/* offline or AI used up: next time */
		} finally {
			indexing = null;
		}
	})();
	return indexing;
}

export type Source = { kind: string; brand: string; code: string; date: string; text: string; score: number };
const KIND: Record<string, string> = { message: 'Message', ig: 'Instagram', email: 'Email', brief: 'Brief', note: 'Your note' };

/** The messages, emails, briefs and notes closest in meaning to the question (best first). */
export async function searchDesk(question: string, k = 6): Promise<Source[]> {
	try {
		const { vectors } = await askAi<{ vectors: number[][] }>('embed', { texts: [question.slice(0, 600)] });
		if (!vectors[0]?.length) return [];
		const { data } = await supabase.rpc('desk_search', { p_query: JSON.stringify(vectors[0]), p_k: k });
		return ((data ?? []) as { source: string; code: string | null; brand: string | null; body: string; at: string; score: number }[])
			.filter((r) => r.score > 0.35)
			.map((r) => ({
				kind: KIND[r.source] ?? 'Note',
				brand: r.brand ?? '',
				code: r.code ?? '',
				date: new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
				text: r.body.slice(0, 500),
				score: r.score
			}));
	} catch {
		return [];
	}
}

/** A dozen of her own sent messages, with names, amounts and contact details taken out (style only). */
export function styleSamples(): string[] {
	const brands = studio.brands.map((b) => b.name).filter((n) => n.length > 2);
	const all = studio.collabs.flatMap((c) => (c.messages ?? []).filter((m) => m.sender === 'creator' && (m.body ?? '').length > 25).map((m) => ({ at: m.created_at, body: m.body })));
	return all
		.sort((a, b) => b.at.localeCompare(a.at))
		.slice(0, 12)
		.map((m) => {
			let t = m.body.replace(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '[email]').replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[phone]').replace(/(?:₹|rs\.?\s?)\s*[\d,.]+\s*k?|\b\d[\d,.]*\s*k\b/gi, '[amount]').replace(/https?:\/\/\S+/g, '[link]');
			for (const b of brands) t = t.split(b).join('[brand]');
			return t.slice(0, 300);
		});
}
