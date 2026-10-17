<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import { countUp, parseStat } from '#lib/ui.svelte.ts';
	import { delivText, firstName, fmtUpdated, initials, inr, offeredKinds, packageOffered, waLink } from '#lib/util.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import Audience from '#lib/components/Audience.svelte';
	import { compact, mediaLabel } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ExpectedResults from '#lib/components/ExpectedResults.svelte';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import { rateValue } from '#lib/priority.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import AskQuestion from '#lib/components/AskQuestion.svelte';
	import { supabase } from '#lib/supabase.ts';
	import { reachOk, type PublicInsights } from '#lib/insights.ts';

	const preview = $derived(page.url.searchParams.has('preview'));

	// The creator works in the studio; this page is for brands (the creator can still preview it).
	$effect(() => {
		if (auth.account?.role === 'creator' && !preview) goto('/studio', { replace: true });
	});

	// Shared insights (null when they're off): the 30-day reach goes in the stats, plus a link.
	let ins = $state<PublicInsights | null>(null);
	onMount(() => {
		loadPublicPage();
		supabase.rpc('public_insights').then(({ data }) => (ins = (data as PublicInsights | null) ?? null));
	});

	const p = $derived(pub.data);
	const first = $derived(firstName(p?.display_name ?? ''));
	const signedInBrand = $derived(auth.account?.role === 'brand');
	// No sign-in needed to start: brands confirm their email with a code when they send.
	const requestHref = '/brand/new';
	const trackHref = $derived(signedInBrand ? '/brand' : '/login?next=/brand');
	let kitBusy = $state(false);
	async function kit() {
		if (!p) return;
		kitBusy = true;
		await downloadMediaKit(p, location.origin).catch(() => {});
		kitBusy = false;
	}
	const bookHref = (id: string) => `/brand/new?package=${id}`;
	const stats = $derived(
		p
			? [
					{ raw: p.followers, label: 'Followers' },
					// Reels engagement when the insights have it (labelled so); otherwise the all-posts figure.
					ins?.insights?.formats?.reels?.er ? { raw: `${ins.insights.formats.reels.er}%`, label: 'Reels engagement' } : { raw: p.engagement, label: 'Avg. engagement' },
					...(p.instagram?.avg_views ? [{ raw: compact(p.instagram.avg_views), label: 'Avg. views per post' }] : []),
					...(ins && reachOk(ins.insights?.totals) ? [{ raw: compact(ins.insights.totals!.reach), label: 'Reached in 30 days' }] : []),
				].filter((s) => s.raw)
			: []
	);
	const packs = $derived(p?.packages?.filter((x) => packageOffered(x.items, p.offered)) ?? []);
	const rates = $derived(p?.rates ? Object.entries(p.rates).filter(([k, v]) => v && offeredKinds(p.offered).includes(k)) : []);
	const avgRating = $derived(p?.reviews?.length ? (p.reviews.reduce((a, r) => a + r.rating, 0) / p.reviews.length).toFixed(1) : '');

	// "On this page" bar: only sections that exist, highlighted as you scroll.
	const sections = $derived(
		p
			? [
					{ id: 'audience', label: 'Audience', show: !!p.instagram?.demographics },
					{ id: 'packages', label: 'Packages', show: packs.length > 0 && p.accepting },
					{ id: 'results', label: 'Results', show: !!p.results?.length },
					{ id: 'reviews', label: 'Reviews', show: !!p.reviews?.length },
					{ id: 'how', label: 'How it works', show: true }
				].filter((s) => s.show)
			: []
	);
	let active = $state('');
	$effect(() => {
		if (!sections.length) return;
		const els = sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) if (e.isIntersecting) active = e.target.id;
			},
			{ rootMargin: '-30% 0px -60% 0px' }
		);
		els.forEach((e) => io.observe(e));
		return () => io.disconnect();
	});
	// Phones: the floating action bar appears once the hero's own buttons have scrolled away.
	let heroCta = $state<HTMLElement | null>(null);
	let dockOn = $state(false);
	$effect(() => {
		if (!heroCta) return;
		const io = new IntersectionObserver(([e]) => (dockOn = !e.isIntersecting && e.boundingClientRect.top < 0));
		io.observe(heroCta);
		return () => io.disconnect();
	});
	const thumbHue = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
