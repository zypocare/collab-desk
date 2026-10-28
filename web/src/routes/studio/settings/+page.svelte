<script lang="ts">
	import { ask } from '#lib/confirm.svelte.ts';
	import Logo from '#lib/components/Logo.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { loadPackages, saveSettings, studio } from '#lib/studio.svelte.ts';
	import type { PublicPage, Settings } from '#lib/types.ts';
	import { supabase } from '#lib/supabase.ts';
	import { signOut } from '#lib/auth.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { exportEverything } from '#lib/exportAll.ts';
	import { install, pwa } from '#lib/pwa.svelte.ts';
	import { theme, toggleTheme } from '#lib/ui.svelte.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { KINDS, compact, inr, offeredKinds, phoneOk, waShare, titleCase } from '#lib/util.ts';
	import { LANGUAGES } from '#lib/languages.ts';
	import LanguagePicker from '#lib/components/LanguagePicker.svelte';
	import { rateCheck, suggestRates } from '#lib/rateSuggest.ts';
	import Icon from '#lib/components/Icon.svelte';
	import RingIcons from '#lib/components/RingIcons.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import { APP_VERSION, BUILD_LABEL } from '#lib/appVersion.ts';
	import ShippingSettings from '#lib/components/ShippingSettings.svelte';
	import NotificationSettings from '#lib/components/NotificationSettings.svelte';
	import BillingSettings from '#lib/components/BillingSettings.svelte';
	import InstagramSettings from '#lib/components/InstagramSettings.svelte';
	import PriorityRules from '#lib/components/PriorityRules.svelte';
	import PackagesSettings from '#lib/components/PackagesSettings.svelte';
	import AvailabilitySettings from '#lib/components/AvailabilitySettings.svelte';
	import AwayMode from '#lib/components/AwayMode.svelte';
	import { support } from '#lib/support.svelte.ts';
	import OffersSettings from '#lib/components/OffersSettings.svelte';
	import DecisionSettings from '#lib/components/DecisionSettings.svelte';
	import RateLearn from '#lib/components/RateLearn.svelte';
	import RateBenchmark from '#lib/components/RateBenchmark.svelte';
	import ReviewsSettings from '#lib/components/ReviewsSettings.svelte';
	import AppSettings from '#lib/components/AppSettings.svelte';
	import AutopilotSettings from '#lib/components/AutopilotSettings.svelte';
	import CommentDmSettings from '#lib/components/CommentDmSettings.svelte';
	import GetFound from '#lib/components/GetFound.svelte';
	import GetFoundCard from '#lib/components/GetFoundCard.svelte';
	import { agency } from '#lib/agency.svelte.ts';
	import TeamSettings from '#lib/components/TeamSettings.svelte';
	import DeleteAccount from '#lib/components/DeleteAccount.svelte';
	import BlockedList from '#lib/components/BlockedList.svelte';
	import CollabInviteSetting from '#lib/components/CollabInviteSetting.svelte';
	import EmailInbox from '#lib/components/EmailInbox.svelte';
	import SavedReplies from '#lib/components/SavedReplies.svelte';
	import ResetData from '#lib/components/ResetData.svelte';
	import SecuritySettings from '#lib/components/SecuritySettings.svelte';
	import InsightLinks from '#lib/components/InsightLinks.svelte';
	import PageLinks from '#lib/components/PageLinks.svelte';
	import FanList from '#lib/components/FanList.svelte';
	import { clampHints } from '#lib/clampHints.ts';
	import PlanBilling from '#lib/components/PlanBilling.svelte';
	import { loadPlan, plan } from '#lib/plan.svelte.ts';

	const s = $derived(studio.settings!);
	const link = $derived(s.site_url.replace(/\/$/, ''));
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
	const num = (e: Event) => Math.max(0, Number(val(e)) || 0);

	type TextKey = 'display_name' | 'handle' | 'niche' | 'city' | 'followers' | 'engagement' | 'reply_time' | 'app_name' | 'site_url' | 'whatsapp';
	const fields: { k: TextKey; label: string; ph?: string }[] = [
		{ k: 'display_name', label: 'Name' },
		{ k: 'handle', label: 'Instagram handle', ph: 'yourhandle' },
		{ k: 'niche', label: 'What you create' },
		{ k: 'city', label: 'City' },
		{ k: 'followers', label: 'Followers', ph: '248K' },
		{ k: 'engagement', label: 'Avg. engagement', ph: '4.8%' },
		{ k: 'reply_time', label: 'Usual reply time', ph: '2 days' },
		{ k: 'whatsapp', label: 'WhatsApp for brands (optional)', ph: '98450 00000' }
	];
	/** Saves a profile field; a value that can't be right is refused with a message and the old value comes back. */
	function saveText(k: TextKey, v: string, el?: HTMLInputElement) {
		let clean = k === 'handle' ? v.trim().replace(/^@/, '') : v.trim();
		if (k === 'reply_time') clean = clean.replace(/^1 (day|hour|week)s\b/i, '1 $1');
		const problem =
			(k === 'display_name' || k === 'app_name' || k === 'site_url') && !clean ? 'This can’t be empty.'
			: k === 'handle' && clean && !/^[A-Za-z0-9._]{1,30}$/.test(clean) ? 'An Instagram handle has only letters, numbers, dots and underscores (no spaces).'
			: k === 'site_url' && !/^https?:\/\/[^\s/.]+\.[^\s]+$/.test(clean) ? 'Use a full web address, like https://yourdomain.com.'
			: k === 'whatsapp' && !phoneOk(clean) ? 'That number doesn’t look right. Use digits, like 98450 00000.'
			: '';
		if (problem) {
			toast(problem, 'alert');
			if (el) el.value = String(s[k] ?? '');
			return;
		}
		saveSettings({ [k]: clean } as Partial<Settings>);
	}
	// Hand the studio to another email (e.g. hers), optionally keeping the current one as a manager.
	let moving = $state(false);
	let newEmail = $state('');
	let keepMe = $state(true);
	let moveBusy = $state(false);
	async function transferOwner(e: SubmitEvent) {
		e.preventDefault();
		const to = newEmail.trim().toLowerCase();
		const ok = await ask({
			title: `Make ${to} the owner?`,
			body: keepMe
				? `From now on ${to} signs in as the owner. You (${s.creator_email}) stay on the team as a manager and keep getting email copies.`
				: `From now on only ${to} opens this studio. You'll be signed out and won't be able to get back in.`,
			ok: 'Change owner',
			danger: !keepMe
		});
		if (!ok) return;
		moveBusy = true;
		const { error } = await supabase.rpc('studio_transfer', { p_email: to, p_keep_me: keepMe });
		moveBusy = false;
		if (error) return toast(error.message, 'alert');
		if (!keepMe) {
			await signOut();
			return goto('/login', { replaceState: true });
		}
		studio.settings!.creator_email = to;
		const { data } = await supabase.rpc('studio_account');
		studio.me = (data as typeof studio.me) ?? null;
		moving = false;
		toast(`Done. ${to} is the owner now; you're a manager.`);
	}

	// Stories on the insights page: her own averages replace the app's when she types them.
	type StoryKey = 'avg_views' | 'avg_reach' | 'avg_interactions';
	const STORY_FIELDS: { k: StoryKey; label: string }[] = [
		{ k: 'avg_views', label: 'Avg. views per Story' },
		{ k: 'avg_reach', label: 'Avg. reach per Story' },
		{ k: 'avg_interactions', label: 'Avg. replies, shares and taps' }
	];
	const appStory = $derived(((studio.ig?.insights as { formats?: { stories?: Record<string, number> } } | undefined)?.formats?.stories ?? null) as (Partial<Record<StoryKey | 'posts', number>> | null));
	function saveStory(k: StoryKey, v: string) {
		const next = { ...(s.story_stats ?? {}) };
		const n = Math.round(Number(v));
		if (v.trim() === '' || !(n >= 0)) delete next[k];
		else next[k] = n;
		saveSettings({ story_stats: next });
	}

	let kitBusy = $state(false);
	async function kit() {
		kitBusy = true;
		const { data, error } = await supabase.rpc('public_page');
		if (error || !data) toast(`Couldn't make the media kit: ${error?.message ?? 'no data'}`, 'alert');
		else await downloadMediaKit(data as PublicPage, link).catch((e) => toast(`Couldn't make the media kit: ${e}`, 'alert'));
		kitBusy = false;
	}
	const suggested = $derived(suggestRates(studio.ig));
	async function useSuggested() {
		if (!suggested || !(await ask({ title: 'Use the suggested rates?', body: 'Your rate card is replaced with the rates suggested from your Instagram. You can still edit each one.', ok: 'Use suggested' }))) return;
		saveSettings({ rates: { ...s.rates, ...suggested } });
		toast('Rate card updated', 'check');
	}
	const offered = $derived(offeredKinds(s.offered_kinds));
	function toggleKind(k: string, on: boolean, el: HTMLInputElement) {
		const next = on ? KINDS.filter((x) => x === k || offered.includes(x)) : offered.filter((x) => x !== k);
		if (!next.length) {
			el.checked = true;
			return toast('Keep at least one type of content on.', 'alert');
		}
		saveSettings({ offered_kinds: next });
		toast(on ? `${k} is back on your page` : `${k} hidden from brands`, on ? 'eye' : 'x');
	}
	function toggle(k: 'accepting' | 'show_rates' | 'listed', on: boolean) {
		saveSettings({ [k]: on });
		toast(
			k === 'accepting' ? (on ? 'Your page is open for requests' : 'New requests are paused')
			: k === 'listed' ? (on ? 'Brands on Miracle can now find you in Discover' : 'You are no longer listed in Discover')
			: on ? 'Rates shown on your page' : 'Rates hidden from your page'
		);
	}

	// Settings are split into a few sections and only the one she picks is shown.
	// On phones the menu is its own screen: tap a section, and "All settings" (or Back) returns.
	type Sec = 'profile' | 'found' | 'links' | 'rates' | 'bookings' | 'offers' | 'autopilot' | 'payments' | 'reviews' | 'alerts' | 'team' | 'plan' | 'blocked' | 'account';
	const autoOn = $derived([s.autopilot_packages, s.autopilot_counter, s.autopilot_nudge, s.autopilot_brief, s.autopilot_review].filter(Boolean).length);
	const hasPay = $derived(!!(s.upi_id || s.bank_details));
	const sections = $derived<{ id: Sec; label: string; icon: string; sub: string; warn?: string }[]>([
		{
			id: 'profile',
			label: 'Profile & Instagram',
			icon: 'edit',
			sub: studio.ig?.connected ? `@${studio.ig.username} connected` : 'Connect Instagram for live stats',
			warn: studio.ig?.connected ? undefined : 'Instagram not connected'
		},
		{ id: 'found', label: 'Get found by brands', icon: 'search', sub: s.bio?.trim() ? 'Visits, about you, where brands look' : 'Add a line about you' },
		{ id: 'links', label: 'Links & fan list', icon: 'link', sub: s.fan_list_on ? 'Links for followers · fan list on' : 'Links for followers · fan list off' },
		{ id: 'rates', label: 'Rates & packages', icon: 'rupee', sub: `${offered.length} content types · ${studio.packages.filter((k) => k.active).length} packages` },
		{
			id: 'bookings',
			label: 'Bookings & barter',
			icon: 'cal',
			sub: s.accepting ? `Open · ${s.weekly_capacity} a week · barter ${s.barter_mode}` : 'Paused: not taking requests',
			warn: s.accepting ? undefined : 'New requests are paused'
		},
		{
			id: 'offers',
			label: 'Pricing & offers',
			icon: 'gift',
			sub: [s.rebook_offer ? 'Book again on' : 'Book again off', s.demand_pricing ? 'demand pricing on' : 'demand pricing off', s.instant_booking ? 'instant booking on' : 'instant booking off'].join(' · ')
		},
		{ id: 'autopilot', label: 'Auto-pilot', icon: 'spark', sub: autoOn ? `${autoOn} of 5 rules on` : 'All rules off' },
		{
			id: 'payments',
			label: 'Invoices & payments',
			icon: 'wallet',
			sub: hasPay ? `Goal ${inr(s.monthly_goal)} a month` : 'Add UPI or bank details',
			warn: hasPay ? undefined : 'No UPI or bank details yet'
		},
		{ id: 'reviews', label: 'Results & reviews', icon: 'chart', sub: s.show_results ? 'Shown on your page' : 'Hidden from your page' },
		{ id: 'alerts', label: 'Inbox, replies & alerts', icon: 'bell', sub: `${(s.saved_replies ?? []).length} saved replies · ${s.digest_enabled ? '9 AM summary on' : '9 AM summary off'}` },
		{ id: 'team', label: 'Team', icon: 'users', sub: studio.me?.team_role && studio.me.team_role !== 'owner' ? `You are ${studio.me.team_role === 'accountant' ? 'the accountant' : studio.me.team_role === 'assistant' ? 'an assistant' : 'a manager'}` : 'Managers, assistants and an accountant' },
		{ id: 'plan', label: 'Plan & billing', icon: 'spark', sub: plan.data ? `${plan.data.name ?? 'Free'}${plan.data.period === 'trial' ? ` · trial, ${plan.data.days_left} days left` : ''}` : 'Free, Pro and Agency' },
		{ id: 'blocked', label: 'Blocked', icon: 'ban', sub: 'Brands that can’t send you requests' },
		{
			id: 'account',
			label: 'Sign-in, devices & account',
			icon: 'gear',
			sub: s.ship_address ? 'Shipping address added' : 'Add your shipping address',
			warn: s.ship_address ? undefined : 'No shipping address yet'
		}
	]);

	let narrow = $state(false);
	onMount(() => {
		if (!studio.packages.length) loadPackages();
		if (!plan.loaded) loadPlan().catch(() => {});
		const mq = matchMedia('(max-width: 900px)');
		const on = () => (narrow = mq.matches);
		on();
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});
	const asked = $derived(page.url.searchParams.get('s'));
	const active = $derived<Sec | null>(sections.find((x) => x.id === asked)?.id ?? (narrow ? null : 'profile'));
	const current = $derived(sections.find((x) => x.id === active));
	// Phone: My page settings in CRED's layout. Who she is, a few swipe cards, a quick card, then the
	// sections in small groups and what she has earned at the bottom.
	const GROUPS: { label: string; ids: Sec[] }[] = [
		{ label: 'Your page', ids: ['profile', 'found', 'links', 'rates', 'reviews'] },
		{ label: 'Bookings & money', ids: ['bookings', 'offers', 'payments'] },
		{ label: 'How your desk works', ids: ['autopilot', 'alerts', 'team'] },
		{ label: 'Account', ids: ['plan', 'blocked', 'account'] }
	];
	const byId = (id: Sec) => sections.find((x) => x.id === id)!;
	const since = $derived(studio.collabs.reduce((m, c) => (c.received_on && c.received_on < m ? c.received_on : m), '9999').slice(0, 4));
	const earnedAll = $derived(studio.collabs.reduce((a, c) => a + (c.pay_received || 0), 0));
	const doneN = $derived(studio.collabs.filter((c) => c.stage === 'wrapped').length);
	let cardsEl = $state<HTMLElement>();
	let cardI = $state(0);
	const onCards = () => cardsEl && (cardI = Math.round(cardsEl.scrollLeft / Math.max(1, cardsEl.clientWidth * 0.86)));
	const cards = $derived([
		{ icon: 'link', icons: ['link', 'copy', 'check'], tint: 'var(--g2)', eb: 'Your link', text: 'Brands request collabs from your link', act: 'Copy link', run: () => copyText(link, 'Link copied. Put it in your Instagram bio.') },
		{ icon: 'send', icons: ['send', 'mail', 'check'], tint: 'var(--h-live)', eb: 'WhatsApp', text: 'Send brands your rates and request link', act: 'WhatsApp', run: () => window.open(waShare('', `My rates, packages and collab requests: ${link}`), '_blank', 'noopener') },
		{ icon: 'film', icons: ['film', 'doc', 'download'], tint: 'var(--g3)', eb: 'Media kit', text: 'Your media kit, ready to send', act: 'Download', run: kit },
		{ icon: 'qr', icons: ['qr', 'image', 'share'], tint: 'var(--h-request)', eb: 'QR code', text: 'A QR code for events and prints', act: 'Open', run: () => goto('/studio/qr') },
		...(s.show_insights && studio.ig?.connected
			? [
					{ icon: 'chart', icons: ['chart', 'eye', 'share'], tint: 'var(--g1)', eb: 'Insights', text: 'Send brands your live insights', act: 'Copy', run: () => copyText(`${link}/insights`, 'Insights link copied') },
					{ icon: 'share', icons: ['share', 'send', 'chart'], tint: 'var(--h-confirmed)', eb: 'Media kit on WhatsApp', text: 'Your live Instagram numbers, as a link', act: 'WhatsApp', run: () => window.open(waShare('', `My live Instagram numbers (updated every day): ${link}/insights`), '_blank', 'noopener') }
				]
			: [])
	]);

	function open(id: Sec) {
		// Phones: a new screen (Back returns to the menu). Desktop: swap the section in place.
		goto(`?s=${id}`, narrow ? {} : { replace: true, reset: false });
	}
