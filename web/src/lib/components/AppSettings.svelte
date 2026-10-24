<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import { voiceAlert, voiceLine } from '../voice';
	import { onMount } from 'svelte';
	import { disablePush, enablePush, install, isIos, logAlerts, pushState, pwa } from '../pwa.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';
	import { isNative, native } from '../native';

	let status = $state<'unsupported' | 'blocked' | 'on' | 'off' | 'loading'>('loading');
	let busy = $state(false);
	// In the phone app: which version this is (it's read once the app has started).
	let appVersion = $state('');
	// Alerts greet her by her "Call me" name, else the first name on her profile (as the server does).
	const greetName = $derived(String(studio.settings?.alert_name ?? '').trim() || String(studio.settings?.display_name ?? '').trim().split(/\s+/)[0] || '');
	onMount(() => {
		appVersion = native.version;
		if (isNative() && !appVersion) setTimeout(() => (appVersion = native.version), 1500);
	});
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
	{#if isNative()}
	<div class="switch-row" style="border-top:0">
		<div><b>Miracle app</b><small>Version {appVersion || '…'}. New features arrive by themselves; the Play Store only updates the app around them.</small></div>
	</div>
	{:else}
	<div class="switch-row" style="border-top:0">
		<div>
			<b>Install on your phone</b>
			<small>
				{#if pwa.installed}Installed. Open it from your home screen.
				{:else if pwa.installEvent}Adds Miracle to your home screen. It opens full screen, like an app.
				{:else if ios}On iPhone: tap the Share button in Safari, then <b>Add to Home Screen</b>.
				{:else}Open this page on your phone in Chrome, then use the browser menu → <b>Install app</b> (or Add to Home screen).{/if}
			</small>
		</div>
		{#if pwa.installEvent}<button class="btn sm grad" onclick={install}><Icon name="plus" />Install</button>{/if}
	</div>
	{/if}
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
		<div class="f"><label for="al-name">Call me</label><input class="inp" id="al-name" maxlength="30" placeholder={`e.g. ${String(studio.settings?.display_name ?? '').trim().split(' ')[0] || 'your first name'}`} value={studio.settings?.alert_name ?? ''} onchange={(e) => saveSettings({ alert_name: (e.currentTarget as HTMLInputElement).value.trim() })} /></div>
		<div class="f"><label for="al-line">A line under each alert <span class="hint">(optional)</span></label><input class="inp" id="al-line" maxlength="80" placeholder="e.g. Check your collab app" value={studio.settings?.alert_line ?? ''} onchange={(e) => saveSettings({ alert_line: (e.currentTarget as HTMLInputElement).value.trim() })} /></div>
		<div class="switch-row span2 voice-row">
			<div>
				<b>Say it out loud in the app</b><small>While the app is open, a chime and "{voiceLine(studio.settings?.alert_name ?? '', 'You might have a new collab.')}" for a new possible collab or request. Phone alerts use your phone's usual sound.</small>
				<button class="btn sm voice-try" onclick={() => voiceAlert(voiceLine(studio.settings?.alert_name ?? '', 'You might have a new collab.'), { on: true, force: true })}><Icon name="bell" />Hear it</button>
			</div>
			<input type="checkbox" class="tgl" checked={studio.settings?.voice_alerts !== false} aria-label="Say alerts out loud in the app" onchange={(e) => saveSettings({ voice_alerts: (e.currentTarget as HTMLInputElement).checked })} />
		</div>
		<p class="hint span2">Alerts then read: <b>{greetName ? `Hey ${greetName}! ` : ''}Sunveda may want a collab</b>{studio.settings?.alert_line ? ` · ${studio.settings.alert_line}` : ''}.</p>
	</div>
	{#if status === 'on'}
		<div class="row-btns"><button class="btn sm" onclick={test}><Icon name="bell" />Send a test</button></div>
	{/if}
</section>
