// Addresses inside the panel: #/creators, #/creators/27, #/workspaces/<uuid>. The older #overview-style
// addresses still land in the right place.
const OLD: Record<string, string> = { overview: 'dashboard', requests: 'signups', creators: 'creators', brands: 'brands', support: 'support', problems: 'problems', safety: 'safety' };

function parse(): { section: string; id: string } {
	const h = location.hash.replace(/^#\/?/, '');
	if (OLD[h]) return { section: OLD[h], id: '' };
	const [section = '', id = ''] = h.split('?')[0].split('/');
	return { section: section || 'dashboard', id: decodeURIComponent(id) };
}

export const route = $state(parse());

if (typeof window !== 'undefined') {
	addEventListener('hashchange', () => {
		const r = parse();
		route.section = r.section;
		route.id = r.id;
		document.querySelector('main')?.scrollTo?.(0, 0);
		scrollTo(0, 0);
	});
}

export const href = (section: string, id?: string | number | null) => `#/${section}${id != null && id !== '' ? '/' + encodeURIComponent(String(id)) : ''}`;
export function go(section: string, id?: string | number | null) {
	location.hash = href(section, id);
}