</script>

<svelte:head><title>{phone.on ? 'My page' : 'Settings'} · {s.app_name}</title></svelte:head>

<div class="set-intro" class:sec-open={!!active}>
	<header class="ph rv">
		<div>
			{#if phone.on}
				<div class="eb">Share with brands</div>
				<h1>My <em>page</em></h1>
				<p>Your link for brands, and how you like to work. Pick a section to change it.</p>
			{:else}
				<div class="eb">Your desk</div>
				<h1>Settings</h1>
				<p>Your profile, prices, bookings and how the desk works for you.</p>
			{/if}
		</div>
	</header>

	<div class="set-top" hidden={!phone.on}>
		<section class="linkcard glow rv" style="--i:1">
			<div class="mesh" aria-hidden="true"></div>
			<div class="hc-in">
				<span class="hc-eb">Your link</span>
				<span class="url">{link.replace(/^https?:\/\//, '')}</span>
				<p>Put this in your Instagram bio and send it in DMs. Brands sign in with their work email to send and track requests.</p>
				<div class="row">
					<button class="btn" onclick={() => copyText(link, 'Link copied')}><Icon name="copy" />Copy link</button>
					<a class="btn out wa" href={waShare('', `My rates, packages and collab requests: ${link}`)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp</a>
					{#if s.show_insights && studio.ig?.connected}<button class="btn out" onclick={() => copyText(`${link}/insights`, 'Insights link copied. Send it when brands ask for insights')}><Icon name="chart" />Insights link</button><a class="btn out wa" href={waShare('', `My live Instagram numbers (updated every day): ${link}/insights`)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp media kit</a>{/if}
					<a class="btn out" href="/?preview=1" target="_blank" rel="noopener"><Icon name="eye" />Preview your page</a>
					<button class="btn out" onclick={kit} disabled={kitBusy}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit PDF</button>
				</div>
			</div>
		</section>
	</div>
</div>

<div class="set-shell" class:sec-open={!!active}>
	{#if phone.on && !active}
		<div class="cs-hub">
			<header class="cs-me">
				<a class="cs-av" href="/studio/profile" aria-label="Your profile"><Avatar name={s.display_name} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} size="64px" /><span class="cs-qr"><Icon name="qr" /></span></a>
				<div class="cs-who"><b>{s.display_name}</b><small><Icon name="shield" />@{s.handle}{since !== '9999' ? ` · since ${since}` : ''}</small></div>
				<button class="cs-edit" onclick={() => open('profile')} aria-label="Edit profile"><Icon name="edit" /></button>
			</header>
			{#if agency.studios.length > 1}
				<div class="cs-grp cs-roster"><a class="cs-row" href="/studio/roster"><span class="cs-ico"><Icon name="users" /></span><span class="cs-txt"><b>Your Creators</b><small>Roster and switching · {agency.studios.length} creators</small></span><Icon name="chev" class="cs-chev" /></a></div>
			{/if}
			<div class="cs-cards" bind:this={cardsEl} onscroll={onCards}>
				{#each cards as k, i (k.icon)}
					<div class="cs-card"><span class="cs-eb"><span class="cs-ci" style="--rt:{k.tint}"><RingIcons {i} icons={k.icons} /></span>{k.eb}</span><p>{k.text}</p><button class="cs-cb" onclick={k.run} disabled={k.icon === 'film' && kitBusy}>{#if k.icon === 'film' && kitBusy}<span class="spinner"></span>{:else}{k.act}{/if}</button></div>
				{/each}
			</div>
			<div class="cs-dots" aria-hidden="true">{#each cards as k, i (k.icon)}<i class:on={i === cardI}></i>{/each}</div>
			<!-- Her page at a glance, as a ticket like Needs you on Today. -->
			<div class="tks cs-tk">
				<Ticket
					name={s.display_name || 'Your page'}
					title={s.accepting ? 'Taking requests' : 'Requests paused'}
					sub="Your brand page"
					money={s.accepting ? String(s.weekly_capacity) : '0'}
					moneySub="a week"
					hue="var(--g1)"
					task={link.replace(/^https?:\/\//, '')}
					status={s.accepting ? 'Open for collabs' : 'Brands see you as away'}
					tone={s.accepting ? 'ok' : 'calm'}
					onopen={() => open('bookings')}
				>
					<button class="btn primary" onclick={() => copyText(link, 'Link copied')}><Icon name="copy" />Copy</button>
				</Ticket>
			</div>
			<GetFoundCard onopen={() => open('found')} />
			{#each GROUPS as g (g.label)}
				<div class="cs-h">{titleCase(g.label)}</div>
				<div class="cs-grp">
					{#each g.ids.map(byId) as x, j (x.id)}
						<a class="cs-row" style="--k:{j}" href="?s={x.id}" onclick={(e) => (e.preventDefault(), open(x.id))}><span class="cs-ico" class:warn={!!x.warn}><Icon name={x.icon} /></span><span class="cs-txt"><b>{titleCase(x.label)}</b><small>{x.warn ?? x.sub}</small></span>{#if x.warn}<i class="cs-dot" title={x.warn}></i>{/if}<Icon name="chev" class="cs-chev" /></a>
					{/each}
				</div>
			{/each}
			<div class="cs-h">Help & More</div>
			<div class="cs-grp">
				<a class="cs-row" href="/studio/help"><span class="cs-ico"><Icon name="info" /></span><span class="cs-txt"><b>Help & Support</b><small>{support.unread ? 'New reply from support' : 'Answers, and a ticket to our team'}</small></span>{#if support.unread}<i class="cs-dot" title="New reply from support"></i>{/if}<Icon name="chev" class="cs-chev" /></a>
				<a class="cs-row" href="/studio/qr"><span class="cs-ico"><Icon name="qr" /></span><span class="cs-txt"><b>QR Codes</b><small>Their look, and extra codes for events</small></span><Icon name="chev" class="cs-chev" /></a>
				<a class="cs-row" href="/studio/import"><span class="cs-ico"><Icon name="layers" /></span><span class="cs-txt"><b>Import Collabs</b><small>Bring in deals from DMs or a list</small></span><Icon name="chev" class="cs-chev" /></a>
				<button class="cs-row" onclick={toggleTheme}><span class="cs-ico"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></span><span class="cs-txt"><b>{theme.value === 'dark' ? 'Light Look' : 'Dark Look'}</b><small>Switch the app’s colours</small></span></button>
				{#if pwa.installEvent && !pwa.installed}<button class="cs-row" onclick={install}><span class="cs-ico"><Icon name="download" /></span><span class="cs-txt"><b>Install the App</b><small>Miracle on your home screen</small></span></button>{/if}
			</div>
			<!-- What the desk has done for her, in two big numbers. -->
			<div class="cs-wins">
				<a href="/studio/payments"><small>Earned so far</small><b>{inr(earnedAll)}</b><span>See payments →</span></a>
				<a href="/studio/collabs"><small>Collabs wrapped</small><b>{doneN}</b><span>See collabs →</span></a>
			</div>
			<button class="cs-logout" onclick={async () => (await signOut(), goto('/login', { replaceState: true }))}><Icon name="logout" /><span>Log out</span><small>@{s.handle}</small></button>
			<footer class="cs-foot">
				<Logo size={26} />
				<b>{s.app_name || 'Miracle'}</b>
				<span>Made for creators</span>
				<small>Version {APP_VERSION} · build {BUILD_LABEL}</small>
			</footer>
		</div>
	{/if}
	{#if active && current && phone.on}<h1 class="cs-title">{titleCase(current.label)}</h1>{/if}
	<nav class="set-menu rv" style="--i:2" aria-label="Settings sections" hidden={phone.on && !active}>
		{#each sections as x (x.id)}
			<a class="set-item" class:on={x.id === active} href="?s={x.id}" aria-current={x.id === active ? 'page' : undefined} onclick={(e) => (e.preventDefault(), open(x.id))}>
				<span class="set-ic"><Icon name={x.icon} /></span>
				<span class="set-t"><b>{x.label}</b><small>{x.sub}</small></span>
				{#if x.warn}<span class="set-dot" title={x.warn}></span>{/if}
				<Icon name="chevR" class="set-chev" />
			</a>
		{/each}
		<a class="set-item" href="/studio/qr">
			<span class="set-ic"><Icon name="qr" /></span>
			<span class="set-t"><b>QR codes</b><small>Their look, colours and extra codes for events</small></span>
			<Icon name="chevR" class="set-chev" />
		</a>
		{#if !phone.on}
			<button class="set-item" onclick={toggleTheme}><span class="set-ic"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></span><span class="set-t"><b>{theme.value === 'dark' ? 'Light look' : 'Dark look'}</b><small>How the app looks on this computer</small></span></button>
			<button class="set-item set-out" onclick={async () => (await signOut(), goto('/login', { replaceState: true }))}><span class="set-ic"><Icon name="logout" /></span><span class="set-t"><b>Log out</b><small>@{s.handle}</small></span></button>
			<p class="set-ver">Version {APP_VERSION} · build {BUILD_LABEL}</p>
		{/if}
	</nav>
	{#if active && current}
		<div class="set-body">
			<div class="set-head">
				<button class="set-back" onclick={() => goto('/studio/settings')}><Icon name="chevL" />All settings</button>
				<h2>{current.label}</h2>
			</div>
			{#key active}
				<div class="set-panels" use:clampHints>
					{#if active === 'profile'}
						<section class="panel rv" style="--i:1">
							<div class="panel-h"><h2>Profile</h2><small>shown on your brand page</small></div>
							<div class="form-b">
								{#each fields as f (f.k)}
									<div class="f"><label for="me-{f.k}">{f.label}</label><input class="inp" id="me-{f.k}" value={s[f.k]} placeholder={f.ph ?? ''} onchange={(e) => saveText(f.k, val(e), e.currentTarget)} /></div>
								{/each}
								<div class="f span2">
									<span class="lbl-t">Languages you create content in</span>
									<LanguagePicker label="Languages you create content in" options={LANGUAGES} value={s.content_languages ?? []} onchange={(v) => (v.length ? saveSettings({ content_languages: v }) : toast('Keep at least one language.', 'alert'))} />
									<small class="hint">Shown on your brand page. Brands pick one, or several for mixed-language content.</small>
								</div>
							</div>
						</section>
						<InstagramSettings />
						<section class="panel rv" style="--i:3">
							<div class="switch-row" style="border-top:0">
								<div><b>Share an insights page with brands</b><small>Reach, views, engagement, audience and top posts, live from Instagram, at <a class="lnk" href="/insights" target="_blank" rel="noopener">{link.replace(/^https?:\/\//, '')}/insights</a>. Send it instead of screenshots.</small></div>
								<input type="checkbox" class="tgl" checked={s.show_insights} aria-label="Share an insights page" onchange={(e) => saveSettings({ show_insights: (e.currentTarget as HTMLInputElement).checked })} />
							</div>
							{#if s.show_insights}
								<div class="switch-row">
									<div><b>Show Stories</b><small>Story views and reach on the insights page and in the media kit.</small></div>
									<input type="checkbox" class="tgl" checked={s.insights_stories} aria-label="Show Stories on the insights page" onchange={(e) => saveSettings({ insights_stories: (e.currentTarget as HTMLInputElement).checked })} />
								</div>
								{#if s.insights_stories}
									<div class="story-stats">
										<p class="hint">Instagram keeps Story numbers for only 24 hours, so the app has seen {appStory?.posts ? `only ${appStory.posts} of your Stories` : 'few of your Stories'}. For truer numbers, copy your averages from the Instagram app (Professional dashboard, then Stories). Leave a box empty to use the app's number.</p>
										<div class="story-grid">
											{#each STORY_FIELDS as sf (sf.k)}
												<div class="f">
													<label for="st-{sf.k}">{sf.label}</label>
													<input class="inp num" id="st-{sf.k}" type="number" inputmode="numeric" min="0" placeholder={appStory?.[sf.k] ? `app: ${appStory[sf.k]}` : 'e.g. 1500'} value={s.story_stats?.[sf.k] ?? ''} onchange={(e) => saveStory(sf.k, val(e))} />
												</div>
											{/each}
										</div>
										{#if Object.keys(s.story_stats ?? {}).length}
											<button class="btn sm" onclick={() => saveSettings({ story_stats: {} })}><Icon name="refresh" />Use Instagram's numbers</button>
										{/if}
									</div>
								{/if}
								<InsightLinks />
							{/if}
						</section>
					{:else if active === 'found'}
						<GetFound {link} />
					{:else if active === 'links'}
						<PageLinks />
						<FanList />
					{:else if active === 'rates'}
						<section class="panel rv" style="--i:1">
							<div class="panel-h"><h2>Rate card</h2><small>switch off what you don't offer</small></div>
							{#if suggested}
								<div class="rate-sug">
									<div>
										<b>Suggested from your Instagram</b>
										<small>{compact(studio.ig?.followers ?? 0)} followers · {compact(studio.ig?.avg_views ?? 0)} avg. views · {studio.ig?.engagement_rate ?? '—'}% engagement. A starting point: adjust for your niche and demand.</small>
									</div>
									<button class="btn sm" onclick={useSuggested}><Icon name="spark" />Use suggested</button>
								</div>
							{/if}
							{#each KINDS as k (k)}
								{@const sg = suggested?.[k]}
								{@const cur = s.rates[k] ?? 0}
								{@const on = offered.includes(k)}
								<div class="rate" class:rate-off={!on}>
									<input type="checkbox" class="tgl sm" checked={on} aria-label="Offer {k} to brands" title={on ? 'Brands can request this' : 'Hidden from brands'} onchange={(e) => toggleKind(k, (e.currentTarget as HTMLInputElement).checked, e.currentTarget as HTMLInputElement)} />
									<span>{k}{#if !on}<small class="sug">hidden from brands</small>{:else if sg}<small class="sug" class:low={rateCheck(cur, sg) === 'low'} class:high={rateCheck(cur, sg) === 'high'}>suggested {inr(sg)}{rateCheck(cur, sg) === 'low' ? ' · well below the suggestion' : rateCheck(cur, sg) === 'high' ? ' · well above the suggestion' : ''}</small>{/if}</span>
									<div class="pre"><span>₹</span><input class="inp num" type="number" inputmode="numeric" aria-label="{k} rate" value={s.rates[k] ?? ''} onchange={(e) => saveSettings({ rates: { ...s.rates, [k]: num(e) } })} /></div>
								</div>
							{/each}
							<div class="rate">
								<span>Extra paid usage<small class="hint" style="display:block">% of the fee per 30 days</small></span>
								<div class="pre"><span>%</span><input class="inp num" type="number" inputmode="numeric" min="0" max="200" aria-label="Usage extension rate" value={s.usage_ext_pct} onchange={(e) => saveSettings({ usage_ext_pct: Math.min(200, num(e)) })} /></div>
							</div>
							<div class="switch-row">
								<div><b>Show starting rates</b><small>Brands see "from" prices next to each deliverable.</small></div>
								<input type="checkbox" class="tgl" checked={s.show_rates} aria-label="Show starting rates" onchange={(e) => toggle('show_rates', (e.currentTarget as HTMLInputElement).checked)} />
							</div>
						</section>
						<RateLearn />
						<RateBenchmark />
						<PackagesSettings />
					{:else if active === 'bookings'}
						<section class="panel rv" style="--i:1">
							<div class="switch-row" style="border-top:0">
								<div><b>Accepting collaborations</b><small>Turn off when you're fully booked. Brands can still follow requests they've sent.</small></div>
								<input type="checkbox" class="tgl" checked={s.accepting} aria-label="Accepting collaborations" onchange={(e) => toggle('accepting', (e.currentTarget as HTMLInputElement).checked)} />
							</div>
							<div class="switch-row">
								<div><b>List me in Discover</b><small>Brands signed in to Miracle can find you by name, niche or city and send a request. They see what your page shows: your name, niche, city and Instagram numbers.</small></div>
								<input type="checkbox" class="tgl" checked={!!s.listed} aria-label="List me in Discover" onchange={(e) => toggle('listed', (e.currentTarget as HTMLInputElement).checked)} />
							</div>
						</section>
						<AwayMode />
						<AvailabilitySettings />
						<PriorityRules />
						<DecisionSettings />
					{:else if active === 'offers'}
						<OffersSettings />
					{:else if active === 'autopilot'}
						<AutopilotSettings />
						<CommentDmSettings />
					{:else if active === 'payments'}
						<section class="panel rv" style="--i:1">
							<div class="panel-h"><h2>Income goal</h2><small>tracked on Today</small></div>
							<div class="form-b">
								<div class="f span2"><label for="me-goal">Monthly income goal (₹)</label><input class="inp num" id="me-goal" type="number" inputmode="numeric" value={s.monthly_goal} min="0" onchange={(e) => saveSettings({ monthly_goal: Math.max(0, num(e)) })} /></div>
							</div>
						</section>
						<BillingSettings />
					{:else if active === 'reviews'}
						<ReviewsSettings />
					{:else if active === 'alerts'}
						<AppSettings />
						<EmailInbox />
						<SavedReplies />
						<NotificationSettings />
						<CollabInviteSetting />
					{:else if active === 'team'}
						<TeamSettings />
					{:else if active === 'plan'}
						<PlanBilling side="creator" />
					{:else if active === 'account'}
						<SecuritySettings />
						<ShippingSettings />
						<section class="panel rv" style="--i:3">
							<div class="panel-h"><h2>Export everything</h2><small>a backup for your records or your CA</small></div>
							<div class="form-b" style="display:block">
								<p class="hint" style="margin:0 0 12px">One .zip with a spreadsheet for collabs, brands, invoices, deliverables, messages, expenses and history, plus a complete copy of your data. Works offline too.</p>
								<button class="btn" type="button" onclick={() => toast(`Export ready: ${exportEverything()} files in one .zip`, 'check')}><Icon name="download" />Download all my data</button>
							</div>
						</section>
						<section class="panel rv" style="--i:4">
							<div class="panel-h"><h2>App</h2></div>
							<div class="form-b">
								<div class="f span2"><label for="me-app">App name</label><input class="inp" id="me-app" value={s.app_name} onchange={(e) => saveText('app_name', val(e), e.currentTarget)} /></div>
								<div class="f span2"><label for="me-site">Website address</label><input class="inp" id="me-site" value={s.site_url} placeholder="https://yourdomain.com" onchange={(e) => saveText('site_url', val(e), e.currentTarget)} /></div>
								<div class="f span2">
									<label for="me-email">Owner sign-in email</label>
									{#if !moving}
										<div class="row-inline"><input class="inp" id="me-email" value={s.creator_email} readonly />{#if studio.me?.team_role === 'owner'}<button class="btn sm" type="button" onclick={() => ((moving = true), (newEmail = ''))}>Change</button>{/if}</div>
										<p class="hint" style="margin-top:6px">This email owns the studio. People on your team sign in with their own email.</p>
									{:else}
										<form class="move-owner" onsubmit={transferOwner}>
											<input class="inp" id="me-email" type="email" required placeholder="name@gmail.com" bind:value={newEmail} />
											<label class="chk"><input type="checkbox" bind:checked={keepMe} />Keep me ({s.creator_email}) on as a manager</label>
											<div class="row-inline"><button class="btn sm primary" type="submit" disabled={moveBusy || !newEmail.includes('@')}>Change owner</button><button class="btn sm ghost" type="button" onclick={() => (moving = false)}>Cancel</button></div>
										</form>
									{/if}
								</div>
							</div>
						</section>
						<ResetData />
						<DeleteAccount />
					{:else if active === 'blocked'}
						<BlockedList side="creator" />
					{/if}
				</div>
			{/key}
		</div>
	{/if}
</div>
