<script lang="ts">
	import { ask } from '#lib/confirm.svelte.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { loadPackages, saveSettings, studio } from '#lib/studio.svelte.ts';
	import type { PublicPage, Settings } from '#lib/types.ts';
	import { supabase } from '#lib/supabase.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { KINDS, compact, inr, offeredKinds } from '#lib/util.ts';
	import { suggestRates } from '#lib/rateSuggest.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ShippingSettings from '#lib/components/ShippingSettings.svelte';
	import NotificationSettings from '#lib/components/NotificationSettings.svelte';
	import BillingSettings from '#lib/components/BillingSettings.svelte';
	import InstagramSettings from '#lib/components/InstagramSettings.svelte';
	import PriorityRules from '#lib/components/PriorityRules.svelte';
	import PackagesSettings from '#lib/components/PackagesSettings.svelte';
	import AvailabilitySettings from '#lib/components/AvailabilitySettings.svelte';
	import ReviewsSettings from '#lib/components/ReviewsSettings.svelte';
	import AppSettings from '#lib/components/AppSettings.svelte';
	import AutopilotSettings from '#lib/components/AutopilotSettings.svelte';
	import TeamSettings from '#lib/components/TeamSettings.svelte';
	import EmailInbox from '#lib/components/EmailInbox.svelte';
	import SavedReplies from '#lib/components/SavedReplies.svelte';

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
	function saveText(k: TextKey, v: string) {
		const clean = k === 'handle' ? v.trim().replace(/^@/, '') : v.trim();
		if ((k === 'display_name' || k === 'app_name' || k === 'site_url') && !clean) return;
		saveSettings({ [k]: clean } as Partial<Settings>);
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
	function toggle(k: 'accepting' | 'show_rates', on: boolean) {
		saveSettings({ [k]: on });
		toast(k === 'accepting' ? (on ? 'Your page is open for requests' : 'New requests are paused') : on ? 'Rates shown on your page' : 'Rates hidden from your page');
	}

	// Settings are split into a few sections and only the one she picks is shown.
	// On phones the menu is its own screen: tap a section, and "All settings" (or Back) returns.
	type Sec = 'profile' | 'rates' | 'bookings' | 'autopilot' | 'payments' | 'reviews' | 'alerts' | 'team' | 'account';
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
		{ id: 'rates', label: 'Rates & packages', icon: 'rupee', sub: `${offered.length} content types · ${studio.packages.filter((k) => k.active).length} packages` },
		{
			id: 'bookings',
			label: 'Bookings & barter',
			icon: 'cal',
			sub: s.accepting ? `Open · ${s.weekly_capacity} a week · barter ${s.barter_mode}` : 'Paused: not taking requests',
			warn: s.accepting ? undefined : 'New requests are paused'
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
		{ id: 'team', label: 'Team', icon: 'users', sub: studio.me?.team_role === 'manager' ? 'You are a manager' : 'Give a manager their own login' },
		{
			id: 'account',
			label: 'Shipping & account',
			icon: 'gear',
			sub: s.ship_address ? 'Shipping address added' : 'Add your shipping address',
			warn: s.ship_address ? undefined : 'No shipping address yet'
		}
	]);

	let narrow = $state(false);
	onMount(() => {
		if (!studio.packages.length) loadPackages();
		const mq = matchMedia('(max-width: 900px)');
		const on = () => (narrow = mq.matches);
		on();
		mq.addEventListener('change', on);
		return () => mq.removeEventListener('change', on);
	});
	const asked = $derived(page.url.searchParams.get('s'));
	const active = $derived<Sec | null>(sections.find((x) => x.id === asked)?.id ?? (narrow ? null : 'profile'));
	const current = $derived(sections.find((x) => x.id === active));
	function open(id: Sec) {
		// Phones: a new screen (Back returns to the menu). Desktop: swap the section in place.
		goto(`?s=${id}`, narrow ? {} : { replace: true, reset: false });
	}
</script>

<svelte:head><title>My page · {s.app_name}</title></svelte:head>

