<script lang="ts">
	import { page } from '$app/state';
	import { auth } from '../auth.svelte';
	import { addressFor, isAppHost } from '../creatorHost';
	import { pub } from '../publicPage.svelte';
	import { pageSlug } from '../supabase';
	import { brandIg } from '../brandIg.svelte';
	import { firstName } from '../util';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';

	// The brand side's menu on a laptop: the creator studio's side menu, with the brand's places.
	const path = $derived(page.url.pathname);
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const onApp = isAppHost(location.hostname);
	const creators = $derived(acct?.creators ?? []);
	const here = $derived(pub.data?.display_name ?? '');
	const company = $derived(acct?.brand?.name || acct?.profile?.name || acct?.full_name || 'Your brand');

	// The studio's places, in the brand's words: Today, Collabs, Calendar, Content, Money and Settings.
	const on = (...h: string[]) => h.some((x) => path === x || path.startsWith(x + '/'));
	const NAV = $derived([
		{ href: '/brand', label: 'Today', icon: 'home', on: path === '/brand' },
		{ href: onApp ? '/brand/creators' : '/brand/requests', label: 'Collabs', icon: 'board', on: on('/brand/requests', '/brand/creators', '/brand/r', '/brand/new') },
		{ href: '/brand/campaigns', label: 'Campaigns', icon: 'send', on: on('/brand/campaigns', '/brand/autopilots') },
		{ href: '/brand/business/calendar', label: 'Calendar', icon: 'cal', on: on('/brand/business/calendar') },
		{ href: '/brand/business/content', label: 'Content', icon: 'film', on: on('/brand/business/content') },
		{ href: '/brand/business/money', label: 'Money', icon: 'wallet', on: on('/brand/business/money', '/brand/business/shipping') },
		{ href: '/brand/settings', label: 'Settings', icon: 'gear', on: on('/brand/settings', '/brand/details', '/brand/business/team') }
	]);

	// Pick the creator to work with: the same screen on their address (the sign-in is shared).
	let picking = $state(false);
	function goCreator(slug: string) {
		picking = false;
		if (slug === pageSlug) return;
		location.href = addressFor(slug, path.startsWith('/brand/r/') || path === '/brand/new' ? '/brand/requests' : path);
	}
</script>

<nav class="side" aria-label="Brand">
	<a class="side-logo" href="/brand"><Logo /><span>Miracle</span></a>
	{#if creators.length}
		<button class="side-cr" onclick={() => (picking = !picking)} aria-haspopup="menu" aria-expanded={picking}>
			<Avatar name={here || 'Creators'} src={pub.data?.instagram?.profile_picture_url} size="30px" />
			<span><small>Working with</small><b>{here ? firstName(here) : 'Pick a creator'}</b></span>
			<Icon name="chevD" />
		</button>
		{#if picking}
			<div class="side-menu" role="menu">
				{#each creators as c (c.slug)}
					<button role="menuitem" onclick={() => goCreator(c.slug)}><Avatar name={c.name} src={c.photo ?? undefined} size="26px" />{firstName(c.name)}{#if c.waiting}<small>{c.waiting} waiting</small>{:else if c.slug === pageSlug}<small>now</small>{/if}</button>
				{/each}
				<a role="menuitem" href="/brand/creators?tab=discover" onclick={() => (picking = false)}><Icon name="plus" />Find more creators</a>
			</div>
		{/if}
	{/if}
	<div class="side-nav">
		{#each NAV as n (n.href)}
			<a class="side-it" href={n.href} aria-current={n.on ? 'page' : undefined}><Icon name={n.icon} /><span class="side-t">{n.label}</span></a>
		{/each}
	</div>
	<div class="side-end">
		{#if creators.length}
			<a class="side-ask" href="/brand/campaigns/new"><Icon name="plus" />New campaign</a>
		{:else}
			<a class="side-ask" href="/brand/creators?tab=discover"><Icon name="users" />Find creators</a>
		{/if}
		<a class="side-who" href="/brand/settings" title="Settings">
			<span class="side-av"><Avatar name={company} src={brandIg.data?.picture ?? ''} size="36px" /></span>
			<span><b>{company}</b><small>{brandIg.data ? `@${brandIg.data.username} ✓` : (acct?.email ?? '')}</small></span>
		</a>
	</div>
</nav>
