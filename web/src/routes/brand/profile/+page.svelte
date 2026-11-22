<script lang="ts">
	import { igImg } from '#lib/igImg.ts';
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

	// The brand's profile, matching the Creator Instagram-inspired My Page: living hero card with photo & stats,
	// bio, NeoPOP buttons, 9 Quick settings highlights, and 3 filterable Instagram-style tabs.
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
	const ORDER: Record<string, number> = { live: 0, creating: 1, confirmed: 2, negotiating: 3, request: 4, wrapped: 5 };
	const wall = $derived([...list].sort((a, b) => (ORDER[a.stage] ?? 9) - (ORDER[b.stage] ?? 9) || b.received_on.localeCompare(a.received_on)));
	const made = $derived(wall.filter((r) => r.stage === 'live' || r.stage === 'wrapped'));
	let tab = $state<'collabs' | 'posts' | 'made'>('collabs');
	let filter = $state<'all' | 'active' | 'live' | 'wrapped'>('all');
	const activeWall = $derived(
		(tab === 'made' ? made : wall).filter((r) => {
			if (tab === 'made' || filter === 'all') return true;
			if (filter === 'live') return r.stage === 'live';
			if (filter === 'wrapped') return r.stage === 'wrapped';
			return !['wrapped', 'declined', 'cancelled'].includes(r.stage);
		})
	);
	const QUICK = [
		{ label: 'Settings', icons: ['gear', 'users', 'check'], tint: 'var(--g1)', href: '/brand/settings' },
		{ label: 'Insights', icons: ['chart', 'eye', 'users'], tint: 'var(--g2)', href: '/brand/grow/insights' },
		{ label: 'Grow', icons: ['spark', 'chart', 'check'], tint: 'var(--g3)', href: '/brand/grow' },
		{ label: 'Growth OS', icons: ['layers', 'spark', 'rupee'], tint: 'var(--g2)', href: '/brand/suite' },
		{ label: 'Team', icons: ['users', 'mail', 'check'], tint: 'var(--h-live)', href: '/brand/settings?s=team' },
		{ label: 'Autopilots', icons: ['layers', 'spark', 'gear'], tint: 'var(--g1)', href: '/brand/autopilots' },
		{ label: 'Content', icons: ['film', 'image', 'check'], tint: 'var(--g3)', href: '/brand/business/content' },
		{ label: 'Turnaround', icons: ['clock', 'users', 'check'], tint: 'var(--h-live)', href: '/brand/business/turnaround' },
		{ label: 'Billing', icons: ['rupee', 'doc', 'check'], tint: 'var(--h-request)', href: '/brand/settings?s=billing' },
		{ label: 'Help', icons: ['info', 'newmsg', 'check'], tint: 'var(--g2)', href: '/brand/help' }
	];
</script>

<svelte:head><title>{g?.username ? `@${g.username}` : name} · Miracle</title></svelte:head>

