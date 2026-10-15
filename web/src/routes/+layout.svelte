<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';
	import { auth, initAuth } from '#lib/auth.svelte.ts';
	import { initTheme, ui } from '#lib/ui.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';

	let { children }: LayoutProps = $props();

	onMount(() => {
		initTheme();
		initAuth();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Collab Desk</title>
</svelte:head>

<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="grain" aria-hidden="true"></div>

{#if auth.ready}
	{@render children()}
{:else}
	<div class="loader" aria-label="Loading"><span class="ring"><span></span></span></div>
{/if}

<div class="toasts" aria-live="polite">
	{#each ui.toasts as t (t.id)}
		<div class="toast" class:out={t.out}><span class="ti"><Icon name={t.icon} /></span><span>{t.msg}</span></div>
	{/each}
</div>
<canvas id="confetti" aria-hidden="true"></canvas>
