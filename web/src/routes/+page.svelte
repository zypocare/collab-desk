<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import { countUp, parseStat } from '#lib/ui.svelte.ts';
	import { firstName, initials, inr } from '#lib/util.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import Icon from '#lib/components/Icon.svelte';

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
	const stats = $derived(
		p
			? [
					{ raw: p.followers, label: 'followers' },
					{ raw: p.engagement, label: 'avg. engagement' },
					{ raw: p.reply_time, label: 'typical reply time' }
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
				<span class="ring"><span>{initials(p.display_name)}</span></span>
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
			{#if p.worked_with.length}
				<div class="marquee rv" style="--i:5">
					<span class="mq-l">Worked with</span>
					<div class="mq"><div class="mq-track">{#each [0, 1, 2, 3] as k (k)}{#each p.worked_with as n (n)}<span>{n}</span>{/each}{/each}</div></div>
				</div>
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
