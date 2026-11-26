import type { Collab } from './types';

export type TravelMode = 'car' | 'bike' | 'cab' | 'public';
export type TravelSlotId = 'morning' | 'midday' | 'golden' | 'evening';

export type TravelSlot = {
	id: TravelSlotId;
	short: string;
	label: string;
	traffic: 'ok' | 'mid' | 'bad';
	tLabel: string;
	mult: number;
	leaveAt: string;
	light: string;
};

export const TRAVEL_MODES: Record<TravelMode, { label: string; ratePerKm: number; base: number; speedKmh: number }> = {
	car: { label: 'Own car', ratePerKm: 12, base: 20, speedKmh: 22 },
	bike: { label: 'Scooter', ratePerKm: 4, base: 0, speedKmh: 26 },
	cab: { label: 'Cab', ratePerKm: 22, base: 60, speedKmh: 22 },
	public: { label: 'Metro / bus', ratePerKm: 3, base: 20, speedKmh: 18 }
};

export const TRAVEL_SLOTS: TravelSlot[] = [
	{ id: 'morning', short: '9:00 AM', label: '9:00 – 11:00 AM', traffic: 'bad', tLabel: 'Heavy', mult: 1.55, leaveAt: '8:15 AM', light: 'Peak office rush; softer indoor light.' },
	{ id: 'midday', short: '11:30 AM', label: '11:30 – 2:30 PM', traffic: 'ok', tLabel: 'Smooth', mult: 1.0, leaveAt: '11:00 AM', light: 'Fastest roads + bright natural window light before lunch rush.' },
	{ id: 'golden', short: '4:00 PM', label: '4:00 – 5:45 PM', traffic: 'mid', tLabel: 'Moderate', mult: 1.25, leaveAt: '3:15 PM', light: 'Warm golden-hour aesthetic; beat the 5:30 PM jam.' },
	{ id: 'evening', short: '6:30 PM', label: '6:30 – 9:00 PM', traffic: 'bad', tLabel: 'Peak', mult: 1.7, leaveAt: '5:30 PM', light: 'Evening ambience; longest traffic window.' }
];

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
	const R = 6371;
	const dLat = ((b.lat - a.lat) * Math.PI) / 180;
	const dLng = ((b.lng - a.lng) * Math.PI) / 180;
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
	return Math.max(0.5, +(2 * R * Math.asin(Math.sqrt(s))).toFixed(1));
}

/** Normalize Indian/local address strings so OSM geocoders resolve them reliably. */
function buildGeocodeCandidates(raw: string, cityHint = ''): string[] {
	// Collapse spacing around commas and remove dots in short abbreviations like J.P., B.T.M., H.S.R.
	const norm = raw
		.replace(/\s*,\s*/g, ', ')
		.replace(/\b([A-Za-z])\.([A-Za-z])\.?(?=\s|,|$)/g, '$1$2')
		.replace(/\b([A-Za-z])\.([A-Za-z])\.([A-Za-z])\.?(?=\s|,|$)/g, '$1$2$3')
		.replace(/\s+/g, ' ')
		.trim();
	const city = cityHint.trim();
	const withCity = (q: string) =>
		city && !q.toLowerCase().includes(city.toLowerCase()) ? `${q}, ${city}` : q;

	const out: string[] = [];
	const push = (q: string) => {
		const v = q.replace(/^,\s*|,\s*$/g, '').trim();
		if (v && !out.includes(v)) out.push(v);
	};

	push(withCity(norm));
	if (city) push(norm);

	// Progressive comma fallback: "Bank Of Baroda Colony, JP Nagar 7th Phase" -> "JP Nagar 7th Phase, Bengaluru"
	const parts = norm.split(',').map((p) => p.trim()).filter(Boolean);
	for (let i = 1; i < parts.length; i++) {
		push(withCity(parts.slice(i).join(', ')));
	}

	// Neighbourhood fallback: strip phase/stage/sector/block/cross/main/layout numbers
	const simplified = norm
		.replace(/\b\d+(?:st|nd|rd|th)?\s+(?:phase|stage|block|sector|cross|main|floor)\b/gi, '')
		.replace(/\b(?:phase|stage|block|sector)\s+\d+\b/gi, '')
		.replace(/\s*,\s*/g, ', ')
		.replace(/\s+/g, ' ')
		.trim();
	if (simplified && simplified !== norm) {
		const sparts = simplified.split(',').map((p) => p.trim()).filter(Boolean);
		push(withCity(simplified));
		if (sparts.length > 1) push(withCity(sparts.slice(1).join(', ')));
	}
	return out.slice(0, 6);
}

