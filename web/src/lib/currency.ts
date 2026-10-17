// Foreign brands: amounts in their currency, and today's rate to rupees.
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD';
export const CURRENCIES: { value: Currency; label: string; sign: string }[] = [
	{ value: 'INR', label: '₹ Indian rupee', sign: '₹' },
	{ value: 'USD', label: '$ US dollar', sign: '$' },
	{ value: 'EUR', label: '€ Euro', sign: '€' },
	{ value: 'GBP', label: '£ British pound', sign: '£' },
	{ value: 'AED', label: 'AED UAE dirham', sign: 'AED ' },
	{ value: 'SGD', label: 'S$ Singapore dollar', sign: 'S$' }
];
export const signOf = (c: string | null | undefined) => CURRENCIES.find((x) => x.value === c)?.sign ?? '₹';

/** An amount with its currency: ₹ in the Indian style, others with two decimals when needed. */
export function money(n: number | null | undefined, cur: string | null | undefined = 'INR') {
	const v = Number(n) || 0;
	if (!cur || cur === 'INR') return '₹' + Math.round(v).toLocaleString('en-IN');
	const whole = Math.abs(v - Math.round(v)) < 0.005;
	return signOf(cur) + v.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** A rupee price in another currency, rounded the way people quote (to 5 above 100). */
export function fromInr(inr: number, rate: number) {
	const v = (Number(inr) || 0) / (rate || 1);
	return v >= 100 ? Math.round(v / 5) * 5 : Math.round(v);
}

/** Today's rate: rupees for one unit. Free reference rates (European Central Bank); the dirham is
 *  pegged to the dollar. Returns null when offline, so she types it in. */
export async function rateToday(cur: Currency): Promise<number | null> {
	if (cur === 'INR') return 1;
	try {
		const from = cur === 'AED' ? 'USD' : cur;
		const r = await fetch(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=INR`);
		if (!r.ok) return null;
		const inr = Number((await r.json())?.rates?.INR);
		if (!inr) return null;
		return Math.round((cur === 'AED' ? inr / 3.6725 : inr) * 100) / 100;
	} catch {
		return null;
	}
}

export const COUNTRIES = ['India', 'United Arab Emirates', 'United States', 'United Kingdom', 'Singapore', 'Germany', 'France', 'Netherlands', 'Canada', 'Australia', 'Other'];
/** The currency a brand from this country usually pays in. */
export const currencyFor = (country: string): Currency =>
	({ India: 'INR', 'United Arab Emirates': 'AED', 'United States': 'USD', 'United Kingdom': 'GBP', Singapore: 'SGD', Germany: 'EUR', France: 'EUR', Netherlands: 'EUR' } as Record<string, Currency>)[country] ?? 'USD';
