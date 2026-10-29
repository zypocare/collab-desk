<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { allRequests, loadAllRequests } from '#lib/brand.svelte.ts';
	import { brandIg, loadBrandIg } from '#lib/brandIg.svelte.ts';
	import { loadReports, reports } from '#lib/brandReports.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { compact, hueOf, initials, inrS, stageLabel } from '#lib/util.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import RingIcons from '#lib/components/RingIcons.svelte';

	// The brand's profile, like the creator's My page: photo, three numbers, who you are, two buttons, the
	// Quick settings, then three tabs: the collabs (one poster per creator), your own posts, and the posts
	// creators made for you.
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	onMount(() => {
		if (!allRequests.loaded) loadAllRequests();
		if (!brandIg.loaded) loadBrandIg();
		if (!reports.data) loadReports('fy');
	});
	const g = $derived(brandIg.data);
	const name = $derived(acc?.brand?.name || acc?.profile?.name || g?.name || 'Your brand');
	const category = $derived(acc?.brand?.category || acc?.profile?.category || '');
	const city = $derived(acc?.profile?.city || '');
	const website = $derived(acc?.brand?.website || acc?.profile?.website || '');
	const list = $derived(allRequests.list.filter((r) => r.stage !== 'declined'));
	const creators = $derived(new Set(list.map((r) => r.creator.id)).size);
	const views = (creator: string) => reports.data?.by_creator.find((c) => c.name === creator)?.views ?? 0;
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));
	// Active first (the ones moving), then the rest, newest first.
	const ORDER: Record<string, number> = { live: 0, creating: 1, confirmed: 2, negotiating: 3, request: 4, wrapped: 5 };
	const wall = $derived([...list].sort((a, b) => (ORDER[a.stage] ?? 9) - (ORDER[b.stage] ?? 9) || b.received_on.localeCompare(a.received_on)));
	const made = $derived(wall.filter((r) => r.stage === 'live' || r.stage === 'wrapped'));
	let tab = $state<'collabs' | 'posts' | 'made'>('collabs');
	const QUICK = [
		{ label: 'Insights', icons: ['chart', 'eye', 'users'], tint: 'var(--g2)', href: '/brand/grow/insights' },
		{ label: 'Grow', icons: ['spark', 'chart', 'check'], tint: 'var(--g3)', href: '/brand/grow' },
		{ label: 'Team', icons: ['users', 'mail', 'check'], tint: 'var(--h-live)', href: '/brand/settings?s=team' },
		{ label: 'Autopilots', icons: ['layers', 'spark', 'gear'], tint: 'var(--g1)', href: '/brand/autopilots' },
		{ label: 'Billing', icons: ['rupee', 'doc', 'check'], tint: 'var(--h-request)', href: '/brand/settings?s=billing' },
		{ label: 'Help', icons: ['info', 'newmsg', 'check'], tint: 'var(--g2)', href: '/brand/help' }
	];
</script>

<svelte:head><title>{g?.username ? `@${g.username}` : name} · Miracle</title></svelte:head>

