// Rights and partnership ads: what each brand may do with her content, until when, and the exclusivity she
// agreed to, with clashes between deals. Worked out from her collabs and their accepted quotes.
import type { Collab } from './types';
import { acceptedQuote, diff, iso, parse, usageDaysOf } from './util';

export type RightsRow = {
	c: Collab;
	usage: string;
	paid: boolean;
	perpetual: boolean;
	starts: string | null;
	ends: string | null;
	left: number | null;
	state: 'waiting' | 'running' | 'ending' | 'ended' | 'forever' | 'organic';
	exclDays: number;
	exclEnds: string | null;
	clashes: Collab[];
};

const ACTIVE = ['confirmed', 'creating', 'live', 'wrapped'];
const addDays = (d: string, n: number) => {
	const x = parse(d);
	x.setDate(x.getDate() + n);
	return iso(x);
};

/** Deals with paid usage, an exclusivity, or a partnership-ad set-up, soonest to end first. */
export function rightsRows(all: Collab[]): RightsRow[] {
	const rows: RightsRow[] = [];
	for (const c of all) {
		if (!ACTIVE.includes(c.stage)) continue;
		const q = acceptedQuote(c);
		const usage = q?.usage || c.usage || 'Organic only';
		const days = usageDaysOf(usage);
		const perpetual = /perpetual/i.test(usage);
		const paid = !!days || perpetual;
		const exclDays = q?.exclusivity_days ?? 0;
		if (!paid && !exclDays && !c.ad_how) continue;
		const starts = c.live_date ?? null;
		const ends = c.usage_ends ?? (starts && days ? addDays(starts, days) : null);
		const left = ends ? diff(ends) : null;
		const state: RightsRow['state'] = !paid ? 'organic' : perpetual ? 'forever' : !starts ? 'waiting' : left !== null && left < 0 ? 'ended' : left !== null && left <= 7 ? 'ending' : 'running';
		const exclEnds = starts && exclDays ? addDays(starts, exclDays) : null;
		const clashes =
			starts && exclEnds
				? all.filter((o) => {
						if (o.id === c.id || o.brand_id === c.brand_id || !ACTIVE.includes(o.stage) || !o.live_date) return false;
						if (o.live_date < starts || o.live_date > exclEnds) return false;
						const scope = (c.excl_scope || c.brand.category || '').toLowerCase();
						const theirs = `${o.brand.category ?? ''} ${o.brand.name}`.toLowerCase();
						return !!scope && scope.split(/[,/]| or /).some((w) => w.trim().length > 2 && theirs.includes(w.trim()));
					})
				: [];
		rows.push({ c, usage, paid, perpetual, starts, ends, left, state, exclDays, exclEnds, clashes });
	}
	const rank = { ending: 0, running: 1, waiting: 2, forever: 3, organic: 4, ended: 5 };
	return rows.sort((a, b) => rank[a.state] - rank[b.state] || (a.left ?? 9999) - (b.left ?? 9999));
}

export const AD_HOW: Record<string, string> = {
	partnership: 'Partnership ads (with your ad code)',
	access: 'Ads from your handle (access given)',
	repost: 'Repost on their page only',
	'': 'Not set yet'
};
