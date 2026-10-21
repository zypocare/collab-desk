<script lang="ts">
	import { onMount } from 'svelte';
	import { saveSettings, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

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
			const r = await tg('info');
			bot = r.bot ?? '';
			if (r.configured === false) tgError = 'Telegram alerts aren’t set up for this app yet.';
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
			const { data } = await supabase.from('creator_settings').select('telegram_chat_id').single();
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

	// Times for the pending-payment notification (India time), up to six a day.
	const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
	// Fun nudges: any hour from 5 AM to 11 PM.
	const FUN_HOURS = Array.from({ length: 19 }, (_, i) => i + 5);
	const hours = $derived([...(s.pay_alert_hours ?? [9, 13, 17, 21])].sort((a, b) => a - b));
	const hourLabel = (h: number) => (h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`);
	function toggleHour(h: number) {
		const next = hours.includes(h) ? hours.filter((x) => x !== h) : [...hours, h];
		if (next.length > 6) return toast('Six reminders a day is the most', 'alert');
		if (!next.length) return saveSettings({ pay_alerts: false, pay_alert_hours: [9, 13, 17, 21] });
		saveSettings({ pay_alert_hours: next.sort((a, b) => a - b) });
	}
</script>

<section class="panel rv" style="--i:5">
	<div class="panel-h"><h2>Summary & calendar</h2><small>so nothing slips</small></div>
	<div class="switch-row" style="border-top:0">
		<div><b>9 AM summary email</b><small>Every morning: follow-ups, drafts due, go-lives, overdue payments and brand replies. Skipped on days with nothing to do.</small></div>
		<input type="checkbox" class="tgl" checked={s.digest_enabled} aria-label="9 AM summary email" onchange={(e) => saveSettings({ digest_enabled: (e.currentTarget as HTMLInputElement).checked })} />
	</div>

	<div class="switch-row">
		<div><b>Pending payment reminders</b><small>A phone notification with the money still to come in, at the times below. Its buttons remind the brands or open Payments. Skipped when nothing is pending. Phone alerts must be on (above).</small></div>
		<input type="checkbox" class="tgl" checked={s.pay_alerts ?? true} aria-label="Pending payment reminders" onchange={(e) => saveSettings({ pay_alerts: (e.currentTarget as HTMLInputElement).checked })} />
	</div>
	{#if s.pay_alerts ?? true}
		<div class="pay-hours" role="group" aria-label="Reminder times">
			{#each HOURS as h (h)}
				<button type="button" class="pay-h" class:on={hours.includes(h)} aria-pressed={hours.includes(h)} onclick={() => toggleHour(h)}>{hourLabel(h)}</button>
			{/each}
			<small>{hours.length} a day{hours.length >= 6 ? ' (the most)' : ''}</small>
		</div>
	{/if}

	<div class="switch-row">
		<div><b>Fun nudges through the day</b><small>A funny, useful note every hour: your work in between water and food, yoga in the evening and a wind-down at night. Written fresh from your real day, never the same line twice. Phone alerts must be on (above).</small></div>
		<input type="checkbox" class="tgl" checked={s.fun_nudges ?? true} aria-label="Fun nudges through the day" onchange={(e) => saveSettings({ fun_nudges: (e.currentTarget as HTMLInputElement).checked })} />
	</div>
	{#if s.fun_nudges ?? true}
		<div class="fun-set">
			<div class="f"><label for="fun-from">From</label><Select id="fun-from" value={s.fun_from ?? 11} options={FUN_HOURS.filter((h) => h <= (s.fun_to ?? 23)).map((h) => ({ value: h, label: hourLabel(h) }))} onchange={(v) => saveSettings({ fun_from: v })} /></div>
			<div class="f"><label for="fun-to">Until</label><Select id="fun-to" value={s.fun_to ?? 23} options={FUN_HOURS.filter((h) => h >= (s.fun_from ?? 11)).map((h) => ({ value: h, label: hourLabel(h) }))} onchange={(v) => saveSettings({ fun_to: v })} /></div>
			<div class="f"><label for="fun-yoga">Yoga</label><Select id="fun-yoga" value={s.fun_yoga_hour ?? 18} options={[{ value: 0, label: 'No yoga reminder' }, ...FUN_HOURS.map((h) => ({ value: h, label: hourLabel(h) }))]} onchange={(v) => saveSettings({ fun_yoga_hour: v })} /></div>
		</div>
		<div class="switch-row">
			<div><b>Food and water</b><small>Water, lunch, chai and dinner reminders between the work ones.</small></div>
			<input type="checkbox" class="tgl" checked={s.fun_food ?? true} aria-label="Food and water reminders" onchange={(e) => saveSettings({ fun_food: (e.currentTarget as HTMLInputElement).checked })} />
		</div>
	{/if}

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
		<Select style="width:auto;min-width:120px" ariaLabel="Competitor warning window" value={Number(s.competitor_window_days)} options={[3, 7, 14, 21, 30].map((d) => ({ value: d, label: `${d} days` }))} onchange={(v) => saveSettings({ competitor_window_days: v })} />
	</div>
</section>

<style>
	.pay-hours { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 18px 14px; }
	.pay-h { height: 34px; padding: 0 12px; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--ink-2); font: 500 13.5px var(--f-body); cursor: pointer; }
	.pay-h.on { border-color: transparent; background: var(--ink); color: var(--surface); }
	.pay-hours small { font-size: 12.5px; color: var(--ink-3); margin-left: 4px; }
	.fun-set { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 0 18px 14px; }
	@media (max-width: 760px) { .fun-set { gap: 12px; padding: 0 16px 10px; } }
</style>
