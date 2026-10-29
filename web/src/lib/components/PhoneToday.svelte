<script lang="ts">
	import { receivedIn } from '../invoice';
	import { erText, headlineEr } from '../engagement';
	import { onMount, untrack } from 'svelte';
	import { addLeadAsCollab } from '../leads';
	import { askPaid, completeFollow, markPaid, markReceived, priorityOf, studio } from '../studio.svelte';
	import { copyText, countUp, ui } from '../ui.svelte';
	import {
		KIND_ICON,
		TYPE_LABEL,
		stageLabel,
		delivText,
		diff,
		events,
		firstName,
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
		mergeSteps, tasks,
		today,
		type Task
	} from '../util';
	import AiDesk from './AiDesk.svelte';
	import NudgeList from './NudgeList.svelte';
	import AwayMode from './AwayMode.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
	import Stories from './Stories.svelte';
	import DiwaliLayer from './DiwaliLayer.svelte';
	import BirthdayLayer from './BirthdayLayer.svelte';
	import { birthdayNow, diwaliWords, festivalNow } from '../festival';
	import AlertsPrompt from './AlertsPrompt.svelte';
	import BrandQuestions from './BrandQuestions.svelte';

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
		const all = mergeSteps(tasks(list));
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
	const paidN = $derived(new Set(list.filter((c) => receivedIn(c, ym) > 0).map((c) => c.brand_id)).size);
	const pctN = $derived(goal ? Math.round((received / goal) * 100) : 0);
	const nextPayout = $derived(
		list
			.filter((c) => isPaid(c) && c.pay_status !== 'paid' && c.pay_due && diff(c.pay_due) >= 0)
			.sort((a, b) => parse(a.pay_due!).getTime() - parse(b.pay_due!).getTime())[0]
	);

	// The week
	const evs = $derived(events(list));
	const week = $derived(Array.from({ length: 7 }, (_, i) => ({ i, dt: parse(rel(i)), list: evs.filter((e) => e.date === rel(i)) })));
	const upcoming = $derived(evs.filter((e) => diff(e.date) >= 0 && diff(e.date) <= 6).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3));

	// The header drifts and fades a little as the screen scrolls.
	let sy = $state(0);
	onMount(() => {
		const on = () => (sy = Math.min(240, scrollY));
		on();
		addEventListener('scroll', on, { passive: true });
		return () => removeEventListener('scroll', on);
	});

	// A new possible collab spotted in her Instagram DMs opens "Add a collab" with its chat read in, the same as tapping
	// Add on it: once per chat (remembered on this phone), only here on Today, never over something already open. The
	// first time, the ones already waiting are only remembered, so old chats don't pop up one after another.
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

	// This week in one line (the day by day is on Plan).
	const weekN = $derived(week.reduce((a, d) => a + d.list.length, 0));
	const busiest = $derived([...week].sort((a, b) => b.list.length - a.list.length)[0]);
	const dayName = (d: Date, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'long' }));
	const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
	// Her collab slots, Monday to Sunday, the same weeks and count as her brand page and Settings. The days
	// above run into next week, so both weeks show: this one (to Sunday) and the next.
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
			list.filter((c) => c.stage === 'request').length > 0 && { b: String(list.filter((c) => c.stage === 'request').length), t: ' new requests waiting' },
			outs > 0 && { b: inrS(outs), t: ' yet to come in' },
			goal > 0 && { b: `${pctN}%`, t: ` of the ${inrS(goal)} goal` },
			active.length > 0 && { b: String(active.length), t: ` active collab${active.length === 1 ? '' : 's'}` },
			nextPayout && { b: nextPayout.brand.name, t: ` pays next, ${fmt(nextPayout.pay_due!)}` }
		].filter((x): x is { b: string; t: string } => !!x)
	);
	// Beside the greeting: live Instagram numbers, or this month's goal when Instagram isn't connected.
	const ig = $derived(studio.ig?.connected ? studio.ig : null);
	// Her Reels engagement in full, the same figure Insights leads with.
	const er = $derived(ig ? headlineEr(ig.insights, ig.engagement_rate) : null);
	import SetupChecklist from '#lib/components/SetupChecklist.svelte';
	import CheckupCard from '#lib/components/CheckupCard.svelte';
</script>

