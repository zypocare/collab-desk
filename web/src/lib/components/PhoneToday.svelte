<script lang="ts">
	import { receivedIn } from '../invoice';
	import { onMount, untrack } from 'svelte';
	import { addLeadAsCollab } from '../leads';
	import { askPaid, completeFollow, markPaid, markReceived, priorityOf, studio } from '../studio.svelte';
	import { copyText, ui } from '../ui.svelte';
	import { homeMotion, homeCount, homeChange } from '../homeMotion';
	import '../../home-motion.css';
	import {
		KIND_ICON,
		TYPE_LABEL,
		stageLabel,
		delivText,
		deliverableProgress,
		diff,
		events,
		firstName,
		initials,
		fmt,
		compact,
		hueOf,
		inTransit,
		inr,
		inrS,
		isActive,
		isPaid,
		iso,
		outstanding,
		overdue,
		parse,
		rel,
		relWord,
		mergeSteps,
		tasks,
		unreadFor,
		usageLabel,
		evLabel,
		today,
		type Task
	} from '../util';
	import AiDesk from './AiDesk.svelte';
	import NudgeList from './NudgeList.svelte';
	import AwayMode from './AwayMode.svelte';
	import Icon from './Icon.svelte';
	import PlayUpdateCard from './PlayUpdateCard.svelte';
	import GoldenHourBanner from './GoldenHourBanner.svelte';
	import Mono from './Mono.svelte';
	import Stories from './Stories.svelte';
	import HomeMoneyCard from './HomeMoneyCard.svelte';
	import TodayStories from './TodayStories.svelte';
	import HomeGreeting from './HomeGreeting.svelte';
	import { birthdayNow, diwaliWords, festivalNow } from '../festival';
	import AlertsPrompt from './AlertsPrompt.svelte';
	import BrandQuestions from './BrandQuestions.svelte';
	import SetupChecklist from '#lib/components/SetupChecklist.svelte';
	import { loadViews, views } from '#lib/profileViews.svelte.ts';
	import CheckupCard from '#lib/components/CheckupCard.svelte';

	onMount(() => void loadViews());

	// Today on a phone: a living header, swipeable money cards, shortcuts, what needs you as a deck
	// of cards, the week ahead and the pipeline. Everything is worked out from the same data as on a laptop.
	const s = $derived(studio.settings!);
	const list = $derived(studio.collabs);
	const T = today();
	const hour = new Date().getHours();
	// Her birthday (the day before, and the day) comes first; else a festival on now (festival.ts): its theme on
	// this card, and its greeting on the day.
	const bday = $derived(birthdayNow(studio.settings?.birth_day, studio.settings?.birth_month));
	const fest = festivalNow();
	const dw = fest ? diwaliWords(fest) : null;
	const greet = $derived(bday === 'day' ? 'Happy birthday' : dw?.greet ?? (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'));
	const note = $derived(bday === 'day' ? 'Today is all yours' : bday === 'eve' ? 'Your birthday is tomorrow' : dw?.note ?? '');
	const monthName = T.toLocaleDateString('en-IN', { month: 'long' });
	const ym = iso(T).slice(0, 7);

	const ts = $derived.by(() => {
		// Tasks are ordered by deadline and urgency. Keep the first action for each collaboration.
		const byCollab = new Map<string, Task>();
		for (const task of mergeSteps(tasks(list))) {
			if (!byCollab.has(task.c.id)) byCollab.set(task.c.id, task);
		}
		const all = [...byCollab.values()];
		const ranked = all.filter((t) => t.kind === 'new').sort((a, b) => (priorityOf(b.c)?.score ?? 0) - (priorityOf(a.c)?.score ?? 0));
		let n = 0;
		return all.map((t) => (t.kind === 'new' ? ranked[n++] : t));
	});
	const urgent = $derived(ts.filter((t) => t.d <= 0).length);
	const active = $derived(list.filter(isActive));

	// Money
	const received = $derived(list.reduce((a, c) => a + receivedIn(c, ym), 0));
	const goal = $derived(s.monthly_goal || 0);
	const pct = $derived(goal ? Math.min(1, received / goal) : 0);
	const outs = $derived(list.reduce((a, c) => a + outstanding(c), 0));
	const od = $derived(list.filter(overdue));
	const odSum = $derived(od.reduce((a, c) => a + outstanding(c), 0));
	const paidCollabs = $derived(list.filter((c) => receivedIn(c, ym) > 0));
	const unpaidCollabs = $derived(list.filter((c) => outstanding(c) > 0));
	const paidN = $derived(new Set(paidCollabs.map((c) => c.brand_id)).size);
	const pctN = $derived(goal ? Math.round((received / goal) * 100) : 0);
	const nextPayout = $derived(
		list
			.filter((c) => isPaid(c) && c.pay_status !== 'paid' && c.pay_due && diff(c.pay_due) >= 0)
			.sort((a, b) => parse(a.pay_due!).getTime() - parse(b.pay_due!).getTime())[0]
	);
	let moneyView = $state(0);
	let tickerPaused = $state(false);
	const moneyLabels = $derived([`Received in ${monthName}`, 'Yet to come', 'Overdue payments', 'Next payout']);
	const moneyValue = $derived([received, outs, odSum, nextPayout ? outstanding(nextPayout) : 0][moneyView]);
	const moneyCaption = $derived([
		`from ${paidN} brand${paidN === 1 ? '' : 's'}${goal ? ` · ${pctN}% of this month's goal` : ''}`,
		'Across your unpaid collabs',
		od.length ? `${od.length} collab${od.length === 1 ? '' : 's'} waiting for payment` : 'All your payments are on track',
		nextPayout ? `${nextPayout.brand.name} · ${fmt(nextPayout.pay_due)}` : 'No payout scheduled yet'
	][moneyView]);
	function showMoney(index: number) { moneyView = (index + 4) % 4; }

	// The week
	const evs = $derived(events(list));
	const week = $derived(Array.from({ length: 7 }, (_, i) => ({ i, dt: parse(rel(i)), list: evs.filter((e) => e.date === rel(i)) })));
	const upcoming = $derived(evs.filter((e) => diff(e.date) >= 0 && diff(e.date) <= 6).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3));

	// A new possible collab spotted in her Instagram DMs opens "Add a collab" with its chat read in, the same as tapping
	// Add on it: once per chat (remembered on this phone), only here on Today, never over something already open.
	const POPPED = 'miracle.leadPopped';
	$effect(() => {
		const leads = studio.leads;
		if (!leads.length || ui.newCollab || ui.openCollab) return;
		untrack(() => {
			let seen: string[] | null = null;
			try {
				seen = JSON.parse(localStorage.getItem(POPPED) ?? 'null');
			} catch {
				/* private mode: fall through */
			}
			const remember = (ids: string[]) => {
				try {
					localStorage.setItem(POPPED, JSON.stringify(ids.slice(-200)));
				} catch {
					/* nothing to keep it in */
				}
			};
			if (!Array.isArray(seen)) return remember(leads.map((l) => l.igsid));
			const fresh = leads.find((l) => !seen.includes(l.igsid));
			if (!fresh) return;
			remember([...seen, fresh.igsid]);
			addLeadAsCollab(fresh.igsid, fresh.username, fresh.name);
		});
	});

	let leaving = $state<string | null>(null);
	// Needs you shows two, then "+N more" fans out the rest.
	let fanned = $state(false);
	function leaveThen(key: string, fn: () => void) {
		leaving = key;
		setTimeout(() => {
			fn();
			leaving = null;
		}, 380);
	}
	const when = (t: Task) => {
		if (t.kind === 'msg') return 'waiting for your reply';
		if (t.kind === 'new') return `received ${relWord(diff(t.c.received_on))}`;
		if (t.kind === 'pay') return `${-t.d} day${-t.d > 1 ? 's' : ''} late`;
		if (t.d < 0) return `${-t.d} day${-t.d > 1 ? 's' : ''} late`;
		return t.d === 0 ? 'today' : relWord(t.d);
	};
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	// Needs you, as tickets: red and pulsing when late or waiting on her, amber when it's coming up.
	const hot = (t: Task) => t.kind === 'pay' || t.kind === 'msg' || t.d < 0 || (t.kind === 'new' && diff(t.c.received_on) <= -1);
	const ticketMoney = (t: Task) => (t.c.type === 'barter' ? (t.c.product_value ? inrS(t.c.product_value) : 'Barter') : t.c.fee ? inrS(t.c.fee) : 'Quote');

	// Deliverable & status chips shown on each Needs You ticket
	function ticketChips(t: Task): { text: string; tone: '' | 'ok' | 'warn' | 'bad' }[] {
		const out: { text: string; tone: '' | 'ok' | 'warn' | 'bad' }[] = [];
		const prog = deliverableProgress(t.c.deliverables ?? []);
		if (prog.total > 0) {
			out.push({ text: `${prog.done}/${prog.total} pieces done`, tone: prog.done === prog.total ? 'ok' : '' });
		}
		if (t.c.shot_at) out.push({ text: 'Shoot done ✓', tone: 'ok' });
		const unread = unreadFor(t.c);
		if (unread > 0) out.push({ text: `${unread} unread msg${unread > 1 ? 's' : ''}`, tone: 'warn' });
		if (t.c.usage && !/organic/i.test(t.c.usage)) out.push({ text: usageLabel(t.c.usage), tone: 'warn' });
		return out.slice(0, 3);
	}

	// This week in one line (the day by day is on Plan).
	const weekN = $derived(week.reduce((a, d) => a + d.list.length, 0));
	const busiest = $derived([...week].sort((a, b) => b.list.length - a.list.length)[0]);
	const dayName = (d: Date, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'long' }));
	const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
	// The day strip: the day she taps, or the first day with something on it.
	let pick = $state<number | null>(null);
	const sel = $derived(pick ?? (week.find((d) => d.list.length)?.i ?? 0));
	const selDay = $derived(week[sel]);
	const ORDER = ['shoot', 'draft', 'product', 'live', 'pay', 'follow'];
	// The leaf's band takes the colour of the day's first thing, as on a collab's Dates.
	const LEAF: Record<string, string> = { shoot: '#9C7BFF', draft: '#C9B6FF', product: '#FFAE6B', live: '#F25A90', pay: '#6FD08C', follow: '#EFB35A' };
	const selList = $derived([...selDay.list].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)));
	const short = (d: Date, i: number) => (i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' }));
	const longDate = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
	function choose(i: number) {
		pick = i;
		try {
			navigator.vibrate?.(6);
		} catch {
			/* no vibration */
		}
	}
	// Her collab slots, Monday to Sunday, the same weeks and count as her brand page and Settings.
	const cap = $derived(Math.max(1, s.weekly_capacity ?? 3));
	const slotWeeks = $derived.by(() => {
		const m = new Date(T);
		m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
		return [0, 1].map((k) => {
			const start = new Date(m.getTime() + k * 7 * 864e5);
			const from = iso(start), to = iso(new Date(start.getTime() + 7 * 864e5));
			const n = list.filter((c) => ['confirmed', 'creating', 'live'].includes(c.stage) && (c.live_date ?? c.draft_date ?? c.preferred_live ?? '') >= from && (c.live_date ?? c.draft_date ?? c.preferred_live ?? '') < to).length;
			const day = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
			return { k, label: k ? 'Next week' : 'This week', range: k ? `from ${day(start)}` : `to ${day(new Date(start.getTime() + 6 * 864e5))}`, n };
		});
	});
	// The note speaks about next week once this one is nearly over (Saturday and Sunday).
	const slotNote = $derived.by(() => {
		const w = new Date(T).getDay() % 6 === 0 ? slotWeeks[1] : slotWeeks[0];
		const which = w.k ? 'next week' : 'this week';
		return w.n >= cap ? `Fully booked ${which}: brands see it as full.` : cap - w.n === 1 && cap > 1 ? `One slot open ${which}: brands see it as limited.` : `${cap - w.n} slots open ${which}.`;
	});
	// The same, as a short status for the card's corner: green open, amber one left, pink full.
	const slotState = $derived.by(() => {
		const w = new Date(T).getDay() % 6 === 0 ? slotWeeks[1] : slotWeeks[0];
		return w.n >= cap ? { t: 'Full', k: 'full' } : cap - w.n === 1 && cap > 1 ? { t: 'One left', k: 'low' } : { t: `${cap - w.n} open`, k: 'open' };
	});
	// The moving line under the circles (CRED's "cashback disbursed today"): today in numbers.
	const ticker = $derived(
		[
			received > 0 && { b: inrS(received), t: ` came in this ${monthName}` },
			urgent > 0 && { b: String(urgent), t: ` need${urgent === 1 ? 's' : ''} you today` },
			list.filter((c) => c.stage === 'request' && !c.someday).length > 0 && { b: String(list.filter((c) => c.stage === 'request' && !c.someday).length), t: ' new requests waiting' },
			outs > 0 && { b: inrS(outs), t: ' yet to come in' },
			goal > 0 && { b: `${pctN}%`, t: ` of the ${inrS(goal)} goal` },
			active.length > 0 && { b: String(active.length), t: ` active collab${active.length === 1 ? '' : 's'}` },
			nextPayout && { b: nextPayout.brand.name, t: ` pays next, ${fmt(nextPayout.pay_due!)}` },
			views.week > 0 && { b: String(views.week), t: ` brand${views.week === 1 ? '' : 's'} viewed your profile this week` }
		].filter((x): x is { b: string; t: string } => !!x)
	);
	// Beside the greeting: live Instagram numbers, or this month's goal when Instagram isn't connected.
	const ig = $derived(studio.ig?.connected ? studio.ig : null);
</script>

<div class="phone-today" use:homeMotion>
<HomeGreeting date={T} {greet} {note} festival={!!fest} name={firstName(s.display_name)} birthday={!!bday} picture={ig?.profile_picture_url} metricLabel="Cycle live creator metrics"
	followers={ig?.followers ?? 0} insights={ig?.insights}>
	{#snippet metrics(orbMode: number)}
		{#if orbMode === 0 && ig}
			<b>{compact(ig.followers ?? 0)}</b><small>followers</small>
		{:else if orbMode === 0}
			<b>{initials(s.display_name)}</b><small>Your studio</small>
		{:else if orbMode === 1}
			<b>{pctN}%</b><small>of {monthName.slice(0, 3)} goal</small>
			<span class="orb-pill gold">{inrS(received)}{goal ? ` / ${inrS(goal)}` : ''}</span>
		{:else}
			<b>{views.week || active.length}</b><small>{views.week ? 'brand views' : 'active deals'}</small>
			<span class="orb-pill pink">★ {active.length} active</span>
		{/if}
	{/snippet}
	{#snippet chips()}
		<a class="ht-chip" class:urgent={urgent > 0} href="#sec-needs" aria-label={urgent ? `${urgent} collaboration${urgent === 1 ? '' : 's'} needing attention today` : 'All caught up today'}>
			<span class="dot-ping" class:calm={!urgent}></span>
			<span>{#if urgent > 0}<b>{urgent}</b> need{urgent === 1 ? 's' : ''} you{:else}<b>Caught up</b>{/if}</span>
		</a>
		<a class="ht-chip" href="#sec-collabs" aria-label="{active.length} active collab{active.length === 1 ? '' : 's'}">
			{#if active.length}
				<span class="mini-avs" aria-hidden="true">
					{#each active.slice(0, 3) as ac (ac.id)}
						<i style="--h:var(--m{hueOf(ac.brand.name)})">{ac.brand.name.trim().slice(0, 1).toUpperCase()}</i>
					{/each}
				</span>
			{/if}
			<span><b>{active.length}</b> active</span>
		</a>
		{#if studio.leads.length}
			<a class="ht-chip" href="#sec-ai">
				<span class="ht-spark" aria-hidden="true">✦</span>
				<span><b>{studio.leads.length}</b> DM lead{studio.leads.length === 1 ? '' : 's'}</span>
			</a>
		{:else if views.week > 0}
			<a class="ht-chip" href="/studio/qr">
				<span class="ht-spark" aria-hidden="true">✦</span>
				<span><b>{views.week}</b> page view{views.week === 1 ? '' : 's'}</span>
			</a>
		{/if}
	{/snippet}
	{#snippet actions()}
		<button type="button" class="qa-card primary" onclick={() => (ui.newCollab = true)}>
			<span class="qa-ic"><Icon name="plus" /></span>
			<span>Add collab</span>
		</button>
		<a class="qa-card" href="/studio/import">
			<span class="qa-ic"><span class="qa-tag">AI</span><Icon name="inbox" /></span>
			<span>Paste DM</span>
		</a>
		<a class="qa-card" href="/studio/invoices">
			<span class="qa-ic"><Icon name="doc" /></span>
			<span>Invoices</span>
		</a>
		<a class="qa-card" href="/studio/qr">
			<span class="qa-ic"><Icon name="qr" /></span>
			<span>Bio & QR</span>
		</a>
	{/snippet}
</HomeGreeting>

	<PlayUpdateCard />
	<GoldenHourBanner />

<TodayStories {monthName} {received} {paidN} {od} {nextPayout} />
<Stories />

{#if ticker.length > 1}
	<div class="cr-ticker cr-tk" data-paused={tickerPaused} aria-label="Today in numbers"><div>{#each [0, 1] as k (k)}{#each ticker as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><i aria-hidden="true">✦</i>{/each}{/each}</div><button class="home-ticker-pause" aria-label={tickerPaused ? 'Resume numbers ticker' : 'Pause numbers ticker'} aria-pressed={tickerPaused} onclick={() => tickerPaused = !tickerPaused}>{tickerPaused ? '▶' : 'Ⅱ'}</button></div>
{/if}

<HomeMoneyCard {moneyView} {moneyLabels} {moneyValue} {moneyCaption} {pct} {pctN} ringLabel="of goal" {showMoney}
	href={moneyView ? '/studio/payments' : '/studio/money'} openLabel={moneyView ? 'Open payments' : 'Open Money'}>
	{#snippet action()}
		{#if goal}<a class="glass-chip" href="/studio/settings?s=payments"><Icon name="spark" />Goal {inrS(goal)}</a>{/if}
	{/snippet}
	{#snippet context()}
			{#if moneyView === 0}
				{#if paidCollabs.length > 0}
					<div class="hc-ctx-pills">
						{#each paidCollabs.slice(0, 3) as pc (pc.id)}
							<span class="hc-ctx-pill">{pc.brand.name} <b>{inrS(receivedIn(pc, ym))}</b></span>
						{/each}
					</div>
				{:else}
					<span class="hc-ctx-alert">Goal ring updates automatically as invoices are paid</span>
				{/if}
			{:else if moneyView === 1}
				{#if unpaidCollabs.length > 0}
					<div class="hc-ctx-pills">
						{#each unpaidCollabs.slice(0, 3) as uc (uc.id)}
							<span class="hc-ctx-pill">{uc.brand.name} <b>{inrS(outstanding(uc))}</b></span>
						{/each}
					</div>
				{:else}
					<span class="hc-ctx-alert">No pending unpaid balances right now</span>
				{/if}
			{:else if moneyView === 2}
				{#if od.length > 0}
					<span class="hc-ctx-alert"><b>{od[0].brand.name}</b> · {inrS(outstanding(od[0]))} overdue</span>
					<a class="hc-ctx-act" href="/studio/payments">✦ Chase Now</a>
				{:else}
					<span class="hc-ctx-alert ok">✓ Zero overdue payments — you're 100% caught up!</span>
				{/if}
			{:else if nextPayout}
				<span class="hc-ctx-alert"><b>{nextPayout.brand.name}</b> · Due {fmt(nextPayout.pay_due)}</span>
				<a class="hc-ctx-act" href="/studio/invoices">View Invoice</a>
			{:else}
				<span class="hc-ctx-alert">No upcoming scheduled payouts</span>
			{/if}
	{/snippet}
	{#snippet tiles()}
			<a href="/studio/payments" class:active-tile={moneyView === 1} onclick={(e) => { if (moneyView !== 1) { e.preventDefault(); showMoney(1); } }}>
				<small>Yet to come</small>
				<b use:homeCount={{ value: outs, money: true }}>{inr(outs)}</b>
				<span class="hc-who">{unpaidCollabs.length} active deal{unpaidCollabs.length === 1 ? '' : 's'}</span>
			</a>
			<a href="/studio/payments" class:active-tile={moneyView === 2} onclick={(e) => { if (moneyView !== 2) { e.preventDefault(); showMoney(2); } }}>
				<small>Overdue</small>
				<b class:od={odSum > 0} use:homeCount={{ value: odSum, money: true }}>{inr(odSum)}</b>
				<span class="hc-who">{od.length ? `${od[0].brand.name} · late` : 'All clear ✓'}</span>
			</a>
			<a href="/studio/payments" class:active-tile={moneyView === 3} onclick={(e) => { if (moneyView !== 3) { e.preventDefault(); showMoney(3); } }}>
				<small>Next payout</small>
				<b>{nextPayout ? fmt(nextPayout.pay_due) : 'None'}</b>
				<span class="hc-who">{nextPayout ? `${nextPayout.brand.name} · ${inrS(outstanding(nextPayout))}` : 'None scheduled'}</span>
			</a>
	{/snippet}
</HomeMoneyCard>

<section class="hs" id="sec-needs">
	<header class="hs-h">
		<h2>Needs you</h2>
		{#if ts.length}<span class="hs-n">{ts.length}</span>{/if}
		{#if ts.length > 2}
			<button type="button" class="sec-link-btn" onclick={() => (fanned = !fanned)}>
				{fanned ? 'Collapse' : `Show all ${ts.length}`}
			</button>
		{/if}
	</header>
	{#if ts.length}
		<!-- Tickets: the brand on a band in its colour, a torn line, then what to do and by when. -->
		<div class="tks">
			{#each fanned ? ts : ts.slice(0, 2) as t, i (t.c.id)}
				{@const key = t.c.id + t.kind}
				{@const chips = ticketChips(t)}
				{@const latest = t.c.messages?.at(-1)}
				<article class="tk" class:leaving={leaving === key} style="--h:var(--m{hueOf(t.c.brand.name)});--i:{i}">
					<a class="tk-band" href="/studio/c/{t.c.code}">
						<span class="tk-tile">{t.c.brand.name.trim().slice(0, 1).toUpperCase()}</span>
						<span class="tk-who"><b>{t.c.brand.name}</b><small>{stageLabel(t.c.stage)}</small></span>
						<span class="tk-money"><b>{ticketMoney(t)}</b><small>{delivText(t.c.deliverables) || TYPE_LABEL[t.c.type]}</small></span>
					</a>
					<div class="tk-cut" aria-hidden="true"></div>
					<div class="tk-body">
						{#if latest}
							<a class="tk-latest" href="/studio/inbox/{t.c.code}">
								<Icon name="inbox" />
								<span><strong>{latest.sender === 'creator' ? 'You' : t.c.brand.name}:</strong> {latest.body?.trim() || 'Sent an attachment'}</span>
							</a>
						{/if}
						{#if chips.length}
							<div class="tk-chips tk-chips-row">
								{#each chips as ch (ch.text)}
									<em class={ch.tone}>{ch.text}</em>
								{/each}
							</div>
						{/if}
						<div class="tk-foot">
							<span class="tk-task"><b>{t.title}</b><small class:hot={hot(t)}><i></i>{when(t)}</small></span>
							{#if t.kind === 'follow' && t.c.stage !== 'paused'}
								<button class="btn" onclick={() => leaveThen(key, () => completeFollow(t.c))}>Done ✓</button>
							{:else if t.kind === 'pay'}
								<button class="btn grad" onclick={async () => (await askPaid(t.c)) && leaveThen(key, () => markPaid(t.c, false, true))}>Mark paid ✓</button>
							{:else if t.kind === 'product' && inTransit(t.c)}
								<button class="btn" onclick={() => leaveThen(key, () => markReceived(t.c))}>Received ✓</button>
							{:else if t.kind === 'msg'}
								<a class="btn grad" href="/studio/inbox/{t.c.code}">Reply ↗</a>
							{:else}
								<a class="btn grad" href="/studio/c/{t.c.code}">{t.kind === 'new' ? 'Review ↗' : 'Open ↗'}</a>
							{/if}
						</div>
					</div>
				</article>
			{/each}
		</div>
		{#if !fanned && ts.length > 2}
			<div class="tk-stack-edges" aria-hidden="true">
				<span class="tk-edge-1"></span>
				{#if ts.length > 3}<span class="tk-edge-2"></span>{/if}
			</div>
		{/if}
		{#if ts.length > 2}
			<button class="cr-more" aria-expanded={fanned} onclick={() => (fanned = !fanned)}>
				{#if !fanned}<span class="cr-dots" aria-hidden="true">{#each ts.slice(2, 5) as t (t.c.id + t.kind)}<i style="--h:var(--m{hueOf(t.c.brand.name)})"></i>{/each}</span>+{ts.length - 2} more{:else}Show less{/if}
			</button>
		{/if}
	{:else}
		<!-- Nothing to do: the same glowing card as the money one, with two good next steps. -->
		<div class="clear hero-card glow">
			<div class="mesh" aria-hidden="true"></div>
			<span class="clear-ic"><Icon name="check" /></span>
			<b>You're all caught up</b>
			<small>New requests, payments and follow-ups land here.</small>
			<div class="clear-acts">
				<a class="glass-chip" href="/studio/calendar"><Icon name="cal" />Plan your week</a>
				<a class="glass-chip" href="/studio/pitches"><Icon name="send" />Pitch a brand</a>
			</div>
		</div>
	{/if}
</section>

<AiDesk phone />

<AwayMode banner />

<NudgeList phone />

<AlertsPrompt />

<section class="hs wk2" id="sec-week">
	<header class="hs-h"><h2>This week</h2><a href="/studio/calendar">Full Calendar →</a></header>
	<p class="wk2-say">
		{#if weekN}{NUM[weekN] ?? weekN} thing{weekN === 1 ? '' : 's'} this week.{#if busiest.list.length > 1}{' '}<em>{dayName(busiest.dt, busiest.i)}</em> is the big one.{:else}{' '}Next up: <em>{dayName(week.find((d) => d.list.length)!.dt, week.find((d) => d.list.length)!.i).toLowerCase()}</em>.{/if}
		{:else}A free week. <em>Make it count.</em>{/if}
	</p>
	<!-- The next seven days: tap one to see what's on it. -->
	<div class="wk2-days" role="tablist" aria-label="The next seven days">
		{#each week as d (d.i)}
			{@const first = [...d.list].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))[0]}
			<button class="wk2-d" class:now={d.i === 0} class:on={d.i === sel} class:free={!d.list.length} style={first ? `--h:${LEAF[first.kind] ?? LEAF.follow}` : ''} role="tab" aria-selected={d.i === sel} aria-label="{dayName(d.dt, d.i)}, {d.list.length || 'nothing'} {d.list.length === 1 ? 'thing' : 'things'}" onclick={() => choose(d.i)}>
				<em>{short(d.dt, d.i)}</em>
				<b>{d.dt.getDate()}</b>
				<span class="wk2-dots" aria-hidden="true">{#each d.list.slice(0, 3) as e, k (k)}<i class="k-{e.kind}"></i>{/each}</span>
			</button>
		{/each}
	</div>
	<div class="wk2-day" role="tabpanel" use:homeChange={sel}>
		<div class="wk2-day-h"><b>{dayName(selDay.dt, selDay.i)}</b><small>{longDate(selDay.dt)}</small></div>
		{#if selList.length}
			<ol class="wk2-tl">
				{#each selList as e, k (e.c.id + e.kind + k)}
					<li class="k-{e.kind}">
						<a href="/studio/c/{e.c.code}">
							<span class="wk2-node" aria-hidden="true"></span>
							<span class="wk2-ev"><em>{evLabel(e)}</em><b>{e.c.brand.name}</b><small>{e.label || delivText(e.c.deliverables) || TYPE_LABEL[e.c.type]}{isPaid(e.c) && e.kind === 'pay' ? ` · ${inr(outstanding(e.c))}` : ''}</small></span>
							<span class="wk2-open">Open</span>
						</a>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="wk2-free">Nothing on {selDay.i === 0 ? 'today' : selDay.i === 1 ? 'tomorrow' : dayName(selDay.dt, selDay.i)}. A good day to shoot ahead or pitch a brand you love.</p>
			<div class="wk2-ideas">
				<a href="/studio/pitches" class="k-live"><span><Icon name="send" /></span>Pitch a brand</a>
				<a href="/studio/grow" class="k-draft"><span><Icon name="spark" /></span>Reel ideas</a>
				<a href="/studio/calendar" class="k-shoot"><span><Icon name="cal" /></span>Plan a shoot</a>
			</div>
		{/if}
	</div>
	<a class="wk2-cap" href="/studio/settings?s=bookings">
		<span class="wk2-cap-h"><small>Collab slots · Public bio status</small><span class="wk2-st {slotState.k}"><i></i>{slotState.t}</span></span>
		{#each slotWeeks as w (w.k)}
			<span class="wk2-cap-w">
				<span class="wk2-cap-l"><b>{w.label}</b><span>{w.range}</span></span>
				<b class="wk2-cap-n" style="--k:{w.k}">{Math.min(w.n, cap)}<span>/{cap}</span></b>
				<span class="wk2-bar" style="--n:{Math.min(cap, 10)}">{#each Array.from({ length: Math.min(cap, 10) }, (_, k) => k) as k (k)}<i class:on={k < w.n} class:next={k === w.n && w.k === 0} style="--k:{k}"></i>{/each}</span>
			</span>
		{/each}
		<span class="wk2-cap-f"><span>{slotNote}</span><span class="wk2-edit">Change<Icon name="chevR" /></span></span>
	</a>
</section>

<!-- Growth check-up, setup steps, and brand questions -->
<div class="home-tail">
	<CheckupCard phone />
	<SetupChecklist phone />
	<div class="hs"><BrandQuestions /></div>
</div>
</div>


<style>
	.home-tail {
		display: grid;
		gap: 16px;
		margin-top: 16px;
	}
	.home-tail > :global(*) {
		margin-top: 0 !important;
		margin-bottom: 0 !important;
	}
	.home-tail > .hs:empty {
		display: none;
	}
</style>