async function queryPhoton(q: string): Promise<{ lat: number; lng: number; label: string } | null> {
	try {
		const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=3`, {
			headers: { Accept: 'application/json' }
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			features?: Array<{
				geometry?: { coordinates?: [number, number] };
				properties?: { name?: string; district?: string; locality?: string; city?: string; state?: string };
			}>;
		};
		const f = data.features?.[0];
		const coords = f?.geometry?.coordinates;
		if (!coords || coords.length < 2) return null;
		const p = f.properties ?? {};
		const labelParts = [p.name, p.locality || p.district, p.city || p.state].filter(
			(v, i, a): v is string => !!v && a.indexOf(v) === i
		);
		return {
			lat: Number(coords[1]),
			lng: Number(coords[0]),
			label: labelParts.slice(0, 3).join(', ') || q
		};
	} catch {
		return null;
	}
}

async function queryNominatim(q: string): Promise<{ lat: number; lng: number; label: string } | null> {
	try {
		const res = await fetch(
			`https://nominatim.openstreetmap.org/search?format=json&limit=3&addressdetails=1&q=${encodeURIComponent(q)}`,
			{ headers: { Accept: 'application/json' } }
		);
		if (!res.ok) return null;
		const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
		if (!rows?.length) return null;
		const best = rows[0];
		const label = best.display_name.split(',').slice(0, 3).join(',').trim();
		return { lat: Number(best.lat), lng: Number(best.lon), label };
	} catch {
		return null;
	}
}

