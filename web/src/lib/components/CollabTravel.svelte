<script lang="ts">
	import { studio, updateCollab } from '../studio.svelte';
	import { toast } from '../ui.svelte';
	import type { Collab } from '../types';
	import {
		estimateTrip,
		geocodePlace,
		mapsDirectionsUrl,
		routeDistance,
		TRAVEL_SLOTS,
		type TravelMode,
		type TravelSlotId
	} from '../travel';
	import Icon from './Icon.svelte';

	let { c }: { c: Collab } = $props();
	const s = $derived(studio.settings);
	const mode = $derived<'home' | 'location'>(c.shoot_mode === 'location' ? 'location' : 'home');
	const travelMode = $derived<TravelMode>((s?.travel_mode as TravelMode) || 'cab');
	const bufferMins = $derived(Number(s?.travel_buffer_mins ?? 15));
	const slotId = $derived<TravelSlotId>((c.travel_slot as TravelSlotId) || 'midday');

	let venueInput = $state('');
	let locating = $state(false);

	$effect(() => {
		venueInput = c.venue_address || c.venue_name || '';
	});

	const hasHome = $derived(typeof s?.home_lat === 'number' && typeof s?.home_lng === 'number');
	const trip = $derived(
		typeof c.travel_km === 'number' && c.travel_km > 0
			? estimateTrip(c.travel_km, c.travel_mins, travelMode, slotId, bufferMins)
			: null
	);

	const dealVal = $derived(c.type === 'barter' ? Number(c.product_value || 0) : Number(c.fee || 0));
	const costRatio = $derived(trip && dealVal > 0 ? Math.round((trip.roundTripCost / dealVal) * 100) : 0);
	const tightBarter = $derived(!!trip && c.type === 'barter' && (costRatio >= 30 || trip.distKm >= 12));

	const mapsUrl = $derived(
		mapsDirectionsUrl(
			s?.home_address || s?.home_area || s?.city || 'Bengaluru',
			c.venue_address || c.venue_name || c.brand.name
		)
	);

	async function setMode(next: 'home' | 'location') {
		if (next === mode) return;
		await updateCollab(c.id, { shoot_mode: next });
		if (next === 'home') toast('Set to At home — travel advisor hidden', 'check');
	}

	async function calcVenue(e?: Event) {
		e?.preventDefault();
		const q = venueInput.trim();
		if (!q) return toast('Enter the venue name or paste a Google Maps link', 'alert');
		locating = true;
		try {
			const geo = await geocodePlace(q, s?.city ?? '');
			if (!geo) {
				locating = false;
				return toast("Couldn't find that location. Try adding the area name or pasting a Google Maps link.", 'alert');
			}
			let km: number | null = null;
			let mins: number | null = null;
			if (hasHome) {
				const r = await routeDistance({ lat: s!.home_lat!, lng: s!.home_lng! }, { lat: geo.lat, lng: geo.lng });
				km = r.km;
				mins = r.mins;
			}
			await updateCollab(c.id, {
				shoot_mode: 'location',
				venue_name: c.brand.name,
				venue_address: geo.label,
				venue_lat: geo.lat,
				venue_lng: geo.lng,
				travel_km: km,
				travel_mins: mins
			});
			toast(km ? `Distance calculated: ${km} km (~${mins} min off-peak)` : 'Venue saved. Add your Home Base in Profile to calculate distance.', 'check');
		} finally {
			locating = false;
		}
	}

	async function pickSlot(id: TravelSlotId) {
		await updateCollab(c.id, { travel_slot: id });
	}

	async function toggleNudge() {
		const next = !c.leave_nudge;
		await updateCollab(c.id, { leave_nudge: next });
		toast(next ? `Shoot-day leave nudge enabled (+${bufferMins}m buffer)` : 'Leave nudge turned off', 'check');
	}
</script>