<section class="ht" class:dw-on={!!fest && !bday} class:bd-on={!!bday} style="--sy:{sy}">
	<div class="ht-glow" aria-hidden="true"><i></i><i></i><i></i></div>
	{#if bday}<BirthdayLayer />{:else if fest}<DiwaliLayer />{/if}
	<a class="ht-orb" href={ig ? '/insights' : '/studio/payments'} target={ig ? '_blank' : undefined} rel="noopener" aria-label={ig ? 'Your Instagram insights' : `${monthName} goal`}>
		<span class="orb-ring" aria-hidden="true"></span>
		<span class="orb-in">
			{#if ig?.profile_picture_url}
				<!-- Her photo in the ring, with the follower count on a badge. -->
				<img class="orb-pic" src={ig.profile_picture_url} alt="" />
			{:else if ig}
				<b>{compact(ig.followers ?? 0)}</b><small>followers</small>
				{#if er}<i>{erText(er)} eng.</i>{/if}
			{:else}
				<b>{Math.round(pct * 100)}%</b><small>of {monthName} goal</small>
			{/if}
		</span>
		{#if ig?.profile_picture_url}<span class="orb-badge"><b>{compact(ig.followers ?? 0)}</b> followers{#if er}<i>{erText(er)}</i>{/if}</span>{/if}
		<span class="orb-spark s1" aria-hidden="true"></span><span class="orb-spark s2" aria-hidden="true"></span><span class="orb-spark s3" aria-hidden="true"></span>
	</a>
	<p class="ht-date">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{#if note}<span class="dw-note">{note}</span>{/if}</p>
	<h1 class="ht-hi">{greet},<br /><em>{firstName(s.display_name)}</em></h1>
	<p class="ht-sum">
		<span class="ht-dot" class:calm={!urgent}></span>
		{urgent ? `${urgent} need${urgent === 1 ? 's' : ''} you today` : 'Nothing needs you today'} · {active.length} active collab{active.length === 1 ? '' : 's'}
	</p>
</section>

<Stories />

<!-- A new creator's first steps (gone once they're done). -->
<CheckupCard phone />
<SetupChecklist phone />
{#if ticker.length > 1}
	<div class="cr-ticker cr-tk" aria-label="Today in numbers"><div>{#each [0, 1] as k (k)}{#each ticker as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><i aria-hidden="true">✦</i>{/each}{/each}</div></div>
{/if}


<section class="hero-card glow m-hero" aria-label="Money this month">
	<div class="mesh" aria-hidden="true"></div>
	<a class="hc-go" href="/studio/money" aria-label="Open Money"></a>
	<div class="hc-in">
		<div class="hc-top"><span class="hc-eb">Received in {monthName}</span>{#if goal}<a class="glass-chip" href="/studio/settings?s=payments"><Icon name="spark" />Goal {inrS(goal)}</a>{/if}</div>
		<div class="hc-main">
			<div>
				<div class="hc-val" use:countUp={{ value: received, money: true }}>{inr(received)}</div>
				<div class="hc-sub">from {paidN} brand{paidN === 1 ? '' : 's'}{#if goal}{' · '}<b>{pctN}%</b> of this month's goal{/if}</div>
			</div>
			<div class="goal" style="--p:{pct}">
				<svg viewBox="0 0 120 120" aria-hidden="true"
					><defs
						><linearGradient id="goalGradM" x1="0" y1="0" x2="1" y2="1"
							><stop offset="0" style="stop-color:var(--g3)" /><stop offset=".5" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g1)" /></linearGradient
						></defs
					><circle class="g-track" cx="60" cy="60" r="50" /><circle class="g-prog" cx="60" cy="60" r="50" pathLength="100" style="stroke:url(#goalGradM)" /></svg
				>
				<div class="g-txt"><b use:countUp={{ value: pctN, suffix: '%' }}>{pctN}%</b><small>of goal</small></div>
			</div>
		</div>
		<div class="hc-foot">
			<a href="/studio/payments"><small>Yet to come</small><b use:countUp={{ value: outs, money: true }}>{inr(outs)}</b></a>
			<a href="/studio/payments"><small>Overdue</small><b class:od={odSum > 0} use:countUp={{ value: odSum, money: true }}>{inr(odSum)}</b></a>
			<a href="/studio/payments"><small>Next payout</small><b>{nextPayout ? fmt(nextPayout.pay_due) : 'None'}</b>{#if nextPayout}<span class="hc-who">{nextPayout.brand.name}</span>{/if}</a>
		</div>
	</div>
</section>

<!-- A possible collab in her DMs puts the AI assistant (which lists it) above Needs you. -->
{#if studio.leads.length}<AiDesk phone />{/if}

<section class="hs">
	<header class="hs-h"><h2>Needs you</h2>{#if ts.length}<span class="hs-n">{ts.length}</span>{/if}</header>
	{#if ts.length}
		<!-- Tickets: the brand on a band in its colour, a torn line, then what to do and by when. -->
		<div class="tks">
			{#each fanned ? ts : ts.slice(0, 2) as t, i (t.c.id + t.kind)}
				{@const key = t.c.id + t.kind}
				<article class="tk" class:leaving={leaving === key} style="--h:var(--m{hueOf(t.c.brand.name)});--i:{i}">
					<a class="tk-band" href="/studio/c/{t.c.code}">
						<span class="tk-tile">{t.c.brand.name.trim().slice(0, 1).toUpperCase()}</span>
						<span class="tk-who"><b>{t.c.brand.name}</b><small>{stageLabel(t.c.stage)}</small></span>
						<span class="tk-money"><b>{ticketMoney(t)}</b><small>{delivText(t.c.deliverables) || TYPE_LABEL[t.c.type]}</small></span>
					</a>
					<div class="tk-cut" aria-hidden="true"></div>
					<div class="tk-foot">
						<span class="tk-task"><b>{t.title}</b><small class:hot={hot(t)}><i></i>{when(t)}</small></span>
				{#if t.kind === 'follow' && t.c.stage !== 'paused'}
							<button class="btn" onclick={() => leaveThen(key, () => completeFollow(t.c))}>Done</button>
						{:else if t.kind === 'pay'}
							<button class="btn primary" onclick={async () => (await askPaid(t.c)) && leaveThen(key, () => markPaid(t.c, false, true))}>Mark paid</button>
						{:else if t.kind === 'product' && inTransit(t.c)}
							<button class="btn" onclick={() => leaveThen(key, () => markReceived(t.c))}>Received</button>
						{:else if t.kind === 'msg'}
							<a class="btn grad" href="/studio/inbox/{t.c.code}">Reply</a>
						{:else}
							<a class="btn grad" href="/studio/c/{t.c.code}">{t.kind === 'new' ? 'Review' : 'Open'}</a>
						{/if}
					</div>
				</article>
			{/each}
			{#if !fanned && ts.length > 2}<span class="cr-edge tk-edge" aria-hidden="true"></span>{/if}
		</div>
		{#if ts.length > 2}
			<button class="cr-more" onclick={() => (fanned = !fanned)}>
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

<AwayMode banner />

<NudgeList phone />

{#if !studio.leads.length}<AiDesk phone />{/if}

<AlertsPrompt />

<section class="hs wk2">
	<header class="hs-h"><h2>This week</h2><a href="/studio/calendar">Calendar</a></header>
	<p class="wk2-say">
		{#if weekN}{NUM[weekN] ?? weekN} thing{weekN === 1 ? '' : 's'} this week.{#if busiest.list.length > 1}{' '}<em>{dayName(busiest.dt, busiest.i)}</em> is the big one.{:else}{' '}Next up: <em>{dayName(week.find((d) => d.list.length)!.dt, week.find((d) => d.list.length)!.i).toLowerCase()}</em>.{/if}
		{:else}A free week. <em>Make it count.</em>{/if}
	</p>
	<a class="wk2-cap" href="/studio/settings?s=bookings">
		<span class="wk2-cap-h"><small>Collab slots</small><span class="wk2-st {slotState.k}"><i></i>{slotState.t}</span></span>
		{#each slotWeeks as w (w.k)}
			<span class="wk2-cap-w">
				<span class="wk2-cap-l"><b>{w.label}</b><span>{w.range}</span></span>
				<b class="wk2-cap-n" style="--k:{w.k}">{Math.min(w.n, cap)}<span>/{cap}</span></b>
				<span class="wk2-bar" style="--n:{Math.min(cap, 10)}">{#each Array.from({ length: Math.min(cap, 10) }, (_, k) => k) as k (k)}<i class:on={k < w.n} class:next={k === w.n && w.k === 0} style="--k:{k}"></i>{/each}</span>
			</span>
		{/each}
		<span class="wk2-cap-f"><span>{slotNote}</span><span class="wk2-edit">Change<Icon name="chevR" /></span></span>
	</a>
	<a class="wk2-more" href="/studio/calendar">
		<span class="wk2-more-ic" aria-hidden="true"><Icon name="cal" /></span>
		<span class="wk2-more-t"><b>See the week day by day</b><small>Shoots, drafts and posts by date</small></span>
		<Icon name="chevR" />
	</a>
</section>


<div class="hs"><BrandQuestions /></div>
