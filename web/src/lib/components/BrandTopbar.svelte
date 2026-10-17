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
		goto('/', { replace: true });
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
			<a class="b-who" href="/"><Avatar {name} src={pub.data?.instagram?.profile_picture_url} size="34px" /><span><b>{title}</b>{#if sub}<small>{sub}</small>{/if}</span></a>
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

<header class="topbar">
	<a class="brandmark" href="/" aria-label="Collab Desk home"><Avatar {name} src={pub.data?.instagram?.profile_picture_url} /><b>{name ? `Collaborate with ${name.split(' ')[0]}` : ''}</b></a>
	{#if signedIn}
		<nav aria-label="Brand">
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
		<button class="btn sm signout" onclick={logout} aria-label="Sign out"><Icon name="logout" /><span>Sign out</span></button>
	{:else if auth.account?.role === 'creator'}
		<a class="btn sm" href="/studio"><Icon name="back" />Back to studio</a>
	{:else}
		<a class="btn sm" href="/login">Sign in</a>
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
