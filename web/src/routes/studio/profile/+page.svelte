<script lang="ts">
	import ProfileWall from '#lib/components/ProfileWall.svelte';
	import { igImg } from '#lib/igImg.ts';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import type { PublicPage } from '#lib/types.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { compact, delivText, hueOf, initials, inrS, stageLabel } from '#lib/util.ts';
	import { PHONE_Q } from '#lib/phone.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import QrShareSheet from '#lib/components/QrShareSheet.svelte';
	import ProfileStrength from '#lib/components/ProfileStrength.svelte';
	import ProfileEngagement from '#lib/components/ProfileEngagement.svelte';
	import RingIcons from '#lib/components/RingIcons.svelte';

	// Her profile on the phone, laid out like an Instagram profile: living hero card with photo & stats,
	// bio, NeoPOP action bar, compact Profile Strength, highlight circles, and filterable 3-column grids.
	onMount(() => {
		if (!matchMedia(PHONE_Q).matches) goto('/studio/settings', { replaceState: true });
	});

	const s = $derived(studio.settings!);
	const ig = $derived(studio.ig?.connected ? studio.ig : null);
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	// Only work that is out there: live or wrapped. Requests and deals still being made don't show (or count) here.
	const collabs = $derived(studio.collabs.filter((c) => c.stage === 'live' || c.stage === 'wrapped'));
	// The work wall: what's going on first (newest stage work at the top), then everything wrapped, newest first.
	const ORDER: Record<string, number> = { live: 0, creating: 1, confirmed: 2, negotiating: 3, request: 4, wrapped: 5 };
	const wall = $derived([...collabs].sort((a, b) => (ORDER[a.stage] ?? 9) - (ORDER[b.stage] ?? 9) || (b.live_date || b.received_on).localeCompare(a.live_date || a.received_on)));
	const liveCount = $derived(wall.filter((c) => c.stage === 'live').length);
	const wrappedCount = $derived(wall.filter((c) => c.stage === 'wrapped').length);
	let filter = $state<'all' | 'live' | 'wrapped' | 'paid' | 'barter'>('all');
	const filteredWall = $derived(
		wall.filter((c) => {
			if (filter === 'live') return c.stage === 'live';
			if (filter === 'wrapped') return c.stage === 'wrapped';
			if (filter === 'paid') return c.type !== 'barter';
			if (filter === 'barter') return c.type === 'barter';
			return true;
		})
	);
	const thumb = (c: (typeof collabs)[number]) => c.posts?.find((x) => x.media?.thumbnail_url)?.media.thumbnail_url ?? '';
	const views = (c: (typeof collabs)[number]) => c.posts?.reduce((a, x) => a + (x.media?.views ?? x.media?.reach ?? 0), 0) ?? 0;
	const earned = $derived(studio.collabs.reduce((a, c) => a + (c.pay_received || 0), 0));
	const followers = $derived(ig?.followers ? compact(ig.followers) : s.followers || '—');

	// The QR code opens as a sheet to share; its look is changed in Settings > QR codes.
	let qrOpen = $state(false);
	// Quick settings: round Instagram-style highlight shortcuts into every part of Settings.
	const HIGHLIGHTS = [
		{ label: 'QR code', icons: ['qr', 'share', 'link'], tint: 'var(--g2)', href: '#qr' },
		{ label: 'Rates', icons: ['rupee', 'layers', 'check'], tint: 'var(--g3)', href: '/studio/settings?s=rates' },
		{ label: 'Bookings', icons: ['cal', 'clock', 'check'], tint: 'var(--h-live)', href: '/studio/settings?s=bookings' },
		{ label: 'Insights', icons: ['chart', 'eye', 'users'], tint: 'var(--h-request)', href: '/insights' },
		{ label: 'Reviews', icons: ['spark', 'heart', 'check'], tint: 'var(--g1)', href: '/studio/settings?s=reviews' },
		{ label: 'Auto-pilot', icons: ['layers', 'spark', 'gear'], tint: 'var(--g2)', href: '/studio/settings?s=autopilot' },
		{ label: 'Invoices', icons: ['wallet', 'doc', 'rupee'], tint: 'var(--g3)', href: '/studio/settings?s=payments' },
		{ label: 'Team', icons: ['users', 'mail', 'check'], tint: 'var(--h-live)', href: '/studio/settings?s=team' }
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

<div class="pf-page">
<section class="pf">
	<div class="pf-hero">
		<div class="pf-top">
			<a class="pf-av" href="/studio/settings?s=profile" aria-label="Edit profile photo and details">
				<span class="pf-ring-dash" aria-hidden="true"></span>
				<Avatar name={s.display_name} src={ig?.profile_picture_url ?? ''} size="84px" />
				<span class="pf-av-plus" aria-hidden="true">+</span>
			</a>
			<div class="pf-stats">
				<a class="pf-stat" href="/studio/collabs"><b>{collabs.length}</b><span>collabs</span></a>
				<a class="pf-stat" href="/insights"><b>{followers}</b><span>followers</span></a>
				<a class="pf-stat pf-stat-money" href="/studio/payments"><b>{inrS(earned)}</b><span>earned</span></a>
			</div>
		</div>
		<div class="pf-bio">
			<div class="pf-name-row">
				<b>{s.display_name}</b>
				{#if s.niche}<span class="pf-cat">{s.niche}</span>{/if}
			</div>
			{#if s.city || s.reply_time}
				<span class="pf-meta">{[s.city, s.reply_time ? `Replies ${s.reply_time}` : ''].filter(Boolean).join(' · ')}</span>
			{/if}
			<span class="pf-meta">
				<em class="pf-avail" class:paused={!s.accepting}>{s.accepting ? 'Open for collabs' : 'Not taking new requests right now'}</em>
			</span>
			<ProfileEngagement insights={ig?.insights} />
			<div class="pf-link-row">
				<button type="button" class="pf-link" onclick={() => copyText(link, 'Link copied')}><Icon name="link" /><span>{link.replace(/^https?:\/\//, '')}</span></button>
				<a class="pf-preview-pill" href="/?preview=1" target="_blank" rel="noopener"><Icon name="eye" />Brand view</a>
			</div>
		</div>
		<div class="pf-btns">
			<a class="btn primary" href="/studio/settings?s=profile">Edit profile</a>
			<button type="button" class="btn" onclick={share}>Share profile</button>
			<button type="button" class="btn pf-kit" onclick={() => (qrOpen = true)} aria-label="Your QR code" title="Your QR code"><Icon name="qr" /></button>
			<button type="button" class="btn pf-kit" onclick={kit} disabled={kitBusy} aria-label="Download media kit PDF" title="Download media kit PDF">{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}</button>
		</div>
	</div>

	<ProfileStrength />

	<div class="pf-qs-row">
		<p class="pf-qs">Quick settings</p>
		<small>{HIGHLIGHTS.length} shortcuts</small>
	</div>
	<nav class="cr-rings pf-rings" aria-label="Quick settings">
		{#each HIGHLIGHTS as h, i (h.label)}
			{#if h.href === '#qr'}
				<button type="button" class="cr-ring" style="--rt:{h.tint}" onclick={() => (qrOpen = true)} aria-label="Show and share your QR code"><i><span><RingIcons {i} icons={h.icons} /></span></i><b>SHARE</b><small>{h.label}</small></button>
			{:else}
				<a class="cr-ring" style="--rt:{h.tint}" href={h.href} target={h.href.startsWith('/insights') ? '_blank' : undefined} rel="noopener"><i><span><RingIcons {i} icons={h.icons} /></span></i><small>{h.label}</small></a>
			{/if}
		{/each}
	</nav>
</section>

<div class="pf-tabs" role="tablist" aria-label="Show" style="--n:2;--i:{tab === 'collabs' ? 0 : 1}">
	<button type="button" role="tab" aria-selected={tab === 'collabs'} class:on={tab === 'collabs'} onclick={() => (tab = 'collabs')} aria-label="Collabs"><Icon name="grid" /><span>Collabs</span></button>
	<button type="button" role="tab" aria-selected={tab === 'posts'} class:on={tab === 'posts'} onclick={() => (tab = 'posts')} aria-label="Instagram posts"><Icon name="film" /><span>Reels</span></button>
</div>

{#if tab === 'collabs'}
	{#if wall.length > 0}
		<div class="pf-filters" role="group" aria-label="Filter collabs">
			<button type="button" class="pf-flt" class:on={filter === 'all'} aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All · {wall.length}</button>
			{#if liveCount > 0}
				<button type="button" class="pf-flt" class:on={filter === 'live'} aria-pressed={filter === 'live'} onclick={() => (filter = 'live')}>Live · {liveCount}</button>
			{/if}
			{#if wrappedCount > 0}
				<button type="button" class="pf-flt" class:on={filter === 'wrapped'} aria-pressed={filter === 'wrapped'} onclick={() => (filter = 'wrapped')}>Wrapped · {wrappedCount}</button>
			{/if}
			<button type="button" class="pf-flt" class:on={filter === 'paid'} aria-pressed={filter === 'paid'} onclick={() => (filter = 'paid')}>Paid</button>
			<button type="button" class="pf-flt" class:on={filter === 'barter'} aria-pressed={filter === 'barter'} onclick={() => (filter = 'barter')}>Barter</button>
		</div>
	{/if}
	<ProfileWall>
		{#each filteredWall as c, i (c.id)}
			{@const img = thumb(c)}
			{@const v = views(c)}
			{@const m = money(c)}
			<a class="wt st-{c.stage}" href="/studio/c/{c.code}" style="--h:var(--m{hueOf(c.brand.name)});--i:{Math.min(i, 8)}">
				<span class="wt-cover">
					{#if img}<img src={igImg(img)} alt={c.brand.name} loading="lazy" decoding="async" referrerpolicy="no-referrer" />{:else}<span class="wt-mark" aria-hidden="true">{initials(c.brand.name)}</span>{/if}
				</span>
				<span class="wt-b">
					<span class="wt-r1">
						<span class="wt-brand-line">
							<i class="wt-dot" class:live={c.stage === 'live'} aria-hidden="true"></i>
							<b>{c.brand.name}</b>
						</span>
						{#if v}
							<span class="wt-views-txt" aria-label="{compact(v)} views"><Icon name="eye" />{compact(v)}</span>
						{:else}
							<span class="wt-views-txt ok">{stageLabel(c.stage)}</span>
						{/if}
					</span>
					<span class="wt-r2">
						<small>{delivText(c.deliverables) || c.brand.category || 'Collab'}</small>
						{#if m}<em>{m}{c.type === 'barter' ? ' btr' : ''}</em>{/if}
					</span>
				</span>
			</a>
		{:else}
			<div class="m-empty pf-empty">
				<Icon name="board" />
				<b>{wall.length ? 'No matching collabs' : 'No live collabs yet'}</b>
				<span>{wall.length ? 'Try another filter above.' : 'Collabs show up here once they go live.'}</span>
			</div>
		{/each}
	</ProfileWall>
{:else}
	<div class="pf-grid">
		{#each studio.media as m (m.id)}
			<a class="pf-tile pf-post" href={m.permalink} target="_blank" rel="noopener">
				{#if m.thumbnail_url}<img src={igImg(m.thumbnail_url)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="film" />{/if}
				<span class="pf-reel-mark" aria-hidden="true"><Icon name="film" /></span>
				{#if m.views ?? m.reach}<span class="pf-views"><Icon name="eye" />{compact(m.views ?? m.reach ?? 0)}</span>{/if}
			</a>
		{:else}
			<div class="m-empty pf-empty"><Icon name="film" /><b>No posts</b><span>Connect Instagram in Edit profile to see your posts here.</span></div>
		{/each}
	</div>
{/if}
</div>



{#if qrOpen}<QrShareSheet onclose={() => (qrOpen = false)} />{/if}
