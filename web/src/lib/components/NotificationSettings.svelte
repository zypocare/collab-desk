<script lang="ts">
	import { onMount } from 'svelte';
	import { saveSettings, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	const s = $derived(studio.settings!);
	const calUrl = $derived(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar?token=${s.calendar_token}`);

	let bot = $state('');
	let tgError = $state('');
	let tgBusy = $state(false);
	let code = $state('');
	let regenArm = $state(false);

	async function tg(action: string, extra: Record<string, unknown> = {}) {
		const { data, error } = await supabase.functions.invoke('telegram-connect', { body: { action, ...extra } });
		if (error) {
			let msg = errMessage(error);
			try {
				const body = await (error as { context?: Response }).context?.json();
				if (body?.error) msg = body.error;
			} catch {
				/* keep the generic message */
			}
			throw new Error(msg);
		}
		return data;
	}

	onMount(async () => {
		try {
			bot = (await tg('info')).bot ?? '';
		} catch (e) {
			tgError = errMessage(e);
		}
	});

	function startConnect() {
		code = String(Math.floor(100000 + Math.random() * 900000));
		window.open(`https://t.me/${bot}?start=${code}`, '_blank', 'noopener');
	}
	async function connect() {
		tgBusy = true;
		tgError = '';
		try {
			await tg('connect', { code });
			const { data } = await supabase.from('creator_settings').select('telegram_chat_id').eq('id', 1).single();
			if (studio.settings && data) studio.settings.telegram_chat_id = data.telegram_chat_id;
			code = '';
			toast('Telegram connected');
		} catch (e) {
			tgError = errMessage(e);
		}
		tgBusy = false;
	}
	async function action(name: 'test' | 'disconnect') {
		tgBusy = true;
		tgError = '';
		try {
			await tg(name);
			if (name === 'disconnect' && studio.settings) studio.settings.telegram_chat_id = '';
			toast(name === 'test' ? 'Test message sent' : 'Telegram disconnected');
		} catch (e) {
			tgError = errMessage(e);
		}
		tgBusy = false;
	}
	function regenerate() {
		if (!regenArm) {
			regenArm = true;
			setTimeout(() => (regenArm = false), 4000);
			return;
		}
		const bytes = crypto.getRandomValues(new Uint8Array(18));
		saveSettings({ calendar_token: [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') });
		regenArm = false;
		toast('New calendar link made. Subscribe again with the new link.');
	}
</script>

<section class="panel rv" style="--i:5">
	<div class="panel-h"><h2>Reminders</h2><small>so nothing slips</small></div>
	<div class="switch-row" style="border-top:0">
		<div><b>9 AM summary email</b><small>Every morning: follow-ups, drafts due, go-lives, overdue payments and brand replies. Skipped on days with nothing to do.</small></div>
		<input type="checkbox" class="tgl" checked={s.digest_enabled} aria-label="9 AM summary email" onchange={(e) => saveSettings({ digest_enabled: (e.currentTarget as HTMLInputElement).checked })} />
	</div>

	<div class="switch-row">
		<div>
			<b>Telegram on your phone</b>
			{#if s.telegram_chat_id}
				<small>Connected. The 9 AM summary also arrives in Telegram.</small>
			{:else if bot}
				<small>Get the 9 AM summary as a Telegram message too.</small>
			{:else}
				<small>{tgError || 'Checking…'}</small>
			{/if}
		</div>
		{#if s.telegram_chat_id}
			<button class="btn sm" disabled={tgBusy} onclick={() => action('test')}>Send test</button>
			<button class="btn sm ghost" disabled={tgBusy} onclick={() => action('disconnect')}>Disconnect</button>
		{:else if bot && !code}
			<button class="btn sm primary" onclick={startConnect}>Connect</button>
		{/if}
	</div>
	{#if code && !s.telegram_chat_id}
		<div class="tg-steps">
			<ol>
				<li>Telegram opened <b>@{bot}</b>. Tap <b>Start</b> there. (If it didn't open, send <code>/start {code}</code> to @{bot}.)</li>
				<li>Come back and press <b>I've tapped Start</b>.</li>
			</ol>
			<div style="display:flex;gap:8px">
				<button class="btn sm primary" disabled={tgBusy} onclick={connect}>{#if tgBusy}<span class="spinner"></span>{/if}I've tapped Start</button>
				<button class="btn sm ghost" onclick={() => (code = '')}>Cancel</button>
			</div>
		</div>
	{/if}
	{#if tgError && (bot || s.telegram_chat_id)}<p class="err" style="padding:0 20px 12px">{tgError}</p>{/if}

	<div class="switch-row" style="flex-wrap:wrap">
		<div style="min-width:220px">
			<b>Calendar link</b>
			<small>Add it once to Google Calendar ("Other calendars" → "From URL") or iPhone (Settings → Calendar → Accounts → Add subscribed calendar). Drafts, go-lives, follow-ups and payment dates then appear there.</small>
		</div>
		<button class="btn sm primary" onclick={() => copyText(calUrl, 'Calendar link copied')}><Icon name="copy" />Copy link</button>
		<button class="btn sm ghost" onclick={regenerate}>{regenArm ? 'Tap again to replace' : 'Replace link'}</button>
	</div>

	<div class="switch-row">
		<div><b>Competitor warning</b><small>Warn when two brands in the same category, or listed as competitors, go live within this many days of each other.</small></div>
		<select class="inp" style="width:auto" aria-label="Competitor warning window" value={s.competitor_window_days} onchange={(e) => saveSettings({ competitor_window_days: Number((e.currentTarget as HTMLSelectElement).value) })}>
			{#each [3, 7, 14, 21, 30] as d (d)}<option value={d}>{d} days</option>{/each}
		</select>
	</div>
</section>
