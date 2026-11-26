import type { Collab } from './types';

export type TravelMode = 'car' | 'bike' | 'cab' | 'public';
export type TravelSlotId = 'morning' | 'midday' | 'golden' | 'evening';

export type PlaceCandidate = {
	lat: number;
	lng: number;
	name: string;
	sub: string;
	label: string;
};

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
	return Math.max(0.2, +(2 * R * Math.asin(Math.sqrt(s))).toFixed(1));
}

export function googleMapsSearchUrl(query: string): string {
	const q = query.trim();
	return q
		? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
		: 'https://www.google.com/maps';
}

/** Extract a Google Maps URL even from multi-line share text ("Koteishwaram\nhttps://maps.app.goo.gl/..."). */
export function extractMapsUrl(raw: string): string | null {
	const m = raw.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.|maps\.)?google\.[a-z.]+\/maps)[^\s"'<>]*/i);
	return m ? m[0] : null;
}

/** Resolve any pasted Google Maps link (including short maps.app.goo.gl share links) to exact pin coordinates + place name. */
/** Turn any raw Maps URL or noisy string into a short readable venue label (never an overflowing URL). */
export function cleanPlaceLabel(raw: string): string {
	const s = (raw || '').trim();
	if (!s) return '';
	if (!/^https?:\/\//i.test(s)) return s;
	const pm = s.match(/\/place\/([^/@?]+)/i);
	if (pm) {
		try {
			const d = decodeURIComponent(pm[1].replace(/\+/g, ' ')).trim();
			if (d) return d;
		} catch { /* ignore */ }
	}
	const dm = s.match(/\/dir\/[^/]+\/([^/@?]+)/i);
	if (dm) {
		try {
			const d = decodeURIComponent(dm[1].replace(/\+/g, ' ')).trim();
			if (d && !/^-?\d+\.\d+,-?\d+\.\d+$/.test(d)) return d;
		} catch { /* ignore */ }
	}
	return 'Pinned Google Maps location';
}

export async function resolveMapsLink(
	raw: string
): Promise<{ lat: number; lng: number; label: string } | null> {
	const clean = raw.trim();
	if (!clean) return null;

	const isRawCoord = (v: string) => /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(v.trim());
	const extractName = (text: string) => {
		const pm = text.match(/\/place\/([^/@?]+)/i);
		if (pm) {
			try { return decodeURIComponent(pm[1].replace(/\+/g, ' ')).trim(); }
			catch { return pm[1].replace(/\+/g, ' ').trim(); }
		}
		const dm = text.match(/\/dir\/[^/]+\/([^/@?]+)/i);
		if (dm) {
			try {
				const d = decodeURIComponent(dm[1].replace(/\+/g, ' ')).trim();
				if (d && !isRawCoord(d)) return d;
			} catch { /* ignore */ }
		}
		try {
			const uObj = new URL(text);
			const qParam = uObj.searchParams.get('q') || uObj.searchParams.get('query') || '';
			if (qParam && !isRawCoord(qParam)) return qParam.trim();
		} catch { /* ignore */ }
		const firstLine = text.split('\n')[0]?.trim() || '';
		if (firstLine && !/^https?:\/\//i.test(firstLine) && !isRawCoord(firstLine)) return firstLine;
		return '';
	};

	const parseDirect = async (str: string): Promise<{ lat: number; lng: number; label: string } | null> => {
		const norm = str.replace(/%2C/gi, ',').replace(/%21/gi, '!');
		const pins = [...norm.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
		const pin = pins.length ? pins[pins.length - 1] : null;
		const at = norm.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
		const q = norm.match(/[?&](?:q|ll|destination|sll|cp)=(-?\d+\.\d+),(-?\d+\.\d+)/i);
		const directPair = isRawCoord(norm) ? norm.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/) : null;
		if (pin || at || q || directPair) {
			const m = (pin || at || q || directPair)!;
			const lat = +Number(m[1]).toFixed(6);
			const lng = +Number(m[2]).toFixed(6);
			let label = extractName(norm);
			if (!label || isRawCoord(label)) label = await reverseGeocode(lat, lng);
			return { lat, lng, label };
		}
		return null;
	};

	const directHit = await parseDirect(clean);
	if (directHit) return directHit;

	const url = extractMapsUrl(clean);
	if (!url) return null;

	// Layer 1: Miracle's Cloudflare Worker (/api/maps/resolve)
	try {
		const res = await fetch('/api/maps/resolve', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url })
		});
		if (res.ok) {
			const data = (await res.json()) as { lat?: number; lng?: number; label?: string };
			if (typeof data.lat === 'number' && typeof data.lng === 'number') {
				let label = cleanPlaceLabel(data.label || '');
				if (!label || label === 'Pinned Google Maps location' || isRawCoord(label)) {
					const userTitle = extractName(clean);
					label = userTitle || (await reverseGeocode(data.lat, data.lng));
				}
				return { lat: data.lat, lng: data.lng, label };
			}
		}
	} catch {
		// fall through to Layer 2
	}

	// Layer 2: Public unshortener (unshorten.me + allorigins fallback) from non-Cloudflare IPs
	try {
		const uRes = await fetch(`https://unshorten.me/json/${encodeURIComponent(url)}`);
		if (uRes.ok) {
			const uData = (await uRes.json()) as { resolved_url?: string; success?: boolean };
			if (uData.resolved_url) {
				const hit = await parseDirect(uData.resolved_url);
				if (hit) return hit;
				const name = extractName(uData.resolved_url);
				if (name) {
					const found = await searchPlaces(name);
					if (found.length) return { lat: found[0].lat, lng: found[0].lng, label: found[0].label };
				}
			}
		}
	} catch {
		// try allorigins
	}

	try {
		const aoRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
		if (aoRes.ok) {
			const aoData = (await aoRes.json()) as { contents?: string; status?: { url?: string } };
			const finalU = aoData.status?.url || '';
			if (finalU) {
				const hit = await parseDirect(finalU);
				if (hit) return hit;
			}
			if (aoData.contents) {
				const hit = await parseDirect(aoData.contents);
				if (hit) return hit;
			}
		}
	} catch {
		// ignore
	}

	// Layer 3: If the user pasted a multi-line share ("Cafe Name\nhttps://maps.app.goo.gl/..."), search by that name!
	const titleLine = extractName(clean);
	if (titleLine) {
		const found = await searchPlaces(titleLine);
		if (found.length) return { lat: found[0].lat, lng: found[0].lng, label: found[0].label };
	}

	return null;
}

