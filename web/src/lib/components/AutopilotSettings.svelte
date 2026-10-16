<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import { ui } from '../ui.svelte';
	import type { Settings } from '../types';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	// Rules she switches on once; the database runs them (see migration 24_autopilot).
	const s = $derived(studio.settings!);
	const on = (k: keyof Settings) => (e: Event) => saveSettings({ [k]: (e.currentTarget as HTMLInputElement).checked } as Partial<Settings>);

	// What auto-pilot did lately, from each collab's history.
	const recent = $derived(
		studio.collabs
			.flatMap((c) => (c.events ?? []).filter((e) => e.text.startsWith('Auto-pilot:')).map((e) => ({ ...e, c })))
			.sort((a, b) => b.at.localeCompare(a.at))
			.slice(0, 5)
	);
	const when = (at: string) => new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
</script>

<section class="panel rv" style="--i:3">
	<div class="panel-h"><h2>Auto-pilot</h2><small>switch on once, it runs by itself</small></div>
	<div class="switch-row" style="border-top:0">
		<div>
			<b>Send quotes for package bookings</b>
			<small>When a brand books a package for a week you have open, the quote goes out at the package price with your usual terms. They accept in one tap.</small>
		</div>
		<input type="checkbox" class="tgl" checked={s.autopilot_packages} aria-label="Send quotes for package bookings" onchange={on('autopilot_packages')} />
	</div>
	<div class="switch-row">
		<div>
			<b>Counter low barter offers</b>
			<small>Barter below your minimum, past your monthly slots, or worth under half your rate gets a polite email offering Paid + product at a fair fee. One tap for them to switch.</small>
		</div>
		<input type="checkbox" class="tgl" checked={s.autopilot_counter} aria-label="Counter low barter offers" onchange={on('autopilot_counter')} />
	</div>
	<div class="switch-row">
		<div>
			<b>Remind brands who go quiet</b>
			<small>One friendly reminder when a quote or draft has had no answer, with the same one-tap button.</small>
			{#if s.autopilot_nudge}
				<Select size="sm" style="width:150px;margin-top:8px" ariaLabel="Remind after" value={s.nudge_days} options={[2, 3, 4, 5, 7].map((n) => ({ value: n, label: `after ${n} days` }))} onchange={(v) => saveSettings({ nudge_days: v })} />
			{/if}
		</div>
		<input type="checkbox" class="tgl" checked={s.autopilot_nudge} aria-label="Remind brands who go quiet" onchange={on('autopilot_nudge')} />
	</div>
	<div class="switch-row">
		<div>
			<b>Ask for missing brief details</b>
			<small>When a collab is confirmed and the brief has no key message, hashtags, do's or who to tag, the brand gets a two-minute form to fill them in.</small>
		</div>
		<input type="checkbox" class="tgl" checked={s.autopilot_brief} aria-label="Ask for missing brief details" onchange={on('autopilot_brief')} />
	</div>
	<div class="switch-row">
		<div>
			<b>Thank and ask for a review</b>
			<small>When you mark a collab wrapped, the brand gets a thank-you with a 20-second review link.</small>
		</div>
		<input type="checkbox" class="tgl" checked={s.autopilot_review} aria-label="Thank and ask for a review" onchange={on('autopilot_review')} />
	</div>
	{#if recent.length}
		<div class="rv-list ap-log">
			<span class="lbl-t">Lately</span>
			{#each recent as r (r.id)}
				<button class="rv-row" onclick={() => (ui.openCollab = r.c.id)}>
					<Icon name="spark" />
					<div><b>{r.c.brand.name}</b><small>{r.text.replace('Auto-pilot: ', '').replace(/^./, (m) => m.toUpperCase())}</small></div>
					<small>{when(r.at)}</small>
				</button>
			{/each}
		</div>
	{/if}
</section>
