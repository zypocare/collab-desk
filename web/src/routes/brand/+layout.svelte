<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import type { LayoutProps } from './$types';
	import { auth } from '#lib/auth.svelte.ts';
	import { ui } from '#lib/ui.svelte.ts';
	import { brandData, loadRequests } from '#lib/brand.svelte.ts';
	import { brandGroups, deskTabs, groupOf, tabOn } from '#lib/brandNav.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { brandIg } from '#lib/brandIg.svelte.ts';
	import { joinTeam } from '#lib/business.svelte.ts';
	import { appAddress, isAppHost } from '#lib/creatorHost.ts';
	import { loadPublicPage, pub } from '#lib/publicPage.svelte.ts';
	import BrandTopbar from '#lib/components/BrandTopbar.svelte';
	import BrandFooter from '#lib/components/BrandFooter.svelte';
	import BrandSide from '#lib/components/BrandSide.svelte';
	import { loadBrandIg } from '#lib/brandIg.svelte.ts';
	import { PHONE_Q, phone } from '#lib/phone.svelte.ts';

	let { children }: LayoutProps = $props();
	// Anyone can start a request (they confirm their email when sending); everything else needs sign-in.
	const guestOk = $derived(!auth.session && page.url.pathname === '/brand/new');
	// While a guest's code is being confirmed they are signed in before the app knows they're a brand;
	// keep the form on screen through that moment so their request isn't lost.
	const confirming = $derived(!!auth.session && !auth.account && page.url.pathname === '/brand/new');
	const allowed = $derived((!!auth.session && auth.account?.role === 'brand') || guestOk || confirming);

	// Brands only. The creator has her own studio.
	$effect(() => {
		if (!auth.session && page.url.pathname !== '/brand/new') goto(`/login?next=${encodeURIComponent(page.url.pathname + page.url.search)}`, { replaceState: true });
		else if (auth.account?.role === 'creator' && !ui.holdRedirect) goto('/studio', { replaceState: true });
		// Waiting to be approved as a creator: her request's status is on /join.
		else if (auth.account?.role === 'pending' && !ui.holdRedirect) location.replace(appAddress('/signup'));
	});

	// Miracle's own address has no creator: a brand that hasn't signed up finishes sign-up first, and
	// requests (which belong to a creator's address) are reached from the dashboard instead.
	const onApp = isAppHost(location.hostname);
	$effect(() => {
		if (!onApp) return;
		const a = auth.account;
		const path = page.url.pathname;
		if (a?.role === 'brand' && !(a.profile || a.brand || a.companies?.length || a.creators?.length)) goto('/signup?as=brand', { replaceState: true });
		else if (path === '/brand/new') goto('/brand/creators?tab=discover', { replaceState: true });
		else if (path === '/brand/requests') goto('/brand', { replaceState: true });
	});

	// Invited to a company's team: join it on the first visit after signing in.
	$effect(() => {
		if (auth.account?.role === 'brand') joinTeam();
	});

	onMount(() => {
		if (!pub.data) loadPublicPage();
		if (auth.account?.role === 'brand') loadRequests();
	});
	$effect(() => {
		if (auth.account?.role === 'brand') loadBrandIg();
	});
	// Signed in, a brand gets the creator studio's frame, piece for piece: the bottom bar on a phone,
	// the side menu on a laptop, the section's pages as tabs. Signed-out visitors keep the simple bar.
	// The phone bar starts the phone behaviours, but the width is watched here too (it isn't always shown).
	const mq = matchMedia(PHONE_Q);
	phone.on = mq.matches;
	onMount(() => {
		const on = () => (phone.on = mq.matches);
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});
	const app = $derived(auth.account?.role === 'brand');
	const path = $derived(page.url.pathname);
	const groups = brandGroups(onApp);
	const group = $derived(groupOf(groups, path));
	// Laptop: only the section's own sub-pages (the side menu lists the rest).
	const tabs = $derived(deskTabs(onApp, page.url));
	// A single request, a new request or a new campaign is a screen of its own: no bottom bar.
	const detail = $derived(path.startsWith('/brand/r/') || path === '/brand/new' || path.startsWith('/brand/campaigns/'));
	const unread = $derived(Object.values(brandData.unread ?? {}).reduce((a, n) => a + n, 0));
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const company = $derived(acct?.brand?.name || acct?.profile?.name || acct?.full_name || 'Brand');
	const hasCreators = $derived((acct?.creators?.length ?? 0) > 0);

	// The sliding highlight behind the open item, as in the studio.
	let navs = $state<HTMLElement>();
	let ind = $state<HTMLElement>();
	const ready = new WeakSet<HTMLElement>();
	function slide() {
		const b = navs?.querySelector<HTMLElement>('[aria-current="page"]');
		const el = ind;
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
	$effect(() => {
		void group;
		void phone.on;
		tick().then(slide);
	});
	onMount(() => {
		addEventListener('resize', slide);
		return () => removeEventListener('resize', slide);
	});
</script>

{#if allowed}
	{#if app}
		<div class="app" class:at={!phone.on} class:m-detail={detail}>
			{#if !phone.on}
				<BrandSide />
			{:else}
				<nav class="rail" aria-label="Brand">
					<div class="navs" bind:this={navs}>
						<span class="nav-ind" bind:this={ind}></span>
						{#each groups as n (n.href)}
							<a class="nav" href={n.href} aria-current={group?.href === n.href ? 'page' : undefined} aria-label={n.me ? 'Your brand' : undefined}
								><span class="nav-ic">{#if n.me}<Avatar name={company} src={brandIg.data?.picture ?? ''} size="28px" />{:else}<Icon name={n.icon} />{/if}</span><span class="nav-t">{n.label}</span>{#if n.label === 'Collabs' && unread}<span class="badge" aria-label="{unread} unread">{unread}</span>{/if}</a
							>
						{/each}
					</div>
				</nav>
			{/if}
			<main class="main">
				{#if phone.on}<BrandTopbar />{/if}
				{#if phone.on}
					{@render children()}
				{:else}
					<div class="pg">
						<div class="at-bar" class:at-flow={detail} hidden={path === '/brand'}>
							{#if tabs && !detail}
								<nav class="subtabs at-tabs" aria-label="{group?.label} pages">
									{#each tabs as t (t.href)}<a href={t.href} aria-current={tabOn(t, page.url) ? 'page' : undefined}>{t.label}</a>{/each}
								</nav>
							{/if}
							{#if !detail}
								<a class="btn at-ask" href="/brand/creators?tab=discover"><Icon name="search" />Find creators</a>
								<a class="btn grad at-new" href={hasCreators ? '/brand/campaigns/new' : '/brand/creators?tab=discover'}><Icon name="plus" />New campaign</a>
							{/if}
						</div>
						{@render children()}
					</div>
				{/if}
			</main>
		</div>
	{:else}
		<BrandTopbar />
		<div class="page"><div class="wrap">{@render children()}</div></div>
		<BrandFooter />
	{/if}
{/if}
