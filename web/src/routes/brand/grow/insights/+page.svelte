<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { brandIg, loadBrandIg, syncBrandIg } from '#lib/brandIg.svelte.ts';
	import { brandInsights, creatorEffect } from '#lib/brandGrow.ts';
	import { loadReports, reports } from '#lib/brandReports.svelte.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { compact, fmtUpdated, hueOf, initials } from '#lib/util.ts';
	import type { SectionKey } from '#lib/insights.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import InsightsView from '#lib/components/InsightsView.svelte';

	// The brand's own Instagram on the creator's Insights screen, laid out the same, plus what only Miracle can
	// show: the followers its creators' posts brought in.
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const who = $derived({ name: acc?.brand?.name || acc?.profile?.name || '', category: acc?.brand?.category || acc?.profile?.category || '', city: acc?.profile?.city || '' });
	onMount(() => {
		if (!brandIg.loaded) loadBrandIg();
		if (!reports.data) loadReports('fy');
	});
	const g = $derived(brandIg.data);
	const synced = $derived(!!g && (!!g.insights?.totals || !!g.media?.length));
	const d = $derived(g && synced ? brandInsights(g, who) : null);
	// Creator posts, followers after them (from the follower history the sync keeps).
	const effect = $derived(
		g ? creatorEffect(g.history ?? [], (reports.data?.requests ?? []).map((r) => ({ creator: r.creator, live_date: r.live_date })), (reports.data?.by_creator ?? []).map((c) => ({ name: c.name, views: c.views, fees: c.fees }))) : null
	);
	const HIDE = new Set<SectionKey>(['sponsored', 'topics', 'collabs']);
	let busy = $state(false);
	async function sync() {
		busy = true;
		try {
			await syncBrandIg();
			toast('Your numbers are up to date', 'check');
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		busy = false;
	}
</script>

<svelte:head><title>Your insights · Miracle</title></svelte:head>

<div class="mi">
	<a class="mi-back" href="/brand/grow"><Icon name="chevL" />Grow</a>
	{#if !brandIg.loaded}
		<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
	{:else if !g}
		<div class="clear hero-card glow m-none">
			<div class="mesh" aria-hidden="true"></div>
			<span class="clear-ic"><Icon name="chart" /></span>
			<b>Connect Instagram to see your insights</b>
			<small>Your reach, followers, best posts and audience, and what your creators' posts did for them.</small>
			<div class="clear-acts"><a class="glass-chip" href="/brand/settings?s=company"><Icon name="link" />Connect Instagram</a></div>
		</div>
	{:else}
		<section class="ins-hero rv">
			<Avatar name={g.name || who.name} src={g.picture} />
			<div>
				<div class="eb">Your Instagram insights</div>
				<h1>All your <em>insights</em></h1>
				<div class="handle">@{g.username}{who.category ? ` · ${who.category}` : ''}{who.city ? ` · ${who.city}` : ''}</div>
				<span class="ins-verified"><Icon name="check" />From Instagram{g.synced_at ? ` · updated ${fmtUpdated(g.synced_at)}` : ''}</span>
			</div>
		</section>
		<div class="bi-acts">
			<button class="glass-chip" disabled={busy} onclick={sync}>{#if busy}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}{synced ? 'Sync now' : 'Get my numbers'}</button>
			{#if g.last_error}<small class="hint">{g.last_error}</small>{/if}
		</div>

		<!-- What only Miracle can show: the followers each creator's post brought in. -->
		{#if effect?.rows.length}
			<section class="bi-fx rv">
				<span class="bi-eb">From your creators</span>
				<b class="bi-big">Creator posts brought you <em>+{compact(effect.total)} followers</em></b>
				<small>In the 7 days after each live post, beyond a usual week for your account</small>
				{#each effect.rows.slice(0, 5) as r (r.name)}
					<div class="bi-r">
						<span class="bi-av" style="--h:var(--m{hueOf(r.name)})">{initials(r.name)}</span>
						<span class="bi-t"><b>{r.name}</b><small>{r.views ? `${compact(r.views)} views` : 'Live'}{r.perK !== null ? ` · ₹${r.perK} per 1K views` : ''}</small></span>
						<b class="bi-g">+{compact(r.gain)}</b>
					</div>
				{/each}
			</section>
		{:else if effect && !effect.enough && synced}
			<p class="hint bi-wait"><Icon name="clock" />After a few weeks of syncs, this shows the followers each creator's post brought you.</p>
		{/if}

		{#if d}
			<InsightsView {d} hide={HIDE} />
		{:else}
			<div class="clear hero-card glow m-none">
				<div class="mesh" aria-hidden="true"></div>
				<span class="clear-ic"><Icon name="refresh" /></span>
				<b>Your numbers aren't in yet</b>
				<small>They come in every night. Tap "Get my numbers" to fetch them now.</small>
			</div>
		{/if}
	{/if}
</div>

<style>
	.mi { display: flex; flex-direction: column; gap: 0; min-width: 0; }
	.mi-back { display: none; align-items: center; gap: 4px; align-self: flex-start; min-height: 44px; margin-bottom: 8px; font-weight: 600; color: var(--ink-2); text-decoration: none; }
	.mi-back :global(.ic) { width: 18px; height: 18px; }
	@media (min-width: 761px) {
		.mi-back { display: inline-flex; }
	}
	.mi :global(.ins-hero h1 em) { font-style: italic; }
	.bi-acts { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 16px; }
	.bi-wait { display: flex; align-items: center; gap: 8px; margin: 0 0 16px; }
	.bi-wait :global(.ic) { width: 16px; height: 16px; flex: none; }
	.bi-fx { display: grid; gap: 6px; margin: 0 0 18px; padding: 16px; border-radius: 20px; background: linear-gradient(140deg, color-mix(in oklab, var(--g1) 18%, transparent), color-mix(in oklab, var(--g2) 8%, transparent)); border: 1px solid color-mix(in oklab, var(--g1) 30%, transparent); }
	.bi-eb { font-size: 10.5px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; color: var(--g1); }
	.bi-big { font: 400 26px/1.1 var(--f-serif, Georgia, serif); }
	.bi-big em { font-style: italic; color: var(--g3); }
	.bi-fx > small { font-size: 12.5px; color: var(--ink-3); }
	.bi-r { display: flex; align-items: center; gap: 10px; padding: 10px 0; }
	.bi-r + .bi-r { border-top: 1px solid var(--line); }
	.bi-av { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--h); color: #fff; font-size: 12px; font-weight: 800; }
	.bi-t { flex: 1; min-width: 0; display: grid; gap: 1px; }
	.bi-t b { font-size: 14px; }
	.bi-t small { font-size: 12px; color: var(--ink-3); }
	.bi-g { color: var(--ok); font-size: 16px; }
</style>
