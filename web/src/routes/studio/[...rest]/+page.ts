import { error } from '@sveltejs/kit';

// Any studio address that isn't a page: a 404 shown inside the studio (sidebar and all), not a bare page.
export const load = () => {
	error(404, 'Not found');
};
