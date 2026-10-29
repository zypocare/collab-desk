<script lang="ts">
	import { alerts, watchAlerts } from '#lib/alerts.svelte.ts';
	import { refreshSupportUnread } from '#lib/support.svelte.ts';
	import { afterNavigate, goto } from '$app/navigation';
	import Logo from '#lib/components/Logo.svelte';
	import { edgeSwipeBack, goBackOr } from '#lib/back.ts';
	import { page } from '$app/state';
	import { onMount, tick, untrack } from 'svelte';
	import { watchVoiceUnlock } from '#lib/voice.ts';
	import type { LayoutProps } from './$types';
	import { pageSlug } from '#lib/supabase.ts';
	import { addressFor, appAddress, isAppHost } from '#lib/creatorHost.ts';
	import { auth, homeFor, signOut } from '#lib/auth.svelte.ts';
	import { byId, catchUp, loadStudio, studio, stopWatching, watchStudio } from '#lib/studio.svelte.ts';
	import { ensurePageCard } from '#lib/pageCard.ts';
	import { indexDesk } from '#lib/desk.ts';
	import { theme, toast, toggleTheme, ui } from '#lib/ui.svelte.ts';
	import { firstName, hueOf, initials, inrS, iso, today, unreadFor, titleCase } from '#lib/util.ts';
	import { cascade } from '#lib/motion.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import NewCollabDialog from '#lib/components/NewCollabDialog.svelte';
	import CommandPalette from '#lib/components/CommandPalette.svelte';
	import AskDesk from '#lib/components/AskDesk.svelte';
	import PasskeyNudge from '#lib/components/PasskeyNudge.svelte';
	import MoneyIn from '#lib/components/MoneyIn.svelte';
	import { phone, startPhone } from '#lib/phone.svelte.ts';
	import { agency, loadStudios, useCreator } from '#lib/agency.svelte.ts';
	import { isNative } from '#lib/native.ts';
	import { lively } from '#lib/lively.ts';
	import { net } from '#lib/offline.svelte.ts';

	let palette = $state<CommandPalette>();

	let { children }: LayoutProps = $props();

	// Five places, related pages paired as tabs inside them.
	type Tab = { href: string; label: string };
	// desk: laptop sidebar only (phones reach Messages from the top bar).
	const NAV: { href: string; label: string; short?: string; icon: string; tabs?: Tab[]; also?: string[]; desk?: boolean }[] = [
		{ href: '/studio', label: 'Today', icon: 'home' },
		{ href: '/studio/collabs', label: 'Collabs', icon: 'board', tabs: [{ href: '/studio/collabs', label: 'Board' }, { href: '/studio/brands', label: 'Brands' }, { href: '/studio/pitches', label: 'Pitches' }], also: ['/studio/c/', '/studio/import', '/studio/possible-collabs'] },
		{ href: '/studio/inbox', label: 'Messages', icon: 'inbox', desk: true },
		{ href: '/studio/content', label: 'Plan', icon: 'cal', tabs: [{ href: '/studio/content', label: 'Content' }, { href: '/studio/calendar', label: 'Calendar' }, { href: '/studio/grow', label: 'Grow' }], also: ['/studio/grow/'] },
		{ href: '/studio/money', label: 'Money', icon: 'wallet', tabs: [{ href: '/studio/money', label: 'Overview' }, { href: '/studio/payments', label: 'Payments' }, { href: '/studio/invoices', label: 'Invoices' }, { href: '/studio/reports', label: 'Reports' }] },
		{ href: '/studio/settings', label: 'My page', short: 'Page', icon: 'link', also: ['/studio/profile', '/studio/qr', '/studio/help'] }
	];
	const path = $derived(page.url.pathname);
	// Something new from the server (a request, a payment, a save): a light sweep runs under the top bar.
	let ping = $state(false);
	let lastRev = -1;
	let pingT: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const r = studio.revision;
		if (lastRev >= 0 && r !== lastRev) {
			ping = false;
			clearTimeout(pingT);
			requestAnimationFrame(() => (ping = true));
			pingT = setTimeout(() => (ping = false), 1400);
		}
		lastRev = r;
	});
	// On a laptop Ask your desk sits over the page area with the side menu still showing,
	// so moving to another page from the menu closes it.
	$effect(() => {
		void path;
		untrack(() => (ui.askOpen = false));
	});
	const group = $derived(
		NAV.find((n) => (n.href === '/studio' ? path === '/studio' : [n.href, ...(n.tabs ?? []).map((t) => t.href), ...(n.also ?? [])].some((h) => path.startsWith(h))))
	);
	const current = $derived(group?.href);
	// Tabs show on the paired pages themselves (not on a single collab's page).
	const tabs = $derived(group?.tabs && group.tabs.some((t) => path === t.href) ? group.tabs : null);
	const newCount = $derived(studio.collabs.filter((c) => c.stage === 'request').length);
	const allowed = $derived(auth.account?.role === 'creator');
	// Team roles: an assistant doesn't see money screens; an accountant doesn't talk to brands.
	const role = $derived(studio.me?.team_role ?? 'owner');
	const MONEY = ['/studio/money', '/studio/payments', '/studio/invoices', '/studio/reports'];
	const blocked = (href: string) => (role === 'assistant' && MONEY.some((m) => href.startsWith(m))) || (role === 'accountant' && href.startsWith('/studio/inbox'));
	$effect(() => {
		if (studio.me && blocked(path)) {
			toast(role === 'assistant' ? 'Money screens are for the owner, managers and the accountant.' : 'Messages are for the owner, managers and assistants.', 'alert');
			goto('/studio', { replaceState: true });
		}
	});

	// Opening a collab from anywhere (cards, Today, calendar, search, email links) goes to its own page.
	$effect(() => {
		const id = ui.openCollab;
		if (!id) return;
		untrack(() => {
			const c = byId(id);
			if (c && page.url.pathname !== `/studio/c/${c.code}`) goto(`/studio/c/${c.code}`);
		});
	});

	// Only the creator may be here.
	$effect(() => {
		if (!auth.session) goto(`/login?next=${encodeURIComponent(page.url.pathname + page.url.search)}`, { replaceState: true });
		else if (auth.account && auth.account.role !== 'creator') goto(homeFor(auth.account), { replaceState: true });
	});

	onMount(() => {
		const stopAlerts = watchAlerts();
		refreshSupportUnread();
		watchVoiceUnlock();
		// Back to the tab or window after a while: make sure the screen shows the latest.
		const back = () => document.visibilityState === 'visible' && catchUp();
		document.addEventListener('visibilitychange', back);
		addEventListener('focus', back);
		return () => {
			document.removeEventListener('visibilitychange', back);
			removeEventListener('focus', back);
			stopWatching();
			stopAlerts();
		};
	});
	// Sign-ins are shared across creators' addresses: a creator who opens someone else's address
	// is taken to her own studio.
	$effect(() => {
		const a = auth.account;
		if (a?.role !== 'creator') return;
		// Approved but no link yet: pick it first (on Miracle's own address).
		if (a.needs_link) location.replace(appAddress('/signup'));
		// (The Android and iPhone apps keep her studio on Miracle's own address, where the app's native parts work.)
		else if (!isNative() && a.slug && (pageSlug ? pageSlug !== a.slug : isAppHost(location.hostname))) location.replace(addressFor(a.slug, page.url.pathname + page.url.search));
	});
	// Load and listen once she is signed in (also when the session is restored a moment after this screen opens).
	$effect(() => {
		if (auth.account?.role === 'creator')
			untrack(() => {
				// A little later: the link-preview picture (only if her numbers changed) and search fingerprints for new messages.
				loadStudio().then(() => setTimeout(() => (ensurePageCard(), indexDesk()), 4000));
				watchStudio();
			});
	});

	// This month's money against her goal, shown at the bottom of the sidebar.
	const monthKey = iso(today()).slice(0, 7);
	const monthName = today().toLocaleDateString('en-IN', { month: 'long' });
	const received = $derived(studio.collabs.filter((c) => c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(monthKey)).reduce((a, c) => a + c.pay_received, 0));
	const goal = $derived(studio.settings?.monthly_goal || 0);
	const pct = $derived(goal ? Math.min(1, received / goal) : 0);

	// Sliding highlight behind the current item (sidebar and page tabs).
	let navs = $state<HTMLElement>();
	let ind = $state<HTMLElement>();
	let subs = $state<HTMLElement>();
	let subInd = $state<HTMLElement>();
	const ready = new WeakSet<HTMLElement>();
	function slide(host: HTMLElement | undefined, el: HTMLElement | undefined) {
		const b = host?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!b || !el || !b.offsetWidth) return;
		const first = !ready.has(el);
		if (first) el.style.transition = 'none';
		el.style.width = b.offsetWidth + 'px';
		el.style.height = b.offsetHeight + 'px';
		el.style.transform = `translate(${b.offsetLeft}px,${b.offsetTop}px)`;
		el.style.opacity = '1';
		if (first) {
			void el.offsetWidth;
			el.style.transition = '';
			ready.add(el);
		}
	}
	const moveInd = () => {
		slide(navs, ind);
		slide(subs, subInd);
	};
	$effect(() => {
		void current;
		void path;
		void studio.loaded;
		tick().then(moveInd);
	});
	onMount(() => {
		addEventListener('resize', moveInd);
		document.fonts?.ready.then(moveInd);
		return () => removeEventListener('resize', moveInd);
	});

	// ---------- Phone: laid out like the Instagram app ----------
	const TITLES: Record<string, string> = {
		'/studio/collabs': 'Collabs',
		'/studio/brands': 'Brands',
		'/studio/pitches': 'Pitches',
		'/studio/possible-collabs': 'Possible collabs',
		'/studio/content': 'Content',
		'/studio/calendar': 'Plan',
		'/studio/money': 'Money',
		'/studio/page': 'Brand page',
		'/studio/qr': 'QR codes',
		'/studio/payments': 'Payments',
		'/studio/invoices': 'Invoices',
		'/studio/reports': 'Reports',
		'/studio/settings': 'Settings',
		'/studio/inbox': 'Messages',
		'/studio/import': 'Import collabs',
		'/studio/instagram': 'Instagram',
		'/studio/share': 'Add from a share',
		'/studio/rights': 'Usage rights',
		'/studio/alerts': 'Alerts',
		'/studio/help': 'Help',
		'/studio/help/new': 'Contact support',
		'/studio/help/tickets': 'Your tickets',
		'/studio/tax': 'Tax desk',
		'/studio/grow': 'Grow',
		'/studio/grow/check': 'Check a reel',
		'/studio/grow/checkup': 'Growth check-up',
		'/studio/grow/insights': 'Your insights'
	};
	const SECTIONS: Record<string, string> = {
		profile: 'Edit profile',
		links: 'Links & fan list',
		found: 'Get found',
		rates: 'Rates & packages',
		bookings: 'Bookings & barter',
		offers: 'Pricing & offers',
		autopilot: 'Auto-pilot',
		payments: 'Invoices & payments',
		reviews: 'Results & reviews',
		alerts: 'Inbox, replies & alerts',
		team: 'Team',
		account: 'Sign-in, devices & account'
	};
	const sec = $derived(path === '/studio/settings' ? page.url.searchParams.get('s') : null);
	const detail = $derived(path.startsWith('/studio/c/'));
	const chat = $derived(/^\/studio\/inbox\/./.test(path));
	const openC = $derived(detail ? studio.collabs.find((c) => c.code === path.split('/')[3]) : undefined);
	const brandId = $derived(/^\/studio\/brands\/./.test(path) ? path.split('/')[3] : '');
	const title = $derived(
		path === '/studio/profile' || path === '/studio/inbox' ? (studio.settings?.handle ?? '')
		: openC ? openC.brand.name
		: sec ? titleCase(SECTIONS[sec] ?? '')
		: brandId ? (studio.brands.find((b) => b.id === brandId)?.name ?? 'Brand')
		: path.startsWith('/studio/grow/collab/') ? 'Collab Reel'
		: path.startsWith('/studio/help/tickets/') ? 'Ticket'
		: path.startsWith('/studio/help/') && !TITLES[path] ? 'Help'
		: titleCase(TITLES[path] ?? group?.label ?? '')
	);
	const back = $derived(
		detail ? '/studio/collabs'
		: sec ? '/studio/settings'
		: path === '/studio/settings' ? '/studio/profile'
		: path === '/studio/inbox' ? '/studio'
		: brandId ? '/studio/brands'
		: path.startsWith('/studio/instagram') ? '/studio/content'
		: path.startsWith('/studio/grow/') ? '/studio/grow'
		: /^\/studio\/(import|share|rights)/.test(path) ? '/studio/collabs'
		: path === '/studio/tax' ? '/studio/money'
		: path === '/studio/alerts' ? '/studio'
		: path.startsWith('/studio/help/tickets/') ? '/studio/help/tickets'
		: path.startsWith('/studio/help/') ? '/studio/help'
		: path === '/studio/help' ? '/studio/settings'
		: path === '/studio/qr' ? '/studio/settings'
		: ''
	);
	const unread = $derived(studio.collabs.reduce((a, c) => a + unreadFor(c), 0));
	// The number on the app icon (installed app): unread messages, like the Messages badge.
	$effect(() => {
		const n = unread;
		const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
		if (!studio.loaded) return;
		(n ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {});
	});
	// Phone: cards tilt under the finger, sheets swipe closed, a tapped card grows into its collab.
	lively();
	// Phone: a short vibration on every pressable button (CRED's feel). Android only; iPhone ignores it.
	onMount(() => {
		const press = (e: PointerEvent) => {
			if (!phone.on) return;
			if ((e.target as Element | null)?.closest?.('.btn, .rail .nav, .m-seg a, .cr-more, .wc, .nc-add, .nc-cancel, .nc-pill, .gm-send, .gm-pill, .gm-chip, .gm-yes, .gm-no, .ail-add, .m-stages button')) {
				try {
					navigator.vibrate?.(9);
				} catch {
					/* no vibration */
				}
			}
		};
		addEventListener('pointerdown', press, { passive: true });
		return () => removeEventListener('pointerdown', press);
	});
	// Home-screen shortcuts (long-press the app icon): /studio?new=1 and /studio?ask=1.
	onMount(() => {
		const q = new URLSearchParams(location.search);
		if (!q.has('new') && !q.has('ask')) return;
		if (q.has('new')) ui.newCollab = true;
		if (q.has('ask')) ui.askOpen = true;
		history.replaceState(history.state, '', location.pathname);
	});
	// Back returns to wherever she came from inside the app; from a link, to the screen above it.
	let inApp = false;
	afterNavigate((n) => {
		if (n.from) inApp = true;
	});
	const goBack = () => goBackOr(back || '/studio', inApp);
	onMount(() => edgeSwipeBack(goBack, () => phone.on && !!back));
	onMount(() =>
		startPhone(async () => {
			await loadStudio();
		})
	);
	// The phone's status bar takes the screen's background colour, like an installed app.
	$effect(() => {
		void theme.value;
		void phone.on;
		const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
		if (!meta) return;
		const before = meta.content;
		requestAnimationFrame(() => (meta.content = phone.on ? getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || before : before));
		return () => (meta.content = before);
	});

	// Back online: fetch the latest straight away.
	let wasOffline = false;
	$effect(() => {
		if (!net.online) wasOffline = true;
		else if (wasOffline && studio.loaded) {
			wasOffline = false;
			untrack(() => loadStudio());
		}
	});
	const savedWhen = $derived(net.savedAt ? new Date(net.savedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

	// ---------- Laptop: the Atelier sidebar ----------
	// Seven places on a laptop; Board/Brands/Pitches and Payments/Reports stay as tabs at the top of their page.
	const DESK: { href: string; label: string; icon: string; on: string[] }[] = [
		{ href: '/studio', label: 'Today', icon: 'home', on: [] },
		{ href: '/studio/inbox', label: 'Inbox', icon: 'inbox', on: ['/studio/inbox'] },
		{ href: '/studio/alerts', label: 'Alerts', icon: 'bell', on: ['/studio/alerts'] },
		{ href: '/studio/collabs', label: 'Collabs', icon: 'board', on: ['/studio/collabs', '/studio/brands', '/studio/pitches', '/studio/possible-collabs', '/studio/c/', '/studio/import', '/studio/share', '/studio/rights'] },
		{ href: '/studio/calendar', label: 'Calendar', icon: 'cal', on: ['/studio/calendar'] },
		{ href: '/studio/content', label: 'Content', icon: 'film', on: ['/studio/content', '/studio/instagram'] },
		{ href: '/studio/grow', label: 'Grow', icon: 'spark', on: ['/studio/grow'] },
		{ href: '/studio/money', label: 'Money', icon: 'wallet', on: ['/studio/money', '/studio/payments', '/studio/invoices', '/studio/reports'] },
		{ href: '/studio/page', label: 'Brand page', icon: 'link', on: ['/studio/page', '/studio/profile', '/studio/qr'] },
		{ href: '/studio/settings', label: 'Settings', icon: 'gear', on: ['/studio/settings'] },
		{ href: '/studio/help', label: 'Help', icon: 'info', on: ['/studio/help'] }
	];
	// Managers and agencies who work for several creators: switch between their studios, and the roster.
	$effect(() => {
		if (studio.loaded && !agency.loaded) untrack(() => loadStudios());
	});
	const others = $derived(agency.studios.filter((x) => !x.current));
	async function switchTo(id: number) {
		try {
			await useCreator(id, path);
		} catch (e) {
			toast(e instanceof Error ? e.message : String(e), 'alert');
		}
	}
	const deskCurrent = $derived(DESK.find((n) => (n.href === '/studio' ? path === '/studio' : n.on.some((h) => path.startsWith(h))))?.href);
	const deskTabs = $derived(tabs && group?.href !== '/studio/content' ? tabs : null);
	// Brands that came back more than once, most loyal first.
	const repeatBrands = $derived.by(() => {
		const n = new Map<string, { id: string; name: string; count: number }>();
		for (const c of studio.collabs) {
			if (c.stage === 'declined') continue;
			const b = n.get(c.brand.id) ?? { id: c.brand.id, name: c.brand.name, count: 0 };
			b.count++;
			n.set(c.brand.id, b);
		}
		return [...n.values()].filter((b) => b.count > 1).sort((a, b) => b.count - a.count).slice(0, 3);
	});
	const daysLeft = $derived.by(() => {
		const t = today();
		return new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate() - t.getDate();
	});
	// Search opened from a page (Today's search bar on a laptop).
	$effect(() => {
		if (!ui.searchOpen) return;
		ui.searchOpen = false;
		palette?.show();
	});
	function shortcuts(e: KeyboardEvent) {
		if (e.key === 'j' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			ui.askOpen = true;
			return;
		}
		if (phone.on || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || e.key !== '/') return;
		const t = e.target as HTMLElement | null;
		if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
		e.preventDefault();
		palette?.show();
	}

	async function logout() {
		await signOut();
		goto('/login', { replaceState: true });
	}
</script>

<svelte:window onkeydown={shortcuts} />

{#if allowed}
	<div class="app" class:at={!phone.on} class:m-detail={detail || chat || path === '/studio/inbox' || path === '/studio/import'}>
		{#if !phone.on}
			<nav class="side" aria-label="Main">
				<a class="side-logo" href="/studio">
					<Logo />
					<span>{studio.settings?.app_name ?? 'Miracle'}</span>
				</a>
				<a class="side-me" href="/studio/profile" title="How brands see you">
					<Avatar name={studio.settings?.display_name ?? ''} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} size="36px" />
					<span><b>{firstName(studio.settings?.display_name ?? '')}</b><small>@{studio.settings?.handle ?? ''}{studio.me?.team_role === 'manager' ? ' · manager' : ''}</small></span>
				</a>
				<button class="side-search" onclick={() => palette?.show()} aria-label="Search and actions"><Icon name="search" /><span>Search</span><kbd>Ctrl K</kbd></button>
				<div class="side-nav">
					{#each DESK.filter((n) => !blocked(n.href)) as n (n.href)}
						<a class="side-it" href={n.href} aria-current={deskCurrent === n.href ? 'page' : undefined}
							><Icon name={n.icon} /><span class="side-t">{n.label}</span>{#if n.href === '/studio/inbox' && unread}<span class="side-badge" aria-label="{unread} unread">{unread}</span>{/if}{#if n.href === '/studio/alerts' && alerts.unread}<span class="side-badge" aria-label="{alerts.unread} new">{alerts.unread > 99 ? '99+' : alerts.unread}</span>{/if}{#if n.href === '/studio/collabs' && newCount}<span class="side-new">{newCount} new</span>{/if}</a
						>
					{/each}
				</div>
				{#if others.length}
					<div class="side-lbl">Your creators</div>
					<a class="side-it" href="/studio/roster" aria-current={path === '/studio/roster' ? 'page' : undefined}><Icon name="users" /><span class="side-t">Roster</span></a>
					{#each others as o (o.id)}
						<button class="side-it" onclick={() => switchTo(o.id)} title="Work as {o.name}"><span class="side-b tint" style="--hue:var(--m{hueOf(o.name)})">{initials(o.name)}</span><span class="side-t">{o.name}</span></button>
					{/each}
				{/if}
				{#if repeatBrands.length}
					<div class="side-lbl">Repeat brands</div>
					{#each repeatBrands as b (b.id)}
						<a class="side-it" href="/studio/brands/{b.id}" aria-current={path === `/studio/brands/${b.id}` ? 'page' : undefined}><span class="side-b tint" style="--hue:var(--m{hueOf(b.name)})">{initials(b.name)}</span><span class="side-t">{b.name}</span></a>
					{/each}
				{/if}
				<div class="side-sp"></div>
				{#if goal}
					<a class="side-goal" href="/studio/payments" aria-label="{monthName} goal: {Math.round(pct * 100)} percent">
						<span class="sg-top"><span>{monthName} goal</span><b class="num">{Math.round(pct * 100)}%</b></span>
						<span class="sg-bar"><i style="width:{Math.round(pct * 100)}%"></i></span>
						<small><b class="num">{inrS(received)}</b> of {inrS(goal)} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left</small>
					</a>
				{/if}
				<div class="side-foot">
					<button class="side-tool" onclick={toggleTheme} title="Light / dark"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} />{theme.value === 'dark' ? 'Light mode' : 'Dark mode'}</button>
					<button class="side-tool" onclick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
				</div>
				<!-- The design's foot: Ask your desk, then who's signed in. -->
				<div class="side-end">
					<button class="side-ask" onclick={() => (ui.askOpen = true)}><Icon name="spark" />Ask your desk</button>
					<div class="side-acct">
						<a class="side-who" href="/studio/profile" title="How brands see you">
							<span class="side-av"><Avatar name={studio.settings?.display_name ?? ''} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} size="36px" /></span>
							<span><b>{firstName(studio.settings?.display_name ?? '')}</b><small>@{studio.settings?.handle ?? ''}</small></span>
						</a>
						<button class="side-out" onclick={logout} aria-label="Log out" title="Log out"><Icon name="logout" /></button>
					</div>
				</div>
			</nav>
		{:else}
		<nav class="rail" aria-label="Main">
			<div class="logo">
				<span class="logo-mark"
					><Logo /></span
				>
				<div class="logo-t"><b>{studio.settings?.app_name ?? 'Miracle'}</b><small>Creator studio</small></div>
			</div>
			<div class="rail-lbl">Workspace</div>
			<div class="navs" bind:this={navs} use:cascade={{ selector: '.nav', delay: 0.1, gap: 0.06 }}>
				<span class="nav-ind" bind:this={ind}></span>
				{#each NAV.filter((n) => !n.desk && !blocked(n.href)) as n (n.href)}
					<a class="nav" href={phone.on && n.href === '/studio/settings' ? '/studio/profile' : n.href} aria-current={current === n.href ? 'page' : undefined} aria-label={phone.on && n.href === '/studio/settings' ? 'Profile' : undefined}
						><span class="nav-ic">{#if phone.on && n.href === '/studio/settings'}<Avatar name={studio.settings?.display_name ?? ''} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} size="28px" />{:else}<Icon name={n.icon} />{/if}</span><span class="nav-t" class:nav-long={!!n.short}>{n.label}</span>{#if n.short}<span class="nav-short" aria-hidden="true">{n.short}</span>{/if}{#if n.href === '/studio/inbox' && unread}<span class="badge" aria-label="{unread} unread">{unread}</span>{/if}{#if n.href === '/studio/collabs' && newCount}{#key newCount}<span class="badge" aria-label="{newCount} new"
								>{newCount}</span
							>{/key}{/if}</a
					>
				{/each}
			</div>
			<div class="spacer"></div>
			{#if goal}
				<a class="goal-mini" href="/studio/payments" aria-label="{monthName} goal: {Math.round(pct * 100)} percent">
					<div class="gm-top"><span>{monthName} goal</span><b>{Math.round(pct * 100)}%</b></div>
					<div class="gm-bar"><i style="--p:{pct}"></i></div>
					<small>{inrS(received)} <span>of {inrS(goal)}</span></small>
				</a>
			{/if}
			<div class="rail-foot">
				<div class="me">
					<Avatar name={studio.settings?.display_name ?? ''} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} />
					<div><b>{studio.settings?.display_name ?? ''}</b><small>@{studio.settings?.handle ?? ''}{studio.me?.team_role === 'manager' ? ' · manager access' : ''}</small></div>
					<div class="rail-tools">
						<button class="theme-btn" onclick={toggleTheme} aria-label="Switch light or dark mode" title="Light / dark"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} />{theme.value === 'dark' ? 'Light' : 'Dark'}</button>
						<button class="theme-btn" onclick={logout} aria-label="Sign out" title="Sign out"><Icon name="logout" />Sign out</button>
					</div>
				</div>
			</div>
		</nav>
		{/if}
		<main class="main">
			{#if phone.on && !chat}
				<header class="m-bar" class:scrolled={phone.scrolled} class:sub={!!back} class:hide={phone.hide && !back} class:cs={path === '/studio/settings'} class:cs-sub={path === '/studio/settings' && !!sec}><span class="m-live" class:ping aria-hidden="true"></span>
					{#if back}
						<button class="m-ib m-back" onclick={goBack} aria-label="Back"><Icon name={path === '/studio/settings' && sec ? 'back' : 'chevL'} /></button>
						{#key title}<div class="m-title">{title}</div>{/key}
						<div class="m-r">{#if path === '/studio/settings' && !sec}<a class="cs-pill" href="/?preview=1" target="_blank" rel="noopener"><Icon name="eye" />Preview</a>{/if}</div>
					{:else}
						<div class="m-brand" class:wordmark={path === '/studio'}>{path === '/studio' ? (studio.settings?.app_name ?? 'Miracle') : title}</div>
						<div class="m-r">
							{#if path === '/studio' || path === '/studio/collabs' || path === '/studio/profile'}<button class="m-ib" onclick={() => (ui.newCollab = true)} aria-label="New collab"><Icon name="plus" /></button>{/if}
							{#if path === '/studio'}<button class="m-ib m-ask" onclick={() => (ui.askOpen = true)} aria-label="Ask your desk"><Icon name="spark" /></button>{/if}
							{#if path === '/studio/profile'}
								<a class="m-ib" href="/studio/settings" aria-label="Settings and activity"><Icon name="menu" /></a>
							{:else}
								<button class="m-ib" onclick={() => palette?.show()} aria-label="Search and actions"><Icon name="search" /></button>
							{/if}
							{#if path === '/studio'}<a class="m-ib" href="/studio/alerts" aria-label="Alerts{alerts.unread ? `, ${alerts.unread} new` : ''}"><Icon name="bell" />{#if alerts.unread}<span class="m-badge">{alerts.unread > 99 ? '99+' : alerts.unread}</span>{/if}</a>{/if}
							{#if path === '/studio'}<a class="m-ib" href="/studio/inbox" aria-label="Messages{unread ? `, ${unread} unread` : ''}"><Icon name="send" />{#if unread}<span class="m-badge">{unread}</span>{/if}</a>{/if}
						</div>
					{/if}
				</header>
				{#if tabs}
					<nav class="m-seg" aria-label="{group?.label} pages" style="--n:{tabs.length};--i:{Math.max(0, tabs.findIndex((t) => t.href === path))}">
						{#each tabs as t (t.href)}<a href={t.href} aria-current={path === t.href ? 'page' : undefined}>{t.label}</a>{/each}
					</nav>
				{/if}
			{/if}
			{#if !net.online}
				<div class="offline-bar" role="status"><span class="ob-dot"></span><span><b>You're offline.</b> Showing what was saved{savedWhen ? ` at ${savedWhen}` : ''}. Changes need a connection.</span></div>
			{/if}
			{#if studio.error}
				<div class="err-box">Couldn't load your data: {studio.error}</div>
			{/if}
			{#if studio.loaded}
				{#if phone.on}
					{@render children()}
				{:else}
					<!-- Laptop: pages sit at a readable width; the board uses all of it. -->
					<div class="pg">
						<div class="at-bar" class:at-flow={detail} hidden={path.startsWith('/studio/inbox')}>
							{#if detail}<a class="at-back" href="/studio/collabs"><Icon name="chevL" />Collabs</a>{/if}
							{#if deskTabs}
								<nav class="subtabs at-tabs" aria-label="{group?.label} pages" bind:this={subs}>
									<span class="sub-ind" bind:this={subInd}></span>
									{#each deskTabs as t (t.href)}<a href={t.href} aria-current={path === t.href ? 'page' : undefined}>{t.label}</a>{/each}
								</nav>
							{/if}
							{#if !detail && path !== '/studio'}
								<button class="btn at-ask" onclick={() => (ui.askOpen = true)} title="Ask your desk (Ctrl J)"><Icon name="spark" />Ask Desk</button>
								<button class="btn grad at-new" onclick={() => (ui.newCollab = true)}><Icon name="plus" />New collab</button>
							{/if}
						</div>
						{@render children()}
					</div>
				{/if}
			{:else if !studio.error && phone.on}
				<div class="skel" aria-label="Loading">
					<div class="skel-row">{#each [0, 1, 2, 3, 4] as i (i)}<span class="sk sk-c"></span>{/each}</div>
					{#each [0, 1, 2, 3, 4, 5] as i (i)}<div class="skel-li"><span class="sk sk-av"></span><span class="skel-t"><span class="sk sk-l"></span><span class="sk sk-s"></span></span></div>{/each}
				</div>
			{:else if !studio.error}
				<div class="loader" style="min-height:60vh"><span class="ring"><span></span></span></div>
			{/if}
		</main>
		<button class="fab" onclick={() => (ui.newCollab = true)} aria-label="Add collab"><Icon name="plus" /></button>
	</div>
	<CommandPalette bind:this={palette} />
	{#if ui.askOpen}<AskDesk onclose={() => (ui.askOpen = false)} />{/if}
	{#if studio.loaded}<PasskeyNudge />{/if}
	<MoneyIn />
	{#if ui.newCollab}<NewCollabDialog />{/if}
{/if}
