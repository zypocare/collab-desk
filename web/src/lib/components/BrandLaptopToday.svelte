<script lang="ts">
	import { auth } from '../auth.svelte';
	import { autopilots } from '../autopilots.svelte';
	import { brandHome } from '../brand.svelte';
	import { brandSetup, brandToday, KIND_LINE, KIND_WORD } from '../brandToday.svelte';
	import { addressFor } from '../creatorHost';
	import { pageSlug } from '../supabase';
	import { countUp } from '../ui.svelte';
	import { firstName, fmt, hueOf, initials, inr, inrS, iso, today } from '../util';
	import Icon from './Icon.svelte';
	import Ticket from './Ticket.svelte';

	// Today for a brand on a laptop: the creator's laptop Today, block for block. Greeting and search,
	// the set-up card, story rings, the moving line, money beside Autopilots, Needs you beside This week.
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const d = $derived(brandHome.dash);
	const m = $derived(brandToday.money);
	const T = today();
	const hour = new Date().getHours();
	const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
	const monthName = T.toLocaleDateString('en-IN', { month: 'long' });
	const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
	const who = $derived(d?.name || acc?.brand?.name || acc?.profile?.name || '');
	const creators = $derived(d?.creators ?? []);
	const waiting = $derived(d?.waiting ?? []);
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));
	const hasCreators = $derived(creators.length > 0);

	// Money
	const spent = $derived(m?.paid_month ?? d?.spent_month ?? 0);
	const toPay = $derived(m?.to_pay ?? d?.to_pay ?? 0);
	const ring = $derived(spent + toPay ? spent / (spent + toPay) : 0);
	const pctN = $derived(Math.round(ring * 100));
	const nextDue = $derived(
		(m?.invoices ?? []).filter((i) => i.status !== 'paid' && i.due_date).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]
	);

	// The moving line of numbers
	const ticker = $derived(
		[
			spent > 0 && { b: inrS(spent), t: ` paid to creators in ${monthName}` },
			waiting.length > 0 && { b: String(waiting.length), t: ' waiting on you' },
			(d?.open ?? 0) > 0 && { b: String(d?.open), t: ` open request${d?.open === 1 ? '' : 's'}` },
			toPay > 0 && { b: inrS(toPay), t: ' still to pay' },
			d?.live_soon[0] && { b: firstName(d.live_soon[0].creator), t: ` goes live ${fmt(d.live_soon[0].live_date)}` },
			creators.length > 0 && { b: String(creators.length), t: ` creator${creators.length === 1 ? '' : 's'} on your team` }
		].filter((x): x is { b: string; t: string } => !!x)
	);

	// Set up
	const steps = $derived(brandSetup());
	const doneN = $derived(steps.filter((x) => x.done).length);
	let hidden = $state(true);
	const hideKey = $derived(`cd-bsetup-hide-${acc?.email ?? ''}`);
	$effect(() => {
		try {
			hidden = localStorage.getItem(hideKey) === '1';
		} catch {
			hidden = false;
		}
	});
	function hide() {
		hidden = true;
		try {
			localStorage.setItem(hideKey, '1');
		} catch {
			/* storage blocked */
		}
	}
	const showSetup = $derived(!!d && !hidden && doneN < steps.length);

	// Autopilots, where the creator has Desk AI.
	const apWaiting = $derived(autopilots.settings?.waiting ?? 0);

	// Needs you
	let fanned = $state(false);

	// This week
	const week = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const dt = new Date(T.getTime() + i * 864e5);
			return { i, dt, list: brandToday.week.filter((e) => e.date === iso(dt)) };
		})
	);
	const firstBusy = $derived(week.find((x) => x.list.length)?.i ?? 0);
	let picked = $state<number | null>(null);
	const pick = $derived(picked ?? firstBusy);
	const day = $derived(week[pick]);
	const weekN = $derived(week.reduce((a, x) => a + x.list.length, 0));
	const busiest = $derived([...week].sort((a, b) => b.list.length - a.list.length)[0]);
	const dayWord = (i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : week[i].dt.toLocaleDateString('en-IN', { weekday: 'long' }));
	const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
	const hint = $derived(creators[0]?.name ?? 'a creator');
</script>

