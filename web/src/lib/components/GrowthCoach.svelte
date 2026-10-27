<script lang="ts">
	import { growthFocus } from '../../../../supabase/functions/_shared/growth.ts';
	import { studio } from '../studio.svelte';
	import { grow, planWeek, weekIdeas } from '../grow.svelte';
	import { slotLabel } from '../postTime';
	import { copyText } from '../ui.svelte';
	import { compact } from '../util';
	import Icon from './Icon.svelte';

	const focus = $derived(growthFocus(studio.media, studio.followersHistory));
	const proof = $derived(studio.collabs.find((c) => c.stage === 'wrapped' && c.reports?.length));
	const lead = $derived(studio.leads[0]);
	const brand = $derived(lead ? {
		title: 'Follow up on a warm brand conversation',
		evidence: `@${lead.username || lead.name || 'this brand'} has a possible collab waiting in your DMs.`,
		test: 'Review their request, check the fit and ask for the brief or budget before sending a tailored proposal.',
		href: `/studio/inbox/ig/${lead.igsid}`, cta: 'Review the DM'
	} : proof ? {
		title: 'Turn completed work into proof for brands',
		evidence: `${proof.brand.name} has a results report you can use for a case study.`,
		test: 'Show what you made and the measured results. Use that example in a pitch to a similar brand.',
		href: `/studio/c/${proof.code}`, cta: 'Open the collab'
	} : {
		title: 'Send one pitch that fits your audience',
		evidence: 'Build on the audience and content you can demonstrate in your media kit.',
		test: 'Pick one relevant brand. Suggest a specific reel, link your strongest example and ask about their campaign goals.',
		href: '/studio/pitches', cta: 'Find a brand to pitch'
	});
	const next = $derived(focus.nextPost ? new Date(focus.nextPost).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
	const canPlan = $derived(studio.media.some((m) => m.product_type !== 'STORY' && (m.media_type === 'VIDEO' || m.product_type === 'REELS') && (m.views ?? 0) > 0));
	const notes = $derived([
		`Reach: ${focus.reach.test}`,
		'Followers: make the next reel part of a clear series and say what the next episode offers.',
		`Brands: ${brand.test}`,
		next ? `Next posting slot: ${next} IST.` : 'Choose a posting time while your personal timing pattern develops.',
		'Review after three days: views, shares, saves, watch time and account follower movement.'
	].join('\n\n'));
</script>

<section class="gc" aria-labelledby="growth-coach-title">
	<header class="gc-head">
		<div><span class="gc-eyebrow">Reach · Followers · Brands</span><h2 id="growth-coach-title">Your next growth moves</h2></div>
		<span class="gc-sample">{focus.reels} settled reel{focus.reels === 1 ? '' : 's'} · 90 days</span>
	</header>
	<div class="gc-review">
		<div>
			<span>Typical reel views</span>
			<strong>{focus.recent.typicalViews !== null ? compact(focus.recent.typicalViews) : 'Still learning'}</strong>
			{#if focus.change !== null}<small class:gc-up={focus.change > 0}>{focus.change > 0 ? '+' : ''}{focus.change}% vs previous 30 days</small>
			{:else}<small>Three measured reels per period needed for a comparison</small>{/if}
		</div>
		<div>
			<span>Account follower change</span>
			<strong>{focus.followerChange !== null ? `${focus.followerChange > 0 ? '+' : ''}${focus.followerChange.toLocaleString('en-IN')}` : 'Building history'}</strong>
			<small>{focus.followerDays !== null ? `Over ${focus.followerDays} days · across your account` : 'Needs follower history from about 28 days ago'}</small>
		</div>
	</div>
	<p class="gc-caption">Views compare two 30-day groups, leaving out the newest three days. Figures are the latest totals for those reels.</p>
	<div class="gc-moves" aria-label="Actions for reach, followers and brands">
		<article class="gc-move">
			<span class="gc-tag"><Icon name="eye" /> Reach</span>
			<h3>{focus.reach.title}</h3>
			<p>{focus.reach.evidence}</p>
			<div class="gc-test"><b>Try next</b><p>{focus.reach.test}</p></div>
			{#if focus.reach.example?.url}<a class="gc-example" href={focus.reach.example.url} target="_blank" rel="noopener">View the example reel <Icon name="arrow" /></a>{/if}
			<a class="gc-link" href="/studio/grow/check">Check your next reel <Icon name="chevR" /></a>
		</article>
		<article class="gc-move">
			<span class="gc-tag"><Icon name="users" /> Followers</span>
			<h3>Give the right viewers a reason to follow</h3>
			<p>{focus.followerChange !== null ? 'Follower movement is measured for your account; it is not credited to one reel.' : 'Views alone do not tell us whether the right people followed.'}</p>
			<div class="gc-test"><b>Try next</b><p>Make a short series for one clear audience. End the reel with what the next episode offers, and make that promise clear on your profile.</p></div>
			<a class="gc-link" href="/studio/settings?s=profile">Review your profile <Icon name="chevR" /></a>
		</article>
		<article class="gc-move">
			<span class="gc-tag"><Icon name="board" /> Brands</span>
			<h3>{brand.title}</h3><p>{brand.evidence}</p>
			<div class="gc-test"><b>Try next</b><p>{brand.test}</p></div>
			<a class="gc-link" href={brand.href}>{brand.cta} <Icon name="chevR" /></a>
		</article>
	</div>
	<footer class="gc-footer">
		<div class="gc-slot"><Icon name="cal" /><span><b>{focus.slot ? slotLabel(focus.slot) : 'Your posting pattern is still developing'}</b><small>{next ? `Next slot: ${next} IST. Review results three days after posting.` : 'Your personalized time appears when the posting data supports one.'}</small></span></div>
		<div class="gc-actions">
			{#if weekIdeas().length && !weekIdeas().some((p) => p.status === 'idea')}<a class="btn primary" href="/studio/calendar"><Icon name="cal" />Review your planned reels</a>
			{:else}<button class="btn primary" disabled={grow.planning || !canPlan} onclick={() => planWeek(true)}>{#if grow.planning}<span class="spinner"></span>{:else}<Icon name="spark" />{/if}{weekIdeas().length ? 'Refresh unplanned ideas' : 'Build my next 3 reels'}</button>{/if}
			<button class="btn" onclick={() => copyText(notes, 'Your growth actions are copied')}><Icon name="copy" />Copy actions</button>
		</div>
	</footer>
</section>

<style>
	.gc { display: grid; gap: 18px; padding: 24px; margin-bottom: 22px; border: 1px solid var(--line); border-radius: 24px; background: radial-gradient(ellipse at top left, color-mix(in oklab, var(--g1) 10%, transparent), transparent 65%), var(--surface); }
	.gc-head { display: flex; align-items: start; justify-content: space-between; gap: 14px; }
	.gc-eyebrow { font-size: 11px; font-weight: 700; color: var(--accent); letter-spacing: .1em; }
	.gc h2 { margin: 6px 0 0; font: 400 28px/1.1 var(--f-serif, Georgia, serif); }
	.gc-sample, .gc-caption { color: var(--ink-3); font-size: 12px; line-height: 1.5; }
	.gc-review { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
	.gc-review > div { display: grid; gap: 5px; padding: 14px; border-radius: 16px; border: 1px solid var(--line); background: color-mix(in oklab, var(--ink) 3%, transparent); }
	.gc-review span { font-size: 12px; color: var(--ink-2); }
	.gc-review strong { font-size: 22px; line-height: 1.15; }
	.gc small { display: block; color: var(--ink-3); font-size: 12px; line-height: 1.45; }
	.gc small.gc-up { color: var(--ok); }
	.gc-caption { margin: -8px 0 0; }
	.gc-moves { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
	.gc-move { min-width: 0; display: flex; flex-direction: column; gap: 12px; padding: 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--surface); }
	.gc-tag { display: inline-flex; align-items: center; gap: 7px; color: var(--accent); font-size: 12px; font-weight: 700; }
	.gc-tag :global(svg) { width: 16px; height: 16px; }
	.gc h3 { margin: 0; font-size: 17px; line-height: 1.35; }
	.gc-move p { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-2); }
	.gc-test { padding-top: 12px; border-top: 1px solid var(--line); }
	.gc-test b { display: block; margin-bottom: 5px; font-size: 12px; color: var(--ink); }
	.gc-example, .gc-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--accent); text-decoration: none; }
	.gc-link { margin-top: auto; min-height: 44px; font-weight: 700; }
	.gc-link :global(svg), .gc-example :global(svg) { width: 15px; height: 15px; flex: none; }
	.gc-footer { display: grid; gap: 14px; padding-top: 16px; border-top: 1px solid var(--line); }
	.gc-slot { display: flex; gap: 10px; align-items: start; }
	.gc-slot > :global(svg) { width: 20px; height: 20px; color: var(--accent); flex: none; }
	.gc-slot b { display: block; font-size: 14px; line-height: 1.5; }
	.gc-actions { display: flex; flex-wrap: wrap; gap: 10px; }
	@media (max-width: 1000px) { .gc-moves { grid-template-columns: 1fr; } }
	@media (max-width: 760px) {
		.gc { padding: 18px; margin-bottom: 0; gap: 16px; }
		.gc-head { flex-direction: column; gap: 6px; }
		.gc h2 { font-size: 26px; }
		.gc-review { gap: 8px; }
		.gc-review > div { padding: 12px; }
		.gc-review strong { font-size: 18px; overflow-wrap: anywhere; }
		.gc-moves { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: 12px; padding-bottom: 6px; }
		.gc-move { flex: 0 0 min(100%, 300px); box-sizing: border-box; scroll-snap-align: start; }
		.gc-actions { display: grid; grid-template-columns: 1fr; }
		.gc-actions .btn { min-height: 44px; }
	}
</style>
