<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { portal } from '../portal';
	import { toast } from '../ui.svelte';
	import {
		googleMapsSearchUrl,
		reverseGeocode,
		searchPlaces,
		type PlaceCandidate
	} from '../travel';
	import Icon from './Icon.svelte';

	let {
		title = 'Pin location on map',
		initialLat = 12.9716,
		initialLng = 77.5946,
		initialLabel = '',
		cityHint = '',
		onpick,
		onclose
	}: {
		title?: string;
		initialLat?: number;
		initialLng?: number;
		initialLabel?: string;
		cityHint?: string;
		onpick: (place: { lat: number; lng: number; label: string }) => void;
		onclose: () => void;
	} = $props();

	let mapEl = $state<HTMLDivElement>();
	let query = $state('');
	let searching = $state(false);
	let results = $state<PlaceCandidate[]>([]);
	let loadingMap = $state(true);
	let mapError = $state(false);
	let gpsBusy = $state(false);

	let pickedLat = $state(12.9716);
	let pickedLng = $state(77.5946);
	let pickedLabel = $state('');
	let resolvingLabel = $state(false);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let map: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let marker: any = null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let LRef: any = null;

	function loadLeaflet(): Promise<unknown> {
		const w = window as unknown as Record<string, unknown>;
		if (w.L) return Promise.resolve(w.L);
		return new Promise((resolve, reject) => {
			if (!document.getElementById('leaflet-css')) {
				const link = document.createElement('link');
				link.id = 'leaflet-css';
				link.rel = 'stylesheet';
				link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
				document.head.appendChild(link);
			}
			const existing = document.getElementById('leaflet-js') as HTMLScriptElement | null;
			if (existing) {
				existing.addEventListener('load', () => resolve((window as unknown as Record<string, unknown>).L));
				existing.addEventListener('error', reject);
				return;
			}
			const script = document.createElement('script');
			script.id = 'leaflet-js';
			script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
			script.async = true;
			script.onload = () => resolve((window as unknown as Record<string, unknown>).L);
			script.onerror = reject;
			document.head.appendChild(script);
		});
	}

	async function setPin(lat: number, lng: number, knownLabel?: string) {
		pickedLat = +lat.toFixed(6);
		pickedLng = +lng.toFixed(6);
		if (marker && LRef) {
			marker.setLatLng([pickedLat, pickedLng]);
		} else if (map && LRef) {
			const icon = LRef.divIcon({
				className: 'mp-pin-wrap',
				html: '<div class="mp-pin"><div class="mp-pin-core"></div></div>',
				iconSize: [28, 28],
				iconAnchor: [14, 14]
			});
			marker = LRef.marker([pickedLat, pickedLng], { icon, draggable: true }).addTo(map);
			marker.on('dragend', () => {
				const pos = marker.getLatLng();
				void setPin(pos.lat, pos.lng);
			});
		}
		if (knownLabel) {
			pickedLabel = knownLabel;
			return;
		}
		resolvingLabel = true;
		try {
			pickedLabel = await reverseGeocode(pickedLat, pickedLng);
		} finally {
			resolvingLabel = false;
		}
	}

	onMount(async () => {
		pickedLat = initialLat;
		pickedLng = initialLng;
		pickedLabel = initialLabel || '';
		try {
			LRef = await loadLeaflet();
			if (!mapEl || !LRef) throw new Error('Map unavailable');
			map = LRef.map(mapEl, {
				center: [pickedLat, pickedLng],
				zoom: initialLabel ? 15 : 13,
				zoomControl: false,
				attributionControl: false
			});
			LRef.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
				maxZoom: 19,
				subdomains: 'abcd'
			}).addTo(map);
			LRef.control.zoom({ position: 'bottomright' }).addTo(map);

			await setPin(pickedLat, pickedLng, initialLabel || undefined);

			map.on('click', (ev: { latlng: { lat: number; lng: number } }) => {
				results = [];
				void setPin(ev.latlng.lat, ev.latlng.lng);
			});
		} catch {
			mapError = true;
		} finally {
			loadingMap = false;
		}
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
	});

	async function runSearch(e?: Event) {
		e?.preventDefault();
		const q = query.trim();
		if (!q) return;
		searching = true;
		try {
			results = await searchPlaces(q, {
				cityHint,
				bias: { lat: pickedLat, lng: pickedLng }
			});
			if (!results.length) {
				toast('No exact match found. Tap directly on the map or use Google Maps.', 'alert');
			} else if (results.length === 1) {
				pickSearchHit(results[0]);
			}
		} finally {
			searching = false;
		}
	}

	function pickSearchHit(p: PlaceCandidate) {
		results = [];
		if (map) map.setView([p.lat, p.lng], 16, { animate: true });
		void setPin(p.lat, p.lng, p.label);
	}

	function centerOnGps() {
		if (typeof navigator === 'undefined' || !navigator.geolocation) {
			return toast('GPS is not available on this device', 'alert');
		}
		gpsBusy = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				gpsBusy = false;
				const lat = pos.coords.latitude;
				const lng = pos.coords.longitude;
				if (map) map.setView([lat, lng], 16, { animate: true });
				void setPin(lat, lng);
			},
			() => {
				gpsBusy = false;
				toast('Allow location permission in app settings, or tap on the map.', 'alert');
			},
			{ enableHighAccuracy: true, timeout: 10000 }
		);
	}

	function confirmPin() {
		onpick({
			lat: pickedLat,
			lng: pickedLng,
			label: pickedLabel || `${pickedLat.toFixed(4)}, ${pickedLng.toFixed(4)}`
		});
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="mp-backdrop" use:portal role="dialog" aria-modal="true" aria-label={title}>
	<div class="mp-sheet">
		<header class="mp-head">
			<div>
				<h2>{title}</h2>
				<small>Tap anywhere on the map or drag the pin</small>
			</div>
			<button type="button" class="mp-x" aria-label="Close map" onclick={onclose}>×</button>
		</header>

		<form class="mp-search" onsubmit={runSearch}>
			<input
				type="text"
				placeholder="Search cafe, area, landmark…"
				aria-label="Search on map"
				bind:value={query}
			/>
			<button type="submit" disabled={searching || !query.trim()}>
				{#if searching}<span class="spinner"></span>{:else}<Icon name="search" />{/if}
			</button>
		</form>

		{#if results.length}
			<div class="mp-res">
				{#each results as p (p.lat + ',' + p.lng + p.name)}
					<button type="button" class="mp-res-item" onclick={() => pickSearchHit(p)}>
						<b>{p.name}</b>
						{#if p.sub}<small>{p.sub}</small>{/if}
					</button>
				{/each}
			</div>
		{/if}

		<div class="mp-map-wrap">
			<div class="mp-map" bind:this={mapEl}></div>
			{#if loadingMap}
				<div class="mp-state"><span class="spinner"></span> Loading map…</div>
			{:else if mapError}
				<div class="mp-state">Map tiles couldn't load offline. Use search or paste a Google Maps link.</div>
			{/if}
			<button type="button" class="mp-gps" aria-label="Center on my GPS" disabled={gpsBusy} onclick={centerOnGps}>
				{#if gpsBusy}<span class="spinner"></span>{:else}<Icon name="pin" />{/if}
				<span>My GPS</span>
			</button>
		</div>

		<footer class="mp-foot">
			<div class="mp-info">
				<span class="mp-eb">Selected pin</span>
				<b>{resolvingLabel ? 'Finding place name…' : pickedLabel || 'Tap map to drop pin'}</b>
				<small>{pickedLat.toFixed(5)}, {pickedLng.toFixed(5)}</small>
			</div>
			<div class="mp-btns">
				<a class="mp-gmap" href={googleMapsSearchUrl(query.trim() || pickedLabel || cityHint || 'Bengaluru')} target="_blank" rel="noopener">
					Google Maps
				</a>
				<button type="button" class="mp-confirm" onclick={confirmPin}>
					Confirm this pin
				</button>
			</div>
		</footer>
	</div>
</div>

<style>
	.mp-backdrop {
		position: fixed;
		inset: 0;
		z-index: 950;
		background: rgba(8, 6, 10, 0.82);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	@media (min-width: 720px) {
		.mp-backdrop { align-items: center; padding: 20px; }
	}
	.mp-sheet {
		width: 100%;
		max-width: 560px;
		height: min(88dvh, 720px);
		background: #141016;
		border: 1px solid rgba(156, 123, 255, 0.25);
		border-radius: 20px 20px 0 0;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto;
		overflow: hidden;
		position: relative;
	}
	@media (min-width: 720px) {
		.mp-sheet { border-radius: 20px; }
	}
	.mp-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 16px 10px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.mp-head h2 {
		margin: 0;
		font: 400 22px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink, #f7f4f8);
	}
	.mp-head small {
		display: block;
		margin-top: 2px;
		font-size: 12px;
		color: var(--ink-3, #9f95a6);
	}
	.mp-x {
		width: 32px;
		height: 32px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.05);
		color: var(--ink, #f7f4f8);
		font-size: 20px;
		line-height: 1;
		cursor: pointer;
	}
	.mp-search {
		display: flex;
		gap: 8px;
		padding: 10px 14px;
		background: rgba(13, 10, 14, 0.7);
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}
	.mp-search input {
		flex: 1;
		min-width: 0;
		height: 38px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: #0d0a0e;
		color: var(--ink, #f7f4f8);
		font-size: 13.5px;
		outline: none;
	}
	.mp-search input:focus { border-color: var(--g1, #9c7bff); }
	.mp-search button {
		width: 40px;
		height: 38px;
		border: 0;
		border-radius: 10px;
		background: var(--ink, #f7f4f8);
		color: var(--bg, #0d0a0e);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.mp-search button:disabled { opacity: 0.45; }
	.mp-search button :global(svg) { width: 16px; height: 16px; }

	.mp-res {
		position: absolute;
		top: 118px;
		left: 14px;
		right: 14px;
		z-index: 600;
		display: grid;
		gap: 4px;
		padding: 8px;
		border-radius: 12px;
		border: 1px solid rgba(156, 123, 255, 0.35);
		background: #18121b;
		box-shadow: 0 14px 36px rgba(0, 0, 0, 0.65);
		max-height: 220px;
		overflow-y: auto;
	}
	.mp-res-item {
		display: grid;
		gap: 2px;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(255, 255, 255, 0.03);
		color: var(--ink, #f7f4f8);
		text-align: left;
		cursor: pointer;
	}
	.mp-res-item b { font-size: 13px; }
	.mp-res-item small { font-size: 11.5px; color: var(--ink-3, #9f95a6); }

	.mp-map-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 240px;
		background: #1b1620;
	}
	.mp-map {
		width: 100%;
		height: 100%;
	}
	.mp-state {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 20px;
		text-align: center;
		font-size: 13px;
		color: var(--ink-2, #cfc6d6);
		background: rgba(13, 10, 14, 0.75);
		z-index: 450;
	}
	.mp-gps {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 450;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 34px;
		padding: 0 11px;
		border-radius: 999px;
		border: 1px solid rgba(156, 123, 255, 0.45);
		background: rgba(17, 13, 17, 0.92);
		color: #f7f4f8;
		font-size: 12px;
		font-weight: 600;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
		cursor: pointer;
	}
	.mp-gps :global(svg) { width: 13px; height: 13px; color: #c8b6ff; }

	.mp-foot {
		display: grid;
		gap: 10px;
		padding: 12px 16px max(14px, env(safe-area-inset-bottom));
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		background: #120e14;
	}
	.mp-info { display: grid; gap: 2px; min-width: 0; }
	.mp-eb {
		font-family: var(--mono, monospace);
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #6ee7b7;
	}
	.mp-info b {
		font-size: 13.5px;
		color: var(--ink, #f7f4f8);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mp-info small {
		font-family: var(--mono, monospace);
		font-size: 11px;
		color: var(--ink-3, #9f95a6);
	}
	.mp-btns {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.mp-gmap {
		height: 40px;
		padding: 0 12px;
		border-radius: 0;
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: transparent;
		color: var(--ink-2, #cfc6d6);
		font-size: 12.5px;
		font-weight: 600;
		text-decoration: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.mp-confirm {
		flex: 1;
		height: 40px;
		border: 0;
		border-radius: 0;
		background: var(--ink, #f7f4f8);
		color: var(--bg, #0d0a0e);
		font-size: 13.5px;
		font-weight: 700;
		box-shadow: 3px 3px 0 var(--g2, #f25a90);
		cursor: pointer;
	}

	:global(.mp-pin-wrap) { background: transparent; border: 0; }
	:global(.mp-pin) {
		width: 28px;
		height: 28px;
		border-radius: 999px;
		background: rgba(242, 90, 144, 0.28);
		border: 2px solid #f25a90;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 0 16px rgba(242, 90, 144, 0.7);
	}
	:global(.mp-pin-core) {
		width: 10px;
		height: 10px;
		border-radius: 999px;
		background: #fff;
	}
</style>
