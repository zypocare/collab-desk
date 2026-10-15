<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { auth, signOut } from '../auth.svelte';
	import { pub } from '../publicPage.svelte';
	import { theme, toggleTheme } from '../ui.svelte';
	import { initials } from '../util';
	import Icon from './Icon.svelte';

	const name = $derived(pub.data?.display_name ?? '');
	const signedIn = $derived(!!auth.session && auth.account?.role === 'brand');
	const path = $derived(page.url.pathname);

	async function logout() {
		await signOut();
		goto('/', { replaceState: true });
	}
</script>

<header class="topbar">
	<a class="brandmark" href="/"><span class="ring"><span>{initials(name)}</span></span><b>{name ? `Collaborate with ${name.split(' ')[0]}` : ''}</b></a>
	{#if signedIn}
		<nav aria-label="Brand">
			<a href="/brand" aria-current={path === '/brand' || path.startsWith('/brand/r/') ? 'page' : undefined}>My requests</a>
			<a href="/brand/new" aria-current={path === '/brand/new' ? 'page' : undefined}>New request</a>
			<a href="/brand/details" aria-current={path === '/brand/details' ? 'page' : undefined}>Company</a>
		</nav>
	{/if}
	<button class="theme-btn" onclick={toggleTheme} aria-label="Switch light or dark mode"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></button>
	{#if signedIn}
		<span class="who-chip"><span>{auth.account?.email}</span></span>
		<button class="btn sm" onclick={logout}><Icon name="logout" />Sign out</button>
	{:else if auth.account?.role === 'creator'}
		<a class="btn sm" href="/studio"><Icon name="back" />Back to studio</a>
	{:else}
		<a class="btn sm" href="/login?next=/brand">Sign in</a>
	{/if}
</header>
