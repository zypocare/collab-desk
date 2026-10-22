<script lang="ts">
	import { call, type CalEvent } from '#lib/business.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage, firstName, fmt, iso, today } from '#lib/util.ts';

	// Calendar: every creator's go-live, draft and shoot days in one month, with a warning when posts bunch up.
	const t = today();
	let month = $state(new Date(t.getFullYear(), t.getMonth(), 1));
	let events = $state<CalEvent[] | null>(null);
	const first = $derived(month);
	const last = $derived(new Date(month.getFullYear(), month.getMonth() + 1, 0));
	$effect(() => {
		const from = iso(first),
			to = iso(last);
		events = null;
		call<CalEvent[]>('brand_calendar', { p_from: from, p_to: to })
			.then((e) => (events = e))
			.catch((e) => {
				events = [];
				toast(errMessage(e), 'alert');
			});
	});
	const move = (n: number) => (month = new Date(month.getFullYear(), month.getMonth() + n, 1));
	const lead = $derived((first.getDay() + 6) % 7);
	const days = $derived(Array.from({ length: last.getDate() }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1))));
	const byDay = $derived.by(() => {
		const m: Record<string, CalEvent[]> = {};
		for (const e of events ?? []) m[e.date] = [...(m[e.date] ?? []), e];
		return m;
	});
	const lives = (d: string) => (byDay[d] ?? []).filter((e) => e.kind === 'live').length;
	const clashes = $derived(days.filter((d) => lives(d) > 1));
	// One colour per creator, in the order they first appear this month.
	const TONES = ['g2', 'g1', 'g3', 'ok'];
	const tone = $derived.by(() => {
		const m: Record<number, string> = {};
		for (const e of events ?? []) if (e.kind !== 'draft' && !(e.creator_id in m)) m[e.creator_id] = TONES[Object.keys(m).length % TONES.length];
		return m;
	});
	const label = (e: CalEvent) => `${firstName(e.creator)} · ${e.kind === 'live' ? 'goes live' : e.kind === 'draft' ? 'draft due' : 'shoot'}`;
	const at = (e: CalEvent) => (e.slug === pageSlug ? `/brand/r/${e.code}` : addressFor(e.slug, `/brand/r/${e.code}`));
	const todayIso = iso(t);
</script>

<svelte:head><title>Calendar · Miracle</title></svelte:head>

