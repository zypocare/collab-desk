<script lang="ts">
	import { onMount } from 'svelte';
	import { backOut, cubicIn } from 'svelte/easing';
	import { fly } from 'svelte/transition';

	// A line that turns through a few short facts, like RingIcons does with icons: each one slides up into place,
	// a beat after the one before it (i), so a row of cards doesn't change all at once. Still for less motion.
	let { items, i = 0 }: { items: string[]; i?: number } = $props();

	let n = $state(0);
	onMount(() => {
		if (items.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let timer: ReturnType<typeof setInterval> | undefined;
		const start = setTimeout(() => {
			n++;
			timer = setInterval(() => n++, 3600);
		}, 2200 + i * 600);
		return () => (clearTimeout(start), clearInterval(timer));
	});
</script>

<span class="cy">
	{#key n}
		<span class="cy-t" in:fly={{ y: 12, duration: 480, easing: backOut }} out:fly={{ y: -12, duration: 240, easing: cubicIn }}>{items[n % items.length] ?? ''}</span>
	{/key}
</span>

<style>
	.cy { display: grid; overflow: hidden; }
	.cy-t { grid-area: 1 / 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
