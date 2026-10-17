// Reads a pasted DM or email and picks out what a collab needs. Plain pattern matching (no AI):
// it gets the common phrasings right and leaves the rest for her to fill in.
import type { CollabType } from './types';

export type Parsed = {
	brand: string;
	instagram: string;
	email: string;
	phone: string;
	contact: string;
	type: CollabType | null;
	fee: number;
	product: string;
	productValue: number;
	deliverables: { kind: string; qty: number }[];
	preferredLive: string;
	usage: string;
	brief: string;
};

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2 };
const KIND_PATTERNS: [RegExp, string][] = [
	[/reels?\b/i, 'Reel'],
	[/stor(?:y|ies)\b/i, 'Story'],
	[/carousels?\b/i, 'Carousel'],
	[/ugc(?:\s*videos?)?\b/i, 'UGC video'],
	// "Create a video" for an Instagram creator means a Reel (not a video call).
	[/(?<!ugc\s{0,3})videos?\b(?!\s*call)/i, 'Reel'],
	[/(?:static\s*)?(?:feed\s*)?posts?\b/i, 'Static post']
];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "15k" -> 15000, "1.5 lakh" -> 150000, "25,000" -> 25000 */
function money(num: string, unit?: string) {
	const n = Number(num.replace(/,/g, ''));
	if (!isFinite(n)) return 0;
	const u = (unit ?? '').toLowerCase();
	return Math.round(u === 'k' ? n * 1e3 : u.startsWith('l') ? n * 1e5 : n);
}

