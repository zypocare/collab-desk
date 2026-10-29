// Festival themes for Today's top card: each runs between two dates, then goes away by itself.
// Diwali 2026: Dhanteras 6 Nov, Diwali (Lakshmi Puja) Sunday 8 Nov, Bhai Dooj 10–11 Nov.

export type Festival = { key: 'diwali'; from: string; day: string; to: string };

const FESTIVALS: Festival[] = [{ key: 'diwali', from: '2026-10-29', day: '2026-11-08', to: '2026-11-11' }];

const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The festival on now (by the phone's own date), or null. */
export function festivalNow(d = new Date()): Festival | null {
	const t = isoOf(d);
	return FESTIVALS.find((f) => t >= f.from && t <= f.to) ?? null;
}

/** Days from today to the festival's day (0 on the day, negative after it). */
export function daysTo(f: Festival, d = new Date()) {
	const a = new Date(isoOf(d) + 'T00:00:00').getTime();
	const b = new Date(f.day + 'T00:00:00').getTime();
	return Math.round((b - a) / 864e5);
}

/** The greeting and a line for the date, in the festival's days. */
export function diwaliWords(f: Festival, d = new Date()): { greet: string | null; note: string } {
	const n = daysTo(f, d);
	if (n <= 0) return { greet: 'Happy Diwali', note: n === 0 ? 'Shubh Deepavali' : 'Diwali week' };
	if (n === 1) return { greet: null, note: 'Diwali tomorrow' };
	if (n === 2) return { greet: 'Happy Dhanteras', note: 'Diwali in 2 days' };
	return { greet: null, note: `Diwali in ${n} days` };
}

/** Her birthday (day and month), as Today sees it: 'eve' the day before, 'day' on it (29 February is the 28th in other
 *  years), else null. The card changes at midnight by the phone's own clock. */
export function birthdayNow(day: number | null | undefined, month: number | null | undefined, d = new Date()): 'eve' | 'day' | null {
	if (!day || !month) return null;
	const y = d.getFullYear();
	const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
	const dd = month === 2 && day === 29 && !leap ? 28 : day;
	const on = (x: Date) => x.getMonth() + 1 === month && x.getDate() === dd;
	if (on(d)) return 'day';
	const next = new Date(d);
	next.setDate(d.getDate() + 1);
	return on(next) ? 'eve' : null;
}
