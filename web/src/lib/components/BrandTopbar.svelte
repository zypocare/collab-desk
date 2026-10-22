<script lang="ts">
	import { goto } from '$app/navigation';
	import { edgeSwipeBack, goBackOr } from '../back';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { auth, signOut, switchBrand } from '../auth.svelte';
	import { brandData, loadRequests } from '../brand.svelte';
	import { phone, startPhone } from '../phone.svelte';
	import { loadPublicPage } from '../publicPage.svelte';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import { pub } from '../publicPage.svelte';
	import { theme, toggleTheme } from '../ui.svelte';
	import { initials } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';
	import Avatar from './Avatar.svelte';
	import Logo from './Logo.svelte';
	import { addressFor, isAppHost } from '../creatorHost';
	import { pageSlug } from '../supabase';
	// Miracle's own address (app.miracleapp.live): no creator here, so no per-creator requests list.
	const onApp = isAppHost(location.hostname);

	const name = $derived(pub.data?.display_name ?? '');
	const signedIn = $derived(!!auth.session && auth.account?.role === 'brand');
	const path = $derived(page.url.pathname);
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const many = $derived((acct?.brands?.length ?? 0) > 1);
	// Every creator this brand works with; picking one opens the same screen on that creator's address
	// (the sign-in is shared), or their requests from a single request.
	const creators = $derived(acct?.creators ?? []);
	let picking = $state(false);
	function goCreator(slug: string) {
		picking = false;
		if (slug === pageSlug) return;
		location.href = addressFor(slug, path.startsWith('/brand') && !path.startsWith('/brand/r/') ? path : '/brand/requests');
	}
	const creatorLine = (c: (typeof creators)[number]) =>
		[c.open ? `${c.open} open request${c.open === 1 ? '' : 's'}` : 'No open requests', c.waiting ? `${c.waiting} waiting on you` : ''].filter(Boolean).join(' · ');

	async function switchTo(id: string) {
		if (id === '__add') return goto('/brand/details?new=1');
		if (id === acct?.brand?.id) return;
		try {
			await switchBrand(id);
			await loadRequests();
			toast(`Now working as ${acct?.brand?.name ?? 'that brand'}`, 'refresh');
			if (path.startsWith('/brand/r/')) goto('/brand/requests');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}

	// Phones: the same section tabs as the creator's studio (NeoPOP strip under the bar).
	const BUSINESS = [
		{ href: '/brand/business/money', label: 'Money' },
		{ href: '/brand/business/content', label: 'Content' },
		{ href: '/brand/business/calendar', label: 'Calendar' },
		{ href: '/brand/business/shipping', label: 'Shipping' },
		{ href: '/brand/business/team', label: 'Team' },
		{ href: '/brand/settings', label: 'Settings' }
	];
	const CREATORS = [
		{ href: '/brand/creators', label: 'Yours', key: '' },
		{ href: '/brand/creators?tab=pools', label: 'Pools', key: 'pools' },
		{ href: '/brand/creators?tab=discover', label: 'Discover', key: 'discover' }
	];
	const segs = $derived(
		path.startsWith('/brand/business/') || path === '/brand/settings'
			? BUSINESS.map((t) => ({ ...t, on: t.href === path }))
			: path === '/brand/creators' && !page.url.searchParams.get('pool')
				? CREATORS.map((t) => ({ ...t, on: (page.url.searchParams.get('tab') ?? '') === t.key }))
				: null
	);

	async function logout() {
		await signOut();
		goto('/', { replaceState: true });
	}

	// ---------- Phones: an app bar with the screen's title, Back on screens opened from a tab ----------
	const first = $derived(name.split(' ')[0] || 'Creator');
	const isNew = $derived(path === '/brand/details' && page.url.searchParams.get('new') === '1');
	const title = $derived(
		path === '/' ? name
		: path === '/brand' ? 'Miracle'
		: path === '/brand/requests' ? 'Requests'
		: path === '/brand/creators' ? 'Creators'
		: path === '/brand/campaigns' ? 'Campaigns'
		: path === '/brand/autopilots' ? 'Autopilots'
		: path === '/brand/campaigns/new' ? 'New campaign'
		: path.startsWith('/brand/campaigns/') ? 'Campaign'
		: path === '/brand/new' ? 'New request'
		: isNew ? 'Add a brand'
		: path === '/brand/details' || path === '/brand/settings' ? 'Settings'
		: path.startsWith('/brand/business/') ? 'Business'
		: path.startsWith('/brand/r/') ? path.split('/')[3]
		: path.startsWith('/insights') ? 'Insights'
		: ''
	);
	const sub = $derived(path === '/' ? 'Brand collaborations' : signedIn && name && path !== '/brand' && !path.startsWith('/brand/creators') && !path.startsWith('/brand/campaigns') && !path.startsWith('/brand/business') && path !== '/brand/details' && path !== '/brand/settings' && path !== '/brand/autopilots' ? `with ${first}` : '');
	const back = $derived(
		path.startsWith('/brand/r/') ? '/brand/requests'
		: path.startsWith('/brand/campaigns/') ? '/brand/campaigns'
		: path === '/brand/autopilots' ? '/brand'
		: isNew ? '/brand/settings'
		: path.startsWith('/insights') ? '/'
		: path === '/brand/new' ? (signedIn ? '/brand/requests' : '/')
		: ''
	);
	const unread = $derived(Object.values(brandData.unread ?? {}).reduce((a, n) => a + n, 0));
	let inApp = false;
	onMount(() => {
		inApp = history.length > 1 && document.referrer.startsWith(location.origin);
		return startPhone(async () => {
			await loadPublicPage();
			if (signedIn) await loadRequests();
		});
	});
	const goBack = () => goBackOr(back || '/brand', inApp);
	onMount(() => edgeSwipeBack(goBack, () => phone.on && !!back));
</script>

{#if phone.on}
	<header class="m-bar b-bar" class:scrolled={phone.scrolled} class:sub={!!back}>
		{#if back}
			<button class="m-ib m-back" onclick={goBack} aria-label="Back"><Icon name="chevL" /></button>
			<div class="m-title">{title}</div>
			<div class="m-r"></div>
		{:else}
			<!-- The same bar as the creator's studio: a serif title (the wordmark at home), actions on the right. -->
			<div class="m-brand" class:wordmark={path === '/brand'}>{title}</div>
			<div class="m-r">
				{#if signedIn && (path === '/brand' || path === '/brand/requests') && pub.data?.accepting !== false}<a class="m-ib" href="/brand/new" aria-label="New request"><Icon name="plus" /></a>{/if}
				{#if !signedIn}<button class="m-ib" onclick={toggleTheme} aria-label="Switch light or dark mode"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></button>{/if}
				{#if signedIn && creators.length}
					<button class="m-ib b-cr" onclick={() => (picking = true)} aria-haspopup="dialog" aria-label={name ? `Working with ${name}. Switch creator` : 'Pick a creator'}>
						<Avatar name={name || 'Creators'} src={pub.data?.instagram?.profile_picture_url} size="30px" />
					</button>
				{/if}
				{#if auth.account?.role === 'creator'}
					<a class="b-pill" href="/studio">Studio</a>
				{:else if !signedIn}
					<a class="b-pill" href="/login">Sign in</a>
				{/if}
			</div>
		{/if}
	</header>
	{#if segs && signedIn}
		<nav class="m-seg b-seg" class:many={segs.length > 4} aria-label="Sections" style="--n:{segs.length};--i:{Math.max(0, segs.findIndex((t) => t.on))}">
			{#each segs as t (t.href)}<a href={t.href} aria-current={t.on ? 'page' : undefined}>{t.label}</a>{/each}
		</nav>
	{/if}
{:else}

<!-- Laptops: Miracle on the left (like her page), then whose page this is. -->
<header class="topbar bt-top">
	<a class="bt-mark" href="/" aria-label="Miracle, back to {first}'s page"><Logo size={32} /><b>Miracle</b></a>
	{#if signedIn && creators.length}
		<div class="bt-for-wrap">
			<button class="bt-for" class:open={picking} onclick={() => (picking = !picking)} aria-expanded={picking} aria-haspopup="menu">
				{#if name}<Avatar {name} src={pub.data?.instagram?.profile_picture_url} size="26px" /><span>with <b>{first}</b></span>{:else}<span>Your creators</span>{/if}
				<Icon name="chevD" />
			</button>
			{#if picking}
				<div class="bt-menu" role="menu">
					<span class="bt-menu-h">Creators you work with</span>
					{#each creators as c (c.id)}
						<button role="menuitem" class="bt-cr" class:cur={c.slug === pageSlug} onclick={() => goCreator(c.slug)}>
							<Avatar name={c.name} src={c.photo} size="40px" />
							<span><b>{c.name}</b><small>{c.slug}.miracleapp.live · {creatorLine(c)}</small></span>
							{#if c.slug === pageSlug}<i class="bt-tick" aria-label="Current"><Icon name="check" /></i>{/if}
						</button>
					{/each}
					<a class="bt-cr bt-find" role="menuitem" href="/brand/creators?tab=discover" onclick={() => (picking = false)}><span class="bt-add" aria-hidden="true">+</span><span><b>Find more creators</b></span></a>
					<p class="bt-menu-f">You stay signed in when you switch. Each creator only sees your requests to them.</p>
				</div>
			{/if}
		</div>
	{:else if name}
		<a class="bt-for" href="/" title="{name}'s page"><Avatar {name} src={pub.data?.instagram?.profile_picture_url} size="26px" /><span>with <b>{first}</b></span></a>
	{/if}
	{#if signedIn}
		<nav class="bt-nav" aria-label="Brand">
			<a href="/brand" aria-current={path === '/brand' ? 'page' : undefined}>Dashboard</a>
			<a href="/brand/creators" aria-current={path === '/brand/creators' ? 'page' : undefined}>Creators</a>
			<a href="/brand/campaigns" aria-current={path.startsWith('/brand/campaigns') ? 'page' : undefined}>Campaigns</a>
			<a href="/brand/autopilots" aria-current={path === '/brand/autopilots' ? 'page' : undefined}>Autopilots</a>
			{#if !onApp}<a href="/brand/requests" aria-current={path === '/brand/requests' || path.startsWith('/brand/r/') || path === '/brand/new' ? 'page' : undefined}>Requests</a>{/if}
			<a href="/brand/business/money" aria-current={path.startsWith('/brand/business') || (path === '/brand/details' && !isNew) ? 'page' : undefined}>Business</a>
		</nav>
	{/if}
	<button class="theme-btn" onclick={toggleTheme} aria-label="Switch light or dark mode"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></button>
	{#if signedIn}
		{#if many}
			<Select
				size="sm"
				class="brand-switch"
				ariaLabel="Switch brand"
				value={acct?.brand?.id ?? ''}
				options={[...(acct?.brands ?? []).map((b) => ({ value: b.id, label: b.name })), { value: '__add', label: '+ Add a brand' }]}
				onchange={switchTo}
			/>
		{:else}
			<span class="who-chip"><span>{auth.account?.email}</span></span>
		{/if}
		<button class="bt-btn bt-ghost signout" onclick={logout} aria-label="Sign out"><Icon name="logout" /><span>Sign out</span></button>
	{:else if auth.account?.role === 'creator'}
		<a class="bt-btn bt-ghost" href="/studio"><Icon name="back" />Back to studio</a>
	{:else}
		<a class="bt-btn bt-grad" href="/login">Sign in</a>
	{/if}
</header>
{/if}

{#if phone.on && picking}
	<!-- Phones: the creator switcher as a sheet from the bottom. -->
	<button class="bt-scrim" aria-label="Close" onclick={() => (picking = false)}></button>
	<div class="bt-sheet" role="dialog" aria-modal="true" aria-label="Your creators">
		<i class="bt-grab" aria-hidden="true"></i>
		<h2>Your creators</h2>
		<p>You stay signed in when you switch.</p>
		{#each creators as c (c.id)}
			<button class="bt-cr" class:cur={c.slug === pageSlug} onclick={() => goCreator(c.slug)}>
				<Avatar name={c.name} src={c.photo} size="44px" />
				<span><b>{c.name}</b><small>{creatorLine(c)}</small></span>
				{#if c.slug === pageSlug}<i class="bt-tick" aria-label="Current"><Icon name="check" /></i>{:else}<Icon name="chevR" />{/if}
			</button>
		{/each}
		<a class="bt-cr bt-find" href="/brand/creators?tab=discover" onclick={() => (picking = false)}><span class="bt-add" aria-hidden="true">+</span><span><b>Find more creators</b></span></a>
	</div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && (picking = false)} onclick={(e) => picking && !phone.on && !(e.target as HTMLElement).closest?.('.bt-for-wrap') && (picking = false)} />

{#if signedIn}
	<!-- Phones and tablets: the brand menu moves to a tab bar at the bottom. -->
	<nav class="brand-tabs" style="grid-template-columns:repeat({onApp ? 4 : 5},minmax(0,1fr))" class:hide-tabs={phone.on && (path.startsWith('/brand/r/') || path === '/brand/new' || path === '/brand/campaigns/new')} aria-label="Brand">
		<a href="/brand" aria-current={path === '/brand' ? 'page' : undefined}><span class="bt-ic"><Icon name="home" /></span><span>Home</span></a>
		<a href="/brand/creators" aria-current={path === '/brand/creators' ? 'page' : undefined}><span class="bt-ic"><Icon name="users" /></span><span>Creators</span></a>
		<a href="/brand/campaigns" aria-current={path.startsWith('/brand/campaigns') ? 'page' : undefined}><span class="bt-ic"><Icon name="send" /></span><span>Campaigns</span></a>
		{#if !onApp}<a href="/brand/requests" aria-current={path === '/brand/requests' || path.startsWith('/brand/r/') ? 'page' : undefined}><span class="bt-ic"><Icon name="inbox" />{#if unread}<i class="bt-n">{unread}</i>{/if}</span><span>Requests</span></a>{/if}
		<a href="/brand/business/money" aria-current={path.startsWith('/brand/business') || path.startsWith('/brand/details') || path === '/brand/settings' ? 'page' : undefined}><span class="bt-ic"><Icon name="box" /></span><span>Business</span></a>
	</nav>
{/if}

<style>
	/* Miracle's bar, in the look of her page's header: the serif italic name, quiet links, NeoPOP buttons. */
	.bt-top {
		gap: 18px;
		min-height: 68px;
		background: color-mix(in oklab, var(--bg) 92%, transparent);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}
	.bt-mark {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: none;
		color: var(--ink);
		text-decoration: none;
	}
	.bt-mark b {
		font: 400 27px/1 var(--f-serif);
		font-style: italic;
		letter-spacing: -0.01em;
	}
	.bt-for {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		margin-right: auto;
		padding: 4px 12px 4px 4px;
		border-radius: 999px;
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink-3);
		font-size: 13.5px;
		text-decoration: none;
		white-space: nowrap;
		transition:
			box-shadow 0.2s,
			color 0.2s;
	}
	.bt-for b {
		color: var(--ink);
		font-weight: 600;
	}
	.bt-for:hover {
		color: var(--ink-2);
		box-shadow: inset 0 0 0 1px var(--ink-3);
	}
	.bt-top:not(:has(.bt-for)) .bt-mark {
		margin-right: auto;
	}
	.topbar .bt-nav {
		gap: 26px;
		margin-right: 8px;
	}
	.topbar .bt-nav a {
		position: relative;
		padding: 8px 0;
		border-radius: 0;
		background: none;
		box-shadow: none;
		font-size: 14.5px;
		font-weight: 500;
		color: var(--ink-3);
	}
	.topbar .bt-nav a:hover {
		background: none;
		color: var(--ink);
	}
	.topbar .bt-nav a[aria-current='page'] {
		background: none;
		box-shadow: none;
		color: var(--ink);
	}
	.topbar .bt-nav a[aria-current='page']::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2px;
		background: var(--grad);
	}
	.bt-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		flex: none;
		height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 0;
		cursor: pointer;
		font: 700 11.5px/1 var(--f-body);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		text-decoration: none;
		transition:
			transform 0.12s,
			box-shadow 0.12s;
	}
	.bt-btn :global(.ic) {
		width: 15px;
		height: 15px;
	}
	.bt-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 4px 4px 0 #6a4bc9;
	}
	.bt-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1.5px var(--ink-3),
			4px 4px 0 var(--line);
	}
	.bt-btn:hover {
		transform: translate(-2px, -2px);
	}
	.bt-btn:active {
		transform: translate(4px, 4px);
		box-shadow: none;
	}
	@media (max-width: 1100px) {
		.bt-for span {
			display: none;
		}
		.bt-for {
			padding: 4px;
		}
	}
	@media (max-width: 560px) {
		.bt-top .signout {
			width: 40px;
			padding: 0;
		}
	}
	/* The creator switcher: a menu under the "with" chip (laptops), a sheet from the bottom (phones). */
	.bt-for-wrap {
		position: relative;
		margin-right: auto;
	}
	.bt-for-wrap .bt-for {
		margin-right: 0;
	}
	button.bt-for {
		border: 0;
		background: transparent;
		cursor: pointer;
		font: inherit;
		font-size: 13.5px;
	}
	.bt-for :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.bt-for.open {
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.bt-menu {
		position: absolute;
		z-index: 60;
		top: calc(100% + 10px);
		left: 0;
		width: 430px;
		display: grid;
		gap: 2px;
		padding: 10px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--line-strong),
			0 30px 60px -20px rgba(0, 0, 0, 0.6);
	}
	.bt-menu-h {
		padding: 10px 12px 6px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bt-cr {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 60px;
		padding: 8px 12px;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.bt-cr:hover,
	.bt-cr.cur {
		background: color-mix(in oklab, var(--ink) 6%, transparent);
	}
	.bt-cr > span:not(.ring):not(.bt-add) {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 1px;
	}
	.bt-cr b {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bt-cr small {
		font-size: 12.5px;
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.bt-tick {
		color: var(--ok);
	}
	.bt-tick :global(.ic) {
		width: 18px;
		height: 18px;
		stroke-width: 2.4;
	}
	.bt-add {
		width: 40px;
		height: 40px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
		font-size: 20px;
		color: var(--ink-2);
	}
	.bt-menu-f {
		margin: 6px 4px 0;
		padding: 10px 8px 4px;
		border-top: 1px solid var(--line);
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--ink-3);
	}
	.bt-scrim {
		position: fixed;
		inset: 0;
		z-index: 90;
		border: 0;
		background: rgba(0, 0, 0, 0.55);
	}
	.bt-sheet {
		position: fixed;
		z-index: 91;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		gap: 4px;
		max-height: 80vh;
		overflow-y: auto;
		padding: 10px 16px calc(24px + env(safe-area-inset-bottom, 0px));
		border-radius: 24px 24px 0 0;
		background: var(--surface);
		box-shadow: inset 0 1px 0 var(--line-strong);
		animation: bt-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	@keyframes bt-up {
		from {
			transform: translateY(40%);
			opacity: 0;
		}
	}
	.bt-grab {
		justify-self: center;
		width: 40px;
		height: 4px;
		margin-bottom: 10px;
		border-radius: 4px;
		background: var(--line-strong);
	}
	.bt-sheet h2 {
		margin: 0;
		padding: 0 4px;
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 28px;
	}
	.bt-sheet p {
		margin: 0 0 10px;
		padding: 0 4px;
		font-size: 13px;
		color: var(--ink-3);
	}
	.bt-sheet .bt-cr {
		min-height: 64px;
		border-radius: 14px;
	}
	.bt-sheet .bt-cr > :global(.ic) {
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}
</style>
