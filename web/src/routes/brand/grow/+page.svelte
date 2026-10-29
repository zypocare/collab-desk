<script lang="ts">
	import { onMount } from 'svelte';
	import { brandIg, loadBrandIg } from '#lib/brandIg.svelte.ts';
	import { creatorEffect, growIdeas } from '#lib/brandGrow.ts';
	import { loadReports, reports } from '#lib/brandReports.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { compact } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// Grow for a brand: the creator's Grow, for the brand's own Instagram. Followers over 30 days with the
	// numbers that move them, this week's ideas (from its numbers and its creators'), and the tools.
	onMount(() => {
		if (!brandIg.loaded) loadBrandIg();
		if (!reports.data) loadReports('fy');
	});
	const g = $derived(brandIg.data);
	const t = $derived((g?.insights?.totals ?? {}) as Record<string, number>);
	const pv = $derived((g?.insights?.prev ?? {}) as Record<string, number>);
	const pct = (a?: number, b?: number) => (a && b ? Math.round(((a - b) / b) * 100) : null);
	const tiles = $derived(
		[
			{ k: 'Reel views', v: t.views, ch: pct(t.views, pv.views) },
			{ k: 'Shares', v: t.shares, ch: pct(t.shares, pv.shares) },
			{ k: 'Engaged', v: t.accounts_engaged, ch: pct(t.accounts_engaged, pv.accounts_engaged) }
		].filter((x) => typeof x.v === 'number')
	);
	const effect = $derived(
		g ? creatorEffect(g.history ?? [], (reports.data?.requests ?? []).map((r) => ({ creator: r.creator, live_date: r.live_date })), (reports.data?.by_creator ?? []).map((c) => ({ name: c.name, views: c.views, fees: c.fees }))) : null
	);
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));
	// The creator post that did best for the brand, to reshare.
	const best = $derived.by(() => {
		const c = [...(reports.data?.by_creator ?? [])].sort((a, b) => b.views - a.views)[0];
		if (!c || !c.views) return null;
		const code = (reports.data?.requests ?? []).find((r) => r.creator === c.name && r.live_date)?.code;
		return { name: c.name, views: c.views, slug: c.slug, code };
	});
	const ideas = $derived(brandIg.loaded ? growIdeas(g, best, at) : []);
	const d30 = $derived(g?.insights?.growth?.d30 ?? null);
	const TOOLS = [
		{ href: '/brand/grow/insights', icon: 'chart', h: 'var(--g1)', t: 'All your insights', s: 'Reach, audience, best posts' },
		{ href: '/brand/creators?tab=discover', icon: 'users', h: 'var(--g2)', t: 'Creators who grow you', s: 'Their audience is yours' },
		{ href: '/brand/autopilots', icon: 'eye', h: 'var(--g3)', t: 'Competitor watch', s: 'Who your rivals work with' },
		{ href: '/brand/reports', icon: 'layers', h: 'var(--ok)', t: 'Reports', s: 'What your creators did' }
	];
</script>

<svelte:head><title>Grow · Miracle</title></svelte:head>

