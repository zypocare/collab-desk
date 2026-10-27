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
	const goals = [{ id: 'reach', label: 'Reach', icon: 'eye' }, { id: 'followers', label: 'Followers', icon: 'users' }, { id: 'brands', label: 'Brands', icon: 'board' }] as const;
	let active = $state<'reach' | 'followers' | 'brands'>('reach');
	const move = $derived(active === 'reach' ? {
		title: focus.reach.kind === 'repeat' ? 'Repeat what people shared' : focus.reach.kind === 'watch' ? 'Lead with the result' : 'Test a fresh opening',
		action: focus.reach.kind === 'repeat' ? 'Make two fresh reels using the same topic and structure. Use the third reel to test a new opening.' : focus.reach.kind === 'watch' ? 'Show the result first, then explain it. Keep the topic similar and compare watch time after three days.' : 'Keep the topic and format. Test a new first sentence, then compare views, shares and saves after three days.',
		evidence: focus.reach.evidence, href: '/studio/grow/check', cta: 'Check a reel'
	} : active === 'followers' ? {
		title: 'Give viewers a reason to return',
		action: 'Make a short series for one clear audience. Tell viewers what to expect in the next episode and make that promise clear on your profile.',
		evidence: focus.followerChange !== null ? `Your account changed by ${focus.followerChange > 0 ? '+' : ''}${focus.followerChange} followers over ${focus.followerDays} days. This is account-wide movement, not followers credited to one reel.` : 'Follower tracking needs a count from about 28 days ago. Views alone do not tell us whether the right people followed.',
		href: '/studio/settings?s=profile', cta: 'Review your profile'
	} : { ...brand, action: brand.test });
	function changeGoal(e: KeyboardEvent) {
		const index = goals.findIndex((g) => g.id === active);
		const next = e.key === 'ArrowRight' ? (index + 1) % goals.length : e.key === 'ArrowLeft' ? (index + goals.length - 1) % goals.length : e.key === 'Home' ? 0 : e.key === 'End' ? goals.length - 1 : -1;
		if (next < 0) return;
		e.preventDefault();
		active = goals[next].id;
		document.getElementById(`growth-goal-${active}`)?.focus();
	}
	const notes = $derived([
		`Reach: ${focus.reach.test}`,
		'Followers: make the next reel part of a clear series and say what the next episode offers.',
		`Brands: ${brand.test}`,
		next ? `Next posting slot: ${next} IST. Suggested pattern: ${focus.slot ? slotLabel(focus.slot) : ''}.` : 'Choose a posting time while your personal timing pattern develops.',
		'Review after three days: views, shares, saves, watch time and account follower movement.'
	].join('\n\n'));
</script>

