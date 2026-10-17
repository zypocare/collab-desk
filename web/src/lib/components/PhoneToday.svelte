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
		unreadFor,
		type Task
	} from '../util';
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
	const unread = $derived(list.reduce((a, c) => a + unreadFor(c), 0));

	// Money
	const received = $derived(list.filter((c) => c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(ym)).reduce((a, c) => a + c.pay_received, 0));
	const goal = $derived(s.monthly_goal || 0);
	const pct = $derived(goal ? Math.min(1, received / goal) : 0);
	const outs = $derived(list.reduce((a, c) => a + outstanding(c), 0));
	const od = $derived(list.filter(overdue));
	const odSum = $derived(od.reduce((a, c) => a + outstanding(c), 0));
	const dues = $derived(
		list
			.filter((c) => isPaid(c) && c.pay_status !== 'paid' && outstanding(c) > 0)
			.sort((a, b) => (a.pay_due ? parse(a.pay_due).getTime() : 9e15) - (b.pay_due ? parse(b.pay_due).getTime() : 9e15))
			.slice(0, 3)
	);
	const months = $derived(
		Array.from({ length: 6 }, (_, i) => {
			const d = new Date(T.getFullYear(), T.getMonth() - 5 + i, 1);
			const key = iso(d).slice(0, 7);
			return { key, label: d.toLocaleDateString('en-IN', { month: 'short' }), sum: list.filter((c) => (c.paid_on ?? '').startsWith(key)).reduce((a, c) => a + c.pay_received, 0) };
		})
	);
	const best = $derived(Math.max(1, ...months.map((m) => m.sum)));
	const sixTotal = $derived(months.reduce((a, m) => a + m.sum, 0));

	// The week
	const evs = $derived(events(list));
	const week = $derived(Array.from({ length: 7 }, (_, i) => ({ i, dt: parse(rel(i)), list: evs.filter((e) => e.date === rel(i)) })));
	const upcoming = $derived(evs.filter((e) => diff(e.date) >= 0 && diff(e.date) <= 6).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3));
	const pipe = $derived(STAGES.slice(0, 5).map((st) => ({ st, n: list.filter((c) => c.stage === st.id).length })));
	const pipeMax = $derived(Math.max(1, ...pipe.map((p) => p.n)));

	// Money cards: which one is showing (for the dots).
	let track = $state<HTMLElement>();
	let card = $state(0);
	const cards = $derived(od.length ? 4 : 3);
	const onTrack = () => {
		if (!track) return;
		const w = (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1;
		card = Math.round(track.scrollLeft / (w + 12));
	};
	const goCard = (i: number) => track?.scrollTo({ left: i * (((track.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) + 12), behavior: 'smooth' });

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
</script>

<section class="ht" style="--sy:{sy}">
	<div class="ht-glow" aria-hidden="true"><i></i><i></i><i></i></div>
	<p class="ht-date">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
	<h1 class="ht-hi">{greet},<br /><em>{firstName(s.display_name)}</em></h1>
	<p class="ht-sum">
		<span class="ht-dot" class:calm={!urgent}></span>
		{urgent ? `${urgent} thing${urgent > 1 ? 's' : ''} need${urgent > 1 ? '' : 's'} you today` : 'All clear today'} · {active.length} active collab{active.length === 1 ? '' : 's'}
	</p>
</section>

<Stories />

<nav class="qa" aria-label="Shortcuts">
	<button class="qa-b" onclick={() => (ui.newCollab = true)}><span class="qa-i grad"><Icon name="plus" /></span>New collab</button>
	<a class="qa-b" href="/studio/inbox"><span class="qa-i"><Icon name="send" />{#if unread}<i class="qa-n">{unread}</i>{/if}</span>Messages</a>
	<button class="qa-b" onclick={() => copyText(link, 'Your link is copied. Put it in your Instagram bio.')}><span class="qa-i"><Icon name="link" /></span>My link</button>
	<a class="qa-b" href="/studio/calendar"><span class="qa-i"><Icon name="cal" /></span>Calendar</a>
</nav>

<section class="mc-wrap" aria-label="Money">
	<div class="mc-track" bind:this={track} onscroll={onTrack}>
		<a class="mc mc-1" href="/studio/payments">
			<span class="mc-l">Received in {monthName}</span>
			<b class="mc-v" use:countUp={{ value: received, money: true }}>{inr(received)}</b>
			{#if goal}
				<div class="mc-bar"><i style="--p:{pct}"></i></div>
				<span class="mc-s"><b>{Math.round(pct * 100)}%</b> of your {inrS(goal)} goal</span>
			{:else}
				<span class="mc-s">Set a monthly goal in Invoices & payments</span>
			{/if}
		</a>
		<a class="mc mc-2" href="/studio/payments">
			<span class="mc-l">Still to come</span>
			<b class="mc-v" use:countUp={{ value: outs, money: true }}>{inr(outs)}</b>
			<ul class="mc-list">
				{#each dues as c (c.id)}<li><Mono name={c.brand.name} size="sm" /><span>{c.brand.name}</span><small>{c.pay_due ? fmt(c.pay_due) : 'no date'}</small><b>{inrS(outstanding(c))}</b></li>{:else}<li class="mc-none">Nothing waiting. Nice.</li>{/each}
			</ul>
		</a>
		<a class="mc mc-3" href="/studio/reports">
			<span class="mc-l">Last 6 months</span>
			<b class="mc-v" use:countUp={{ value: sixTotal, money: true }}>{inr(sixTotal)}</b>
			<div class="mc-chart">
				{#each months as m, i (m.key)}<div class="mc-col" class:now={i === 5}><i style="--h:{Math.max(0.05, m.sum / best)};--d:{i}"></i><small>{m.label}</small></div>{/each}
			</div>
		</a>
		{#if od.length}
			<a class="mc mc-4" href="/studio/payments">
				<span class="mc-l">Overdue</span>
				<b class="mc-v" use:countUp={{ value: odSum, money: true }}>{inr(odSum)}</b>
				<span class="mc-s">{od.length} invoice{od.length > 1 ? 's' : ''} past the due date. Tap to send reminders.</span>
			</a>
		{/if}
	</div>
	<div class="mc-dots">{#each Array.from({ length: cards }, (_, i) => i) as i (i)}<button class:on={card === i} aria-label="Card {i + 1}" onclick={() => goCard(i)}></button>{/each}</div>
</section>

<section class="hs">
	<header class="hs-h"><h2>Needs you</h2>{#if ts.length}<span class="hs-n">{ts.length}</span>{/if}</header>
	{#if ts.length}
		<div class="deck">
			{#each ts as t, i (t.c.id + t.kind)}
				{@const key = t.c.id + t.kind}
				<article class="dk k-{t.kind === 'pay' ? 'bad' : t.kind}" class:leaving={leaving === key} style="--hue:var(--m{hueOf(t.c.brand.name)});--i:{i}">
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
		<div class="clear"><span class="clear-ic"><Icon name="check" /></span><b>You're all caught up</b><small>New requests, payments and follow-ups land here.</small></div>
	{/if}
</section>

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