/** Extract coordinates from a pasted Google Maps link or geocode via Photon + OpenStreetMap Nominatim with smart fallbacks. */
export async function geocodePlace(
	query: string,
	cityHint = ''
): Promise<{ lat: number; lng: number; label: string } | null> {
	const clean = query.trim();
	if (!clean) return null;

	// 1. Direct coordinates inside Google Maps URL (@lat,lng or q=lat,lng)
	const m =
		clean.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
		clean.match(/[?&](?:q|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/);
	if (m) {
		return { lat: Number(m[1]), lng: Number(m[2]), label: clean.startsWith('http') ? 'Pinned Maps location' : clean };
	}

	// 2. If a Maps URL has a place name (/place/Name+Here/), extract it for geocoding
	let searchText = clean;
	const pm = clean.match(/\/place\/([^/@?]+)/i);
	if (pm) searchText = decodeURIComponent(pm[1].replace(/\+/g, ' '));

	const candidates = buildGeocodeCandidates(searchText, cityHint);
	for (const cand of candidates) {
		const hit = (await queryPhoton(cand)) ?? (await queryNominatim(cand));
		if (hit) return hit;
	}
	return null;
}

/** Reverse-geocode GPS coordinates into a short readable neighbourhood + city label. */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
	try {
		const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`, {
			headers: { Accept: 'application/json' }
		});
		if (res.ok) {
			const data = (await res.json()) as {
				features?: Array<{ properties?: { name?: string; locality?: string; district?: string; city?: string } }>;
			};
			const p = data.features?.[0]?.properties;
			if (p) {
				const parts = [p.locality || p.district || p.name, p.city].filter(
					(v, i, a): v is string => !!v && a.indexOf(v) === i
				);
				if (parts.length) return parts.join(', ');
			}
		}
	} catch {
		// fall through to Nominatim
	}
	try {
		const res = await fetch(
			`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`,
			{ headers: { Accept: 'application/json' } }
		);
		if (res.ok) {
			const data = (await res.json()) as { display_name?: string };
			if (data.display_name) return data.display_name.split(',').slice(0, 2).join(',').trim();
		}
	} catch {
		// ignore
	}
	return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export async function routeDistance(
	from: { lat: number; lng: number },
	to: { lat: number; lng: number }
): Promise<{ km: number; mins: number }> {
	try {
		const res = await fetch(
			`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`
		);
		if (res.ok) {
			const j = (await res.json()) as { routes?: { distance?: number; duration?: number }[] };
			const route = j.routes?.[0];
			if (route?.distance && route?.duration) {
				return {
					km: Math.max(0.5, +(route.distance / 1000).toFixed(1)),
					mins: Math.max(8, Math.round(route.duration / 60))
				};
			}
		}
	} catch {
		/* fall back to Haversine road factor */
	}
	const km = Math.max(0.8, +(haversineKm(from, to) * 1.32).toFixed(1));
	const mins = Math.max(10, Math.round((km / 22) * 60));
	return { km, mins };
}

export function estimateTrip(
	distKm: number,
	offPeakMins: number | null | undefined,
	modeKey: TravelMode = 'cab',
	slotId: TravelSlotId = 'midday',
	bufferMins = 15
) {
	const mode = TRAVEL_MODES[modeKey] ?? TRAVEL_MODES.cab;
	const slot = TRAVEL_SLOTS.find((s) => s.id === slotId) ?? TRAVEL_SLOTS[1];
	const baseMin = offPeakMins && offPeakMins > 0 ? offPeakMins : Math.max(10, Math.round((distKm / mode.speedKmh) * 60));
	const estMin = Math.round(baseMin * slot.mult);
	const peakMin = Math.round(baseMin * 1.65);
	const roundTripCost = Math.round(((mode.base + distKm * mode.ratePerKm) * 2) / 10) * 10;

	const advice =
		slot.id === 'midday'
			? `Leave around ${slot.leaveAt} (plus ${bufferMins}m buffer). You save ~${Math.max(10, peakMin - estMin)} min vs peak traffic and get natural daylight before lunch rush.`
			: slot.id === 'golden'
				? `Leave by ${slot.leaveAt} to catch golden-hour light and finish before the evening jam builds up.`
				: slot.id === 'morning'
					? `Morning traffic adds ~${Math.max(8, estMin - baseMin)} min. Shift to 11:30 AM if the brand is flexible.`
					: `Peak evening traffic (~${estMin} min each way). Keep +${bufferMins}m buffer or batch with a nearby shoot.`;

	return { distKm, baseMin, estMin, peakMin, roundTripCost, slot, mode, advice };
}

export function mapsDirectionsUrl(origin: string, destination: string): string {
	return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`;
}

export type NearbyPair = {
	a: Collab;
	b: Collab;
	gapKm: number;
	savedCost: number;
	savedMins: number;
};

/** Find pairs of active on-location collabs within `maxKm` of each other that aren't already batched on the same shoot day. */
export function findNearbyPairs(collabs: Collab[], modeKey: TravelMode = 'cab', maxKm = 5.5): NearbyPair[] {
	const loc = collabs.filter(
		(c) =>
			c.shoot_mode === 'location' &&
			typeof c.venue_lat === 'number' &&
			typeof c.venue_lng === 'number' &&
			['confirmed', 'creating'].includes(c.stage)
	);
	const pairs: NearbyPair[] = [];
	const used = new Set<string>();
	for (let i = 0; i < loc.length; i++) {
		if (used.has(loc[i].id)) continue;
		for (let j = i + 1; j < loc.length; j++) {
			if (used.has(loc[j].id)) continue;
			const a = loc[i], b = loc[j];
			if (a.shoot_date && b.shoot_date && a.shoot_date === b.shoot_date) continue;
			const gapKm = +(haversineKm({ lat: a.venue_lat!, lng: a.venue_lng! }, { lat: b.venue_lat!, lng: b.venue_lng! }) * 1.25).toFixed(1);
			if (gapKm <= maxKm) {
				const baseKm = a.travel_km ?? b.travel_km ?? 10;
				const trip = estimateTrip(baseKm, a.travel_mins ?? b.travel_mins, modeKey, 'midday');
				pairs.push({ a, b, gapKm, savedCost: trip.roundTripCost, savedMins: trip.estMin * 2 });
				used.add(a.id);
				used.add(b.id);
				break;
			}
		}
	}
	return pairs;
}
