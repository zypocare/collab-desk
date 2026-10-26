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
	import TicketPage from './crm/TicketPage.svelte';
	import ProblemPage from './crm/ProblemPage.svelte';
	import SafetyPage from './crm/SafetyPage.svelte';
	import AutopilotsPage from './crm/AutopilotsPage.svelte';
	import Quotas from './crm/Quotas.svelte';
	import BillingOverview from './crm/BillingOverview.svelte';
	import PlansPage from './crm/PlansPage.svelte';
	import InvoicesPage from './crm/InvoicesPage.svelte';
	import WaitlistPage from './crm/WaitlistPage.svelte';
	import GrowthPage from './crm/GrowthPage.svelte';
	import SignupsBoard from './crm/SignupsBoard.svelte';

	let { email, onsignout }: { email: string; onsignout: () => void } = $props();

	// The sections (tabs in the top bar) and their pages (the icon rail on the left).
	type Item = { id: string; label: string; icon: string; badge?: () => number; warn?: boolean };
	const NAV: { label: string; icon: string; items: Item[] }[] = [
		{ label: 'Overview', icon: 'grid', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'grid' }] },
		{
			label: 'People',
			icon: 'users',
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
			icon: 'board',
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
			label: 'Automation',
			icon: 'spark',
			items: [
				{ id: 'autopilots', label: 'Autopilots', icon: 'spark' },
				{ id: 'autopilot-items', label: 'Autopilot items', icon: 'list' },
				{ id: 'dm', label: 'DM auto-replies', icon: 'send' }
			]
		},
		{
			label: 'Trust',
			icon: 'shield',
			items: [
				{ id: 'support', label: 'Support', icon: 'mail', badge: () => queue.support_unread ?? 0 },
				{ id: 'safety', label: 'Safety', icon: 'shield', badge: () => queue.safety ?? 0, warn: true },
				{ id: 'bans', label: 'Bans', icon: 'x' },
				{ id: 'blocks', label: 'Blocks', icon: 'pause' },
				{ id: 'problems', label: 'Problems', icon: 'alert', badge: () => queue.problems_new ?? 0 }
			]
		},
		{
			label: 'Growth',
			icon: 'send',
			items: [
				{ id: 'growth', label: 'Growth Autopilot', icon: 'send' },
				{ id: 'waitlist', label: 'Waitlist', icon: 'clock' },
				{ id: 'directory', label: 'Directory', icon: 'users' },
				{ id: 'cases', label: 'Case studies', icon: 'note' },
				{ id: 'pages', label: 'Creator pages', icon: 'external' },
				{ id: 'reels', label: 'Reel swaps', icon: 'refresh' }
			]
		},
		{
			label: 'Billing',
			icon: 'rupee',
			items: [
				{ id: 'billing', label: 'Overview', icon: 'rupee' },
				{ id: 'plans', label: 'Plans & settings', icon: 'note' },
				{ id: 'subscriptions', label: 'Subscriptions', icon: 'refresh' },
				{ id: 'billing-payments', label: 'Plan payments', icon: 'check' },
				{ id: 'plan-invoices', label: 'Invoices (GST)', icon: 'note' }
			]
		},
		{
			label: 'System',
			icon: 'key',
			items: [
				{ id: 'controls', label: 'Switches & limits', icon: 'shield', badge: () => flagsOff, warn: true },
				{ id: 'quotas', label: 'Daily quotas', icon: 'chart' },
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
	// The section of the page that's open (record pages belong to their list's section).
	const group = $derived(NAV.find((g) => g.items.some((i) => i.id === route.section)) ?? NAV[0]);
	const groupBadge = (g: (typeof NAV)[number]) => g.items.reduce((a, i) => a + (i.badge?.() ?? 0), 0);
	let me = $state(false);
	const initials = $derived(email.split('@')[0].split(/[._-]/).map((x) => x[0] ?? '').join('').slice(0, 2).toUpperCase() || 'A');

	let queue = $state<Record<string, number>>({});
	let flagsOff = $state(0);
	async function loadQueue() {
		const [q, c] = await Promise.all([supabase.rpc('admin_dashboard', { p_days: 7 }), supabase.rpc('admin_controls')]);
		if (q.data) queue = (q.data as { queue: Record<string, number> }).queue;
		if (c.data) flagsOff = (c.data as { flags: { on: boolean }[] }).flags.filter((f) => !f.on).length;
	}
	let palette = $state(false);
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
		me = false;
	});
	const isMac = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);
	const current = $derived(route.section);
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
	<header class="top">
		<a class="brand" href={href('dashboard')} aria-label="Miracle admin, the dashboard"><Logo size={26} /><b>Miracle</b><span class="bar"></span><span class="adm">Admin</span></a>
		<nav class="tabs" aria-label="Sections">
			{#each NAV as g (g.label)}
				{@const n = groupBadge(g)}
				<a class:on={group === g} href={href(g.items[0].id)} aria-current={group === g ? 'page' : undefined}>{g.label}{#if n}<i class="tb" class:warn={g.items.some((x) => x.warn && (x.badge?.() ?? 0))}>{n}</i>{/if}</a>
			{/each}
		</nav>
		<div class="tools">
			{#if flagsOff}<a class="tag t-warn live" href={href('controls')}>{flagsOff} switch{flagsOff === 1 ? '' : 'es'} off</a>{:else}<span class="live ok" title="Live data"><i></i>Live</span>{/if}
			<button class="ib peach" aria-label="Go to any page" title="Go to… ({isMac ? '⌘' : 'Ctrl'} K)" onclick={() => (palette = true)}><Icon name="plus" /></button>
			<button class="ib" aria-label="Search" title="Search ({isMac ? '⌘' : 'Ctrl'} K)" onclick={() => (palette = true)}><Icon name="search" /></button>
			<a class="ib" href={href('support')} aria-label="Support inbox">
				<Icon name="mail" />{#if queue.support_unread}<span class="dot"></span>{/if}
			</a>
			<div class="me-w">
				<button class="av" aria-label="Your account" aria-expanded={me} onclick={() => (me = !me)}>{initials}</button>
				{#if me}
					<div class="me-m">
						<span class="who" title={email}>{email}</span>
						<button class="btn sm" onclick={onsignout}><Icon name="logout" />Sign out</button>
					</div>
				{/if}
			</div>
		</div>
	</header>

	<div class="body">
		<nav class="rail" aria-label="{group.label} pages">
			{#each group.items as it (it.id)}
				{@const n = it.badge?.() ?? 0}
				<a class="ri" class:on={current === it.id} href={href(it.id)} aria-current={current === it.id ? 'page' : undefined} title={it.label}>
					<span class="rico"><Icon name={it.icon} />{#if n}<i class="nb" class:warn={it.warn}>{n}</i>{/if}</span>
					<span class="rl">{it.label}</span>
				</a>
			{/each}
		</nav>
		<main class="main">
			{#if route.section === 'dashboard'}
				<Dashboard onqueue={(q) => (queue = q)} />
			{:else if route.section === 'signups'}
				<SignupsBoard openId={route.id} onchange={loadQueue} />
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
			{:else if route.section === 'support' && route.id}
				<TicketPage id={route.id} onchange={loadQueue} />
			{:else if route.section === 'problems' && route.id}
				<ProblemPage id={route.id} onchange={loadQueue} />
			{:else if route.section === 'safety' && route.id}
				<SafetyPage id={route.id} onchange={loadQueue} />
			{:else if route.section === 'autopilots'}
				<AutopilotsPage />
			{:else if route.section === 'quotas'}
				<Quotas />
			{:else if route.section === 'billing'}
				<BillingOverview />
			{:else if route.section === 'plans'}
				<PlansPage />
			{:else if route.section === 'plan-invoices'}
				<InvoicesPage />
			{:else if route.section === 'growth'}
				<GrowthPage />
			{:else if route.section === 'waitlist'}
				<WaitlistPage />
			{:else if route.section === 'controls'}
				<Controls onflags={(n) => (flagsOff = n)} />
			{:else if route.section === 'jobs'}
				<Jobs />
			{:else if route.section === 'admins'}
				<Admins />
			{:else if LISTS[route.section]}
				{#key route.section}<ListView config={LISTS[route.section]} onchange={loadQueue} />{/key}
			{:else}
				<div class="card card-empty">This page doesn't exist. <a href={href('dashboard')}>Go to the dashboard</a></div>
			{/if}
		</main>
	</div>
</div>

<Palette bind:open={palette} {screens} />

<style>
	.app { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }
	.top { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 16px; padding: 10px 20px; background: var(--side); color: #fff; }
	.brand { display: flex; align-items: center; gap: 10px; color: #fff; flex: none; }
	.brand:hover { text-decoration: none; color: #fff; }
	.brand b { font-size: 17px; font-weight: 800; letter-spacing: -.01em; }
	.brand .bar { width: 1px; height: 20px; background: #463a47; }
	.brand .adm { font-size: 15px; font-weight: 600; color: #d9cfd8; }
	.tabs { display: flex; gap: 3px; padding: 4px; border-radius: 12px; background: var(--side-2); margin: 0 auto; overflow-x: auto; scrollbar-width: none; max-width: 100%; }
	.tabs a { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 13px; border-radius: 9px; font-size: 13.5px; font-weight: 600; color: var(--side-ink); white-space: nowrap; }
	.tabs a:hover { color: #fff; text-decoration: none; }
	.tabs a.on { background: #3a2e3b; color: #fff; }
	.tb { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 6px; font: 700 11px var(--f-body); font-style: normal; background: #f2994a; color: var(--side); }
	.tb.warn { background: #f25a90; color: #fff; }
	.tools { display: flex; align-items: center; gap: 8px; flex: none; }
	.ib { position: relative; width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; border: 0; background: var(--side-2); color: #fff; }
	.ib:hover { background: #3a2e3b; text-decoration: none; color: #fff; }
	.ib.peach { background: var(--peach); color: var(--side); }
	.ib.peach:hover { background: #ffc08b; color: var(--side); }
	.ib :global(.ic) { width: 18px; height: 18px; }
	.dot { position: absolute; top: 8px; right: 9px; width: 8px; height: 8px; border-radius: 50%; background: #f25a90; }
	.live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; margin-right: 4px; }
	.live.ok { color: #8fd9ad; }
	.live.ok i { width: 7px; height: 7px; border-radius: 50%; background: #3ecf8e; box-shadow: 0 0 0 4px rgba(62, 207, 142, .18); }
	.me-w { position: relative; }
	.av { width: 38px; height: 38px; border-radius: 50%; border: 0; display: grid; place-items: center; background: var(--grad); color: #fff; font-weight: 800; font-size: 13px; }
	.me-m { position: absolute; right: 0; top: 46px; z-index: 40; display: grid; gap: 10px; padding: 14px; min-width: 240px; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
	.me-m .who { font-size: 13px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.me-m .btn { justify-self: start; }
	.body { flex: 1; display: flex; min-width: 0; }
	.rail { position: sticky; top: 58px; align-self: flex-start; height: calc(100vh - 58px); width: 84px; flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 6px; background: var(--surface); border-right: 1px solid var(--line); overflow-y: auto; scrollbar-width: none; }
	.ri { width: 72px; display: grid; justify-items: center; gap: 4px; padding: 8px 2px; border-radius: 12px; color: var(--ink-3); text-align: center; }
	.ri:hover { background: var(--surface-2); color: var(--ink); text-decoration: none; }
	.ri.on { background: var(--accent-soft); color: var(--accent-2); }
	.rico { position: relative; display: grid; place-items: center; width: 24px; height: 24px; }
	.rico :global(.ic) { width: 20px; height: 20px; }
	.rl { font-size: 10.5px; font-weight: 600; line-height: 1.2; }
	.nb { position: absolute; top: -6px; right: -12px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: grid; place-items: center; font: 700 10.5px var(--f-body); font-style: normal; background: #f2994a; color: var(--side); }
	.nb.warn { background: #f25a90; color: #fff; }
	.main { flex: 1; min-width: 0; padding: 26px var(--gut) 56px; }

	@media (max-width: 900px) {
		.top { flex-wrap: wrap; gap: 10px; padding: 10px 14px; }
		.tabs { order: 3; width: 100%; margin: 0; }
		.tools { margin-left: auto; }
		.live { display: none; }
		.body { flex-direction: column; }
		.rail { position: sticky; top: 0; height: auto; width: 100%; flex-direction: row; justify-content: flex-start; overflow-x: auto; padding: 8px 10px; border-right: 0; border-bottom: 1px solid var(--line); z-index: 20; }
		.ri { flex: none; }
	}
</style>