</script>

<svelte:head>
	<title>{p ? `Collaborate with ${p.display_name}` : 'Collaborate'}</title>
	{#if p}<meta name="description" content="Send a collaboration request to {p.display_name} (@{p.handle}) and track it any time." />{/if}
</svelte:head>

<BrandTopbar />

<div class="page">
	{#if pub.error}
		<div class="wrap"><div class="err-box">This page couldn't load: {pub.error}</div></div>
	{:else if p}
		<div class="bx">
			<!-- Hero: who, status, the main actions and the numbers brands look for first. -->
			<section class="bx-hero rv">
				<div class="mesh" aria-hidden="true"></div>
				<div class="bx-hero-main">
					<div class="bx-id">
						<Avatar name={p.display_name} src={p.instagram?.profile_picture_url} size="clamp(84px, 11vw, 120px)" />
						<div class="bx-id-t">
							<span class="bx-eb">Brand collaborations</span>
							<h1>{p.display_name}</h1>
							<p class="bx-handle">@{p.handle}{p.city ? ` · ${p.city}` : ''}</p>
						</div>
					</div>
					{#if p.niche}<p class="bx-niche serif"><em>{p.niche}</em></p>{/if}
					<div class="bx-status">
						<span class="bx-pill" class:off={!p.accepting}><span class="dt pulse"></span>{p.accepting ? `Open for collaborations · replies in about ${p.reply_time}` : 'Fully booked right now'}</span>
						{#if avgRating}<span class="bx-pill soft">★ {avgRating} from {p.reviews.length} brand{p.reviews.length === 1 ? '' : 's'}</span>{/if}
					</div>
					<div class="bx-cta" bind:this={heroCta}>
						{#if p.accepting}<a class="btn grad lg" href={requestHref}><Icon name="send" />Send a request</a>{/if}
						<AskQuestion creator={first} />
						<button class="btn sm" onclick={kit} disabled={kitBusy}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit</button>
						{#if p.whatsapp}<a class="btn sm" href={waLink(p.whatsapp, `Hi ${first}! I'd like to discuss a collaboration.`)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp</a>{/if}
					</div>
				</div>
				{#if stats.length}
					<div class="bx-stats">
						{#each stats as s, i (s.label)}
							{@const n = parseStat(s.raw)}
							<div class="bx-stat" style="--i:{i}">
								{#if n}<b use:countUp={{ value: n.value, decimals: n.decimals, suffix: n.suffix }}>{s.raw}</b>{:else}<b>{s.raw}</b>{/if}
								<small>{s.label}</small>
							</div>
						{/each}
						{#if p.instagram}
							<p class="bx-live"><span class="dt pulse k-live"></span>Live from Instagram{p.instagram.updated_at ? ` · ${fmtUpdated(p.instagram.updated_at)}` : ''}</p>
						{/if}
						{#if ins}<a class="bx-ins" href="/insights">See full insights <Icon name="arrow" /></a>{/if}
					</div>
				{/if}
			</section>

			{#if p.worked_with.length}
				<div class="marquee bx-marquee rv">
					<span class="mq-l">Worked with</span>
					<div class="mq"><div class="mq-track">{#each [0, 1, 2, 3] as k (k)}{#each p.worked_with as n (n)}<span>{n}</span>{/each}{/each}</div></div>
				</div>
			{/if}

			{#if sections.length > 1}
				<nav class="bx-secnav" aria-label="On this page">
					{#each sections as s (s.id)}<a href="#{s.id}" class:on={active === s.id}>{s.label}</a>{/each}
				</nav>
			{/if}

			<div class="bx-grid">
				<div class="bx-main">
					{#if p.instagram?.demographics}
						<section id="audience" class="bx-sec bx-anchor bx-aud" aria-label="Audience">
							<header class="bx-sh"><div><span class="bx-eb">Who's watching</span><h2>Audience</h2></div><p>From Instagram, updated with every sync.</p></header>
							<Audience demo={p.instagram.demographics} i={0} />
						</section>
					{/if}

					{#if packs.length && p.accepting}
						<section id="packages" class="bx-sec bx-anchor rv" aria-label="Packages">
							<header class="bx-sh"><div><span class="bx-eb">Book in one tap</span><h2>Packages</h2></div><p>Ready-made bundles, or pick exactly what you need.</p></header>
							<div class="bx-pkgs">
								{#each packs as k, i (k.id)}
									{@const rate = rateValue(k.items, p.rates)}
									{@const save = rate > k.price && k.price ? Math.round((1 - k.price / rate) * 100) : 0}
									<article class="bx-pkg glow" class:hot={!!k.badge} style="--i:{i}">
										{#if k.badge}<span class="bx-badge">{k.badge}</span>{/if}
										<h3>{k.name}</h3>
										{#if k.description}<p class="bx-pkg-d">{k.description}</p>{/if}
										<div class="bx-items">{#each k.items as it (it.kind)}<span>{it.qty} {it.qty > 1 ? (it.kind === 'Story' ? 'Stories' : `${it.kind}s`) : it.kind}</span>{/each}</div>
										<ExpectedResults lines={k.items} cost={k.price} compactView />
										<div class="bx-price">
											<b>{inr(k.price)}</b>
											{#if save >= 3}<s>{inr(rate)}</s><span class="bx-save">Save {save}%</span>{/if}
										</div>
										<a class="btn {k.badge ? 'grad' : ''}" href={bookHref(k.id)}><Icon name="send" />Book this</a>
									</article>
								{/each}
							</div>
							<!-- Not only bundles: any single item, or any mix, can be requested. -->
							<div class="bx-custom">
								<div class="bx-custom-t"><b>Need something different?</b><small>Book a single Reel, one Story or any mix you like.{p.rates ? '' : ` ${first} will send you a quote.`}</small></div>
								<div class="bx-chips">
									{#each offeredKinds(p.offered) as kd (kd)}
										<a class="bx-chip" href="/brand/new?item={encodeURIComponent(kd)}"><b>1 {kd}</b>{#if p.rates?.[kd]}<span>from {inr(p.rates[kd])}</span>{/if}</a>
									{/each}
								</div>
								<a class="btn" href="/brand/new"><Icon name="plus" />Build your own</a>
							</div>
						</section>
					{/if}

					{#if p.results?.length}
						<section id="results" class="bx-sec bx-anchor rv" aria-label="Results from past collabs">
							<header class="bx-sh"><div><span class="bx-eb">Proof</span><h2>Results</h2></div><p>Real numbers from past collaborations.</p></header>
							<div class="bx-results">
								{#each p.results.slice(0, 4) as r, i (r.permalink + i)}
									<a class="bx-res" href={r.permalink} target="_blank" rel="noopener" style="--i:{i}">
										<div class="bx-res-img h{thumbHue(r.brand)}">
											{#if r.thumbnail}<img src={r.thumbnail} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="bx-res-ph">{initials(r.brand)}</span>{/if}
											<span class="bx-res-kind">{mediaLabel('', r.kind)}</span>
										</div>
										<div class="bx-res-b">
											<b>{r.views ? compact(r.views) : compact(r.reach ?? 0)}</b>
											<small>{r.views ? 'views' : 'reached'}{r.reach && r.views ? ` · ${compact(r.reach)} reached` : ''}</small>
											<span>{r.brand}</span>
										</div>
									</a>
								{/each}
							</div>
						</section>
					{/if}

					{#if p.reviews?.length}
						<section id="reviews" class="bx-sec bx-anchor rv" aria-label="What brands say">
							<header class="bx-sh"><div><span class="bx-eb">Reviews</span><h2>What brands say</h2></div><p>{avgRating} ★ from {p.reviews.length} review{p.reviews.length === 1 ? '' : 's'}</p></header>
							<div class="bx-reviews">
								{#each p.reviews.slice(0, 6) as r, i (i)}
									<figure class="bx-rev">
										<div class="rev-stars" aria-label="{r.rating} out of 5">{'★'.repeat(r.rating)}<i>{'★'.repeat(5 - r.rating)}</i></div>
										{#if r.text}<blockquote>{r.text}</blockquote>{/if}
										<figcaption><span class="bx-rev-av">{initials(r.name || r.brand)}</span><span><b>{r.name}</b>{r.brand}</span></figcaption>
									</figure>
								{/each}
							</div>
						</section>
					{/if}

					<section id="how" class="bx-sec bx-anchor rv" aria-label="How it works">
						<header class="bx-sh"><div><span class="bx-eb">Simple</span><h2>How it works</h2></div><p>No account or password needed.</p></header>
						<ol class="bx-steps">
							<li><span>1</span><b>Tell {first} what you need</b><small>Pick content, a package or share your budget.</small></li>
							<li><span>2</span><b>Confirm your email</b><small>A 6-digit code when you send. That's it.</small></li>
							<li><span>3</span><b>Follow every step</b><small>Quote, drafts, go-live and results, all in one place.</small></li>
						</ol>
					</section>
				</div>

				<aside class="bx-side">
					<section class="bx-book rv">
						<span class="bx-eb">Work with {first}</span>
						<h2>{p.accepting ? 'Start a collaboration' : 'Booked up for now'}</h2>
						<p>{p.accepting ? `Usually replies within ${p.reply_time}. Paid collaborations are reviewed first.` : 'New requests are paused. You can still follow requests you already sent.'}</p>
						{#if rates.length}
							<ul class="bx-rates">
								{#each rates as [k, v] (k)}<li><span>{k}</span><b>from {inr(v)}</b></li>{/each}
							</ul>
						{/if}
						{#if p.accepting}<a class="btn grad lg" href={requestHref}><Icon name="send" />Send a request</a>{/if}
						<div class="bx-book-row">
							<a class="btn sm" href={trackHref}><Icon name="search" />Track requests</a>
							<button class="btn sm" onclick={kit} disabled={kitBusy}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit</button>
						</div>
					</section>
					{#if p.availability?.length && p.accepting}
						<section class="bx-avail rv" aria-label="Availability">
							<header><b>Availability</b><small>Next 8 weeks</small></header>
							<div class="wk-strip">
								{#each p.availability as w (w.start)}
									<div class="wk wk-{w.status}"><b>{new Date(w.start + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b><small>{w.status === 'open' ? 'Open' : w.status === 'limited' ? '1 spot left' : w.status === 'full' ? 'Full' : 'Away'}</small></div>
								{/each}
							</div>
						</section>
					{/if}
				</aside>
			</div>

			{#if p.accepting}
				<section class="bx-final rv">
					<div class="mesh" aria-hidden="true"></div>
					<h2>Let's make something <em>beautiful</em>.</h2>
					<p>Tell {first} about your brand. It takes about 2 minutes.</p>
					<div class="bx-final-row">
						<a class="btn grad lg" href={requestHref}><Icon name="send" />Send a request</a>
						<a class="btn lg ghost-light" href={trackHref}><Icon name="search" />Track my requests</a>
					</div>
				</section>
			{/if}
			<p class="foot">Requests go straight to {first}. Your details are only used to reply to you.</p>
		</div>

		{#if p.accepting}
			<!-- Phones: the main action is always one tap away. -->
			<div class="bx-dock" class:tabs={signedInBrand} class:on={dockOn} aria-hidden={!dockOn}>
				<a class="btn grad" href={requestHref}><Icon name="send" />Send a request</a>
				<AskQuestion creator={first} />
			</div>
		{/if}
	{:else}
		<div class="bx">
			<div class="bx-hero bx-skel" aria-label="Loading"><div class="mesh" aria-hidden="true"></div><i></i><i></i><i></i></div>
		</div>
	{/if}
</div>
