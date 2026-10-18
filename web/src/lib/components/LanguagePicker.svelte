<script lang="ts">
	import { langLabel } from '../languages';
	import Icon from './Icon.svelte';

	// Pick one or more languages (chips). Several together mean mixed-language content.
	let {
		options,
		value = [],
		onchange,
		label
	}: { options: readonly string[]; value?: string[]; onchange: (v: string[]) => void; label: string } = $props();

	function toggle(l: string) {
		const next = value.includes(l) ? value.filter((x) => x !== l) : [...value, l];
		// Keep the order of the options, so "English + Kannada" always reads the same way.
		onchange(options.filter((o) => next.includes(o)));
	}
</script>

<div class="lang-pick" role="group" aria-label={label}>
	{#each options as l (l)}
		<button type="button" class="lang-chip" class:on={value.includes(l)} aria-pressed={value.includes(l)} onclick={() => toggle(l)}>
			{#if value.includes(l)}<Icon name="check" />{/if}{langLabel(l)}
		</button>
	{/each}
</div>
