// Suggestions: ready-made answers the studio puts in front of her so she mostly picks instead of typing.
// Everything here is plain rules on her own data (rate card, packages, history). No paid AI.
import type { Collab, Package, PublicPackage, QuoteItem, Settings } from './types';
import { diff, fmt, inTransit, iso, latestDraft, latestQuote, offeredKinds, overdue, parse, plural, unreadFor, usageDaysOf } from './util';
import { balanceDue } from './invoice';
import { fairFee, rateValue } from './priority';
import { delivText, inr } from './util';

const round500 = (n: number) => Math.round(n / 500) * 500;
const itemsSum = (items: QuoteItem[]) => items.reduce((a, i) => a + i.qty * i.rate, 0);

// ---------------------------------------------------------------------------
// Terms: what she usually agrees with this brand (or brands like it).
// ---------------------------------------------------------------------------
export type Terms = { advance_pct: number; pay_days: number; revision_rounds: number; exclusivity_days: number; why: string };

export function suggestTerms(c: Collab, all: Collab[]): Terms {
	const history = all.filter((x) => x.brand_id === c.brand_id && x.id !== c.id);
	const lastQuote = history.flatMap((x) => x.quotes).find((q) => q.status === 'accepted') ?? history.flatMap((x) => x.quotes)[0];
	const sameCat = all.filter((x) => x.id !== c.id && x.brand.category === c.brand.category).flatMap((x) => x.quotes).find((q) => q.status === 'accepted');
	const paidOnTime = history.filter((x) => x.pay_status === 'paid' && x.paid_on && x.pay_due && x.paid_on <= x.pay_due).length;
	const late = history.some(overdue) || history.some((x) => x.pay_status === 'paid' && x.paid_on && x.pay_due && x.paid_on > x.pay_due);

	const advance = late ? 100 : paidOnTime ? 0 : 50;
	const why = late ? 'They paid late before, so full payment upfront' : paidOnTime ? 'They have paid on time before, so no advance' : 'New brand, so 50% advance';
	return {
		advance_pct: advance,
		pay_days: lastQuote?.pay_days ?? sameCat?.pay_days ?? 15,
		revision_rounds: lastQuote?.revision_rounds ?? sameCat?.revision_rounds ?? 2,
		exclusivity_days: lastQuote?.exclusivity_days ?? sameCat?.exclusivity_days ?? 0,
		why
	};
}

// ---------------------------------------------------------------------------
// Quote options: match the brand's budget, her full rate card, and a premium version.
// ---------------------------------------------------------------------------
export type QuoteOption = {
	key: 'budget' | 'rate' | 'premium';
	title: string;
	sub: string;
	items: QuoteItem[];
	usage: string;
	usage_fee: number;
	discount: number;
	total: number;
};

/** Usage fee for paid ads: her extension rate (% of the fee per 30 days) on the content price. */
export function usageFee(usage: string, subtotal: number, s: Settings) {
	const days = usageDaysOf(usage);
	return days ? round500(subtotal * ((s.usage_ext_pct ?? 25) / 100) * (days / 30)) : 0;
}

