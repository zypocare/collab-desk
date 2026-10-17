<script lang="ts">
	import { onMount } from 'svelte';
	import { completeFollow, markPaid, markReceived, priorityOf, studio } from '../studio.svelte';
	import { copyText, countUp, ui } from '../ui.svelte';
	import {
		KIND_ICON,
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
		tasks,
		today,
		type Task
	} from '../util';
	import AiDesk from './AiDesk.svelte';
	import CollabLeads from './CollabLeads.svelte';
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
		const all = tasks(list);
		const ranked = all.filter((t) => t.kind === 'new').sort((a, b) => (priorityOf(b.c)?.score ?? 0) - (priorityOf(a.c)?.score ?? 0));
		let n = 0;
		return all.map((t) => (t.kind === 'new' ? ranked[n++] : t));
	});
	const urgent = $derived(ts.filter((t) => t.d <= 0).length);
	const active = $derived(list.filter(isActive));

	// Money
	const received = $derived(list.filter((c) => c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(ym)).reduce((a, c) => a + c.pay_received, 0));
	const goal = $derived(s.monthly_goal || 0);
	const pct = $derived(goal ? Math.min(1, received / goal) : 0);
	const outs = $derived(list.reduce((a, c) => a + outstanding(c), 0));
	const od = $derived(list.filter(overdue));
	const odSum = $derived(od.reduce((a, c) => a + outstanding(c), 0));
	const paidN = $derived(list.filter((c) => c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(ym)).length);
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
		{urgent ? `${urgent} thing${urgent > 1 ? 's' : ''} need${urgent > 1 ? '' : 's'} you today` : 'All clear today'} · {active.length} active collab{active.length === 1 ? '' : 's'}
	</p>
</section>

<Stories />


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

<CollabLeads phone />

<section class="hs">
	<header class="hs-h"><h2>Needs you</h2>{#if ts.length}<span class="hs-n">{ts.length}</span>{/if}</header>
	{#if ts.length}
		<div class="deck">
			{#each ts as t, i (t.c.id + t.kind)}
				{@const key = t.c.id + t.kind}
				<article class="dk k-{t.kind === 'pay' ? 'bad' : t.kind}" class:leaving={leaving === key} style="--hue:var(--m{hueOf(t.c.brand.name)});--i:{i}">
					<span class="fx" aria-hidden="true"><i></i><i></i><i></i><b></b><b></b><b></b><b></b><b></b></span>
					<a class="dk-top" href="/studio/c/{t.c.code}"><Mono name={t.c.brand.name} size="sm" /><b>{t.c.brand.name}</b><small>{when(t)}</small></a>
					<a class="dk-body" href="/studio/c/{t.c.code}">
						<span class="dk-ic"><Icon name={KIND_ICON[t.kind]} /></span>
						<b>{t.title}</b>
						<small>{delivText(t.c.deliverables)}{t.c.fee ? ` · ${inr(t.c.fee)}` : t.c.type === 'barter' ? ' · barter' : ''}</small>
					</a>
					<div class="dk-acts">
						{#if t.kind === 'follow'}
							<button class="dk-go" onclick={() => leaveThen(key, () => completeFollow(t.c))}><Icon name="check" />Done</button>
						{:else if t.kind === 'pay'}
							<button class="dk-go" onclick={() => leaveThen(key, () => markPaid(t.c))}><Icon name="wallet" />Mark paid</button>
						{:else if t.kind === 'product' && inTransit(t.c)}
							<button class="dk-go" onclick={() => leaveThen(key, () => markReceived(t.c))}><Icon name="box" />Received</button>
						{:else if t.kind === 'msg'}
							<a class="dk-go" href="/studio/inbox/{t.c.code}"><Icon name="send" />Reply</a>
						{:else}
							<a class="dk-go" href="/studio/c/{t.c.code}">{t.kind === 'new' ? 'Review' : 'Open'}<Icon name="arrow" /></a>
						{/if}
						<a class="dk-ib" href="/studio/inbox/{t.c.code}" aria-label="Message {t.c.brand.name}"><Icon name="send" /></a>
					</div>
				</article>
			{/each}
		</div>
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

<AlertsPrompt />

<section class="hs">
	<header class="hs-h"><h2>This week</h2><a href="/studio/calendar">Calendar</a></header>
	<div class="wkx">
		{#each week as d (d.i)}
			<a class="wkx-d" class:now={d.i === 0} class:busy={d.list.length > 0} href="/studio/calendar" style="--i:{d.i}">
				<small>{d.i === 0 ? 'Today' : d.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small>
				<b>{d.dt.getDate()}</b>
				<span class="wkx-dots">{#each d.list.slice(0, 3) as e (e.c.id + e.kind)}<i class="k-{e.kind}"></i>{/each}</span>
			</a>
		{/each}
	</div>
	{#if upcoming.length}
		<ul class="upc">
			{#each upcoming as e (e.c.id + e.kind + e.date)}
				<li><a href="/studio/c/{e.c.code}"><span class="upc-ic tint k-{e.kind}"><Icon name={KIND_ICON[e.kind] ?? 'cal'} /></span><span class="upc-t"><b>{evLabel(e)}</b><small>{e.c.brand.name}</small></span><span class="upc-w">{relWord(diff(e.date))}</span></a></li>
			{/each}
		</ul>
	{:else}
		<p class="upc-none">A free week ahead. Good time to plan content.</p>
	{/if}
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