<div class="pf-page">
<section class="pf">
	<div class="pf-hero">
		<div class="pf-top">
			<a class="pf-av" href="/brand/settings?s=company" aria-label="Edit company and Instagram">
				<span class="pf-ring-dash" aria-hidden="true"></span>
				<Avatar name={name} src={g?.picture ?? ''} size="84px" />
				<span class="pf-av-plus" aria-hidden="true">+</span>
			</a>
			<div class="pf-stats">
				<a class="pf-stat" href="/brand/requests"><b>{list.length}</b><span>collabs</span></a>
				<a class="pf-stat" href="/brand/grow/insights"><b>{g?.followers != null ? compact(g.followers) : '—'}</b><span>followers</span></a>
				<a class="pf-stat pf-stat-money" href="/brand/reports"><b>{inrS(reports.data?.kpi.spent ?? 0)}</b><span>to creators</span></a>
			</div>
		</div>
		<div class="pf-bio">
			<div class="pf-name-row">
				<b>{name}</b>
				{#if category}<span class="pf-cat">{category}</span>{/if}
			</div>
			{#if city || creators}
				<span class="pf-meta">{[city, creators ? `works with ${creators} creator${creators === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span>
			{/if}
			<div class="pf-link-row">
				{#if g}
					<span class="pf-preview-pill"><Icon name="shield" />@{g.username}</span>
				{:else}
					<a class="pf-link" href="/brand/settings?s=company"><Icon name="shield" /><span>Connect Instagram</span></a>
				{/if}
				{#if website}
					<a class="pf-link" href={website.startsWith('http') ? website : `https://${website}`} target="_blank" rel="noopener"><Icon name="link" /><span>{website.replace(/^https?:\/\//, '')}</span></a>
				{/if}
			</div>
		</div>
		<div class="pf-btns bp-btns">
			<a class="btn primary" href="/brand/settings?s=company">Edit profile</a>
			<a class="btn" href="/brand/settings">Settings</a>
			<a class="btn pf-kit" href="/brand/grow/insights" aria-label="Insights" title="Insights"><Icon name="chart" /></a>
			<a class="btn pf-kit" href="/brand/explore" aria-label="Find creators" title="Find creators"><Icon name="search" /></a>
		</div>
	</div>

	<div class="pf-qs-row">
		<p class="pf-qs">Quick settings</p>
		<small>{QUICK.length} shortcuts</small>
	</div>
	<nav class="cr-rings pf-rings" aria-label="Quick settings">
		{#each QUICK as h, i (h.label)}
			<a class="cr-ring" style="--rt:{h.tint}" href={h.href}><i><span><RingIcons {i} icons={h.icons} /></span></i><small>{h.label}</small></a>
		{/each}
	</nav>
</section>

<div class="pf-tabs bp-tabs" role="tablist" aria-label="Show" style="--n:3;--i:{tab === 'collabs' ? 0 : tab === 'posts' ? 1 : 2}">
	<button type="button" role="tab" aria-selected={tab === 'collabs'} class:on={tab === 'collabs'} onclick={() => (tab = 'collabs')} aria-label="Collabs"><Icon name="grid" /><span>Collabs</span></button>
	<button type="button" role="tab" aria-selected={tab === 'posts'} class:on={tab === 'posts'} onclick={() => (tab = 'posts')} aria-label="Your Instagram posts"><Icon name="film" /><span>Posts</span></button>
	<button type="button" role="tab" aria-selected={tab === 'made'} class:on={tab === 'made'} onclick={() => (tab = 'made')} aria-label="Made for you by creators"><Icon name="users" /><span>Made</span></button>
</div>

{#if tab === 'posts'}
	<div class="pf-grid">
		{#each g?.media ?? [] as m (m.id)}
			<a class="pf-tile pf-post" href={m.permalink} target="_blank" rel="noopener">
				{#if m.thumbnail_url}<img src={igImg(m.thumbnail_url)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<Icon name="film" />{/if}
				<span class="pf-reel-mark" aria-hidden="true"><Icon name="film" /></span>
				{#if m.views ?? m.reach}<span class="pf-views"><Icon name="eye" />{compact(m.views ?? m.reach ?? 0)}</span>{/if}
			</a>
		{:else}
			<div class="m-empty pf-empty"><Icon name="film" /><b>No posts yet</b><span>{g ? 'Your posts come in with tonight’s sync, or tap Sync now on Insights.' : 'Connect Instagram in Edit profile to see your posts here.'}</span></div>
		{/each}
	</div>
{:else}
	{#if tab === 'collabs' && wall.length > 0}
		<div class="pf-filters" role="group" aria-label="Filter collabs">
			<button type="button" class="pf-flt" class:on={filter === 'all'} aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All · {wall.length}</button>
			<button type="button" class="pf-flt" class:on={filter === 'active'} aria-pressed={filter === 'active'} onclick={() => (filter = 'active')}>Active</button>
			<button type="button" class="pf-flt" class:on={filter === 'live'} aria-pressed={filter === 'live'} onclick={() => (filter = 'live')}>Live</button>
			<button type="button" class="pf-flt" class:on={filter === 'wrapped'} aria-pressed={filter === 'wrapped'} onclick={() => (filter = 'wrapped')}>Wrapped</button>
		</div>
	{/if}
	<div class="wall">
		{#each activeWall as r, i (r.id)}
			{@const v = views(r.creator.name)}
			<a class="wt st-{r.stage}" href={at(r.creator.slug, `/brand/r/${r.code}`)} style="--h:var(--m{hueOf(r.creator.name)});--i:{Math.min(i, 8)}">
				<span class="wt-cover">
					{#if r.creator.photo}<img src={igImg(r.creator.photo)} alt={r.creator.name} loading="lazy" decoding="async" referrerpolicy="no-referrer" />{:else}<span class="wt-mark" aria-hidden="true">{initials(r.creator.name)}</span>{/if}
				</span>
				<span class="wt-b">
					<span class="wt-r1">
						<span class="wt-brand-line">
							<i class="wt-dot" class:live={r.stage === 'live' || r.needs === 'quote' || r.needs === 'draft'} aria-hidden="true"></i>
							<b>{r.creator.name}</b>
						</span>
						{#if v && (r.stage === 'live' || r.stage === 'wrapped')}
							<span class="wt-views-txt" aria-label="{compact(v)} views"><Icon name="eye" />{compact(v)}</span>
						{:else}
							<span class="wt-views-txt ok">{r.needs === 'quote' || r.needs === 'draft' ? 'Your turn' : stageLabel(r.stage)}</span>
						{/if}
					</span>
					<span class="wt-r2">
						<small>{r.deliverables || 'Collab'}</small>
						{#if r.fee}<em>{inrS(r.fee)}</em>{:else if r.product_value}<em>{inrS(r.product_value)} btr</em>{/if}
					</span>
				</span>
			</a>
		{:else}
			<div class="m-empty pf-empty"><Icon name="board" /><b>{tab === 'made' ? 'Nothing live yet' : 'No collabs yet'}</b><span>{tab === 'made' ? 'Posts creators made for you show up here once they go live.' : 'Find a creator and send your first request.'}</span></div>
		{/each}
	</div>
{/if}
</div>

<style>
	/* Exact 3-column Instagram profile grid matching Creator My Page: unobstructed media + 2-line footer. */
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
	.bp-tabs { grid-template-columns: repeat(3, 1fr); }
	@keyframes wt-in { from { opacity: 0; transform: translateY(6px); } }
	@keyframes wt-pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.35); opacity: .55; } }
	@media (prefers-reduced-motion: reduce) { .wt, .wt-dot.live { animation: none; } }
</style>
