<script lang="ts">
	import '../app.css';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';
	import { auth, initAuth } from '#lib/auth.svelte.ts';
	import { initTheme, ui } from '#lib/ui.svelte.ts';
	import { watchInstall } from '#lib/pwa.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';

	let { children }: LayoutProps = $props();

	onMount(() => {
		initTheme();
		initAuth();
		watchInstall();
	});
</script>

<svelte:head>
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
