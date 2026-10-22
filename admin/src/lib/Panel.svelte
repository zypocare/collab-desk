<script lang="ts">
	import Logo from './Logo.svelte';
	import { onMount } from 'svelte';
	import { errMessage, supabase } from './supabase.ts';
	import type { Creator, Overview, Problems, Safety, Status } from './types.ts';
	import { ask, toast } from './ui.svelte.ts';
	import Icon from './Icon.svelte';
	import OverviewTab from './OverviewTab.svelte';
	import RequestsTab from './RequestsTab.svelte';
	import CreatorsTab from './CreatorsTab.svelte';
	import BrandsTab from './BrandsTab.svelte';
	import ProblemsTab from './ProblemsTab.svelte';
	import SafetyTab from './SafetyTab.svelte';

	let { email, onsignout }: { email: string; onsignout: () => void } = $props();

	type Tab = 'overview' | 'requests' | 'creators' | 'brands' | 'problems' | 'safety';
	const TABS: { id: Tab; label: string; icon: string }[] = [
		{ id: 'overview', label: 'Overview', icon: 'chart' },
		{ id: 'requests', label: 'Requests', icon: 'inbox' },
		{ id: 'creators', label: 'Creators', icon: 'users' },
		{ id: 'brands', label: 'Brands', icon: 'board' },
		{ id: 'problems', label: 'Problems', icon: 'alert' },
		{ id: 'safety', label: 'Safety', icon: 'shield' }
	];
	const fromHash = (): Tab => (TABS.find((t) => '#' + t.id === location.hash)?.id ?? 'overview');
	let tab = $state<Tab>(fromHash());
	function go(t: Tab) {
		tab = t;
		history.replaceState(null, '', '#' + t);
	}

	let overview = $state<Overview | null>(null);
	// Badges: new problems today, and accounts with open reports.
	let newProblems = $state(0);
	let openReports = $state(0);
	async function loadBadges() {
		const [p, s] = await Promise.all([supabase.rpc('admin_problems'), supabase.rpc('admin_safety')]);
		if (!p.error) newProblems = (p.data as Problems).new_today;
		if (!s.error) openReports = (s.data as Safety).targets.filter((t) => t.open).length;
	}
	let creators = $state<Creator[] | null>(null);
	let loadErr = $state('');
	let refreshing = $state(false);

	let refreshKey = $state(0);
	async function load() {
		refreshKey++;
		refreshing = true;
		const [o, c] = await Promise.all([supabase.rpc('admin_overview'), supabase.rpc('admin_creators')]);
		refreshing = false;
		loadErr = o.error || c.error ? errMessage(o.error ?? c.error) : '';
		if (!o.error) overview = o.data as Overview;
		if (!c.error) creators = (c.data as Creator[]) ?? [];
	}
	onMount(() => {
		load();
		loadBadges();
		const onHash = () => (tab = fromHash());
		addEventListener('hashchange', onHash);
		return () => removeEventListener('hashchange', onHash);
	});

	const pending = $derived(creators ? creators.filter((c) => c.status === 'pending').length : (overview?.pending ?? 0));

	// Approve, decline, pause or bring back a creator. The function hands back the fresh list.
	let busyId = $state<number | null>(null);
	async function setStatus(c: Creator, to: Status) {
		const who = c.name || c.slug || c.email;
		const at = c.slug ? `${c.slug}.miracleapp.live` : 'Their page';
		const q =
			to === 'active' && c.status === 'paused'
				? { title: `Bring back ${who}?`, body: `${at} opens for brands again and the studio works as before.`, ok: 'Resume' }
				: to === 'active'
					? { title: `Approve ${who}?`, body: c.slug ? `${c.slug}.miracleapp.live goes live and ${c.email} gets the welcome email with a link to the studio.` : `${c.email} gets the welcome email and picks their link, then their page goes live.`, ok: 'Approve' }
					: to === 'declined'
						? { title: `Decline ${who}?`, body: `${c.email} gets a kind email saying it isn't approved for now. They can send the request again.`, ok: 'Decline', danger: true }
						: { title: `Pause ${who}?`, body: `${at} stops taking requests. Their data stays; you can resume any time.`, ok: 'Pause', danger: true };
		if (!(await ask(q))) return;
		busyId = c.id;
		// A declined request is approved the same way as a new one, so the welcome email still goes out.
		if (to === 'active' && c.status === 'declined') {
			const { error } = await supabase.rpc('admin_set_creator', { p_id: c.id, p_status: 'pending' });
			if (error) {
				busyId = null;
				return toast(errMessage(error), true);
			}
		}
		const { data, error } = await supabase.rpc('admin_set_creator', { p_id: c.id, p_status: to });
		busyId = null;
		if (error) return toast(errMessage(error), true);
		creators = (data as Creator[]) ?? [];
		toast(
			to === 'active' && c.status === 'paused' ? `${who} is back on` : to === 'active' ? 'Approved — welcome email sent' : to === 'declined' ? 'Declined — they got a kind email' : `${who} is paused`
		);
		supabase.rpc('admin_overview').then(({ data: o }) => o && (overview = o as Overview));
	}
</script>

