<script lang="ts">
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
	import Icon from './Icon.svelte';
	import Ticket from './Ticket.svelte';
	import CycleText from './CycleText.svelte';
	import DiwaliLayer from './DiwaliLayer.svelte';
	import { diwaliWords, festivalNow } from '../festival';

	// Today for a brand on a phone: the creator's Today, piece for piece (the living header, the row of
	// tickets, the set-up card, the moving line, the money card, Needs you and This week), with the brand's numbers.
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const d = $derived(brandHome.dash);
	const m = $derived(brandToday.money);
	const T = today();
	const hour = new Date().getHours();
	// A festival on now (festival.ts): its theme on this card and its greeting on the day, as on the creator's Today.
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
	// Each creator card comes alive like the creator's collab cards: a light runs round its edge in its own colour
	// (amber when it's your turn), and its line turns through a few facts about them, each card a beat after the last.
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

	// This week: the next seven days as capsules, the picked one below (today first).
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
</script>

<section class="ht" class:dw-on={!!fest} style="--sy:{sy}">
	<div class="ht-glow" aria-hidden="true"><i></i><i></i><i></i></div>
	{#if fest}<DiwaliLayer />{/if}
	<a class="ht-orb" href={ig ? '/brand/settings' : '/brand/creators'} aria-label={ig ? 'Your Instagram' : 'Your creators'}>
		<span class="orb-ring" aria-hidden="true"></span>
		<span class="orb-in">
			{#if ig?.picture}
				<img class="orb-pic" src={ig.picture} alt="" />
			{:else}
				<b>{creators.length}</b><small>creator{creators.length === 1 ? '' : 's'}</small>
			{/if}
		</span>
		{#if ig?.picture}<span class="orb-badge"><b>{compact(ig.followers ?? 0)}</b> followers</span>{/if}
		<span class="orb-spark s1" aria-hidden="true"></span><span class="orb-spark s2" aria-hidden="true"></span><span class="orb-spark s3" aria-hidden="true"></span>
	</a>
	<p class="ht-date">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{#if note}<span class="dw-note">{note}</span>{/if}</p>
	<h1 class="ht-hi">{greet},<br /><em>{who}</em></h1>
	<p class="ht-sum">
		<span class="ht-dot" class:calm={!waiting.length}></span>
		{waiting.length ? `${waiting.length} waiting on you` : 'Nothing waiting on you'} · {d?.open ?? 0} open request{d?.open === 1 ? '' : 's'}
	</p>
</section>

<!-- The creator's row of collab tickets: here, the creators the brand works with. -->
<section class="tix" aria-label="Your creators">
	<div class="tix-h">
		<span>Your creators</span>
		{#if creators.length}<a href="/brand/creators">See all</a>{/if}
	</div>
	<div class="tix-row">
		{#each creators as c, i (c.id)}
			{@const lines = cardLines(c)}
			<a class="tix-t tone-{c.waiting ? 'now' : c.open ? 'calm' : 'ok'}" style="--rt:{cardHue(!!c.waiting, i)};--k:{i}" href={at(c.slug, '/brand/requests')} aria-label="{c.name}: {c.open ?? 0} open">
				<b class="tix-n">{c.name}</b>
				<span class="tix-l" aria-hidden="true">{#if lines.length}<CycleText {i} items={lines} />{:else}Creator{/if}</span>
				<i class="tix-cut" aria-hidden="true"></i>
				<span class="tix-f"><strong>{c.open ? `${c.open} open` : `${c.done ?? 0} done`}</strong><em>{c.waiting ? 'Your turn' : c.open ? 'In progress' : 'Done'}</em></span>
			</a>
		{:else}
			<a class="tix-t tix-tip" href="/brand/creators?tab=discover"><Icon name="search" /><b class="tix-n">Find creators</b><span class="tix-l">By niche, city, language</span></a>
			<a class="tix-t tix-tip" href="/brand/creators?tab=pools"><Icon name="layers" /><b class="tix-n">Make a pool</b><span class="tix-l">Then send one campaign</span></a>
			<a class="tix-t tix-tip" href="/brand/settings"><Icon name="shield" /><b class="tix-n">Instagram</b><span class="tix-l">Show you're the real brand</span></a>
		{/each}
	</div>
</section>

<!-- A new brand's first steps (gone once they're done): the creator's set-up card. -->
{#if showSetup}
	<section class="ob ob-ph" aria-label="Finish setting up">
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

{#if ticker.length > 1}
	<div class="cr-ticker cr-tk" aria-label="Today in numbers"><div>{#each [0, 1] as k (k)}{#each ticker as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><i aria-hidden="true">✦</i>{/each}{/each}</div></div>
{/if}

<section class="hero-card glow m-hero" aria-label="Money this month">
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
	<section class="hs">
		<header class="hs-h"><h2>Autopilots</h2><span class="hs-n">{apWaiting}</span></header>
		<div class="tks">
			<Ticket name="Autopilots" mark="AI" hue="var(--g1)" title="{apWaiting} waiting for your OK" sub="Your autopilots" task="Approve or edit what they drafted" status="Waiting on you" tone="hot" href="/brand/autopilots#inbox">
				<a class="btn grad" href="/brand/autopilots#inbox">Open</a>
			</Ticket>
		</div>
	</section>
{/if}

<section class="hs">
	<header class="hs-h"><h2>Needs you</h2>{#if waiting.length}<span class="hs-n">{waiting.length}</span>{/if}</header>
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
			{#if !fanned && waiting.length > 2}<span class="cr-edge tk-edge" aria-hidden="true"></span>{/if}
		</div>
		{#if waiting.length > 2}
			<button class="cr-more" onclick={() => (fanned = !fanned)}>
				{#if !fanned}<span class="cr-dots" aria-hidden="true">{#each waiting.slice(2, 5) as w (w.kind + w.code)}<i style="--h:var(--m{hueOf(w.creator)})"></i>{/each}</span>+{waiting.length - 2} more{:else}Show less{/if}
			</button>
		{/if}
	{:else}
		<!-- Nothing to do: the same glowing card as the money one, with two good next steps. -->
		<div class="clear hero-card glow">
			<div class="mesh" aria-hidden="true"></div>
			<span class="clear-ic"><Icon name="check" /></span>
			<b>You're all caught up</b>
			<small>Quotes and drafts to approve land here.</small>
			<div class="clear-acts">
				<a class="glass-chip" href="/brand/creators?tab=discover"><Icon name="search" />Find creators</a>
				<a class="glass-chip" href="/brand/campaigns"><Icon name="send" />Start a campaign</a>
			</div>
		</div>
	{/if}
</section>

<section class="hs wk2">
	<header class="hs-h"><h2>This week</h2><a href="/brand/business/calendar">Calendar</a></header>
	<p class="wk2-say">
		{#if weekN}{NUM[weekN] ?? weekN} thing{weekN === 1 ? '' : 's'} this week.{#if busiest.list.length > 1}{' '}<em>{dayName(busiest.dt, busiest.i)}</em> is the big one.{:else}{' '}Next up: <em>{dayName(week.find((x) => x.list.length)!.dt, week.find((x) => x.list.length)!.i).toLowerCase()}</em>.{/if}
		{:else}A quiet week. <em>Plan a campaign.</em>{/if}
	</p>
	<div class="wk2-days" role="group" aria-label="Pick a day">
		{#each week as x (x.i)}
			<button class="wk2-d" class:now={x.i === 0} class:on={x.i === pick} onclick={() => (pick = x.i)} aria-label="{dayName(x.dt, x.i)}, {x.list.length || 'nothing'} {x.list.length === 1 ? 'thing' : 'things'}" aria-pressed={x.i === pick}>
				<small>{x.i === 0 ? 'Today' : x.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small>
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
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="wk2-free">Nothing booked. A free day is a good day to line up the next campaign:</p>
				<div class="wk2-ideas">
					<a href="/brand/creators?tab=discover"><span class="k-shoot"><Icon name="search" /></span>Find creators</a>
					<a href="/brand/campaigns"><span class="k-live"><Icon name="send" /></span>New campaign</a>
					<a href="/brand/business/content"><span class="k-draft"><Icon name="film" /></span>Reuse content</a>
				</div>
			{/if}
		</div>
	{/key}
	<div class="wk2-key" aria-hidden="true"><span class="k-shoot"><i></i>Shoot</span><span class="k-draft"><i></i>Draft due</span><span class="k-live"><i></i>Goes live</span></div>
</section>
