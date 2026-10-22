<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '../auth.svelte';
	import { brandPushOn, disableBrandPush, enableBrandPush, isIos, pushSupported } from '../pwa.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// Emails & alerts for a brand: phone alerts on this device, what to hear about, and quiet hours.
	// Emails keep coming as they do now; each person on the team picks their own.
	type Prefs = { quotes: boolean; drafts: boolean; messages: boolean; invoices: boolean; live: boolean; briefs: 'each' | 'digest' | 'off'; quiet: boolean; devices: number };
	let prefs = $state<Prefs | null>(null);
	let on = $state(false);
	let busy = $state(false);
	const email = $derived(auth.account?.email ?? '');
	const standalone = typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
	const needsHome = isIos() && !standalone;
	onMount(async () => {
		const { data } = await supabase.rpc('brand_alerts_get');
		prefs = data as Prefs | null;
		on = await brandPushOn().catch(() => false);
	});
	async function set(patch: Partial<Prefs>) {
		if (!prefs) return;
		const before = prefs;
		prefs = { ...prefs, ...patch };
		const { data, error } = await supabase.rpc('brand_alerts_set', { p: patch });
		if (error) {
			prefs = before;
			return toast(errMessage(error), 'alert');
		}
		prefs = data as Prefs;
	}
	async function turnOn() {
		busy = true;
		try {
			await enableBrandPush();
			on = true;
			toast('Alerts are on for this phone', 'bell');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
	async function turnOff() {
		busy = true;
		try {
			await disableBrandPush();
			on = false;
			toast('Alerts are off for this phone', 'check');
		} finally {
			busy = false;
		}
	}
	const ROWS = [
		{ k: 'quotes', b: 'Quotes', s: 'A creator sends or changes a quote' },
		{ k: 'drafts', b: 'Drafts to approve', s: 'With a nudge the day before it goes live' },
		{ k: 'messages', b: 'Messages', s: 'From any creator you work with' },
		{ k: 'invoices', b: 'Invoices and payments', s: 'New invoices, and when one is due' },
		{ k: 'live', b: 'Posts going live', s: 'With the link, so you can share it' }
	] as const;
</script>

<!-- Turn on: the app's glowing card. -->
<section class="hero-card glow m-hero rv" style="--i:1" aria-label="Phone alerts">
	<div class="mesh" aria-hidden="true"></div>
	<div class="hc-in">
		<div class="hc-top"><span class="hc-eb">Phone alerts</span>{#if on}<span class="glass-chip"><Icon name="check" />On for this phone</span>{/if}</div>
		<div class="ba-h">{on ? 'This phone gets your alerts' : 'Know the moment a creator needs you'}</div>
		<div class="hc-sub">Quotes, drafts to approve, invoices and new applications, on this phone. Emails to {email} keep coming as they do now.</div>
		{#if !pushSupported()}
			<p class="ba-note">This browser can't show alerts. Open Miracle in Chrome or Safari on your phone.</p>
		{:else if needsHome && !on}
			<p class="ba-note">On iPhone, add Miracle to your Home Screen first (Share, then Add to Home Screen), open it from there and turn alerts on.</p>
		{:else}
			<div class="clear-acts ba-acts">
				{#if on}<button class="glass-chip" onclick={turnOff} disabled={busy}>Turn off on this phone</button>
				{:else}<button class="glass-chip" onclick={turnOn} disabled={busy}>{#if busy}<span class="spinner"></span>{:else}<Icon name="bell" />{/if}Turn on alerts on this phone</button>{/if}
			</div>
		{/if}
	</div>
</section>

{#if prefs}
	<section class="panel rv" style="--i:2">
		<div class="panel-h"><h2>What to alert you about</h2><small>on your phones</small></div>
		{#each ROWS as row (row.k)}
			<div class="switch-row">
				<div><b>{row.b}</b><small>{row.s}</small></div>
				<input type="checkbox" class="tgl" checked={prefs[row.k]} aria-label={row.b} onchange={(e) => set({ [row.k]: (e.currentTarget as HTMLInputElement).checked })} />
			</div>
		{/each}
		<div class="switch-row">
			<div><b>Open brief applications</b><small>Each one as it comes, or one summary at 6 pm</small></div>
			<div class="m-stages ba-seg" role="radiogroup" aria-label="Open brief applications">
				{#each [['each', 'Each'], ['digest', '6 pm'], ['off', 'Off']] as const as [k, l] (k)}<button role="radio" aria-checked={prefs.briefs === k} class:on={prefs.briefs === k} onclick={() => set({ briefs: k })}>{l}</button>{/each}
			</div>
		</div>
	</section>
	<section class="panel rv" style="--i:3">
		<div class="switch-row" style="border-top:0">
			<div><b>Quiet hours, 10 pm to 8 am</b><small>No phone alerts at night. Emails still arrive.</small></div>
			<input type="checkbox" class="tgl" checked={prefs.quiet} aria-label="Quiet hours" onchange={(e) => set({ quiet: (e.currentTarget as HTMLInputElement).checked })} />
		</div>
	</section>
	<p class="hint" style="margin:4px">Each person on your team picks their own. Signing out turns alerts off on that phone.</p>
{/if}

<style>
	.ba-h {
		margin-top: 10px;
		font: 400 30px/1.1 var(--f-serif, Georgia, serif);
	}
	.ba-note {
		margin: 12px 0 0;
		font-size: 13.5px;
		opacity: 0.85;
	}
	.ba-acts {
		justify-content: flex-start;
	}
	.ba-seg {
		flex: none;
		margin: 0;
	}
</style>