export function quoteOptions(c: Collab, s: Settings, packages: Package[]): QuoteOption[] {
	const rates = s.rates ?? {};
	const base: QuoteItem[] = (c.deliverables.length ? c.deliverables : [{ kind: 'Reel', qty: 1 }]).map((d) => ({ kind: d.kind, qty: d.qty, rate: rates[d.kind] ?? 0 }));
	const usage = c.usage || 'Organic only';
	const make = (key: QuoteOption['key'], title: string, sub: string, items: QuoteItem[], use: string, discount = 0): QuoteOption => {
		const fee = usageFee(use, itemsSum(items), s);
		return { key, title, sub, items, usage: use, usage_fee: fee, discount, total: Math.max(0, itemsSum(items) + fee - discount) };
	};

	const rate = make('rate', 'Rate card', 'Full price for what they asked', base.map((i) => ({ ...i })), usage);
	const out: QuoteOption[] = [];

	// Match the budget (only when the brand named one below the rate card).
	const budget = c.type === 'barter' ? 0 : c.fee;
	if (budget > 0 && budget < rate.total * 0.97) {
		// 1. One of her packages that covers what they asked and fits the budget.
		// It must include their most valuable ask (e.g. the Reel) and be priced close to the budget.
		const main = [...base].sort((a, b) => b.rate - a.rate)[0]?.kind;
		const pk = packages
			.filter((p) => p.active && p.price <= budget * 1.05 && p.price >= budget * 0.7 && p.items.some((i) => i.kind === main))
			.sort((a, b) => b.price - a.price)[0];
		if (pk) {
			const items = pk.items.map((i) => ({ kind: i.kind, qty: i.qty, rate: rates[i.kind] ?? 0 }));
			const discount = Math.max(0, itemsSum(items) - pk.price);
			out.push(make('budget', `Match budget · ${pk.name}`, `Your ${pk.name} package fits their ${budgetText(budget)}`, items, 'Organic only', discount));
		} else if (rate.total - budget <= rate.total * 0.15) {
			// 2. Close to the rate card: keep everything they asked for, with a small discount.
			const discount = Math.max(0, rate.total - budget);
			const pct = Math.round((discount / Math.max(1, itemsSum(base))) * 100);
			out.push(make('budget', 'Match budget', `${pct}% off, everything they asked for, at their ${budgetText(budget)}`, base.map((i) => ({ ...i })), usage, discount));
		} else {
			// 3. Far below the rate card: drop the cheapest pieces until it fits (keep at least one), then a small discount (max 15%).
			const items = base.map((i) => ({ ...i }));
			const dropped: string[] = [];
			const totalOf = () => itemsSum(items) + usageFee(usage, itemsSum(items), s);
			while (totalOf() > budget * 1.05) {
				const cheapest = items.filter((i) => i.qty > 0).sort((a, b) => a.rate - b.rate)[0];
				if (!cheapest || items.reduce((a, i) => a + i.qty, 0) <= 1 || totalOf() - cheapest.rate < budget * 0.85) break;
				cheapest.qty -= 1;
				dropped.push(cheapest.kind);
			}
			const kept = items.filter((i) => i.qty > 0);
			const over = Math.max(0, totalOf() - budget);
			const discount = Math.min(over, round500(itemsSum(kept) * 0.15));
			const parts = [
				dropped.length ? `drops ${summarise(dropped)}` : '',
				discount ? `${Math.round((discount / Math.max(1, itemsSum(kept))) * 100)}% off` : ''
			].filter(Boolean);
			const o = make('budget', 'Match budget', parts.length ? `${parts.join(', ')} to meet ${budgetText(budget)}` : `Fits ${budgetText(budget)}`, kept, usage, discount);
			// Still above their budget (she won't go lower than this): say so plainly.
			if (o.total > budget * 1.05) {
				o.title = 'Closest to budget';
				o.sub = `${parts.length ? parts.join(', ') + ': ' : ''}${inrText(o.total - budget)} above their ${budgetText(budget)}`;
			}
			out.push(o);
		}
	} else if (budget > rate.total * 1.03 && rate.total > 0) {
		// They offered more than her rate card: quote what they offered (never undercut their own budget).
		const f = budget / rate.total;
		const items = base.map((i) => ({ ...i, rate: round500(i.rate * f) }));
		const o = make('budget', 'Their budget', `They offered ${budgetText(budget)}, more than your rate card`, items, usage);
		const top = [...items].sort((x, y) => y.rate * y.qty - x.rate * x.qty)[0];
		if (top && o.total !== budget) {
			top.rate = Math.max(0, Math.round(top.rate + (budget - o.total) / Math.max(1, top.qty)));
			Object.assign(o, make('budget', o.title, o.sub, items, usage));
		}
		out.push(o);
	}

	out.push(rate);

	// Premium: an extra Story if she offers them, and 30 days of paid ads if they asked for organic only.
	const offered = offeredKinds(s.offered_kinds);
	const prem = base.map((i) => ({ ...i }));
	const extras: string[] = [];
	if (offered.includes('Story')) {
		const st = prem.find((i) => i.kind === 'Story');
		if (st) st.qty += 1;
		else prem.push({ kind: 'Story', qty: 1, rate: rates.Story ?? 0 });
		extras.push('1 more Story');
	}
	let premUsage = usage;
	if (!usageDaysOf(usage) && usage !== 'Perpetual usage') {
		premUsage = '30 days paid ads';
		extras.push('30 days of paid ads');
	}
	if (extras.length) out.push(make('premium', 'Premium', `Adds ${extras.join(' and ')}`, prem, premUsage));
	return out;
}

