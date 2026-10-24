<script lang="ts">
	import Logo from './Logo.svelte';
	import { onMount } from 'svelte';
	import { route, href } from './router.svelte.ts';
	import { supabase } from './supabase.ts';
	import Icon from './Icon.svelte';
	import Dashboard from './crm/Dashboard.svelte';
	import ListView from './crm/ListView.svelte';
	import CreatorPage from './crm/CreatorPage.svelte';
	import BrandLoginPage from './crm/BrandLoginPage.svelte';
	import WorkspacePage from './crm/WorkspacePage.svelte';
	import CollabPage from './crm/CollabPage.svelte';
	import BrandPage from './crm/BrandPage.svelte';
	import CampaignPage from './crm/CampaignPage.svelte';
	import Controls from './crm/Controls.svelte';
	import Jobs from './crm/Jobs.svelte';
	import Admins from './crm/Admins.svelte';
	import Palette from './crm/Palette.svelte';
	import { LISTS } from './crm/lists.ts';
	import ProblemsTab from './ProblemsTab.svelte';
	import SafetyTab from './SafetyTab.svelte';
	import SupportTab from './SupportTab.svelte';

	let { email, onsignout }: { email: string; onsignout: () => void } = $props();

	// The left menu. Sections arrive phase by phase; only the ones that work are listed.
	type Item = { id: string; label: string; icon: string; badge?: () => number; warn?: boolean };
	const NAV: { label: string; items: Item[] }[] = [
		{ label: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'grid' }] },
		{
			label: 'People',
			items: [
				{ id: 'signups', label: 'Sign-ups', icon: 'inbox', badge: () => queue.signups ?? 0 },
				{ id: 'creators', label: 'Creators', icon: 'user' },
				{ id: 'creator-teams', label: 'Creator teams', icon: 'users' },
				{ id: 'brand-logins', label: 'Brand logins', icon: 'key' },
				{ id: 'workspaces', label: 'Brand workspaces', icon: 'building' }
			]
		},
		{
			label: 'Deals',
			items: [
				{ id: 'brands', label: 'Brands', icon: 'board' },
				{ id: 'collabs', label: 'Collabs', icon: 'spark' },
				{ id: 'quotes', label: 'Quotes', icon: 'note' },
				{ id: 'invoices', label: 'Invoices', icon: 'rupee' },
				{ id: 'payments', label: 'Payments', icon: 'check' },
				{ id: 'drafts', label: 'Drafts', icon: 'inbox' },
				{ id: 'posts', label: 'Scheduled posts', icon: 'clock' },
				{ id: 'campaigns', label: 'Campaigns', icon: 'send' },
				{ id: 'pools', label: 'Pools', icon: 'users' },
				{ id: 'retainers', label: 'Retainers', icon: 'refresh' },
				{ id: 'pitches', label: 'Pitches', icon: 'mail' }
			]
		},
		{
			label: 'Trust',
			items: [
				{ id: 'support', label: 'Support', icon: 'mail', badge: () => queue.support_unread ?? 0 },
				{ id: 'safety', label: 'Safety', icon: 'shield', badge: () => queue.safety ?? 0, warn: true },
				{ id: 'problems', label: 'Problems', icon: 'alert', badge: () => queue.problems_new ?? 0 }
			]
		},
		{
			label: 'System',
			items: [
				{ id: 'controls', label: 'Switches & limits', icon: 'shield', badge: () => flagsOff, warn: true },
				{ id: 'jobs', label: 'Scheduled jobs', icon: 'clock' },
				{ id: 'outbox', label: 'Emails & outbox', icon: 'send', badge: () => queue.emails_failed ?? 0 },
				{ id: 'inbound', label: 'Inbound mail', icon: 'inbox' },
				{ id: 'ai-usage', label: 'AI usage', icon: 'spark' },
				{ id: 'instagram', label: 'Instagram', icon: 'link' },
				{ id: 'admins', label: 'Admins', icon: 'key' },
				{ id: 'audit', label: 'Audit trail', icon: 'list' }
			]
		}
	];
	const screens = NAV.flatMap((g) => g.items.map((i) => ({ label: i.label, href: href(i.id) })));
	const LEGACY: Record<string, [string, string]> = { support: ['Trust', 'Support'], safety: ['Trust', 'Safety'], problems: ['Trust', 'Problems'] };

	let queue = $state<Record<string, number>>({});
	let flagsOff = $state(0);
	async function loadQueue() {
		const [q, c] = await Promise.all([supabase.rpc('admin_dashboard', { p_days: 7 }), supabase.rpc('admin_controls')]);
		if (q.data) queue = (q.data as { queue: Record<string, number> }).queue;
		if (c.data) flagsOff = (c.data as { flags: { on: boolean }[] }).flags.filter((f) => !f.on).length;
	}
	let palette = $state(false);
	let menu = $state(false);
	onMount(() => {
		loadQueue();
		const t = setInterval(loadQueue, 120_000);
		return () => clearInterval(t);
	});
	function onKey(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			palette = !palette;
		}
	}
	$effect(() => {
		void route.section;
		void route.id;
		menu = false;
	});
	const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
	const current = $derived(route.section);
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
	<aside class="side" class:open={menu} aria-label="Sections">
		<div class="brand">
			<Logo size={26} /><b>Miracle</b><small>Admin</small>
			<button class="x" aria-label="Close menu" onclick={() => (menu = false)}><Icon name="x" /></button>
		</div>
		<nav>
			{#each NAV as g (g.label)}
				<div class="ng">{g.label}</div>
				{#each g.items as it (it.id)}
					{@const n = it.badge?.() ?? 0}
					<a class="ni" class:on={current === it.id} href={href(it.id)} aria-current={current === it.id ? 'page' : undefined}>
						<Icon name={it.icon} /><span>{it.label}</span>
						{#if n}<i class="nb" class:warn={it.warn}>{n}</i>{/if}
					</a>
				{/each}
			{/each}
		</nav>
		<div class="me">
			<span class="who" title={email}>{email}</span>
			<button class="so" onclick={onsignout}><Icon name="logout" />Sign out</button>
		</div>
	</aside>
	{#if menu}<div class="side-scrim" role="presentation" onclick={() => (menu = false)}></div>{/if}

	<div class="body">
		<header class="top">
			<button class="btn ghost burger" aria-label="Open menu" onclick={() => (menu = true)}><Icon name="menu" /></button>
			<button class="search" onclick={() => (palette = true)}>
				<Icon name="search" /><span>Search creators, brands, collabs, invoices, tickets…</span><kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
			</button>
			{#if flagsOff}<a class="tag t-warn live" href={href('controls')}>{flagsOff} switch{flagsOff === 1 ? '' : 'es'} off</a>{:else}<span class="tag t-ok live"><i></i>Live data</span>{/if}
		</header>

		<main class="main">
			{#if route.section === 'dashboard'}
				<Dashboard onqueue={(q) => (queue = q)} />
			{:else if route.section === 'creators' && route.id}
				<CreatorPage id={route.id} onchange={loadQueue} />
			{:else if route.section === 'brand-logins' && route.id}
				<BrandLoginPage id={route.id} />
			{:else if route.section === 'workspaces' && route.id}
				<WorkspacePage id={route.id} />
			{:else if route.section === 'collabs' && route.id}
				<CollabPage id={route.id} />
			{:else if route.section === 'brands' && route.id}
				<BrandPage id={route.id} />
			{:else if route.section === 'campaigns' && route.id}
				<CampaignPage id={route.id} />
			{:else if route.section === 'controls'}
				<Controls onflags={(n) => (flagsOff = n)} />
			{:else if route.section === 'jobs'}
				<Jobs />
			{:else if route.section === 'admins'}
				<Admins />
			{:else if LISTS[route.section]}
				{#key route.section}<ListView config={LISTS[route.section]} onchange={loadQueue} />{/key}
			{:else if LEGACY[route.section]}
				<header class="lh"><div class="eb">{LEGACY[route.section][0]}</div><h1>{LEGACY[route.section][1]}</h1></header>
				{#if route.section === 'support'}<SupportTab onload={(n) => (queue = { ...queue, support_unread: n })} />
				{:else if route.section === 'safety'}<SafetyTab onload={(s) => (queue = { ...queue, safety: s.targets.filter((t) => t.open).length })} />
				{:else}<ProblemsTab onload={(p) => (queue = { ...queue, problems_new: p.new_today })} />{/if}
			{:else}
				<div class="card card-empty">This page doesn't exist. <a href={href('dashboard')}>Go to the dashboard</a></div>
			{/if}
		</main>
	</div>
</div>

<Palette bind:open={palette} {screens} />

<style>
	.app { display: flex; min-height: 100vh; }
	.side { position: sticky; top: 0; height: 100vh; width: 236px; flex: none; background: var(--side); color: var(--side-ink); display: flex; flex-direction: column; padding: 12px 10px; overflow-y: auto; scrollbar-width: thin; }
	.brand { display: flex; align-items: center; gap: 9px; padding: 6px 10px 10px; color: #fff; }
	.brand b { font-size: 15px; font-weight: 700; }
	.brand small { font: 500 10.5px var(--f-mono); color: var(--side-mute); border: 1px solid #3a333f; border-radius: 4px; padding: 1px 5px; }
	.x { display: none; margin-left: auto; border: 0; background: none; color: var(--side-ink); width: 32px; height: 32px; }
	nav { flex: 1; }
	.ng { font-size: 10.5px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--side-mute); padding: 14px 10px 6px; }
	.ni { display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 10px; border-radius: 6px; color: var(--side-ink); font-size: 13.5px; text-decoration: none; }
	.ni:hover { color: #fff; background: #221d27; text-decoration: none; }
	.ni.on { background: var(--side-2); color: #fff; }
	.ni :global(.ic) { width: 16px; height: 16px; opacity: .85; }
	.ni span { flex: 1; min-width: 0; }
	.nb { font: 500 11px var(--f-mono); font-style: normal; color: var(--side); background: #e9b949; border-radius: 9px; padding: 1px 6px; }
	.nb.warn { background: #ff9b91; }
	.me { border-top: 1px solid #2b2531; margin-top: 12px; padding: 12px 10px 4px; display: grid; gap: 8px; }
	.who { font-size: 12.5px; color: var(--side-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.so { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #3a333f; background: none; color: var(--side-ink); height: 30px; padding: 0 10px; border-radius: 6px; font-size: 12.5px; justify-self: start; }
	.so:hover { color: #fff; border-color: #574e5e; }
	.body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.top { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px; padding: 10px var(--gut); background: var(--surface); border-bottom: 1px solid var(--line); }
	.search { flex: 1 1 320px; max-width: 620px; display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--bg); color: var(--ink-3); font-size: 13.5px; text-align: left; min-width: 0; }
	.search span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.search:hover { border-color: #c4bdb3; }
	kbd { font: 500 11px var(--f-mono); color: var(--ink-2); border: 1px solid var(--line-strong); border-radius: 4px; padding: 1px 6px; background: var(--surface); }
	.live { margin-left: auto; }
	.live i { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); }
	.burger { display: none; width: 36px; padding: 0; }
	.main { padding: 22px var(--gut) 56px; width: 100%; max-width: 1480px; }
	.lh { margin-bottom: 18px; }
	.lh .eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	.lh h1 { font-size: 24px; }
	.side-scrim { display: none; }

	@media (max-width: 900px) {
		.side { position: fixed; left: 0; top: 0; z-index: 60; transform: translateX(-100%); transition: transform .2s; box-shadow: 0 0 40px rgba(0, 0, 0, .3); }
		.side.open { transform: none; }
		.side-scrim { display: block; position: fixed; inset: 0; z-index: 55; background: rgba(23, 19, 27, .4); }
		.x { display: grid; place-items: center; }
		.burger { display: inline-flex; }
		.live { display: none; }
		kbd { display: none; }
	}
</style>
