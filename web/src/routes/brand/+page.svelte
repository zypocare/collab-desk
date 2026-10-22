<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { brandHome, discoverCreators, loadDashboard } from '#lib/brand.svelte.ts';
	import { brandIg } from '#lib/brandIg.svelte.ts';
	import { addressFor, isAppHost } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { compact, firstName, fmt, inr, inrS } from '#lib/util.ts';
	import Ticket from '#lib/components/Ticket.svelte';
	import type { BrandCreator } from '#lib/types.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import CompanyStep from '#lib/components/CompanyStep.svelte';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { autopilots } from '#lib/autopilots.svelte.ts';
	import { supabase } from '#lib/supabase.ts';

	// The brand dashboard: everything across every creator this login works with.
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const d = $derived(brandHome.dash);
	onMount(() => {
		loadDashboard();
		supabase.rpc('autopilots_get').then(({ data }) => data && (autopilots.settings = data as never));
	});
	const apWaiting = $derived(autopilots.settings?.waiting ?? 0);
	// A request or creator on another creator's address opens there (the sign-in is shared).
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));
	const T = new Date();
	const greet = T.getHours() < 12 ? 'Good morning' : T.getHours() < 17 ? 'Good afternoon' : 'Good evening';
	const who = $derived(d?.name || acc?.brand?.name || '');
	const month = T.toLocaleDateString('en-IN', { month: 'long' });
	const waiting = $derived(d?.waiting ?? []);
	const creatorsOpen = $derived((d?.creators ?? []).filter((c) => (c.open ?? 0) > 0).length);
	const line = (c: BrandCreator) =>
		[c.followers != null ? `${compact(c.followers)} followers` : '', c.open ? `${c.open} open` : c.done ? `${c.done} done` : ''].filter(Boolean).join(' · ');
	// Miracle's own address (app.miracleapp.live): no creator here, so the first step is finding one.
	const onApp = isAppHost(location.hostname);
	// A brand that just signed up: what's left to set up, and a few creators to start with.
	let starters = $state<BrandCreator[]>([]);
	$effect(() => {
		if (onApp && brandHome.dash && !brandHome.dash.creators?.length && !starters.length) discoverCreators().then((l) => (starters = l.slice(0, 2))).catch(() => {});
	});
	const setup = $derived([
		{ done: !!(acc?.profile || acc?.brand), title: 'Company details', note: 'Name, category and your role', href: '/brand/settings', cta: 'Edit' },
		{ done: !!brandIg.data, title: "Connect your brand's Instagram", note: "Creators see you're the real brand", href: '/brand/settings', cta: 'Connect' },
		{ done: !!acc?.profile?.gstin, title: 'Billing details', note: 'GSTIN and address, for GST you can claim', href: '/brand/settings?s=billing', cta: 'Add' },
		{ done: false, title: 'Send your first request', note: 'To one creator, or a campaign to a pool', href: '/brand/creators?tab=discover', cta: 'Find' }
	]);
	const setupDone = $derived(setup.filter((x) => x.done).length);
	const chip = (c: BrandCreator) => (c.waiting ? 'Your turn' : c.open ? 'In progress' : '');
</script>

<svelte:head><title>Dashboard · Miracle</title></svelte:head>

