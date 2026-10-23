// The free AI (runs on the site's own Cloudflare server, see worker/index.ts). Signed-in creators; the brand* kinds for brands.
import { supabase } from './supabase';
import type { Parsed } from './parseDm';

export async function askAi<T>(kind: 'dm' | 'reply' | 'caption' | 'pitch' | 'fit' | 'status' | 'summary' | 'negotiate' | 'script' | 'nudge' | 'ask' | 'voice' | 'embed' | 'reelcheck' | 'growplan' | 'checkup' | 'offercheck' | 'precheck' | 'getfound' | 'brandask' | 'brandbrief', body: Record<string, unknown>): Promise<T> {
	const { data } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	if (!token) throw new Error('Sign in again to use AI.');
	if (!navigator.onLine) throw new Error("AI needs a connection. Try again when you're online.");
	let r: Response;
	try {
		r = await fetch(`/api/ai/${kind}`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	} catch {
		throw new Error("Couldn't reach the AI. Try again.");
	}
	if (r.status === 404 || (r.headers.get('content-type') ?? '').includes('text/html')) throw new Error('AI works on the live app.');
	const j = (await r.json().catch(() => ({}))) as T & { error?: string };
	if (!r.ok || j.error) throw new Error(j.error || "The AI couldn't answer. Try again.");
	return j;
}

/** A photo or screenshot made small enough to send (long side 1280px, JPEG). */
export function shrinkImage(file: File, max = 1280): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const k = Math.min(1, max / Math.max(img.width, img.height));
			const c = document.createElement('canvas');
			c.width = Math.round(img.width * k);
			c.height = Math.round(img.height * k);
			c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
			URL.revokeObjectURL(img.src);
			resolve(c.toDataURL('image/jpeg', 0.82));
		};
		img.onerror = () => reject(new Error("Couldn't open that image."));
		img.src = URL.createObjectURL(file);
	});
}

export type DmFields = {
	brand?: string; instagram?: string; contact?: string; email?: string; phone?: string; type?: string | null; fee?: number;
	product?: string; product_value?: number; deliverables?: { kind: string; qty: number }[]; preferred_live?: string; usage?: string; summary?: string;
};
const KINDS = ['Reel', 'Story', 'Static post', 'Carousel', 'UGC video', 'Shoot'];

/** What the AI read, in the same shape as the pattern-based reader (AI wins where it found something). */
export function mergeDm(base: Parsed | null, f: DmFields | null): Parsed | null {
	if (!f) return base;
	const b: Parsed = base ?? { brand: '', instagram: '', email: '', phone: '', contact: '', type: null, fee: 0, product: '', productValue: 0, deliverables: [], preferredLive: '', usage: '', brief: '' };
	const type = f.type === 'paid' || f.type === 'hybrid' || f.type === 'barter' ? f.type : null;
	const deliv = (f.deliverables ?? []).filter((d) => KINDS.includes(d.kind) && Number(d.qty) > 0).map((d) => ({ kind: d.kind, qty: Math.round(Number(d.qty)) }));
	return {
		brand: f.brand?.trim() || b.brand,
		instagram: (f.instagram ?? '').replace(/^@/, '').trim() || b.instagram,
		email: f.email?.trim() || b.email,
		phone: f.phone?.trim() || b.phone,
		contact: f.contact?.trim() || b.contact,
		type: type ?? b.type,
		fee: Number(f.fee) > 0 ? Number(f.fee) : b.fee,
		product: f.product?.trim() || b.product,
		productValue: Number(f.product_value) > 0 ? Number(f.product_value) : b.productValue,
		deliverables: deliv.length ? deliv : b.deliverables,
		preferredLive: /^\d{4}-\d{2}-\d{2}$/.test(f.preferred_live ?? '') ? f.preferred_live! : b.preferredLive,
		usage: f.usage?.trim() || b.usage,
		brief: b.brief || f.summary || ''
	};
}

/** What the AI may say about a collab when drafting replies or captions (facts only). */
export function collabFacts(c: import('./types').Collab, s: import('./types').Settings | null) {
	return {
		creator: s?.display_name, handle: s?.handle, niche: s?.niche, reply_time: s?.reply_time,
		brand: c.brand.name, brand_instagram: c.brand.instagram, contact: c.contact_name, stage: c.stage, type: c.type,
		deliverables: c.deliverables.map((d) => `${d.qty} ${d.kind}`).join(', '), fee: c.type === 'barter' ? 0 : c.fee,
		product: c.product, go_live: c.live_date ?? c.preferred_live, usage: c.usage,
		rate_card: s?.rates, promo_code: c.links?.[0]?.promo_code || undefined
	};
}
