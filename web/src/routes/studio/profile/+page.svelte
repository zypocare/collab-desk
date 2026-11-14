<script lang="ts">
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
	import RingIcons from '#lib/components/RingIcons.svelte';

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
	// Quick settings: round shortcuts made like Money's (a turning ring in its own colour, its icon turning through
	// a few related ones, each a beat after the one before).
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
	<ProfileStrength />
	<p class="pf-qs">Quick settings</p>
	<nav class="cr-rings pf-rings" aria-label="Quick settings">
		{#each HIGHLIGHTS as h, i (h.label)}
			{#if h.href === '#qr'}
				<button class="cr-ring" style="--rt:{h.tint}" onclick={() => (qrOpen = true)} aria-label="Show and share your QR code"><i><span><RingIcons {i} icons={h.icons} /></span></i><b>SHARE</b><small>{h.label}</small></button>
			{:else}
				<a class="cr-ring" style="--rt:{h.tint}" href={h.href} target={h.href.startsWith('/insights') ? '_blank' : undefined} rel="noopener"><i><span><RingIcons {i} icons={h.icons} /></span></i><small>{h.label}</small></a>
			{/if}
		{/each}
	</nav>
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
			<a class="wt st-{c.stage}" href="/studio/c/{c.code}" style="--h:var(--m{hueOf(c.brand.name)});--i:{Math.min(i, 8)}">
				<span class="wt-cover">
					{#if img}<img src={igImg(img)} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />{:else}<span class="wt-mark" aria-hidden="true">{initials(c.brand.name)}</span>{/if}
					<span class="wt-stage"><i></i>{stageLabel(c.stage)}</span>
					{#if v}<span class="wt-views" aria-label="{compact(v)} views"><Icon name="eye" />{compact(v)}</span>{/if}
				</span>
				<span class="wt-b">
					<b>{c.brand.name}</b>
					<span class="wt-meta">
						<span class="wt-work"><span class="wt-work-icon"><Icon name="layers" /></span><small>{delivText(c.deliverables) || c.brand.category || 'Collab'}</small></span>
						{#if money(c)}<em>{money(c)}{c.type === 'barter' ? ' barter' : ''}</em>{/if}
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
				{#if m.thumbnail_url}<img src={igImg(m.thumbnail_url)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="film" />{/if}
				{#if m.views ?? m.reach}<span class="pf-views"><Icon name="eye" />{compact(m.views ?? m.reach ?? 0)}</span>{/if}
			</a>
		{:else}
			<div class="m-empty pf-empty"><Icon name="film" /><b>No posts</b><span>Connect Instagram in Edit profile to see your posts here.</span></div>
		{/each}
	</div>
{/if}

<style>
	/* Photo-led cards with a separate details panel, using the app's light/dark theme. */
	.wall { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; padding: 16px 0 8px; }
	.wt { min-width: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); color: var(--ink); text-decoration: none;
		animation: wt-in .35s var(--ease) both; animation-delay: calc(var(--i) * 30ms); transition: transform .2s var(--ease), border-color .2s; }
	.wt:active { transform: scale(.98); border-color: var(--accent); }
	.wt-cover { position: relative; isolation: isolate; display: grid; place-items: center; flex: none; width: 100%; aspect-ratio: 1.06; overflow: hidden;
		background: radial-gradient(ellipse at 100% 0%, color-mix(in oklab, var(--h) 65%, transparent), transparent 70%), radial-gradient(ellipse at 0% 100%, color-mix(in oklab, var(--g2) 40%, transparent), transparent 70%), var(--hero); }
	.wt-cover > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.wt-cover::after { content: ''; position: absolute; z-index: 1; inset: 0; pointer-events: none; background: linear-gradient(180deg, rgba(0, 0, 0, .12), transparent 35%, transparent 65%, rgba(0, 0, 0, .18)); }
	.wt-mark { display: grid; place-items: center; width: 84px; height: 84px; border: 1px solid rgba(255, 255, 255, .2); border-radius: 28px; background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .8); font: 600 34px/1 var(--f-display); letter-spacing: -.04em; }
	.wt-stage { position: absolute; z-index: 2; top: 10px; right: 10px; display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border: 1px solid rgba(255, 255, 255, .12); border-radius: 999px; background: rgba(17, 13, 17, .8); color: #fff; font-size: 10px; line-height: 1; font-weight: 600; }
	.wt-stage i { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--hue, var(--h-live)); }
	.wt-views { position: absolute; z-index: 2; bottom: 10px; right: 10px; display: inline-flex; align-items: center; gap: 5px; min-height: 25px; padding: 0 9px; border-radius: 999px; background: var(--g1); color: var(--accent-ink); font-size: 11px; line-height: 1; font-weight: 600; font-variant-numeric: tabular-nums; }
	.wt-views :global(.ic) { width: 13px; height: 13px; }
	.wt-b { display: flex; flex: 1; flex-direction: column; gap: 14px; min-width: 0; padding: 12px 11px 13px; }
	.wt-b > b { min-height: 2.7em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font: 600 14px/1.35 var(--f-body); overflow-wrap: anywhere; }
	.wt-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; min-width: 0; }
	.wt-work { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
	.wt-work-icon { display: grid; place-items: center; flex: none; width: 17px; height: 17px; border-radius: 50%; background: color-mix(in oklab, var(--g2) 14%, var(--surface)); color: var(--accent); }
	.wt-work-icon :global(.ic) { width: 11px; height: 11px; }
	.wt-work small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-3); font-size: 11.5px; line-height: 1.4; }
	.wt-meta em { flex: none; color: var(--ink-2); font-style: normal; font-size: 11.5px; font-weight: 600; line-height: 1.4; white-space: nowrap; }
	.wall :global(.pf-empty) { grid-column: 1 / -1; }
	@keyframes wt-in { from { opacity: 0; transform: translateY(8px); } }
	@media (prefers-reduced-motion: reduce) { .wt { animation: none; } }
</style>

{#if qrOpen}<QrShareSheet onclose={() => (qrOpen = false)} />{/if}
