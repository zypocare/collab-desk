import { version } from '$app/env';
import { isNative, native } from './native';

/** When these screens were last updated (SvelteKit stamps each build with the time it was made). */
export const BUILD_LABEL = (() => {
	const t = Number(version);
	return Number.isFinite(t) && t > 0 ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : version;
})();

/** The version line in Settings. In the phone app, the app's real version from the phone ("App 1.0.4 (17)", from
 *  mobile/package.json and the build number, never typed by hand) and when the screens were updated: those come
 *  from the server, so they're newer than the app. On the web, just when it was updated. */
export const appVersion = $state({ line: '' });
function fill() {
	appVersion.line = isNative() ? `${native.version ? `App ${native.version}` : 'Phone app'} · screens updated ${BUILD_LABEL}` : `Updated ${BUILD_LABEL}`;
}
if (typeof window !== 'undefined') {
	fill();
	// The phone answers a moment after the app starts.
	if (isNative() && !native.version) {
		const t = setInterval(() => {
			fill();
			if (native.version) clearInterval(t);
		}, 400);
		setTimeout(() => clearInterval(t), 10_000);
	}
}