const budgetText = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN') + ' budget';
const inrText = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const summarise = (kinds: string[]) => {
	const counts = kinds.reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {});
	return Object.entries(counts).map(([k, n]) => `${n} ${plural(k, n)}`).join(' and ');
};

// ---------------------------------------------------------------------------
// Dates: draft and go-live that fit the product's arrival and her open weeks.
// ---------------------------------------------------------------------------
const addDays = (d: Date, n: number) => {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
};
const mondayOf = (d: Date) => {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
	return x;
};

/** How many collabs land in the week of `d` (same rule as the brand page's availability). */
function weekLoad(d: Date, all: Collab[], exceptId: string) {
	const w = mondayOf(d), end = addDays(w, 7);
	return all.filter((c) => {
		if (c.id === exceptId || !['confirmed', 'creating', 'live'].includes(c.stage)) return false;
		const x = c.live_date ?? c.draft_date ?? c.preferred_live;
		return !!x && parse(x) >= w && parse(x) < end;
	}).length;
}

export type DateSuggestion = { draft: string; live: string; why: string };

export function suggestDates(c: Collab, s: Settings, all: Collab[]): DateSuggestion {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const days = s.draft_days_after_product ?? 7;
	const needsProduct = c.type !== 'paid' && c.barter_kind !== 'experience' && !c.product_received_at;
	// The product has to arrive first; if it isn't shipped yet, allow a few days for that.
	const arrives = c.product_received_at ? parse(c.product_received_at.slice(0, 10)) : needsProduct ? (c.product_date && parse(c.product_date) > today ? parse(c.product_date) : addDays(today, 5)) : today;
	let draft = addDays(arrives > today ? arrives : today, c.type === 'paid' ? 5 : days);
	if (draft.getDay() === 0) draft = addDays(draft, 1); // not on a Sunday

	// Go-live: their preferred date if it leaves time for review, else 4 days after the draft;
	// then the first week that isn't full or marked away.
	const pref = c.preferred_live ? parse(c.preferred_live) : null;
	let live = pref && pref >= addDays(draft, 3) ? pref : addDays(draft, 4);
	const away = new Set(s.away_weeks ?? []);
	for (let i = 0; i < 12; i++) {
		const wk = iso(mondayOf(live));
		if (!away.has(wk) && weekLoad(live, all, c.id) < (s.weekly_capacity ?? 3)) break;
		live = addDays(mondayOf(live), 7 + 1); // Tuesday of the next week
	}
	const why = [
		needsProduct ? (c.product_date ? 'after the product arrives' : 'allowing time for the product to arrive') : '',
		pref && iso(live) === iso(pref) ? 'on their preferred date' : 'in your next open week'
	].filter(Boolean).join(', ');
	return { draft: iso(draft), live: iso(live), why };
}

// ---------------------------------------------------------------------------
// The next step for a collab: one action that moves it forward.
// ---------------------------------------------------------------------------
export type NextStep = { key: string; label: string; hint: string; icon: string };

