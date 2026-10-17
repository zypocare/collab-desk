// "Should I take it?": scores a request from facts. Six factors, each 0-10 and weighted:
// money (the offer against a fair price for the whole job), travel from home, dress and makeup,
// time and calendar, brand fit, and terms. The AI only reads the request (store visit? where?
// what look?); every number here is worked out from her own settings, so the score is
// explainable and changes as soon as she edits the fee, deliverables or her rates.
import { DEFAULT_HOURS } from './content';
import { barterSlotsUsed, rateValue } from './priority';
import type { BrandPrivate, Collab, Settings } from './types';
import { diff, fmt, inr, overdue } from './util';

export type FitAi = {
	visit?: boolean;
	location?: string;
	visit_hours?: number;
	outfit?: string;
	outfit_note?: string;
	makeup?: string;
	makeup_note?: string;
	looks?: number;
	category?: string;
	fit?: number;
	fit_note?: string;
	exclusivity?: string;
	payment_terms?: string;
	red_flags?: string[];
	good_signs?: string[];
	questions?: string[];
	summary?: string;
};
export type FitTravel = { place: string; approx?: boolean; lat: number; lng: number; km?: number; drive_min?: number; routed?: boolean };
export type FitData = { ai: FitAi; travel: FitTravel | null; read_at: string };

export type Tone = 'good' | 'ok' | 'bad';
export type Factor = { key: string; label: string; icon: string; weight: number; score: number; tone: Tone; headline: string; facts: string[] };
export type MoneyLine = { label: string; amount: number; note?: string };
export type Verdict = 'take' | 'negotiate' | 'pass';
export type Decision = {
	score: number;
	verdict: Verdict;
	label: string;
	line: string;
	factors: Factor[];
	money: { rate: number; lines: MoneyLine[]; fair: number; offer: number; offerNote: string; ratio: number | null; open: boolean; unknown: boolean; netHourly: number | null; usualHourly: number | null };
	travel: { oneWay: number; peak: number; km: number; place: string; approx: boolean; mapUrl: string } | null;
	hours: { content: number; styling: number; travel: number; visit: number; total: number };
	flags: string[];
	good: string[];
	questions: string[];
	counterFee: number | null;
	read: boolean;
	summary: string;
};

export const VERDICT_LABEL: Record<Verdict, string> = { take: 'Take it', negotiate: 'Negotiate first', pass: 'Probably pass' };
const WEIGHTS = { money: 35, travel: 15, styling: 10, time: 15, brand: 15, terms: 10 };
const MODE_LABEL: Record<Settings['travel_mode'], string> = { car: 'car', bike: 'scooter', cab: 'cab', public: 'metro or bus' };
// Running cost per km for each way of travelling (fuel, fares).
const PER_KM: Record<Settings['travel_mode'], number> = { car: 12, bike: 4, cab: 20, public: 3 };

