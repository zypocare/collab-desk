<script lang="ts">
	import { onMount } from 'svelte';
	import { enablePush, isIos, logAlerts, pushState, pwa } from '../pwa.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// On Today, until this phone gets alerts: one tap to turn them on (and a test right away).
	let status = $state<'unsupported' | 'blocked' | 'on' | 'off' | 'loading'>('loading');
	let busy = $state(false);
	let hidden = $state(false);
	let iosBrowser = $state(false);
	const KEY = 'cd-alerts-later';

	onMount(async () => {
		try {
			hidden = localStorage.getItem(KEY) === new Date().toISOString().slice(0, 10);
		} catch {
			/* private mode */
		}
		iosBrowser = isIos() && !pwa.installed;
		status = await pushState().catch(() => 'unsupported' as const);
	});

	async function turnOn() {
		busy = true;
		try {
			await enablePush();
			logAlerts('alerts_on');
			status = 'on';
			const { data } = await supabase.functions.invoke('push-test', { body: {} });
			toast((data as { sent?: number })?.sent ? 'Alerts are on. A test is on its way.' : 'Alerts are on.', 'bell');
		} catch (e) {
			logAlerts('alerts_failed', errMessage(e));
			toast(errMessage(e), 'alert');
			status = await pushState().catch(() => 'unsupported' as const);
		}
		busy = false;
	}
	function later() {
		hidden = true;
		try {
			localStorage.setItem(KEY, new Date().toISOString().slice(0, 10));
		} catch {
			/* private mode */
		}
	}
	const show = $derived(!hidden && (status === 'off' || status === 'blocked' || iosBrowser));
</script>

{#if show}
	<section class="alert-prompt rv" style="--i:1">
		<span class="ap-ic"><Icon name="bell" /></span>
		<div>
			<b>{iosBrowser ? 'Get alerts on your iPhone' : status === 'blocked' ? 'Alerts are blocked on this phone' : 'Get alerts on this phone'}</b>
			<small>
				{#if iosBrowser}Tap the Share button in Safari, then <b>Add to Home Screen</b>. Open Collab Desk from the home screen and turn alerts on there.
				{:else if status === 'blocked'}Open the phone's Settings → Apps → Collab Desk (or Chrome) → Notifications, allow them, then come back.
				{:else}New requests, brand messages, approvals, payments and time-to-post, the moment they happen.{/if}
			</small>
		</div>
		{#if status === 'off' && !iosBrowser}
			<button class="btn sm grad" disabled={busy} onclick={turnOn}>{#if busy}<span class="spinner"></span>{:else}<Icon name="bell" />{/if}Turn on</button>
		{/if}
		<button class="btn sm ghost" onclick={later}>Later</button>
	</section>
{/if}