{#if brandIg.loaded && !g}
	<section class="clear hero-card glow m-none bg-hero">
		<div class="mesh" aria-hidden="true"></div>
		<span class="clear-ic"><Icon name="spark" /></span>
		<b>Grow your own Instagram</b>
		<small>Connect it, and this page tracks your followers, reach and best posts, shows what creators did for them, and gives you ideas each week.</small>
		<div class="clear-acts"><a class="glass-chip" href="/brand/settings?s=company"><Icon name="link" />Connect Instagram</a></div>
	</section>
{:else if g}
	<!-- The creator's Grow hero, for the brand's own account. -->
	<a class="bg-hero hero-card glow" href="/brand/grow/insights">
		<div class="mesh" aria-hidden="true"></div>
		<span class="bg-eb">Followers · 30 days</span>
		<b class="bg-big">{(g.followers ?? 0).toLocaleString('en-IN')}</b>
		<span class="bg-sub">{d30 !== null ? `${d30 >= 0 ? '+' : ''}${d30.toLocaleString('en-IN')} this month` : 'Growth shows after a few days of syncs'}{effect?.total ? ` · ${compact(effect.total)} of them from creator posts` : ''}</span>
		{#if tiles.length}
			<span class="bg-tiles">
				{#each tiles as x (x.k)}
					<span><small>{x.k}</small><b>{compact(x.v)}</b>{#if x.ch !== null}<em class:down={x.ch < 0}>{x.ch > 0 ? '+' : ''}{x.ch}%</em>{/if}</span>
				{/each}
			</span>
		{/if}
	</a>
{/if}

{#if ideas.length}
	<p class="bg-cap">Ideas this week</p>
	<div class="bg-ideas">
		{#each ideas as x, i (x.title)}
			<div class="bg-idea">
				<span class="bg-n">{i + 1}</span>
				<p><b>{x.title}</b><small>{x.why}</small></p>
				<a class="btn primary sm" href={x.href}>{x.act}</a>
			</div>
		{/each}
	</div>
{/if}

<div class="bg-tools">
	{#each TOOLS as x (x.href)}
		<a class="bg-tool" href={x.href} style="--h:{x.h}"><span class="bg-ic"><Icon name={x.icon} /></span><b>{x.t}</b><small>{x.s}</small></a>
	{/each}
</div>

<style>
	.bg-hero { position: relative; display: flex; flex-direction: column; gap: 10px; margin: 4px 0 18px; padding: 20px; color: var(--hero-ink, var(--ink)); text-decoration: none; overflow: hidden; }
	.bg-hero > :not(.mesh) { position: relative; z-index: 1; }
	.bg-eb { font-size: 10.5px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; opacity: .75; }
	.bg-big { font: 400 52px/1 var(--f-serif, Georgia, serif); }
	.bg-sub { font-size: 12.5px; color: var(--ok); }
	.bg-tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 4px; }
	.bg-tiles > span { display: grid; gap: 2px; padding: 10px 12px; border-radius: 14px; background: color-mix(in oklab, var(--hero-ink, var(--ink)) 6%, transparent); border: 1px solid color-mix(in oklab, var(--hero-ink, var(--ink)) 12%, transparent); min-width: 0; }
	.bg-tiles small { font-size: 11.5px; opacity: .75; }
	.bg-tiles b { font: 400 22px/1.15 var(--f-serif, Georgia, serif); }
	.bg-tiles em { font-style: normal; font-size: 11px; color: var(--ok); }
	.bg-tiles em.down { color: var(--bad); }
	.bg-cap { margin: 4px 0 10px; font-size: 10.5px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	.bg-ideas { display: grid; gap: 10px; margin-bottom: 18px; }
	.bg-idea { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); }
	.bg-n { width: 26px; height: 26px; flex: none; align-self: flex-start; display: grid; place-items: center; border-radius: 8px; background: color-mix(in oklab, var(--g1) 18%, transparent); color: var(--g1); font-weight: 800; font-size: 12.5px; }
	.bg-idea p { flex: 1; min-width: 0; margin: 0; font-size: 13.5px; line-height: 1.45; }
	.bg-idea p small { display: block; margin-top: 2px; font-size: 12px; color: var(--ink-3); }
	.bg-tools { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
	.bg-tool { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 14px; border-radius: 18px; border: 1px solid var(--line); color: var(--ink); text-decoration: none; background: radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--h) 22%, transparent), transparent 60%), var(--surface); }
	.bg-ic { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 11px; background: color-mix(in oklab, var(--h) 18%, transparent); color: var(--h); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--h) 32%, transparent); }
	.bg-ic :global(.ic) { width: 17px; height: 17px; }
	.bg-tool b { font: italic 400 21px/1.05 var(--f-serif, Georgia, serif); }
	.bg-tool small { font-size: 12px; color: var(--ink-3); }
</style>