<header class="bar">
	<div class="bar-in">
		<a class="mark" href="#overview" onclick={() => go('overview')}><Logo /><b>Miracle</b><small>Admin</small></a>
		<nav class="tabs" aria-label="Sections">
			{#each TABS as t (t.id)}
				<button class="tab" aria-current={tab === t.id ? 'page' : undefined} onclick={() => go(t.id)}>
					<Icon name={t.icon} /><span>{t.label}</span>
					{#if t.id === 'requests' && pending}<i class="badge" aria-label="{pending} waiting">{pending}</i>{/if}
					{#if t.id === 'problems' && newProblems}<i class="badge" aria-label="{newProblems} new">{newProblems} new</i>{/if}
					{#if t.id === 'safety' && openReports}<i class="badge warn" aria-label="{openReports} to look at">{openReports}</i>{/if}
				</button>
			{/each}
		</nav>
		<div class="me">
			<span class="who" title={email}>{email}</span>
			<button class="neo dark sm" onclick={onsignout} aria-label="Sign out" title={email}><Icon name="logout" /><span class="so">Sign out</span></button>
		</div>
	</div>
</header>

<main class="main">
	<header class="ph">
		<div>
			<div class="eb">Miracle · {TABS.find((t) => t.id === tab)?.label}</div>
			<h1>
				{#if tab === 'overview'}How Miracle is <em class="gt">doing</em>
				{:else if tab === 'requests'}Waiting for <em class="gt">you</em>
				{:else if tab === 'creators'}Every <em class="gt">creator</em>
				{:else if tab === 'problems'}What <em class="gt">broke</em>
				{:else if tab === 'safety'}Keeping it <em class="gt">safe</em>
				{:else}Every <em class="gt">brand</em>{/if}
			</h1>
		</div>
		<button class="neo dark sm" onclick={load} disabled={refreshing}>{#if refreshing}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Refresh</button>
	</header>

	{#if loadErr}<div class="err-box">Couldn't load everything: {loadErr}</div>{/if}

	{#if tab === 'overview'}
		<OverviewTab {overview} {pending} onrequests={() => go('requests')} />
	{:else if tab === 'requests'}
		<RequestsTab {creators} {busyId} onset={setStatus} />
	{:else if tab === 'creators'}
		<CreatorsTab {creators} {busyId} onset={setStatus} />
	{:else if tab === 'problems'}
		{#key refreshKey}<ProblemsTab onload={(p) => (newProblems = p.new_today)} />{/key}
	{:else if tab === 'safety'}
		{#key refreshKey}<SafetyTab onload={(s) => (openReports = s.targets.filter((t) => t.open).length)} />{/key}
	{:else}
		<BrandsTab />
	{/if}
</main>

<style>
	.bar { position: sticky; top: 0; z-index: 30; background: color-mix(in oklab, var(--bg) 82%, transparent); -webkit-backdrop-filter: blur(16px) saturate(1.3); backdrop-filter: blur(16px) saturate(1.3); border-bottom: 1px solid var(--line); }
	.bar-in { max-width: 1320px; margin: 0 auto; display: flex; align-items: center; gap: 20px; padding: 12px var(--gut); }
	.mark { display: flex; align-items: center; gap: 10px; text-decoration: none; flex: none; }
	.mark b { font-family: var(--f-display); font-size: 18px; letter-spacing: -.03em; }
	.mark small { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-3); padding: 3px 7px; border: 1px solid var(--line-strong); }
	.tabs { display: flex; gap: 4px; flex: 1; min-width: 0; }
	.tab { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 14px; border: 1px solid transparent; background: none; color: var(--ink-2); font-weight: 600; font-size: 14.5px; white-space: nowrap; }
	.tab:hover { color: var(--ink); }
	.tab[aria-current='page'] { color: var(--ink); background: var(--surface); border-color: var(--line-strong); box-shadow: 3px 3px 0 var(--g2); }
	.tab :global(.ic) { width: 17px; height: 17px; }
	.badge.warn { background: var(--warn); }
	.badge { min-width: 20px; height: 20px; padding: 0 6px; display: inline-grid; place-items: center; border-radius: 999px; background: var(--bad); color: #1c0912; font: 800 11.5px var(--f-body); font-style: normal; }
	.me { display: flex; align-items: center; gap: 12px; min-width: 0; flex: none; }
	.who { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; color: var(--ink-3); }

	.main { max-width: 1320px; margin: 0 auto; padding: 34px var(--gut) 80px; }
	.ph { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 28px; }
	.eb { font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 10px; }
	.ph h1 { font-family: var(--f-serif); font-weight: 400; font-size: clamp(38px, 4.6vw, 56px); line-height: 1.02; letter-spacing: -.01em; }
	.err-box { padding: 14px 16px; margin-bottom: 18px; border: 1px solid color-mix(in oklab, var(--bad) 40%, var(--line)); background: color-mix(in oklab, var(--bad) 8%, var(--surface)); color: color-mix(in oklab, var(--bad) 80%, var(--ink)); }

	/* Six tabs: the signed-in email makes room below wide screens (it's on the Sign out button's title). */
	@media (max-width: 1500px) { .who { display: none; } }
	/* Phone: the tabs move under the top line and scroll sideways. */
	@media (max-width: 760px) {
		.bar-in { flex-wrap: wrap; gap: 10px 12px; padding-block: 10px 0; }
		.mark { margin-right: auto; }
		.who { display: none; }
		.so { display: none; }
		.tabs { order: 3; flex-basis: 100%; overflow-x: auto; scrollbar-width: none; margin: 0 calc(-1 * var(--gut)); padding: 0 var(--gut) 10px; }
		.tab { height: 38px; padding: 0 12px; font-size: 14px; }
		.main { padding-top: 24px; }
		.ph { margin-bottom: 20px; }
	}
</style>
