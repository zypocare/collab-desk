<script lang="ts">
	import { extractMapsUrl, resolveMapsLink, reverseGeocode, searchPlaces, TRAVEL_MODES, type PlaceCandidate, type TravelMode } from '#lib/travel.ts';
	import { ask } from '#lib/confirm.svelte.ts';
	import Logo from '#lib/components/Logo.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { loadPackages, saveSettings, studio } from '#lib/studio.svelte.ts';
	import type { PublicPage, Settings } from '#lib/types.ts';
	import { supabase } from '#lib/supabase.ts';
	import { signOut, signOutTo } from '#lib/auth.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { exportEverything } from '#lib/exportAll.ts';
	import { install, pwa } from '#lib/pwa.svelte.ts';
	import { theme, toggleTheme } from '#lib/ui.svelte.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { KINDS, compact, inr, offeredKinds, phoneOk, waShare, titleCase } from '#lib/util.ts';
	import { LANGUAGES } from '#lib/languages.ts';
	import LanguagePicker from '#lib/components/LanguagePicker.svelte';
	import Select from '#lib/components/Select.svelte';
	import { rateCheck, suggestRates } from '#lib/rateSuggest.ts';
	import Icon from '#lib/components/Icon.svelte';
	import MapPicker from '#lib/components/MapPicker.svelte';
	import RingIcons from '#lib/components/RingIcons.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import { appVersion } from '#lib/appVersion.svelte.ts';
	import ShippingSettings from '#lib/components/ShippingSettings.svelte';
	import NotificationSettings from '#lib/components/NotificationSettings.svelte';
	import BillingSettings from '#lib/components/BillingSettings.svelte';
	import InstagramSettings from '#lib/components/InstagramSettings.svelte';
	import PriorityRules from '#lib/components/PriorityRules.svelte';
	import PackagesSettings from '#lib/components/PackagesSettings.svelte';
	import BundleSettings from '#lib/components/BundleSettings.svelte';
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
	import StorySheet from '#lib/components/StorySheet.svelte';
	import { MIRACLE_IG } from '#lib/native.ts';

	const s = $derived(studio.settings!);
	// Her birthday (day and month): saved once both are picked, since the database keeps them together.
	const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	let homeInput = $state('');
	let homeHydrated = $state(false);
	let homeLocating = $state(false);
	$effect(() => {
		if (!homeHydrated && s && (s.home_address || s.home_area)) {
			homeInput = s.home_address || s.home_area || '';
			homeHydrated = true;
		}
	});
	let homeGpsBusy = $state(false);
	let homeMapOpen = $state(false);
	const onLocationCollabs = $derived(
		studio.collabs.filter(
			(c) => c.shoot_mode === 'location' && !['wrapped', 'declined', 'cancelled'].includes(c.stage)
		)
	);
	let homePicks = $state<PlaceCandidate[]>([]);
	async function applyHomePin(place: { lat: number; lng: number; label: string }) {
		await saveSettings({ home_area: place.label, home_address: place.label, home_lat: place.lat, home_lng: place.lng });
		homeInput = place.label;
		homePicks = [];
		toast(`Private Home Base pinned to ${place.label}`, 'check');
	}
	async function saveHomeBase() {
		const q = homeInput.trim();
		if (!q) return toast('Enter your area or paste a Google Maps link', 'alert');
		homeLocating = true;
		homePicks = [];
		try {
			if (extractMapsUrl(q) || /@-?\d+\.\d+,-?\d+\.\d+/.test(q) || /!3d-?\d+\.\d+!4d-?\d+\.\d+/.test(q)) {
				const pin = await resolveMapsLink(q);
				if (!pin) return toast("Couldn't read that Google Maps link. Copy the Share link from Google Maps.", 'alert');
				await applyHomePin(pin);
				return;
			}
			const hits = await searchPlaces(q, { cityHint: s?.city ?? '' });
			if (!hits.length) return toast("Couldn't find that address. Tap Pick on Google Maps, copy the Share link and paste it here.", 'alert');
			if (hits.length === 1) {
				await applyHomePin(hits[0]);
			} else {
				homePicks = hits;
			}
		} finally {
			homeLocating = false;
		}
	}
	async function pasteHomeMapsLink() {
		try {
			const clip = (await navigator.clipboard.readText()).trim();
			if (!clip) return toast('Clipboard is empty. Copy a Share link from Google Maps first.', 'alert');
			homeInput = clip;
			await saveHomeBase();
		} catch {
			toast('Tap the address box and paste the Google Maps link directly.', 'alert');
		}
	}
	async function useGpsHomeBase() {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			return toast('GPS is not available on this device', 'alert');
		}
		homeGpsBusy = true;
		navigator.geolocation.getCurrentPosition(
			async (pos) => {
				try {
					const lat = +pos.coords.latitude.toFixed(5);
					const lng = +pos.coords.longitude.toFixed(5);
					const label = await reverseGeocode(lat, lng);
					await saveSettings({ home_area: label, home_address: label, home_lat: lat, home_lng: lng });
					homeInput = label;
					toast(`Home Base pinned to ${label}`, 'check');
				} finally {
					homeGpsBusy = false;
				}
			},
			(err) => {
				homeGpsBusy = false;
				const msg =
					err?.code === 1
						? 'Location permission not granted. Allow Location in app settings, or tap Save home base.'
						: err?.code === 3
							? 'GPS timed out. Tap Save home base to locate by address.'
							: 'GPS signal unavailable. Tap Save home base to locate by address.';
				toast(msg, 'alert');
			},
			{ enableHighAccuracy: false, timeout: 10000 }
		);
	}
	let bdPending = $state<{ d: number | null; m: number | null }>({ d: null, m: null });
	const bdMonth = $derived(bdPending.m ?? s.birth_month ?? null);
	const bdayDays = $derived(Array.from({ length: bdMonth === 2 ? 29 : bdMonth && [4, 6, 9, 11].includes(bdMonth) ? 30 : 31 }, (_, i) => i + 1));
	function saveBirthday(d: number | null, m: number | null) {
		const day = d ?? bdPending.d, month = m ?? bdPending.m;
		if (!day || !month) {
			bdPending = { d: day, m: month };
			return;
		}
		const max = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
		bdPending = { d: null, m: null };
		saveSettings({ birth_day: Math.min(day, max), birth_month: month });
		toast('Birthday saved');
	}
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
			return signOutTo('/login');
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
	let storyOpen = $state(false);
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
			: k === 'listed' ? (on ? 'Brands on Miracle can now find you in Explore' : 'You are no longer listed in Explore')
			: on ? 'Rates shown on your page' : 'Rates hidden from your page'
		);
	}

	// Settings are split into a few sections and only the one she picks is shown.
	// On phones the menu is its own screen: tap a section, and "All settings" (or Back) returns.
	type Sec = 'profile' | 'found' | 'links' | 'rates' | 'bookings' | 'offers' | 'travel' | 'autopilot' | 'payments' | 'reviews' | 'alerts' | 'team' | 'plan' | 'blocked' | 'account';
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
		{ id: 'rates', label: 'Rates & packages', icon: 'rupee', sub: `${offered.length} content types · ${s.bundle_on !== false ? 'brands build packages' : `${studio.packages.filter((k) => k.active).length} packages`}` },
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
		{
			id: 'travel',
			label: 'Home base & travel',
			icon: 'pin',
			sub: (s.home_address || s.home_area)
				? `${s.home_address || s.home_area} · ${TRAVEL_MODES[(s.travel_mode as TravelMode) || 'cab']?.label ?? 'Cab'}`
				: 'Set private home base for on-location shoots'
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
		{ label: 'How your desk works', ids: ['travel', 'autopilot', 'alerts', 'team'] },
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
		{ icon: 'insta', icons: ['insta', 'image', 'share'], tint: 'var(--g1)', eb: 'Instagram Story', text: 'A picture of your page to post on your Story', act: 'Share', run: () => (storyOpen = true) },
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
					<button class="btn out" onclick={() => (storyOpen = true)}><Icon name="insta" />Share to Story</button>
					<a class="btn out wa" href={waShare('', `My rates, packages and collab requests: ${link}`)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp</a>
					{#if s.show_insights && studio.ig?.connected}<button class="btn out" onclick={() => copyText(`${link}/insights`, 'Insights link copied. Send it when brands ask for insights')}><Icon name="chart" />Insights link</button><a class="btn out wa" href={waShare('', `My live Instagram numbers (updated every day): ${link}/insights`)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp media kit</a>{/if}
					<a class="btn out" href="/?preview=1" target="_blank" rel="noopener"><Icon name="eye" />Preview your page</a>
					<button class="btn out" onclick={kit} disabled={kitBusy}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit PDF</button>
				</div>
			</div>
		</section>
	</div>
</div>

{#if storyOpen}<StorySheet onclose={() => (storyOpen = false)} />{/if}
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
				<a class="cs-row" href={MIRACLE_IG} target="_blank" rel="noopener"><span class="cs-ico"><Icon name="insta" /></span><span class="cs-txt"><b>Miracle on Instagram</b><small>@themiracleapp · Tips, new features and creator stories</small></span><Icon name="chev" class="cs-chev" /></a>
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
			<button class="cs-logout" onclick={() => signOutTo('/login')}><Icon name="logout" /><span>Log out</span><small>@{s.handle}</small></button>
			<footer class="cs-foot">
				<Logo size={26} />
				<b>{s.app_name || 'Miracle'}</b>
				<span>Made for creators</span>
				<small>{appVersion.line}</small>
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
		<a class="set-item" href={MIRACLE_IG} target="_blank" rel="noopener">
			<span class="set-ic"><Icon name="insta" /></span>
			<span class="set-t"><b>Miracle on Instagram</b><small>@themiracleapp · Tips, new features and creator stories</small></span>
			<Icon name="chevR" class="set-chev" />
		</a>
		<a class="set-item" href="/studio/qr">
			<span class="set-ic"><Icon name="qr" /></span>
			<span class="set-t"><b>QR codes</b><small>Their look, colours and extra codes for events</small></span>
			<Icon name="chevR" class="set-chev" />
		</a>
		{#if !phone.on}
			<button class="set-item" onclick={toggleTheme}><span class="set-ic"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></span><span class="set-t"><b>{theme.value === 'dark' ? 'Light look' : 'Dark look'}</b><small>How the app looks on this computer</small></span></button>
			<button class="set-item set-out" onclick={() => signOutTo('/login')}><span class="set-ic"><Icon name="logout" /></span><span class="set-t"><b>Log out</b><small>@{s.handle}</small></span></button>
			<p class="set-ver">{appVersion.line}</p>
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
								<!-- Her birthday: day and month only, private (never on her page). Today turns into a birthday card,
								     and Miracle wishes her on the day (migration 181). -->
								<div class="f span2 bd-f">
									<span class="lbl-t">Your birthday <span class="hint">(private, never shown on your page)</span></span>
									<div class="bd-pick">
										<Select id="me-bday-d" ariaLabel="Birthday day" placeholder="Day" value={bdPending.d ? String(bdPending.d) : s.birth_day ? String(s.birth_day) : undefined} options={bdayDays.map((d) => ({ value: String(d), label: String(d) }))} onchange={(v) => saveBirthday(Number(v) || null, s.birth_month ?? null)} />
										<Select id="me-bday-m" ariaLabel="Birthday month" placeholder="Month" value={bdPending.m ? String(bdPending.m) : s.birth_month ? String(s.birth_month) : undefined} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} onchange={(v) => saveBirthday(s.birth_day ?? null, Number(v) || null)} />
										{#if s.birth_day || s.birth_month}<button class="lnk" onclick={() => ((bdPending = { d: null, m: null }), saveSettings({ birth_day: null, birth_month: null }))}>Remove</button>{/if}
									</div>
									<small class="hint">On your birthday your Today screen celebrates with you, and we send you a little note.</small>
								</div>
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
						<BundleSettings />
						<RateLearn />
						<RateBenchmark />
						{#if s.bundle_on === false}<PackagesSettings />{/if}
					{:else if active === 'bookings'}
						<section class="panel rv" style="--i:1">
							<div class="switch-row" style="border-top:0">
								<div><b>Accepting collaborations</b><small>Turn off when you're fully booked. Brands can still follow requests they've sent.</small></div>
								<input type="checkbox" class="tgl" checked={s.accepting} aria-label="Accepting collaborations" onchange={(e) => toggle('accepting', (e.currentTarget as HTMLInputElement).checked)} />
							</div>
							<div class="switch-row">
								<div><b>List me in Explore</b><small>Brands signed in to Miracle can find you by name, niche or city and send a request. They see what your page shows: your name, niche, city and Instagram numbers.</small></div>
								<input type="checkbox" class="tgl" checked={!!s.listed} aria-label="List me in Explore" onchange={(e) => toggle('listed', (e.currentTarget as HTMLInputElement).checked)} />
							</div>
						</section>
						<AwayMode />
						<AvailabilitySettings />
						<PriorityRules />
						<DecisionSettings />
					{:else if active === 'offers'}
						<OffersSettings />
					{:else if active === 'travel'}
						<div class="hb-page rv" style="--i:1">
							<!-- 1. Hero Card: Private Home / Studio Base -->
							<section class="panel hb-hero">
								<div class="hb-hero-top">
									<div class="hb-privacy">
										<Icon name="shield" />
										<span>Private · never shown to brands</span>
									</div>
									{#if typeof s.home_lat === 'number' && typeof s.home_lng === 'number'}
										<button
											type="button"
											class="hb-rm"
											onclick={() => {
												homeInput = '';
												homePicks = [];
												saveSettings({ home_area: '', home_address: '', home_lat: null, home_lng: null });
												toast('Home Base cleared', 'check');
											}}
										>
											Clear pin
										</button>
									{/if}
								</div>

								{#if typeof s.home_lat === 'number' && typeof s.home_lng === 'number'}
									<div class="hb-pinned-hero">
										<div class="hb-pin-dot" aria-hidden="true"><Icon name="pin" /></div>
										<div class="hb-pin-meta">
											<small>Pinned home / studio</small>
											<h3>{s.home_address || s.home_area || 'Pinned location'}</h3>
											<code>{s.home_lat.toFixed(4)}, {s.home_lng.toFixed(4)}</code>
										</div>
									</div>
								{:else}
									<div class="hb-empty-hero">
										<div class="hb-pin-dot idle" aria-hidden="true"><Icon name="pin" /></div>
										<div>
											<h3>Set your starting point</h3>
											<p>Calculate exact road distance, cab fares and traffic-smart leave times for every on-location shoot.</p>
										</div>
									</div>
								{/if}

								<div class="hb-field">
									<label for="hb-addr">Search neighbourhood or paste Google Maps link</label>
									<div class="hb-inp-wrap">
										<input
											id="hb-addr"
											class="hb-inp"
											placeholder="e.g. JP Nagar 7th Phase, Bengaluru"
											bind:value={homeInput}
										/>
										{#if homeInput}
											<button
												type="button"
												class="hb-clr"
												aria-label="Clear address"
												onclick={() => {
													homeInput = '';
													homePicks = [];
												}}
											>×</button>
										{/if}
									</div>
									<div class="hb-actions">
										<button type="button" class="hb-neo" disabled={homeLocating} onclick={saveHomeBase}>
											{homeLocating ? 'Locating…' : 'Find & save'}
										</button>
										<button type="button" class="hb-gps" disabled={homeGpsBusy} onclick={useGpsHomeBase}>
											<Icon name="pin" />{homeGpsBusy ? 'Getting GPS…' : 'Use GPS'}
										</button>
									</div>
									<div class="hb-gmaps">
										<button type="button" class="hb-gbtn hi" onclick={() => (homeMapOpen = true)}>
											<Icon name="pin" />Pick on interactive map
										</button>
										<button type="button" class="hb-gbtn" disabled={homeLocating} onclick={pasteHomeMapsLink}>
											<Icon name="link" />Paste Maps link
										</button>
									</div>

									{#if homePicks.length}
										<div class="hb-picks" role="listbox" aria-label="Matching home locations">
											<span class="hb-picks-h">Tap the exact place to pin:</span>
											{#each homePicks as p (p.lat + ',' + p.lng + p.name)}
												<button type="button" class="hb-pick" onclick={() => applyHomePin(p)}>
													<b>{p.name}</b>
													{#if p.sub}<small>{p.sub}</small>{/if}
												</button>
											{/each}
										</div>
									{/if}
								</div>
							</section>

							<!-- 2. Transport & Cost Estimator -->
							<section class="panel hb-card">
								<div class="panel-h">
									<h2>How you travel to shoots</h2>
									<small>used for round-trip cost &amp; time</small>
								</div>
								<div class="hb-mode-grid" role="radiogroup" aria-label="Default travel mode">
									{#each Object.entries(TRAVEL_MODES) as [k, m] (k)}
										<button
											type="button"
											class="hb-mode-card"
											class:on={(s.travel_mode || 'cab') === k}
											onclick={() => saveSettings({ travel_mode: k as TravelMode })}
										>
											<div class="hb-mc-top">
												<b>{m.label}</b>
												{#if (s.travel_mode || 'cab') === k}<span class="hb-mc-dot" aria-hidden="true"></span>{/if}
											</div>
											<small>~₹{m.ratePerKm}/km{m.base ? ` + ₹${m.base} base` : ''} · {m.speedKmh} km/h avg</small>
										</button>
									{/each}
								</div>
							</section>

							<!-- 3. Arrival Buffer -->
							<section class="panel hb-card">
								<div class="panel-h">
									<h2>Arrival buffer before shoot</h2>
									<small>added to leave-early nudges</small>
								</div>
								<div class="hb-buf-grid" role="radiogroup" aria-label="Arrival buffer">
									{#each [
										{ mins: 10, tag: 'Quick', note: 'Minimal parking time' },
										{ mins: 15, tag: 'Ideal', note: 'Parking & setup cushion' },
										{ mins: 25, tag: 'Relaxed', note: 'Extra gear & check-in' }
									] as b (b.mins)}
										<button
											type="button"
											class="hb-buf-card"
											class:on={(s.travel_buffer_mins ?? 15) === b.mins}
											onclick={() => saveSettings({ travel_buffer_mins: b.mins })}
										>
											<strong>+{b.mins}m</strong>
											<span>{b.tag}</span>
											<small>{b.note}</small>
										</button>
									{/each}
								</div>
							</section>

							<!-- 4. Active On-Location Collabs -->
							<section class="panel hb-card">
								<div class="panel-h">
									<h2>On-location shoots</h2>
									<small>{onLocationCollabs.length} active</small>
								</div>
								{#if onLocationCollabs.length}
									<div class="hb-shoots">
										{#each onLocationCollabs as col (col.id)}
											<a class="hb-shoot-row" href="/studio/collabs?open={col.id}">
												<div class="hb-shoot-l">
													<b>{col.brand.name}</b>
													<small>{col.venue_address || col.venue_name || 'Location set'}</small>
												</div>
												<div class="hb-shoot-r">
													{#if col.travel_km}
														<em>{col.travel_km} km</em>
													{/if}
													<Icon name="chevR" />
												</div>
											</a>
										{/each}
									</div>
								{:else}
									<p class="hb-note">No collabs marked on-location yet. Open any collab under <b>Work → Shoot location &amp; travel</b> and switch to <b>On-location</b>.</p>
								{/if}
							</section>
						</div>
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

{#if homeMapOpen}
	<MapPicker
		title="Pin your Home Base"
		initialLat={typeof s.home_lat === 'number' ? s.home_lat : 12.9716}
		initialLng={typeof s.home_lng === 'number' ? s.home_lng : 77.5946}
		initialLabel={s.home_address || s.home_area || ''}
		cityHint={s.city ?? ''}
		onclose={() => (homeMapOpen = false)}
		onpick={(place) => {
			homeMapOpen = false;
			void applyHomePin(place);
		}}
	/>
{/if}

<style>
	.hb-page { display: grid; gap: 14px; padding-bottom: 18px; }
	.hb-hero {
		padding: 18px;
		display: grid;
		gap: 16px;
		background:
			radial-gradient(120% 80% at 0% 0%, rgba(156, 123, 255, 0.14), transparent 58%),
			radial-gradient(90% 70% at 100% 100%, rgba(242, 90, 144, 0.08), transparent 60%),
			var(--surface, #161116);
		border: 1px solid rgba(156, 123, 255, 0.25);
	}
	.hb-hero-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
	.hb-privacy { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); }
	.hb-privacy :global(svg) { width: 14px; height: 14px; color: #c8b6ff; }
	.hb-rm { border: 0; background: transparent; color: #fda4af; font-size: 12px; font-weight: 600; text-decoration: underline; cursor: pointer; flex-shrink: 0; }

	.hb-pinned-hero, .hb-empty-hero {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px;
		border-radius: 14px;
		border: 1px solid rgba(52, 211, 153, 0.28);
		background: rgba(16, 185, 129, 0.08);
	}
	.hb-empty-hero {
		border-style: dashed;
		border-color: rgba(156, 123, 255, 0.35);
		background: rgba(156, 123, 255, 0.06);
	}
	.hb-pin-dot {
		width: 38px;
		height: 38px;
		border-radius: 11px;
		background: rgba(52, 211, 153, 0.18);
		border: 1px solid rgba(52, 211, 153, 0.4);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.hb-pin-dot :global(svg) { width: 18px; height: 18px; color: #6ee7b7; }
	.hb-pin-dot.idle { background: rgba(156, 123, 255, 0.16); border-color: rgba(156, 123, 255, 0.38); }
	.hb-pin-dot.idle :global(svg) { color: #c8b6ff; }
	.hb-pin-meta { display: grid; gap: 3px; min-width: 0; }
	.hb-pin-meta small { font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #6ee7b7; }
	.hb-pinned-hero h3, .hb-empty-hero h3 { margin: 0; font: 400 20px/1.2 var(--f-serif, Georgia, serif); color: var(--ink); overflow-wrap: anywhere; }
	.hb-pin-meta code { font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
	.hb-empty-hero p { margin: 4px 0 0; font-size: 13px; line-height: 1.45; color: var(--muted); }

	.hb-field { display: grid; gap: 9px; }
	.hb-field label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
	.hb-inp-wrap { position: relative; display: flex; align-items: center; min-width: 0; }
	.hb-inp { width: 100%; min-width: 0; padding: 12px 38px 12px 14px; border-radius: 10px; border: 1px solid var(--line); background: #0d0a0e; color: var(--ink); font-size: 14.5px; outline: none; }
	.hb-inp:focus { border-color: var(--g1); }
	.hb-clr { position: absolute; right: 8px; width: 26px; height: 26px; border: 0; border-radius: 999px; background: rgba(255, 255, 255, 0.1); color: var(--muted); font-size: 17px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }

	.hb-actions { display: flex; gap: 10px; flex-wrap: wrap; }
	.hb-neo { flex: 1; min-width: 140px; padding: 12px 16px; border: 0; border-radius: 0; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 700; letter-spacing: 0.02em; box-shadow: 3px 3px 0 var(--g2); cursor: pointer; }
	.hb-neo:disabled { opacity: 0.55; cursor: wait; }
	.hb-gps { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 12px 14px; border-radius: 0; border: 1px solid var(--line); background: transparent; color: var(--ink); font-size: 13px; font-weight: 600; cursor: pointer; }
	.hb-gps :global(svg) { width: 15px; height: 15px; }

	.hb-gmaps { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.hb-gbtn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 38px; padding: 0 10px; border-radius: 10px; border: 1px solid rgba(156, 123, 255, 0.28); background: rgba(156, 123, 255, 0.08); color: var(--ink); font-size: 12.5px; font-weight: 600; text-decoration: none; cursor: pointer; }
	.hb-gbtn.hi { border-color: rgba(242, 90, 144, 0.42); background: rgba(242, 90, 144, 0.12); }
	.hb-gbtn :global(svg) { width: 14px; height: 14px; color: #c8b6ff; flex-shrink: 0; }

	.hb-picks { display: grid; gap: 6px; padding: 10px; border-radius: 12px; border: 1px solid rgba(156, 123, 255, 0.3); background: rgba(13, 10, 14, 0.72); }
	.hb-picks-h { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #c8b6ff; }
	.hb-pick { display: grid; gap: 2px; padding: 9px 10px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.03); color: var(--ink); text-align: left; cursor: pointer; }
	.hb-pick b { font-size: 13px; font-weight: 600; }
	.hb-pick small { font-size: 11.5px; color: var(--muted); }

	.hb-card { padding: 16px 18px; display: grid; gap: 12px; }
	.hb-mode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
	.hb-mode-card {
		display: grid;
		gap: 4px;
		padding: 12px 13px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.02);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.hb-mode-card.on {
		border-color: var(--g2);
		background: rgba(242, 90, 144, 0.1);
		box-shadow: inset 0 -3px 0 var(--g2);
	}
	.hb-mc-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
	.hb-mc-top b { font-size: 13.5px; font-weight: 700; }
	.hb-mc-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--g2); }
	.hb-mode-card small { font-size: 11.5px; color: var(--muted); line-height: 1.35; }

	.hb-buf-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.hb-buf-card {
		display: grid;
		gap: 2px;
		padding: 11px 10px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.02);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.hb-buf-card.on {
		border-color: var(--g1);
		background: rgba(156, 123, 255, 0.12);
		box-shadow: inset 0 -3px 0 var(--g1);
	}
	.hb-buf-card strong { font: 400 20px/1.1 var(--f-serif, Georgia, serif); }
	.hb-buf-card span { font-size: 12px; font-weight: 600; color: var(--ink); }
	.hb-buf-card small { font-size: 11px; color: var(--muted); line-height: 1.3; }

	.hb-shoots { display: grid; gap: 8px; }
	.hb-shoot-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 11px 12px;
		border-radius: 11px;
		border: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.02);
		text-decoration: none;
		color: var(--ink);
	}
	.hb-shoot-l { display: grid; gap: 2px; min-width: 0; }
	.hb-shoot-l b { font-size: 13.5px; }
	.hb-shoot-l small { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hb-shoot-r { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
	.hb-shoot-r em { font-style: normal; font-family: var(--mono); font-size: 11.5px; color: #6ee7b7; }
	.hb-shoot-r :global(svg) { width: 15px; height: 15px; color: var(--muted); }

	.hb-note { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }
</style>
