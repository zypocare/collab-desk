<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick, untrack } from 'svelte';
	import type { LayoutProps } from './$types';
	import { auth, signOut } from '#lib/auth.svelte.ts';
	import { byId, loadStudio, studio, stopWatching, watchStudio } from '#lib/studio.svelte.ts';
	import { theme, toggleTheme, ui } from '#lib/ui.svelte.ts';
	import { inrS, iso, today } from '#lib/util.ts';
	import { cascade, magnetic } from '#lib/motion.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import NewCollabDialog from '#lib/components/NewCollabDialog.svelte';
	import CommandPalette from '#lib/components/CommandPalette.svelte';

	let palette = $state<CommandPalette>();

	let { children }: LayoutProps = $props();

	// Five places, related pages paired as tabs inside them.
	type Tab = { href: string; label: string };
	const NAV: { href: string; label: string; short?: string; icon: string; tabs?: Tab[]; also?: string[] }[] = [
		{ href: '/studio', label: 'Today', icon: 'home' },
		{ href: '/studio/collabs', label: 'Collabs', icon: 'board', tabs: [{ href: '/studio/collabs', label: 'Board' }, { href: '/studio/brands', label: 'Brands' }], also: ['/studio/c/', '/studio/import'] },
		{ href: '/studio/content', label: 'Plan', icon: 'cal', tabs: [{ href: '/studio/content', label: 'Content' }, { href: '/studio/calendar', label: 'Calendar' }] },
		{ href: '/studio/payments', label: 'Money', icon: 'wallet', tabs: [{ href: '/studio/payments', label: 'Payments' }, { href: '/studio/reports', label: 'Reports' }] },
		{ href: '/studio/settings', label: 'My page', short: 'Page', icon: 'link' }
	];
	const path = $derived(page.url.pathname);
	const group = $derived(
		NAV.find((n) => (n.href === '/studio' ? path === '/studio' : [n.href, ...(n.tabs ?? []).map((t) => t.href), ...(n.also ?? [])].some((h) => path.startsWith(h))))
	);
	const current = $derived(group?.href);
	// Tabs show on the paired pages themselves (not on a single collab's page).
	const tabs = $derived(group?.tabs && group.tabs.some((t) => path === t.href) ? group.tabs : null);
	const newCount = $derived(studio.collabs.filter((c) => c.stage === 'request').length);
	const allowed = $derived(auth.account?.role === 'creator');

	// Opening a collab from anywhere (cards, Today, calendar, search, email links) goes to its own page.
	$effect(() => {
		const id = ui.openCollab;
		if (!id) return;
		untrack(() => {
			const c = byId(id);
			if (c && page.url.pathname !== `/studio/c/${c.code}`) goto(`/studio/c/${c.code}`);
		});
	});

	// Only the creator may be here.
	$effect(() => {
		if (!auth.session) goto(`/login?next=${encodeURIComponent(page.url.pathname + page.url.search)}`, { replace: true });
		else if (auth.account && auth.account.role !== 'creator') goto('/brand', { replace: true });
	});

	onMount(() => {
		if (auth.account?.role === 'creator') {
			loadStudio();
			watchStudio();
		}
		return stopWatching;
	});

	// This month's money against her goal, shown at the bottom of the sidebar.
	const monthKey = iso(today()).slice(0, 7);
	const monthName = today().toLocaleDateString('en-IN', { month: 'long' });
	const received = $derived(studio.collabs.filter((c) => c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(monthKey)).reduce((a, c) => a + c.pay_received, 0));
	const goal = $derived(studio.settings?.monthly_goal || 0);
	const pct = $derived(goal ? Math.min(1, received / goal) : 0);

	// Sliding highlight behind the current item (sidebar and page tabs).
	let navs = $state<HTMLElement>();
	let ind = $state<HTMLElement>();
	let subs = $state<HTMLElement>();
	let subInd = $state<HTMLElement>();
	const ready = new WeakSet<HTMLElement>();
	function slide(host: HTMLElement | undefined, el: HTMLElement | undefined) {
		const b = host?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!b || !el || !b.offsetWidth) return;
		const first = !ready.has(el);
		if (first) el.style.transition = 'none';
		el.style.width = b.offsetWidth + 'px';
		el.style.height = b.offsetHeight + 'px';
		el.style.transform = `translate(${b.offsetLeft}px,${b.offsetTop}px)`;
		el.style.opacity = '1';
		if (first) {
			void el.offsetWidth;
			el.style.transition = '';
			ready.add(el);
		}
	}
	const moveInd = () => {
		slide(navs, ind);
		slide(subs, subInd);
	};
	$effect(() => {
		void current;
		void path;
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
		goto('/login', { replace: true });
	}
</script>

{#if allowed}
	<div class="app">
		<nav class="rail" aria-label="Main">
			<div class="logo">
				<span class="logo-mark"
					><svg viewBox="0 0 32 32" aria-hidden="true"
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
					></span
				>
				<div class="logo-t"><b>{studio.settings?.app_name ?? 'Collab Desk'}</b><small>Creator studio</small></div>
			</div>
			<div class="rail-lbl">Workspace</div>
			<div class="navs" bind:this={navs} use:cascade={{ selector: '.nav', delay: 0.1, gap: 0.06 }}>
				<span class="nav-ind" bind:this={ind}></span>
				{#each NAV as n (n.href)}
					<a class="nav" href={n.href} aria-current={current === n.href ? 'page' : undefined}
						><span class="nav-ic"><Icon name={n.icon} /></span><span class="nav-t" class:nav-long={!!n.short}>{n.label}</span>{#if n.short}<span class="nav-short" aria-hidden="true">{n.short}</span>{/if}{#if n.href === '/studio/collabs' && newCount}<span class="badge" aria-label="{newCount} new"
								>{newCount}</span
							>{/if}</a
					>
				{/each}
			</div>
			<div class="spacer"></div>
			{#if goal}
				<a class="goal-mini" href="/studio/payments" aria-label="{monthName} goal: {Math.round(pct * 100)} percent">
					<div class="gm-top"><span>{monthName} goal</span><b>{Math.round(pct * 100)}%</b></div>
					<div class="gm-bar"><i style="--p:{pct}"></i></div>
					<small>{inrS(received)} <span>of {inrS(goal)}</span></small>
				</a>
			{/if}
			<div class="rail-foot">
				<div class="me">
					<Avatar name={studio.settings?.display_name ?? ''} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} />
					<div><b>{studio.settings?.display_name ?? ''}</b><small>{studio.me?.team_role === 'manager' ? `You: ${studio.me.name || studio.me.email} · manager` : `@${studio.settings?.handle ?? ''}`}</small></div>
					<div class="rail-tools">
						<button class="theme-btn" onclick={toggleTheme} aria-label="Switch light or dark mode" title="Light / dark"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} />{theme.value === 'dark' ? 'Light' : 'Dark'}</button>
						<button class="theme-btn" onclick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" />Sign out</button>
					</div>
				</div>
			</div>
		</nav>
		<main class="main">
			<div class="sx-top">
				{#if tabs}
					<nav class="subtabs" aria-label="{group?.label} pages" bind:this={subs}>
						<span class="sub-ind" bind:this={subInd}></span>
						{#each tabs as t (t.href)}<a href={t.href} aria-current={path === t.href ? 'page' : undefined}>{t.label}</a>{/each}
					</nav>
				{:else if path.startsWith('/studio/c/')}
					<a class="crumb crumb-back" href="/studio/collabs"><Icon name="back" />Collabs</a>
				{:else}
					<div class="crumb">{#if group}<Icon name={group.icon} />{group.label}{/if}</div>
				{/if}
				<div class="tb-r">
					<button class="tb-search" onclick={() => palette?.show()} aria-label="Search and actions"><Icon name="search" /><span>Search brands, collabs, actions</span><kbd>Ctrl K</kbd></button>
					<button class="btn grad tb-new" use:magnetic onclick={() => (ui.newCollab = true)}><Icon name="plus" />New collab</button>
				</div>
			</div>
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
	<CommandPalette bind:this={palette} />
	{#if ui.newCollab}<NewCollabDialog />{/if}
{/if}
