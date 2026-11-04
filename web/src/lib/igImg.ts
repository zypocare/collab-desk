// Instagram's pictures (profile photos, post thumbnails) go through our own address (/api/img, the worker),
// which keeps a copy at Cloudflare for 30 days. Instagram's links stop working after a few days; the copy
// keeps showing, loads from close by, and works the same in the phone app and in a browser.
const IG_HOST = /(^|\.)(cdninstagram\.com|fbcdn\.net|fbsbx\.com)$/i;

export function igImg(src: string | null | undefined): string {
	if (!src) return '';
	try {
		const u = new URL(src);
		return u.protocol === 'https:' && IG_HOST.test(u.hostname) ? `/api/img?u=${encodeURIComponent(src)}` : src;
	} catch {
		return src;
	}
}
