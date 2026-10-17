<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import type { PublicPage } from '#lib/types.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { compact, inrS, stageLabel } from '#lib/util.ts';
	import { PHONE_Q } from '#lib/phone.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Mono from '#lib/components/Mono.svelte';

	// Her profile on the phone, laid out like an Instagram profile: photo and numbers, bio,
	// buttons, highlight circles into each part of the page, then posts and collabs as grids.
	onMount(() => {
		if (!matchMedia(PHONE_Q).matches) goto('/studio/settings', { replaceState: true });
	});

	const s = $derived(studio.settings!);
	const ig = $derived(studio.ig?.connected ? studio.ig : null);
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	const collabs = $derived(studio.collabs.filter((c) => c.stage !== 'declined'));
	const earned = $derived(studio.collabs.reduce((a, c) => a + (c.pay_received || 0), 0));
	const followers = $derived(ig?.followers ? compact(ig.followers) : s.followers || '—');

	const HIGHLIGHTS = [
		{ label: 'Rates', icon: 'rupee', href: '/studio/settings?s=rates' },
		{ label: 'Bookings', icon: 'cal', href: '/studio/settings?s=bookings' },
		{ label: 'Insights', icon: 'chart', href: '/insights' },
		{ label: 'Reviews', icon: 'spark', href: '/studio/settings?s=reviews' },
		{ label: 'Auto-pilot', icon: 'layers', href: '/studio/settings?s=autopilot' },
		{ label: 'Invoices', icon: 'wallet', href: '/studio/settings?s=payments' },
		{ label: 'Team', icon: 'users', href: '/studio/settings?s=team' }
	];

	let tab = $state<'posts' | 'collabs'>('collabs');
	$effect(() => {
		if (studio.media.length && tab === 'collabs' && !collabs.length) tab = 'posts';
	});

	let kitBusy = $state(false);
	async function kit() {
		kitBusy = true;
		const { data, error } = await supabase.rpc('public_page');
		if (error || !data) toast(`Couldn't make the media kit: ${error?.message ?? 'no data'}`, 'alert');
		else await downloadMediaKit(data as PublicPage, link).catch((e) => toast(`Couldn't make the media kit: ${e}`, 'alert'));
		kitBusy = false;
	}
	async function share() {
		const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
		if (nav.share) {
			try {
				await nav.share({ title: s.display_name, text: `Work with ${s.display_name}`, url: link });
				return;
			} catch (e) {
				// She closed the share sheet: leave it there (no "Link copied"). Only a real failure copies instead.
				if ((e as Error)?.name === 'AbortError') return;
			}
		}
		copyText(link, 'Link copied. Put it in your Instagram bio.');
	}
	const money = (c: (typeof collabs)[number]) => (c.type === 'barter' ? inrS(c.product_value) : c.fee ? inrS(c.fee) : '');
</script>

<svelte:head><title>@{s.handle} · {s.app_name}</title></svelte:head>

<section class="pf">
	<div class="pf-top">
		<a class="pf-av" href="/studio/settings?s=profile" aria-label="Edit profile photo and details"><Avatar name={s.display_name} src={ig?.profile_picture_url ?? ''} size="86px" /></a>
		<div class="pf-stats">
			<a href="/studio/collabs"><b>{collabs.length}</b><span>collabs</span></a>
			<a href="/insights"><b>{followers}</b><span>followers</span></a>
			<a href="/studio/payments"><b>{inrS(earned)}</b><span>earned</span></a>
		</div>
	</div>
	<div class="pf-bio">
		<b>{s.display_name}</b>
		{#if s.niche}<span class="pf-cat">{s.niche}</span>{/if}
		<span>{[s.city, s.reply_time ? `Replies ${s.reply_time}` : ''].filter(Boolean).join(' · ')}</span>
		<span>{s.accepting ? 'Open for collabs' : 'Not taking new requests right now'}{s.engagement ? ` · ${s.engagement} engagement` : ''}</span>
		<button class="pf-link" onclick={() => copyText(link, 'Link copied')}><Icon name="link" />{link.replace(/^https?:\/\//, '')}</button>
	</div>
	<div class="pf-btns">
		<a class="btn" href="/studio/settings?s=profile">Edit profile</a>
		<button class="btn" onclick={share}>Share profile</button>
		<button class="btn pf-kit" onclick={kit} disabled={kitBusy} aria-label="Download media kit PDF">{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}</button>
	</div>
	<div class="pf-hl" aria-label="Highlights">
		{#each HIGHLIGHTS as h (h.label)}
			<a class="hl" href={h.href} target={h.href.startsWith('/insights') ? '_blank' : undefined} rel="noopener"><span class="hl-c"><Icon name={h.icon} /></span><span class="hl-l">{h.label}</span></a>
		{/each}
	</div>
</section>

<div class="pf-tabs" role="tablist" aria-label="Show" style="--n:2;--i:{tab === 'collabs' ? 0 : 1}">
	<button role="tab" aria-selected={tab === 'collabs'} class:on={tab === 'collabs'} onclick={() => (tab = 'collabs')} aria-label="Collabs"><Icon name="grid" /></button>
	<button role="tab" aria-selected={tab === 'posts'} class:on={tab === 'posts'} onclick={() => (tab = 'posts')} aria-label="Instagram posts"><Icon name="film" /></button>
</div>

{#if tab === 'collabs'}
	<div class="pf-grid">
		{#each collabs as c (c.id)}
			<a class="pf-tile st-{c.stage}" href="/studio/c/{c.code}">
				<Mono name={c.brand.name} size="lg" />
				<b>{c.brand.name}</b>
				<small>{stageLabel(c.stage)}{money(c) ? ` · ${money(c)}` : ''}</small>
			</a>
		{:else}
			<div class="m-empty pf-empty"><Icon name="board" /><b>No collabs yet</b><span>Share your link and they show up here.</span></div>
		{/each}
	</div>
{:else}
	<div class="pf-grid">
		{#each studio.media as m (m.id)}
			<a class="pf-tile pf-post" href={m.permalink} target="_blank" rel="noopener">
				{#if m.thumbnail_url}<img src={m.thumbnail_url} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="film" />{/if}
				{#if m.views ?? m.reach}<span class="pf-views"><Icon name="eye" />{compact(m.views ?? m.reach ?? 0)}</span>{/if}
			</a>
		{:else}
			<div class="m-empty pf-empty"><Icon name="film" /><b>No posts</b><span>Connect Instagram in Edit profile to see your posts here.</span></div>
		{/each}
	</div>
{/if}
