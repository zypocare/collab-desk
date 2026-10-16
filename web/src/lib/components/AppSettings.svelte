<script lang="ts">
	import { onMount } from 'svelte';
	import { disablePush, enablePush, install, isIos, pushState, pwa } from '../pwa.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	let status = $state<'unsupported' | 'blocked' | 'on' | 'off' | 'loading'>('loading');
	let busy = $state(false);
	let ios = $state(false);
	onMount(async () => {
		ios = isIos();
		status = await pushState().catch(() => 'unsupported' as const);
	});

	async function toggle() {
		busy = true;
		try {
			if (status === 'on') {
				await disablePush();
				status = 'off';
				toast('Notifications off on this device', 'bell');
			} else {
				await enablePush();
				status = 'on';
				toast('Notifications on', 'bell');
			}
		} catch (e) {
			toast(errMessage(e), 'alert');
			status = await pushState();
		}
		busy = false;
	}
	async function test() {
		const { data, error } = await supabase.functions.invoke('push-test', { body: {} });
		if (error) return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
		toast((data as { sent?: number })?.sent ? 'Test sent. Check your notifications.' : 'No devices to send to yet.', 'bell');
	}
</script>

<section class="panel rv" style="--i:3">
	<div class="panel-h"><h2>Phone app & alerts</h2><small>no app store needed</small></div>
	<div class="switch-row" style="border-top:0">
		<div>
			<b>Install on your phone</b>
			<small>
				{#if pwa.installed}Installed. Open it from your home screen.
				{:else if pwa.installEvent}Adds Collab Desk to your home screen. It opens full screen, like an app.
				{:else if ios}On iPhone: tap the Share button in Safari, then <b>Add to Home Screen</b>.
				{:else}Open this page on your phone in Chrome, then use the browser menu → <b>Install app</b> (or Add to Home screen).{/if}
			</small>
		</div>
		{#if pwa.installEvent}<button class="btn sm grad" onclick={install}><Icon name="plus" />Install</button>{/if}
	</div>
	<div class="switch-row">
		<div>
			<b>Notifications on this device</b>
			<small>
				{#if status === 'unsupported'}{ios ? 'On iPhone, install the app to your home screen first, then turn this on from inside it.' : "This browser can't show notifications."}
				{:else if status === 'blocked'}Blocked for this site. Allow notifications in the browser's site settings, then try again.
				{:else}New requests, brand messages, accepted quotes, approved drafts, parcels and payments, as they happen.{/if}
			</small>
		</div>
		{#if status === 'on' || status === 'off'}
			<input type="checkbox" class="tgl" checked={status === 'on'} disabled={busy} aria-label="Notifications on this device" onchange={toggle} />
		{/if}
	</div>
	{#if status === 'on'}
		<div class="row-btns"><button class="btn sm" onclick={test}><Icon name="bell" />Send a test</button></div>
	{/if}
</section>
