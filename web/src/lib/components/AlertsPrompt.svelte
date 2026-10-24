<script lang="ts">
	// Phone or laptop, in the words she'd use.
	const device = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 'phone' : 'laptop';
	import { onMount } from 'svelte';
	import { todayIso } from '../util';
	import { enablePush, isIos, logAlerts, pushState, pwa } from '../pwa.svelte';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// On Today, until this phone gets alerts: one tap to turn them on. (A test is only sent from Settings, when asked for.)
	let status = $state<'unsupported' | 'blocked' | 'on' | 'off' | 'loading'>('loading');
	let busy = $state(false);
	let hidden = $state(false);
	let iosBrowser = $state(false);
	const KEY = 'cd-alerts-later';

	onMount(async () => {
		try {
			hidden = localStorage.getItem(KEY) === todayIso();
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
			toast('Alerts are on.', 'bell');
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
			localStorage.setItem(KEY, todayIso());
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
			<b>{iosBrowser ? 'Get alerts on your iPhone' : status === 'blocked' ? `Alerts are blocked on this ${device}` : `Get alerts on this ${device}`}</b>
			<small>
				{#if iosBrowser}Tap the Share button in Safari, then <b>Add to Home Screen</b>. Open Miracle from the home screen and turn alerts on there.
				{:else if status === 'blocked'}Open the phone's Settings → Apps → Miracle (or Chrome) → Notifications, allow them, then come back.
				{:else}New requests, brand messages, approvals, payments and time-to-post, the moment they happen.{/if}
			</small>
		</div>
		{#if status === 'off' && !iosBrowser}
			<button class="btn sm grad" disabled={busy} onclick={turnOn}>{#if busy}<span class="spinner"></span>{:else}<Icon name="bell" />{/if}Turn on</button>
		{/if}
		<button class="btn sm ghost" onclick={later}>Later</button>
	</section>
{/if}
