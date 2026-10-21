<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { brandHome, loadDashboard } from '#lib/brand.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { compact, firstName, fmt, inr } from '#lib/util.ts';
	import type { BrandCreator } from '#lib/types.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import CompanyStep from '#lib/components/CompanyStep.svelte';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';

	// The brand dashboard: everything across every creator this login works with.
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const d = $derived(brandHome.dash);
	onMount(() => {
		loadDashboard();
	});
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
	const chip = (c: BrandCreator) => (c.waiting ? 'Your turn' : c.open ? 'In progress' : '');
</script>

<svelte:head><title>Dashboard · Miracle</title></svelte:head>

{#if acc && !d?.creators?.length && !acc.brand && brandHome.dash}
	<!-- A brand that hasn't sent anything yet: set up the company for this creator first. -->
	<header class="ph rv"><div><div class="eb">Welcome</div><h1>Tell us about your <em>brand</em></h1><p>We'll use this on every request you send.</p></div></header>
	<CompanyStep creator={firstName(pub.data?.display_name ?? '')} />
{:else}
	<header class="bd-hero rv">
		<div>
			<span class="bd-date">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
			<h1>{greet},{#if who}<br /><em>{who}</em>{/if}</h1>
			{#if d}<p class="bd-sum"><i class:calm={!waiting.length}></i>{waiting.length ? `${waiting.length} waiting on you` : 'Nothing waiting on you'} · {d.open} open request{d.open === 1 ? '' : 's'}</p>{/if}
		</div>
		{#if pub.data?.accepting !== false}<a class="bd-neo bd-grad" href="/brand/new">+ New request</a>{/if}
	</header>

	{#if brandHome.error}<div class="err-box">{brandHome.error}</div>{/if}

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
			<div class="bd-list">
				{#each waiting as w (w.kind + w.code + (w.round ?? ''))}
					<a class="bd-row" href={at(w.slug, `/brand/r/${w.code}`)}>
						<i></i>
						<span><b>{w.kind === 'quote' ? `Review ${firstName(w.creator)}'s quote` : `Approve ${firstName(w.creator)}'s draft`}</b><small>{w.code}{w.kind === 'quote' && w.amount ? ` · ${inr(w.amount)}` : ''}{w.kind === 'draft' && w.live_date ? ` · goes live ${fmt(w.live_date)}` : ''}</small></span>
					</a>
				{/each}
			</div>
		{:else}
			<p class="bd-none">Nothing needs you right now.</p>
		{/if}
		<a class="bd-c bd-more" style="margin-top:16px" href="/brand/creators?tab=discover"><span class="bd-plus" aria-hidden="true">+</span><span><b>Find more creators</b><small>Creators on Miracle open to brands</small></span></a>
	{:else if d}
		<div class="bd-stats rv" style="--i:1">
			<div class="bd-stat"><span>Open requests</span><b>{d.open}</b><small>{creatorsOpen ? `with ${creatorsOpen} creator${creatorsOpen === 1 ? '' : 's'}` : 'none right now'}</small></div>
			<div class="bd-stat" class:hot={waiting.length > 0}><span>Waiting on you</span><b>{waiting.length}</b><small>{waiting.length ? [waiting.filter((w) => w.kind === 'quote').length && 'quotes', waiting.filter((w) => w.kind === 'draft').length && 'drafts'].filter(Boolean).join(' and ') : 'all clear'}</small></div>
			<div class="bd-stat"><span>Spent in {month}</span><b>{inr(d.spent_month)}</b><small>{d.to_pay ? `${inr(d.to_pay)} still to pay` : 'nothing to pay'}</small></div>
			<div class="bd-stat"><span>Going live soon</span><b>{d.live_soon.length}</b><small>{d.live_soon[0] ? `${firstName(d.live_soon[0].creator)} · ${fmt(d.live_soon[0].live_date)}` : 'in the next 7 days'}</small></div>
		</div>

		<div class="bd-grid">
			<section class="rv" style="--i:2" aria-label="Waiting on you">
				<h2 class="bd-h">Waiting on you</h2>
				{#if waiting.length}
					<div class="bd-list">
						{#each waiting as w (w.kind + w.code + (w.round ?? ''))}
							<a class="bd-row" href={at(w.slug, `/brand/r/${w.code}`)}>
								<i></i>
								<span><b>{w.kind === 'quote' ? `Quote ready from ${firstName(w.creator)}` : `Draft to approve from ${firstName(w.creator)}`}</b><small>{w.code}{w.kind === 'quote' && w.amount ? ` · ${inr(w.amount)}` : ''}{w.kind === 'draft' && w.live_date ? ` · goes live ${fmt(w.live_date)}` : ''}</small></span>
								<em>Review</em>
							</a>
						{/each}
					</div>
				{:else}
					<p class="bd-none">Nothing needs you right now. Quotes and drafts to approve show up here.</p>
				{/if}
			</section>

			<section class="rv" style="--i:3" aria-label="Your creators">
				<div class="bd-hh"><h2 class="bd-h">Your creators</h2><a href="/brand/creators">See all</a></div>
				<div class="bd-cr">
					{#each d.creators as c (c.id)}
						<a class="bd-c" href={at(c.slug, '/brand/requests')}>
							<Avatar name={c.name} src={c.photo} size="44px" />
							<span><b>{firstName(c.name)}</b><small>{line(c)}</small></span>
							{#if chip(c)}<em class:hot={!!c.waiting}>{chip(c)}</em>{/if}
						</a>
					{/each}
					<a class="bd-c bd-more" href="/brand/creators?tab=discover">
						<span class="bd-plus" aria-hidden="true">+</span>
						<span><b>Find more creators</b><small>Creators on Miracle who are open to brands</small></span>
					</a>
				</div>
			</section>
		</div>
	{:else if !brandHome.error}
		<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
	{/if}
{/if}

<style>
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
	.bd-stat.hot {
		background:
			radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g3) 16%, transparent), transparent 60%),
			var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.bd-stat span {
		font-size: 13px;
		color: var(--ink-3);
	}
	.bd-stat.hot span {
		color: var(--g3);
		font-weight: 600;
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
	.bd-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
		gap: 24px;
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
	.bd-list {
		display: grid;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.bd-row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px 18px;
		color: var(--ink);
		text-decoration: none;
	}
	.bd-row + .bd-row {
		border-top: 1px solid var(--line);
	}
	.bd-row:hover {
		background: color-mix(in oklab, var(--ink) 4%, transparent);
	}
	.bd-row i {
		width: 4px;
		height: 36px;
		border-radius: 4px;
		background: var(--g3);
		flex: none;
	}
	.bd-row span {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.bd-row b {
		font-weight: 600;
	}
	.bd-row small {
		font-size: 13px;
		color: var(--ink-3);
	}
	.bd-row em {
		font-style: normal;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 10px 14px;
		color: var(--bg);
		background: var(--ink);
		box-shadow: 3px 3px 0 var(--g2);
	}
	.bd-none {
		margin: 0;
		padding: 18px;
		border-radius: 18px;
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink-3);
		font-size: 14px;
	}
	.bd-cr {
		display: grid;
		gap: 10px;
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
	.bd-c em {
		font-style: normal;
		font-size: 11px;
		font-weight: 700;
		padding: 4px 8px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ink) 8%, transparent);
		color: var(--ink-2);
		white-space: nowrap;
	}
	.bd-c em.hot {
		background: color-mix(in oklab, var(--g3) 16%, transparent);
		color: var(--g3);
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
		.bd-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.bd-hero .bd-neo {
			display: none;
		}
		.bd-stat b {
			font-size: 32px;
		}
	}
</style>
