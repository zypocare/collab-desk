<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, num } from './format.ts';
	import { errMessage, supabase } from './supabase.ts';
	import type { Problem, ProblemDetail, Problems } from './types.ts';
	import { toast } from './ui.svelte.ts';

	// Every crash in the app, the AI server and the email/background jobs, grouped by what went wrong.
	let { onload }: { onload?: (p: Problems) => void } = $props();
	let data = $state<Problems | null>(null);
	let err = $state('');
	let status = $state<'open' | 'fixed' | 'ignored'>('open');
	let source = $state<'' | 'app' | 'server' | 'jobs'>('');
	let openId = $state<number | null>(null);
	let detail = $state<ProblemDetail | null>(null);
	let busy = $state(false);

	async function load() {
		const { data: d, error } = await supabase.rpc('admin_problems');
		err = error ? errMessage(error) : '';
		if (!error) {
			data = d as Problems;
			onload?.(data);
			if (openId === null) pick(list[0]?.id ?? null);
		}
	}
	onMount(load);
	const list = $derived((data?.list ?? []).filter((p) => p.status === status && (!source || p.source === source)));
	async function pick(id: number | null) {
		openId = id;
		detail = null;
		if (id === null) return;
		const { data: d } = await supabase.rpc('admin_problem', { p_id: id });
		if (openId === id) detail = d as ProblemDetail;
	}
	async function set(to: 'open' | 'fixed' | 'ignored') {
		if (openId === null) return;
		busy = true;
		const { data: d, error } = await supabase.rpc('admin_problem_set', { p_id: openId, p_status: to });
		busy = false;
		if (error) return toast(errMessage(error), true);
		data = d as Problems;
		onload?.(data);
		toast(to === 'fixed' ? 'Marked fixed. You’ll hear if it comes back.' : to === 'ignored' ? 'Ignored' : 'Opened again');
		pick(list[0]?.id ?? null);
	}
	const okRate = $derived(data && data.visits ? Math.max(0, 1 - data.people / data.visits) : null);
	const SRC: Record<string, string> = { app: 'App', server: 'Server', jobs: 'Emails & jobs' };
	const max = (p: Problem) => Math.max(1, ...p.days);
	const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
</script>

