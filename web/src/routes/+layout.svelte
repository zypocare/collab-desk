<script lang="ts">
	import '../app.css';
	import '../brand.css';
	import '../studio.css';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { startReveal } from '#lib/reveal.ts';
	import { auth, initAuth } from '#lib/auth.svelte.ts';
	import { initTheme, ui } from '#lib/ui.svelte.ts';
	import { watchInstall } from '#lib/pwa.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';

	let { children }: LayoutProps = $props();

	onMount(() => {
		initTheme();
		initAuth();
		watchInstall();
		startReveal();
	});
	// Brand pages get their own look (brand.css); the studio keeps its own.
	$effect(() => {
		document.documentElement.dataset.side = page.url.pathname.startsWith('/studio') ? 'studio' : 'brand';
	});
	// A soft cross-fade between pages where the browser supports it.
	onNavigate((nav) => {
		const d = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
		if (!d.startViewTransition || nav.from?.url.pathname === nav.to?.url.pathname || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise<void>((resolve) => {
			d.startViewTransition!(async () => {
				resolve();
				await nav.complete;
			});
		});
	});
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
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
<ConfirmDialog />
<canvas id="confetti" aria-hidden="true"></canvas>
