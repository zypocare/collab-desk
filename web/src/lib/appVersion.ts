import { version } from '$app/env';

/** The release number shown to people. Bump it with each release. */
export const APP_VERSION = '1.0.0';

/** When this build was made (SvelteKit stamps each build with the time it was made). */
export const BUILD_LABEL = (() => {
	const t = Number(version);
	return Number.isFinite(t) && t > 0 ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : version;
})();
