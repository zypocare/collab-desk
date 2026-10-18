<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import { toast } from '../ui.svelte';
	import { fmtLong, rel, todayIso } from '../util';
	import DatePicker from './DatePicker.svelte';
	import Icon from './Icon.svelte';

	// Away mode: while she's away, new requests and brand messages get a polite automatic reply
	// (once per chat), and her page says when she's back. Turning it off is one tap.
	let { banner = false }: { banner?: boolean } = $props();
	const s = $derived(studio.settings!);
	const on = $derived(!!s?.away_until && s.away_until >= todayIso());
	let until = $state('');
	async function start() {
		if (!until) return toast('Pick the day you’re back.', 'alert');
		await saveSettings({ away_until: until });
		toast(`Away mode on until ${fmtLong(until)}`, 'check');
	}
	async function stop() {
		await saveSettings({ away_until: null });
		toast('Away mode off. Welcome back!', 'check');
	}
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
</script>

{#if banner}
	{#if on}
		<div class="away-banner">
			<span class="away-ic"><Icon name="moon" /></span>
			<span><b>Away until {fmtLong(s.away_until)}</b><small>Brands get an automatic reply and your page says when you're back.</small></span>
			<button class="btn sm" onclick={stop}>I'm back</button>
		</div>
	{/if}
{:else}
	<section class="panel rv away-panel" style="--i:2">
		<div class="panel-h"><h2>Away mode</h2><small>{on ? `on until ${fmtLong(s.away_until)}` : 'automatic replies while you’re away'}</small></div>
		<div class="form-b">
			{#if on}
				<div class="f span2 away-on"><Icon name="moon" /><span>New requests and brand messages get a polite reply saying you're back on <b>{fmtLong(s.away_until)}</b>.</span><button class="btn sm" onclick={stop}>Turn off</button></div>
			{:else}
				<div class="f"><label for="aw-until">I'm away until</label><DatePicker id="aw-until" min={rel(1)} bind:value={until} placeholder="Pick the day you're back" /></div>
				<div class="f away-go"><button class="btn primary" disabled={!until} onclick={start}><Icon name="moon" />Turn on away mode</button></div>
			{/if}
			<div class="f span2"><label for="aw-note">Note for brands <span class="hint">(optional)</span></label><input class="inp" id="aw-note" maxlength="200" value={s.away_note} onchange={(e) => saveSettings({ away_note: val(e).trim() })} /></div>
			<div class="f span2"><label for="aw-contact">For anything urgent, contact <span class="hint">(optional: a name, email or number)</span></label><input class="inp" id="aw-contact" maxlength="120" value={s.away_contact} onchange={(e) => saveSettings({ away_contact: val(e).trim() })} /></div>
		</div>
	</section>
{/if}
