<script lang="ts">
	import FoundingBanner from './FoundingBanner.svelte';
	import { igImg } from '../igImg';
	import { onMount } from 'svelte';
	import { auth } from '../auth.svelte';
	import { autopilots } from '../autopilots.svelte';
	import { brandHome } from '../brand.svelte';
	import { brandIg } from '../brandIg.svelte';
	import { brandSetup, brandToday, KIND_LINE, KIND_WORD } from '../brandToday.svelte';
	import { addressFor } from '../creatorHost';
	import { pageSlug } from '../supabase';
	import { countUp } from '../ui.svelte';
	import { compact, firstName, fmt, hueOf, inr, inrS, iso, today } from '../util';
	import { homeMotion } from '../homeMotion';
	import '../../home-motion.css';
	import Icon from './Icon.svelte';
	import PlayUpdateCard from './PlayUpdateCard.svelte';
	import Ticket from './Ticket.svelte';
	import CycleText from './CycleText.svelte';
	import DiwaliLayer from './DiwaliLayer.svelte';
	import { diwaliWords, festivalNow } from '../festival';

	// Today for a brand on a phone: matches the Creator Living Today Cockpit (living hero card with
	// 3-mode orb, interactive status chips, 4 NeoPOP quick actions, creator tickets, live ticker,
	// dark Money Vault, Autopilots, Needs you deck, and This week leaf calendar).
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const d = $derived(brandHome.dash);
	const m = $derived(brandToday.money);
	const T = today();
	const hour = new Date().getHours();
	const fest = festivalNow();
	const dw = fest ? diwaliWords(fest) : null;
	const greet = dw?.greet ?? (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
	const note = dw?.note ?? '';
	const monthName = T.toLocaleDateString('en-IN', { month: 'long' });
	const who = $derived(d?.name || acc?.brand?.name || acc?.profile?.name || '');
	const creators = $derived(d?.creators ?? []);
	const waiting = $derived(d?.waiting ?? []);
	const ig = $derived(brandIg.data);
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));
	const HUES = ['var(--g2)', 'var(--g1)', 'var(--g3)', 'var(--h-live)', 'var(--h-request)'];
	const cardHue = (waitingOn: boolean, i: number) => (waitingOn ? 'var(--g3)' : HUES[i % HUES.length]);
	const cardLines = (c: (typeof creators)[number]) =>
		[...new Set([[c.niche, c.city].filter(Boolean).join(' · '), c.followers ? `${compact(c.followers)} followers` : '', c.open ? `${c.open} open request${c.open === 1 ? '' : 's'}` : '', c.done ? `${c.done} done with you` : ''].filter((x): x is string => !!x))].slice(0, 4);

	// The header drifts and fades a little as the screen scrolls.
	let sy = $state(0);
	onMount(() => {
		const on = () => (sy = Math.min(240, scrollY));
		on();
		addEventListener('scroll', on, { passive: true });
		return () => removeEventListener('scroll', on);
	});

	// Interactive 3-mode orb + pauseable ticker
	let orbMode = $state(0);
	function cycleOrbMode() {
		orbMode = (orbMode + 1) % 3;
	}
	let tickerPaused = $state(false);

	// Money: spent this month against what's still to pay.
	const spent = $derived(m?.paid_month ?? d?.spent_month ?? 0);
	const toPay = $derived(m?.to_pay ?? d?.to_pay ?? 0);
	const pct = $derived(spent + toPay ? spent / (spent + toPay) : 0);
	const pctN = $derived(Math.round(pct * 100));
	const nextDue = $derived(
		(m?.invoices ?? []).filter((i) => i.status !== 'paid' && i.due_date).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))[0]
	);
	const apWaiting = $derived(autopilots.settings?.waiting ?? 0);

	// The moving line of numbers.
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

	// Set up: the creator's card, with a brand's steps.
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

	// Needs you: two, then "+N more" fans out the rest.
	let fanned = $state(false);

	// This week: the next seven days as tear-off leaves, the picked one below (today first).
	let pick = $state(0);
	const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
	const week = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const dt = new Date(T.getTime() + i * 864e5);
			return { i, dt, list: brandToday.week.filter((e) => e.date === iso(dt)) };
		})
	);
	const weekN = $derived(week.reduce((a, x) => a + x.list.length, 0));
	const busiest = $derived([...week].sort((a, b) => b.list.length - a.list.length)[0]);
	const dayName = (dt: Date, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-IN', { weekday: 'long' }));
	const picked = $derived(week[pick]);
	const LEAF_ORDER = ['shoot', 'draft', 'live'];
	const LEAF: Record<string, string> = { shoot: '#9C7BFF', draft: '#C9B6FF', live: '#F25A90' };
</script>

<div class="phone-today" use:homeMotion>
<section class="ht" class:dw-on={!!fest} style="--sy:{sy}">
	<div class="ht-glow" aria-hidden="true"><i></i><i></i><i></i></div>
	{#if fest}<DiwaliLayer />{/if}
	{#if note}
		<div class="fest-pill-wrap">
			<span class="fest-banner">🪔 {note}</span>
		</div>
	{/if}
	<div class="ht-top-row">
		<div class="ht-copy">
			<p class="ht-date">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
			<h1 class="ht-hi"><span>{greet},</span><em>{who}</em></h1>
		</div>
		<button type="button" class="ht-orb" onclick={cycleOrbMode} aria-label="Cycle live brand metrics">
			<span class="orb-ring" aria-hidden="true"></span>
			<span class="orb-ring-2" aria-hidden="true"></span>
			<span class="orb-in">
				{#if orbMode === 0 && ig?.picture}
					<img class="orb-pic" src={igImg(ig.picture)} alt="" />
				{:else if orbMode === 0}
					<b>{creators.length}</b><small>creator{creators.length === 1 ? '' : 's'}</small>
					<span class="orb-pill pink">{d?.open ?? 0} open</span>
				{:else if orbMode === 1}
					<b>{pctN}%</b><small>paid this mo.</small>
					<span class="orb-pill gold">{inrS(spent)}</span>
				{:else}
					<b>{creators.length}</b><small>on your roster</small>
					<span class="orb-pill">★ {waiting.length} waiting</span>
				{/if}
			</span>
			{#if orbMode === 0 && ig?.picture}
				<span class="orb-badge"><b>{compact(ig.followers ?? 0)}</b> <i>IG</i></span>
			{/if}
			<span class="orb-mode-dots" aria-hidden="true">
				<i class:on={orbMode === 0}></i><i class:on={orbMode === 1}></i><i class:on={orbMode === 2}></i>
			</span>
			<span class="orb-spark s1" aria-hidden="true"></span><span class="orb-spark s2" aria-hidden="true"></span><span class="orb-spark s3" aria-hidden="true"></span>
		</button>
	</div>

	<!-- Interactive Status Chips -->
	<div class="ht-chips">
		<a class="ht-chip" class:urgent={waiting.length > 0} href="#sec-needs">
			<span class="dot-ping" class:calm={!waiting.length}></span>
			<span>{#if waiting.length > 0}<b>{waiting.length}</b> waiting on you{:else}<b>All caught up</b> today{/if}</span>
		</a>
		<a class="ht-chip" href="/brand/creators">
			{#if creators.length}
				<span class="mini-avs" aria-hidden="true">
					{#each creators.slice(0, 3) as cr (cr.id)}
						<i style="--h:var(--m{hueOf(cr.name)})">{cr.name.trim().slice(0, 1).toUpperCase()}</i>
					{/each}
				</span>
			{/if}
			<span><b>{creators.length}</b> creator{creators.length === 1 ? '' : 's'}</span>
		</a>
		{#if apWaiting > 0}
			<a class="ht-chip" href="/brand/autopilots#inbox">
				<span class="ht-spark" aria-hidden="true">✦</span>
				<span><b>{apWaiting}</b> autopilot{apWaiting === 1 ? '' : 's'}</span>
			</a>
		{:else}
			<a class="ht-chip" href="/brand/requests">
				<span class="ht-spark" aria-hidden="true">✦</span>
				<span><b>{d?.open ?? 0}</b> open request{(d?.open ?? 0) === 1 ? '' : 's'}</span>
			</a>
		{/if}
	</div>

	<!-- 4 Tactile NeoPOP Quick Actions -->
	<div class="qa-strip">
		<a class="qa-card primary" href="/brand/explore">
			<span class="qa-ic"><Icon name="search" /></span>
			<span>Find creators</span>
		</a>
		<a class="qa-card" href={creators.length ? '/brand/campaigns/new' : '/brand/explore'}>
			<span class="qa-ic"><span class="qa-tag">NEW</span><Icon name="send" /></span>
			<span>Campaign</span>
		</a>
		<a class="qa-card" href="/brand/business/money">
			<span class="qa-ic"><Icon name="wallet" /></span>
			<span>Payments</span>
		</a>
		<a class="qa-card" href="/brand/autopilots">
			<span class="qa-ic"><span class="qa-tag">AI</span><Icon name="spark" /></span>
			<span>Autopilots</span>
		</a>
	</div>
</section>

	<PlayUpdateCard />

<FoundingBanner />

<!-- Your creators horizontal ticket rail -->
<section class="tix" id="sec-creators" aria-label="Your creators">
	<div class="tix-h">
		<span class="tix-h-left">
			<span>Your creators</span>
			{#if creators.length}<b class="tix-cnt">{creators.length}</b>{/if}
		</span>
		{#if creators.length}<a href="/brand/creators">See all →</a>{/if}
	</div>
	<div class="tix-row">
		{#each creators as c, i (c.id)}
			{@const lines = cardLines(c)}
			<a class="tix-t tone-{c.waiting ? 'now' : c.open ? 'calm' : 'ok'}" style="--rt:{cardHue(!!c.waiting, i)};--k:{i}" href={at(c.slug, '/brand/requests')} aria-label="{c.name}: {c.open ?? 0} open">
				<span class="tix-top">
					<span class="tix-av">{c.name.trim().slice(0, 1).toUpperCase() || 'C'}</span>
					<small class="tix-step">{c.waiting ? 'Your turn' : c.open ? 'Active' : 'Done'}</small>
				</span>
				<b class="tix-n">{c.name}</b>
				<span class="tix-l" aria-hidden="true">{#if lines.length}<CycleText {i} items={lines} />{:else}Creator{/if}</span>
				<i class="tix-cut" aria-hidden="true"></i>
				<span class="tix-f"><strong>{c.open ? `${c.open} open` : `${c.done ?? 0} done`}</strong><em>{c.waiting ? 'Your turn' : c.open ? 'In progress' : 'Done'}</em></span>
			</a>
		{:else}
			<a class="tix-t tix-tip" href="/brand/explore"><Icon name="search" /><b class="tix-n">Find creators</b><span class="tix-l">By niche, city, language</span></a>
			<a class="tix-t tix-tip" href="/brand/creators?tab=pools"><Icon name="layers" /><b class="tix-n">Make a pool</b><span class="tix-l">Then send one campaign</span></a>
			<a class="tix-t tix-tip" href="/brand/settings"><Icon name="shield" /><b class="tix-n">Instagram</b><span class="tix-l">Show you're the real brand</span></a>
		{/each}
	</div>
</section>

<!-- A new brand's first steps (gone once they're done) -->
{#if showSetup}
	<section class="ob ob-ph" aria-label="Finish setting up">
		<header class="ob-h">
			<div class="ob-t">
				<span class="ob-eb">Set up · {doneN} of {steps.length} done</span>
				<h2>Finish setting up, <em>{who || 'your brand'}</em></h2>
			</div>
			<button type="button" class="ob-x" onclick={hide} aria-label="Hide this for good"><Icon name="x" /></button>
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

{#if ticker.length > 1}
	<div class="cr-ticker cr-tk" data-paused={tickerPaused} aria-label="Today in numbers"><div>{#each [0, 1] as k (k)}{#each ticker as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><i aria-hidden="true">✦</i>{/each}{/each}</div><button type="button" class="home-ticker-pause" aria-label={tickerPaused ? 'Resume numbers ticker' : 'Pause numbers ticker'} aria-pressed={tickerPaused} onclick={() => (tickerPaused = !tickerPaused)}>{tickerPaused ? '▶' : 'Ⅱ'}</button></div>
{/if}

<section class="hero-card glow m-hero" id="sec-money" aria-label="Money this month">
	<div class="mesh" aria-hidden="true"></div>
	<div class="hc-in">
		<div class="hc-top"><span class="hc-eb">Paid in {monthName}</span><a class="glass-chip" href="/brand/business/money"><Icon name="wallet" />Payments</a></div>
		<div class="hc-main">
			<div>
				<div class="hc-val" use:countUp={{ value: spent, money: true }}>{inr(spent)}</div>
				<div class="hc-sub">to {m?.paid_month_creators ?? 0} creator{m?.paid_month_creators === 1 ? '' : 's'}{#if spent + toPay}{' · '}<b>{pctN}%</b> of what's due is paid{/if}</div>
			</div>
			<div class="goal" style="--p:{pct}">
				<svg viewBox="0 0 120 120" aria-hidden="true"
					><defs
						><linearGradient id="goalGradB" x1="0" y1="0" x2="1" y2="1"
							><stop offset="0" style="stop-color:var(--g3)" /><stop offset=".5" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g1)" /></linearGradient
						></defs
					><circle class="g-track" cx="60" cy="60" r="50" /><circle class="g-prog" cx="60" cy="60" r="50" pathLength="100" style="stroke:url(#goalGradB)" /></svg
				>
				<div class="g-txt"><b use:countUp={{ value: pctN, suffix: '%' }}>{pctN}%</b><small>paid</small></div>
			</div>
		</div>
		<div class="hc-foot">
			<a href="/brand/business/money"><small>Still to pay</small><b use:countUp={{ value: toPay, money: true }}>{inr(toPay)}</b></a>
			<a href="/brand/business/money"><small>Overdue</small><b class:od={(m?.overdue ?? 0) > 0} use:countUp={{ value: m?.overdue ?? 0, money: true }}>{inr(m?.overdue ?? 0)}</b></a>
			<a href="/brand/business/money"><small>Next due</small><b>{nextDue ? `${firstName(nextDue.creator)} · ${fmt(nextDue.due_date)}` : 'Nothing due'}</b></a>
		</div>
	</div>
</section>

{#if apWaiting}
	<section class="hs" id="sec-ai">
		<header class="hs-h"><h2>Autopilots</h2><span class="hs-n">{apWaiting}</span></header>
		<div class="tks">
			<Ticket name="Autopilots" mark="AI" hue="var(--g1)" title="{apWaiting} waiting for your OK" sub="Your autopilots" task="Approve or edit what they drafted" status="Waiting on you" tone="hot" href="/brand/autopilots#inbox">
				<a class="btn grad" href="/brand/autopilots#inbox">Open</a>
			</Ticket>
		</div>
	</section>
{/if}

<section class="hs" id="sec-needs">
	<header class="hs-h">
		<h2>Needs you</h2>
		{#if waiting.length}<span class="hs-n">{waiting.length}</span>{/if}
		{#if waiting.length > 2}
			<button type="button" class="sec-link-btn" onclick={() => (fanned = !fanned)}>
				{fanned ? 'Collapse' : `Show all ${waiting.length}`}
			</button>
		{/if}
	</header>
	{#if waiting.length}
		<div class="tks">
			{#each fanned ? waiting : waiting.slice(0, 2) as w, i (w.kind + w.code + (w.round ?? ''))}
				<Ticket
					name={w.creator}
					sub={w.code}
					money={w.kind === 'quote' && w.amount ? inrS(w.amount) : ''}
					moneySub={w.kind === 'quote' ? 'quote' : ''}
					task={w.kind === 'quote' ? `Review ${firstName(w.creator)}'s quote` : `Approve ${firstName(w.creator)}'s draft`}
					status={w.kind === 'draft' && w.live_date ? `Goes live ${fmt(w.live_date)}` : 'Waiting on you'}
					tone="hot"
					href={at(w.slug, `/brand/r/${w.code}`)}
					{i}
				>
					<a class="btn grad" href={at(w.slug, `/brand/r/${w.code}`)}>{w.kind === 'quote' ? 'Review' : 'Approve'}</a>
				</Ticket>
			{/each}
		</div>
		{#if !fanned && waiting.length > 2}
			<div class="tk-stack-edges" aria-hidden="true">
				<span class="tk-edge-1"></span>
				{#if waiting.length > 3}<span class="tk-edge-2"></span>{/if}
			</div>
		{/if}
		{#if waiting.length > 2}
			<button type="button" class="cr-more" aria-expanded={fanned} onclick={() => (fanned = !fanned)}>
				{#if !fanned}<span class="cr-dots" aria-hidden="true">{#each waiting.slice(2, 5) as w (w.kind + w.code)}<i style="--h:var(--m{hueOf(w.creator)})"></i>{/each}</span>+{waiting.length - 2} more{:else}Show less{/if}
			</button>
		{/if}
	{:else}
		<div class="clear hero-card glow">
			<div class="mesh" aria-hidden="true"></div>
			<span class="clear-ic"><Icon name="check" /></span>
			<b>You're all caught up</b>
			<small>Quotes and drafts to approve land here.</small>
			<div class="clear-acts">
				<a class="glass-chip" href="/brand/explore"><Icon name="search" />Find creators</a>
				<a class="glass-chip" href="/brand/campaigns"><Icon name="send" />Start a campaign</a>
			</div>
		</div>
	{/if}
</section>

<section class="hs wk2" id="sec-week">
	<header class="hs-h"><h2>This week</h2><a href="/brand/business/calendar">Full Calendar →</a></header>
	<p class="wk2-say">
		{#if weekN}{NUM[weekN] ?? weekN} thing{weekN === 1 ? '' : 's'} this week.{#if busiest.list.length > 1}{' '}<em>{dayName(busiest.dt, busiest.i)}</em> is the big one.{:else}{' '}Next up: <em>{dayName(week.find((x) => x.list.length)!.dt, week.find((x) => x.list.length)!.i).toLowerCase()}</em>.{/if}
		{:else}A quiet week. <em>Plan a campaign.</em>{/if}
	</p>
	<div class="wk2-days" role="group" aria-label="Pick a day">
		{#each week as x (x.i)}
			{@const first = [...x.list].sort((a, b) => LEAF_ORDER.indexOf(a.kind) - LEAF_ORDER.indexOf(b.kind))[0]}
			<button type="button" class="wk2-d" class:now={x.i === 0} class:on={x.i === pick} class:free={!x.list.length} style={first ? `--h:${LEAF[first.kind] ?? '#C9B6FF'}` : ''} onclick={() => (pick = x.i)} aria-label="{dayName(x.dt, x.i)}, {x.list.length || 'nothing'} {x.list.length === 1 ? 'thing' : 'things'}" aria-pressed={x.i === pick}>
				<em>{x.i === 0 ? 'Today' : x.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</em>
				<b>{x.dt.getDate()}</b>
				<span class="wk2-dots">{#each x.list.slice(0, 3) as e (e.code + e.kind)}<i class="k-{e.kind}"></i>{/each}</span>
			</button>
		{/each}
	</div>
	{#key pick}
		<div class="wk2-day">
			<div class="wk2-day-h"><b>{dayName(picked.dt, picked.i)}{picked.i > 1 ? `, ${picked.dt.getDate()} ${picked.dt.toLocaleDateString('en-IN', { month: 'short' })}` : ''}</b><small>{picked.list.length ? `${picked.list.length} thing${picked.list.length === 1 ? '' : 's'}` : 'Free'}</small></div>
			{#if picked.list.length}
				<ul class="wk2-tl">
					{#each picked.list as e (e.code + e.kind)}
						<li class="k-{e.kind}">
							<a href={at(e.slug, `/brand/r/${e.code}`)}>
								<span class="wk2-node" aria-hidden="true"></span>
								<span class="wk2-ev"><em>{KIND_WORD[e.kind]}</em><b>{e.creator} · {e.code}</b><small>{KIND_LINE[e.kind]}</small></span>
								<span class="wk2-open">Open</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="wk2-free">Nothing booked. A free day is a good day to line up the next campaign:</p>
				<div class="wk2-ideas">
					<a href="/brand/explore" class="k-shoot"><span><Icon name="search" /></span>Find creators</a>
					<a href="/brand/campaigns" class="k-live"><span><Icon name="send" /></span>New campaign</a>
					<a href="/brand/business/content" class="k-draft"><span><Icon name="film" /></span>Reuse content</a>
				</div>
			{/if}
		</div>
	{/key}
	<div class="wk2-key" aria-hidden="true"><span class="k-shoot"><i></i>Shoot</span><span class="k-draft"><i></i>Draft due</span><span class="k-live"><i></i>Goes live</span></div>
</section>
</div>