<section class="pf">
	<div class="pf-top">
		<a class="pf-av" href="/brand/settings?s=company" aria-label="Edit company and Instagram"><Avatar name={name} src={g?.picture ?? ''} size="86px" /></a>
		<div class="pf-stats">
			<a href="/brand/requests"><b>{list.length}</b><span>collabs</span></a>
			<a href="/brand/grow/insights"><b>{g?.followers != null ? compact(g.followers) : '—'}</b><span>followers</span></a>
			<a href="/brand/reports"><b>{inrS(reports.data?.kpi.spent ?? 0)}</b><span>to creators</span></a>
		</div>
	</div>
	<div class="pf-bio">
		<b>{name}</b>
		{#if category}<span class="pf-cat">{category}</span>{/if}
		<span>{[city, creators ? `works with ${creators} creator${creators === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span>
		{#if g}<span class="bp-ok"><Icon name="shield" />Verified on Instagram · @{g.username}</span>{:else}<a class="pf-link" href="/brand/settings?s=company"><Icon name="shield" />Connect Instagram to show you're the real brand</a>{/if}
		{#if website}<a class="pf-link" href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener"><Icon name="link" />{website.replace(/^https?:\/\//, '')}</a>{/if}
	</div>
	<div class="pf-btns">
		<a class="btn" href="/brand/settings?s=company">Edit profile</a>
		<a class="btn" href="/brand/settings">Settings</a>
	</div>
	<p class="pf-qs">Quick settings</p>
	<nav class="cr-rings pf-rings" aria-label="Quick settings">
		{#each QUICK as h, i (h.label)}
			<a class="cr-ring" style="--rt:{h.tint}" href={h.href}><i><span><RingIcons {i} icons={h.icons} /></span></i><small>{h.label}</small></a>
		{/each}
	</nav>
</section>

<div class="pf-tabs bp-tabs" role="tablist" aria-label="Show" style="--n:3;--i:{tab === 'collabs' ? 0 : tab === 'posts' ? 1 : 2}">
	<button role="tab" aria-selected={tab === 'collabs'} class:on={tab === 'collabs'} onclick={() => (tab = 'collabs')} aria-label="Collabs"><Icon name="grid" /></button>
	<button role="tab" aria-selected={tab === 'posts'} class:on={tab === 'posts'} onclick={() => (tab = 'posts')} aria-label="Your Instagram posts"><Icon name="film" /></button>
	<button role="tab" aria-selected={tab === 'made'} class:on={tab === 'made'} onclick={() => (tab = 'made')} aria-label="Made for you by creators"><Icon name="users" /></button>
</div>

{#if tab === 'posts'}
	<div class="pf-grid">
		{#each g?.media ?? [] as m (m.id)}
			<a class="pf-tile pf-post" href={m.permalink} target="_blank" rel="noopener">
				{#if m.thumbnail_url}<img src={m.thumbnail_url} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="film" />{/if}
				{#if m.views ?? m.reach}<span class="pf-views"><Icon name="eye" />{compact(m.views ?? m.reach ?? 0)}</span>{/if}
			</a>
		{:else}
			<div class="m-empty pf-empty"><Icon name="film" /><b>No posts yet</b><span>{g ? 'Your posts come in with tonight’s sync, or tap Sync now on Insights.' : 'Connect Instagram in Edit profile to see your posts here.'}</span></div>
		{/each}
	</div>
{:else}
	<div class="wall">
		{#each tab === 'made' ? made : wall as r, i (r.id)}
			{@const v = views(r.creator.name)}
			<a class="wt st-{r.stage}" href={at(r.creator.slug, `/brand/r/${r.code}`)} style="--h:var(--m{hueOf(r.creator.name)});--i:{Math.min(i, 8)}">
				{#if r.creator.photo}<img class="wt-img" src={r.creator.photo} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<span class="wt-glow" aria-hidden="true"></span><span class="wt-mark" aria-hidden="true">{initials(r.creator.name)}</span>{/if}
				<span class="wt-stage"><i></i>{r.needs === 'quote' || r.needs === 'draft' ? 'Your turn' : stageLabel(r.stage)}</span>
				<span class="wt-b">
					<b>{r.creator.name}</b>
					<small>{r.deliverables || 'Collab'}</small>
					<span class="wt-meta">
						{#if r.fee}<em>{inrS(r.fee)}</em>{:else if r.product_value}<em>{inrS(r.product_value)} barter</em>{/if}
						{#if v && (r.stage === 'live' || r.stage === 'wrapped')}<em><Icon name="eye" />{compact(v)}</em>{/if}
					</span>
				</span>
			</a>
		{:else}
			<div class="m-empty pf-empty"><Icon name="board" /><b>{tab === 'made' ? 'Nothing live yet' : 'No collabs yet'}</b><span>{tab === 'made' ? 'Posts creators made for you show up here once they go live.' : 'Find a creator and send your first request.'}</span></div>
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
	/* Brand profile: a creator's photo fills the poster when there is one; three tabs; the verified line. */
	.wt .wt-img { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; object-fit: cover; }
	.wt:has(.wt-img)::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(180deg, rgba(0, 0, 0, .25), transparent 35%, rgba(0, 0, 0, .75)); }
	.bp-tabs { grid-template-columns: repeat(3, 1fr); }
	.bp-ok { display: inline-flex; align-items: center; gap: 5px; color: var(--ok); font-weight: 600; }
	.bp-ok :global(.ic) { width: 14px; height: 14px; }
</style>
