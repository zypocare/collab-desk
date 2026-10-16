<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import { countUp, parseStat } from '#lib/ui.svelte.ts';
	import { delivText, firstName, initials, inr } from '#lib/util.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import Audience from '#lib/components/Audience.svelte';
	import { compact, fmt } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import { rateValue } from '#lib/priority.ts';
	import Avatar from '#lib/components/Avatar.svelte';

	const preview = $derived(page.url.searchParams.has('preview'));

	// The creator works in the studio; this page is for brands (she can still preview it).
	$effect(() => {
		if (auth.account?.role === 'creator' && !preview) goto('/studio', { replaceState: true });
	});

	onMount(loadPublicPage);

	const p = $derived(pub.data);
	const signedInBrand = $derived(auth.account?.role === 'brand');
	const requestHref = $derived(signedInBrand ? '/brand/new' : '/login?next=/brand/new');
	const trackHref = $derived(signedInBrand ? '/brand' : '/login?next=/brand');
	let kitBusy = $state(false);
	async function kit() {
		if (!p) return;
		kitBusy = true;
		await downloadMediaKit(p, location.origin).catch(() => {});
		kitBusy = false;
	}
	const bookHref = (id: string) => (signedInBrand ? `/brand/new?package=${id}` : `/login?next=${encodeURIComponent(`/brand/new?package=${id}`)}`);
	const stats = $derived(
		p
			? [
					{ raw: p.followers, label: 'followers' },
					{ raw: p.engagement, label: 'avg. engagement' },
					...(p.instagram?.avg_views ? [{ raw: compact(p.instagram.avg_views), label: 'avg. views per post' }] : [])
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
				<p class="live-chip rv" style="--i:4"><span class="dt pulse k-live"></span>Live from Instagram{p.instagram.updated_at ? ` · updated ${fmt(p.instagram.updated_at.slice(0, 10))}` : ''}</p>
			{/if}
			{#if p.worked_with.length}
				<div class="marquee rv" style="--i:5">
					<span class="mq-l">Worked with</span>
					<div class="mq"><div class="mq-track">{#each [0, 1, 2, 3] as k (k)}{#each p.worked_with as n (n)}<span>{n}</span>{/each}{/each}</div></div>
				</div>
			{/if}

			{#if p.instagram?.demographics}<Audience demo={p.instagram.demographics} />{/if}

			{#if p.packages?.length && p.accepting}
				<section class="pkgs rv" style="--i:6" aria-label="Packages">
					<div class="pkgs-h"><h2>Packages</h2><p>Book a ready-made bundle in one tap.</p></div>
					<div class="pkg-grid">
						{#each p.packages as k, i (k.id)}
							{@const rate = rateValue(k.items, p.rates)}
							{@const save = rate > k.price && k.price ? Math.round((1 - k.price / rate) * 100) : 0}
							<article class="pkg glow" class:hot={!!k.badge} style="--i:{i}">
								{#if k.badge}<span class="pkg-badge">{k.badge}</span>{/if}
								<h3>{k.name}</h3>
								{#if k.description}<p>{k.description}</p>{/if}
								<div class="pkg-items">{delivText(k.items)}</div>
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

			<section class="panel rv" style="--i:6;overflow:hidden">
				<div class="bsec">
					<div class="bsec-h"><h2>Work with {firstName(p.display_name)}</h2></div>
					<div class="types" style="grid-template-columns:repeat(3,minmax(0,1fr))">
						<div class="type-card static"><Icon name="mail" /><b>1. Sign in</b><small>With your work email and a one-time code. No password.</small></div>
						<div class="type-card static"><Icon name="send" /><b>2. Send your request</b><small>Paid, barter or both. Pick the content you need.</small></div>
						<div class="type-card static"><Icon name="eye" /><b>3. Follow along</b><small>See every step, from first reply to going live.</small></div>
					</div>
				</div>
				{#if p.rates}
					<div class="bsec">
						<div class="bsec-h"><h2>Starting rates</h2></div>
						<div class="dpick">
							{#each Object.entries(p.rates).filter(([, v]) => v) as [k, v] (k)}
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
			<p class="foot">Requests go straight to {firstName(p.display_name)}. Your details are only used to reply to you.</p>
		</div>
	{:else}
		<div class="loader" style="min-height:60vh"><span class="ring"><span></span></span></div>
	{/if}
</div>
