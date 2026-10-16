// Costs per collab and what she keeps.
import type { Collab } from './types';

export const EXPENSE_CATS = { props: 'Props & outfits', travel: 'Travel', editor: 'Editor', shoot: 'Shoot (studio, crew)', other: 'Other' } as const;
export type Expense = { id: string; collab_id: string; label: string; category: keyof typeof EXPENSE_CATS; amount: number; spent_on: string };

/** Earned is the fee (cash); the product is shown separately. Kept = fee − costs. */
export function collabProfit(c: Collab) {
	const costs = (c.expenses ?? []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
	const earned = c.type === 'barter' ? 0 : c.fee;
	const product = c.type === 'paid' ? 0 : c.product_value;
	const kept = earned - costs;
	return { costs, earned, product, kept, margin: earned ? Math.round((kept / earned) * 100) : 0 };
}
