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
		tasks,
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
		const all = tasks(list);
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
					<span class="l-orb" aria-hidden="true"><i></i><i></i><i></i></span>
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
							{#if t.kind === 'follow'}
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

<style>
	/* Every size, gap and colour below is taken from the approved laptop design. */
	.lt { display: flex; flex-direction: column; gap: 26px; padding-bottom: 48px; color: var(--ink); font-family: var(--f-body, Inter, system-ui, sans-serif); }

	/* Header */
	.l-h { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px; }
	.l-hi { flex: 1 1 360px; display: grid; gap: 6px; }
	.l-eb, .l-sh h2, .l-cap { margin: 0; font-family: var(--f-body, inherit); font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	.l-hi h1 { margin: 0; font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 52px; line-height: 1.02; letter-spacing: -.01em; }
	.l-hi h1 em, .l-ai h2 em.l-g, .l-wk h3 em { background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 4px; }
	.l-search { flex: 0 1 320px; height: 48px; display: flex; align-items: center; gap: 12px; padding: 0 18px; box-sizing: border-box; border-radius: 999px; border: 1px solid var(--line-strong); background: none; color: var(--ink-3); font: 400 14.5px var(--f-body, inherit); cursor: pointer; }
	.l-search :global(.ic) { width: 18px; height: 18px; color: var(--ink); stroke-width: 2; }
	.l-search span { flex: 1; min-width: 0; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.l-search kbd { margin-left: auto; font: 500 11px 'JetBrains Mono', var(--f-mono, monospace); padding: 3px 7px; border: 1px solid var(--line-strong); border-radius: 0; color: var(--ink-3); background: none; box-shadow: none; }

	/* NeoPOP buttons */
	.l-neo { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 0; font: 700 14px var(--f-body, inherit); text-decoration: none; cursor: pointer; transition: transform .07s, box-shadow .07s; flex: none; }
	.l-neo:active { transform: translate(3px, 3px); box-shadow: none !important; }
	.l-neo.l-grad { color: #fff; background: linear-gradient(110deg, var(--g1), var(--g2) 55%, var(--g3)); box-shadow: 4px 4px 0 #5c3ea0; }
	.l-neo.l-white { background: var(--ink); color: var(--bg); box-shadow: 4px 4px 0 var(--g2); }
	.l-neo.l-dark { border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); box-shadow: 3px 3px 0 var(--line-strong); }
	.l-neo :global(.ic) { width: 17px; height: 17px; stroke-width: 2.4; }
	.l-neo.l-new { height: 48px; padding: 0 22px; font-size: 14.5px; }
	.l-shine::after { content: ''; position: absolute; top: 0; bottom: 0; left: -60%; width: 45%; background: linear-gradient(100deg, transparent, rgba(255, 255, 255, .45), transparent); transform: skewX(-18deg); animation: sweep 5s ease-in-out 1s infinite; }
	@keyframes sweep { 0%, 70% { left: -60%; } 100% { left: 130%; } }
	.tks.l-grid :global(.tk-foot .l-neo) { height: 42px; padding: 0 16px; }

	/* Story rings */
	.l-rings { display: flex; gap: 18px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
	.l-rg { flex: none; width: 74px; display: grid; justify-items: center; gap: 7px; padding: 0; border: 0; background: none; font: 400 12px var(--f-body, inherit); color: var(--ink-2); text-decoration: none; cursor: pointer; }
	.l-rg .l-r { width: 70px; height: 70px; border-radius: 50%; padding: 3px; box-sizing: border-box; background: conic-gradient(var(--g3), var(--g2), var(--g1), var(--g3)); transition: transform .3s cubic-bezier(.2, 1.6, .4, 1); }
	.l-rg:hover .l-r { transform: scale(1.06); }
	.l-rg.l-me .l-r { background: var(--line); }
	.l-rg .l-in { display: grid; place-items: center; width: 100%; height: 100%; border-radius: 50%; border: 3px solid var(--bg); box-sizing: border-box; font-weight: 700; font-size: 16px; color: #fff; }
	.l-rg.l-me .l-in { background: var(--surface); color: var(--ink); font-size: 26px; }
	.l-rg .l-n { max-width: 74px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	/* Ticker: full width, between two thin lines */
	.l-tick { overflow: hidden; margin: 0 calc(-1 * var(--lt-gut, 40px)); background: var(--chrome); border-block: 1px solid #1f191f; }
	.l-tick > div { display: inline-flex; gap: 26px; padding: 11px 0; white-space: nowrap; font-size: 12.5px; color: rgba(255, 255, 255, .72); animation: tick 40s linear infinite; }
	.l-tick b { color: #FFAE6B; }
	.l-tick i { font-style: normal; color: #F25A90; }
	@keyframes tick { to { transform: translateX(-50%); } }

	.l-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 22px; }
	.l-row.l-top { align-items: start; }
	.l-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
	.l-sh { display: flex; align-items: center; gap: 10px; }
	.l-sh a { margin-left: auto; font-size: 13px; color: var(--ink-2); text-decoration: none; }
	.l-sh a:hover { color: var(--g3); }
	.l-count { min-width: 22px; height: 22px; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: var(--bad); color: #1C0912; font-size: 12px; font-weight: 800; display: inline-grid; place-items: center; }
	.l-card { padding: 22px; border-radius: 26px; border: 1px solid var(--line); background: var(--surface); }

	/* Money */
	.l-money { position: relative; overflow: hidden; border-radius: 26px; padding: 26px; display: flex; flex-direction: column; gap: 20px; color: #fff;
		background: radial-gradient(120% 90% at 0% 0%, rgba(242, 90, 144, .35), transparent 55%), radial-gradient(90% 90% at 100% 100%, rgba(156, 123, 255, .30), transparent 60%), linear-gradient(140deg, #2a1424, #160c14 70%); }
	.l-mt { display: flex; align-items: center; justify-content: space-between; }
	.l-mt span { font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: rgba(255, 255, 255, .7); }
	.l-mt a { height: 30px; padding: 0 12px; display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .22); font-size: 12px; font-weight: 600; color: #fff; text-decoration: none; }
	.l-mm { display: flex; align-items: center; gap: 22px; }
	.l-big { flex: 1; display: grid; gap: 6px; }
	.l-big b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 72px; line-height: 1; letter-spacing: -.02em; }
	.l-big span { font-size: 14px; color: rgba(255, 255, 255, .75); }
	.l-big strong { color: #fff; }
	.l-goal { position: relative; width: 126px; height: 126px; flex: none; }
	.l-goal svg { width: 126px; height: 126px; transform: rotate(-90deg); }
	.l-goal circle { fill: none; stroke-width: 10; }
	.l-goal .l-tr { stroke: rgba(255, 255, 255, .12); }
	.l-goal .l-pr { stroke: url(#ltg); stroke-linecap: round; }
	.l-goal > span { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
	.l-goal b { display: block; font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 30px; }
	.l-goal small { font-size: 11px; color: rgba(255, 255, 255, .7); }
	.l-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
	.l-tiles a { padding: 14px 16px; border-radius: 16px; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .12); display: grid; gap: 4px; color: #fff; text-decoration: none; }
	.l-tiles small { font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: rgba(255, 255, 255, .62); }
	.l-tiles b.l-num { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 26px; }
	.l-tiles b.l-txt { font-size: 15px; font-weight: 700; padding-top: 6px; }

	/* Desk AI: the whole card wears the flowing border */
	.l-ai { border-radius: 26px; padding: 1.5px; background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3), var(--g2), var(--g1)); background-size: 300% 100%; animation: flow 6s linear infinite; }
	@keyframes flow { to { background-position: 300% 0; } }
	.l-ai-in { height: 100%; box-sizing: border-box; border-radius: 25px; padding: 24px; display: flex; flex-direction: column; gap: 16px; background: radial-gradient(120% 70% at 0% 0%, rgba(156, 123, 255, .2), transparent 60%), var(--surface); }
	.l-ai-top { display: flex; align-items: center; gap: 10px; }
	.l-cap { color: var(--ink-2); }
	.l-free { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--ok); }
	.l-orb { position: relative; width: 30px; height: 30px; flex: none; }
	.l-orb i { position: absolute; border-radius: 50%; }
	.l-orb i:nth-child(1) { inset: -8px; background: radial-gradient(circle, rgba(242, 90, 144, .55), transparent 65%); animation: glow 3.2s ease-in-out infinite; }
	.l-orb i:nth-child(2) { inset: 0; background: conic-gradient(var(--g1), var(--g2), var(--g3), var(--g1)); animation: spin 6s linear infinite; }
	.l-orb i:nth-child(3) { inset: 5px; background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, .85), rgba(255, 255, 255, .08) 45%, transparent 60%), var(--surface); }
	@keyframes spin { to { transform: rotate(360deg); } }
	@keyframes glow { 0%, 100% { opacity: .55; transform: scale(1); } 50% { opacity: .95; transform: scale(1.18); } }
	.l-ai h2 { margin: 0; font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 30px; line-height: 1.1; letter-spacing: 0; }
	.l-ai h2 em { font-style: italic; }
	.l-ai h2 em.l-w { color: var(--g3); }
	.l-dm { padding: 13px 15px; border-radius: 18px 18px 18px 5px; background: var(--surface-2); font-size: 14px; line-height: 1.45; }
	.l-dm small { display: block; margin-top: 6px; font-size: 11.5px; color: var(--ink-3); }
	.l-ai-btns { display: flex; gap: 12px; margin-top: auto; padding-right: 4px; }
	.l-ai-btns .l-neo { flex: 1; height: 46px; }
	.l-ai-btns .l-neo.l-white { background: var(--ink); color: var(--bg); box-shadow: 4px 4px 0 var(--g2); }

	/* Needs you */
	.tks.l-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
	.tks.l-grid :global(.tk) { border-radius: 22px; transition: transform .3s cubic-bezier(.2, 1.5, .35, 1); }
	.tks.l-grid :global(.tk:hover) { transform: translateY(-3px); }
	.tks.l-grid :global(.tk-band) { padding: 16px 18px; }
	.tks.l-grid :global(.tk-who b) { font-size: 26px; }
	.tks.l-grid :global(.tk-money b) { font-size: 16px; }
	.tks.l-grid :global(.tk-foot) { padding: 14px 18px 16px; }
	.tks.l-grid :global(.tk-task b) { font-size: 14.5px; }
	.tks.l-grid :global(.tk-task small) { font-size: 10px; }
	.l-more { align-self: center; display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink); font: 600 13.5px var(--f-body, inherit); cursor: pointer; }
	.l-clear { padding: 26px; border-radius: 22px; border: 1px dashed var(--line-strong); display: grid; gap: 4px; }
	.l-clear b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 26px; }
	.l-clear small { color: var(--ink-3); }

	/* This week */
	.l-wk { display: flex; flex-direction: column; gap: 18px; background: radial-gradient(120% 60% at 100% 0%, rgba(242, 90, 144, .12), transparent 60%), var(--surface); }
	.l-wk h3 { margin: 0; font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 32px; line-height: 1.08; letter-spacing: 0; text-transform: none; color: var(--ink); }
	.l-wk h3 em { font-style: italic; }
	.l-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
	.l-d { height: 96px; padding: 12px 0 10px; box-sizing: border-box; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); display: flex; flex-direction: column; align-items: center; justify-content: space-between; font-family: var(--f-body, inherit); cursor: pointer; transition: transform .3s cubic-bezier(.2, 1.6, .4, 1); }
	.l-d small { font-size: 9.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
	.l-d b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 26px; line-height: 1; }
	.l-d .l-dots { display: flex; gap: 3px; height: 6px; }
	.l-d .l-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--k, var(--accent)); }
	.l-d.l-now { border: 0; color: #fff; background: linear-gradient(170deg, var(--g1), var(--g2) 60%, var(--g3)); box-shadow: 0 12px 30px -10px rgba(242, 90, 144, .7); }
	.l-d.l-now small { color: #fff; }
	.l-d.l-now .l-dots i { background: #fff; }
	.l-d.l-on { border: 1.5px solid var(--ink); background: var(--surface-2); transform: translateY(-4px); }
	.k-shoot { --k: var(--g3); } .k-draft { --k: var(--g1); } .k-live { --k: var(--g2); } .k-pay { --k: var(--ok); } .k-follow { --k: var(--warn); } .k-product { --k: var(--m2); }
	.l-ag { display: flex; flex-direction: column; }
	.l-ev { display: grid; grid-template-columns: 56px 18px minmax(0, 1fr); gap: 10px; min-height: 64px; color: var(--ink); text-decoration: none; }
	.l-ev .l-tm { padding-top: 2px; font: 600 12px 'JetBrains Mono', var(--f-mono, monospace); color: var(--ink-2); }
	.l-ev .l-ln { position: relative; display: flex; justify-content: center; }
	.l-ev .l-ln i { position: absolute; top: 16px; bottom: -4px; width: 2px; background: var(--line); }
	.l-ev:last-child .l-ln i { display: none; }
	.l-ev .l-node { position: relative; z-index: 1; margin-top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--k); box-shadow: 0 0 0 4px var(--surface), 0 0 14px var(--k); }
	.l-ev .l-tx { display: grid; gap: 3px; padding-bottom: 12px; align-content: start; }
	.l-ev .l-tx em { font-style: normal; font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: var(--k); }
	.l-ev .l-tx b { font-size: 15px; }
	.l-ev .l-tx small { font-size: 12.5px; color: var(--ink-3); }
	.l-free-day { margin: 0; font-size: 14px; color: var(--ink-2); }

	/* Open requests scored */
	.l-scores { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
	.l-sc { padding: 18px; border-radius: 22px; background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
	.l-gg { position: relative; width: 66px; height: 66px; }
	.l-gg svg { width: 66px; height: 66px; transform: rotate(-90deg); }
	.l-gg circle { fill: none; stroke-width: 6; }
	.l-gg .l-tr { stroke: var(--line); }
	.l-gg .l-pr { stroke: var(--v); stroke-linecap: round; }
	.l-gg span { position: absolute; inset: 0; display: grid; place-items: center; font-family: var(--f-serif, Georgia, serif); font-size: 26px; }
	.l-sc em { font-style: normal; font-size: 10px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; color: var(--v); }
	.l-sc b { font-size: 15.5px; }
	.l-sc small { font-size: 12.5px; line-height: 1.4; color: var(--ink-3); }

	/* Pipeline */
	.l-pipe { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; align-items: end; min-height: 236px; box-sizing: border-box; }
	.l-pipe a { display: grid; justify-items: center; gap: 8px; text-align: center; color: var(--ink); text-decoration: none; }
	.l-pipe b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 30px; line-height: 1; }
	.l-pipe .l-bar { position: relative; width: 100%; height: 120px; border-radius: 16px; background: var(--surface-2); overflow: hidden; }
	.l-pipe .l-bar i { position: absolute; left: 0; right: 0; bottom: 0; height: var(--p); border-radius: 16px; background: linear-gradient(0deg, var(--c), color-mix(in oklab, var(--c) 55%, transparent)); }
	.l-pipe small { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }

	@media (prefers-reduced-motion: reduce) { .l-tick > div, .l-ai, .l-orb i, .l-shine::after { animation: none; } }
</style>