export function nextStep(c: Collab): NextStep | null {
	const q = latestQuote(c);
	const dr = latestDraft(c);
	const openInv = c.invoices.find((i) => i.status === 'sent' || i.status === 'partly_paid');
	const readyReport = c.reports.find((r) => r.status === 'ready');
	if (unreadFor(c)) return { key: 'reply', label: 'Reply', hint: `${c.brand.name} sent you a message`, icon: 'mail' };

	switch (c.stage) {
		case 'request':
		case 'negotiating':
			// Already invoiced or paid: the deal is clearly on, so the next step is to mark it agreed.
			if (c.pay_status === 'paid' || c.pay_status === 'invoiced' || c.pay_status === 'advance')
				return { key: 'confirm', label: 'Confirm collab', hint: c.pay_status === 'paid' ? 'Already paid: move it to Agreed' : 'Already invoiced: move it to Agreed', icon: 'check' };
			if (q?.status === 'changes') return { key: 'revise-quote', label: 'Revise quote', hint: 'The brand asked for changes', icon: 'edit' };
			if (q?.status === 'accepted') return { key: 'confirm', label: 'Confirm collab', hint: 'They accepted your quote', icon: 'check' };
			if (q?.status === 'sent')
				return diff(q.created_at.slice(0, 10)) <= -3
					? { key: 'nudge', label: 'Nudge brand', hint: 'No answer to your quote for 3+ days', icon: 'bell' }
					: null;
			return c.type === 'barter'
				? { key: 'quote', label: 'Counter or quote', hint: 'Barter request: send a quote, or a reply from "Should you take it?"', icon: 'rupee' }
				: { key: 'quote', label: 'Send quote', hint: 'Pick a ready quote in one tap', icon: 'rupee' };
		case 'confirmed':
			if (c.type !== 'paid' && !c.shipped_at && !c.product_received_at) return { key: 'ask-product', label: 'Ask for the product', hint: 'Remind them to ship it', icon: 'box' };
			if (inTransit(c)) return { key: 'received', label: 'Mark received', hint: `On its way via ${c.ship_carrier}`, icon: 'box' };
			if (!c.draft_date || !c.live_date) return { key: 'dates', label: 'Set dates', hint: 'Suggested draft and go-live dates are ready', icon: 'cal' };
			return { key: 'start', label: 'Start creating', hint: `Draft due ${fmt(c.draft_date)}`, icon: 'film' };
		case 'creating':
			if (!dr || dr.status === 'changes') return { key: 'share-draft', label: dr ? 'Share revised draft' : 'Share draft', hint: dr ? 'They asked for changes' : 'Send it for approval', icon: 'send' };
			if (dr.status === 'approved') return { key: 'go-live', label: 'Mark live', hint: 'Draft approved: post it', icon: 'spark' };
			return null; // waiting for the brand's review
		case 'live':
			if (readyReport) return { key: 'report', label: 'Send results', hint: '7-day report is ready', icon: 'chart' };
			if (c.type === 'barter' || c.pay_status === 'paid') return null;
			if (c.pay_status === 'pending' && !c.invoices.some((i) => i.status !== 'draft' && i.status !== 'cancelled'))
				return { key: 'invoice', label: 'Send invoice', hint: 'Filled in from the agreed quote', icon: 'wallet' };
			if ((openInv && balanceDue(openInv) > 0) || c.pay_status === 'invoiced' || c.pay_status === 'advance')
				return { key: 'paid', label: 'Record payment', hint: overdue(c) ? 'Payment is overdue' : openInv ? `${openInv.number} is open` : 'Waiting for payment', icon: 'wallet' };
			return null;
		case 'wrapped':
			return null;
		default:
			return null;
	}
}

// ---------------------------------------------------------------------------
// Reply suggestions for Messages: what she'd most likely say right now, filled in.
// ---------------------------------------------------------------------------
export type Reply = { label: string; text: string };

