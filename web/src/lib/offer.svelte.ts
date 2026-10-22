// Check the offer: an AI reading of a brand's agreement, brief and messages against her rate card and
// usual terms. Each reading is kept with the collab (worker/index.ts › offerCheck does the reading).
import { askAi, shrinkImage } from './ai';
import { studio } from './studio.svelte';
import { supabase } from './supabase';
import type { Collab } from './types';
import { delivText, errMessage } from './util';

export type OfferFlag = { level: 'red' | 'amber'; title: string; quote: string; ask: string };
export type OfferTerms = { advance_pct: number | null; pay_days: number | null; usage: string | null; exclusivity_days: number | null; revision_rounds: number | null };
export type OfferResult = { score: number; headline: string; flags: OfferFlag[]; fine: { title: string; sub: string }[]; terms: OfferTerms; reply: string; read: { pages: number; chars: number } };
export type OfferSource = { name: string; kind: 'pdf' | 'photo' | 'text' | 'brief'; pages: number };
export type OfferCheck = { id: string; collab_id: string; created_at: string; source: OfferSource; result: OfferResult; sent_at: string | null };

export const offers = $state<{ byCollab: Record<string, OfferCheck | null>; running: boolean; error: string }>({ byCollab: {}, running: false, error: '' });

export async function loadOffer(collabId: string) {
	const { data } = await supabase.from('offer_checks').select('id, collab_id, created_at, source, result, sent_at').eq('collab_id', collabId).order('created_at', { ascending: false }).limit(1);
	offers.byCollab[collabId] = ((data ?? [])[0] as OfferCheck | undefined) ?? null;
	return offers.byCollab[collabId];
}

const MAX_PDF = 6 * 1024 * 1024;
function dataUrl(f: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(new Error("Couldn't open that file."));
		r.readAsDataURL(f);
	});
}

/** What she pasted or attached, read with the brief and the conversation so far. */
export async function checkOffer(c: Collab, input: { text: string; files: File[] }) {
	const s = studio.settings!;
	offers.running = true;
	offers.error = '';
	try {
		const pdf = input.files.find((f) => f.type === 'application/pdf');
		const imgs = input.files.filter((f) => f.type.startsWith('image/')).slice(0, 4);
		if (pdf && pdf.size > MAX_PDF) throw new Error('That PDF is over 6 MB. Send photos of its pages instead.');
		const { data: msgs } = await supabase.from('collab_messages').select('sender, body, created_at').eq('collab_id', c.id).order('created_at').limit(40);
		const b = c.brief_details ?? {};
		const brief = [c.brief, b.message && `Key message: ${b.message}`, b.dos && `Do: ${b.dos}`, b.donts && `Don't: ${b.donts}`, c.usage && `Usage asked: ${c.usage}`, c.preferred_live && `Go-live: ${c.preferred_live}`]
			.filter(Boolean)
			.join('\n');
		const rates = s.rates ?? {};
		const rateTotal = c.deliverables.reduce((a, d) => a + (rates[d.kind] ?? 0) * d.qty, 0);
		const res = await askAi<OfferResult>('offercheck', {
			text: input.text.trim(),
			file: pdf ? await dataUrl(pdf) : '',
			name: pdf?.name ?? '',
			photos: await Promise.all(imgs.map((f) => shrinkImage(f, 1600))),
			brief,
			messages: (msgs ?? []).map((m) => `${m.sender === 'brand' ? c.contact_name || c.brand.name : 'Me'}: ${m.body}`),
			brand: c.brand.name,
			contact: c.contact_name,
			deliverables: delivText(c.deliverables),
			fee: c.fee ?? 0,
			rate_total: rateTotal,
			usage_ext_pct: s.usage_ext_pct ?? 20,
			advance_pct: s.terms_advance_pct ?? 0,
			pay_days: s.terms_pay_days ?? 15,
			gst: !!s.gst_registered
		});
		const source: OfferSource = pdf
			? { name: pdf.name, kind: 'pdf', pages: res.read?.pages ?? 1 }
			: imgs.length
				? { name: `${imgs.length} photo${imgs.length === 1 ? '' : 's'}`, kind: 'photo', pages: imgs.length }
				: input.text.trim()
					? { name: 'Pasted text', kind: 'text', pages: 0 }
					: { name: 'Their brief and messages', kind: 'brief', pages: 0 };
		const { data, error } = await supabase.from('offer_checks').insert({ collab_id: c.id, source, result: res }).select('id, collab_id, created_at, source, result, sent_at').single();
		if (error) throw new Error(errMessage(error));
		offers.byCollab[c.id] = data as OfferCheck;
		return data as OfferCheck;
	} catch (e) {
		offers.error = e instanceof Error ? e.message : String(e);
		return null;
	} finally {
		offers.running = false;
	}
}

/** Her reply goes into the collab's messages (the brand gets it by email as usual). */
export async function sendOfferReply(c: Collab, check: OfferCheck, body: string) {
	const { error } = await supabase.from('collab_messages').insert({ collab_id: c.id, sender: 'creator', body: body.trim() });
	if (error) throw new Error(errMessage(error));
	const at = new Date().toISOString();
	await supabase.from('offer_checks').update({ sent_at: at }).eq('id', check.id);
	offers.byCollab[c.id] = { ...check, sent_at: at };
}
