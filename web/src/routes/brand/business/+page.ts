import { redirect } from '@sveltejs/kit';

// /brand/business opens on Money.
export const load = () => {
	redirect(307, '/brand/business/money');
};
