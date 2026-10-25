<script lang="ts">
	import { receivedIn } from '../invoice';
	import { onMount } from 'svelte';
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
		initials,
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
	import AlertsPrompt from './AlertsPrompt.svelte';
	import BrandQuestions from './BrandQuestions.svelte';

	// Today on a phone: the greeting, a compact money card that grows into Money, what needs you as
	// tickets, the week as a strip, then every collab on the go. Everything is worked out from the same data as on a laptop.
	const s = $derived(studio.settings!);
	const list = $derived(studio.collabs);
	const T = today();
	const hour = new Date().getHours();
	const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
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


	let leaving = $state<string | null>(null);
	// Needs you shows three, then "+N more" fans out the rest.
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
	// The moving line under the circles (CRED's "cashback disbursed today"): today in numbers.
	const ticker = $derived(
		[
			received > 0 && { b: inrS(received), t: ` came in this ${monthName}` },
			urgent > 0 && { b: String(urgent), t: ` need${urgent === 1 ? 's' : ''} you today` },
			list.filter((c) => c.stage === 'request').length > 0 && { b: String(list.filter((c) => c.stage === 'request').length), t: ' new requests waiting' },
			outs > 0 && { b: inrS(outs), t: ' still to come in' },
			goal > 0 && { b: `${pctN}%`, t: ` of the ${inrS(goal)} goal` },
			active.length > 0 && { b: String(active.length), t: ` active collab${active.length === 1 ? '' : 's'}` },
			nextPayout && { b: nextPayout.brand.name, t: ` pays next, ${fmt(nextPayout.pay_due!)}` }
		].filter((x): x is { b: string; t: string } => !!x)
	);
	// Beside the greeting: live Instagram numbers, or this month's goal when Instagram isn't connected.
	const ig = $derived(studio.ig?.connected ? studio.ig : null);
	import SetupChecklist from '#lib/components/SetupChecklist.svelte';
	import CheckupCard from '#lib/components/CheckupCard.svelte';
</script>

<!-- The date and the greeting. -->
<header class="t2-h">
	<p class="t2-date">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
	<h1 class="t2-hi">{greet},<br /><em>{firstName(s.display_name)}</em></h1>
	<p class="t2-sum">
		<span class="ht-dot" class:calm={!urgent}></span>
		{urgent ? `${urgent} need${urgent === 1 ? 's' : ''} you today` : 'Nothing needs you today'} · {active.length} active collab{active.length === 1 ? '' : 's'}
	</p>
</header>

