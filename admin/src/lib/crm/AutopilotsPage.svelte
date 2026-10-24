<script lang="ts">
	import { onMount } from 'svelte';
	import { num } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';

	// How many accounts run each autopilot, and what the autopilots did in the last 30 days.
	type R = Record<string, any>;
	let d = $state<R | null>(null);
	let err = $state('');
	onMount(async () => {
		const { data, error } = await supabase.rpc('admin_autopilots');
		err = error ? errMessage(error) : '';
		if (!error) d = data as R;
	});
	const CREATOR: [string, string][] = [
		['packages', 'Package replies'], ['counter', 'Counter-offers'], ['nudge', 'Follow-up nudges'], ['review', 'Review asks'], ['brief', 'Brief questions'],
		['invoice', 'Invoices on live'], ['dates', 'Date reminders'], ['track', 'Tracking links'], ['pitch', 'Pitch finder'], ['instant_booking', 'Instant booking'],
		['rebook', 'Rebook offers'], ['demand_pricing', 'Demand pricing'], ['comment_dm', 'Comment → DM replies'], ['grow_auto', 'Growth mode on automatic']
	];
	const WORKSPACE: [string, string][] = [['shortlist', 'Shortlist'], ['followup', 'Follow-up'], ['draftcheck', 'Draft check'], ['negotiate', 'Negotiate'], ['rebook', 'Rebook'], ['watch', 'Competitor watch']];
	const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
</script>

<div class="ap">
	<header>
		<div class="eb">Automation</div>
		<h1>Autopilots</h1>
		<p class="muted lead">Who runs which autopilot. Switch one off for one account on its page, or for everyone in <a href={href('controls')}>Switches & limits</a>.</p>
	</header>
	{#if err}<p class="err">{err}</p>{/if}
	{#if !d}
		<div class="ld"><span class="spinner"></span></div>
	{:else}
		<section class="kpis">
			<div class="card k"><small>Autopilot items (30 days)</small><b class="mono">{num(Object.values(d.items as Record<string, number>).reduce((a, n) => a + n, 0))}</b><span>{num(d.items.pending ?? 0)} waiting for approval · <a href={href('autopilot-items')}>see them</a></span></div>
			<div class="card k"><small>Pitches sent (30 days)</small><b class="mono">{num(d.pitches_30d)}</b><span><a href={href('pitches')}>Pitches</a></span></div>
			<div class="card k"><small>Comment DMs sent (30 days)</small><b class="mono">{num(d.dm_sent_30d)}</b><span>{num(d.dm_failed_30d)} failed · <a href={href('dm')}>rules</a></span></div>
		</section>
		<div class="two">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Creator autopilots</h2><span class="muted sm">of {num(d.creators)} active creators</span></div>
				{#each CREATOR as [k, name] (k)}
					{@const n = Number(d.creator[k] ?? 0)}
					<div class="row"><span class="nm">{name}{#if k === 'pitch' && d.creator.pitch_auto}<small class="muted"> · {num(d.creator.pitch_auto)} fully automatic</small>{/if}</span><span class="bar"><span style:width="{pct(n, d.creators)}%"></span></span><span class="mono r">{num(n)}</span></div>
				{/each}
			</section>
			<section class="card">
				<div class="card-h"><h2 class="card-t">Brand autopilots</h2><span class="muted sm">of {num(d.workspaces)} workspaces</span></div>
				<div class="legend muted"><span><i class="ask"></i>Ask first</span><span><i class="auto"></i>Automatic</span></div>
				{#each WORKSPACE as [k, name] (k)}
					{@const ask = Number(d.workspace[k]?.ask ?? 0)}
					{@const auto = Number(d.workspace[k]?.auto ?? 0)}
					<div class="row"><span class="nm">{name}</span><span class="bar"><span class="ask" style:width="{pct(ask, d.workspaces)}%"></span><span class="auto" style:width="{pct(auto, d.workspaces)}%"></span></span><span class="mono r">{num(ask)} · {num(auto)}</span></div>
				{/each}
			</section>
		</div>
	{/if}
</div>

<style>
	.ap { display: flex; flex-direction: column; gap: 16px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.lead { margin-top: 4px; font-size: 13.5px; }
	.ld { padding: 60px; display: grid; place-items: center; }
	.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
	.k { padding: 14px 16px; display: grid; gap: 4px; }
	.k small { font-size: 12.5px; color: var(--ink-3); }
	.k b { font-size: 24px; font-weight: 500; }
	.k span { font-size: 12px; color: var(--ink-3); }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 16px; align-items: start; }
	.sm { font-size: 12px; }
	.row { display: grid; grid-template-columns: 190px 1fr 74px; gap: 12px; align-items: center; padding: 8px 16px; border-top: 1px solid var(--line-soft); font-size: 13px; }
	.bar { display: flex; height: 14px; background: #f1efeb; border-radius: 4px; overflow: hidden; }
	.bar span { display: block; height: 100%; background: var(--accent); }
	.bar span.ask { background: #e9b949; }
	.bar span.auto { background: var(--ok); }
	.r { text-align: right; }
	.legend { display: flex; gap: 14px; padding: 8px 16px 0; font-size: 12px; }
	.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; }
	.legend i.ask { background: #e9b949; }
	.legend i.auto { background: var(--ok); }
	@media (max-width: 560px) { .row { grid-template-columns: 1fr 70px; } .row .bar { grid-column: 1 / -1; order: 3; } }
</style>
