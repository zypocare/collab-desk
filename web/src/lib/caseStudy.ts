// Case studies: a finished collab as a short story (goal, what was made, results) with the real numbers,
// drafted by AI, edited by the creator, published on her page once the brand approves it.
import { supabase } from './supabase';
import type { ReportData } from './types';
import { errMessage } from './util';

export type Highlight = { label: string; value: string };
export type CaseStudy = {
	id: string;
	collab_id: string;
	title: string;
	summary: string;
	goal: string;
	made: string;
	results: string;
	highlights: Highlight[];
	quote: string;
	quote_by: string;
	status: 'draft' | 'asked' | 'published' | 'declined';
	brand_note: string;
	asked_at: string | null;
	published_at: string | null;
};
/** As her page shows it. */
export type PublicCase = Pick<CaseStudy, 'id' | 'title' | 'summary' | 'goal' | 'made' | 'results' | 'highlights' | 'quote' | 'quote_by' | 'published_at'> & { brand: string; post: string | null };

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
	const { data, error } = await supabase.rpc(fn, args);
	if (error) throw new Error(errMessage(error));
	return data as T;
}
export const getCase = (collab: string) => call<CaseStudy | null>('case_study_get', { p_collab: collab });
export const saveCase = (collab: string, p: Partial<CaseStudy>) => call<CaseStudy>('case_study_save', { p_collab: collab, p });
export const askCase = (collab: string) => call<CaseStudy>('case_study_ask', { p_collab: collab });
export const deleteCase = (collab: string) => call<null>('case_study_delete', { p_collab: collab });
export const brandCase = (code: string) => call<CaseStudy | null>('brand_case_study', { p_code: code });
export const answerCase = (code: string, ok: boolean, note: string, quote: string, quoteBy: string) =>
	call<CaseStudy>('brand_case_study_answer', { p_code: code, p_ok: ok, p_note: note, p_quote: quote, p_quote_by: quoteBy });

const n = (v: number) => (v >= 1e7 ? `${+(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${+(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : String(Math.round(v)));
/** The numbers worth showing, straight from the results report (never typed by anyone). */
export function highlightsFrom(r: ReportData | null | undefined): Highlight[] {
	if (!r) return [];
	const t = r.totals;
	const out: Highlight[] = [];
	if (t.views) out.push({ label: 'Views', value: n(t.views) });
	if (t.reach) out.push({ label: 'People reached', value: n(t.reach) });
	if ((t.saves ?? 0) + (t.shares ?? 0) > 0) out.push({ label: 'Saves & shares', value: n((t.saves ?? 0) + (t.shares ?? 0)) });
	if (r.engagement_rate) out.push({ label: 'Engagement', value: `${r.engagement_rate}%` });
	if (r.link?.clicks) out.push({ label: 'Link taps', value: n(r.link.clicks) });
	if (r.link?.sales) out.push({ label: 'Orders', value: n(r.link.sales) });
	return out.slice(0, 4);
}
