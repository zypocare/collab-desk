<script lang="ts" generics="T extends string">
	import { onMount, tick } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		options,
		value = $bindable(),
		variant = 'pills',
		label,
		onchange
	}: {
		options: { value: T; label: string; icon?: string }[];
		value: T;
		variant?: 'pills' | 'btabs';
		label: string;
		onchange?: (v: T) => void;
	} = $props();

	let group: HTMLElement;
	let thumb: HTMLElement;
	let ready = false;

	function place() {
		const b = group?.querySelector<HTMLElement>(':scope > [aria-pressed="true"]');
		if (!b || !thumb || !b.offsetWidth) return;
		if (!ready) thumb.style.transition = 'none';
		thumb.style.width = b.offsetWidth + 'px';
		thumb.style.height = b.offsetHeight + 'px';
		thumb.style.transform = `translate(${b.offsetLeft}px,${b.offsetTop}px)`;
		if (!ready) {
			void thumb.offsetWidth;
			thumb.style.transition = '';
			ready = true;
		}
	}

	$effect(() => {
		void value;
		tick().then(place);
	});

	onMount(() => {
		const ro = new ResizeObserver(place);
		ro.observe(group);
		document.fonts?.ready.then(place);
		return () => ro.disconnect();
	});
</script>

<div class="{variant} thumbed" role="group" aria-label={label} bind:this={group}>
	<span class="thumb" bind:this={thumb}></span>
	{#each options as o (o.value)}
		<button
			type="button"
			aria-pressed={value === o.value}
			onclick={() => {
				value = o.value;
				onchange?.(o.value);
			}}>{#if o.icon}<Icon name={o.icon} />{/if}{o.label}</button
		>
	{/each}
</div>