function normalizeQuery(raw: string): string {
	return raw
		.replace(/\s*,\s*/g, ', ')
		.replace(/\b([A-Za-z])\.([A-Za-z])\.?(?=\s|,|$)/g, '$1$2')
		.replace(/\b([A-Za-z])\.([A-Za-z])\.([A-Za-z])\.?(?=\s|,|$)/g, '$1$2$3')
		.replace(/\s+/g, ' ')
		.trim();
}

function buildGeocodeCandidates(raw: string, cityHint = ''): string[] {
	const norm = normalizeQuery(raw);
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

	const parts = norm.split(',').map((p) => p.trim()).filter(Boolean);
	for (let i = 1; i < parts.length; i++) {
		push(withCity(parts.slice(i).join(', ')));
	}

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
	return out.slice(0, 5);
}

async function queryPhotonMany(q: string, bias?: { lat: number; lng: number } | null): Promise<PlaceCandidate[]> {
	try {
		const biasParam = bias ? `&lat=${bias.lat}&lon=${bias.lng}` : '';
		const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5${biasParam}`, {
			headers: { Accept: 'application/json' }
		});
		if (!res.ok) return [];
		const data = (await res.json()) as {
			features?: Array<{
				geometry?: { coordinates?: [number, number] };
				properties?: { name?: string; street?: string; district?: string; locality?: string; city?: string; state?: string; country?: string };
			}>;
		};
		const out: PlaceCandidate[] = [];
		for (const f of data.features ?? []) {
			const coords = f.geometry?.coordinates;
			if (!coords || coords.length < 2) continue;
			const p = f.properties ?? {};
			const name = p.name || p.locality || p.district || p.street || q;
			const subParts = [p.locality || p.district, p.city, p.state].filter(
				(v, i, a): v is string => !!v && v.toLowerCase() !== name.toLowerCase() && a.indexOf(v) === i
			);
			const sub = subParts.slice(0, 3).join(', ');
			out.push({
				lat: +Number(coords[1]).toFixed(6),
				lng: +Number(coords[0]).toFixed(6),
				name,
				sub,
				label: sub ? `${name}, ${sub}` : name
			});
		}
		return out;
	} catch {
		return [];
	}
}

async function queryNominatimMany(q: string): Promise<PlaceCandidate[]> {
	try {
		const res = await fetch(
			`https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&q=${encodeURIComponent(q)}`,
			{ headers: { Accept: 'application/json' } }
		);
		if (!res.ok) return [];
		const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string; name?: string }>;
		return (rows ?? []).map((r) => {
			const parts = r.display_name.split(',').map((s) => s.trim()).filter(Boolean);
			const name = r.name || parts[0] || q;
			const sub = parts.slice(1, 4).join(', ');
			return {
				lat: +Number(r.lat).toFixed(6),
				lng: +Number(r.lon).toFixed(6),
				name,
				sub,
				label: parts.slice(0, 3).join(', ')
			};
		});
	} catch {
		return [];
	}
}

/** Search up to 5 matching places biased near the creator's Home Base so they pick the exact right venue. */
async function queryWorkerMapsSearch(
	query: string,
	city = '',
	bias?: { lat: number; lng: number } | null
): Promise<PlaceCandidate[]> {
	try {
		const res = await fetch('/api/maps/search', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ query, city, lat: bias?.lat, lng: bias?.lng })
		});
		if (!res.ok) return [];
		const data = (await res.json()) as { places?: PlaceCandidate[] };
		return Array.isArray(data.places) ? data.places : [];
	} catch {
		return [];
	}
}

export async function searchPlaces(
	query: string,
	opts?: { cityHint?: string; bias?: { lat: number; lng: number } | null }
): Promise<PlaceCandidate[]> {
	const clean = query.trim();
	if (!clean) return [];

	// If it's a Google Maps link, resolve it directly as a single verified candidate
	const resolved = await resolveMapsLink(clean);
	if (resolved) {
		return [{ lat: resolved.lat, lng: resolved.lng, name: resolved.label, sub: 'Google Maps pin', label: resolved.label }];
	}

	const candidates = buildGeocodeCandidates(clean, opts?.cityHint ?? '');
	const seen: PlaceCandidate[] = [];
	const addUnique = (items: PlaceCandidate[]) => {
		for (const item of items) {
			const dup = seen.some((s) => haversineKm(s, item) < 0.35 && s.name.toLowerCase() === item.name.toLowerCase());
			if (!dup) seen.push(item);
		}
	};

	// Query Miracle's server-side Google Maps search in parallel with Photon/Nominatim
	const [gHits, pFirst, nFirst] = await Promise.all([
		queryWorkerMapsSearch(clean, opts?.cityHint ?? '', opts?.bias),
		queryPhotonMany(candidates[0] ?? clean, opts?.bias),
		queryNominatimMany(candidates[0] ?? clean)
	]);
	addUnique(gHits);
	addUnique(pFirst);
	addUnique(nFirst);

	for (const cand of candidates.slice(1, 3)) {
		if (seen.length >= 5) break;
		const [p, n] = await Promise.all([queryPhotonMany(cand, opts?.bias), queryNominatimMany(cand)]);
		addUnique(p);
		addUnique(n);
	}

	if (opts?.bias) {
		seen.sort((a, b) => haversineKm(opts.bias!, a) - haversineKm(opts.bias!, b));
	}
	return seen.slice(0, 5);
}

/** Single-hit geocoder (used for quick fallbacks). */
export async function geocodePlace(
	query: string,
	cityHint = ''
): Promise<{ lat: number; lng: number; label: string } | null> {
	const list = await searchPlaces(query, { cityHint });
	return list[0] ? { lat: list[0].lat, lng: list[0].lng, label: list[0].label } : null;
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

/** Free OSRM road routing (with haversine 1.28x city-road fallback). */
export async function routeDistance(
	origin: { lat: number; lng: number },
	dest: { lat: number; lng: number }
): Promise<{ km: number; mins: number; source: 'osrm' | 'est' }> {
	try {
		const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`;
		const res = await fetch(url);
		if (res.ok) {
			const data = (await res.json()) as { routes?: Array<{ distance: number; duration: number }> };
			const r = data.routes?.[0];
			if (r && r.distance > 0) {
				return {
					km: Math.max(0.5, +(r.distance / 1000).toFixed(1)),
					mins: Math.max(5, Math.round(r.duration / 60)),
					source: 'osrm'
				};
			}
		}
	} catch {
		// fall through to city road factor
	}
	const straight = haversineKm(origin, dest);
	const roadKm = +(straight * 1.28).toFixed(1);
	return { km: roadKm, mins: Math.max(8, Math.round((roadKm / 20) * 60)), source: 'est' };
}

