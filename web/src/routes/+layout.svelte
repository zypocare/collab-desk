<script lang="ts">
	import '../app.css';
	import { keepReferral } from '#lib/referral.ts';
	import '../brand.css';
	import '../studio.css';
	import '../desk.css';
	import '../mobile-type.css';
	import '../mobile.css';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { startReveal } from '#lib/reveal.ts';
	import { auth, initAuth } from '#lib/auth.svelte.ts';
	import { initTheme, ui } from '#lib/ui.svelte.ts';
	import { watchInstall } from '#lib/pwa.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { PHONE_Q, depth } from '#lib/phone.svelte.ts';

	let { children }: LayoutProps = $props();

	onMount(() => {
		initTheme();
		initAuth();
		watchInstall();
		startReveal();
		keepReferral(new URL(location.href));
	});
	// Brand pages get their own look (brand.css); the studio keeps its own.
	$effect(() => {
		document.documentElement.dataset.side = page.url.pathname.startsWith('/studio') ? 'studio' : 'brand';
	});
	// A soft cross-fade between pages where the browser supports it.
	onNavigate((nav) => {
		const d = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
		if (!d.startViewTransition || !nav.from || !nav.to || nav.from.url.href === nav.to.url.href || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		// On a phone (Studio or brand side): screens opened from a tab slide in from the right and slide back out.
		const inApp = (u: URL) => u.pathname.startsWith('/studio') || u.pathname.startsWith('/brand') || u.pathname === '/' || u.pathname.startsWith('/insights');
		const side = (u: URL) => u.pathname.startsWith('/studio');
		const app = matchMedia(PHONE_Q).matches && inApp(nav.to.url) && inApp(nav.from.url) && side(nav.to.url) === side(nav.from.url);
		if (nav.from.url.pathname === nav.to.url.pathname && !app) return;
		const a = depth(nav.from.url), b = depth(nav.to.url);
		document.documentElement.dataset.nav = !app ? '' : b > a ? 'push' : b < a ? 'pop' : 'tab';
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
