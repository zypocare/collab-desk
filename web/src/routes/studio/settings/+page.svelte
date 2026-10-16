<script lang="ts">
	import { saveSettings, studio } from '#lib/studio.svelte.ts';
	import type { PublicPage, Settings } from '#lib/types.ts';
	import { supabase } from '#lib/supabase.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { KINDS, compact, inr } from '#lib/util.ts';
	import { suggestRates } from '#lib/rateSuggest.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ShippingSettings from '#lib/components/ShippingSettings.svelte';
	import NotificationSettings from '#lib/components/NotificationSettings.svelte';
	import BillingSettings from '#lib/components/BillingSettings.svelte';
	import InstagramSettings from '#lib/components/InstagramSettings.svelte';
	import PriorityRules from '#lib/components/PriorityRules.svelte';
	import PackagesSettings from '#lib/components/PackagesSettings.svelte';
	import AvailabilitySettings from '#lib/components/AvailabilitySettings.svelte';

	const s = $derived(studio.settings!);
	const link = $derived(s.site_url.replace(/\/$/, ''));
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
	const num = (e: Event) => Math.max(0, Number(val(e)) || 0);

	type TextKey = 'display_name' | 'handle' | 'niche' | 'city' | 'followers' | 'engagement' | 'reply_time' | 'app_name' | 'site_url';
	const fields: { k: TextKey; label: string; ph?: string }[] = [
		{ k: 'display_name', label: 'Name' },
		{ k: 'handle', label: 'Instagram handle', ph: 'yourhandle' },
		{ k: 'niche', label: 'What you create' },
		{ k: 'city', label: 'City' },
		{ k: 'followers', label: 'Followers', ph: '248K' },
		{ k: 'engagement', label: 'Avg. engagement', ph: '4.8%' },
		{ k: 'reply_time', label: 'Usual reply time', ph: '2 days' }
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
	function useSuggested() {
		if (!suggested || !confirm('Replace your rate card with the suggested rates? You can still edit each one.')) return;
		saveSettings({ rates: { ...s.rates, ...suggested } });
		toast('Rate card updated', 'check');
	}
	function toggle(k: 'accepting' | 'show_rates', on: boolean) {
		saveSettings({ [k]: on });
		toast(k === 'accepting' ? (on ? 'Your page is open for requests' : 'New requests are paused') : on ? 'Rates shown on your page' : 'Rates hidden from your page');
	}
</script>

<svelte:head><title>My page · {s.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Share with brands</div>
		<h1>Brand <em>page</em></h1>
		<p>One link for every brand. They send requests there and sign in to follow them.</p>
	</div>
</header>

<div class="page-grid">
	<div class="stack">
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
		<section class="panel rv" style="--i:2">
			<div class="panel-h"><h2>Profile</h2><small>shown on your brand page</small></div>
			<div class="form-b">
				{#each fields as f (f.k)}
					<div class="f"><label for="me-{f.k}">{f.label}</label><input class="inp" id="me-{f.k}" value={s[f.k]} placeholder={f.ph ?? ''} onchange={(e) => saveText(f.k, val(e))} /></div>
				{/each}
				<div class="f"><label for="me-goal">Monthly income goal (₹)</label><input class="inp num" id="me-goal" type="number" inputmode="numeric" value={s.monthly_goal} onchange={(e) => saveSettings({ monthly_goal: num(e) })} /></div>
			</div>
			<div class="switch-row">
				<div><b>Accepting collaborations</b><small>Turn off when you're fully booked. Brands can still follow requests they've sent.</small></div>
				<input type="checkbox" class="tgl" checked={s.accepting} aria-label="Accepting collaborations" onchange={(e) => toggle('accepting', (e.currentTarget as HTMLInputElement).checked)} />
			</div>
			<div class="switch-row">
				<div><b>Show starting rates</b><small>Brands see "from" prices next to each deliverable.</small></div>
				<input type="checkbox" class="tgl" checked={s.show_rates} aria-label="Show starting rates" onchange={(e) => toggle('show_rates', (e.currentTarget as HTMLInputElement).checked)} />
			</div>
		</section>
		<ShippingSettings />
		<BillingSettings />
	</div>
	<div class="stack">
		<InstagramSettings />
		<section class="panel rv" style="--i:3">
			<div class="panel-h"><h2>Rate card</h2><small>starting price per deliverable</small></div>
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
				<div class="rate">
					<span>{k}{#if sg}<small class="sug" class:low={cur > 0 && cur < sg * 0.8} class:high={cur > sg * 1.25}>suggested {inr(sg)}{cur > 0 && cur < sg * 0.8 ? ' · you may be undercharging' : cur > sg * 1.25 ? ' · above the suggestion' : ''}</small>{/if}</span>
					<div class="pre"><span>₹</span><input class="inp num" type="number" inputmode="numeric" aria-label="{k} rate" value={s.rates[k] ?? ''} onchange={(e) => saveSettings({ rates: { ...s.rates, [k]: num(e) } })} /></div>
				</div>
			{/each}
			<div class="rate">
				<span>Extra paid usage<small class="hint" style="display:block">% of the fee per 30 days</small></span>
				<div class="pre"><span>%</span><input class="inp num" type="number" inputmode="numeric" min="0" max="200" aria-label="Usage extension rate" value={s.usage_ext_pct} onchange={(e) => saveSettings({ usage_ext_pct: Math.min(200, num(e)) })} /></div>
			</div>
		</section>
		<PackagesSettings />
		<AvailabilitySettings />
		<PriorityRules />
		<NotificationSettings />
		<section class="panel rv" style="--i:4">
			<div class="panel-h"><h2>App</h2></div>
			<div class="form-b">
				<div class="f span2"><label for="me-app">App name</label><input class="inp" id="me-app" value={s.app_name} onchange={(e) => saveText('app_name', val(e))} /></div>
				<div class="f span2"><label for="me-site">Website address</label><input class="inp" id="me-site" value={s.site_url} placeholder="https://yourdomain.com" onchange={(e) => saveText('site_url', val(e))} /></div>
				<div class="f span2"><label for="me-email">Your sign-in email</label><input class="inp" id="me-email" value={s.creator_email} readonly /><p class="hint" style="margin-top:6px">Only this email opens your studio. It is changed in the database setup, not here.</p></div>
			</div>
		</section>
	</div>
</div>
