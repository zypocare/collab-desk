// The ASCI disclosure linter (India's advertising rules for influencers, 2021, with the 2023 health and
// finance additions). It reads a caption, the kind of post and its length, and says what a reviewer
// would ask to change. Advice, not a legal opinion.
import type { CollabType } from './types';

export type Lint = { key: string; level: 'bad' | 'warn' | 'ok' | 'info'; title: string; fix?: string };

// The labels ASCI accepts; anything else ("#sp", "#spon", "#ambassador" alone) doesn't count.
const OK_LABEL = /(^|[\s(])#?(ad|advertisement|sponsored|collaboration|collab|partnership|paidpartnership|paid partnership|employee|free ?gift|gifted)(?![\p{L}\p{N}_])/iu;
const WEAK_LABEL = /(^|\s)#(sp|spon|thanks|brandambassador|ambassador|partner|promo)(?![\p{L}\p{N}_])/iu;
const HEALTH = /\b(weight ?loss|fat ?burn|immunity|cure|heal|detox|diabet|supplement|protein|nutrition|vitamin|collagen|skin ?whiten|hair ?fall|pcos|medicine|ayurved|doctor)\b/i;
const FINANCE = /\b(invest|stock|share market|trading|mutual fund|sip\b|crypto|bitcoin|returns?|loan|credit card|insurance|ipo|f&o|demat)\b/i;

/** The first 125 characters show before "more" on Instagram: the label has to be there. */
const FOLD = 125;

export function lintDisclosure(
	caption: string,
	o: { type?: CollabType; format?: 'reel' | 'post' | 'story' | 'carousel'; seconds?: number | null; category?: string; ai?: boolean } = {}
): Lint[] {
	const out: Lint[] = [];
	const text = caption.trim();
	const m = text.match(OK_LABEL);
	const at = m ? (m.index ?? 0) + (m[1]?.length ?? 0) : -1;
	const gifted = o.type === 'barter';
	if (!m) {
		out.push({
			key: 'label',
			level: 'bad',
			title: WEAK_LABEL.test(text) ? `"${text.match(WEAK_LABEL)?.[0].trim()}" isn't a label ASCI accepts` : 'No paid-partnership label',
			fix: gifted ? 'Start the caption with #Gifted or #Ad.' : 'Start the caption with #Ad (or #Collaboration, #Sponsored).'
		});
	} else {
		if (at > FOLD) out.push({ key: 'fold', level: 'bad', title: 'The label is below the fold', fix: `Move ${m[0].trim()} into the first line: people only see the first ${FOLD} characters before "more".` });
		// Buried in a block of hashtags at the end.
		const tail = text.slice(Math.max(0, at - 60), at + 40);
		const tagsAround = (tail.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
		if (tagsAround >= 4) out.push({ key: 'cluster', level: 'warn', title: 'The label is lost among hashtags', fix: 'Keep it apart from your other hashtags, ideally as the first word.' });
		if (at <= FOLD && tagsAround < 4) out.push({ key: 'label', level: 'ok', title: `${m[0].trim()} is up front` });
	}
	if (o.format === 'story') out.push({ key: 'story', level: 'warn', title: 'Put the label on the story itself', fix: 'Add "Ad" as text on each story frame, where it can be read; a caption alone is not enough.' });
	if ((o.format === 'reel' || (o.seconds ?? 0) > 0) && o.format !== 'story') {
		const s = Math.round(o.seconds ?? 0);
		const need = !s ? '' : s <= 15 ? 'at least 3 seconds' : s <= 120 ? `at least ${Math.ceil(s / 3)} seconds (a third of the video)` : 'the whole part where the brand is shown';
		out.push({
			key: 'video',
			level: 'info',
			title: 'Say it in the video too',
			fix: s ? `Show "Ad" on screen for ${need}, or say it out loud at the start.` : 'Show "Ad" on screen (3 seconds for a short reel, a third of the video up to 2 minutes), or say it at the start.'
		});
	}
	const cat = `${o.category ?? ''} ${text}`;
	if (HEALTH.test(cat)) out.push({ key: 'health', level: 'warn', title: 'Health or nutrition claims', fix: 'ASCI asks for a qualified expert (doctor, nutritionist) for health advice. Share your experience, not cures or results, and avoid "guaranteed".' });
	if (FINANCE.test(cat)) out.push({ key: 'finance', level: 'warn', title: 'Money and investment advice', fix: 'Investment advice needs SEBI registration (shown in the post). Without it, talk about the product, not what to invest in or returns.' });
	if (/\b(guarantee[d]?|100%|best in india|no\.? ?1|clinically proven)\b/i.test(text)) out.push({ key: 'claims', level: 'warn', title: 'A claim the brand must prove', fix: 'Words like "guaranteed", "100%" or "clinically proven" need the brand\'s proof. Ask them, or soften it.' });
	if (o.ai) out.push({ key: 'ai', level: 'info', title: 'AI-made content', fix: 'If a face, voice or person in it is AI-generated, say so in the caption.' });
	return out;
}

export const lintScore = (l: Lint[]) => ({ bad: l.filter((x) => x.level === 'bad').length, warn: l.filter((x) => x.level === 'warn').length });

/** A video file's length in seconds (0 when it can't be read). */
export function videoSeconds(file: File): Promise<number> {
	return new Promise((resolve) => {
		if (!file.type.startsWith('video/')) return resolve(0);
		const v = document.createElement('video');
		v.preload = 'metadata';
		v.onloadedmetadata = () => {
			URL.revokeObjectURL(v.src);
			resolve(Number.isFinite(v.duration) ? v.duration : 0);
		};
		v.onerror = () => resolve(0);
		v.src = URL.createObjectURL(file);
	});
}