<div class="trv">
	<div class="trv-top">
		<span class="trv-eb">Shoot location</span>
		<span class="trv-hint">{mode === 'home' ? 'No travel needed' : 'Travel advisor active'}</span>
	</div>

	<div class="trv-tabs" role="radiogroup" aria-label="Where are you shooting">
		<button type="button" class:on={mode === 'home'} onclick={() => setMode('home')}>At home</button>
		<button type="button" class:on={mode === 'location'} onclick={() => setMode('location')}>On-location</button>
	</div>

	{#if mode === 'home'}
		<div class="trv-home">
			<Icon name="home" />
			<span>Shooting at home / studio — distance &amp; travel planning stay hidden.</span>
		</div>
	{:else}
		{#if !hasHome}
			<a class="trv-warn" href="/studio/settings?s=profile">
				<Icon name="pin" />
				<span>Set your private <b>Home Base</b> in Profile to calculate distance &amp; cab cost.</span>
				<Icon name="chevR" />
			</a>
		{/if}

		<form class="trv-form" onsubmit={calcVenue}>
			<input
				class="trv-inp"
				type="text"
				placeholder="Venue name, area, or Google Maps link…"
				aria-label="Shoot venue location"
				bind:value={venueInput}
			/>
			<button type="submit" class="trv-neo sm" disabled={locating || !venueInput.trim()}>
				{#if locating}<span class="spinner"></span>{:else}<Icon name="pin" />{/if}
				<span>{trip ? 'Update' : 'Calculate'}</span>
			</button>
		</form>

		{#if trip}
			<div class="trv-kpis">
				<div class="trv-kpi hi">
					<small>Distance</small>
					<b>{trip.distKm} km</b>
					<span>one way</span>
				</div>
				<div class="trv-kpi">
					<small>Drive time</small>
					<b>{trip.estMin}m</b>
					<span>{trip.slot.tLabel}</span>
				</div>
				<div class="trv-kpi">
					<small>Round trip</small>
					<b>₹{trip.roundTripCost}</b>
					<span>{trip.mode.label} est.</span>
				</div>
			</div>

			<div class="trv-slots">
				{#each TRAVEL_SLOTS as sl (sl.id)}
					<button type="button" class="trv-slot" class:on={slotId === sl.id} onclick={() => pickSlot(sl.id)}>
						<span class="trv-st">
							<b>{sl.short}</b>
							<em class={sl.traffic}>{sl.tLabel}</em>
						</span>
						<small>{sl.label}</small>
					</button>
				{/each}
			</div>

			<div class="trv-ai">
				<div class="trv-ai-h">
					<span><Icon name="spark" />AI Leave-Time Advisor</span>
					<small>{trip.baseMin}m – {trip.peakMin}m range</small>
				</div>
				<p>{trip.advice}</p>
			</div>

			{#if dealVal > 0}
				<div class="trv-real" class:tight={tightBarter}>
					<Icon name={tightBarter ? 'alert' : 'check'} />
					<span>
						{#if tightBarter}
							<b>Barter reality check:</b> Round-trip travel (~₹{trip.roundTripCost} + {trip.estMin * 2} min) is ~{costRatio}% of this ₹{dealVal.toLocaleString('en-IN')} barter. Batch with a nearby shoot or ask for travel cover.
						{:else}
							<b>Commute looks healthy:</b> Travel cost (~₹{trip.roundTripCost}) is ~{costRatio}% of the ₹{dealVal.toLocaleString('en-IN')} deal value.
						{/if}
					</span>
				</div>
			{/if}

			<div class="trv-acts">
				<a class="trv-neo" href={mapsUrl} target="_blank" rel="noopener">
					<Icon name="send" /><span>Open Google Maps</span>
				</a>
				<button type="button" class="trv-btn" class:on={!!c.leave_nudge} onclick={toggleNudge}>
					<Icon name={c.leave_nudge ? 'check' : 'bell'} />
					<span>{c.leave_nudge ? 'Nudge set' : 'Leave nudge'}</span>
				</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.trv {
		display: grid;
		gap: 11px;
		margin-top: 14px;
		padding: 14px;
		border-radius: 16px;
		border: 1px solid rgba(156, 123, 255, 0.22);
		background:
			radial-gradient(120% 80% at 0% 0%, rgba(156, 123, 255, 0.1), transparent 58%),
			var(--paper, var(--surface));
	}
	.trv-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.trv-eb {
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.trv-hint { font-size: 11.5px; color: var(--ink-3); }

	.trv-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(13, 10, 14, 0.55);
	}
	.trv-tabs button {
		height: 36px;
		border: 0;
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		background: transparent;
		color: var(--ink-2);
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.trv-tabs button:last-child { border-right: 0; }
	.trv-tabs button.on {
		background: var(--ink);
		color: var(--bg);
		box-shadow: inset 0 -3px 0 var(--g2);
	}

	.trv-home {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 10px 12px;
		border-radius: 11px;
		border: 1px dashed rgba(156, 123, 255, 0.28);
		background: rgba(156, 123, 255, 0.05);
		font-size: 12.5px;
		color: var(--ink-2);
	}
	.trv-home :global(.ic) { width: 15px; height: 15px; flex: none; color: #c8b6ff; }

	.trv-warn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		border-radius: 11px;
		border: 1px solid rgba(251, 191, 36, 0.34);
		background: rgba(251, 191, 36, 0.1);
		color: #fef3c7;
		font-size: 12.5px;
		text-decoration: none;
	}
	.trv-warn :global(.ic) { width: 15px; height: 15px; flex: none; }
	.trv-warn span { flex: 1; }

	.trv-form { display: flex; gap: 8px; align-items: center; }
	.trv-inp {
		flex: 1;
		min-width: 0;
		height: 38px;
		padding: 0 11px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(13, 10, 14, 0.65);
		color: var(--ink);
		font: 400 13.5px/1 var(--f-sans, inherit);
		outline: none;
	}
	.trv-inp:focus { border-color: rgba(156, 123, 255, 0.55); }

	.trv-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
	.trv-kpi {
		display: grid;
		gap: 2px;
		padding: 9px 10px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(13, 10, 14, 0.5);
	}
	.trv-kpi.hi { border-color: rgba(52, 211, 153, 0.32); background: rgba(16, 185, 129, 0.1); }
	.trv-kpi small { font-family: var(--mono); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); }
	.trv-kpi b { font: 400 20px/1.1 var(--f-serif, Georgia, serif); color: var(--ink); }
	.trv-kpi.hi b { color: #6ee7b7; }
	.trv-kpi span { font-size: 11px; color: var(--ink-2); }

	.trv-slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
	.trv-slot {
		display: grid;
		gap: 2px;
		padding: 9px 10px;
		border-radius: 11px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.trv-slot.on { border-color: var(--g2); background: rgba(242, 90, 144, 0.12); }
	.trv-st { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
	.trv-st b { font-size: 12.5px; font-weight: 600; }
	.trv-st em { font-style: normal; font-family: var(--mono); font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 999px; }
	.trv-st em.ok { background: rgba(52, 211, 153, 0.16); color: #6ee7b7; }
	.trv-st em.mid { background: rgba(251, 191, 36, 0.16); color: #fcd34d; }
	.trv-st em.bad { background: rgba(251, 113, 133, 0.18); color: #fda4af; }
	.trv-slot small { font-size: 11px; color: var(--ink-2); }

	.trv-ai {
		display: grid;
		gap: 5px;
		padding: 11px 12px;
		border-radius: 12px;
		border: 1px solid rgba(156, 123, 255, 0.3);
		background: linear-gradient(145deg, rgba(156, 123, 255, 0.12), rgba(242, 90, 144, 0.06) 60%, rgba(13, 10, 14, 0.5));
	}
	.trv-ai-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.trv-ai-h span { display: inline-flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #d8cbff; }
	.trv-ai-h :global(.ic) { width: 13px; height: 13px; }
	.trv-ai-h small { font-family: var(--mono); font-size: 10px; color: var(--ink-3); }
	.trv-ai p { margin: 0; font-size: 13px; line-height: 1.48; color: var(--ink); }

	.trv-real {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 10px 11px;
		border-radius: 11px;
		border: 1px solid rgba(52, 211, 153, 0.28);
		background: rgba(16, 185, 129, 0.08);
		font-size: 12.5px;
		line-height: 1.45;
		color: #d1fae5;
	}
	.trv-real.tight { border-color: rgba(251, 191, 36, 0.36); background: rgba(251, 191, 36, 0.1); color: #fef3c7; }
	.trv-real :global(.ic) { width: 15px; height: 15px; flex: none; margin-top: 2px; }

	.trv-acts { display: flex; gap: 8px; }
	.trv-neo {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 38px;
		padding: 0 13px;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		color: var(--bg);
		font: 700 13px/1 var(--f-sans, inherit);
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--g2);
		cursor: pointer;
	}
	.trv-neo.sm { flex: none; }
	.trv-neo:disabled { opacity: 0.55; cursor: not-allowed; }
	.trv-neo :global(.ic) { width: 14px; height: 14px; }

	.trv-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 38px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.04);
		color: var(--ink);
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.trv-btn.on { border-color: rgba(52, 211, 153, 0.45); background: rgba(16, 185, 129, 0.14); color: #6ee7b7; }
	.trv-btn :global(.ic) { width: 14px; height: 14px; }
</style>
