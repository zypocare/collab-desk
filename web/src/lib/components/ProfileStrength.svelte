<script lang="ts">
	import { studio } from '../studio.svelte';
	import Icon from './Icon.svelte';
	import { onMount } from 'svelte';
	import { loadViews, views } from '../profileViews.svelte';
	onMount(() => void loadViews());

	// Profile strength on My page: compact progress bar that expands into brand views and the next steps
	// that lift it (a complete profile is part of her Miracle Score; deals and on-time posts are the rest).
	const s = $derived(studio.settings);
	type Step = { id: string; w: number; done: boolean; title: string; sub: string; href: string };
	const steps = $derived<Step[]>(
		s
			? [
					{ id: 'listed', w: 15, done: !!s.listed, title: 'List yourself in Explore', sub: 'Brands searching on Miracle can find you', href: '/studio/settings?s=bookings' },
					{ id: 'ig', w: 20, done: !!studio.ig?.connected, title: 'Connect Instagram', sub: 'Live followers, views and audience health', href: '/studio/settings?s=profile' },
					{ id: 'rates', w: 15, done: Object.values(s.rates ?? {}).some((v) => Number(v) > 0) && s.show_rates !== false, title: 'Show your rates', sub: 'Brands shortlist creators whose price they can see', href: '/studio/settings?s=rates' },
					{ id: 'bio', w: 10, done: !!s.bio?.trim(), title: 'Write your About line', sub: 'One line on what you make and for whom', href: '/studio/settings?s=found' },
					{ id: 'niche', w: 10, done: !!(s.niche?.trim() && s.city?.trim()), title: 'Add what you create and your city', sub: 'How brands filter on Explore', href: '/studio/settings?s=profile' },
					{ id: 'langs', w: 5, done: !!s.content_languages?.length, title: 'Add your languages', sub: 'Brands look for Kannada, Hindi, Tamil…', href: '/studio/settings?s=profile' },
					{ id: 'results', w: 10, done: !!s.show_results, title: 'Show your results', sub: 'Past collabs with real views', href: '/studio/settings?s=reviews' },
					{ id: 'reply', w: 5, done: !!s.reply_time?.trim(), title: 'Say how fast you reply', sub: 'Quick replies rank higher', href: '/studio/settings?s=profile' },
					{ id: 'open', w: 10, done: s.accepting !== false, title: 'Open for collabs', sub: 'Paused creators are hidden from most searches', href: '/studio/settings?s=bookings' }
				]
			: []
	);
	const pct = $derived(steps.reduce((a, x) => a + (x.done ? x.w : 0), 0));
	const next = $derived(steps.filter((x) => !x.done).sort((a, b) => b.w - a.w).slice(0, 3));
	const remaining = $derived(steps.filter((x) => !x.done).length);
	const owner = $derived(studio.me?.team_role === 'owner');
	let open = $state(false);
</script>

{#if s && owner}
	<section class="ps" class:open aria-label="Profile strength">
		<button type="button" class="ps-top" aria-expanded={open} onclick={() => (open = !open)}>
			<span class="ps-l">
				<span class="ps-pct" class:full={pct >= 100}>{pct}%</span>
				<span class="ps-txt">
					<b>Profile strength</b>
					<small>· {remaining === 0 ? 'Brand-ready ✦' : `${remaining} step${remaining === 1 ? '' : 's'} left`}</small>
				</span>
			</span>
			<span class="ps-chev" aria-hidden="true"><Icon name="chevR" /></span>
		</button>
		<div class="ps-bar" aria-hidden="true"><i style="width:{Math.min(100, pct)}%"></i></div>

		{#if open}
			<div class="ps-body">
				{#if views.loaded}
					<div class="ps-views"><Icon name="eye" /><span><b>{views.week} brand{views.week === 1 ? '' : 's'}</b> viewed your profile this week{views.week !== views.before ? (views.week > views.before ? `, up from ${views.before}` : `, down from ${views.before}`) : ''}. {views.month} in the last 30 days.</span></div>
				{/if}
				{#if next.length}
					<ul class="ps-list">
						{#each next as x (x.id)}
							<li><a href={x.href}><span class="ps-plus">+{x.w}</span><span class="ps-s"><b>{x.title}</b><small>{x.sub}</small></span><Icon name="chevR" /></a></li>
						{/each}
					</ul>
				{:else}
					<p class="ps-done">Complete. Brands see everything they need on Explore.</p>
				{/if}
			</div>
		{/if}
	</section>
{/if}

<style>
	.ps { display: grid; gap: 9px; margin: 12px 0 4px; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--line); background: var(--surface); }
	.ps-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
	.ps-l { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.ps-pct { flex: none; padding: 3px 8px; border-radius: 99px; background: color-mix(in oklab, var(--g1) 20%, transparent); color: var(--g1); font: 800 10.5px/1 var(--f-mono, ui-monospace, monospace); }
	.ps-pct.full { background: color-mix(in oklab, var(--ok) 18%, transparent); color: var(--ok); }
	.ps-txt { min-width: 0; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ps-txt b { font-weight: 700; color: var(--ink); }
	.ps-txt small { color: var(--ink-3); font-weight: 500; margin-left: 3px; }
	.ps-chev { flex: none; color: var(--ink-3); display: grid; place-items: center; transition: transform .2s ease; }
	.ps.open .ps-chev { transform: rotate(90deg); }
	.ps-chev :global(.ic) { width: 15px; height: 15px; }
	.ps-bar { height: 5px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
	.ps-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3)); transition: width .4s ease; }
	.ps-body { display: grid; gap: 8px; padding-top: 6px; border-top: 1px dashed var(--line); }
	.ps-views { display: flex; gap: 9px; align-items: flex-start; padding: 9px 11px; border-radius: 12px; background: color-mix(in oklab, var(--g1) 10%, transparent); font-size: 12.5px; line-height: 1.4; color: var(--ink-2); }
	.ps-views b { color: var(--ink); }
	.ps-views :global(.ic) { flex: none; width: 15px; height: 15px; margin-top: 2px; color: var(--g1); }
	.ps-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
	.ps-list a { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 9px 11px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); color: var(--ink); text-decoration: none; }
	.ps-plus { font: 400 17px/1 var(--f-serif, Georgia, serif); color: var(--g2); }
	.ps-s { display: grid; gap: 2px; min-width: 0; }
	.ps-s b { font-size: 13px; }
	.ps-s small { color: var(--ink-3); font-size: 11.5px; }
	.ps-list :global(.ic) { width: 15px; height: 15px; color: var(--ink-3); }
	.ps-done { margin: 0; font-size: 12.5px; color: var(--ok); }
</style>