{#if acc && onApp && !d?.creators?.length && brandHome.dash}
	<!-- Just signed up: no creators yet. Set-up first, then creators to start with. -->
	<header class="bl-h rv">
		<div>
			<span class="bl-eb">Welcome to Miracle</span>
			<h1>Let's find your first <em>creator.</em></h1>
		</div>
	</header>
	<section class="bw-setup rv" style="--i:1">
		<div class="bw-top"><b>Get set up{who ? ', ' : ''}<em>{who}</em></b><small>{setupDone} of {setup.length} done</small></div>
		<div class="bw-bar">{#each setup as x, i (i)}<i class:on={x.done}></i>{/each}</div>
		<div class="bw-list">
			{#each setup as x (x.title)}
				<div class="bw-it" class:done={x.done}>
					<span class="bw-dot" aria-hidden="true">{x.done ? '✓' : ''}</span>
					<span class="bw-t"><b>{x.title}</b><small>{x.note}</small></span>
					{#if !x.done}<a class="bw-go" href={x.href}>{x.cta} ›</a>{/if}
				</div>
			{/each}
		</div>
	</section>
	<section class="bw-cr rv" style="--i:2">
		<div class="bw-hh"><span class="bl-eb">Creators on Miracle</span><a href="/brand/creators?tab=discover">See all</a></div>
		<div class="bw-cards">
			{#each starters as c (c.id)}
				<article class="bw-card">
					<div class="bw-who"><Avatar name={c.name} src={c.photo} size="48px" /><span><b>{firstName(c.name)}</b><small>{[c.niche, c.city].filter(Boolean).join(' · ')}</small></span></div>
					{#if c.followers != null}<span class="bw-n">{compact(c.followers)} followers{c.engagement != null ? ` · ${c.engagement}% engagement` : ''}</span>{/if}
					<div class="bw-acts"><a class="bw-go" href={at(c.slug, '/brand/new')}>Send request</a><a class="bw-ghost" href="/brand/creators?tab=discover">+ Pool</a></div>
				</article>
			{/each}
			<article class="bw-card bw-more">More creators join every week. Filter by niche, city and language in Creators.</article>
		</div>
	</section>
{:else if acc && !d?.creators?.length && !acc.brand && brandHome.dash}
	<!-- A brand that hasn't sent anything yet: set up the company for this creator first. -->
	<header class="ph rv"><div><div class="eb">Welcome</div><h1>Tell us about your <em>brand</em></h1><p>We'll use this on every request you send.</p></div></header>
	<CompanyStep creator={firstName(pub.data?.display_name ?? '')} />
{:else}
	{#if phone.on}<header class="bd-hero rv">
		<div>
			<span class="bd-date">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
			<h1>{greet},{#if who}<br /><em>{who}</em>{/if}</h1>
			{#if d}<p class="bd-sum"><i class:calm={!waiting.length}></i>{waiting.length ? `${waiting.length} waiting on you` : 'Nothing waiting on you'} · {d.open} open request{d.open === 1 ? '' : 's'}</p>{/if}
		</div>
		{#if onApp}<a class="bd-neo bd-grad" href="/brand/creators?tab=discover">Find creators</a>{:else if pub.data?.accepting !== false}<a class="bd-neo bd-grad" href="/brand/new">+ New request</a>{/if}
	</header>{/if}

	{#if brandHome.error}<div class="err-box">{brandHome.error}</div>{/if}
	{#if apWaiting}<a class="bd-ap rv" href="/brand/autopilots#inbox"><span class="bd-ap-tag">Autopilots</span><b>{apWaiting} waiting for your OK</b><span aria-hidden="true">›</span></a>{/if}

	{#if d && phone.on}
		<!-- Phones: creators as tickets, two numbers, then what's waiting. -->
		<section class="tix" aria-label="Your creators">
			<div class="bd-hh"><h2 class="bd-h">Your creators</h2><a href="/brand/creators">See all</a></div>
			<div class="tix-row">
				{#each d.creators as c (c.id)}
					<a class="tix-t" class:hot={!!c.waiting} href={at(c.slug, '/brand/requests')}>
						<span class="tix-who"><Avatar name={c.name} src={c.photo} size="28px" /><b>{firstName(c.name)}</b></span>
						<span class="tix-l">{[c.followers != null ? `${compact(c.followers)} followers` : '', c.niche?.split(',')[0]?.trim()].filter(Boolean).join(' · ') || c.city}</span>
						<i class="tix-cut" aria-hidden="true"></i>
						<span class="tix-f"><strong>{c.open ? `${c.open} open` : `${c.done ?? 0} done`}</strong>{#if chip(c)}<em>{chip(c)}</em>{/if}</span>
					</a>
				{/each}
			</div>
		</section>
		<div class="bd-stats bd-two">
			<div class="bd-stat"><span>Spent in {month}</span><b>{inr(d.spent_month)}</b><small>{d.to_pay ? `${inr(d.to_pay)} to pay` : 'nothing to pay'}</small></div>
			<div class="bd-stat"><span>Going live</span><b>{d.live_soon[0] ? fmt(d.live_soon[0].live_date) : '—'}</b><small>{d.live_soon[0] ? `with ${firstName(d.live_soon[0].creator)}` : 'nothing this week'}</small></div>
		</div>
		<h2 class="bd-h">Waiting on you</h2>
		{#if waiting.length}
			<!-- The same tickets as the creator's phone: the creator on a band, a torn line, then what to do. -->
			<div class="tks">
				{#each waiting as w, i (w.kind + w.code + (w.round ?? ''))}
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
						<a class="btn primary" href={at(w.slug, `/brand/r/${w.code}`)}>{w.kind === 'quote' ? 'Review' : 'Approve'}</a>
					</Ticket>
				{/each}
			</div>
		{:else}
			<p class="bd-none">Nothing needs you right now.</p>
		{/if}
		<a class="bd-c bd-more" style="margin-top:16px" href="/brand/creators?tab=discover"><span class="bd-plus" aria-hidden="true">+</span><span><b>Find more creators</b><small>Creators on Miracle open to brands</small></span></a>
	{:else if d}
		<!-- Laptops: the studio's Today, for a brand. -->
		<header class="bl-h rv">
			<div>
				<span class="bl-eb">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{waiting.length ? ` · ${waiting.length} waiting on you` : ''}</span>
				<h1>{greet}{#if who}, <em>{who}</em>{/if}</h1>
			</div>
			<div class="bl-acts">
				<a class="bl-neo bl-ghost" href="/brand/creators?tab=discover">Find creators</a>
				{#if onApp}<a class="bl-neo bl-grad" href="/brand/campaigns/new">+ New campaign</a>{:else if pub.data?.accepting !== false}<a class="bl-neo bl-grad" href="/brand/new">+ New request</a>{/if}
			</div>
		</header>

		<!-- Creators as rings, like the studio's brands. -->
		<section class="bl-rings rv" style="--i:1" aria-label="Your creators">
			<a class="bl-ring bl-add" href="/brand/creators?tab=discover"><span>+</span><small>Find creators</small></a>
			{#each d.creators as c (c.id)}
				<a class="bl-ring" class:hot={!!c.waiting} href={at(c.slug, '/brand/requests')} title={line(c)}><span><Avatar name={c.name} src={c.photo} size="56px" /></span><small>{firstName(c.name)}</small></a>
			{/each}
		</section>

		<div class="bl-grid">
			<section class="bl-money rv" style="--i:2">
				<span class="bl-eb">Spent in {month}</span>
				<b class="bl-big">{inr(d.spent_month)}</b>
				<span class="bl-sub">{d.to_pay ? `${inr(d.to_pay)} still to pay` : 'Nothing to pay right now'}</span>
				<div class="bl-mini">
					<div><small>Open requests</small><b>{d.open}</b></div>
					<div><small>Going live</small><b>{d.live_soon[0] ? fmt(d.live_soon[0].live_date) : '—'}</b></div>
					<div><small>Creators</small><b>{d.creators.length}</b></div>
				</div>
			</section>
			<section class="bl-wait rv" style="--i:3" aria-label="Waiting on you">
				<span class="bl-eb">Waiting on you · {waiting.length}</span>
				{#if waiting.length}
					<div class="tks">
						{#each waiting as w, i (w.kind + w.code + (w.round ?? ''))}
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
								<a class="btn primary" href={at(w.slug, `/brand/r/${w.code}`)}>{w.kind === 'quote' ? 'Review' : 'Approve'}</a>
							</Ticket>
						{/each}
					</div>
				{:else}
					<p class="bd-none">Nothing needs you right now. Quotes and drafts to approve show up here.</p>
				{/if}
			</section>
		</div>
	{:else if !brandHome.error}
		<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
	{/if}
{/if}

<style>
	.bw-setup {
		display: grid;
		gap: 16px;
		padding: 22px 24px;
		border-radius: 22px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		margin-bottom: 26px;
	}
	.bw-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.bw-top b {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 26px;
	}
	.bw-top em {
		color: var(--g2);
	}
	.bw-top small {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bw-bar {
		display: flex;
		gap: 6px;
	}
	.bw-bar i {
		flex: 1;
		height: 4px;
		background: var(--line-strong);
	}
	.bw-bar i.on {
		background: var(--g2);
	}
	.bw-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
		gap: 14px 28px;
	}
	.bw-it {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.bw-dot {
		flex: none;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
		font-size: 13px;
		color: #fff;
	}
	.bw-it.done .bw-dot {
		background: var(--g2);
		box-shadow: none;
	}
	.bw-t {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.bw-t b {
		font-size: 15px;
	}
	.bw-it.done .bw-t b {
		color: var(--ink-3);
		text-decoration: line-through;
	}
	.bw-t small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.bw-go {
		flex: none;
		display: inline-grid;
		place-items: center;
		height: 36px;
		padding: 0 12px;
		background: var(--ink);
		color: var(--bg);
		font: 700 13px/1 var(--f-body);
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--g2);
	}
	.bw-ghost {
		display: inline-grid;
		place-items: center;
		height: 36px;
		padding: 0 12px;
		color: var(--ink);
		font: 700 13px/1 var(--f-body);
		text-decoration: none;
		box-shadow: inset 0 0 0 1.5px var(--ink-3);
	}
	.bw-cr {
		display: grid;
		gap: 12px;
	}
	.bw-hh {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.bw-hh a {
		font-size: 13px;
		color: var(--ink-2);
	}
	.bw-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
		gap: 14px;
	}
	.bw-card {
		display: grid;
		align-content: start;
		gap: 10px;
		padding: 18px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.bw-who {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.bw-who span {
		display: grid;
		min-width: 0;
	}
	.bw-who b {
		font-family: var(--f-serif, Georgia, serif);
		font-style: italic;
		font-weight: 400;
		font-size: 22px;
	}
	.bw-who small,
	.bw-n {
		font-size: 13px;
		color: var(--ink-3);
	}
	.bw-acts {
		display: flex;
		gap: 8px;
	}
	.bw-more {
		place-items: center;
		text-align: center;
		color: var(--ink-3);
		font-size: 14px;
		background: none;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
		border: 0;
	}
	.bl-h {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px 24px;
		margin-bottom: 26px;
	}
	.bl-h h1 {
		margin: 6px 0 0;
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: clamp(38px, 4vw, 50px);
		line-height: 1.04;
		letter-spacing: -0.01em;
	}
	.bl-h h1 em {
		font-style: italic;
		background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 4px;
	}
	.bl-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.17em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bl-acts {
		display: flex;
		gap: 12px;
	}
	.bl-neo {
		display: inline-grid;
		place-items: center;
		height: 46px;
		padding: 0 20px;
		font: 700 14px/1 var(--f-body);
		text-decoration: none;
	}
	.bl-grad {
		background: var(--grad);
		color: var(--on-grad);
		box-shadow: 4px 4px 0 color-mix(in oklab, var(--g1) 70%, black);
	}
	.bl-ghost {
		background: var(--ink);
		color: var(--bg);
		box-shadow: 4px 4px 0 var(--g2);
	}
	.bl-rings {
		display: flex;
		flex-wrap: wrap;
		gap: 18px;
		margin-bottom: 26px;
	}
	.bl-ring {
		display: grid;
		justify-items: center;
		gap: 6px;
		width: 76px;
		color: var(--ink-2);
		text-decoration: none;
	}
	.bl-ring > span {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		padding: 3px;
		background: var(--line-strong);
		display: grid;
		place-items: center;
	}
	.bl-ring.hot > span {
		background: conic-gradient(var(--g1), var(--g2), var(--g3), var(--g1));
	}
	.bl-add > span {
		background: none;
		border: 1.5px dashed var(--line-strong);
		font-size: 24px;
	}
	.bl-ring small {
		font-size: 12px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.bl-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
		gap: 22px;
		align-items: start;
	}
	.bl-money {
		display: grid;
		gap: 12px;
		padding: 26px;
		border-radius: 24px;
		background: radial-gradient(120% 120% at 0% 0%, color-mix(in oklab, var(--g2) 18%, transparent), transparent 55%), var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.bl-big {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 64px;
		line-height: 1;
	}
	.bl-sub {
		font-size: 14px;
		color: var(--ink-2);
	}
	.bl-mini {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
		margin-top: 6px;
	}
	.bl-mini div {
		display: grid;
		gap: 4px;
		padding: 14px;
		border-radius: 14px;
		background: var(--bg);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.bl-mini small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.bl-mini b {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 30px;
		line-height: 1.1;
	}
	.bl-wait {
		display: grid;
		gap: 12px;
	}
	@media (max-width: 1100px) {
		.bl-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.bd-hero {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
		margin-bottom: 26px;
	}
	.bd-date {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-2);
	}
	.bd-hero h1 {
		margin: 6px 0 0;
		font-size: clamp(32px, 4.4vw, 46px);
		font-weight: 700;
		line-height: 1.04;
		letter-spacing: -0.02em;
	}
	.bd-hero h1 em {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 1.18em;
		background: linear-gradient(115deg, var(--g3), var(--g2));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.08em;
	}
	.bd-sum {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 10px 0 0;
		font-size: 14.5px;
		color: var(--ink-2);
	}
	.bd-sum i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--g3);
	}
	.bd-sum i.calm {
		background: var(--ok);
	}
	.bd-neo {
		display: inline-flex;
		align-items: center;
		height: 50px;
		padding: 0 22px;
		text-decoration: none;
		font: 700 12.5px/1 var(--f-body);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.bd-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 5px 5px 0 #6a4bc9;
	}
	.bd-neo:hover {
		transform: translate(-2px, -2px);
	}
	.bd-neo:active {
		transform: translate(5px, 5px);
		box-shadow: none;
	}
	.bd-ap {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 18px;
		padding: 14px 18px;
		border-radius: 16px;
		background:
			radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g3) 16%, transparent), transparent 60%),
			var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		text-decoration: none;
	}
	.bd-ap b {
		flex: 1;
		font-size: 15px;
	}
	.bd-ap-tag {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		padding: 5px 10px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		color: var(--g2);
	}
	.bd-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 14px;
		margin-bottom: 28px;
	}
	.bd-stat {
		display: grid;
		gap: 6px;
		padding: 18px 20px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.bd-stat span {
		font-size: 13px;
		color: var(--ink-3);
	}
	.bd-stat b {
		font-family: var(--f-serif);
		font-weight: 400;
		font-size: 40px;
		line-height: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bd-stat small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.bd-h {
		margin: 0 0 12px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bd-hh {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.bd-hh a {
		font-size: 13px;
		color: var(--ink-2);
		text-decoration: none;
	}
	.bd-none {
		margin: 0;
		padding: 18px;
		border-radius: 18px;
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink-3);
		font-size: 14px;
	}
	.bd-c {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 16px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		text-decoration: none;
		transition: box-shadow 0.2s;
	}
	.bd-c:hover {
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.bd-c > span:not(.ring):not(.bd-plus) {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.bd-c b {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 22px;
		line-height: 1.1;
	}
	.bd-c small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.bd-more {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
	}
	.bd-more b {
		font-family: var(--f-body);
		font-style: normal;
		font-weight: 600;
		font-size: 15px;
	}
	.bd-plus {
		width: 44px;
		height: 44px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
		font-size: 22px;
		color: var(--ink-2);
	}
	.bd-two {
		grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
		margin-bottom: 22px;
	}
	/* Phone tickets (the same cut-out tickets as the creator's Today). */
	.tix {
		margin: 0 -16px 18px;
	}
	.tix .bd-hh {
		padding: 0 16px;
	}
	.tix-row {
		display: flex;
		gap: 12px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding-inline: 16px;
		padding: 0 16px;
		scrollbar-width: none;
	}
	.tix-row::-webkit-scrollbar {
		display: none;
	}
	.tix-t {
		flex: none;
		width: 172px;
		height: 150px;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		padding: 14px 14px 12px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		text-decoration: none;
		scroll-snap-align: start;
		-webkit-mask:
			radial-gradient(circle at 0 64%, #0000 8px, #000 8.5px) left / 51% 100% no-repeat,
			radial-gradient(circle at 100% 64%, #0000 8px, #000 8.5px) right / 51% 100% no-repeat;
		mask:
			radial-gradient(circle at 0 64%, #0000 8px, #000 8.5px) left / 51% 100% no-repeat,
			radial-gradient(circle at 100% 64%, #0000 8px, #000 8.5px) right / 51% 100% no-repeat;
	}
	.tix-t.hot {
		background:
			radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--g3) 18%, transparent), transparent 60%),
			var(--surface);
	}
	.tix-who {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}
	.tix-who b {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 22px;
		line-height: 1;
	}
	.tix-l {
		margin-top: 6px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
		color: var(--ink-3);
	}
	.tix-cut {
		margin-top: auto;
		border-top: 1.5px dashed var(--line-strong);
	}
	.tix-f {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding-top: 10px;
	}
	.tix-f strong {
		font-size: 15px;
		font-weight: 700;
		white-space: nowrap;
	}
	.tix-f em {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 4px 8px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ink) 8%, transparent);
		color: var(--ink-2);
		font-size: 11px;
		font-style: normal;
		font-weight: 700;
	}
	.tix-t.hot em {
		background: color-mix(in oklab, var(--g3) 16%, transparent);
		color: var(--g3);
	}
	@media (max-width: 900px) {
		.bd-stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.bd-hero .bd-neo {
			display: none;
		}
		.bd-stat b {
			font-size: 32px;
		}
	}
</style>