const clamp = (n: number) => Math.max(0, Math.min(10, n));
const r500 = (n: number) => Math.ceil(n / 500) * 500;
const tone = (s: number): Tone => (s >= 7 ? 'good' : s >= 4.5 ? 'ok' : 'bad');
export const hrs = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h * 2) / 2} h`);

/** Door-to-door minutes one way in city traffic (map routes assume empty roads). */
function cityMinutes(mode: Settings['travel_mode'], km: number, driveMin: number) {
	const car = Math.max(driveMin * 2, (km / 16) * 60);
	const m = mode === 'bike' ? car * 0.75 : mode === 'public' ? (km / 14) * 60 + 15 : mode === 'cab' ? car + 8 : car;
	return Math.max(5, Math.round(m / 5) * 5);
}

/** How much of what she receives counts like cash: vouchers almost, products less (they don't pay bills). */
const receivedShare = (product: string) => (/voucher|gift card|store credit|cash/i.test(product) ? 0.7 : 0.4);

export function decide(c: Collab, s: Settings, all: Collab[], notes?: BrandPrivate, fit?: FitData): Decision {
	const ai = fit?.ai ?? {};
	const read = !!fit;
	const flags: string[] = [...(ai.red_flags ?? [])].filter(Boolean).slice(0, 5);
	const good: string[] = [...(ai.good_signs ?? [])].filter(Boolean).slice(0, 5);
	const questions: string[] = [...(ai.questions ?? [])].filter(Boolean).slice(0, 4);
	const ask = (q: string, same: RegExp) => !questions.some((x) => same.test(x)) && questions.push(q);

	// ---- Hours ----
	const per: Record<string, number> = { ...DEFAULT_HOURS, ...(s.piece_hours ?? {}) };
	const content = c.deliverables.reduce((a, d) => a + (per[d.kind] ?? 3) * d.qty, 0);
	const looks = Math.max(1, Math.min(6, Math.round(Number(ai.looks) || 1)));
	const makeup = String(ai.makeup ?? '');
	const outfit = String(ai.outfit ?? '');
	const styling = (makeup === 'professional' ? 1.5 : makeup === 'glam' ? 1 : makeup === 'natural' ? 0.3 : 0) + (outfit === 'specific' ? 0.5 * looks : 0);
	const visitH = ai.visit ? Math.max(0.5, Number(ai.visit_hours) || 1.5) : 0;

	// ---- Travel ----
	const t = fit?.travel;
	let travel: Decision['travel'] = null;
	if (ai.visit && t?.km != null && t.drive_min != null) {
		const oneWay = cityMinutes(s.travel_mode, t.km, t.drive_min);
		travel = {
			oneWay,
			peak: Math.round((oneWay * 1.4) / 5) * 5,
			km: t.km,
			place: t.place,
			approx: !!t.approx,
			mapUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(s.home_area)}&destination=${t.lat},${t.lng}&travelmode=${s.travel_mode === 'public' ? 'transit' : s.travel_mode === 'bike' ? 'two-wheeler' : 'driving'}`
		};
	}
	const travelH = travel ? (2 * travel.oneWay) / 60 : 0;
	const total = content + styling + travelH + visitH;

	// ---- Money ----
	const rate = rateValue(c.deliverables, s.rates);
	const reelRate = Number(s.rates?.Reel) || 0;
	const usualHourly = reelRate && per.Reel ? reelRate / per.Reel : rate && content ? rate / content : null;
	const lines: MoneyLine[] = [];
	if (rate) lines.push({ label: `Your rate card for ${c.deliverables.map((d) => `${d.qty} ${d.kind}`).join(' + ') || 'this'}`, amount: rate });
	const travelCost = travel ? Math.round((2 * travel.km * PER_KM[s.travel_mode]) / 10) * 10 + (s.travel_mode === 'cab' ? 100 : 0) : 0;
	if (travelCost) lines.push({ label: `Travel, ${Math.round(travel!.km * 2)} km by ${MODE_LABEL[s.travel_mode]}`, amount: travelCost });
	const makeupCost = makeup === 'professional' ? s.makeup_cost || 2500 : makeup === 'glam' && s.makeup_cost ? Math.round(s.makeup_cost / 2) : 0;
	if (makeupCost) lines.push({ label: makeup === 'professional' ? 'Professional makeup and hair' : 'Glam makeup (products, touch-ups)', amount: makeupCost, note: s.makeup_cost ? undefined : 'typical cost; set yours in My page' });
	const outfitCost = outfit === 'specific' ? (s.outfit_cost || 2000) * Math.min(3, looks) : 0;
	if (outfitCost) lines.push({ label: looks > 1 ? `${Math.min(3, looks)} outfits for the looks they want` : 'An outfit for the look they want', amount: outfitCost, note: s.outfit_cost ? undefined : 'typical cost; set yours in My page' });
	const timeValue = usualHourly && travelH + visitH ? Math.round(((travelH + visitH) * usualHourly * 0.5) / 100) * 100 : 0;
	if (timeValue) lines.push({ label: `Time on the road and there (${hrs(travelH + visitH)}, at half your usual hourly)`, amount: timeValue });
	const cash = travelCost + makeupCost + outfitCost;
	const fair = rate || cash ? r500(rate + cash + timeValue) : 0;

	const share = receivedShare(c.product);
	const productWorth = c.type === 'paid' ? 0 : Math.round(c.product_value * share);
	const offer = (c.type === 'barter' ? 0 : c.fee) + productWorth;
	const open = c.type !== 'barter' && !c.fee;
	// Barter or paid + product without a value: what they offer isn't known yet.
	const unknown = c.type !== 'paid' && !c.product_value;
	const thing = /voucher/i.test(c.product) ? 'vouchers' : /gift card/i.test(c.product) ? 'gift cards' : 'products';
	const ratio = !open && !unknown && fair ? offer / fair : null;
	const offerNote = [
		c.type !== 'barter' && c.fee ? `${inr(c.fee)} fee` : '',
		c.type !== 'paid' ? (c.product_value ? `${c.product || 'product'} worth ${inr(c.product_value)} (counts as ${inr(productWorth)})` : `${c.product || 'product'} (value not given)`) : ''
	].filter(Boolean).join(' + ');
	const netHourly = !open && !unknown && total ? Math.round((offer - cash) / total) : null;

	let money: number;
	const mFacts: string[] = [];
	let mHead: string;
	if (open) {
		money = 6;
		mHead = 'Budget open: you set the price';
		if (fair) mFacts.push(`Quote at least ${inr(fair)} for the whole job.`);
	} else if (!fair) {
		money = 5;
		mHead = offer ? `Offer worth about ${inr(offer)}` : 'No rate card to compare with';
		mFacts.push('Add your rate card in My page > Rates to compare offers.');
	} else if (unknown) {
		money = c.fee ? 5 : 3;
		mHead = `Value of the ${thing} not given; the job is worth ${inr(fair)}`;
		ask(`What are the ${thing} worth?`, /worth|value/i);
	} else {
		const r = ratio!;
		money = r >= 1 ? 10 : r >= 0.85 ? 8 : r >= 0.7 ? 6.5 : r >= 0.5 ? 4.5 : r >= 0.3 ? 3 : 1.5;
		mHead = r >= 1 ? `Offer covers your fair price of ${inr(fair)}` : `Offer is ${Math.round(r * 100)}% of a fair ${inr(fair)}`;
	}
	if (offerNote) mFacts.unshift(`They offer ${offerNote}.`);
	if (netHourly !== null && usualHourly) mFacts.push(`About ${inr(Math.max(0, netHourly))} an hour after costs (you usually earn ${inr(usualHourly)}).`);

	const counter = fair ? r500(fair - productWorth) : 0;
	const counterFee = (open || (ratio !== null && ratio < 0.95)) && counter > 0 ? counter : null;

	// ---- Factors ----
	const factors: Factor[] = [];
	factors.push({ key: 'money', label: 'Money', icon: 'rupee', weight: WEIGHTS.money, score: money, tone: tone(money), headline: mHead, facts: mFacts });

	// Travel
	let tr: number, trHead: string;
	const trFacts: string[] = [];
	if (!read) {
		tr = 7;
		trHead = 'Not read yet';
	} else if (!ai.visit) {
		tr = 10;
		trHead = 'No travel';
		trFacts.push('You can create this from home.');
	} else if (!s.home_area) {
		tr = 5;
		trHead = `Visit to ${ai.location || 'their place'}`;
		trFacts.push('Add your home area in My page > Bookings to see the travel time.');
	} else if (!travel) {
		tr = 5;
		trHead = ai.location ? `Visit to ${ai.location}` : 'Location not clear';
		trFacts.push(ai.location ? "Couldn't find it on the map." : 'They want a visit but the address is missing.');
		ask('What is the exact address, and which day and time?', /address|where/i);
	} else {
		const max = s.travel_max_min || 60;
		const q = travel.oneWay / max;
		tr = q <= 0.34 ? 10 : q <= 0.67 ? 8 : q <= 1 ? 6 : q <= 1.5 ? 3 : 1;
		trHead = `${travel.oneWay} min each way`;
		trFacts.push(`${travel.km} km from ${s.home_area} to ${travel.approx ? `${travel.place} (the area; the exact shop isn't on the map)` : travel.place}.`);
		trFacts.push(`About ${travel.oneWay} min by ${MODE_LABEL[s.travel_mode]}, up to ${travel.peak} min at peak hours.`);
		trFacts.push(`Round trip ${hrs(travelH)}, plus about ${hrs(visitH)} there.`);
		if (travel.oneWay > max) trFacts.push(`Longer than the ${max} min you're happy with.`);
	}
	factors.push({ key: 'travel', label: 'Travel', icon: 'pin', weight: WEIGHTS.travel, score: tr, tone: tone(tr), headline: trHead, facts: trFacts });

	// Dress & makeup
	let st = read ? 10 : 7;
	const stFacts: string[] = [];
	if (makeup === 'professional') st -= 4;
	else if (makeup === 'glam') st -= 2;
	else if (makeup === 'natural') st -= 0.5;
	if (outfit === 'specific') st -= Math.min(5, 2 + (looks - 1));
	const MU: Record<string, string> = { none: 'No makeup needed', natural: 'Natural, everyday makeup', glam: 'Glam makeup', professional: 'Professional makeup and hair', provided: 'They provide makeup and hair' };
	const OF: Record<string, string> = { none: 'No outfit needed', own: 'Your own clothes', specific: 'A specific look they want', provided: 'They provide the outfit' };
	if (outfit) stFacts.push(`${OF[outfit] ?? outfit}${ai.outfit_note ? `: ${ai.outfit_note}` : ''}${looks > 1 ? ` (${looks} looks)` : ''}.`);
	if (makeup) stFacts.push(`${MU[makeup] ?? makeup}${ai.makeup_note ? `: ${ai.makeup_note}` : ''}.`);
	if (styling) stFacts.push(`Getting ready: about ${hrs(styling)}.`);
	if (makeupCost + outfitCost) stFacts.push(`Costs you about ${inr(makeupCost + outfitCost)}.`);
	if (makeup === 'provided' || outfit === 'provided') good.push('They provide styling');
	st = clamp(st);
	const stHead = !read ? 'Not read yet' : st >= 9 ? 'Easy: no special look' : makeup === 'professional' || outfit === 'specific' ? 'A styled look is needed' : 'Some styling';
	factors.push({ key: 'styling', label: 'Dress & makeup', icon: 'spark', weight: WEIGHTS.styling, score: st, tone: tone(st), headline: stHead, facts: stFacts });

	// Time & calendar
	let tm = total <= 4 ? 10 : total <= 7 ? 8 : total <= 10 ? 6.5 : total <= 15 ? 5 : total <= 24 ? 3 : 2;
	const tmFacts: string[] = [`About ${hrs(total)} in all: ${[`${hrs(content)} creating`, styling ? `${hrs(styling)} getting ready` : '', travelH ? `${hrs(travelH)} travelling` : '', visitH ? `${hrs(visitH)} there` : ''].filter(Boolean).join(', ')}.`];
	const when = c.preferred_live;
	if (when) {
		const d = diff(when);
		const wk = mondayIso(when);
		if ((s.away_weeks ?? []).includes(wk)) {
			tm -= 4;
			tmFacts.push(`They want it live ${fmt(when)}, a week you marked away.`);
		}
		const load = all.filter((x) => x.id !== c.id && ['confirmed', 'creating', 'live'].includes(x.stage) && mondayIso(x.live_date ?? x.draft_date ?? x.preferred_live) === wk).length;
		const cap = s.weekly_capacity ?? 3;
		if (load >= cap) {
			tm -= 3;
			tmFacts.push(`That week already has ${load} collab${load === 1 ? '' : 's'} (your limit is ${cap}).`);
		} else if (load) tmFacts.push(`That week has ${load} other collab${load === 1 ? '' : 's'}.`);
		const need = content > 6 || ai.visit ? 7 : 4;
		if (d < 0) tmFacts.push(`Their date (${fmt(when)}) has passed: agree a new one.`);
		else if (d < need) {
			tm -= 2;
			tmFacts.push(`Only ${d} day${d === 1 ? '' : 's'} until they want it live (${fmt(when)}).`);
		} else tmFacts.push(`Live by ${fmt(when)}: ${d} days away.`);
	} else ask('When do you want it to go live?', /go live|when|date|deadline/i);
	tm = clamp(tm);
	factors.push({ key: 'time', label: 'Time & calendar', icon: 'cal', weight: WEIGHTS.time, score: tm, tone: tone(tm), headline: `${hrs(total)} of work`, facts: tmFacts });

	// Brand fit
	let br = typeof ai.fit === 'number' ? clamp(ai.fit) : 6;
	const brFacts: string[] = [];
	if (ai.fit_note) brFacts.push(ai.fit_note.replace(/\.?$/, '.'));
	const history = all.filter((x) => x.brand_id === c.brand_id && x.id !== c.id);
	if (history.some(overdue)) {
		br -= 4;
		brFacts.push('They have an overdue payment with you.');
		flags.push('Overdue payment from an earlier collab');
	} else if (history.some((x) => x.pay_status === 'paid')) {
		br += 1.5;
		brFacts.push('They have paid you before.');
	} else if (history.some((x) => x.stage === 'wrapped')) {
		br += 1;
		brFacts.push("You've worked together before.");
	}
	const stars = [notes?.rate_pay, notes?.rate_brief, notes?.rate_again].filter((x): x is number => typeof x === 'number');
	if (stars.length) {
		const avg = stars.reduce((a, b) => a + b, 0) / stars.length;
		br += (avg - 3) * 1.2;
		brFacts.push(`You rated them ${avg.toFixed(1)}★.`);
	}
	if (s.priority_categories?.includes(c.brand.category)) {
		br += 1;
		brFacts.push(`${c.brand.category} is a category you prefer.`);
	}
	if (c.brand.website || c.brand.instagram) brFacts.push(`Online: ${[c.brand.website && c.brand.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), c.brand.instagram && `@${c.brand.instagram}`].filter(Boolean).join(', ')}.`);
	const haystack = `${c.brand.name} ${c.brand.category} ${ai.category ?? ''} ${c.product} ${c.brief}`.toLowerCase();
	const avoided = (s.avoid_brands ?? '').split(/[,;\n]/).map((w) => w.trim()).filter((w) => w.length > 2 && haystack.includes(w.toLowerCase()));
	if (avoided.length) {
		br = 0;
		flags.unshift(`On your won't-promote list: ${avoided.join(', ')}`);
	}
	br = clamp(br);
	factors.push({ key: 'brand', label: 'Brand fit', icon: 'heart', weight: WEIGHTS.brand, score: br, tone: tone(br), headline: avoided.length ? "On your won't-promote list" : br >= 7.5 ? 'Strong fit' : br >= 5 ? 'Decent fit' : 'Weak fit', facts: brFacts });

	// Terms
	let te = 8;
	const teFacts: string[] = [];
	const paidUsage = /paid|ads?\b|whitelist|boost/i.test(c.usage);
	if (paidUsage && c.type === 'barter') {
		te -= 3;
		teFacts.push(`They want ${c.usage.toLowerCase()} on a barter deal.`);
		flags.push('Paid ad usage without a fee');
	} else if (paidUsage) teFacts.push(`${c.usage}: charge ${s.usage_ext_pct || 30}% of the fee per extra 30 days.`);
	if (ai.exclusivity) {
		te -= 2;
		teFacts.push(`Exclusivity: ${ai.exclusivity}.`);
	}
	if (ai.payment_terms) teFacts.push(`Payment: ${ai.payment_terms}.`);
	if (c.type === 'barter') {
		if (s.barter_mode === 'closed') {
			te -= 3;
			teFacts.push("You're taking paid collabs only.");
		}
		if (s.barter_min_value > 0 && c.product_value && c.product_value < s.barter_min_value) {
			te -= 2;
			teFacts.push(`Below your ${inr(s.barter_min_value)} barter minimum.`);
		}
		if (s.barter_monthly_cap > 0 && barterSlotsUsed(all) >= s.barter_monthly_cap) {
			te -= 2;
			teFacts.push(`Your ${s.barter_monthly_cap} barter slots this month are used.`);
		}
	}
	if (c.package_name) {
		te += 1;
		teFacts.push(`Booked your "${c.package_name}" package.`);
	}
	te -= Math.min(4, (ai.red_flags?.length ?? 0) * 1.2);
	te = clamp(te);
	if (!teFacts.length) teFacts.push(c.usage ? `${c.usage}.` : 'Nothing unusual asked.');
	factors.push({ key: 'terms', label: 'Terms', icon: 'doc', weight: WEIGHTS.terms, score: te, tone: tone(te), headline: te >= 7 ? 'Fair terms' : te >= 4.5 ? 'A few things to check' : 'Risky terms', facts: teFacts });

	// ---- Score and verdict ----
	let score = Math.round(factors.reduce((a, f) => a + f.weight * f.score, 0) / 10);
	if (avoided.length) score = Math.min(score, 20);
	const verdict: Verdict = score >= 70 ? 'take' : score >= 50 ? 'negotiate' : 'pass';
	const weakest = [...factors].sort((a, b) => a.score - b.score)[0];
	const line =
		verdict === 'take'
			? counterFee
				? `Good one. Ask for ${inr(counterFee)} to make it fully worth it.`
				: 'A good deal for the effort. Say yes.'
			: verdict === 'negotiate'
				? unknown && fair
					? `Ask what the ${thing} are worth: the whole job is worth about ${inr(fair)}.`
					: counterFee
					? `Worth doing at ${inr(counterFee)}${c.type !== 'paid' ? ` plus the ${/voucher/i.test(c.product) ? 'vouchers' : 'product'}` : ''}.`
					: `Worth it once ${weakest.label.toLowerCase()} is sorted out.`
				: avoided.length
					? "It's on your won't-promote list."
					: counterFee
						? `It gives less than it takes. Only at ${inr(counterFee)} or more.`
						: `It gives less than it takes: ${weakest.headline.toLowerCase()}.`;

	return {
		score,
		verdict,
		label: VERDICT_LABEL[verdict],
		line,
		factors,
		money: { rate, lines, fair, offer, offerNote, ratio, open, unknown, netHourly, usualHourly: usualHourly ? Math.round(usualHourly) : null },
		travel,
		hours: { content, styling, travel: travelH, visit: visitH, total },
		flags: [...new Set(flags)],
		good: [...new Set(good)],
		questions,
		counterFee,
		read,
		summary: ai.summary ?? ''
	};
}

function mondayIso(d: string | null | undefined) {
	if (!d) return '';
	const x = new Date(`${d.slice(0, 10)}T00:00:00`);
	x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
	return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
