<script lang="ts">
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

	// Her profile on the phone, laid out like an Instagram profile: photo and numbers, bio,
	// buttons, highlight circles into each part of the page, then posts and collabs as grids.
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
	const thumb = (c: (typeof collabs)[number]) => c.posts?.find((x) => x.media?.thumbnail_url)?.media.thumbnail_url ?? '';
	const views = (c: (typeof collabs)[number]) => c.posts?.reduce((a, x) => a + (x.media?.views ?? x.media?.reach ?? 0), 0) ?? 0;
	const earned = $derived(studio.collabs.reduce((a, c) => a + (c.pay_received || 0), 0));
	const followers = $derived(ig?.followers ? compact(ig.followers) : s.followers || '—');

	// The QR code opens as a sheet to share; its look is changed in Settings > QR codes.
	let qrOpen = $state(false);
	const HIGHLIGHTS = [
		{ label: 'QR code', icon: 'qr', href: '#qr' },
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
		<button class="btn pf-kit" onclick={() => (qrOpen = true)} aria-label="Your QR code" title="Your QR code"><Icon name="qr" /></button>
		<button class="btn pf-kit" onclick={kit} disabled={kitBusy} aria-label="Download media kit PDF">{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}</button>
	</div>
	<div class="pf-hl" aria-label="Highlights">
		{#each HIGHLIGHTS as h (h.label)}
			{#if h.href === '#qr'}
				<button class="hl hl-qr" onclick={() => (qrOpen = true)} aria-label="Show and share your QR code"><span class="hl-c"><span class="hl-in"><Icon name={h.icon} /></span><i class="hl-badge" aria-hidden="true"><Icon name="share" /></i></span><span class="hl-l">{h.label}</span></button>
			{:else}
				<a class="hl" href={h.href} target={h.href.startsWith('/insights') ? '_blank' : undefined} rel="noopener"><span class="hl-c"><Icon name={h.icon} /></span><span class="hl-l">{h.label}</span></a>
			{/if}
		{/each}
	</div>
</section>

<div class="pf-tabs" role="tablist" aria-label="Show" style="--n:2;--i:{tab === 'collabs' ? 0 : 1}">
	<button role="tab" aria-selected={tab === 'collabs'} class:on={tab === 'collabs'} onclick={() => (tab = 'collabs')} aria-label="Collabs"><Icon name="grid" /></button>
	<button role="tab" aria-selected={tab === 'posts'} class:on={tab === 'posts'} onclick={() => (tab = 'posts')} aria-label="Instagram posts"><Icon name="film" /></button>
</div>

{#if tab === 'collabs'}
	<div class="wall">
		{#each wall as c, i (c.id)}
			{@const img = thumb(c)}
			{@const v = views(c)}
			<a class="wt st-{c.stage}" class:img={!!img} href="/studio/c/{c.code}" style="--h:var(--m{hueOf(c.brand.name)});--i:{Math.min(i, 8)}">
				{#if img}<img src={img} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="wt-glow" aria-hidden="true"></span><span class="wt-mark" aria-hidden="true">{initials(c.brand.name)}</span>{/if}
				<span class="wt-stage"><i></i>{stageLabel(c.stage)}</span>
				<span class="wt-b">
					<b>{c.brand.name}</b>
					<small>{delivText(c.deliverables) || c.brand.category || 'Collab'}</small>
					<span class="wt-meta">
						{#if money(c)}<em>{money(c)}{c.type === 'barter' ? ' barter' : ''}</em>{/if}
						{#if v}<em><Icon name="eye" />{compact(v)}</em>{/if}
					</span>
				</span>
			</a>
		{:else}
			<div class="m-empty pf-empty"><Icon name="board" /><b>No live collabs yet</b><span>Collabs show up here once they go live.</span></div>
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

<style>
	/* The work wall: each collab a poster in the brand's colour (or its post, once linked). */
	.wall { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 14px 0 8px; }
	.wt { position: relative; isolation: isolate; overflow: hidden; aspect-ratio: 4 / 5; display: flex; flex-direction: column; justify-content: space-between; padding: 12px; border-radius: 22px; color: #fff; text-decoration: none;
		background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--h) 75%, transparent), transparent 60%), radial-gradient(110% 80% at 0% 100%, color-mix(in oklab, var(--g2) 55%, transparent), transparent 65%), linear-gradient(160deg, color-mix(in oklab, var(--h) 45%, #1a0f1c), #140c16);
		box-shadow: 0 14px 30px -18px color-mix(in oklab, var(--h) 70%, #000); animation: wt-in .5s cubic-bezier(.2, .8, .2, 1) both; animation-delay: calc(var(--i) * 40ms); }
	.wt:active { transform: scale(.98); }
	.wt.img img { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; object-fit: cover; }
	.wt.img::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(0, 0, 0, .25), transparent 35%, rgba(0, 0, 0, .75)); }
	.wt-glow { position: absolute; z-index: -1; width: 70%; aspect-ratio: 1; right: -20%; top: 18%; border-radius: 50%; background: radial-gradient(circle, color-mix(in oklab, var(--g3) 45%, transparent), transparent 70%); filter: blur(10px); }
	.wt-mark { position: absolute; z-index: -1; right: 10px; top: 36%; font: italic 400 64px/1 'Instrument Serif', Georgia, serif; color: rgba(255, 255, 255, .16); letter-spacing: -.02em; }
	.wt-stage { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: rgba(255, 255, 255, .16); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); font-size: 11.5px; font-weight: 600; }
	.wt-stage i { width: 7px; height: 7px; border-radius: 50%; background: var(--hue, #fff); box-shadow: 0 0 0 2px rgba(255, 255, 255, .25); }
	.wt.st-request .wt-stage i { animation: pulse 2s infinite; }
	.wt-b { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
	.wt-b b { font: italic 400 25px/1.05 'Instrument Serif', Georgia, serif; letter-spacing: -.01em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; text-shadow: 0 1px 12px rgba(0, 0, 0, .25); }
	.wt-b small { font-size: 12px; opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.wt-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
	.wt-meta em { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px; border-radius: 999px; background: rgba(0, 0, 0, .28); font-style: normal; font-size: 12px; font-weight: 600; }
	.wt-meta :global(.ic) { width: 13px; height: 13px; }
	.wall :global(.pf-empty) { grid-column: 1 / -1; }
	@keyframes wt-in { from { opacity: 0; transform: translateY(10px) scale(.97); } }
	@media (prefers-reduced-motion: reduce) { .wt { animation: none; } }
</style>

{#if qrOpen}<QrShareSheet onclose={() => (qrOpen = false)} />{/if}
