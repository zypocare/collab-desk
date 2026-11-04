// Plan prices written in text (the help articles) are the starting prices; the admin can change the real ones
// (billing_plans). This swaps each known starting amount for the live price, the same way the website does
// (site/build/layout.mjs, PRICE_FALLBACK). Keep the two tables the same.
import { supabase } from './supabase';

const FALLBACK: Record<string, { month: number; year: number; founding: number }> = {
	creator_pro: { month: 299, year: 2999, founding: 1499 },
	brand_pro: { month: 1999, year: 19999, founding: 9999 },
	agency: { month: 4999, year: 49999, founding: 24999 }
};
type Plan = { code: string; price_month: number; price_year: number; founding_year: number | null };
const live = $state<{ swap: Map<number, number> | null }>({ swap: null });
let asked = false;

export function loadLivePrices() {
	if (asked) return;
	asked = true;
	supabase.rpc('public_plans').then(({ data }) => {
		const d = data as { plans?: Plan[]; founding?: { on: boolean } } | null;
		if (!d?.plans) return;
		const swap = new Map<number, number>();
		for (const p of d.plans) {
			const f = FALLBACK[p.code];
			if (!f) continue;
			swap.set(f.month, p.price_month);
			swap.set(f.year, p.price_year);
			swap.set(Math.round(f.year / 12), Math.round(p.price_year / 12));
			if (d.founding?.on && p.founding_year) swap.set(f.founding, p.founding_year);
		}
		live.swap = swap;
	});
}

/** The text with plan prices as they are today. */
export function livePrices(text: string) {
	const swap = live.swap;
	if (!swap) return text;
	return text.replace(/₹\s?(\d[\d,]*)/g, (x, n: string) => {
		const v = swap.get(Number(n.replace(/,/g, '')));
		return v == null ? x : `₹${v.toLocaleString('en-IN')}`;
	});
}