export function replySuggestions(c: Collab, s: Settings): Reply[] {
	const hi = `Hi ${c.contact_name ? c.contact_name.split(' ')[0] : 'there'}`;
	const me = (s.display_name ?? '').split(' ')[0];
	const sign = me ? `\n${me}` : '';
	const q = latestQuote(c);
	const dr = latestDraft(c);
	const out: Reply[] = [];
	const add = (label: string, text: string) => out.push({ label, text: text + sign });
	const what = delivText(c.deliverables);
	const hasBrief = !!c.brief.trim() || Object.keys(c.brief_details ?? {}).length > 0;

	switch (c.stage) {
		case 'request':
		case 'negotiating': {
			const rate = rateValue(c.deliverables, s.rates);
			if (c.type === 'barter' && rate) {
				const fee = fairFee(rate, c.product_value);
				if (s.barter_min_value && c.product_value < s.barter_min_value)
					add('Decline barter, offer paid', `${hi}, thank you for thinking of me! I'm only taking barter collabs for products above ${inr(s.barter_min_value)} right now. For ${what}, I could do it for ${inr(fee)} along with the product. Would that work?`);
				else if (fee) add('Counter with a fee', `${hi}, thank you for reaching out! I'd love to work with ${c.brand.name}. For ${what}, I usually work on a paid basis: with the product, I can do it for ${inr(fee)}. Happy to adjust the deliverables if that helps.`);
			}
			if (!hasBrief) add('Ask for the brief', `${hi}, thanks for reaching out! Could you share the brief, key messages, any hashtags or tags, and a few reference posts you like? Then I'll send you a quote.`);
			if (q?.status === 'sent') add('Nudge on the quote', `${hi}, just checking in on the quote I sent for ${c.code}. Happy to tweak anything if needed!`);
			if (c.preferred_live) add('Confirm timing', `${hi}, the date you mentioned works on my side. I'll confirm the exact go-live once we lock the details.`);
			add('Will get back', `${hi}, thanks for the details! I'll get back to you by tomorrow.`);
			add('Politely decline', `${hi}, thank you so much for thinking of me. Unfortunately I won't be able to take this one up right now, but I'd love to stay in touch for future campaigns!`);
			break;
		}
		case 'confirmed':
			if (c.type !== 'paid' && !c.shipped_at && !c.product_received_at)
				add('Ask to ship', `${hi}, we're all set! Please ship the product using the address on your request page, and add the tracking number there so I know when to expect it.`);
			if (c.product_received_at) add('Product arrived', `${hi}, the product has arrived, thank you! I'll share the draft${c.draft_date ? ` by ${fmt(c.draft_date)}` : ' soon'}.`);
			add('Excited to start', `${hi}, excited to start on this!${c.draft_date ? ` You'll have the draft by ${fmt(c.draft_date)}` : ''}${c.live_date ? `, and we go live on ${fmt(c.live_date)}` : ''}.`);
			if (!hasBrief) add('Ask for the brief', `${hi}, before I start, could you share the brief, key messages, hashtags and any do's and don'ts?`);
			break;
		case 'creating':
			if (dr?.status === 'approved') add('Thanks for approving', `${hi}, thanks for approving the draft! It goes live${c.live_date ? ` on ${fmt(c.live_date)}` : ' soon'}. I'll share the link once it's up.`);
			else if (dr?.status === 'pending') add('Draft is ready', `${hi}, the draft is ready for your review on your request page. Let me know if you'd like any changes!`);
			else add('Working on it', `${hi}, working on the content now. You'll have the draft${c.draft_date ? ` by ${fmt(c.draft_date)}` : ' soon'}.`);
			break;
		case 'live': {
			const post = c.posts[0]?.media.permalink;
			add("It's live", `${hi}, it's live!${post ? ` Here's the post: ${post}` : ''} You'll get a results report with views and reach after 7 days.`);
			const open = c.invoices.find((i) => i.status === 'sent' || i.status === 'partly_paid');
			if (open && overdue(c)) add('Payment reminder', `${hi}, a gentle reminder that invoice ${open.number} for ${inr(balanceDue(open))} was due on ${fmt(open.due_date)}. Could you check on it? Thank you!`);
			else if (open) add('Invoice sent', `${hi}, I've shared invoice ${open.number} for ${inr(balanceDue(open))}. You can pay by UPI from the invoice page. Thank you!`);
			break;
		}
		case 'wrapped':
			add('Thank you', `${hi}, thank you for a lovely collaboration! Would love to work with ${c.brand.name} again. You can book another one any time from your requests page.`);
			break;
		case 'declined':
			add('Keep in touch', `${hi}, thanks again for reaching out. Happy to look at a future campaign whenever it fits!`);
			break;
	}
	return out.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Caption starter from the brief: disclosure first, the brand tag, the message, and every
// hashtag and @mention the brief asked for, so it passes the caption check from the start.
// ---------------------------------------------------------------------------
export function captionStarter(c: Collab, style: 'short' | 'detailed'): string {
	const d = c.brief_details ?? {};
	const brand = c.brand.instagram ? `@${c.brand.instagram.replace(/^@/, '')}` : c.brand.name;
	// ASCI: any money paid means #ad; a product only (barter) is #gifted.
	const tag = c.type === 'barter' ? '#gifted' : '#ad';
	const message = (d.message ?? '').trim().replace(/[.!]+$/, '');
	const mentions = (d.mentions ?? []).filter((m) => m.toLowerCase() !== brand.toLowerCase());
	const tags = d.hashtags ?? [];
	const first = `${tag} ${message ? `${message} ✨` : `Trying ${c.product || 'something new'} from ${brand} ✨`}${message ? ` with ${brand}` : ''}`;
	const lines = [first, ''];
	if (style === 'detailed') {
		const dos = (d.dos ?? '').split(/\n|,|;/).map((x) => x.trim()).filter(Boolean).slice(0, 3);
		if (dos.length) lines.push(...dos.map((x) => `✔️ ${x[0].toUpperCase()}${x.slice(1)}`), '');
		lines.push('What would you try first? Tell me in the comments 👇', '');
	}
	if (d.promo?.trim()) lines.push(`🎁 Use code ${d.promo.trim().split(/\s/)[0].toUpperCase()}`, '');
	if (d.link) lines.push('🔗 Link in bio', '');
	if (mentions.length) lines.push(mentions.join(' '));
	if (tags.length) lines.push(tags.join(' '));
	return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---------------------------------------------------------------------------
// Brand side: what a budget gets them (from her public rates and packages).
// ---------------------------------------------------------------------------
export type Combo = { label: string; items: { kind: string; qty: number }[]; total: number; packageId?: string };

export function budgetCombos(budget: number, rates: Record<string, number> | null, offered: string[], packages: PublicPackage[]): Combo[] {
	if (budget < 500) return [];
	const out: Combo[] = [];
	// Her packages that fit come first.
	for (const p of packages) if (p.price <= budget * 1.05 && p.price >= budget * 0.7) out.push({ label: p.name, items: p.items, total: p.price, packageId: p.id });
	if (rates) {
		const kinds = offered.filter((k) => rates[k] > 0).sort((a, b) => rates[b] - rates[a]);
		const combos: Combo[] = [];
		// Every mix of up to 3 kinds (up to 5 of each) that fits the budget.
		const walk = (i: number, picked: { kind: string; qty: number }[], total: number) => {
			if (picked.length && total <= budget * 1.05 && total >= budget * 0.6) combos.push({ label: '', items: [...picked], total });
			if (i >= kinds.length || picked.length >= 3) return;
			for (let q = 1; q <= 5; q++) {
				const t = total + rates[kinds[i]] * q;
				if (t > budget * 1.05) break;
				walk(i + 1, [...picked, { kind: kinds[i], qty: q }], t);
			}
			walk(i + 1, picked, total);
		};
		walk(0, [], 0);
		// Closest to the budget first; then pick ones that look different from each other.
		combos.sort((a, b) => Math.abs(budget - a.total) - Math.abs(budget - b.total));
		// Lead with the best mix that includes her top format (usually a Reel), if it fits.
		const top = combos.find((c) => c.items.some((i) => i.kind === kinds[0]));
		if (top) combos.splice(combos.indexOf(top), 1), combos.unshift(top);
		for (const c of combos) {
			if (out.length >= 3) break;
			const lead = [...c.items].sort((a, b) => rates[b.kind] * b.qty - rates[a.kind] * a.qty)[0].kind;
			if (out.some((o) => !o.packageId && [...o.items].sort((a, b) => rates[b.kind] * b.qty - rates[a.kind] * a.qty)[0].kind === lead)) continue;
			out.push({ ...c, label: c.items.map((i) => `${i.qty} ${plural(i.kind, i.qty)}`).join(' + ') });
		}
	}
	return out.slice(0, 3);
}