<div class="lt">
	<!-- Header -->
	<header class="l-h">
		<div class="l-hi">
			<span class="l-eb">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{waiting.length ? ` · ${waiting.length} waiting on you` : ''}</span>
			<h1>{greet}, <em>{who}</em></h1>
		</div>
		<a class="l-search" href="/brand/creators?tab=discover">
			<Icon name="search" /><span>search “{hint}”</span><kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
		</a>
		<a class="l-neo l-grad l-shine l-new" href={hasCreators ? '/brand/campaigns/new' : '/brand/creators?tab=discover'}><Icon name="plus" />New campaign</a>
	</header>

	<!-- A new brand's first steps (gone once they're done). -->
	{#if showSetup}
		<section class="ob" aria-label="Finish setting up">
			<header class="ob-h">
				<div class="ob-t">
					<span class="ob-eb">Set up · {doneN} of {steps.length} done</span>
					<h2>Finish setting up, <em>{who || 'your brand'}</em></h2>
				</div>
				<button class="ob-x" onclick={hide} aria-label="Hide this for good"><Icon name="x" /></button>
			</header>
			<div class="ob-bar" style="--n:{steps.length}" aria-hidden="true">{#each steps as st (st.id)}<i class:on={st.done}></i>{/each}</div>
			<ol class="ob-list">
				{#each steps as st (st.id)}
					<li class:done={st.done}>
						<span class="ob-tick" aria-hidden="true">{#if st.done}<Icon name="check" />{/if}</span>
						<span class="ob-s"><b>{st.title}</b><small>{st.sub}</small></span>
						{#if !st.done}<a class="ob-neo" href={st.href}>{st.act}<Icon name="chevR" /></a>{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<!-- Story rings: the creators -->
	<nav class="l-rings" aria-label="Your creators">
		<a class="l-rg l-me" href="/brand/creators?tab=discover"><span class="l-r"><span class="l-in">+</span></span><span class="l-n">Find creators</span></a>
		{#each creators as c (c.id)}
			<a class="l-rg" href={at(c.slug, '/brand/requests')}><span class="l-r"><span class="l-in" style="background:var(--m{hueOf(c.name)})">{initials(c.name)}</span></span><span class="l-n">{c.name}</span></a>
		{/each}
	</nav>

	<!-- Ticker -->
	{#if ticker.length}
		<div class="l-tick" aria-label="Today in numbers"><div>{#each [0, 1] as k (k)}{#each ticker as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><i aria-hidden="true">✦</i>{/each}{/each}</div></div>
	{/if}

	<!-- Row 1: money + Autopilots -->
	<div class="l-row">
		<section class="l-money" aria-label="Money this month">
			<div class="l-mt"><span>Paid in {monthName}</span><a href="/brand/business/money">Payments</a></div>
			<div class="l-mm">
				<div class="l-big">
					<b use:countUp={{ value: spent, money: true }}>{inr(spent)}</b>
					<span>to {m?.paid_month_creators ?? 0} creator{m?.paid_month_creators === 1 ? '' : 's'}{#if spent + toPay}{' · '}<strong>{pctN}%</strong> of what's due is paid{/if}</span>
				</div>
				<div class="l-goal">
					<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="ltgb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--g1)" /><stop offset=".55" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g3)" /></linearGradient></defs><circle cx="60" cy="60" r="50" class="l-tr" /><circle cx="60" cy="60" r="50" class="l-pr" pathLength="100" style="stroke:url(#ltgb);stroke-dasharray:{Math.max(0.5, Math.round(ring * 100))} 100" /></svg>
					<span><b>{pctN}%</b><small>paid</small></span>
				</div>
			</div>
			<div class="l-tiles">
				<a href="/brand/business/money"><small>Still to pay</small><b class="l-num">{inr(toPay)}</b></a>
				<a href="/brand/business/money"><small>Overdue</small><b class="l-num">{inr(m?.overdue ?? 0)}</b></a>
				<a href="/brand/business/money"><small>Next due</small><b class="l-txt">{nextDue ? `${firstName(nextDue.creator)} · ${fmt(nextDue.due_date)}` : 'Nothing due'}</b></a>
			</div>
		</section>

		<section class="l-ai">
			<div class="l-ai-in">
				<div class="l-ai-top">
					<span class="l-orb" aria-hidden="true"><i></i><i></i><i></i></span>
					<span class="l-cap">Autopilots{apWaiting ? ` · ${apWaiting} for you` : ''}</span>
				</div>
				<h2>
					{#if apWaiting}{apWaiting === 1 ? 'One draft is' : `${apWaiting} drafts are`} waiting for your <em class="l-g">OK</em>.
					{:else}Let autopilots <em class="l-g">find creators</em>, chase drafts and pay on time.{/if}
				</h2>
				<div class="l-ai-btns">
					<a class="l-neo l-white l-shine" href="/brand/autopilots{apWaiting ? '#inbox' : ''}">{apWaiting ? 'Review them' : 'Set up autopilots'}</a>
					<a class="l-neo l-dark" href="/brand/creators?tab=discover">Find creators</a>
				</div>
			</div>
		</section>
	</div>

	<!-- Row 2: Needs you + This week -->
	<div class="l-row l-top">
		<section class="l-col">
			<div class="l-sh"><h2>Needs you</h2>{#if waiting.length}<span class="l-count">{waiting.length}</span>{/if}{#if !hasCreators}<a href="/brand/creators?tab=discover">Find creators →</a>{/if}</div>
			{#if waiting.length}
				<div class="tks l-grid">
					{#each fanned ? waiting : waiting.slice(0, 4) as w, i (w.kind + w.code + (w.round ?? ''))}
						<Ticket
							name={w.creator}
							sub={w.code}
							money={w.kind === 'quote' && w.amount ? inrS(w.amount) : ''}
							moneySub={w.kind === 'quote' ? 'Quote' : ''}
							task={w.kind === 'quote' ? `Review ${firstName(w.creator)}'s quote` : `Approve ${firstName(w.creator)}'s draft`}
							status={w.kind === 'draft' && w.live_date ? `Goes live ${fmt(w.live_date)}` : 'Waiting on you'}
							tone="hot"
							href={at(w.slug, `/brand/r/${w.code}`)}
							{i}
						>
							<a class="l-neo {w.kind === 'quote' ? 'l-grad' : 'l-white'}" href={at(w.slug, `/brand/r/${w.code}`)}>{w.kind === 'quote' ? 'Review' : 'Approve'}</a>
						</Ticket>
					{/each}
				</div>
				{#if waiting.length > 4}<button class="l-more" onclick={() => (fanned = !fanned)}>{fanned ? 'Show less' : `+${waiting.length - 4} more`}</button>{/if}
			{:else}
				<div class="l-clear"><b>You're all caught up</b><small>Quotes and drafts to approve land here.</small></div>
			{/if}
		</section>

		<section class="l-col">
			<div class="l-sh"><h2>This week</h2><a href="/brand/business/calendar">Calendar →</a></div>
			<div class="l-card l-wk">
				<h3>{#if weekN}{NUM[weekN] ?? weekN} thing{weekN === 1 ? '' : 's'} this week.{#if busiest.list.length > 1}{' '}<em>{dayWord(busiest.i)}</em> is the big one.{/if}{:else}A quiet week. <em>Plan a campaign.</em>{/if}</h3>
				<div class="l-days" role="group" aria-label="Pick a day">
					{#each week as x (x.i)}
						<button class="l-d" class:l-now={x.i === 0} class:l-on={x.i === pick && x.i !== 0} onclick={() => (picked = x.i)} aria-pressed={x.i === pick}>
							<small>{x.i === 0 ? 'Today' : x.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small>
							<b>{x.dt.getDate()}</b>
							<span class="l-dots">{#each x.list.slice(0, 3) as e (e.code + e.kind)}<i class="k-{e.kind}"></i>{/each}</span>
						</button>
					{/each}
				</div>
				{#key pick}
					<div class="l-ag">
						{#each day.list as e (e.code + e.kind)}
							<a class="l-ev k-{e.kind}" href={at(e.slug, `/brand/r/${e.code}`)}>
								<span class="l-tm">All day</span>
								<span class="l-ln"><i></i><span class="l-node"></span></span>
								<span class="l-tx"><em>{KIND_WORD[e.kind]}</em><b>{e.creator} · {e.code}</b><small>{KIND_LINE[e.kind]}</small></span>
							</a>
						{:else}
							<p class="l-free-day">Nothing on {dayWord(pick).toLowerCase()}. A good day to line up the next campaign.</p>
						{/each}
					</div>
				{/key}
			</div>
		</section>
	</div>
</div>
