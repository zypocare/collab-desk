<script lang="ts">
	import { studio, updateCollab } from '../studio.svelte';
	import { toast } from '../ui.svelte';
	import type { Collab } from '../types';
	import {
		cleanPlaceLabel,
		estimateTrip,
		extractMapsUrl,
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
	import MapPicker from './MapPicker.svelte';

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
	let mapOpen = $state(false);

	$effect(() => {
		if (c.id !== lastCollabId) {
			lastCollabId = c.id;
			venueInput = cleanPlaceLabel(c.venue_address || c.venue_name || '');
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


	async function clearVenuePin() {
		venueInput = '';
		candidates = [];
		searchedEmpty = false;
		await updateCollab(c.id, {
			venue_name: '',
			venue_address: '',
			venue_lat: null,
			venue_lng: null,
			travel_km: null,
			travel_mins: null
		});
		toast('Shoot location cleared', 'check');
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

<div class="trv-page">
	<!-- 1. Hero Card: Identical to Home Base & Travel -->
	<section class="trv-hero">
		<div class="trv-hero-top">
			<span class="trv-eb">Shoot location</span>
			{#if mode === 'location' && hasVenuePin}
				<button type="button" class="trv-rm" onclick={clearVenuePin}>Clear pin</button>
			{:else}
				<span class="trv-hint">{mode === 'home' ? 'No travel needed' : 'Travel advisor active'}</span>
			{/if}
		</div>

		<div class="trv-tabs" role="radiogroup" aria-label="Where are you shooting">
			<button type="button" class:on={mode === 'home'} onclick={() => setMode('home')}>At home</button>
			<button type="button" class:on={mode === 'location'} onclick={() => setMode('location')}>On-location</button>
		</div>

		{#if mode === 'home'}
			<div class="trv-empty-hero">
				<div class="trv-pin-dot idle" aria-hidden="true"><Icon name="home" /></div>
				<div>
					<h3>Shooting at home / studio</h3>
					<p>Distance, traffic estimates and leave-early nudges stay hidden for home collabs.</p>
				</div>
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
				<div class="trv-pinned-hero">
					<div class="trv-pin-dot" aria-hidden="true"><Icon name="pin" /></div>
					<div class="trv-pin-meta">
						<small>Pinned shoot venue</small>
						<h3>{cleanPlaceLabel(c.venue_address)}</h3>
						<code>{c.venue_lat!.toFixed(4)}, {c.venue_lng!.toFixed(4)}</code>
					</div>
				</div>
			{:else}
				<div class="trv-empty-hero">
					<div class="trv-pin-dot idle" aria-hidden="true"><Icon name="pin" /></div>
					<div>
						<h3>Pin the shoot venue</h3>
						<p>Calculate road distance, round-trip {trip?.mode.label.toLowerCase() ?? 'travel'} cost and the best time to leave.</p>
					</div>
				</div>
			{/if}

			<form class="trv-field" onsubmit={searchOrResolve}>
				<label for="trv-addr-{c.id}">Search venue or paste Google Maps link</label>
				<div class="trv-inp-wrap">
					<input
						id="trv-addr-{c.id}"
						class="trv-inp"
						type="text"
						placeholder="e.g. Indiranagar cafe or Google Maps link…"
						bind:value={venueInput}
					/>
					{#if venueInput}
						<button
							type="button"
							class="trv-clr"
							aria-label="Clear location"
							onclick={() => {
								venueInput = '';
								candidates = [];
								searchedEmpty = false;
							}}
						>×</button>
					{/if}
				</div>
				<button type="submit" class="trv-neo full" disabled={locating || !venueInput.trim()}>
					{#if locating}<span class="spinner"></span>{:else}<Icon name="search" />{/if}
					<span>{trip ? 'Find & update route' : 'Find & calculate'}</span>
				</button>
				<div class="trv-gmaps-row">
					<button type="button" class="trv-gbtn hi" onclick={() => (mapOpen = true)}>
						<Icon name="pin" /><span>Pick on interactive map</span>
					</button>
					<button type="button" class="trv-gbtn" disabled={locating} onclick={pasteMapsLink}>
						<Icon name="link" /><span>Paste Maps link</span>
					</button>
				</div>
			</form>

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
					<span>Couldn't find "{venueInput.trim()}" on the free index. Tap <b>Pick on interactive map</b> above or copy a Share link from Google Maps and tap <b>Paste Maps link</b>.</span>
				</div>
			{/if}
		{/if}
	</section>

	{#if mode === 'location' && trip}
		<!-- 2. Route & Timing Card -->
		<section class="trv-card">
			<div class="trv-card-h">
				<h2>Route &amp; timing</h2>
				<small>{trip.mode.label} · +{bufferMins}m buffer</small>
			</div>

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
		</section>

		<!-- 3. AI Leave Advisor & Actions -->
		<section class="trv-card">
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
		</section>
	{/if}
</div>

{#if mapOpen}
	<MapPicker
		title="Pick shoot location"
		initialLat={hasVenuePin ? c.venue_lat! : (homeCoords?.lat ?? 12.9716)}
		initialLng={hasVenuePin ? c.venue_lng! : (homeCoords?.lng ?? 77.5946)}
		initialLabel={cleanPlaceLabel(c.venue_address || c.venue_name || '')}
		cityHint={s?.city ?? ''}
		onclose={() => (mapOpen = false)}
		onpick={(place) => {
			mapOpen = false;
			void applyPin(place);
		}}
	/>
{/if}

<style>
	.trv-page {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 12px;
		margin-top: 6px;
		max-width: 100%;
	}
	.trv-page > * { min-width: 0; max-width: 100%; }

	.trv-hero, .trv-card {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 14px;
		padding: 16px;
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--surface, #161116);
		overflow: hidden;
	}
	.trv-hero {
		border-color: rgba(156, 123, 255, 0.25);
		background:
			radial-gradient(120% 80% at 0% 0%, rgba(156, 123, 255, 0.14), transparent 58%),
			radial-gradient(90% 70% at 100% 100%, rgba(242, 90, 144, 0.08), transparent 60%),
			var(--surface, #161116);
	}
	.trv-hero-top, .trv-card-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.trv-card-h h2 {
		margin: 0;
		font: 400 18px/1.15 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.trv-card-h small { font-size: 11.5px; color: var(--muted, var(--ink-3)); }
	.trv-eb {
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.trv-hint { font-size: 11.5px; color: var(--ink-3); }
	.trv-rm {
		border: 0;
		background: transparent;
		color: #fda4af;
		font-size: 12px;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
		flex-shrink: 0;
	}

	.trv-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(13, 10, 14, 0.6);
	}
	.trv-tabs button {
		height: 38px;
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

	.trv-pinned-hero, .trv-empty-hero {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 13px;
		border-radius: 14px;
		border: 1px solid rgba(52, 211, 153, 0.28);
		background: rgba(16, 185, 129, 0.08);
	}
	.trv-empty-hero {
		border-style: dashed;
		border-color: rgba(156, 123, 255, 0.35);
		background: rgba(156, 123, 255, 0.06);
	}
	.trv-pin-dot {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: rgba(52, 211, 153, 0.18);
		border: 1px solid rgba(52, 211, 153, 0.4);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.trv-pin-dot :global(.ic) { width: 17px; height: 17px; color: #6ee7b7; }
	.trv-pin-dot.idle { background: rgba(156, 123, 255, 0.16); border-color: rgba(156, 123, 255, 0.38); }
	.trv-pin-dot.idle :global(.ic) { color: #c8b6ff; }
	.trv-pin-meta { display: grid; gap: 3px; min-width: 0; }
	.trv-pin-meta small { font-family: var(--mono); font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #6ee7b7; }
	.trv-pinned-hero h3, .trv-empty-hero h3 { margin: 0; font: 400 17px/1.28 var(--f-serif, Georgia, serif); color: var(--ink); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.trv-pin-meta code { font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
	.trv-empty-hero p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.45; color: var(--ink-2); }

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

	.trv-field { display: grid; gap: 9px; min-width: 0; }
	.trv-field label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
	.trv-inp-wrap { position: relative; display: flex; align-items: center; min-width: 0; }
	.trv-inp {
		width: 100%;
		min-width: 0;
		height: 42px;
		padding: 0 36px 0 13px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: #0d0a0e;
		color: var(--ink);
		font: 400 16px/1 var(--f-sans, inherit);
		scroll-margin: 80px;
		outline: none;
	}
	.trv-inp:focus { border-color: var(--g1); }
	.trv-clr {
		position: absolute;
		right: 8px;
		width: 24px;
		height: 24px;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.1);
		color: var(--ink-2);
		font-size: 16px;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.trv-gmaps-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.trv-gbtn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 38px;
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid rgba(156, 123, 255, 0.28);
		background: rgba(156, 123, 255, 0.08);
		color: var(--ink);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.trv-gbtn.hi { border-color: rgba(242, 90, 144, 0.42); background: rgba(242, 90, 144, 0.12); }
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
		padding: 10px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(13, 10, 14, 0.5);
	}
	.trv-kpi.hi { border-color: rgba(52, 211, 153, 0.32); background: rgba(16, 185, 129, 0.1); }
	.trv-kpi small { font-family: var(--mono); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-3); }
	.trv-kpi b { font: 400 20px/1.1 var(--f-serif, Georgia, serif); color: var(--ink); }
	.trv-kpi.hi b { color: #6ee7b7; }
	.trv-kpi span { font-size: 11px; color: var(--ink-2); }

	.trv-slots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
	.trv-slot {
		display: grid;
		gap: 3px;
		padding: 10px 11px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.02);
		color: var(--ink);
		text-align: left;
		cursor: pointer;
	}
	.trv-slot.on {
		border-color: var(--g2);
		background: rgba(242, 90, 144, 0.1);
		box-shadow: inset 0 -3px 0 var(--g2);
	}
	.trv-st { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
	.trv-st b { font-size: 13px; font-weight: 700; }
	.trv-st em { font-style: normal; font-family: var(--mono); font-size: 9.5px; font-weight: 700; text-transform: uppercase; padding: 2px 6px; border-radius: 999px; }
	.trv-st em.ok { background: rgba(52, 211, 153, 0.16); color: #6ee7b7; }
	.trv-st em.mid { background: rgba(251, 191, 36, 0.16); color: #fcd34d; }
	.trv-st em.bad { background: rgba(251, 113, 133, 0.18); color: #fda4af; }
	.trv-slot small { font-size: 11px; color: var(--ink-2); }

	.trv-ai {
		display: grid;
		gap: 5px;
		padding: 12px 13px;
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
		height: 40px;
		padding: 0 14px;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		color: var(--bg);
		font: 700 13.5px/1 var(--f-sans, inherit);
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--g2);
		cursor: pointer;
	}
	.trv-neo.full { width: 100%; }
	.trv-neo:disabled { opacity: 0.55; cursor: not-allowed; }
	.trv-neo :global(.ic) { width: 14px; height: 14px; }

	.trv-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 40px;
		padding: 0 13px;
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
