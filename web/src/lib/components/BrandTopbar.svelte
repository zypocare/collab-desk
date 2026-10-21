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

	const name = $derived(pub.data?.display_name ?? '');
	const signedIn = $derived(!!auth.session && auth.account?.role === 'brand');
	const path = $derived(page.url.pathname);
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const many = $derived((acct?.brands?.length ?? 0) > 1);

	async function switchTo(id: string) {
		if (id === '__add') return goto('/brand/details?new=1');
		if (id === acct?.brand?.id) return;
		try {
			await switchBrand(id);
			await loadRequests();
			toast(`Now working as ${acct?.brand?.name ?? 'that brand'}`, 'refresh');
			if (path !== '/brand') goto('/brand');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}

	async function logout() {
		await signOut();
		goto('/', { replaceState: true });
	}

	// ---------- Phones: an app bar with the screen's title, Back on screens opened from a tab ----------
	const first = $derived(name.split(' ')[0] || 'Creator');
	const isNew = $derived(path === '/brand/details' && page.url.searchParams.get('new') === '1');
	const title = $derived(
		path === '/' ? name
		: path === '/brand' ? 'Requests'
		: path === '/brand/new' ? 'New request'
		: isNew ? 'Add a brand'
		: path === '/brand/details' ? 'Company'
		: path.startsWith('/brand/r/') ? path.split('/')[3]
		: path.startsWith('/insights') ? 'Insights'
		: ''
	);
	const sub = $derived(path === '/' ? 'Brand collaborations' : path === '/brand' ? (acct?.brand?.name ?? '') : '');
	const back = $derived(
		path.startsWith('/brand/r/') ? '/brand'
		: isNew ? '/brand/details'
		: path.startsWith('/insights') ? '/'
		: path === '/brand/new' ? (signedIn ? '/brand' : '/')
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
			<a class="b-who bt-who" href="/"><span class="bt-logo"><Logo size={30} /></span><span><b>{title}</b>{#if sub}<small>{sub}</small>{/if}</span></a>
			<div class="m-r">
				{#if signedIn && path === '/brand' && pub.data?.accepting !== false}<a class="m-ib" href="/brand/new" aria-label="New request"><Icon name="plus" /></a>{/if}
				{#if !signedIn}<button class="m-ib" onclick={toggleTheme} aria-label="Switch light or dark mode"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></button>{/if}
				{#if auth.account?.role === 'creator'}
					<a class="b-pill" href="/studio">Studio</a>
				{:else if !signedIn}
					<a class="b-pill" href="/login">Sign in</a>
				{/if}
			</div>
		{/if}
	</header>
{:else}

<!-- Laptops: Miracle on the left (like her page), then whose page this is. -->
<header class="topbar bt-top">
	<a class="bt-mark" href="/" aria-label="Miracle, back to {first}'s page"><Logo size={32} /><b>Miracle</b></a>
	{#if name}
		<a class="bt-for" href="/" title="{name}'s page"><Avatar {name} src={pub.data?.instagram?.profile_picture_url} size="26px" /><span>with <b>{first}</b></span></a>
	{/if}
	{#if signedIn}
		<nav class="bt-nav" aria-label="Brand">
			<a href="/brand" aria-current={path === '/brand' || path.startsWith('/brand/r/') ? 'page' : undefined}>My requests</a>
			<a href="/brand/new" aria-current={path === '/brand/new' ? 'page' : undefined}>New request</a>
			<a href="/brand/details" aria-current={path === '/brand/details' ? 'page' : undefined}>Company</a>
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

{#if signedIn}
	<!-- Phones and tablets: the brand menu moves to a tab bar at the bottom. -->
	<nav class="brand-tabs" class:hide-tabs={phone.on && (path.startsWith('/brand/r/') || path === '/brand/new')} aria-label="Brand">
		{#if phone.on}<a href="/" aria-current={path === '/' ? 'page' : undefined}><span class="bt-av"><Avatar {name} src={pub.data?.instagram?.profile_picture_url} size="26px" /></span><span>{first}</span></a>{/if}
		<a href="/brand" aria-current={path === '/brand' || path.startsWith('/brand/r/') ? 'page' : undefined}><span class="bt-ic"><Icon name="inbox" />{#if unread}<i class="bt-n">{unread}</i>{/if}</span><span>Requests</span></a>
		<a class="bt-new" href="/brand/new" aria-current={path === '/brand/new' ? 'page' : undefined}><span class="bt-plus"><Icon name="plus" /></span><span>New</span></a>
		<a href="/brand/details" aria-current={path.startsWith('/brand/details') ? 'page' : undefined}><span class="bt-ic"><Icon name="users" /></span><span>Company</span></a>
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
	/* Phones: Miracle's mark where her photo was. */
	.bt-logo {
		display: grid;
		place-items: center;
		flex: none;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--ink) 6%, transparent);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
	}
	.bt-who b {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 22px;
		letter-spacing: -0.01em;
	}
</style>
