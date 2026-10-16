<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { auth, signOut, switchBrand } from '../auth.svelte';
	import { loadRequests } from '../brand.svelte';
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
</script>

<header class="topbar">
	<a class="brandmark" href="/"><Avatar {name} src={pub.data?.instagram?.profile_picture_url} /><b>{name ? `Collaborate with ${name.split(' ')[0]}` : ''}</b></a>
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

{#if signedIn}
	<!-- Phones and tablets: the brand menu moves to a tab bar at the bottom. -->
	<nav class="brand-tabs" aria-label="Brand">
		<a href="/brand" aria-current={path === '/brand' || path.startsWith('/brand/r/') ? 'page' : undefined}><Icon name="inbox" /><span>Requests</span></a>
		<a href="/brand/new" aria-current={path === '/brand/new' ? 'page' : undefined}><Icon name="send" /><span>New</span></a>
		<a href="/brand/details" aria-current={path.startsWith('/brand/details') ? 'page' : undefined}><Icon name="users" /><span>Company</span></a>
	</nav>
{/if}