const titleCase = (s: string) => s.replace(/[._]+/g, ' ').replace(/\b(official|india|in|store|shop|co)\b/gi, '').trim().replace(/\s+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function parseDm(text: string, ownHandle = ''): Parsed {
	const t = text.replace(/ /g, ' ');
	const lower = t.toLowerCase();
	const own = ownHandle.toLowerCase().replace(/^@/, '');

	// Contact details.
	const email = t.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/)?.[0] ?? '';
	const phone = (t.match(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/)?.[0] ?? '').replace(/[\s-]/g, '');
	const handles = [...t.matchAll(/(?<![\w.])@([a-z0-9._]{2,30})/gi)].map((m) => m[1].replace(/\.$/, '')).filter((h) => h.toLowerCase() !== own && !email.includes(h));
	const instagram = handles[0] ?? '';

	// Brand name: "from Lumière Skin", "team at X", "I'm Asha, X's marketing" -> else from the handle or email domain.
	// Words may have accents (Lumière) and dots inside (wick.and), but a full stop ends the name.
	const named = (
		t.match(/(?:\bfrom|\bat|\bteam|\bbehalf of|\bwith)\s+(?:the\s+)?(\p{Lu}[\p{L}\p{N}&'’-]*(?:\.(?=\p{L})[\p{L}\p{N}]*)*(?:\s+(?:&\s+)?\p{Lu}[\p{L}\p{N}&'’-]*(?:\.(?=\p{L})[\p{L}\p{N}]*)*){0,3})/u)?.[1] ??
		t.match(/(\p{Lu}[\p{L}\p{N}&'’-]*(?:\s+\p{Lu}[\p{L}\p{N}&'’-]*){0,2})(?:'s|’s)\s+(?:marketing|brand|team|founder)/u)?.[1] ??
		''
	).replace(/[.\s]+$/, '');
	const domain = email.split('@')[1]?.split('.')[0] ?? '';
	const brand = (named && !/^(Instagram|India|Hi|Hello|Dear|Team)$/i.test(named) ? named.trim() : '') || (instagram ? titleCase(instagram) : '') || (domain && !/gmail|yahoo|outlook|hotmail|icloud/i.test(domain) ? titleCase(domain) : '');
	// A capitalised name after "I'm" / "this is", or on the line after the sign-off.
	const contact = (
		t.match(/(?:\b[Ii]\s?am|\bI['’]m|\b[Tt]his is|\b[Mm]y name is|\b[Ii]t['’]s)\s+(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)?)/u)?.[1] ??
		t.match(/(?:[Rr]egards|[Tt]hanks|[Cc]heers|[Bb]est|[Ww]arm wishes)[,!\s]*\n\s*(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)?)/u)?.[1] ??
		''
	).trim();

	// Deliverables: "2 reels", "one story", "a carousel", "3x stories".
	const found = new Map<string, number>();
	for (const m of t.matchAll(/\b(\d{1,2}|a|an|one|two|three|four|five|six|couple)\s*(?:x\s*)?(?:of\s+)?(?:instagram\s+|ig\s+|insta\s+)?(reels?|stor(?:y|ies)|carousels?|ugc(?:\s*videos?)?|videos?(?!\s*call)|(?:static\s*)?(?:feed\s*)?posts?)\b/gi)) {
		const n = /^\d+$/.test(m[1]) ? Number(m[1]) : (WORDS[m[1].toLowerCase()] ?? 1);
		const kind = KIND_PATTERNS.find(([re]) => re.test(m[2]))?.[1];
		if (kind && n > 0) found.set(kind, (found.get(kind) ?? 0) + Math.min(n, 20));
	}
	// Mentioned without a number ("a reel and stories") counts as one.
	if (!found.size) for (const [re, kind] of KIND_PATTERNS) if (re.test(lower) && kind !== 'Static post') found.set(kind, 1);
	const deliverables = [...found].map(([kind, qty]) => ({ kind, qty }));

	// Money: budget vs product value.
	const productValue = (() => {
		const m = t.match(/(?:worth|valued? at|value of|mrp)\s*(?:of\s*)?(?:₹|rs\.?|inr)?\s*([\d,.]+)\s*(k|l|lakhs?)?\b/i);
		return m ? money(m[1], m[2]) : 0;
	})();
	const fee = (() => {
		const re = /(?:budget|pay|paying|offer(?:ing)?|fee|compensation|for)\D{0,20}?(?:₹|rs\.?|inr)\s*([\d,.]+)\s*(k|l|lakhs?)?\b|(?:₹|rs\.?|inr)\s*([\d,.]+)\s*(k|l|lakhs?)?\b|\b([\d,.]+)\s*(k|l|lakhs?)\b(?!\s*(?:followers|views))/gi;
		for (const m of t.matchAll(re)) {
			const v = money(m[1] ?? m[3] ?? m[5], m[2] ?? m[4] ?? m[6]);
			if (v >= 500 && v !== productValue) return v;
		}
		return 0;
	})();

	// Barter or paid.
	// "Gift" only when they're gifting it to her, not a product name like "Diwali gift box".
	const barterish = /\b(barter|gifted|gifting|gift (?:you|it)|as a gift|pr (?:package|box|kit)|in (?:exchange|return)|complimentary|free (?:product|stay|meal)|send you (?:our|the|a|some)|vouchers?|gift cards?|store credit|hampers?)\b/i.test(t);
	const type: CollabType | null = barterish ? (fee ? 'hybrid' : 'barter') : fee ? 'paid' : null;
	// What she gets: "in return we will be gifting you shopping vouchers", "send you our new serum".
	// Not what they ask her for ("share the screenshot of your insights", "your contact number").
	const GIVE = '(?:gift(?:ing)?|send(?:ing)?|offer(?:ing)?|provid(?:e|ing)|giv(?:e|ing)|shar(?:e|ing) with)';
	const ASKED = /\b(screenshots?|insights?|profile|details|contact|number|rates?|rate card|media kit|portfolio|analytics|demographics?|name|address|availability|quote)\b/i;
	const product = barterish
		? ([
				new RegExp(`in (?:return|exchange)[^.\\n]{0,50}?\\b(?:we(?:'ll|’ll| will| would| shall)?(?: be)?|you(?:'ll|’ll| will| would) (?:get|receive))\\s+(?:${GIVE}\\s+)?(?:you\\s+)?(?:with\\s+)?(?:our|the|a|an|some)?\\s*([^.,\\n!?]{3,60})`, 'i'),
				new RegExp(`\\b${GIVE}\\s+you\\s+(?:with\\s+)?(?:our|the|a|an|some)?\\s*([^.,\\n!?]{3,60})`, 'i'),
				/(?:our|the)\s+(?:new\s+)?([a-z][\w\s-]{2,40}?\s+(?:launch|range|collection))/i
			]
				.map((re) => (t.match(re)?.[1] ?? '').replace(/\s+(?:as (?:a )?gift|in (?:exchange|return)|for (?:a|an|you|your|the|creating|making)|to (?:try|review|use)|which|that|who|worth|valued?|mrp|on our|from our|plus|along with|and (?:₹|rs\.?|inr|\d))\b.*$/i, '').trim())
				.find((p) => p && !ASKED.test(p)) ?? ''
			).replace(/^\w/, (c) => c.toUpperCase())
		: '';

	// Date: "by 25th Oct", "on 3 November", "before 10/11".
	let preferredLive = '';
	const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i) ?? t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
	if (dm) {
		const day = Number(/\d/.test(dm[1]) ? dm[1] : dm[2]);
		const mon = MONTHS.indexOf((/\d/.test(dm[1]) ? dm[2] : dm[1]).slice(0, 3).toLowerCase());
		const now = new Date();
		const d = new Date(now.getFullYear(), mon, day);
		if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d.setFullYear(d.getFullYear() + 1);
		if (day >= 1 && day <= 31 && mon >= 0) preferredLive = iso(d);
	}

	// Usage.
	const days = t.match(/(\d{2,3})\s*days?\s*(?:of\s*)?(?:paid|ads?|usage|whitelist)/i)?.[1] ?? t.match(/(?:paid|ads?|usage|whitelist)\D{0,20}(\d{2,3})\s*days?/i)?.[1];
	const usage = days ? `${[30, 60, 90].reduce((a, b) => (Math.abs(b - Number(days)) < Math.abs(a - Number(days)) ? b : a))} days paid ads` : /\b(paid ads?|whitelist|boost|usage rights)\b/i.test(t) ? '30 days paid ads' : '';

	return { brand, instagram, email, phone, contact, type, fee, product, productValue, deliverables, preferredLive, usage, brief: t.trim().slice(0, 4000) };
}