<section class="gc" aria-labelledby="growth-coach-title">
	<header class="gc-head">
		<div><span class="gc-eyebrow">Growth coach</span><h2 id="growth-coach-title">Your growth plan</h2></div>
		<span class="gc-sample">{focus.reels} reels · 90 days</span>
	</header>
	<div class="gc-summary">
		<div><span>Typical reel views</span><p><b>{focus.recent.typicalViews !== null ? compact(focus.recent.typicalViews) : 'Learning'}</b>{#if focus.change !== null}<i class:gc-up={focus.change > 0}>{focus.change > 0 ? '+' : ''}{focus.change}%</i>{/if}</p><small>{focus.change !== null ? 'vs previous 30 days' : 'More results needed'}</small></div>
		<div><span>Follower trend</span><p>{#if focus.followerChange !== null}<b>{focus.followerChange > 0 ? '+' : ''}{focus.followerChange.toLocaleString('en-IN')}</b>{:else}<b class="gc-pending">History pending</b>{/if}</p><small>{focus.followerDays !== null ? `Over ${focus.followerDays} days` : 'Needs about 28 days'}</small></div>
	</div>
	<div class="gc-content">
		<div class="gc-tabs" role="tablist" aria-label="Growth goal">
			{#each goals as g (g.id)}<button id="growth-goal-{g.id}" role="tab" aria-selected={active === g.id} aria-controls="growth-goal-panel" tabindex={active === g.id ? 0 : -1} onclick={() => (active = g.id)} onkeydown={changeGoal}><Icon name={g.icon} />{g.label}</button>{/each}
		</div>
		{#key active}
			<div class="gc-panel" id="growth-goal-panel" role="tabpanel" aria-labelledby="growth-goal-{active}" tabindex="0">
				<h3>{move.title}</h3><p>{move.action}</p>
				<div class="gc-links">
					<a class="gc-link" href={move.href}>{move.cta}<Icon name="chevR" /></a>
					{#if active === 'reach' && focus.reach.example?.url}<a class="gc-link gc-example" href={focus.reach.example.url} target="_blank" rel="noopener">Example reel<Icon name="arrow" /></a>{/if}
				</div>
				<details class="gc-evidence"><summary>Why this suggestion<Icon name="chevD" /></summary><p>{move.evidence}</p><small>Latest totals from posts at least three days old. Views and account follower changes are measured separately.</small></details>
			</div>
		{/key}
	</div>
	<div class="gc-schedule"><Icon name="cal" /><div><span>Next suggested slot · IST</span><b>{next || 'Still learning your best time'}</b></div><a href="#growth-day-performance" aria-label="See performance and posting times for all days">All days<Icon name="chevR" /></a></div>
	<div class="gc-actions">
		{#if weekIdeas().length && !weekIdeas().some((p) => p.status === 'idea')}<a class="btn primary" href="/studio/calendar"><Icon name="cal" />Review planned reels</a>
		{:else}<button class="btn primary" disabled={grow.planning || !canPlan} onclick={() => planWeek(true)}>{#if grow.planning}<span class="spinner"></span>{:else}<Icon name="spark" />{/if}{weekIdeas().length ? 'Refresh ideas' : 'Plan 3 reels'}</button>{/if}
		<button class="btn gc-copy" aria-label="Copy full growth plan" title="Copy full growth plan" onclick={() => copyText(notes, 'Your growth plan is copied')}><Icon name="copy" /><span>Copy plan</span></button>
	</div>
</section>

<style>
	.gc { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(240px, 1fr); column-gap: 28px; row-gap: 18px; padding: 24px; margin-bottom: 22px; border: 1px solid var(--line); border-radius: 24px; background: radial-gradient(ellipse at top left, color-mix(in oklab, var(--g1) 7%, transparent), transparent 60%), var(--surface); }
	.gc-head { grid-column: 1 / -1; display: flex; align-items: start; justify-content: space-between; gap: 12px; }
	.gc-eyebrow { font-size: 11px; font-weight: 700; color: var(--accent); letter-spacing: .08em; }
	.gc h2 { margin: 5px 0 0; font: 400 28px/1.15 var(--f-serif, Georgia, serif); }
	.gc-sample { color: var(--ink-3); font-size: 12px; line-height: 1.5; padding-top: 4px; white-space: nowrap; }
	.gc-summary { grid-column: 2; grid-row: 2; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
	.gc-summary > div { min-width: 0; }
	.gc-summary span, .gc-schedule span { display: block; font-size: 12px; color: var(--ink-3); line-height: 1.4; }
	.gc-summary p { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin: 5px 0 2px; }
	.gc-summary b { color: var(--ink); font-size: 24px; line-height: 1.3; }
	.gc-summary b.gc-pending { font-size: 15px; font-weight: 500; line-height: 2.08; color: var(--ink-2); }
	.gc-summary i { font-size: 11px; font-style: normal; color: var(--ink-2); }
	.gc-summary i.gc-up { color: var(--ok); }
	.gc small { display: block; color: var(--ink-3); font-size: 11px; line-height: 1.5; }
	.gc-content { grid-column: 1; grid-row: 2 / 5; min-width: 0; }
	.gc-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in oklab, var(--ink) 3%, transparent); }
	.gc-tabs button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 6px; border: 0; border-radius: 8px; background: transparent; color: var(--ink-3); font: 600 12px/1.3 var(--f-body, sans-serif); cursor: pointer; }
	.gc-tabs button[aria-selected="true"] { background: color-mix(in oklab, var(--accent) 12%, var(--surface)); color: var(--accent); }
	.gc-tabs :global(svg) { width: 15px; height: 15px; flex: none; }
	.gc-panel { padding-top: 18px; outline-offset: 4px; }
	.gc h3 { margin: 0 0 8px; font-size: 18px; line-height: 1.35; }
	.gc-panel > p { margin: 0; max-width: 58ch; font-size: 14px; line-height: 1.6; color: var(--ink-2); }
	.gc-links { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 20px; margin-top: 10px; }
	.gc-link { display: inline-flex; align-items: center; gap: 5px; min-height: 38px; color: var(--accent); text-decoration: none; font-size: 13px; font-weight: 600; }
	.gc-link.gc-example { font-weight: 400; color: var(--ink-2); }
	.gc-link :global(svg) { width: 14px; height: 14px; flex: none; }
	.gc-evidence { margin-top: 8px; border-top: 1px solid var(--line); }
	.gc-evidence summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 42px; color: var(--ink-3); font-size: 12px; cursor: pointer; list-style: none; }
	.gc-evidence summary::-webkit-details-marker { display: none; }
	.gc-evidence summary :global(svg) { width: 14px; height: 14px; flex: none; }
	.gc-evidence[open] summary :global(svg) { transform: rotate(180deg); }
	.gc-evidence p { margin: 0 0 8px; color: var(--ink-2); font-size: 13px; line-height: 1.55; }
	.gc-schedule { grid-column: 2; grid-row: 3; display: flex; align-items: center; gap: 10px; }
	.gc-schedule > :global(svg) { width: 19px; height: 19px; flex: none; color: var(--accent); }
	.gc-schedule > div { flex: 1; min-width: 0; }
	.gc-schedule b { display: block; margin-top: 4px; color: var(--ink); font-size: 13px; line-height: 1.5; }
	.gc-schedule a { display: inline-flex; align-items: center; gap: 2px; color: var(--accent); font-size: 12px; white-space: nowrap; text-decoration: none; }
	.gc-schedule a :global(svg) { width: 13px; height: 13px; }
	.gc-actions { grid-column: 2; grid-row: 4; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
	.gc-actions .primary { flex: 1; min-height: 42px; font-size: 13px; }
	.gc-actions .gc-copy { min-height: 42px; font-size: 12px; }
	@media (max-width: 760px) {
		.gc { grid-template-columns: minmax(0, 1fr); padding: 20px; margin-bottom: 0; gap: 16px; }
		.gc h2 { font-size: 26px; }
		.gc-head { align-items: end; }
		.gc-sample { font-size: 11px; }
		.gc-summary, .gc-content, .gc-schedule, .gc-actions { grid-column: auto; grid-row: auto; }
		.gc-summary { padding-bottom: 14px; gap: 20px; }
		.gc-content { min-width: 0; }
		.gc-panel { padding-top: 16px; }
		.gc h3 { font-size: 17px; }
		.gc-panel > p { font-size: 13px; }
		.gc-schedule { padding-top: 14px; border-top: 1px solid var(--line); }
		.gc-actions { flex-wrap: nowrap; }
		.gc-actions .primary { min-width: 0; min-height: 44px; font-size: 14px; }
		.gc-actions .gc-copy { width: 44px; min-width: 44px; min-height: 44px; padding: 0; }
		.gc-copy span { display: none; }
	}
	@media (max-width: 360px) {
		.gc-head { align-items: start; flex-direction: column; gap: 3px; }
		.gc { padding: 16px; }
		.gc-summary { gap: 12px; }
		.gc-tabs button { gap: 4px; font-size: 11px; }
	}
</style>
