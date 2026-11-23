<script lang="ts">
	import { topReels } from '../grow.svelte';
	import { bestSlot, postingEvidence, slotLabel } from '../postTime';
	import { studio } from '../studio.svelte';
	import type { Collab } from '../types';
	import { compact, fmt, inr, outstanding } from '../util';
	import HomeStoryRow from './HomeStoryRow.svelte';

	let { monthName, received, paidN, od, nextPayout }: {
		monthName: string;
		received: number;
		paidN: number;
		od: Collab[];
		nextPayout?: Collab;
	} = $props();

	const slot = $derived(bestSlot(studio.media));
	const reel = $derived(topReels(studio.media, 1)[0]);
	const payment = $derived(od[0] ?? nextPayout);
	const stories = $derived([
		{ label: 'Wrapped', icon: 'spark', color: 'var(--g2)', title: monthName + ' wrapped',
			body: received ? `You received ${inr(received)} from ${paidN} ${paidN === 1 ? 'brand' : 'brands'} this month.` : 'Your monthly recap starts with your first recorded payment.',
			action: 'View money', href: '/studio/money' },
		{ label: 'AI Tips', icon: 'chart', color: 'var(--g1)', title: slot ? slotLabel(slot) : 'Find your posting time',
			body: slot ? postingEvidence(slot) : 'Grow uses your Instagram post history to suggest when to publish your next reel.',
			action: 'Open Grow', href: '/studio/grow' },
		{ label: 'Due soon', icon: 'wallet', color: 'var(--g3)', title: payment ? payment.brand.name : 'No payments due',
			body: payment ? `${inr(outstanding(payment))} ${od.length ? 'overdue' : 'outstanding'}${payment.pay_due ? ' · Due ' + fmt(payment.pay_due) : ''}.` : 'Upcoming payouts and overdue invoices appear here when they have a due date.',
			action: 'View payments', href: '/studio/payments' },
		{ label: 'Top Reel', icon: 'film', color: 'var(--ok)', title: reel ? 'Your top reel in 90 days' : 'Your reel highlights',
			body: reel ? [reel.views ? compact(reel.views) + ' views' : compact(reel.reach ?? 0) + ' accounts reached', reel.caption?.slice(0, 100)].filter(Boolean).join(' · ') : 'Your best-performing reel appears here once Instagram shares its numbers.',
			action: 'View insights', href: '/studio/grow/insights' },
		{ label: 'Briefs', icon: 'inbox', color: 'var(--sky, #75bbef)', title: 'Open brand briefs',
			body: 'Explore open briefs and pitch a brand with your idea.',
			action: 'Explore briefs', href: '/studio/pitches' }
	]);
</script>

<HomeStoryRow label="Creator stories" {stories} />
