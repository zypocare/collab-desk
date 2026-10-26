<script lang="ts">
	import type { Snippet } from 'svelte';
	import { initials } from '../format.ts';

	// The top of every record page: where you came from, who it is, what you can do, and its tabs.
	let {
		crumb,
		title,
		square = false,
		color = '#5b34c4',
		tags,
		sub,
		actions,
		tabs = [],
		tab = $bindable('')
	}: {
		crumb: { label: string; href: string };
		title: string;
		square?: boolean;
		color?: string;
		tags?: Snippet;
		sub?: Snippet;
		actions?: Snippet;
		tabs?: { id: string; label: string; n?: number | string | null }[];
		tab?: string;
	} = $props();
</script>

<header class="rh">
	<nav class="crumb" aria-label="Breadcrumb"><a href={crumb.href}>{crumb.label}</a> <span class="muted">/ {title}</span></nav>
	<div class="rh-row">
		<div class="who">
			<span class="av" class:sq={square} style:background={color}>{initials(title)}</span>
			<div class="who-t">
				<div class="t-line"><h1>{title}</h1>{@render tags?.()}</div>
				{#if sub}<div class="sub">{@render sub()}</div>{/if}
			</div>
		</div>
		{#if actions}<div class="acts">{@render actions()}</div>{/if}
	</div>
	{#if tabs.length}
		<div class="tabs" role="tablist">
			{#each tabs as t (t.id)}
				<button role="tab" aria-selected={tab === t.id} class:on={tab === t.id} onclick={() => (tab = t.id)}>{t.label}{#if t.n !== undefined && t.n !== null && t.n !== ''} <span class="mono muted">{t.n}</span>{/if}</button>
			{/each}
		</div>
	{/if}
</header>

<style>
	.rh { background: var(--surface); border-bottom: 1px solid var(--line); padding: 18px var(--gut) 16px; margin: -26px calc(-1 * var(--gut)) 0; }
	.crumb { font-size: 12.5px; margin-bottom: 12px; }
	.rh-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between; padding-bottom: 14px; }
	.who { display: flex; gap: 14px; align-items: center; min-width: 0; }
	.av { width: 60px; height: 60px; border-radius: 50%; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 20px; flex: none; }
	.av.sq { border-radius: 14px; }
	.who-t { min-width: 0; }
	.t-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	h1 { font-size: 23px; font-weight: 800; letter-spacing: -.02em; overflow-wrap: anywhere; }
	.sub { margin-top: 3px; font-size: 13px; color: var(--ink-3); display: flex; flex-wrap: wrap; gap: 4px 14px; }
	.acts { display: flex; flex-wrap: wrap; gap: 8px; }
	.tabs { display: flex; flex-wrap: wrap; gap: 8px; }
	.tabs button { height: 36px; padding: 0 14px; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); color: var(--ink-2); font-weight: 600; font-size: 13px; white-space: nowrap; }
	.tabs button:hover { border-color: var(--line-strong); }
	.tabs button.on { background: var(--ink); border-color: var(--ink); color: #fff; }
	.tabs button.on .mono { color: #d9cfd8; }
	.tabs .mono { font-size: 11.5px; margin-left: 3px; }
</style>
