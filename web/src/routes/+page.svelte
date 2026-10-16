<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import { countUp, parseStat } from '#lib/ui.svelte.ts';
	import { delivText, firstName, initials, inr, offeredKinds, packageOffered, waLink } from '#lib/util.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import Audience from '#lib/components/Audience.svelte';
	import { compact, fmt, mediaLabel } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ExpectedResults from '#lib/components/ExpectedResults.svelte';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import { rateValue } from '#lib/priority.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import AskQuestion from '#lib/components/AskQuestion.svelte';
	import { supabase } from '#lib/supabase.ts';
	import { reachOk, type PublicInsights } from '#lib/insights.ts';

	const preview = $derived(page.url.searchParams.has('preview'));

	// The creator works in the studio; this page is for brands (she can still preview it).
	$effect(() => {
		if (auth.account?.role === 'creator' && !preview) goto('/studio', { replace: true });
	});

	// Shared insights (null when she has them off): the 30-day reach goes in the stats, plus a link.
	let ins = $state<PublicInsights | null>(null);
	onMount(() => {
		loadPublicPage();
		supabase.rpc('public_insights').then(({ data }) => (ins = (data as PublicInsights | null) ?? null));
	});

	const p = $derived(pub.data);
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
					{ raw: p.followers, label: 'followers' },
					// Reels engagement when the insights have it (labelled so); otherwise the all-posts figure.
					ins?.insights?.formats?.reels?.er ? { raw: `${ins.insights.formats.reels.er}%`, label: 'Reels engagement' } : { raw: p.engagement, label: 'avg. engagement' },
					...(p.instagram?.avg_views ? [{ raw: compact(p.instagram.avg_views), label: 'avg. views per post' }] : []),
					...(ins && reachOk(ins.insights?.totals) ? [{ raw: compact(ins.insights.totals!.reach), label: 'reached in 30 days' }] : [])
				].filter((s) => s.raw)
			: []
	);
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
		<div class="bp">
			<section class="cover rv"><div class="mesh" aria-hidden="true"></div><div class="cover-txt"><small>Brand collaborations</small>Let's make something <em>beautiful</em></div></section>
			<section class="hero rv" style="--i:1">
				<Avatar name={p.display_name} src={p.instagram?.profile_picture_url} />
				<div>
					<h1>{p.display_name}</h1>
					<div class="handle">@{p.handle}</div>
					<div class="niche serif"><em>{p.niche}</em>{p.city ? ` · ${p.city}` : ''}</div>
					<span class="avail tint {p.accepting ? 'k-pay' : 'k-follow'}"
						><span class="dt pulse"></span>{p.accepting ? `Open for collaborations · replies in about ${p.reply_time}` : 'Fully booked right now'}</span
					>
				</div>
			</section>
			<!-- Wide screens: details on the left, a sticky sidebar with the request button and availability. -->
			<div class="bp-grid">
				<div class="bp-main">
					{#if stats.length}
						<div class="stats">
							{#each stats as s, i (s.label)}
								{@const n = parseStat(s.raw)}
								<div class="stat glow rv" style="--i:{i + 2}">
									{#if n}<b use:countUp={{ value: n.value, decimals: n.decimals, suffix: n.suffix }}>{s.raw}</b>{:else}<b>{s.raw}</b>{/if}
									<small>{s.label}</small>
								</div>
							{/each}
						</div>
					{/if}
					{#if p.instagram}
						<p class="live-chip rv" style="--i:4"><span class="dt pulse k-live"></span>Live from Instagram{p.instagram.updated_at ? ` · updated ${fmt(p.instagram.updated_at.slice(0, 10))}` : ''}{#if ins}<a class="lnk ins-link" href="/insights">See full insights<Icon name="chevR" /></a>{/if}</p>
					{/if}
					{#if p.worked_with.length}
						<div class="marquee rv" style="--i:5">
							<span class="mq-l">Worked with</span>
							<div class="mq"><div class="mq-track">{#each [0, 1, 2, 3] as k (k)}{#each p.worked_with as n (n)}<span>{n}</span>{/each}{/each}</div></div>
						</div>
					{/if}
					{#if p.instagram?.demographics}<Audience demo={p.instagram.demographics} i={5} />{/if}
					{#if p.packages?.some((x) => packageOffered(x.items, p.offered)) && p.accepting}
						<section class="pkgs rv" style="--i:6" aria-label="Packages">
							<div class="pkgs-h"><h2>Packages</h2><p>Book a ready-made bundle in one tap.</p></div>
							<div class="pkg-grid">
								{#each p.packages.filter((x) => packageOffered(x.items, p.offered)) as k, i (k.id)}
									{@const rate = rateValue(k.items, p.rates)}
									{@const save = rate > k.price && k.price ? Math.round((1 - k.price / rate) * 100) : 0}
									<article class="pkg glow" class:hot={!!k.badge} style="--i:{i}">
										{#if k.badge}<span class="pkg-badge">{k.badge}</span>{/if}
										<h3>{k.name}</h3>
										{#if k.description}<p>{k.description}</p>{/if}
										<div class="pkg-items">{delivText(k.items)}</div>
										<ExpectedResults lines={k.items} cost={k.price} compactView />
										<div class="pkg-price">
											<b>{inr(k.price)}</b>
											{#if save >= 3}<s>{inr(rate)}</s><span class="pkg-save">Save {save}%</span>{/if}
										</div>
										<a class="btn {k.badge ? 'grad' : ''}" href={bookHref(k.id)}><Icon name="send" />Book this</a>
									</article>
								{/each}
							</div>
						</section>
					{/if}
					{#if p.results?.length}
					<section class="results rv" aria-label="Results from past collabs">
						<div class="pkgs-h"><h2>Results</h2><p>Real numbers from past collaborations</p></div>
						<div class="res-grid">
							{#each p.results.slice(0, 4) as r, i (r.permalink + i)}
								<a class="res" href={r.permalink} target="_blank" rel="noopener">
									{#if r.thumbnail}<img src={r.thumbnail} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="res-ph"><Icon name="film" /></span>{/if}
									<div class="res-b">
										<b>{r.views ? compact(r.views) : compact(r.reach ?? 0)}</b>
										<small>{r.views ? 'views' : 'reached'}{r.reach && r.views ? ` · ${compact(r.reach)} reached` : ''}</small>
										<span>{r.brand} · {mediaLabel('', r.kind)}</span>
									</div>
								</a>
							{/each}
						</div>
					</section>
				{/if}
				{#if p.reviews?.length}
					<section class="reviews rv" aria-label="What brands say">
						<div class="pkgs-h"><h2>What brands say</h2><p>{(p.reviews.reduce((a, r) => a + r.rating, 0) / p.reviews.length).toFixed(1)} ★ from {p.reviews.length} review{p.reviews.length === 1 ? '' : 's'}</p></div>
						<div class="rev-grid">
							{#each p.reviews.slice(0, 6) as r, i (i)}
								<figure class="rev">
									<div class="rev-stars" aria-label="{r.rating} out of 5">{'★'.repeat(r.rating)}<i>{'★'.repeat(5 - r.rating)}</i></div>
									{#if r.text}<blockquote>“{r.text}”</blockquote>{/if}
									<figcaption><b>{r.name}</b> · {r.brand}</figcaption>
								</figure>
							{/each}
						</div>
					</section>
				{/if}
					<section class="panel rv" style="--i:6;overflow:hidden">
						<div class="bsec">
							<div class="bsec-h"><h2>Work with {firstName(p.display_name)}</h2></div>
							<div class="types t3">
								<div class="type-card static"><Icon name="send" /><b>1. Tell us what you need</b><small>Pick the content, a package or your budget. No account needed.</small></div>
								<div class="type-card static"><Icon name="mail" /><b>2. Confirm your email</b><small>A 6-digit code when you send. No password, ever.</small></div>
								<div class="type-card static"><Icon name="eye" /><b>3. Follow along</b><small>See every step, from first reply to going live.</small></div>
							</div>
						</div>
						{#if p.rates}
							<div class="bsec">
								<div class="bsec-h"><h2>Starting rates</h2></div>
								<div class="dpick">
									{#each Object.entries(p.rates).filter(([k, v]) => v && offeredKinds(p.offered).includes(k)) as [k, v] (k)}
										<div class="dp"><div><b>{k}</b><small>from {inr(v)}</small></div></div>
									{/each}
								</div>
							</div>
						{/if}
						<div class="submit-row">
							<p>{p.accepting ? `${firstName(p.display_name)} usually replies within ${p.reply_time}.` : 'New requests are paused right now. You can still follow requests you already sent.'}</p>
							<button class="btn" onclick={kit} disabled={kitBusy}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit</button>
							<a class="btn" href={trackHref}><Icon name="search" />Track my requests</a>
							{#if p.accepting}<a class="btn grad lg" href={requestHref}><Icon name="send" />Send a request</a>{/if}
						</div>
					</section>
				</div>
				<aside class="bp-side">
					{#if p.accepting}
						<section class="bp-cta rv" style="--i:3">
							<b>Work with {firstName(p.display_name)}</b>
							<p>Usually replies within {p.reply_time}. Paid collaborations are reviewed first.</p>
							<a class="btn grad lg" href={requestHref}><Icon name="send" />Send a request</a>
							<div class="row">{#if p.whatsapp}<a class="btn sm wa" href={waLink(p.whatsapp, `Hi ${firstName(p.display_name)}! I'd like to discuss a collaboration.`)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp</a>{/if}<a class="btn sm" href={trackHref}><Icon name="search" />Track requests</a><AskQuestion creator={firstName(p.display_name)} /><button class="btn sm" onclick={kit} disabled={kitBusy}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit</button></div>
						</section>
					{/if}
					{#if p.availability?.length && p.accepting}
						<section class="avail-wk rv" style="--i:5" aria-label="Availability">
							<div class="pkgs-h"><h2>Availability</h2><p>Next 8 weeks</p></div>
							<div class="wk-strip">
								{#each p.availability as w (w.start)}
									<div class="wk wk-{w.status}"><b>{new Date(w.start + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b><small>{w.status === 'open' ? 'Open' : w.status === 'limited' ? '1 spot left' : w.status === 'full' ? 'Full' : 'Away'}</small></div>
								{/each}
							</div>
						</section>
					{/if}
				</aside>
			</div>
			<p class="foot">Requests go straight to {firstName(p.display_name)}. Your details are only used to reply to you.</p>
		</div>
	{:else}
		<div class="loader" style="min-height:60vh"><span class="ring"><span></span></span></div>
	{/if}
</div>
