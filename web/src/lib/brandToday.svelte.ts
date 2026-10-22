// Today for a brand: what the creator's Today shows, worked out from the brand's side. The dashboard
// (creators, what waits on the brand), money across every creator and the week's go-lives.
import { auth } from './auth.svelte';
import { brandHome, loadDashboard } from './brand.svelte';
import { brandIg } from './brandIg.svelte';
import { call, type CalEvent, type Money } from './business.svelte';
import { iso, today } from './util';

export const brandToday = $state<{ money: Money | null; week: CalEvent[] }>({ money: null, week: [] });

export async function loadBrandToday() {
	const t = today();
	const end = new Date(t.getTime() + 6 * 864e5);
	await Promise.all([
		loadDashboard(),
		call<Money>('brand_money').then((m) => (brandToday.money = m)).catch(() => {}),
		call<CalEvent[]>('brand_calendar', { p_from: iso(t), p_to: iso(end) }).then((w) => (brandToday.week = w ?? [])).catch(() => {})
	]);
}

/** A new brand's first steps, like a new creator's set-up card. */
export function brandSetup() {
	const acc = auth.account?.role === 'brand' ? auth.account : null;
	const d = brandHome.dash;
	return [
		{ id: 'company', done: !!(acc?.profile || acc?.brand), title: 'Company details', sub: 'Name, category and your role', href: '/brand/settings', act: 'Add' },
		{ id: 'ig', done: !!brandIg.data, title: "Connect your brand's Instagram", sub: "Creators see you're the real brand", href: '/brand/settings', act: 'Connect' },
		{ id: 'billing', done: !!(acc?.profile?.gstin || acc?.brand), title: 'Billing details', sub: 'GSTIN and address, for GST you can claim', href: '/brand/settings?s=billing', act: 'Add' },
		{ id: 'first', done: !!d?.creators?.length, title: 'Send your first request', sub: 'To one creator, or a campaign to a pool', href: '/brand/creators?tab=discover', act: 'Find' }
	];
}

/** What a week event is, in the words the creator's Today uses. */
export const KIND_WORD: Record<CalEvent['kind'], string> = { live: 'Goes live', draft: 'Draft due', shoot: 'Shoot' };
export const KIND_LINE: Record<CalEvent['kind'], string> = {
	live: 'The post goes up on Instagram',
	draft: 'A first cut to approve',
	shoot: 'The creator films your content'
};
