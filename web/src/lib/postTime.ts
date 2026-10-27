// Posting time: the time options she picks from, and her best time to post, worked out from how
// her own recent posts did by the hour they went up (India time).
export { bestSlot, bestSlot as bestTime, slotLabel, postingEvidence, postingTimeInsights, schedulingSlot, nextSlots, POSTING_MEDIA_LIMIT } from '../../../supabase/functions/_shared/postingTime.ts';
export type { PostingSlot, PostingInsights } from '../../../supabase/functions/_shared/postingTime.ts';

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

/** The options, plus the collab's current time if it isn't on the half hour. */
export function timeOptions(cur: string | null | undefined) {
	const v = cur?.slice(0, 5);
	return v && !TIME_OPTIONS.some((o) => o.value === v) ? [...TIME_OPTIONS, { value: v, label: timeLabel(v) }].sort((a, b) => a.value.localeCompare(b.value)) : TIME_OPTIONS;
}
