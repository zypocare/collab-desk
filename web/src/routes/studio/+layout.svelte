<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import type { LayoutProps } from './$types';
	import { auth, signOut } from '#lib/auth.svelte.ts';
	import { loadStudio, studio, stopWatching, watchStudio } from '#lib/studio.svelte.ts';
	import { theme, toggleTheme, ui } from '#lib/ui.svelte.ts';
	import { initials } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import CollabDrawer from '#lib/components/CollabDrawer.svelte';
	import NewCollabDialog from '#lib/components/NewCollabDialog.svelte';

	let { children }: LayoutProps = $props();

	const NAV = [
		{ href: '/studio', label: 'Today', icon: 'home' },
		{ href: '/studio/collabs', label: 'Collabs', icon: 'board' },
		{ href: '/studio/calendar', label: 'Calendar', icon: 'cal' },
		{ href: '/studio/payments', label: 'Payments', icon: 'wallet' },
		{ href: '/studio/brands', label: 'Brands', icon: 'users' },
		{ href: '/studio/reports', label: 'Reports', icon: 'chart' },
		{ href: '/studio/settings', label: 'My page', icon: 'link' }
	];
	const current = $derived(
		NAV.slice()
			.reverse()
			.find((n) => (n.href === '/studio' ? page.url.pathname === '/studio' : page.url.pathname.startsWith(n.href)))?.href
	);
	const newCount = $derived(studio.collabs.filter((c) => c.stage === 'request').length);
	const allowed = $derived(auth.account?.role === 'creator');

	// Only the creator may be here.
	$effect(() => {
		if (!auth.session) goto(`/login?next=${encodeURIComponent(page.url.pathname)}`, { replaceState: true });
		else if (auth.account && auth.account.role !== 'creator') goto('/brand', { replaceState: true });
	});

	onMount(() => {
		if (auth.account?.role === 'creator') {
			loadStudio();
			watchStudio();
		}
		return stopWatching;
	});

	// Sliding highlight behind the current nav item.
	let navs = $state<HTMLElement>();
	let ind = $state<HTMLElement>();
	let indReady = false;
	function moveInd() {
		const b = navs?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!b || !ind || !b.offsetWidth) return;
		if (!indReady) ind.style.transition = 'none';
		ind.style.width = b.offsetWidth + 'px';
		ind.style.height = b.offsetHeight + 'px';
		ind.style.transform = `translate(${b.offsetLeft}px,${b.offsetTop}px)`;
		if (!indReady) {
			void ind.offsetWidth;
			ind.style.transition = '';
			indReady = true;
		}
	}
	$effect(() => {
		void current;
		void studio.loaded;
		tick().then(moveInd);
	});
	onMount(() => {
		addEventListener('resize', moveInd);
		document.fonts?.ready.then(moveInd);
		return () => removeEventListener('resize', moveInd);
	});

	async function logout() {
		await signOut();
		goto('/login', { replaceState: true });
	}
</script>

{#if allowed}
	<div class="app">
		<nav class="rail" aria-label="Main">
			<div class="logo">
				<svg viewBox="0 0 32 32" aria-hidden="true"
					><defs
						><linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1"
							><stop offset="0" style="stop-color:var(--g1)" /><stop offset=".55" style="stop-color:var(--g2)" /><stop
								offset="1"
								style="stop-color:var(--g3)"
							/></linearGradient
						></defs
					><circle cx="12" cy="16" r="8.5" fill="none" stroke="var(--ink)" stroke-width="2.6" /><circle
						cx="20"
						cy="16"
						r="8.5"
						fill="none"
						stroke="url(#logoGrad)"
						stroke-width="2.6"
					/></svg
				><b>{studio.settings?.app_name ?? 'Collab Desk'}</b>
			</div>
			<div class="navs" bind:this={navs}>
				<span class="nav-ind" bind:this={ind}></span>
				{#each NAV as n (n.href)}
					<a class="nav" href={n.href} aria-current={current === n.href ? 'page' : undefined}
						><Icon name={n.icon} /><span>{n.label}</span>{#if n.href === '/studio/collabs' && newCount}<span class="badge" aria-label="{newCount} new"
								>{newCount}</span
							>{/if}</a
					>
				{/each}
			</div>
			<div class="spacer"></div>
			<div class="rail-foot">
				<div class="rail-tools">
					<button class="theme-btn" onclick={toggleTheme} aria-label="Switch light or dark mode"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></button>
					<button class="btn sm ghost" onclick={logout}><Icon name="logout" />Sign out</button>
				</div>
				<div class="me">
					<span class="ring"><span>{initials(studio.settings?.display_name ?? '')}</span></span>
					<div><b>{studio.settings?.display_name ?? ''}</b><small>@{studio.settings?.handle ?? ''}</small></div>
				</div>
			</div>
		</nav>
		<main class="main">
			{#if studio.error}
				<div class="err-box">Couldn't load your data: {studio.error}</div>
			{/if}
			{#if studio.loaded}
				{@render children()}
			{:else if !studio.error}
				<div class="loader" style="min-height:60vh"><span class="ring"><span></span></span></div>
			{/if}
		</main>
		<button class="fab" onclick={() => (ui.newCollab = true)} aria-label="Add collab"><Icon name="plus" /></button>
	</div>
	<CollabDrawer />
	{#if ui.newCollab}<NewCollabDialog />{/if}
{/if}