<div class="cal-bar">
	<button class="cal-nav" aria-label="Previous month" onclick={() => move(-1)}>‹</button>
	<h2>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
	<button class="cal-nav" aria-label="Next month" onclick={() => move(1)}>›</button>
	<span class="cal-sp"></span>
	{#if clashes.length}
		<span class="cal-warn">{lives(clashes[0])} posts go live on {fmt(clashes[0])}{clashes.length > 1 ? ` (and ${clashes.length - 1} more day${clashes.length > 2 ? 's' : ''})` : ''}. Spread them out?</span>
	{/if}
</div>

<div class="cal-wd" aria-hidden="true"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
<div class="cal-grid" class:loading={!events}>
	{#each Array(lead) as _, i (i)}<div class="cal-d off"></div>{/each}
	{#each days as d (d)}
		<div class="cal-d" class:clash={lives(d) > 1} class:now={d === todayIso}>
			<span class="cal-n">{Number(d.slice(8))}</span>
			{#each byDay[d] ?? [] as e (e.kind + e.code)}
				<a class="cal-e {e.kind === 'draft' ? 'teal' : tone[e.creator_id]}" href={at(e)} title={label(e)}>{label(e)}</a>
			{/each}
		</div>
	{/each}
</div>
{#if events?.length}
	<ul class="cal-list">
		{#each events as e (e.kind + e.code)}<li><span class="cal-e {e.kind === 'draft' ? 'teal' : tone[e.creator_id]}"></span><b>{fmt(e.date)}</b><a href={at(e)}>{label(e)}</a></li>{/each}
	</ul>
{/if}
<div class="cal-key"><span>Coloured by creator: go-live and shoot days</span><span>Teal: draft due</span><span>Amber outline: more than one post the same day</span></div>

<style>
	.cal-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 14px;
		margin-bottom: 16px;
	}
	.cal-bar h2 {
		margin: 0;
		min-width: 200px;
		text-align: center;
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 30px;
	}
	.cal-nav {
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 10px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		font-size: 18px;
		cursor: pointer;
	}
	.cal-sp {
		flex: 1;
	}
	.cal-warn {
		padding: 9px 14px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--g3) 14%, transparent);
		color: var(--g3);
		font-size: 13.5px;
		font-weight: 600;
	}
	.cal-wd,
	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
	}
	.cal-wd {
		margin-bottom: 8px;
		font-size: 12px;
		color: var(--ink-3);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.cal-grid {
		grid-auto-rows: minmax(118px, auto);
		transition: opacity 0.2s;
	}
	.cal-grid.loading {
		opacity: 0.5;
	}
	.cal-d {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
		padding: 8px;
		border-radius: 12px;
		background: var(--surface);
		font-size: 13px;
	}
	.cal-d.off {
		background: color-mix(in oklab, var(--surface) 50%, transparent);
		opacity: 0.5;
	}
	.cal-d.clash {
		box-shadow: inset 0 0 0 1.5px var(--g3);
	}
	.cal-d.now .cal-n {
		color: var(--g2);
		font-weight: 700;
	}
	.cal-e {
		display: block;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 11.5px;
		padding: 4px 7px;
		border-radius: 7px;
		color: var(--ink);
		text-decoration: none;
		background: color-mix(in oklab, var(--ink) 10%, transparent);
	}
	.cal-e.g1 {
		background: color-mix(in oklab, var(--g1) 20%, transparent);
	}
	.cal-e.g2 {
		background: color-mix(in oklab, var(--g2) 18%, transparent);
	}
	.cal-e.g3 {
		background: color-mix(in oklab, var(--g3) 18%, transparent);
	}
	.cal-e.ok {
		background: color-mix(in oklab, var(--ok) 18%, transparent);
	}
	.cal-e.teal {
		background: color-mix(in oklab, #4ccfc2 18%, transparent);
	}
	.cal-key {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		margin-top: 14px;
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.cal-list {
		display: none;
	}
	@media (max-width: 700px) {
		.cal-list {
			display: grid;
			gap: 0;
			margin: 14px 0 0;
			padding: 0;
			list-style: none;
		}
		.cal-list li {
			display: grid;
			grid-template-columns: 6px 64px 1fr;
			align-items: center;
			gap: 12px;
			padding: 12px 0;
			border-bottom: 1px solid var(--line);
			font-size: 14px;
		}
		.cal-list li .cal-e {
			height: 22px;
		}
		.cal-list li a:last-child {
			color: var(--ink);
			text-decoration: none;
		}
		.cal-bar h2 {
			min-width: 0;
			font-size: 24px;
		}
		.cal-wd,
		.cal-grid {
			gap: 3px;
		}
		.cal-wd {
			font-size: 10px;
			letter-spacing: 0.04em;
		}
		.cal-grid {
			grid-auto-rows: minmax(64px, auto);
		}
		.cal-d {
			padding: 4px;
			border-radius: 8px;
			font-size: 11.5px;
		}
		.cal-e {
			font-size: 0;
			height: 6px;
			padding: 0;
			border-radius: 3px;
		}
		.cal-e.g1 {
			background: var(--g1);
		}
		.cal-e.g2 {
			background: var(--g2);
		}
		.cal-e.g3 {
			background: var(--g3);
		}
		.cal-e.ok {
			background: var(--ok);
		}
		.cal-e.teal {
			background: #4ccfc2;
		}
	}
</style>
