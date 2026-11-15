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
	/* Exact 3-column Instagram profile grid (.pf-grid footprint) with pure original media + 2-line footer. */
	.wall { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin: 0 -16px; padding: 4px; }
	.wt { min-width: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink); text-decoration: none;
		animation: wt-in .35s var(--ease) both; animation-delay: calc(var(--i) * 24ms); transition: transform .18s var(--ease), border-color .18s; }
	.wt.st-live { border-color: color-mix(in oklab, var(--h-live) 34%, var(--line)); }
	.wt:active { transform: scale(.97); border-color: var(--accent); }
	.wt-cover { position: relative; isolation: isolate; display: grid; place-items: center; flex: none; width: 100%; aspect-ratio: 1 / 0.94; overflow: hidden;
		background: radial-gradient(ellipse at 100% 0%, color-mix(in oklab, var(--h) 60%, transparent), transparent 70%), radial-gradient(ellipse at 0% 100%, color-mix(in oklab, var(--g2) 36%, transparent), transparent 70%), var(--hero); }
	.wt-cover > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.wt-mark { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid rgba(255, 255, 255, .2); border-radius: 14px; background: rgba(255, 255, 255, .06); color: rgba(255, 255, 255, .88); font: 600 17px/1 var(--f-display); letter-spacing: -.03em; }
	.wt-b { display: flex; flex-direction: column; gap: 2.5px; min-width: 0; padding: 5px 6.5px 5.5px; border-top: 1px solid var(--line); background: linear-gradient(180deg, color-mix(in oklab, var(--surface) 94%, var(--g1) 6%), var(--surface)); }
	.wt-r1 { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-width: 0; }
	.wt-brand-line { display: flex; align-items: center; gap: 4px; min-width: 0; flex: 1; }
	.wt-dot { flex: none; width: 5.5px; height: 5.5px; border-radius: 50%; background: var(--g1); }
	.wt-dot.live { background: var(--h-live); box-shadow: 0 0 6px var(--h-live); animation: wt-pulse 1.8s ease-in-out infinite; }
	.wt-brand-line > b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 700 11px/1.15 var(--f-body); color: var(--ink); }
	.wt-views-txt { flex: none; display: inline-flex; align-items: center; gap: 2.5px; font-size: 9px; font-weight: 700; line-height: 1; color: color-mix(in oklab, var(--g1) 75%, var(--ink)); font-variant-numeric: tabular-nums; }
	.wt-views-txt.ok { color: var(--h-live); }
	.wt-views-txt :global(.ic) { width: 10px; height: 10px; }
	.wt-r2 { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-width: 0; }
	.wt-r2 small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-3); font-size: 9.5px; font-weight: 600; line-height: 1.2; }
	.wt-r2 em { flex: none; color: var(--g3); font-family: var(--f-serif, Georgia, serif); font-style: italic; font-size: 11.5px; font-weight: 400; line-height: 1; white-space: nowrap; }
	.wall :global(.pf-empty) { grid-column: 1 / -1; }
	@keyframes wt-in { from { opacity: 0; transform: translateY(6px); } }
	@keyframes wt-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: .55; } }
	@media (prefers-reduced-motion: reduce) { .wt, .wt-dot.live { animation: none; } }
</style>

{#if qrOpen}<QrShareSheet onclose={() => (qrOpen = false)} />{/if}