<div class="pr-kpis">
	<div><small>New today</small><b class="num" class:bad={!!data?.new_today}>{data ? num(data.new_today) : '—'}</b></div>
	<div><small>Open</small><b class="num">{data ? num(data.open) : '—'}</b></div>
	<div><small>People hit · 7 days</small><b class="num">{data ? num(data.people) : '—'}</b></div>
	<div><small>Visits with no problem</small><b class="num ok">{okRate === null ? '—' : `${(okRate * 100).toFixed(1)}%`}</b></div>
	{#if data?.release}<span class="pr-rel">Release {data.release}</span>{/if}
</div>

<div class="pr-chips" role="tablist" aria-label="Show">
	{#each [['open', 'Open', data?.open], ['fixed', 'Fixed', data?.fixed], ['ignored', 'Ignored', data?.ignored]] as const as [k, l, n] (k)}
		<button role="tab" aria-selected={status === k} class:on={status === k} onclick={() => ((status = k), pick(null))}>{l} {n ?? ''}</button>
	{/each}
	<i></i>
	{#each Object.entries(SRC) as [k, l] (k)}
		<button role="tab" aria-selected={source === k} class:on={source === k} onclick={() => (source = source === k ? '' : (k as typeof source))}>{l}</button>
	{/each}
</div>

{#if err}<p class="err">{err}</p>{/if}

{#if !data}
	<div class="pr-load"><span class="spinner"></span></div>
{:else}
	<div class="pr-grid">
		<div class="pr-list">
			<div class="pr-row pr-head"><span>Problem</span><span>7 days</span><span class="r">Times</span><span class="r">People</span><span>Last seen</span></div>
			{#each list as p (p.id)}
				<button class="pr-row" class:on={openId === p.id} onclick={() => pick(p.id)}>
					<span class="pr-what"><b>{p.message}</b><small>{#if p.new}<em>New</em>{' · '}{/if}{SRC[p.source]}{p.place ? ` · ${p.place}` : ''}{p.device ? ` · ${p.device.split(',').slice(0, 2).join(',')}` : ''}</small></span>
					<span class="pr-bars" aria-label="{p.times} times in 7 days">{#each p.days as d, i (i)}<i class:hot={p.new && d > 0} class:zero={!d} style="height:{Math.max(2, (d / max(p)) * 26)}px"></i>{/each}</span>
					<b class="r num" data-l="Times">{num(p.times)}</b>
					<b class="r num" data-l="People">{num(p.people)}</b>
					<small data-l="Last seen">{ago(p.last_seen)}</small>
				</button>
			{:else}
				<p class="pr-none">{status === 'open' ? 'Nothing broken right now.' : `No ${status} problems.`}</p>
			{/each}
		</div>

		<aside class="pr-pane">
			{#if openId === null}
				<p class="pr-none">Pick a problem to see what happened.</p>
			{:else if !detail}
				<div class="pr-load"><span class="spinner"></span></div>
			{:else}
				<div class="pr-top"><small class:bad={detail.status === 'open'}>{detail.status === 'open' ? 'Open' : detail.status === 'fixed' ? 'Fixed' : 'Ignored'} · first seen {time(detail.first_seen)}</small><b>{detail.message}</b><small>{num(detail.times)} times · {SRC[detail.source]}{detail.place ? ` · ${detail.place}` : ''}{detail.release ? ` · release ${detail.release}` : ''}</small></div>
				{#if detail.sample?.stack}<pre class="pr-stack">{detail.sample.stack}</pre>{/if}
				{#if detail.sample?.steps?.length}
					<div class="pr-sec"><span>What they did before</span><ol>{#each detail.sample.steps as s, i (i)}<li>{s}</li>{/each}<li class="bad">It broke</li></ol></div>
				{/if}
				{#each detail.notes as n (n.ref)}
					<div class="pr-note"><small>{n.who || 'Signed out'} · {n.device} · ref {n.ref}</small><span>“{n.note}”</span></div>
				{/each}
				{#if !detail.notes.length && detail.events[0]}
					<div class="pr-note"><small>Latest: {detail.events[0].who || 'Signed out'} · {detail.events[0].device} · ref {detail.events[0].ref} · {time(detail.events[0].at)}</small></div>
				{/if}
				<div class="pr-acts">
					{#if detail.status !== 'fixed'}<button class="neo white" onclick={() => set('fixed')} disabled={busy}>Mark fixed</button>{/if}
					{#if detail.status === 'open'}<button class="neo dark" onclick={() => set('ignored')} disabled={busy}>Ignore</button>
					{:else}<button class="neo dark" onclick={() => set('open')} disabled={busy}>Open again</button>{/if}
				</div>
				<small class="pr-foot">You get an email the first time a new problem shows up, and again if a fixed one comes back. Messages, quotes and bank details are never stored with a problem, and who it happened to is forgotten after 30 days.</small>
			{/if}
		</aside>
	</div>
{/if}

<style>
	.pr-kpis { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px; }
	.pr-kpis > div { padding: 10px 16px; border: 1px solid var(--line); background: var(--surface); display: grid; min-width: 120px; }
	.pr-kpis small { font-size: 11.5px; color: var(--ink-3); }
	.pr-kpis b { font-size: 22px; }
	.pr-rel { font-size: 12.5px; color: var(--ink-3); margin-left: auto; }
	.bad { color: var(--bad) !important; }
	.ok { color: var(--ok); }
	.pr-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 16px; }
	.pr-chips i { width: 10px; }
	.pr-chips button { height: 34px; padding: 0 14px; border: 1px solid var(--line-strong); background: none; color: var(--ink-2); font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
	.pr-chips button.on { background: var(--ink); border-color: var(--ink); color: var(--bg); }
	.pr-load { min-height: 200px; display: grid; place-items: center; }
	.pr-grid { display: grid; grid-template-columns: minmax(0, 1fr) 440px; gap: 18px; align-items: start; }
	.pr-list { border: 1px solid var(--line); background: var(--surface); }
	.pr-row { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) 84px 60px 60px 92px; gap: 12px; align-items: center; padding: 13px 16px; border: 0; border-top: 1px solid var(--line); background: none; color: inherit; text-align: left; }
	button.pr-row:hover { background: color-mix(in oklab, var(--surface-2) 60%, transparent); }
	.pr-row.on { background: var(--surface-2); box-shadow: inset 3px 0 0 var(--accent); }
	.pr-head { border-top: 0; font-size: 10.5px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--ink-3); }
	.r { text-align: right; }
	.pr-what { display: grid; gap: 3px; min-width: 0; }
	.pr-what b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.pr-what small, .pr-row > small { font-size: 12px; color: var(--ink-3); overflow-wrap: anywhere; }
	.pr-what em { font-style: normal; font-weight: 700; color: var(--bad); }
	.pr-bars { display: flex; align-items: flex-end; gap: 3px; height: 26px; }
	.pr-bars i { width: 9px; background: var(--ink-3); }
	.pr-bars i.hot { background: var(--accent); }
	.pr-bars i.zero { background: var(--line-strong); }
	.pr-none { padding: 22px 16px; color: var(--ink-3); }
	.pr-pane { position: sticky; top: 84px; display: flex; flex-direction: column; gap: 14px; padding: 20px; border: 1px solid var(--line); background: var(--chrome); min-width: 0; }
	.pr-top { display: grid; gap: 6px; }
	.pr-top small { font-size: 12px; color: var(--ink-3); }
	.pr-top b { font-size: 17px; line-height: 1.3; overflow-wrap: anywhere; }
	.pr-stack { margin: 0; padding: 12px; max-height: 220px; overflow: auto; border: 1px solid var(--line); background: var(--surface); font: 12px/1.6 var(--f-mono); color: var(--ink-2); white-space: pre-wrap; }
	.pr-sec { display: grid; gap: 6px; }
	.pr-sec > span { font-size: 11px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-3); }
	.pr-sec ol { margin: 0; padding-left: 18px; display: grid; gap: 3px; font-size: 13px; color: var(--ink-2); }
	.pr-note { display: grid; gap: 4px; padding: 12px 14px; border: 1px solid var(--line); background: var(--surface); }
	.pr-note small { font-size: 12px; color: var(--ink-3); overflow-wrap: anywhere; }
	.pr-note span { font-size: 13.5px; }
	.pr-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.pr-foot { font-size: 12px; line-height: 1.45; color: var(--ink-3); }
	@media (max-width: 1000px) {
		.pr-grid { grid-template-columns: minmax(0, 1fr); }
		.pr-pane { position: static; }
	}
	@media (max-width: 760px) {
		.pr-head { display: none; }
		.pr-row { grid-template-columns: minmax(0, 1fr) auto; }
		.pr-bars, .pr-row > b[data-l='People'] { display: none; }
		.pr-row > small { grid-column: 1 / -1; }
	}
</style>
