export const ROOT = 'miracleapp.live';
export const siteOf = (slug: string) => `https://${slug}.${ROOT}`;
export const igOf = (handle: string) => `https://instagram.com/${handle.replace(/^@+/, '')}`;

export const inr = (n: number | null | undefined) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const num = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('en-IN');

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
	return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const STATUS_LABEL: Record<string, string> = { pending: 'Waiting', active: 'Active', paused: 'Paused', declined: 'Declined' };
