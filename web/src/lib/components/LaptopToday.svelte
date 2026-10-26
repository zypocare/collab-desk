<script lang="ts">
	import { onMount } from 'svelte';
	import { askAi } from '../ai';
	import { receivedIn } from '../invoice';
	import { addLeadAsCollab, lastBrandLines } from '../leads';
	import { isRanked } from '../priority';
	import { askPaid, completeFollow, decisionOf, markPaid, markReceived, priorityOf, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { countUp, ui } from '../ui.svelte';
	import {
		STAGES,
		TYPE_LABEL,
		delivText,
		diff,
		evLabel,
		events,
		firstName,
		fmt,
		hueOf,
		inTransit,
		initials,
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
		stageLabel,
		mergeSteps, tasks,
		today,
		type Task
	} from '../util';
	import AlertsPrompt from './AlertsPrompt.svelte';
	import AwayMode from './AwayMode.svelte';
	import BrandQuestions from './BrandQuestions.svelte';
	import Icon from './Icon.svelte';
	import NudgeList from './NudgeList.svelte';
	import Ticket from './Ticket.svelte';

	// Today on a laptop: the approved design, block for block. Greeting and search, story rings, the
	// moving line of numbers, money beside Desk AI, Needs you beside This week, then the open requests
	// with their scores beside the pipeline.
	const s = $derived(studio.settings!);
	const list = $derived(studio.collabs);
	const T = today();
	const hour = new Date().getHours();
	const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
	const monthName = T.toLocaleDateString('en-IN', { month: 'long' });
	const ym = iso(T).slice(0, 7);
	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

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
	const goal = $derived(Math.max(0, s.monthly_goal || 0));
	const pctN = $derived(goal ? Math.round((received / goal) * 100) : 0);
	const ring = $derived(Math.min(1, goal ? received / goal : 0));
	const outs = $derived(list.reduce((a, c) => a + outstanding(c), 0));
	const od = $derived(list.filter(overdue).reduce((a, c) => a + outstanding(c), 0));
	const paidN = $derived(new Set(list.filter((c) => receivedIn(c, ym) > 0).map((c) => c.brand_id)).size);
	const nextPayout = $derived(
		list.filter((c) => isPaid(c) && c.pay_status !== 'paid' && c.pay_due && diff(c.pay_due) >= 0).sort((a, b) => parse(a.pay_due!).getTime() - parse(b.pay_due!).getTime())[0]
	);

	// Search bar hint, as in the design: search “<a brand>”.
	const hintBrand = $derived(active[0]?.brand.name ?? studio.brands[0]?.name ?? 'a brand');

	// Story rings
	const need = $derived([...new Map(ts.map((t) => [t.c.id, t])).values()]);
	const rest = $derived(active.filter((c) => !need.some((t) => t.c.id === c.id)));
	const rings = $derived([...need.map((t) => t.c), ...rest].slice(0, 12));

	// The moving line of numbers
	const ticker = $derived(
		[
			received > 0 && { b: inrS(received), t: ` came in this ${monthName}` },
			urgent > 0 && { b: String(urgent), t: ' due today' },
			list.filter((c) => c.stage === 'request').length > 0 && { b: String(list.filter((c) => c.stage === 'request').length), t: ' new requests waiting' },
			outs > 0 && { b: inrS(outs), t: ' still to come in' },
			goal > 0 && { b: `${pctN}%`, t: ` of the ${inrS(goal)} goal` },
			nextPayout && { b: nextPayout.brand.name, t: ` pays next, ${fmt(nextPayout.pay_due!)}` }
		].filter((x): x is { b: string; t: string } => !!x)
	);

	// Desk AI: the line at the top, the newest lead's own words, and the scored requests.
	const open = $derived(
		list.filter(isRanked).map((c) => ({ c, d: decisionOf(c) })).filter((x) => x.d).sort((a, b) => b.d!.score - a.d!.score).slice(0, 3)
	);
	const leads = $derived([...studio.leads].sort((a, b) => Number(b.collab_flag === 'likely') - Number(a.collab_flag === 'likely')));
	const lead = $derived(leads[0]);
	let said = $state<Record<string, string>>({});
	$effect(() => {
		const ids = leads.slice(0, 3).map((l) => l.igsid);
		if (ids.length) lastBrandLines(ids).then((r) => (said = r));
	});
	let left = $state<number | null>(null);
	onMount(() => {
		askAi<{ pct: number }>('status', {})
			.then((r) => (left = r.pct))
			.catch(() => supabase.rpc('ai_left').then(({ data }) => (left = (data as { pct?: number } | null)?.pct ?? null)));
	});
	const VERDICT: Record<string, string> = { take: 'worth a yes', negotiate: 'worth a counter', pass: 'likely a pass' };
	const forYou = $derived(Math.min(leads.length, 3) + open.length);
	let adding = $state(false);
	async function addLead() {
		if (!lead) return;
		adding = true;
		await addLeadAsCollab(lead.igsid, lead.username, lead.name);
		adding = false;
	}
	const ago = (at: string | null) => (at ? relWord(diff(at.slice(0, 10))) : '');
	const gauge = (score: number) => `${((2 * Math.PI * 27 * score) / 100).toFixed(1)} ${(2 * Math.PI * 27).toFixed(1)}`;
	const vColor = (v: string) => (v === 'take' ? 'var(--ok)' : v === 'negotiate' ? 'var(--warn)' : 'var(--bad)');

	// Needs you
	let fanned = $state(false);
	let leaving = $state<string | null>(null);
	function leaveThen(key: string, fn: () => void) {
		leaving = key;
		setTimeout(() => {
			fn();
			leaving = null;
		}, 380);
	}
	const hot = (t: Task) => t.kind === 'pay' || t.kind === 'msg' || t.d < 0 || (t.kind === 'new' && diff(t.c.received_on) <= -1);
	const ticketMoney = (t: Task) => (t.c.type === 'barter' ? (t.c.product_value ? inrS(t.c.product_value) : 'Barter') : t.c.fee ? inrS(t.c.fee) : 'Quote');
	const when = (t: Task) => {
		if (t.kind === 'msg') return 'Waiting for your reply';
		if (t.kind === 'new') return `Received ${relWord(diff(t.c.received_on))}`;
		if (t.kind === 'pay' || t.d < 0) return `${-t.d} day${-t.d > 1 ? 's' : ''} late`;
		return t.d === 0 ? 'Today' : relWord(t.d);
	};

	// This week
	const evs = $derived(events(list));
	const week = $derived(Array.from({ length: 7 }, (_, i) => ({ i, dt: parse(rel(i)), list: evs.filter((e) => e.date === rel(i)) })));
	const firstBusy = $derived(week.find((d) => d.list.length)?.i ?? 0);
	let picked = $state<number | null>(null);
	const pick = $derived(picked ?? firstBusy);
	const day = $derived(week[pick]);
	const KIND_WORD: Record<string, string> = { shoot: 'Shoot', draft: 'Draft due', live: 'Goes live', pay: 'Payment due', follow: 'Follow-up', product: 'Product arrives' };
	const weekN = $derived(week.reduce((a, d) => a + d.list.length, 0));
	const busiest = $derived([...week].sort((a, b) => b.list.length - a.list.length)[0]);
	const dayWord = (i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : week[i].dt.toLocaleDateString('en-IN', { weekday: 'long' }));
	const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
	const time = (e: (typeof evs)[number]) => (e.kind === 'live' && e.c.live_time ? e.c.live_time.slice(0, 5) : 'All day');
	const sub = (e: (typeof evs)[number]) =>
		e.kind === 'pay' ? `${inr(outstanding(e.c))} to come in` : e.kind === 'draft' ? 'First cut to the brand' : e.kind === 'live' ? 'Post, tag the brand, pin the link' : e.kind === 'shoot' ? 'Charge up, find the light' : stageLabel(e.c.stage);

	// Pipeline
	const PH: Record<string, string> = { request: 'var(--h-request)', negotiating: 'var(--h-nego)', confirmed: 'var(--h-confirmed)', creating: 'var(--h-creating)', live: 'var(--h-live)' };
	const SHORT: Record<string, string> = { request: 'New', negotiating: 'Talks', confirmed: 'Agreed', creating: 'Creating', live: 'Live' };
	const pipe = $derived(STAGES.slice(0, 5).map((st) => ({ st, n: list.filter((c) => c.stage === st.id).length })));
	const pipeMax = $derived(Math.max(1, ...pipe.map((p) => p.n)));
	import SetupChecklist from '#lib/components/SetupChecklist.svelte';
	import CheckupCard from '#lib/components/CheckupCard.svelte';
</script>

<div class="lt">
	<!-- Header -->
	<header class="l-h">
		<div class="l-hi">
			<span class="l-eb">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{urgent ? ` · ${urgent} due today` : ''}</span>
			<h1>{greet}, <em>{firstName(s.display_name)}</em></h1>
		</div>
		<button class="l-search" onclick={() => (ui.searchOpen = true)}>
			<Icon name="search" /><span>search “{hintBrand}”</span><kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
		</button>
		<button class="l-neo l-grad l-shine l-new" onclick={() => (ui.newCollab = true)}><Icon name="plus" />New collab</button>
	</header>

	<!-- A new creator's first steps (gone once they're done). -->
	<CheckupCard />
	<SetupChecklist />

	<!-- Story rings -->
	<nav class="l-rings" aria-label="Collabs that need you">
		<button class="l-rg l-me" onclick={() => (ui.newCollab = true)}><span class="l-r"><span class="l-in">+</span></span><span class="l-n">New collab</span></button>
		{#each rings as c (c.id)}
			<a class="l-rg" href="/studio/c/{c.code}"><span class="l-r"><span class="l-in" style="background:var(--m{hueOf(c.brand.name)})">{initials(c.brand.name)}</span></span><span class="l-n">{c.brand.name}</span></a>
		{/each}
	</nav>

	<!-- Ticker -->
	{#if ticker.length}
		<div class="l-tick" aria-label="Today in numbers"><div>{#each [0, 1] as k (k)}{#each ticker as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><i aria-hidden="true">✦</i>{/each}{/each}</div></div>
	{/if}

	<!-- Row 1: money + Desk AI -->
	<div class="l-row">
		<section class="l-money" aria-label="Money this month">
			<div class="l-mt"><span>Received in {monthName}</span>{#if goal}<a href="/studio/settings?s=payments">Goal {inrS(goal)}</a>{/if}</div>
			<div class="l-mm">
				<div class="l-big">
					<b use:countUp={{ value: received, money: true }}>{inr(received)}</b>
					<span>from {paidN} brand{paidN === 1 ? '' : 's'}{#if goal}{' · '}<strong>{pctN}%</strong> of this month's goal{/if}</span>
				</div>
				{#if goal}
					<div class="l-goal">
						<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="ltg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--g1)" /><stop offset=".55" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g3)" /></linearGradient></defs><circle cx="60" cy="60" r="50" class="l-tr" /><circle cx="60" cy="60" r="50" class="l-pr" pathLength="100" style="stroke-dasharray:{Math.max(0.5, Math.round(ring * 100))} 100" /></svg>
						<span><b>{pctN}%</b><small>of goal</small></span>
					</div>
				{/if}
			</div>
			<div class="l-tiles">
				<a href="/studio/payments"><small>Still to come</small><b class="l-num">{inr(outs)}</b></a>
				<a href="/studio/payments"><small>Overdue</small><b class="l-num">{inr(od)}</b></a>
				<a href="/studio/payments"><small>Next payout</small><b class="l-txt">{nextPayout ? `${nextPayout.brand.name} · ${fmt(nextPayout.pay_due)}` : 'None scheduled'}</b></a>
			</div>
		</section>

		<section class="l-ai">
			<div class="l-ai-in">
				<div class="l-ai-top">
					<span class="ai-mark" aria-hidden="true"><i></i><svg viewBox="0 0 24 24"><path d="M12 2.5c.7 4.6 3.9 7.8 8.5 8.5-4.6.7-7.8 3.9-8.5 8.5-.7-4.6-3.9-7.8-8.5-8.5 4.6-.7 7.8-3.9 8.5-8.5z"/><path class="s2" d="M19 15.5c.25 1.6 1.4 2.75 3 3-1.6.25-2.75 1.4-3 3-.25-1.6-1.4-2.75-3-3 1.6-.25 2.75-1.4 3-3z"/></svg></span>
					<span class="l-cap">Desk AI{forYou ? ` · ${forYou} for you` : ''}</span>
					{#if left !== null}<span class="l-free">{left}% free</span>{/if}
				</div>
				<h2>
					{#if leads.length}{leads.length === 1 ? 'A brand slid' : `${leads.length} brands slid`} into your <em class="l-g">DMs</em>.{/if}
					{#if open[0]}{' '}{open[0].c.brand.name} looks <em class="l-w">{VERDICT[open[0].d!.verdict] ?? 'worth a look'}</em>.{/if}
					{#if !leads.length && !open[0]}A quiet desk. Time to <em class="l-g">pitch</em> a brand you love.{/if}
				</h2>
				{#if lead}
					<div class="l-dm">{said[lead.igsid] || lead.collab_hint || 'May want to work with you'}<small>@{lead.username || 'someone'} · Instagram{lead.last_at ? ` · ${ago(lead.last_at)}` : ''}</small></div>
					<div class="l-ai-btns">
						<button class="l-neo l-white l-shine" disabled={adding} onclick={addLead}>{#if adding}<span class="spinner"></span>{:else}+{/if} Add as collab</button>
						<a class="l-neo l-dark" href="/studio/inbox/ig/{lead.igsid}">Open chat</a>
					</div>
				{:else}
					{#if open[0]}<div class="l-dm">{open[0].d!.line}<small>{open[0].c.brand.name} · {stageLabel(open[0].c.stage)}</small></div>{/if}
					<div class="l-ai-btns">
						<button class="l-neo l-white l-shine" onclick={() => (ui.askOpen = true)}>Ask your desk</button>
						<a class="l-neo l-dark" href="/studio/inbox">Messages</a>
					</div>
				{/if}
			</div>
		</section>
	</div>

	<!-- Row 2: Needs you + This week -->
	<div class="l-row l-top">
		<section class="l-col">
			<div class="l-sh"><h2>Needs you</h2>{#if ts.length}<span class="l-count">{ts.length}</span>{/if}<a href="/studio/collabs">See all →</a></div>
			{#if ts.length}
				<div class="tks l-grid">
					{#each fanned ? ts : ts.slice(0, 4) as t, i (t.c.id + t.kind)}
						{@const key = t.c.id + t.kind}
						<Ticket name={t.c.brand.name} sub={stageLabel(t.c.stage)} money={ticketMoney(t)} moneySub={t.kind === 'pay' ? 'Due' : delivText(t.c.deliverables) || TYPE_LABEL[t.c.type]} task={t.title} status={when(t)} tone={hot(t) ? 'hot' : 'warn'} href="/studio/c/{t.c.code}" leaving={leaving === key} {i}>
							{#if t.kind === 'follow' && t.c.stage !== 'paused'}
								<button class="l-neo l-white" onclick={() => leaveThen(key, () => completeFollow(t.c))}>Done</button>
							{:else if t.kind === 'pay'}
								<button class="l-neo l-white" onclick={async () => (await askPaid(t.c)) && leaveThen(key, () => markPaid(t.c, false, true))}>Mark paid</button>
							{:else if t.kind === 'product' && inTransit(t.c)}
								<button class="l-neo l-white" onclick={() => leaveThen(key, () => markReceived(t.c))}>Received</button>
							{:else if t.kind === 'msg'}
								<a class="l-neo l-grad" href="/studio/inbox/{t.c.code}">Reply</a>
							{:else}
								<a class="l-neo {t.kind === 'new' ? 'l-grad' : 'l-white'}" href="/studio/c/{t.c.code}">{t.kind === 'new' ? 'Review' : 'Open'}</a>
							{/if}
						</Ticket>
					{/each}
				</div>
				{#if ts.length > 4}<button class="l-more" onclick={() => (fanned = !fanned)}>{fanned ? 'Show less' : `+${ts.length - 4} more`}</button>{/if}
			{:else}
				<div class="l-clear"><b>You're all caught up</b><small>New requests, payments and follow-ups land here.</small></div>
			{/if}
		</section>

		<section class="l-col">
			<div class="l-sh"><h2>This week</h2><a href="/studio/calendar">Calendar →</a></div>
			<div class="l-card l-wk">
				<h3>{#if weekN}{NUM[weekN] ?? weekN} thing{weekN === 1 ? '' : 's'} this week.{#if busiest.list.length > 1}{' '}<em>{dayWord(busiest.i)}</em> is the big one.{/if}{:else}A free week. <em>Make it count.</em>{/if}</h3>
				<div class="l-days" role="group" aria-label="Pick a day">
					{#each week as d (d.i)}
						<button class="l-d" class:l-now={d.i === 0} class:l-on={d.i === pick && d.i !== 0} onclick={() => (picked = d.i)} aria-pressed={d.i === pick}>
							<small>{d.i === 0 ? 'Today' : d.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small>
							<b>{d.dt.getDate()}</b>
							<span class="l-dots">{#each d.list.slice(0, 3) as e (e.c.id + e.kind)}<i class="k-{e.kind}"></i>{/each}</span>
						</button>
					{/each}
				</div>
				{#key pick}
					<div class="l-ag">
						{#each day.list as e (e.c.id + e.kind)}
							<a class="l-ev k-{e.kind}" href="/studio/c/{e.c.code}">
								<span class="l-tm">{time(e)}</span>
								<span class="l-ln"><i></i><span class="l-node"></span></span>
								<span class="l-tx"><em>{KIND_WORD[e.kind] ?? evLabel(e)}{pick === 1 && e.kind === 'shoot' ? ' · tomorrow' : ''}</em><b>{e.c.brand.name}{delivText(e.c.deliverables) ? ` · ${delivText(e.c.deliverables)}` : ''}</b><small>{sub(e)}</small></span>
							</a>
						{:else}
							<p class="l-free-day">Nothing on {dayWord(pick).toLowerCase()}. A good day to plan content or pitch a dream brand.</p>
						{/each}
					</div>
				{/key}
			</div>
		</section>
	</div>

	<!-- Row 3: open requests scored + pipeline -->
	<div class="l-row">
		<section class="l-col">
			<div class="l-sh"><h2>Open requests · scored</h2></div>
			{#if open.length}
				<div class="l-scores">
					{#each open as { c, d } (c.id)}
						<button class="l-sc" onclick={() => (ui.openCollab = c.id)} style="--v:{vColor(d!.verdict)}">
							<span class="l-gg"><svg viewBox="0 0 66 66" aria-hidden="true"><circle cx="33" cy="33" r="27" class="l-tr" /><circle cx="33" cy="33" r="27" class="l-pr" style="stroke-dasharray:{gauge(d!.score)}" /></svg><span>{d!.score}</span></span>
							<em>{d!.label}</em>
							<b>{c.brand.name}</b>
							<small>{d!.line}</small>
						</button>
					{/each}
				</div>
			{:else}
				<div class="l-clear"><b>No open requests</b><small>New requests are read and scored here as they come in.</small></div>
			{/if}
		</section>
		<section class="l-col">
			<div class="l-sh"><h2>Pipeline</h2><a href="/studio/collabs">Open board →</a></div>
			<div class="l-card l-pipe">
				{#each pipe as p (p.st.id)}
					<a href="/studio/collabs" style="--c:{PH[p.st.id]};--p:{Math.max(8, Math.round((p.n / pipeMax) * 100))}%">
						<b>{p.n}</b>
						<span class="l-bar"><i></i></span>
						<small>{SHORT[p.st.id]}</small>
					</a>
				{/each}
			</div>
		</section>
	</div>

	<!-- Below the design: the prompts that only show when needed. -->
	<AwayMode banner />
	<AlertsPrompt />
	<NudgeList />
	<BrandQuestions />
</div>

