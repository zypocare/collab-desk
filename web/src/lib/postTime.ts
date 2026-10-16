// Posting time: the time options she picks from, and her best time to post, worked out from how
// her own recent posts did by the hour they went up (India time).
import type { IgMedia } from './types';

/** "19:00:00" or "19:00" -> "7:00 PM" */
export function timeLabel(t: string | null | undefined) {
	if (!t) return '';
	const [h, m] = t.split(':').map(Number);
	return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Every half hour from 6 AM to 11:30 PM. */
export const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
	const h = 6 + Math.floor(i / 2);
	const v = `${String(h).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
	return { value: v, label: timeLabel(v) };
});

const istHour = (iso: string) => Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).slice(0, 2)) % 24;
const score = (m: IgMedia) => (m.interactions ?? (m.likes ?? 0) + (m.comments ?? 0) + (m.saves ?? 0) + (m.shares ?? 0)) || 0;

export type BestTime = { from: number; value: string; label: string; lift: number; posts: number };

/** The 2-hour window her posts do best in (needs a few posts in it), and how much better than her average. */
export function bestTime(media: IgMedia[]): BestTime | null {
	const posts = media.filter((m) => m.posted_at && score(m) > 0);
	if (posts.length < 6) return null;
	const avg = posts.reduce((a, m) => a + score(m), 0) / posts.length;
	const buckets = new Map<number, number[]>();
	for (const m of posts) {
		const b = Math.floor(istHour(m.posted_at) / 2) * 2;
		buckets.set(b, [...(buckets.get(b) ?? []), score(m)]);
	}
	let best: BestTime | null = null;
	for (const [from, xs] of buckets) {
		if (xs.length < 2 || from < 6) continue;
		const v = xs.reduce((a, x) => a + x, 0) / xs.length;
		const lift = Math.round((v / avg - 1) * 100);
		if (!best || lift > best.lift) {
			const to = from + 2;
			const span = `${((from + 11) % 12) + 1}–${((to + 11) % 12) + 1} ${to <= 12 ? 'AM' : 'PM'}`;
			best = { from, value: `${String(from).padStart(2, '0')}:00`, label: span, lift, posts: xs.length };
		}
	}
	return best && best.lift >= 10 ? best : null;
}

/** The options, plus the collab's current time if it isn't on the half hour. */
export function timeOptions(cur: string | null | undefined) {
	const v = cur?.slice(0, 5);
	return v && !TIME_OPTIONS.some((o) => o.value === v) ? [...TIME_OPTIONS, { value: v, label: timeLabel(v) }].sort((a, b) => a.value.localeCompare(b.value)) : TIME_OPTIONS;
}
