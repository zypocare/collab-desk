<script lang="ts">
	import { receivedIn } from '../invoice';
	import { onMount } from 'svelte';
	import { askPaid, completeFollow, markPaid, markReceived, priorityOf, studio } from '../studio.svelte';
	import { copyText, countUp, ui } from '../ui.svelte';
	import {
		KIND_ICON,
		TYPE_LABEL,
		stageLabel,
		STAGES,
		delivText,
		diff,
		evLabel,
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
	import AlertsPrompt from './AlertsPrompt.svelte';
	import BrandQuestions from './BrandQuestions.svelte';

	// Today on a phone: a living header, swipeable money cards, shortcuts, what needs you as a deck
	// of cards, the week ahead and the pipeline. Everything is worked out from the same data as on a laptop.
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
	const pipe = $derived(STAGES.slice(0, 5).map((st) => ({ st, n: list.filter((c) => c.stage === st.id).length })));
	const pipeMax = $derived(Math.max(1, ...pipe.map((p) => p.n)));

	// The header drifts and fades a little as the screen scrolls.
	let sy = $state(0);
	onMount(() => {
		const on = () => (sy = Math.min(240, scrollY));
		on();
		addEventListener('scroll', on, { passive: true });
		return () => removeEventListener('scroll', on);
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

	// This week: the next seven days as capsules, the day she taps opened below (today first).
	let pick = $state(0);
	const KIND_WORD: Record<string, string> = { shoot: 'Shoot', draft: 'Draft due', live: 'Goes live', pay: 'Payment due', follow: 'Follow-up', product: 'Product arrives' };
	const weekN = $derived(week.reduce((a, d) => a + d.list.length, 0));
	const busiest = $derived([...week].sort((a, b) => b.list.length - a.list.length)[0]);
	const dayName = (d: Date, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'long' }));
	const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
	const picked = $derived(week[pick]);
	// Her collab slots this calendar week (Monday to Sunday), the same count her brand page uses.
	const cap = $derived(Math.max(1, s.weekly_capacity ?? 3));
	const booked = $derived.by(() => {
		const m = new Date(T);
		m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
		const from = iso(m), to = iso(new Date(m.getTime() + 7 * 864e5));
		return list.filter((c) => ['confirmed', 'creating', 'live'].includes(c.stage) && (c.live_date ?? c.draft_date ?? c.preferred_live ?? '') >= from && (c.live_date ?? c.draft_date ?? c.preferred_live ?? '') < to).length;
	});
	const slotNote = $derived(booked >= cap ? 'Fully booked: brands see this week as full.' : cap - booked === 1 && cap > 1 ? 'One slot open: brands see this week as limited.' : `${cap - booked} slots open this week.`);
	// The moving line under the circles (CRED's "cashback disbursed today"): today in numbers.
	const ticker = $derived(
		[
			received > 0 && { b: inrS(received), t: ` came in this ${monthName}` },
			urgent > 0 && { b: String(urgent), t: ` due today` },
			list.filter((c) => c.stage === 'request').length > 0 && { b: String(list.filter((c) => c.stage === 'request').length), t: ' new requests waiting' },
			outs > 0 && { b: inrS(outs), t: ' still to come in' },
			goal > 0 && { b: `${pctN}%`, t: ` of the ${inrS(goal)} goal` },
			active.length > 0 && { b: String(active.length), t: ` active collab${active.length === 1 ? '' : 's'}` },
			nextPayout && { b: nextPayout.brand.name, t: ` pays next, ${fmt(nextPayout.pay_due!)}` }
		].filter((x): x is { b: string; t: string } => !!x)
	);
	// Beside the greeting: live Instagram numbers, or this month's goal when Instagram isn't connected.
	const ig = $derived(studio.ig?.connected ? studio.ig : null);
</script>

<section class="ht" style="--sy:{sy}">
	<div class="ht-glow" aria-hidden="true"><i></i><i></i><i></i></div>
	<a class="ht-orb" href={ig ? '/insights' : '/studio/payments'} target={ig ? '_blank' : undefined} rel="noopener" aria-label={ig ? 'Your Instagram insights' : `${monthName} goal`}>
		<span class="orb-ring" aria-hidden="true"></span>
		<span class="orb-in">
			{#if ig}
				<b>{compact(ig.followers ?? 0)}</b><small>followers</small>
				{#if ig.engagement_rate}<i>{ig.engagement_rate.toFixed(1)}% eng.</i>{/if}
			{:else}
				<b>{Math.round(pct * 100)}%</b><small>of {monthName} goal</small>
			{/if}
		</span>
		<span class="orb-spark s1" aria-hidden="true"></span><span class="orb-spark s2" aria-hidden="true"></span><span class="orb-spark s3" aria-hidden="true"></span>
	</a>
	<p class="ht-date">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
	<h1 class="ht-hi">{greet},<br /><em>{firstName(s.display_name)}</em></h1>
	<p class="ht-sum">
		<span class="ht-dot" class:calm={!urgent}></span>
		{urgent ? `${urgent} due today` : 'Nothing due today'} · {active.length} active collab{active.length === 1 ? '' : 's'}
	</p>
</section>

<Stories />
{#if ticker.length > 1}
	<div class="cr-ticker cr-tk" aria-label="Today in numbers"><div>{#each [0, 1] as k (k)}{#each ticker as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><i aria-hidden="true">✦</i>{/each}{/each}</div></div>
{/if}


<section class="hero-card glow m-hero" aria-label="Money this month">
	<div class="mesh" aria-hidden="true"></div>
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
			<a href="/studio/payments"><small>Still to come</small><b use:countUp={{ value: outs, money: true }}>{inr(outs)}</b></a>
			<a href="/studio/payments"><small>Overdue</small><b class:od={odSum > 0} use:countUp={{ value: odSum, money: true }}>{inr(odSum)}</b></a>
			<a href="/studio/payments"><small>Next payout</small><b>{nextPayout ? `${nextPayout.brand.name} · ${fmt(nextPayout.pay_due)}` : 'None scheduled'}</b></a>
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
		<span class="wk2-cap-h"><small>Collab slots this week</small><b>{Math.min(booked, cap)} <span>of {cap} booked</span></b></span>
		<span class="wk2-bar" style="--n:{Math.min(cap, 10)}">{#each Array.from({ length: Math.min(cap, 10) }, (_, k) => k) as k (k)}<i class:on={k < booked}></i>{/each}</span>
		<small>{slotNote}</small>
	</a>
	<div class="wk2-days" role="group" aria-label="Pick a day">
		{#each week as d (d.i)}
			<button class="wk2-d" class:now={d.i === 0} class:on={d.i === pick} onclick={() => (pick = d.i)} aria-label="{dayName(d.dt, d.i)}, {d.list.length || 'nothing'} {d.list.length === 1 ? 'thing' : 'things'}" aria-pressed={d.i === pick}>
				<small>{d.i === 0 ? 'Today' : d.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small>
				<b>{d.dt.getDate()}</b>
				<span class="wk2-dots">{#each d.list.slice(0, 3) as e (e.c.id + e.kind)}<i class="k-{e.kind}"></i>{/each}</span>
			</button>
		{/each}
	</div>
	{#key pick}
		<div class="wk2-day">
			<div class="wk2-day-h"><b>{dayName(picked.dt, picked.i)}{picked.i > 1 ? `, ${picked.dt.getDate()} ${picked.dt.toLocaleDateString('en-IN', { month: 'short' })}` : ''}</b><small>{picked.list.length ? `${picked.list.length} thing${picked.list.length === 1 ? '' : 's'}` : 'Free'}</small></div>
			{#if picked.list.length}
				<ul class="wk2-tl">
					{#each picked.list as e (e.c.id + e.kind)}
						<li class="k-{e.kind}">
							<a href="/studio/c/{e.c.code}">
								<span class="wk2-node" aria-hidden="true"></span>
								<span class="wk2-ev"><em>{KIND_WORD[e.kind] ?? evLabel(e)}{e.kind === 'live' && e.c.live_time ? ` · ${e.c.live_time.slice(0, 5)}` : ''}</em><b>{e.c.brand.name}{delivText(e.c.deliverables) ? ` · ${delivText(e.c.deliverables)}` : ''}</b><small>{e.kind === 'pay' ? `${inr(outstanding(e.c))} to come in` : e.kind === 'draft' ? 'First cut to the brand' : e.kind === 'live' ? 'Post, tag the brand, pin the link' : e.kind === 'shoot' ? 'Charge up, find the light' : e.kind === 'product' ? 'Unbox it on camera' : 'A friendly nudge keeps it moving'}</small></span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="wk2-free">Nothing booked. A free day is where the next big collab starts:</p>
				<div class="wk2-ideas">
					<a href="/studio/content"><span class="k-shoot"><Icon name="film" /></span>Plan a reel</a>
					<a href="/studio/pitches"><span class="k-live"><Icon name="send" /></span>Pitch a brand</a>
					<a href="/studio/calendar"><span class="k-draft"><Icon name="edit" /></span>Batch captions</a>
				</div>
			{/if}
		</div>
	{/key}
	<div class="wk2-key" aria-hidden="true"><span class="k-shoot"><i></i>Shoot</span><span class="k-draft"><i></i>Draft due</span><span class="k-live"><i></i>Goes live</span><span class="k-pay"><i></i>Payment</span></div>
</section>

<section class="hs">
	<header class="hs-h"><h2>Pipeline</h2><a href="/studio/collabs">See all</a></header>
	<div class="pp">
		{#each pipe as p, i (p.st.id)}
			<a class="pp-s st-{p.st.id}" href="/studio/collabs" style="--h:{p.n / pipeMax};--i:{i}">
				<span class="pp-bar"><i></i></span>
				<b use:countUp={{ value: p.n }}>{p.n}</b>
				<small>{p.st.label}</small>
			</a>
		{/each}
	</div>
</section>

<div class="hs"><BrandQuestions /></div>
