<script lang="ts">
	import { studio, updateCollab } from '../studio.svelte';
	import { toast } from '../ui.svelte';
	import type { Collab } from '../types';
	import {
		estimateTrip,
		extractMapsUrl,
		googleMapsSearchUrl,
		haversineKm,
		mapsDirectionsUrl,
		resolveMapsLink,
		routeDistance,
		searchPlaces,
		TRAVEL_SLOTS,
		type PlaceCandidate,
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
	let candidates = $state<PlaceCandidate[]>([]);
	let searchedEmpty = $state(false);
	let lastCollabId = $state('');

	$effect(() => {
		if (c.id !== lastCollabId) {
			lastCollabId = c.id;
			venueInput = c.venue_address || c.venue_name || '';
			candidates = [];
			searchedEmpty = false;
		}
	});

	const hasHome = $derived(typeof s?.home_lat === 'number' && typeof s?.home_lng === 'number');
	const homeCoords = $derived(hasHome ? { lat: s!.home_lat!, lng: s!.home_lng! } : null);
	const hasVenuePin = $derived(typeof c.venue_lat === 'number' && typeof c.venue_lng === 'number');

	const trip = $derived(
		typeof c.travel_km === 'number' && c.travel_km > 0
			? estimateTrip(c.travel_km, c.travel_mins, travelMode, slotId, bufferMins)
			: null
	);

	const dealVal = $derived(c.type === 'barter' ? Number(c.product_value || 0) : Number(c.fee || 0));
	const costRatio = $derived(trip && dealVal > 0 ? Math.round((trip.roundTripCost / dealVal) * 100) : 0);
	const tightBarter = $derived(!!trip && c.type === 'barter' && (costRatio >= 30 || trip.distKm >= 12));

	const mapsSearchHref = $derived(
		googleMapsSearchUrl(
			[venueInput.trim() || c.brand.name, s?.city || ''].filter(Boolean).join(', ')
		)
	);

	const mapsUrl = $derived(
		mapsDirectionsUrl(
			homeCoords ?? (s?.home_address || s?.home_area || s?.city || 'Bengaluru'),
			hasVenuePin ? { lat: c.venue_lat!, lng: c.venue_lng! } : (c.venue_address || c.venue_name || c.brand.name)
		)
	);

	async function setMode(next: 'home' | 'location') {
		if (next === mode) return;
		await updateCollab(c.id, { shoot_mode: next });
		if (next === 'home') toast('Set to At home — travel advisor hidden', 'check');
	}

	async function applyPin(place: { lat: number; lng: number; label: string }) {
		locating = true;
		try {
			let km: number | null = null;
			let mins: number | null = null;
			if (homeCoords) {
				const r = await routeDistance(homeCoords, { lat: place.lat, lng: place.lng });
				km = r.km;
				mins = r.mins;
			}
			await updateCollab(c.id, {
				shoot_mode: 'location',
				venue_name: c.brand.name,
				venue_address: place.label,
				venue_lat: place.lat,
				venue_lng: place.lng,
				travel_km: km,
				travel_mins: mins
			});
			venueInput = place.label;
			candidates = [];
			searchedEmpty = false;
			toast(
				km
					? `Pinned ${place.label} · ${km} km (~${mins} min)`
					: 'Venue pinned. Add your Home Base in Settings → Home base & travel to calculate distance.',
				'check'
			);
		} finally {
			locating = false;
		}
	}

	async function searchOrResolve(e?: Event) {
		e?.preventDefault();
		const q = venueInput.trim();
		if (!q) return toast('Type a venue name or paste a Google Maps share link', 'alert');
		locating = true;
		searchedEmpty = false;
		candidates = [];
		try {
			// 1. If it's a Google Maps link (including maps.app.goo.gl), resolve pin directly
			if (extractMapsUrl(q) || /@-?\d+\.\d+,-?\d+\.\d+/.test(q) || /!3d-?\d+\.\d+!4d-?\d+\.\d+/.test(q)) {
				const pin = await resolveMapsLink(q);
				if (!pin) {
					toast("Couldn't read that Google Maps link. Copy the Share link from Google Maps and try again.", 'alert');
					return;
				}
				await applyPin(pin);
				return;
			}

			// 2. Otherwise search matching places biased near Home Base and let user pick the exact one
			const hits = await searchPlaces(q, { cityHint: s?.city ?? '', bias: homeCoords });
			if (!hits.length) {
				searchedEmpty = true;
				return;
			}
			candidates = hits;
		} finally {
			locating = false;
		}
	}

	async function pasteMapsLink() {
		try {
			const clip = (await navigator.clipboard.readText()).trim();
			if (!clip) return toast('Clipboard is empty. Copy a Share link from Google Maps first.', 'alert');
			venueInput = clip;
			await searchOrResolve();
		} catch {
			toast('Tap the box above and paste the Google Maps link directly.', 'alert');
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
			<a class="trv-warn" href="/studio/settings?s=travel">
				<Icon name="pin" />
				<span>Set your private <b>Home Base</b> in Settings to calculate distance &amp; travel cost.</span>
				<Icon name="chevR" />
			</a>
		{/if}

		{#if hasVenuePin && c.venue_address}
			<div class="trv-pinned">
				<Icon name="check" />
				<span><b>Pinned:</b> {c.venue_address}</span>
			</div>
		{/if}

		<form class="trv-form" onsubmit={searchOrResolve}>
			<input
				class="trv-inp"
				type="text"
				placeholder="Paste Google Maps link or search venue…"
				aria-label="Shoot venue location"
				bind:value={venueInput}
			/>
			<button type="submit" class="trv-neo sm" disabled={locating || !venueInput.trim()}>
				{#if locating}<span class="spinner"></span>{:else}<Icon name="search" />{/if}
				<span>Find</span>
			</button>
		</form>

		<div class="trv-gmaps-row">
			<a class="trv-gbtn" href={mapsSearchHref} target="_blank" rel="noopener">
				<Icon name="pin" /><span>Pick on Google Maps</span>
			</a>
			<button type="button" class="trv-gbtn" disabled={locating} onclick={pasteMapsLink}>
				<Icon name="link" /><span>Paste Maps link</span>
			</button>
		</div>

		{#if candidates.length}
			<div class="trv-picks" role="listbox" aria-label="Matching places">
				<span class="trv-picks-h">Tap the exact place to pin:</span>
				{#each candidates as p (p.lat + ',' + p.lng + p.name)}
					<button type="button" class="trv-pick" disabled={locating} onclick={() => applyPin(p)}>
						<span class="trv-pick-t">
							<b>{p.name}</b>
							{#if p.sub}<small>{p.sub}</small>{/if}
						</span>
						{#if homeCoords}
							<em class="trv-pick-km">~{Math.round(haversineKm(homeCoords, p) * 1.25)} km</em>
						{/if}
					</button>
				{/each}
			</div>
		{:else if searchedEmpty}
			<div class="trv-empty">
				<span>Couldn't find "{venueInput.trim()}" on OpenStreetMap. Tap <b>Pick on Google Maps</b> above, copy the Share link, and tap <b>Paste Maps link</b> for exact accuracy.</span>
			</div>
		{/if}

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
		margin-top: 8px;
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

	.trv-pinned {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		padding: 8px 10px;
		border-radius: 10px;
		border: 1px solid rgba(52, 211, 153, 0.28);
		background: rgba(16, 185, 129, 0.08);
		font-size: 12.5px;
		line-height: 1.4;
		color: #d1fae5;
	}
	.trv-pinned :global(.ic) { width: 14px; height: 14px; flex: none; margin-top: 2px; color: #34d399; }

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

	.trv-gmaps-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 7px;
	}
	.trv-gbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 34px;
		padding: 0 10px;
		border-radius: 9px;
		border: 1px solid rgba(156, 123, 255, 0.28);
		background: rgba(156, 123, 255, 0.08);
		color: var(--ink);
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}
	.trv-gbtn:disabled { opacity: 0.5; cursor: not-allowed; }
	.trv-gbtn :global(.ic) { width: 13px; height: 13px; color: #c8b6ff; flex: none; }

	.trv-picks {
		display: grid;
		gap: 6px;
		padding: 10px;
		border-radius: 12px;
		border: 1px solid rgba(156, 123, 255, 0.3);
		background: rgba(13, 10, 14, 0.72);
	}
	.trv-picks-h {
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #c8b6ff;
	}
	.trv-pick {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 9px 10px;
		border-radius: 9px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.trv-pick:hover { border-color: rgba(242, 90, 144, 0.45); background: rgba(242, 90, 144, 0.08); }
	.trv-pick-t { display: grid; gap: 2px; min-width: 0; }
	.trv-pick-t b { font-size: 13px; font-weight: 600; color: var(--ink); }
	.trv-pick-t small { font-size: 11.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.trv-pick-km { font-style: normal; font-family: var(--mono); font-size: 11px; color: #6ee7b7; flex: none; }

	.trv-empty {
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px dashed rgba(251, 191, 36, 0.35);
		background: rgba(251, 191, 36, 0.08);
		font-size: 12.5px;
		line-height: 1.45;
		color: #fef3c7;
	}

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
