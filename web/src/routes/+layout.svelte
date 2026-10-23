<script lang="ts">
	import '../app.css';
	import { keepQr, keepReferral } from '#lib/referral.ts';
	import '../brand.css';
	import '../studio.css';
	import '../desk.css';
	import '../pro.css';
	import '../mobile-type.css';
	import '../mobile.css';
	import '../atelier.css';
	import '../dash.css';
	import '../cred.css';
	import '../today.css';
	import type { LayoutProps } from './$types';
	import { onMount } from 'svelte';
	import { afterNavigate, onNavigate } from '$app/navigation';
	import { isIOS } from '#lib/back.ts';
	import { page } from '$app/state';
	import { startReveal } from '#lib/reveal.ts';
	import { auth, initAuth } from '#lib/auth.svelte.ts';
	import { initTheme, ui } from '#lib/ui.svelte.ts';
	import { watchInstall } from '#lib/pwa.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { PHONE_Q, depth } from '#lib/phone.svelte.ts';
	import { initProblems, step } from '#lib/problems.ts';
	import ClosingScreen from '#lib/components/ClosingScreen.svelte';
	import AppIntro from '#lib/components/AppIntro.svelte';

	let { children }: LayoutProps = $props();

	onMount(() => {
		initProblems();
		initTheme();
		initAuth();
		watchInstall();
		startReveal();
		keepReferral(new URL(location.href));
		keepQr(new URL(location.href));
	});
	// Public pages get their own look (brand.css). The creator's studio and a signed-in brand's app share
	// one app look: every app style keys on data-desk, data-side tells the two apart.
	$effect(() => {
		const path = page.url.pathname;
		const el = document.documentElement;
		el.dataset.side = path.startsWith('/studio') ? 'studio' : 'brand';
		const desk = path.startsWith('/studio') ? 'studio' : path.startsWith('/brand') && auth.account?.role === 'brand' ? 'brand' : '';
		if (desk) el.dataset.desk = desk;
		else delete el.dataset.desk;
	});
	// What the person did before a crash: the pages they opened.
	afterNavigate((nav) => step(`Opened ${nav.to?.route.id ?? nav.to?.url.pathname ?? ''}`));
	// An account on its way out (deleted, or closed by Miracle) sees that instead of the app.
	const closing = $derived(
		auth.account?.closing && auth.account.closing.state !== 'paused' && (page.url.pathname.startsWith('/studio') || page.url.pathname.startsWith('/brand')) ? auth.account.closing : null
	);
	// A soft cross-fade between pages where the browser supports it.
	onNavigate((nav) => {
		const d = document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
		// Not on iPhone/iPad: Safari's page transitions can freeze half-way there (things stuck mid-screen, taps ignored).
		if (!d.startViewTransition || isIOS() || !nav.from || !nav.to || nav.from.url.href === nav.to.url.href || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		// On a phone (Studio or brand side): screens opened from a tab slide in from the right and slide back out.
		const inApp = (u: URL) => u.pathname.startsWith('/studio') || u.pathname.startsWith('/brand') || u.pathname === '/' || u.pathname.startsWith('/insights');
		const side = (u: URL) => u.pathname.startsWith('/studio');
		const app = matchMedia(PHONE_Q).matches && inApp(nav.to.url) && inApp(nav.from.url) && side(nav.to.url) === side(nav.from.url);
		if (nav.from.url.pathname === nav.to.url.pathname && !app) return;
		const a = depth(nav.from.url), b = depth(nav.to.url);
		document.documentElement.dataset.nav = !app ? '' : b > a ? 'push' : b < a ? 'pop' : 'tab';
		// A second tap while a slide is running cancels the first navigation and skips its slide: both
		// are normal, so neither may surface as an error.
		return new Promise<void>((resolve) => {
			const vt = d.startViewTransition!(async () => {
				resolve();
				await nav.complete.catch(() => {});
			}) as { ready?: Promise<void>; finished?: Promise<void>; updateCallbackDone?: Promise<void> } | undefined;
			for (const p of [vt?.ready, vt?.finished, vt?.updateCallbackDone]) p?.catch(() => {});
		});
	});
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
</script>

<svelte:head>
	<title>Miracle</title>
</svelte:head>

<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="grain" aria-hidden="true"></div>

{#if auth.ready && closing}
	<ClosingScreen {closing} />
{:else if auth.ready}
	{@render children()}
{:else}
	<div class="loader" aria-label="Loading"><span class="ring"><span></span></span></div>
{/if}

<div class="toasts" aria-live="polite">
	{#each ui.toasts as t (t.id)}
		<div class="toast" class:out={t.out} class:bad={t.icon === 'alert'} role={t.icon === 'alert' ? 'alert' : 'status'}><span class="ti"><Icon name={t.icon} /></span><span class="toast-msg">{t.msg}</span><i class="tbar" aria-hidden="true"></i></div>
	{/each}
</div>
<ConfirmDialog />
<AppIntro />
<canvas id="confetti" aria-hidden="true"></canvas>
