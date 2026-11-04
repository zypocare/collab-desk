<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { auth, signOut, signOutTo } from '../auth.svelte';
	import { isAppHost } from '../creatorHost';
	import { brandIg } from '../brandIg.svelte';
	import { allRequests } from '../brand.svelte';
	import { ui } from '../ui.svelte';
	import { alerts } from '../alerts.svelte';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';
	import WorkspaceSwitch from './WorkspaceSwitch.svelte';

	// The brand side's menu on a laptop: the creator studio's side menu, with the brand's places.
	const path = $derived(page.url.pathname);
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const onApp = isAppHost(location.hostname);
	const creators = $derived(acct?.creators ?? []);
	const company = $derived(acct?.brand?.name || acct?.profile?.name || acct?.full_name || 'Your brand');

	// The studio's places, in the brand's words: Today, Collabs, Calendar, Content, Money and Settings.
	const on = (...h: string[]) => h.some((x) => path === x || path.startsWith(x + '/'));
	const NAV = $derived([
		{ href: '/brand', label: 'Today', icon: 'home', on: path === '/brand' },
		{ href: '/brand/inbox', label: 'Inbox', icon: 'inbox', on: on('/brand/inbox') },
		{ href: '/brand/alerts', label: 'Alerts', icon: 'bell', on: on('/brand/alerts') },
		{ href: '/brand/requests', label: 'Collabs', icon: 'board', on: on('/brand/requests', '/brand/creators', '/brand/creator', '/brand/r', '/brand/new') },
		{ href: '/brand/campaigns', label: 'Campaigns', icon: 'send', on: on('/brand/campaigns', '/brand/autopilots', '/brand/business/turnaround') },
		{ href: '/brand/business/calendar', label: 'Calendar', icon: 'cal', on: on('/brand/business/calendar') },
		{ href: '/brand/business/content', label: 'Content', icon: 'film', on: on('/brand/business/content') },
		{ href: '/brand/business/money', label: 'Money', icon: 'wallet', on: on('/brand/business/money', '/brand/business/shipping') },
		{ href: '/brand/reports', label: 'Reports', icon: 'chart', on: on('/brand/reports') },
		{ href: '/brand/settings', label: 'Settings', icon: 'gear', on: on('/brand/settings', '/brand/details', '/brand/business/team') },
		{ href: '/brand/help', label: 'Help', icon: 'info', on: on('/brand/help') }
	]);

	const unread = $derived(allRequests.list.reduce((a, r) => a + r.unread, 0));

</script>

<nav class="side" aria-label="Brand">
	<a class="side-logo" href="/brand"><Logo /><span>Miracle</span></a>
	<!-- No creator switch: requests, messages and money cover every creator. -->
	<div class="side-nav">
		{#each NAV as n (n.href)}
			<a class="side-it" href={n.href} aria-current={n.on ? 'page' : undefined}><Icon name={n.icon} /><span class="side-t">{n.label}</span>{#if n.href === '/brand/inbox' && unread}<span class="side-badge" aria-label="{unread} unread">{unread}</span>{/if}{#if n.href === '/brand/alerts' && alerts.unread}<span class="side-badge" aria-label="{alerts.unread} new">{alerts.unread > 99 ? '99+' : alerts.unread}</span>{/if}</a>
		{/each}
	</div>
	<div class="side-end">
		<WorkspaceSwitch />
		<button class="side-ask" onclick={() => (ui.askOpen = true)}><Icon name="spark" />Ask your desk</button>
		{#if creators.length}
			<a class="side-ask" href="/brand/campaigns/new"><Icon name="plus" />New campaign</a>
		{:else}
			<a class="side-ask" href="/brand/creators?tab=discover"><Icon name="users" />Find creators</a>
		{/if}
		<div class="side-acct">
			<a class="side-who" href="/brand/settings" title="Settings">
				<span class="side-av"><Avatar name={company} src={brandIg.data?.picture ?? ''} size="36px" /></span>
				<span><b>{company}</b><small>{brandIg.data ? `@${brandIg.data.username} ✓` : (acct?.email ?? '')}</small></span>
			</a>
			<button class="side-out" onclick={() => signOutTo('/login')} aria-label="Log out" title="Log out"><Icon name="logout" /></button>
		</div>
	</div>
</nav>