<div class="set-intro" class:sec-open={!!active}>
	<header class="ph rv">
		<div>
			<div class="eb">Share with brands</div>
			<h1>My <em>page</em></h1>
			<p>Your link for brands, and how you like to work. Pick a section to change it.</p>
		</div>
	</header>

	<div class="set-top">
		<section class="linkcard glow rv" style="--i:1">
			<div class="mesh" aria-hidden="true"></div>
			<div class="hc-in">
				<span class="hc-eb">Your link</span>
				<span class="url">{link.replace(/^https?:\/\//, '')}</span>
				<p>Put this in your Instagram bio and send it in DMs. Brands sign in with their work email to send and track requests.</p>
				<div class="row">
					<button class="btn" onclick={() => copyText(link, 'Link copied')}><Icon name="copy" />Copy link</button>
					<a class="btn out" href="/?preview=1" target="_blank" rel="noopener"><Icon name="eye" />Preview your page</a>
					<button class="btn out" onclick={kit} disabled={kitBusy}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit PDF</button>
				</div>
			</div>
		</section>
	</div>
</div>

<div class="set-shell" class:sec-open={!!active}>
	<nav class="set-menu rv" style="--i:2" aria-label="Settings sections">
		{#each sections as x (x.id)}
			<a class="set-item" class:on={x.id === active} href="?s={x.id}" aria-current={x.id === active ? 'page' : undefined} onclick={(e) => (e.preventDefault(), open(x.id))}>
				<span class="set-ic"><Icon name={x.icon} /></span>
				<span class="set-t"><b>{x.label}</b><small>{x.sub}</small></span>
				{#if x.warn}<span class="set-dot" title={x.warn}></span>{/if}
				<Icon name="chevR" class="set-chev" />
			</a>
		{/each}
	</nav>

	{#if active && current}
		<div class="set-body">
			<div class="set-head">
				<button class="set-back" onclick={() => goto('/studio/settings')}><Icon name="chevL" />All settings</button>
				<h2>{current.label}</h2>
			</div>
			{#key active}
				<div class="set-panels">
					{#if active === 'profile'}
						<section class="panel rv" style="--i:1">
							<div class="panel-h"><h2>Profile</h2><small>shown on your brand page</small></div>
							<div class="form-b">
								{#each fields as f (f.k)}
									<div class="f"><label for="me-{f.k}">{f.label}</label><input class="inp" id="me-{f.k}" value={s[f.k]} placeholder={f.ph ?? ''} onchange={(e) => saveText(f.k, val(e))} /></div>
								{/each}
							</div>
						</section>
						<InstagramSettings />
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
									<span>{k}{#if !on}<small class="sug">hidden from brands</small>{:else if sg}<small class="sug" class:low={cur > 0 && cur < sg * 0.8} class:high={cur > sg * 1.25}>suggested {inr(sg)}{cur > 0 && cur < sg * 0.8 ? ' · you may be undercharging' : cur > sg * 1.25 ? ' · above the suggestion' : ''}</small>{/if}</span>
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
						<PackagesSettings />
					{:else if active === 'bookings'}
						<section class="panel rv" style="--i:1">
							<div class="switch-row" style="border-top:0">
								<div><b>Accepting collaborations</b><small>Turn off when you're fully booked. Brands can still follow requests they've sent.</small></div>
								<input type="checkbox" class="tgl" checked={s.accepting} aria-label="Accepting collaborations" onchange={(e) => toggle('accepting', (e.currentTarget as HTMLInputElement).checked)} />
							</div>
						</section>
						<AvailabilitySettings />
						<PriorityRules />
					{:else if active === 'autopilot'}
						<AutopilotSettings />
					{:else if active === 'payments'}
						<section class="panel rv" style="--i:1">
							<div class="panel-h"><h2>Income goal</h2><small>tracked on Today</small></div>
							<div class="form-b">
								<div class="f span2"><label for="me-goal">Monthly income goal (₹)</label><input class="inp num" id="me-goal" type="number" inputmode="numeric" value={s.monthly_goal} onchange={(e) => saveSettings({ monthly_goal: num(e) })} /></div>
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
					{:else if active === 'team'}
						<TeamSettings />
					{:else if active === 'account'}
						<ShippingSettings />
						<section class="panel rv" style="--i:4">
							<div class="panel-h"><h2>App</h2></div>
							<div class="form-b">
								<div class="f span2"><label for="me-app">App name</label><input class="inp" id="me-app" value={s.app_name} onchange={(e) => saveText('app_name', val(e))} /></div>
								<div class="f span2"><label for="me-site">Website address</label><input class="inp" id="me-site" value={s.site_url} placeholder="https://yourdomain.com" onchange={(e) => saveText('site_url', val(e))} /></div>
								<div class="f span2"><label for="me-email">Your sign-in email</label><input class="inp" id="me-email" value={s.creator_email} readonly /><p class="hint" style="margin-top:6px">Only this email opens your studio. It is changed in the database setup, not here.</p></div>
							</div>
						</section>
					{/if}
				</div>
			{/key}
		</div>
	{/if}
</div>
