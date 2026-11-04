// The brand app's places, grouped like the creator's studio: Today, Collabs, Plan, Money and the brand
// itself. Phones show the groups in the bottom bar and their pages as tabs under the top bar; laptops
// show them in the side menu with the same tabs over the page.
export type BrandTab = { href: string; label: string };
export type BrandGroup = { href: string; label: string; icon: string; tabs?: BrandTab[]; also?: string[]; me?: boolean };

export function brandGroups(onApp: boolean): BrandGroup[] {
	return [
		{ href: '/brand', label: 'Today', icon: 'home' },
		{
			// The work in progress: requests, campaigns and their dates, the creators you work with, pools.
			href: '/brand/requests',
			label: 'Collabs',
			icon: 'board',
			tabs: [
				{ href: '/brand/requests', label: 'Requests' },
				{ href: '/brand/campaigns', label: 'Campaigns' },
				{ href: '/brand/business/calendar', label: 'Calendar' },
				{ href: '/brand/creators', label: 'Creators' },
				{ href: '/brand/creators?tab=pools', label: 'Pools' }
			],
			also: ['/brand/requests', '/brand/creators', '/brand/creator/', '/brand/r/', '/brand/new', '/brand/campaigns', '/brand/business/calendar', '/brand/business/content', '/brand/business/turnaround', '/brand/autopilots', '/brand/grow']
		},
		// The marketplace: every creator open to brands, ranked on their record (its own tab, in the middle).
		{ href: '/brand/explore', label: 'Explore', icon: 'search', also: ['/brand/explore'] },
		{
			// Like the creator's Money: the overview (Reports) first, then Payments and Shipping.
			href: '/brand/reports',
			label: 'Money',
			icon: 'wallet',
			tabs: [
				{ href: '/brand/reports', label: 'Reports' },
				{ href: '/brand/business/money', label: 'Payments' },
				{ href: '/brand/business/shipping', label: 'Shipping' }
			],
			also: ['/brand/reports', '/brand/business/money', '/brand/business/shipping']
		},
		// The brand's own profile first (like the creator's My page); settings one tap away.
		{ href: '/brand/profile', label: 'Brand', icon: 'gear', me: true, also: ['/brand/profile', '/brand/settings', '/brand/details', '/brand/business/team', '/brand/help', '/brand/alerts'] }
	];
}

/** The group a page belongs to. */
export function groupOf(groups: BrandGroup[], path: string) {
	return groups.find((g) => (g.href === '/brand' ? path === '/brand' : (g.also ?? [g.href]).some((h) => path === h || path.startsWith(h.endsWith('/') ? h : h + '/'))));
}

/** Is this tab the open page? Tabs with a ?tab= match on it; the others on the path alone. */
export function tabOn(t: BrandTab, url: { pathname: string; searchParams: { get(k: string): string | null } }) {
	const [p, q] = t.href.split('?');
	if (url.pathname !== p) return false;
	const want = new URLSearchParams(q ?? '').get('tab') ?? '';
	return (url.searchParams.get('tab') ?? '') === want;
}

/**
 * Laptop tabs over the page. The side menu already lists Calendar, Content, Money and Reports, so
 * (as in the studio) the tabs only hold pages the side menu doesn't: a section's own sub-pages.
 */
export function deskTabs(onApp: boolean, url: { pathname: string; searchParams: { get(k: string): string | null } }): BrandTab[] | null {
	const sets: BrandTab[][] = [
		[
			{ href: '/brand/requests', label: 'Requests' },
			{ href: '/brand/creators', label: 'Creators' },
			{ href: '/brand/creators?tab=pools', label: 'Pools' }
		],
		[
			{ href: '/brand/campaigns', label: 'Campaigns' },
			{ href: '/brand/business/turnaround', label: 'Turnaround' },
			{ href: '/brand/autopilots', label: 'Autopilots' }
		],
		[
			{ href: '/brand/business/money', label: 'Payments' },
			{ href: '/brand/business/shipping', label: 'Shipping' }
		]
	];
	return sets.find((tabs) => tabs.some((t) => tabOn(t, url))) ?? null;
}
