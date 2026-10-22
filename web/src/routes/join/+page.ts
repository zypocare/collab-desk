import { redirect } from '@sveltejs/kit';
import { appAddress } from '#lib/creatorHost.ts';

// The old "claim a link" page: sign-up now lives on Miracle's own address.
export const load = () => {
	if (typeof location !== 'undefined') redirect(307, appAddress('/signup?as=creator'));
};
