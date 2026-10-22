import { redirect } from '@sveltejs/kit';
import { isAppHost } from '#lib/creatorHost.ts';

// Miracle's own address (app.miracleapp.live) has no creator's page: it opens on sign-up,
// which sends anyone already signed in on to their home.
export const load = () => {
	if (typeof location !== 'undefined' && isAppHost(location.hostname)) redirect(307, '/signup');
};
