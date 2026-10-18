<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import Select from './Select.svelte';

	// Pricing & offers: the three switches that change what brands pay or get, in one place.
	const s = $derived(studio.settings!);
	const tgl = (e: Event) => (e.currentTarget as HTMLInputElement).checked;
	// Is demand pricing raising prices right now?
	let demandNow = $state(1);
	const checkDemand = () => supabase.rpc('demand_factor').then(({ data }) => (demandNow = Number(data) || 1));
	$effect(() => {
		void s.demand_pricing;
		void s.demand_pct;
		checkDemand();
	});
</script>

<section class="panel rv" style="--i:2">
	<div class="panel-h"><h2>Pricing & offers</h2><small>what brands pay, and the offers they get</small></div>

	<div class="switch-row" style="border-top:0">
		<div>
			<b>Book again offer</b>
			<small>A week after a collab wraps, the brand gets a thank-you with a one-tap "Book again" link{s.rebook_pct ? ` and ${s.rebook_pct}% off their next collab, valid for ${s.rebook_days} days` : ''}.</small>
		</div>
		<input type="checkbox" class="tgl" checked={s.rebook_offer} aria-label="Book again offer" onchange={(e) => saveSettings({ rebook_offer: tgl(e) })} />
	</div>
	{#if s.rebook_offer}
		<div class="form-b">
			<div class="f"><label for="of-rb-pct">Returning-brand discount</label><Select id="of-rb-pct" value={s.rebook_pct} options={[0, 5, 10, 15, 20].map((n) => ({ value: n, label: n ? `${n}% off` : 'No discount' }))} onchange={(v) => saveSettings({ rebook_pct: v })} /></div>
			<div class="f"><label for="of-rb-days">Offer valid for</label><Select id="of-rb-days" value={s.rebook_days} options={[14, 30, 60, 90].map((n) => ({ value: n, label: `${n} days` }))} onchange={(v) => saveSettings({ rebook_days: v })} /></div>
		</div>
	{/if}

	<div class="switch-row">
		<div>
			<b>Prices follow demand</b>
			<small>When your next 4 weeks are at least 75% booked, your package prices on your page go up by {s.demand_pct}%, and come back down when you have space.{#if s.demand_pricing} <b>{demandNow > 1 ? `Active now: +${s.demand_pct}%.` : 'Not active right now: you have space.'}</b>{/if}</small>
		</div>
		<input type="checkbox" class="tgl" checked={s.demand_pricing} aria-label="Prices follow demand" onchange={(e) => saveSettings({ demand_pricing: tgl(e) })} />
	</div>
	{#if s.demand_pricing}
		<div class="form-b"><div class="f span2"><label for="of-dem">Raise package prices by</label><Select id="of-dem" value={s.demand_pct} options={[10, 15, 20, 25, 30].map((n) => ({ value: n, label: `${n}%` }))} onchange={(v) => saveSettings({ demand_pct: v })} /></div></div>
	{/if}

	<div class="switch-row">
		<div>
			<b>Instant booking for packages</b>
			<small>A brand booking one of your packages for an open week, at least 3 days ahead and with no competitor that week, is confirmed straight away. Both of you get an email.</small>
		</div>
		<input type="checkbox" class="tgl" checked={s.instant_booking} aria-label="Instant booking for packages" onchange={(e) => saveSettings({ instant_booking: tgl(e) })} />
	</div>
</section>
