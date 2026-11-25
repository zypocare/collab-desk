<script lang="ts">
	import { topReels } from '../grow.svelte';
	import { bestSlot, postingEvidence, slotLabel } from '../postTime';
	import { studio } from '../studio.svelte';
	import type { Collab } from '../types';
	import { compact, diff, fmt, inr, inrS, isActive, outstanding, today } from '../util';
	import HomeStoryRow, { type Story } from './HomeStoryRow.svelte';

	let { monthName, received, paidN, od, nextPayout }: {
		monthName: string;
		received: number;
		paidN: number;
		od: Collab[];
		nextPayout?: Collab;
	} = $props();

	const slot = $derived(bestSlot(studio.media));
	const topList = $derived(topReels(studio.media, 3));
	const reel = $derived(topList[0]);
	const goal = $derived(studio.settings?.monthly_goal || 0);
	const goalPct = $derived(goal ? Math.min(100, Math.round((received / goal) * 100)) : 0);
	const activeCollabs = $derived(studio.collabs.filter(isActive));
	const pendingPay = $derived(
		studio.collabs
			.filter((c) => c.type !== 'barter' && c.pay_status !== 'paid' && outstanding(c) > 0 && (c.pay_status === 'invoiced' || c.pay_status === 'advance' || c.stage === 'live' || c.stage === 'wrapped'))
			.sort((a, b) => outstanding(b) - outstanding(a))
	);
	const pendingTotal = $derived(pendingPay.reduce((sum, c) => sum + outstanding(c), 0));
	const ym = today().toISOString().slice(0, 7);
	const paidThisMonth = $derived(
		studio.collabs
			.filter((c) => c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(ym) && (c.pay_received || 0) > 0)
			.sort((a, b) => (b.pay_received || 0) - (a.pay_received || 0))
			.slice(0, 3)
	);
	const payment = $derived(od[0] ?? nextPayout ?? pendingPay[0]);

	const stories = $derived<Story[]>([
		{
			label: 'Wrapped',
			icon: 'spark',
			color: 'var(--g2, #f25a90)',
			stamp: `${monthName.toUpperCase()} RECAP`,
			title: `${monthName} wrapped`,
			heroNumeric: received > 0 ? received : undefined,
			heroFormat: 'inr',
			heroSub: received > 0 ? `Received in ${monthName}` : `${monthName} wrapped`,
			body: received
				? `You received ${inr(received)} from ${paidN} ${paidN === 1 ? 'brand' : 'brands'} so far this month.`
				: 'Your monthly recap starts animating as soon as your first payment lands.',
			progress: goal
				? { label: `Monthly goal (${inrS(goal)})`, valueText: `${goalPct}% reached`, pct: goalPct }
				: undefined,
			stats: [
				{ label: 'Brands paid', value: String(paidN) },
				{ label: 'Active collabs', value: String(activeCollabs.length) },
				{ label: 'Yet to come', value: inrS(pendingTotal) }
			],
			items: paidThisMonth.map((c) => ({
				title: c.brand.name,
				sub: c.paid_on ? `Paid ${fmt(c.paid_on)}` : 'Settled',
				right: inrS(c.pay_received || 0)
			})),
			action: 'View money',
			href: '/studio/money'
		},
		{
			label: 'AI Tips',
			icon: 'chart',
			color: 'var(--g1, #9c7bff)',
			stamp: slot ? 'PEAK WINDOW' : 'AI INSIGHT',
			title: slot ? slotLabel(slot) : 'Find your best posting time',
			heroText: slot ? slotLabel(slot) : undefined,
			heroSub: slot ? 'Best time to publish your next Reel' : undefined,
			body: slot
				? postingEvidence(slot)
				: 'Grow analyzes your Instagram post history to pinpoint when your audience watches most.',
			progress: slot?.lift
				? { label: 'Typical views lift vs usual', valueText: `+${Math.round(slot.lift)}% higher`, pct: Math.min(100, Math.max(25, Math.round(slot.lift))) }
				: undefined,
			stats: [
				{ label: 'Posts analyzed', value: String(studio.media.length || 0) },
				{ label: 'Active collabs', value: String(activeCollabs.length) }
			],
			action: 'Open Grow',
			href: '/studio/grow'
		},
		{
			label: 'Due soon',
			icon: 'wallet',
			color: 'var(--g3, #ffae6b)',
			stamp: od.length ? `${od.length} OVERDUE` : pendingTotal > 0 ? 'YET TO COME' : 'ALL CLEAR',
			title: payment ? payment.brand.name : 'All payments clear',
			heroNumeric: pendingTotal > 0 ? pendingTotal : undefined,
			heroFormat: 'inr',
			heroSub: pendingTotal > 0 ? 'Waiting to hit your bank' : undefined,
			body: payment
				? `${payment.brand.name} has ${inr(outstanding(payment))} ${od.length ? 'overdue' : 'outstanding'}${payment.pay_due ? ` · Due ${fmt(payment.pay_due)}` : ''}.`
				: 'Upcoming payouts and overdue invoices will show up here automatically.',
			stats: [
				{ label: 'Pending brands', value: String(pendingPay.length) },
				{ label: 'Overdue', value: String(od.length) }
			],
			items: pendingPay.slice(0, 3).map((c) => {
				const d = c.pay_due ? diff(c.pay_due) : null;
				return {
					title: c.brand.name,
					sub: d !== null ? (d < 0 ? `${-d}d late` : d === 0 ? 'Due today' : `Due ${fmt(c.pay_due)}`) : 'Invoice open',
					right: inrS(outstanding(c))
				};
			}),
			action: 'View payments',
			href: '/studio/payments'
		},
		{
			label: 'Top Reel',
			icon: 'film',
			color: 'var(--ok, #6fd08c)',
			stamp: reel ? '90-DAY WINNER' : 'REEL STATS',
			title: reel ? 'Your top reel in 90 days' : 'Your reel highlights',
			heroNumeric: reel ? (reel.views || reel.reach || 0) : undefined,
			heroFormat: 'compact',
			heroSub: reel ? (reel.views ? 'Views on your #1 Reel' : 'Accounts reached') : undefined,
			body: reel?.caption
				? reel.caption.slice(0, 110) + (reel.caption.length > 110 ? '…' : '')
				: 'Your highest-performing reel appears here once Instagram shares its numbers.',
			stats: reel
				? [
						{ label: 'Reach', value: compact(reel.reach ?? 0) },
						{ label: 'Likes', value: compact(reel.likes ?? 0) },
						{ label: 'Comments', value: compact(reel.comments ?? 0) }
					]
				: undefined,
			action: 'View insights',
			href: '/studio/grow/insights'
		},
		{
			label: 'Briefs',
			icon: 'inbox',
			color: 'var(--sky, #75bbef)',
			stamp: 'OPEN OPPORTUNITIES',
			title: 'Open brand briefs',
			body: 'Browse live brand briefs, see budgets upfront, and pitch your idea in one tap.',
			stats: [
				{ label: 'Active collabs', value: String(activeCollabs.length) },
				{ label: 'In talks', value: String(studio.collabs.filter((c) => c.stage === 'negotiating' && !c.someday).length) }
			],
			action: 'Explore briefs',
			href: '/studio/pitches'
		}
	]);
</script>

<HomeStoryRow label="Creator stories" {stories} />
