// Costs per collab and what she keeps.
import type { Collab } from './types';

export const EXPENSE_CATS = {
	props: 'Attire & props',
	travel: 'Travel',
	editor: 'Editor',
	shoot: 'Shoot, MUA & crew',
	other: 'Other'
} as const;

export type ExpenseCategory = keyof typeof EXPENSE_CATS;

export type ExpensePreset = {
	id: string;
	label: string;
	category: ExpenseCategory;
	placeholder: string;
	quickTags: string[];
};

export const EXPENSE_PRESETS: ExpensePreset[] = [
	{
		id: 'attire',
		label: 'Attire & outfits',
		category: 'props',
		placeholder: 'e.g. Saree rental, styling piece, footwear',
		quickTags: ['Outfit rental', 'Styling & accessories', 'Dry cleaning']
	},
	{
		id: 'makeup',
		label: 'Makeup & hair',
		category: 'shoot',
		placeholder: 'e.g. MUA fee, hairstylist, touch-up kit',
		quickTags: ['Makeup artist', 'Hairstylist', 'Beauty products']
	},
	{
		id: 'cab',
		label: 'Cab / Auto',
		category: 'travel',
		placeholder: 'e.g. Uber round trip to shoot venue',
		quickTags: ['Uber / Ola round trip', 'Auto fare', 'Airport cab']
	},
	{
		id: 'owncar',
		label: 'Own car / Fuel',
		category: 'travel',
		placeholder: 'e.g. Petrol, parking fee, toll',
		quickTags: ['Petrol / fuel', 'Valet & parking', 'Scooter fuel']
	},
	{
		id: 'photographer',
		label: 'Photographer',
		category: 'shoot',
		placeholder: 'e.g. Photographer / videographer day rate',
		quickTags: ['Photographer', 'Videographer', 'Camera / light rental']
	},
	{
		id: 'editor',
		label: 'Editor',
		category: 'editor',
		placeholder: 'e.g. Reel cut, colour grading, sound sync',
		quickTags: ['Reel editing', 'Colour grading', 'Thumbnail & graphics']
	},
	{
		id: 'studio',
		label: 'Studio / Cafe',
		category: 'shoot',
		placeholder: 'e.g. Studio booking, cafe bill, shoot location fee',
		quickTags: ['Studio rent', 'Cafe / food bill', 'Location permit']
	},
	{
		id: 'other',
		label: 'Props & other',
		category: 'other',
		placeholder: 'e.g. Flowers, backdrop, courier, misc',
		quickTags: ['Props & decor', 'Courier return', 'Assistant']
	}
];

export type Expense = {
	id: string;
	collab_id: string;
	label: string;
	category: ExpenseCategory;
	amount: number;
	spent_on: string;
};

/** Earned is the fee (cash); the product is shown separately. Kept = fee − costs. */
export function collabProfit(c: Collab) {
	const costs = (c.expenses ?? []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
	const earned = c.type === 'barter' ? 0 : c.fee;
	const product = c.type === 'paid' ? 0 : c.product_value;
	const kept = earned - costs;
	return { costs, earned, product, kept, margin: earned ? Math.round((kept / earned) * 100) : 0 };
}
