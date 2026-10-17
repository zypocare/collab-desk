<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import { onMount } from 'svelte';
	import { disablePush, enablePush, install, isIos, logAlerts, pushState, pwa } from '../pwa.svelte';
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
		// An iPhone that can't get alerts: note why (old iOS, or opened in Safari instead of from the home screen).
		if (status === 'unsupported' && ios) logAlerts('alerts_unsupported');
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
				logAlerts('alerts_on');
				status = 'on';
				toast('Notifications on', 'bell');
			}
		} catch (e) {
			if (status !== 'on') logAlerts('alerts_failed', errMessage(e));
			toast(errMessage(e), 'alert');
			status = await pushState();
		}
		busy = false;
	}
	async function test() {
		const { data, error } = await supabase.functions.invoke('push-test', { body: {} });
		if (error) return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
		const r = data as { sent?: number; devices?: number; failed?: { device: string; code: number | null; error: string }[]; skipped?: string };
		if (r.skipped) return toast(`Couldn't send: ${r.skipped}`, 'alert');
		if (r.failed?.length) return toast(`Sent to ${r.sent ?? 0} of ${r.devices}. ${r.failed.map((f) => `${f.device}: ${f.code ?? ''} ${f.error}`).join('; ')}`, 'alert');
		toast(r.sent ? `Test sent to ${r.sent} device${r.sent > 1 ? 's' : ''}. Check your notifications.` : 'No devices to send to yet. Turn notifications on first.', 'bell');
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
	<div class="form-b alert-greet">
		<div class="f"><label for="al-name">Call me</label><input class="inp" id="al-name" maxlength="30" placeholder="e.g. Nivy" value={studio.settings?.alert_name ?? ''} onchange={(e) => saveSettings({ alert_name: (e.currentTarget as HTMLInputElement).value.trim() })} /></div>
		<div class="f"><label for="al-line">A line under each alert <span class="hint">(optional)</span></label><input class="inp" id="al-line" maxlength="80" placeholder="e.g. Check your collab app" value={studio.settings?.alert_line ?? ''} onchange={(e) => saveSettings({ alert_line: (e.currentTarget as HTMLInputElement).value.trim() })} /></div>
		<p class="hint span2">Alerts then read: <b>{studio.settings?.alert_name ? `Hey ${studio.settings.alert_name}! ` : ''}Sunveda may want a collab</b>{studio.settings?.alert_line ? ` · ${studio.settings.alert_line}` : ''}. The sound is your phone's usual one: web apps can't choose their own.</p>
	</div>
	{#if status === 'on'}
		<div class="row-btns"><button class="btn sm" onclick={test}><Icon name="bell" />Send a test</button></div>
	{/if}
</section>
