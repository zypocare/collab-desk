<script lang="ts">
	import { onMount } from 'svelte';
	import { backOut, cubicIn } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import Icon from './Icon.svelte';

	// The icon inside a round shortcut: it turns through a few related icons, each ring a beat after the one before,
	// so the row feels alive. Holds still for people who ask for less motion.
	let { icons, i = 0 }: { icons: string[]; i?: number } = $props();

	let n = $state(0);
	onMount(() => {
		if (icons.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let timer: ReturnType<typeof setInterval> | undefined;
		const start = setTimeout(() => {
			n++;
			timer = setInterval(() => n++, 3200);
		}, 1600 + i * 450);
		return () => (clearTimeout(start), clearInterval(timer));
	});
</script>

<span class="ri">
	{#key n}
		<span class="ri-ic" in:fly={{ y: 16, duration: 520, easing: backOut }} out:fly={{ y: -16, duration: 260, easing: cubicIn }}>
			<Icon name={icons[n % icons.length]} />
		</span>
	{/key}
</span>

<style>
	/* Plain boxes, whatever the ring's own span rule says. */
	.ri, .ri-ic { border: 0; background: none; color: inherit; }
	.ri { display: grid; place-items: center; width: 100%; height: 100%; overflow: hidden; border-radius: 50%; }
	.ri-ic { grid-area: 1 / 1; display: grid; place-items: center; width: auto; height: auto; }
</style>