export function estimateTrip(
	distKm: number,
	baseMins: number | null | undefined,
	mode: TravelMode,
	slotId: TravelSlotId,
	bufferMins = 15
) {
	const m = TRAVEL_MODES[mode] ?? TRAVEL_MODES.cab;
	const slot = TRAVEL_SLOTS.find((s) => s.id === slotId) ?? TRAVEL_SLOTS[1];
	const offPeakMin = baseMins && baseMins > 0 ? baseMins : Math.max(8, Math.round((distKm / m.speedKmh) * 60));
	const estMin = Math.max(8, Math.round(offPeakMin * slot.mult));
	const peakMin = Math.max(estMin, Math.round(offPeakMin * 1.65));
	const oneWayCost = Math.round(m.base + distKm * m.ratePerKm);
	const roundTripCost = oneWayCost * 2;
	const savedVsPeak = Math.max(0, peakMin - estMin);

	const advice =
		slot.id === 'midday'
			? `Leave around ${slot.leaveAt} (plus ${bufferMins}m buffer). You save ~${savedVsPeak} min vs peak traffic and get natural daylight before lunch rush.`
			: slot.id === 'golden'
				? `Leave around ${slot.leaveAt} (plus ${bufferMins}m buffer) to arrive before 4:15 PM golden light and stay ahead of the 5:30 PM jam.`
				: slot.id === 'morning'
					? `Leave by ${slot.leaveAt} (plus ${bufferMins}m buffer) — office rush adds ~${estMin - offPeakMin} min. Shift to 11:30 AM if flexible.`
					: `Evening peak adds ~${estMin - offPeakMin} min. Leave by ${slot.leaveAt} (plus ${bufferMins}m buffer) or batch with a nearby shoot.`;

	return { distKm, estMin, baseMin: offPeakMin, peakMin, oneWayCost, roundTripCost, savedVsPeak, slot, mode: m, advice };
}

export function mapsDirectionsUrl(
	origin: string | { lat: number; lng: number },
	dest: string | { lat: number; lng: number }
): string {
	const fmtPoint = (p: string | { lat: number; lng: number }) =>
		typeof p === 'string' ? p : `${p.lat},${p.lng}`;
	const o = encodeURIComponent(fmtPoint(origin));
	const d = encodeURIComponent(fmtPoint(dest));
	return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`;
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
