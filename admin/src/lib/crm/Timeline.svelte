<script lang="ts">
	import { when } from '../format.ts';

	export type Event = { at: string; kind: string; title: string; text?: string | null; href?: string | null };

	// Everything that happened to a record, newest first, with a filter per kind of event.
	let { events, kinds }: { events: Event[]; kinds: Record<string, { label: string; color: string }> } = $props();
	let only = $state('');
	const list = $derived(only ? events.filter((e) => e.kind === only) : events);
	const present = $derived(Object.keys(kinds).filter((k) => events.some((e) => e.kind === k)));
</script>

<section class="card">
	<div class="card-h">
		<h2 class="card-t">Timeline</h2>
		<div class="tl-f" role="group" aria-label="Show">
			<button class:on={!only} onclick={() => (only = '')}>All</button>
			{#each present as k (k)}<button class:on={only === k} onclick={() => (only = k)}>{kinds[k].label}</button>{/each}
		</div>
	</div>
	{#if !list.length}
		<div class="card-empty">Nothing yet.</div>
	{:else}
		<ol class="tl">
			{#each list as e, i (i)}
				<li>
					<span class="mono muted">{when(e.at)}</span>
					<span class="dot" style:background={kinds[e.kind]?.color ?? '#6b6570'}></span>
					<span class="txt">{#if e.href}<a href={e.href}>{e.title}</a>{:else}<b>{e.title}</b>{/if}{#if e.text} <span class="muted">{e.text}</span>{/if}</span>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.tl-f { display: flex; flex-wrap: wrap; gap: 4px; }
	.tl-f button { height: 24px; padding: 0 9px; border-radius: 5px; border: 0; background: var(--mute-bg); color: var(--ink-2); font-size: 12px; font-weight: 500; }
	.tl-f button.on { background: var(--accent-soft); color: var(--accent-2); }
	.tl { list-style: none; margin: 0; padding: 6px 16px 12px; max-height: 640px; overflow: auto; }
	.tl li { display: grid; grid-template-columns: 100px 12px 1fr; gap: 10px; padding: 8px 0; font-size: 13px; align-items: start; }
	.tl .mono { font-size: 11.5px; padding-top: 1px; }
	.dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 4px; }
	.txt { overflow-wrap: anywhere; }
	.txt b { font-weight: 500; }
	@media (max-width: 560px) { .tl li { grid-template-columns: 12px 1fr; } .tl .mono { grid-column: 2; order: 3; } }
</style>
