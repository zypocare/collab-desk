// Starting points for a brief, by kind of campaign. Picking one replaces template wording and fills empty
// fields; text someone typed is only replaced after asking.
import type { BriefDetails } from './types';

export type BriefTemplate = { id: string; label: string; categories: string[]; brief: BriefDetails };

export const BRIEF_TEMPLATES: BriefTemplate[] = [
	{
		id: 'skincare',
		label: 'Skincare launch',
		categories: ['Skincare', 'Beauty'],
		brief: {
			message: 'Visible results with a simple daily routine',
			dos: 'Show the texture on skin\nMorning or night routine, in natural light\nMention how long you have been using it',
			donts: 'No medical or "cures" claims\nNo other skincare brands in frame\nNo heavy filters on skin',
			hashtags: ['#skincareroutine', '#glowingskin']
		}
	},
	{
		id: 'fashion',
		label: 'Fashion drop',
		categories: ['Fashion'],
		brief: {
			message: 'Your new favourite outfit for the season',
			dos: 'Two or three looks with transitions\nShow fit, fabric and details up close\nTag the product in the post',
			donts: 'No other fashion brands visible\nNo price comparisons',
			hashtags: ['#ootd', '#styleinspo']
		}
	},
	{
		id: 'travel',
		label: 'Travel or stay',
		categories: ['Travel'],
		brief: {
			message: 'The stay that makes the trip',
			dos: 'Arrival moment, room tour and the view\nFood and one experience on the property\nLocation and how to book',
			donts: 'No other hotels or booking apps\nNo negative weather or delay content',
			hashtags: ['#travelgram', '#staycation']
		}
	},
	{
		id: 'food',
		label: 'Café or restaurant',
		categories: ['Food & drink'],
		brief: {
			message: 'The place to be this weekend',
			dos: 'Signature dishes and drinks up close\nAmbience and the first-bite reaction\nLocation, timings and price range',
			donts: 'No other restaurants or delivery apps\nNo alcohol in frame unless agreed',
			hashtags: ['#foodie', '#cafehopping']
		}
	},
	{
		id: 'fitness',
		label: 'Fitness or wellness',
		categories: ['Fitness', 'Wellness'],
		brief: {
			message: 'Feel good, every single day',
			dos: 'Use it in a real workout or routine\nShare your honest experience\nShow the product clearly in the first 3 seconds',
			donts: 'No weight-loss or medical claims\nNo before/after body comparisons',
			hashtags: ['#fitnessmotivation', '#wellness']
		}
	},
	{
		id: 'tech',
		label: 'Tech or gadget',
		categories: ['Tech'],
		brief: {
			message: 'Small gadget, big upgrade to your day',
			dos: 'Unboxing in the first few seconds\nThree features you actually use\nWhere to buy and any launch offer',
			donts: 'No competitor devices in frame\nNo unverified specs or claims',
			hashtags: ['#techreview', '#gadgets']
		}
	},
	{
		id: 'home',
		label: 'Home decor',
		categories: ['Home'],
		brief: {
			message: 'Make your space feel like you',
			dos: 'Before and after of the corner you styled\nClose-ups of material and finish\nStyling tips viewers can copy',
			donts: 'No other home brands visible',
			hashtags: ['#homedecor', '#interiorinspo']
		}
	},
	{
		id: 'jewellery',
		label: 'Jewellery',
		categories: ['Jewellery'],
		brief: {
			message: 'Everyday pieces you never take off',
			dos: 'Macro shots of the details\nStyle it with two different looks\nShow packaging if it is gift-ready',
			donts: 'No other jewellery brands\nNo heavy filters that change the metal colour',
			hashtags: ['#jewellery', '#everydayjewelry']
		}
	}
];

export const templateFor = (category?: string) => BRIEF_TEMPLATES.find((t) => category && t.categories.includes(category));

const FIELDS = ['message', 'dos', 'donts', 'hashtags'] as const;
type Field = (typeof FIELDS)[number];
const norm = (v: BriefDetails[Field]) => (Array.isArray(v) ? v.join(' ') : (v ?? '')).trim();

/** Fields holding text someone typed themselves (not empty, not any template's wording). */
export function customFields(current: BriefDetails): Field[] {
	return FIELDS.filter((k) => {
		const v = norm(current[k]);
		return v !== '' && !BRIEF_TEMPLATES.some((t) => norm(t.brief[k]) === v);
	});
}

/** Switch to a template. Empty fields and fields still holding a template's wording always take the new
 *  template's; text someone typed is kept unless `replaceCustom`. */
export function applyTemplate(current: BriefDetails, t: BriefTemplate, replaceCustom = false): BriefDetails {
	const custom = new Set(replaceCustom ? [] : customFields(current));
	const next: BriefDetails = { ...current };
	for (const k of FIELDS) if (!custom.has(k)) (next as Record<Field, unknown>)[k] = t.brief[k];
	return next;
}