<!-- Money this month, compact. The whole card opens Money and grows into its card there. -->
<section class="hero-card glow m-hero t2-money" aria-label="Money this month">
	<div class="mesh" aria-hidden="true"></div>
	<a class="hc-go" href="/studio/money" aria-label="Open Money"></a>
	<div class="hc-in t2-mi">
		<div class="t2-mtop">
			<span class="hc-eb">Received in {monthName}</span>
			<span class="t2-open" aria-hidden="true">Open<Icon name="chevR" /></span>
		</div>
		<div class="t2-val" use:countUp={{ value: received, money: true }}>{inr(received)}</div>
		<p class="t2-sub">from {paidN} brand{paidN === 1 ? '' : 's'}{#if goal}{' · '}<b>{pctN}%</b> of your {inrS(goal)} goal{/if}</p>
		{#if goal}<div class="t2-bar" aria-hidden="true"><i style="width:{Math.min(100, pctN)}%"></i></div>{/if}
		<div class="t2-stats">
			<a href="/studio/payments"><small>Still to come</small><b>{inrS(outs)}</b></a>
			<a href="/studio/payments" class:od={odSum > 0}><small>Overdue</small><b>{inrS(odSum)}</b></a>
			<a href="/studio/payments"><small>Next payout</small><b>{nextPayout ? fmt(nextPayout.pay_due) : 'None'}</b></a>
		</div>
	</div>
</section>

<!-- A possible collab in her DMs puts the AI assistant (which lists it) above Needs you. -->
{#if studio.leads.length}<AiDesk phone />{/if}

<section class="t2-sec">
	<header class="t2-sh"><span class="t2-eb">Needs you</span><span class="t2-note">{ts.length ? `${ts.length} ${urgent ? 'today' : 'waiting'}` : ''}</span></header>
	{#if ts.length}
		<div class="t2-list">
			{#each fanned ? ts : ts.slice(0, 3) as t, i (t.c.id + t.kind)}
				{@const key = t.c.id + t.kind}
				<article class="t2-tk" class:leaving={leaving === key} style="--h:var(--m{hueOf(t.c.brand.name)});--i:{i}">
					<a class="t2-tk-a" href="/studio/c/{t.c.code}">
						<span class="t2-tile" aria-hidden="true">{initials(t.c.brand.name)}</span>
						<span class="t2-who"><b>{t.c.brand.name}</b><small class:hot={hot(t)}>{t.title} · {when(t)}</small></span>
					</a>
					{#if t.kind === 'follow' && t.c.stage !== 'paused'}
						<button class="t2-pill" onclick={() => leaveThen(key, () => completeFollow(t.c))}>Done</button>
					{:else if t.kind === 'pay'}
						<button class="t2-pill hot" onclick={async () => (await askPaid(t.c)) && leaveThen(key, () => markPaid(t.c, false, true))}>Mark paid</button>
					{:else if t.kind === 'product' && inTransit(t.c)}
						<button class="t2-pill" onclick={() => leaveThen(key, () => markReceived(t.c))}>Received</button>
					{:else if t.kind === 'msg'}
						<a class="t2-pill msg" href="/studio/inbox/{t.c.code}">Reply</a>
					{:else if t.kind === 'new'}
						<a class="t2-pill amt" href="/studio/c/{t.c.code}">{ticketMoney(t)}</a>
					{:else}
						<a class="t2-pill" href="/studio/c/{t.c.code}">Open</a>
					{/if}
				</article>
			{/each}
		</div>
		{#if ts.length > 3}
			<button class="t2-more" onclick={() => (fanned = !fanned)}>{fanned ? 'Show less' : `+${ts.length - 3} more`}</button>
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

<section class="t2-sec">
	<header class="t2-sh"><span class="t2-eb">This week</span><a class="t2-note" href="/studio/calendar">{weekN ? `${weekN} thing${weekN === 1 ? '' : 's'}` : 'Calendar'}</a></header>
	<div class="t2-week">
		{#each week as d (d.i)}
			<a class="t2-day" class:on={d.i === 0} href="/studio/calendar" aria-label="{dayName(d.dt, d.i)}: {d.list.length ? `${d.list.length} thing${d.list.length === 1 ? '' : 's'}` : 'nothing planned'}">
				<small>{d.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small>
				<b>{d.dt.getDate()}</b>
				<span class="t2-dots" aria-hidden="true">{#each d.list.slice(0, 3) as e, k (k)}<i class="k-{e.kind}"></i>{/each}</span>
			</a>
		{/each}
	</div>
	<p class="t2-say">
		{#if weekN}{NUM[weekN] ?? weekN} thing{weekN === 1 ? '' : 's'} this week.{#if busiest.list.length > 1}{' '}<em>{dayName(busiest.dt, busiest.i)}</em> is the big one.{:else}{' '}Next up: <em>{dayName(week.find((d) => d.list.length)!.dt, week.find((d) => d.list.length)!.i).toLowerCase()}</em>.{/if}
		{:else}A free week. <em>Make it count.</em>{/if}
	</p>
	<a class="wk2-cap" href="/studio/settings?s=bookings">
		<span class="wk2-cap-h"><small>Collab slots</small></span>
		{#each slotWeeks as w (w.k)}
			<span class="wk2-cap-w">
				<span class="wk2-cap-l"><b>{w.label}</b> <span>{w.range}</span></span>
				<b class="wk2-cap-n">{Math.min(w.n, cap)} <span>of {cap}</span></b>
				<span class="wk2-bar" style="--n:{Math.min(cap, 10)}">{#each Array.from({ length: Math.min(cap, 10) }, (_, k) => k) as k (k)}<i class:on={k < w.n}></i>{/each}</span>
			</span>
		{/each}
		<small>{slotNote}</small>
	</a>
</section>

<!-- A new creator's first steps (gone once they're done). -->
<CheckupCard phone />
<SetupChecklist phone />

<!-- Every collab on the go, as cards to swipe through. -->
<Stories />

<AwayMode banner />

<NudgeList phone />

{#if !studio.leads.length}<AiDesk phone />{/if}

<AlertsPrompt />

<div class="hs"><BrandQuestions /></div>

<style>
	/* Today, as in the prototype: the greeting, a compact money card, Needs you as tickets, the week as a strip. */
	.t2-h { position: relative; padding: 14px 2px 4px; }
	.t2-date { margin: 0; font-size: 12.5px; font-weight: 600; color: var(--ink-3); }
	.t2-hi { margin: 6px 0 0; font: 400 40px/1 var(--f-serif, Georgia, serif); letter-spacing: -.01em; color: var(--ink); }
	.t2-hi em { font-style: italic; background: linear-gradient(115deg, var(--g1), var(--g2) 52%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: .06em; }
	.t2-sum { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; font-size: 13.5px; color: var(--ink-2); }

	.t2-money { margin-top: 18px; }
	.t2-mi { gap: 0 !important; padding: 20px 20px 16px !important; }
	.t2-mtop { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
	.t2-open { display: inline-flex; align-items: center; gap: 2px; padding: 5px 8px 5px 11px; border-radius: 999px; background: color-mix(in oklab, var(--ink) 10%, transparent); font-size: 12px; font-weight: 600; color: var(--ink); animation: t2-hint 2.4s ease-in-out infinite; }
	.t2-open :global(.ic) { width: 14px; height: 14px; }
	@keyframes t2-hint { 50% { background: color-mix(in oklab, var(--g2) 30%, transparent); } }
	.t2-val { margin-top: 12px; font: 400 46px/1 var(--f-serif, Georgia, serif); color: var(--ink); font-variant-numeric: tabular-nums; }
	.t2-sub { margin: 8px 0 0; font-size: 13.5px; color: var(--ink-2); }
	.t2-sub b { color: var(--ink); }
	.t2-bar { height: 6px; margin-top: 14px; border-radius: 6px; background: color-mix(in oklab, var(--ink) 12%, transparent); overflow: hidden; }
	.t2-bar i { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3)); animation: t2-grow 1.2s cubic-bezier(.2, .9, .25, 1) .3s both; transform-origin: left; }
	@keyframes t2-grow { from { transform: scaleX(0); } }
	.t2-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid color-mix(in oklab, var(--ink) 12%, transparent); }
	.t2-stats a { min-width: 0; color: inherit; text-decoration: none; }
	.t2-stats small { display: block; font-size: 11.5px; color: var(--ink-3); }
	.t2-stats b { display: block; margin-top: 3px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font: 400 19px/1.1 var(--f-serif, Georgia, serif); color: var(--ink); }
	.t2-stats a.od b { color: #ff8fb1; }

	.t2-sec { margin-top: 26px; }
	.t2-sh { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; padding: 0 2px; }
	.t2-eb { font: 700 11px/1.2 var(--f-body, inherit); letter-spacing: .22em; text-transform: uppercase; color: var(--ink-3); }
	.t2-note { font-size: 12.5px; color: var(--ink-3); text-decoration: none; }
	.t2-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
	.t2-tk { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); animation: t2-in .5s cubic-bezier(.2, 1.2, .35, 1) both; animation-delay: calc(var(--i) * .06s); transition: opacity .35s, translate .35s; }
	.t2-tk.leaving { opacity: 0; translate: 40px 0; }
	@keyframes t2-in { from { opacity: 0; translate: 0 12px; } }
	.t2-tk-a { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; }
	.t2-tile { width: 44px; height: 44px; flex: none; border-radius: 14px; display: grid; place-items: center; background: color-mix(in oklab, var(--h) 22%, var(--surface)); color: color-mix(in oklab, var(--h) 65%, #fff); font-weight: 700; font-size: 13px; }
	.t2-who { min-width: 0; }
	.t2-who b { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 15px; font-weight: 600; color: var(--ink); }
	.t2-who small { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12.5px; color: var(--ink-3); }
	.t2-who small.hot { color: #ff8fb1; }
	.t2-pill { flex: none; display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border: 0; border-radius: 999px; background: color-mix(in oklab, var(--ink) 10%, transparent); color: var(--ink); font: 600 12.5px var(--f-body, inherit); text-decoration: none; cursor: pointer; }
	.t2-pill.amt { background: color-mix(in oklab, var(--g3) 16%, transparent); color: var(--g3); }
	.t2-pill.hot { background: color-mix(in oklab, var(--g2) 18%, transparent); color: #ff8fb1; }
	.t2-pill.msg { background: color-mix(in oklab, var(--g1) 20%, transparent); color: #c9b6ff; }
	.t2-more { margin-top: 10px; width: 100%; height: 44px; border: 0; border-radius: 16px; background: transparent; box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-2); font: 600 13.5px var(--f-body, inherit); cursor: pointer; }

	.t2-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
	.t2-day { display: grid; justify-items: center; align-content: start; gap: 6px; padding: 10px 0 9px; border-radius: 16px; color: var(--ink-3); text-decoration: none; font-size: 11px; font-weight: 600; }
	.t2-day b { font: 400 22px/1 var(--f-serif, Georgia, serif); color: var(--ink); }
	.t2-day.on { background: var(--ink); color: color-mix(in oklab, var(--bg) 70%, var(--ink)); box-shadow: 4px 4px 0 var(--g2); }
	.t2-day.on b { color: var(--bg); }
	.t2-dots { display: flex; gap: 3px; height: 5px; }
	.t2-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--g2); }
	.t2-dots i.k-live, .t2-dots i.k-post { background: var(--g3); }
	.t2-dots i.k-pay { background: var(--ok); }
	.t2-say { margin: 14px 2px 12px; font-size: 14px; color: var(--ink-2); }
	.t2-say em { font-family: var(--f-serif, Georgia, serif); font-size: 1.12em; color: var(--ink); }
	@media (prefers-reduced-motion: reduce) {
		.t2-tk, .t2-bar i, .t2-open { animation: none; }
	}
</style>
