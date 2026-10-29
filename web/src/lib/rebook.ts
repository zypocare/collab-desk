import { buildParam } from './bundle';
import type { Collab, Settings } from './types';
import { delivText, diff, fmtLong, iso, waShare } from './util';

// "Book again" for a wrapped collab, sent by her on WhatsApp. Brands with an email get it by email a week after the
// collab wraps (private.rebook_offers); most of her repeat brands write on WhatsApp instead, so the same
// thank-you, offer and link go from her own WhatsApp. Sending it counts as the offer: the email doesn't go too, and
// a signed-in brand gets the returning-brand discount (public.rebook_offer) from that day.

/** The booking link: her request form with this collab's pieces filled in (?build, for brands that aren't signed in)
 *  and its code (?again, for brands that are: their earlier details, and the discount). */
export function rebookLink(c: Collab, s: Settings) {
	const qty: Record<string, number> = {};
	for (const d of c.deliverables) qty[d.kind] = (qty[d.kind] ?? 0) + d.qty;
	const build = buildParam(qty);
	return `${s.site_url.replace(/\/$/, '')}/brand/new?again=${encodeURIComponent(c.code)}${build ? `&build=${encodeURIComponent(build)}` : ''}`;
}

/** The WhatsApp message, in her words. */
export function rebookText(c: Collab, s: Settings) {
	const first = c.contact_name ? c.contact_name.split(' ')[0] : '';
	const end = new Date();
	end.setDate(end.getDate() + (s.rebook_days || 30));
	const until = iso(end);
	const offer = s.rebook_pct > 0 ? ` As a thank-you, your next collab with me is ${s.rebook_pct}% off if you book by ${fmtLong(until)}.` : '';
	const what = c.deliverables.length ? ` (${delivText(c.deliverables)})` : '';
	return `Hi${first ? ' ' + first : ''}! Thank you for the ${c.brand.name} collab${what}, I loved making it.${offer} Whenever you plan the next one, it books in a minute here, with everything filled in: ${rebookLink(c, s)}`;
}

export const rebookWhatsApp = (c: Collab, s: Settings) => waShare(c.contact_phone, rebookText(c, s));

/** A wrapped collab with a WhatsApp-only brand, a week to six weeks after it wrapped, not offered yet: time to send it. */
export function rebookDue(c: Collab, s: Settings | null | undefined) {
	if (!s?.rebook_offer || c.stage !== 'wrapped' || c.rebook_sent_at || c.contact_email || !c.wrapped_at || !s.site_url) return false;
	const days = -diff(c.wrapped_at.slice(0, 10));
	return days >= 7 && days <= 42;
}
