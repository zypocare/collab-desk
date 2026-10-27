<script lang="ts">
	import { postingTimeInsights } from '../postTime';
	import { studio } from '../studio.svelte';
	import { compact } from '../util';
	import Icon from './Icon.svelte';

	const performance = $derived(postingTimeInsights(studio.media));
	let selected = $state(new Date(Date.now() + 330 * 60e3).getUTCDay());
	let showWindows = $state(false);
	const day = $derived(performance.weekdays.find((d) => d.day === selected)!);
	const max = $derived(Math.max(1, ...performance.weekdays.map((d) => d.typical ?? 0)));
	const metric = $derived(performance.metric ?? 'views');
	const windowMax = $derived(Math.max(1, ...day.windows.map((w) => w.typical)));
	const tones = ['var(--g3)', 'var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g1)', 'var(--g2)', 'var(--g1)'];
</script>

<section class="wdp" id="growth-day-performance" aria-labelledby="weekday-performance-title">
	<header class="wdp-head">
		<div><span class="wdp-eyebrow">Your posting patterns</span><h2 id="weekday-performance-title">Performance by day</h2></div>
		<span class="wdp-meta">Last 90 days · India time</span>
	</header>
	<p class="wdp-intro">Your typical {metric} and best observed posting time, by weekday. Tap a day to explore.</p>
	{#if !performance.metric}<p class="wdp-learning"><Icon name="chart" />Your measured posting results will appear here as Instagram insights arrive.</p>{/if}
	<table class="wdp-table">
		<caption class="sr-only">Weekday performance and best observed posting time in India time</caption>
		<colgroup><col class="wdp-day-col" /><col class="wdp-result-col" /><col class="wdp-time-col" /></colgroup>
		<thead><tr><th scope="col">Day</th><th scope="col">Typical {metric}</th><th scope="col">Best time · IST</th></tr></thead>
		<tbody>
			{#each performance.weekdays as d (d.day)}
				<tr class:wdp-selected={selected === d.day} style="--day-tone:{tones[d.day]}">
					<th scope="row"><button class="wdp-day" aria-pressed={selected === d.day} aria-expanded={selected === d.day && showWindows} aria-controls="weekday-window-detail" onclick={() => { selected = d.day; showWindows = true; }}><span>{d.short}</span><small>{d.posts} post{d.posts === 1 ? '' : 's'}</small></button></th>
					<td class="wdp-result"><strong>{d.typical !== null ? compact(d.typical) : '—'}</strong><span class="wdp-mobile-label">typical {metric}</span>
						<div class="wdp-meter" aria-hidden="true"><i style="width:{((d.typical ?? 0) / max) * 100}%"></i></div>
						{#if d.lift !== null}<small class:wdp-up={d.lift > 0}>{d.lift > 0 ? '+' : ''}{d.lift}% vs usual</small>{:else if d.posts}<small>Early data</small>{/if}
					</td>
					<td class="wdp-post-time">{#if d.bestTime}<span class="wdp-mobile-label">Post around</span><b class="wdp-time">{d.bestTime.label}</b><small>{d.bestTime.posts} supporting posts</small>
						{:else}<span class="wdp-not-yet">No time yet</span>{#if d.posts}<small>More posts needed</small>{/if}{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<details class="wdp-detail" id="weekday-window-detail" bind:open={showWindows}>
		<summary><span><Icon name="clock" />{day.name}’s posting windows</span><Icon name="chevD" /></summary>
		<div class="wdp-detail-body" aria-live="polite" aria-atomic="true">
		{#if day.bestTime}<p class="wdp-summary">Try <b>{day.bestTime.label} IST</b>, inside the <b>{day.bestTime.window}</b> window. Those {day.bestTime.posts} posts had typical {metric} of <b>{compact(day.bestTime.typical)}</b>.</p>
		{:else}<p class="wdp-summary">{day.posts ? `Keep testing ${day.name} posting times. There isn’t enough evidence to suggest one yet.` : `No measured ${day.name} posts yet. This fills in when you publish on that day.`}</p>{/if}
		{#if day.windows.length}
			<div class="wdp-windows">
				{#each day.windows as w (w.from)}
					<div class="wdp-window" class:wdp-best={day.bestTime?.window === w.k}>
						<span>{w.k}</span><b>{compact(w.typical)} <small>{metric}</small></b>
						<div class="wdp-meter" aria-hidden="true"><i style="width:{(w.typical / windowMax) * 100}%"></i></div>
						<small>{w.posts} post{w.posts === 1 ? '' : 's'}{w.posts < 3 ? ' · early data' : ''}</small>
					</div>
				{/each}
			</div>
		{/if}
		</div>
	</details>
	<details class="wdp-method"><summary>How these times are chosen<Icon name="chevD" /></summary><p class="wdp-note">Typical means the middle result per post. “Vs usual” compares with all {performance.posts} measured posts. Time suggestions need six posts overall and three in the same weekday’s two-hour window.</p><p class="wdp-source">{performance.metric === 'reach' ? 'Using reach because fewer than six posts have measured views.' : performance.metric === 'views' ? 'Using views.' : 'Waiting for measured views or reach.'} Stories and posts newer than three days are excluded.</p></details>
</section>

<style>
	.wdp { display: grid; gap: 16px; padding: 24px; margin-bottom: 22px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); scroll-margin-top: 96px; }
	.wdp-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; }
	.wdp-eyebrow { font-size: 11px; color: var(--accent); font-weight: 700; letter-spacing: .1em; }
	.wdp h2 { margin: 5px 0 0; font: 400 28px/1.15 var(--f-serif, Georgia, serif); }
	.wdp-meta, .wdp-source, .wdp-note { color: var(--ink-3); font-size: 12px; line-height: 1.5; }
	.wdp-intro, .wdp-summary { margin: 0; color: var(--ink-2); font-size: 13px; line-height: 1.5; }
	.wdp-learning { display: flex; gap: 8px; align-items: start; margin: 0; color: var(--ink-2); font-size: 13px; line-height: 1.5; }
	.wdp-learning :global(svg) { width: 18px; height: 18px; flex: none; color: var(--accent); }
	.wdp-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
	.wdp-day-col { width: 20%; }
	.wdp-result-col { width: 37%; }
	.wdp-time-col { width: 43%; }
	.wdp-table thead th { padding: 0 12px 12px; text-align: left; color: var(--ink-3); font-size: 12px; font-weight: 600; }
	.wdp-table tbody th, .wdp-table td { padding: 12px; border-top: 1px solid var(--line); text-align: left; vertical-align: middle; }
	.wdp-selected { background: color-mix(in oklab, var(--accent) 6%, transparent); }
	.wdp-day { display: grid; gap: 4px; padding: 4px 0; min-height: 44px; border: 0; background: transparent; text-align: left; font: inherit; color: var(--ink); cursor: pointer; }
	.wdp-day span { font-weight: 700; font-size: 14px; }
	.wdp-day[aria-pressed="true"] span { color: var(--accent); }
	.wdp small { display: block; color: var(--ink-3); font-size: 11px; line-height: 1.4; font-weight: 400; }
	.wdp-table strong { display: block; font-size: 16px; line-height: 1.4; }
	.wdp-time { display: block; color: var(--accent); font-size: 14px; line-height: 1.5; }
	.wdp-not-yet { display: block; color: var(--ink-2); font-size: 12px; line-height: 1.5; }
	.wdp small.wdp-up { color: var(--ok); }
	.wdp-meter { height: 4px; margin: 5px 0; overflow: hidden; border-radius: 99px; background: var(--line); }
	.wdp-meter i { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
	.wdp-note { margin: 0; }
	.wdp-detail { padding: 0 16px; border: 1px solid var(--line); border-radius: 14px; background: color-mix(in oklab, var(--ink) 2%, transparent); }
	.wdp-detail summary, .wdp-method summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 46px; cursor: pointer; list-style: none; font-size: 13px; line-height: 1.4; color: var(--ink-2); }
	.wdp summary::-webkit-details-marker { display: none; }
	.wdp-detail summary span { display: inline-flex; align-items: center; gap: 8px; }
	.wdp summary :global(svg) { width: 15px; height: 15px; flex: none; color: var(--accent); }
	.wdp-detail-body { display: grid; gap: 12px; padding: 0 0 14px; }
	.wdp-method summary { color: var(--ink-3); min-height: 36px; font-size: 12px; }
	.wdp-method p { margin: 0 0 8px; }
	.wdp-windows { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
	.wdp-window { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
	.wdp-window > span { font-size: 12px; line-height: 1.4; color: var(--ink-2); }
	.wdp-window > b { font-size: 15px; }
	.wdp-window b small { display: inline; }
	.wdp-best { border-color: var(--accent); }
	.wdp-mobile-label { display: none; }
	@media (max-width: 760px) {
		.wdp { padding: 18px; margin-bottom: 0; }
		.wdp-head { flex-direction: column; gap: 6px; }
		.wdp h2 { font-size: 26px; }
		.wdp-day-col { width: 22%; }
		.wdp-result-col { width: 34%; }
		.wdp-time-col { width: 44%; }
		.wdp-table thead th, .wdp-table tbody th, .wdp-table td { padding-left: 6px; padding-right: 6px; }
		.wdp-table thead th { font-size: 11px; }
		.wdp-table strong { font-size: 14px; }
		.wdp-time { font-size: 13px; }
		.wdp-detail { padding: 0 12px; }
		.wdp-windows { grid-template-columns: 1fr; }
	}
	@media (max-width: 760px) {
		.wdp { padding: 18px; border: 1px solid color-mix(in oklab, var(--g1) 25%, var(--line)); background: radial-gradient(100% 35% at 100% 0%, color-mix(in oklab, var(--g1) 18%, transparent), transparent 70%), var(--surface); }
		.wdp h2 { font-size: 31px; letter-spacing: -.02em; }
		.wdp-eyebrow { color: var(--g2); }
		.wdp-table, .wdp-table tbody { display: block; }
		.wdp-table colgroup { display: none; }
		.wdp-table thead { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
		.wdp-table tbody { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
		.wdp-table tbody tr { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 10px; padding: 13px; border-radius: 19px; border: 1px solid color-mix(in oklab, var(--day-tone) 30%, var(--line)); background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--day-tone) 23%, transparent), transparent 70%), var(--surface); }
		.wdp-table tbody tr.wdp-selected { border-color: var(--day-tone); box-shadow: 0 6px 20px -12px color-mix(in oklab, var(--day-tone) 70%, transparent), inset 0 0 0 1px color-mix(in oklab, var(--day-tone) 28%, transparent); background: radial-gradient(130% 100% at 100% 0%, color-mix(in oklab, var(--day-tone) 34%, transparent), transparent 75%), color-mix(in oklab, var(--day-tone) 6%, var(--surface)); }
		.wdp-table tbody th, .wdp-table td { padding: 0; border: 0; }
		.wdp-day { min-height: 38px; padding: 0; width: 100%; display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 4px; }
		.wdp-day span { font: italic 400 25px/1 var(--f-serif, Georgia, serif); color: var(--day-tone); }
		.wdp-day[aria-pressed="true"] span { color: var(--day-tone); }
		.wdp-table strong { font: 400 27px/1 var(--f-serif, Georgia, serif); }
		.wdp-mobile-label { display: block; color: var(--ink-3); font-size: 10px; line-height: 1.4; margin-top: 3px; }
		.wdp-meter { margin: 6px 0 4px; }
		.wdp-meter i { background: linear-gradient(90deg, var(--day-tone, var(--g1)), var(--g2)); transform-origin: left; animation: wdp-fill .6s ease-out both; }
		.wdp-time { font-size: 17px; color: var(--ink); }
		.wdp-post-time { padding-top: 9px !important; border-top: 1px solid color-mix(in oklab, var(--day-tone) 20%, var(--line)) !important; }
		.wdp-table tbody tr:last-child { grid-column: 1 / -1; grid-template-columns: minmax(0, .8fr) minmax(0, 1fr) minmax(0, 1fr); align-items: center; }
		.wdp-table tbody tr:last-child .wdp-day { display: grid; }
		.wdp-table tbody tr:last-child .wdp-post-time { padding-top: 0 !important; border-top: 0 !important; }
		.wdp-detail { border-color: color-mix(in oklab, var(--g1) 30%, var(--line)); background: linear-gradient(120deg, color-mix(in oklab, var(--g1) 12%, transparent), color-mix(in oklab, var(--g2) 7%, transparent)); }
		.wdp-detail[open] > summary > :global(svg), .wdp-method[open] > summary > :global(svg) { transform: rotate(180deg); }
		.wdp-best { background: radial-gradient(100% 90% at 100% 0%, color-mix(in oklab, var(--g2) 16%, transparent), transparent 70%), var(--surface); }
	}
	@keyframes wdp-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
	@media (prefers-reduced-motion: reduce) { .wdp-meter i { animation: none; } }
</style>
