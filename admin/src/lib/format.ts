export const ROOT = 'miracleapp.live';
export const siteOf = (slug: string) => `https://${slug}.${ROOT}`;
export const igOf = (handle: string) => `https://instagram.com/${handle.replace(/^@+/, '')}`;

export const inr = (n: number | null | undefined) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
/** ₹1,999.85: rupees and paise, for tax invoices. */
export const inr2 = (n: number | null | undefined) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('en-IN');

/** ₹1.2L, ₹48k, ₹900; "—" for nothing. */
export function inrShort(n: number | null | undefined) {
	const v = Number(n) || 0;
	if (!v) return '—';
	if (Math.abs(v) >= 1e7) return '₹' + (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
	if (Math.abs(v) >= 1e5) return '₹' + (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
	if (Math.abs(v) >= 1e3) return '₹' + Math.round(v / 1e3) + 'k';
	return '₹' + Math.round(v);
}

/** Like inrShort, but ₹0 for nothing (for totals). */
export const inr0 = (n: number | null | undefined) => (Number(n) ? inrShort(n) : '₹0');

/** 48.2k, 1.3M */
export function compact(n: number | null | undefined) {
	const v = Number(n) || 0;
	if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
	if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'k';
	return String(v);
}

/** "3 hours ago", "2 days ago"; older than a month shows the date. */
export function ago(ts: string | null | undefined) {
	if (!ts) return '—';
	const t = new Date(ts).getTime();
	if (!t) return '—';
	const m = Math.max(0, Math.round((Date.now() - t) / 60000));
	if (m < 2) return 'just now';
	if (m < 60) return `${m} min ago`;
	const h = Math.round(m / 60);
	if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
	const d = Math.round(h / 24);
	if (d < 31) return `${d} day${d === 1 ? '' : 's'} ago`;
	return day(ts);
}

/** 24 Oct 2026 */
export const day = (ts: string | null | undefined) => (ts ? new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
/** 24 Oct, 10:41 */
export const when = (ts: string | null | undefined) =>
	ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

export const STATUS_LABEL: Record<string, string> = { pending: 'Waiting', active: 'Active', paused: 'Paused', declined: 'Declined', closed: 'Closed', deleted: 'Deleted' };
export const STATUS_TAG: Record<string, string> = { pending: 't-warn', active: 't-ok', paused: 't-info', declined: 't-mute', closed: 't-bad', deleted: 't-bad' };
export const STAGE_LABEL: Record<string, string> = {
	request: 'Request', negotiating: 'Negotiating', confirmed: 'Confirmed', creating: 'Creating', live: 'Live', wrapped: 'Wrapped', paused: 'Paused', cancelled: 'Cancelled', declined: 'Declined'
};
export const STAGE_TAG: Record<string, string> = {
	request: 't-mute', negotiating: 't-warn', confirmed: 't-info', creating: 't-acc', live: 't-acc', wrapped: 't-ok', paused: 't-info', cancelled: 't-bad', declined: 't-mute'
};
export const label = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—');
export const initials = (s: string | null | undefined) =>
	(s || '?')
		.replace(/@.*/, '')
		.split(/[\s._-]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]!.toUpperCase())
		.join('') || '?';
