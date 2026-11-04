<script lang="ts">
	import { studio } from '../studio.svelte';
	import Icon from './Icon.svelte';

	// Profile strength on My page: how complete her profile is for brands on Explore, and the next steps
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
	const owner = $derived(studio.me?.team_role === 'owner');
</script>

{#if s && owner}
	<section class="ps" aria-label="Profile strength">
		<div class="ps-h">
			<span class="ps-ring" style="--p:{pct}" aria-hidden="true"><b>{pct}%</b></span>
			<div class="ps-t">
				<span class="ps-eb">Profile strength</span>
				<b>{pct >= 100 ? 'Complete. Brands see everything they need.' : pct >= 70 ? 'Strong. A few steps to the top.' : 'Brands rank complete profiles higher on Explore.'}</b>
				<small>Your Miracle Score also counts on-time posts, paid deals and how fast you reply.</small>
			</div>
		</div>
		{#if next.length}
			<ul class="ps-list">
				{#each next as x (x.id)}
					<li><a href={x.href}><span class="ps-plus">+{x.w}</span><span class="ps-s"><b>{x.title}</b><small>{x.sub}</small></span><Icon name="chevR" /></a></li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.ps { display: grid; gap: 12px; margin: 4px 0 18px; padding: 16px; border-radius: 20px; border: 1px solid var(--line); background: radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, var(--g1) 14%, transparent), transparent 60%), var(--surface); }
	.ps-h { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 14px; align-items: center; }
	.ps-ring { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--g2) calc(var(--p) * 1%), color-mix(in oklab, var(--ink) 10%, transparent) 0); }
	.ps-ring b { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: var(--surface); font: 400 19px/1 var(--f-serif); }
	.ps-t { display: grid; gap: 3px; min-width: 0; }
	.ps-eb { font-size: 10.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-3); }
	.ps-t b { font-size: 15px; line-height: 1.3; }
	.ps-t small { color: var(--ink-3); font-size: 12.5px; line-height: 1.4; }
	.ps-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
	.ps-list a { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 14px; background: var(--surface-2); color: var(--ink); text-decoration: none; }
	.ps-plus { font: 400 18px/1 var(--f-serif); color: var(--g2); }
	.ps-s { display: grid; gap: 2px; min-width: 0; }
	.ps-s b { font-size: 14px; }
	.ps-s small { color: var(--ink-3); font-size: 12.5px; }
	.ps-list :global(.ic) { width: 16px; height: 16px; color: var(--ink-3); }
</style>
