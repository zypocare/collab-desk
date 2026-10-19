<script lang="ts">
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { askAi } from '../ai';
	import { monthFacts, monthLabel, reviewMonths, type MonthFacts } from '../monthSummary';
	import { studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { compact, inr } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';

	// "Your month in review": the month's numbers, and the AI's short write-up of them.
	type Review = { headline: string; wins: string[]; watch: string[]; actions: string[] };
	const param = page.url.searchParams.get('m') ?? '';
	let month = $state(/^\d{4}-\d{2}$/.test(param) ? param : '');
	const recent = $derived(reviewMonths(studio.collabs));
	const months = $derived(month && !recent.includes(month) ? [month, ...recent] : recent);
	$effect(() => {
		if (!month && recent.length) month = recent[0];
	});
	const f = $derived<MonthFacts | null>(month && studio.settings ? monthFacts(month, studio.collabs, studio.settings, studio.media, studio.followersHistory) : null);
	let saved = $state<Record<string, Review>>({});
	let busy = $state(false);
	const tried = new Set<string>();

	async function load(m: string) {
		const { data } = await supabase.from('month_reviews').select('data').eq('month', m).maybeSingle();
		if (data) saved = { ...saved, [m]: (data.data as { ai: Review }).ai };
		else if (!tried.has(m) && !quiet) write(m);
	}
	async function write(m = month) {
		if (!f || busy) return;
		tried.add(m);
		busy = true;
		try {
			const ai = await askAi<Review>('summary', { facts: f });
			if (ai.headline) {
				saved = { ...saved, [m]: ai };
				await supabase.from('month_reviews').upsert({ month: m, data: { ai, facts: f } });
			}
		} catch (e) {
			if (!/live app/i.test((e as Error).message)) toast((e as Error).message, 'alert');
		}
		busy = false;
	}
	$effect(() => {
		const m = month;
		if (m && studio.settings) untrack(() => load(m));
	});
	const r = $derived(saved[month]);
	// Nothing happened that month: no AI use spent on reviewing it.
	const quiet = $derived(!!f && !f.earned && !f.requests.total && !f.wentLive.length && !f.ownPosts.count && !f.invoiced);
	const goalPct = $derived(f && f.goal ? Math.round((f.earned / f.goal) * 100) : null);
	const growth = $derived(f?.followers ? f.followers.end - f.followers.start : null);
</script>

{#if f}
	<section class="mr rv" style="--i:1" id="month-review">
		<span class="mr-fx" aria-hidden="true"></span>
		<header class="mr-h" class:mr-picks={months.length > 1}>
			<div>
				<span class="eb">Your month in review <span class="ai-tag"><Icon name="spark" />AI</span></span>
				<h2>{monthLabel(month)}</h2>
			</div>
			{#if months.length > 1}
				<label class="mr-pick"><span class="sr-only">Month</span><select class="inp" bind:value={month}>{#each months as m (m)}<option value={m}>{monthLabel(m)}</option>{/each}</select><Icon name="chevD" /></label>
			{/if}
		</header>

		{#if busy}<p class="mr-head"><AiThinking label="Writing your review" /></p>{:else if r}<p class="mr-head">{r.headline}</p>{/if}

		<div class="mr-kpis">
			<div><small>Earned</small><b>{inr(f.earned)}</b>{#if goalPct !== null}<em>{goalPct}% of goal</em>{/if}</div>
			<div><small>Requests</small><b>{f.requests.total}</b><em>{f.requests.said_yes} said yes</em></div>
			<div><small>Went live</small><b>{f.wentLive.length}</b><em>{f.wentLive.slice(0, 2).join(', ') || 'none'}</em></div>
			<div><small>Followers</small><b>{growth === null ? '—' : `${growth >= 0 ? '+' : ''}${compact(growth)}`}</b><em>{f.followers ? `${compact(f.followers.end)} now` : 'not tracked'}</em></div>
		</div>

		{#if r}
			<div class="mr-cols">
				<div class="mr-col good"><h3><Icon name="check" />What went well</h3><ul>{#each r.wins as x (x)}<li>{x}</li>{/each}</ul></div>
				{#if r.watch.length}<div class="mr-col bad"><h3><Icon name="alert" />Keep an eye on</h3><ul>{#each r.watch as x (x)}<li>{x}</li>{/each}</ul></div>{/if}
				<div class="mr-col act"><h3><Icon name="arrow" />Do this month</h3><ol>{#each r.actions as x, i (x)}<li><span class="mr-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{x}</li>{/each}</ol></div>
			</div>
			<div class="mr-foot"><span>Written by AI from your numbers.</span><button class="btn sm ai-btn" disabled={busy} onclick={() => write()}><Icon name="spark" />Write again</button></div>
		{:else if quiet}
			<p class="mr-foot">A quiet month: no deals, payments or posts to review.</p>
		{:else if !busy}
			<div class="mr-foot"><span>The AI turns these numbers into a short review with things to do.</span><button class="btn sm ai-btn" onclick={() => write()}><Icon name="spark" />Write my review</button></div>
		{/if}
	</section>
{/if}
