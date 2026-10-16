// Her own saved replies: short texts with placeholders that fill in for each collab.
import type { Collab, Settings } from './types';
import { delivText, fmt, inr } from './util';

export type SavedReply = { id: string; title: string; body: string };

export const PLACEHOLDERS: { key: string; label: string }[] = [
	{ key: '{name}', label: 'their first name' },
	{ key: '{brand}', label: 'brand' },
	{ key: '{content}', label: 'deliverables' },
	{ key: '{fee}', label: 'fee' },
	{ key: '{golive}', label: 'go-live date' },
	{ key: '{code}', label: 'request code' },
	{ key: '{me}', label: 'your first name' },
	{ key: '{link}', label: 'your brand page' },
	{ key: '{insights}', label: 'your insights page' }
];

export const STARTER_REPLIES: Omit<SavedReply, 'id'>[] = [
	{ title: 'Insights', body: 'Hi {name}, here are my live Instagram insights (reach, views, engagement and audience, straight from Instagram): {insights}\n{me}' },
	{ title: 'Rate card', body: 'Hi {name}, thank you for reaching out! My page has my rates and open weeks, and you can send the request there in 2 minutes: {link}\n{me}' },
	{ title: 'Need the brief', body: 'Hi {name}, excited about this! Could you share the key message, hashtags, do’s and don’ts, and any references? Then I’ll plan the shoot for {content}.\n{me}' },
	{ title: 'Not a fit', body: 'Hi {name}, thank you for thinking of me for {brand}. It isn’t the right fit for my page right now, but I’d love to stay in touch for the future.\n{me}' },
	{ title: 'Posting soon', body: 'Hi {name}, all set: {content} goes live on {golive}. I’ll share the link as soon as it’s up.\n{me}' }
];

export function fillReply(body: string, c: Collab, s: Settings) {
	const first = (x: string) => x.trim().split(/\s+/)[0] ?? '';
	const map: Record<string, string> = {
		'{name}': first(c.contact_name) || 'there',
		'{brand}': c.brand.name,
		'{content}': delivText(c.deliverables) || 'the content',
		'{fee}': c.fee ? inr(c.fee) : 'the fee we agreed',
		'{golive}': c.live_date ? fmt(c.live_date) : 'the date we agreed',
		'{code}': c.code,
		'{me}': first(s.display_name),
		'{link}': s.site_url.replace(/\/$/, ''),
		'{insights}': `${s.site_url.replace(/\/$/, '')}/insights`
	};
	return body.replace(/\{(name|brand|content|fee|golive|code|me|link|insights)\}/g, (m) => map[m] ?? m);
}

export const savedFor = (c: Collab, s: Settings) =>
	((s.saved_replies ?? []) as SavedReply[]).filter((r) => r.body.trim()).map((r) => ({ label: r.title || 'Saved reply', text: fillReply(r.body, c, s), saved: true }));
