// Resolves short Google Maps links (maps.app.goo.gl / goo.gl) from Deno Deploy
// and extracts exact place pin coordinates + readable place name.

const corsH = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'POST, OPTIONS',
	'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
	'content-type': 'application/json'
};

const normalize = (s: string) =>
	s
		.replace(/\\u0026/gi, '&')
		.replace(/\\u003d/gi, '=')
		.replace(/\\u002f/gi, '/')
		.replace(/\\\//g, '/')
		.replace(/&amp;/gi, '&')
		.replace(/%252C/gi, ',')
		.replace(/%2C/gi, ',')
		.replace(/%21/gi, '!');

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
	const R = 6371;
	const dLat = ((b.lat - a.lat) * Math.PI) / 180;
	const dLng = ((b.lng - a.lng) * Math.PI) / 180;
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(s));
}

function extractCoordsFromUrlOnly(rawUrl: string): { lat: number; lng: number } | null {
	const str = normalize(rawUrl);
	const pins = [...str.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
	if (pins.length) {
		const last = pins[pins.length - 1];
		return { lat: Number(last[1]), lng: Number(last[2]) };
	}
	const at = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
	if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
	const q = str.match(/[?&](?:q|ll|destination|sll|cp)=(-?\d+\.\d+),(-?\d+\.\d+)/i);
	if (q) return { lat: Number(q[1]), lng: Number(q[2]) };
	return null;
}

function extractPinFromHtml(rawHtml: string): { lat: number; lng: number; strong: boolean } | null {
	const str = normalize(rawHtml);
	// !3dLAT!4dLNG is the true Google Maps place pin (never the PoP server viewport!)
	const pins = [...str.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
	if (pins.length) {
		const last = pins[pins.length - 1];
		return { lat: Number(last[1]), lng: Number(last[2]), strong: true };
	}
	// Staticmap marker or center inside og:image
	const marker = str.match(/staticmap\?[^"']*markers=[^"']*?(-?\d+\.\d+),(-?\d+\.\d+)/i);
	if (marker) return { lat: Number(marker[1]), lng: Number(marker[2]), strong: true };
	const ctr = str.match(/staticmap\?[^"']*center=(-?\d+\.\d+),(-?\d+\.\d+)/i);
	if (ctr) return { lat: Number(ctr[1]), lng: Number(ctr[2]), strong: false };
	return null;
}

function extractName(u: string): string {
	const pm = u.match(/\/place\/([^/@?]+)/i);
	if (pm) {
		try {
			return decodeURIComponent(pm[1].replace(/\+/g, ' ')).trim();
		} catch {
			return pm[1].replace(/\+/g, ' ').trim();
		}
	}
	const dm = u.match(/\/dir\/[^/]+\/([^/@?]+)/i);
	if (dm) {
		try {
			const d = decodeURIComponent(dm[1].replace(/\+/g, ' ')).trim();
			if (d && !/^-?\d+\.\d+,-?\d+\.\d+$/.test(d)) return d;
		} catch {
			// ignore
		}
	}
	try {
		const obj = new URL(u);
		const q = obj.searchParams.get('q') || obj.searchParams.get('query') || '';
		if (q && !/^-?\d+\.\d+,-?\d+\.\d+$/.test(q.trim())) return q.trim();
	} catch {
		// ignore
	}
	return '';
}

function unwrapConsent(u: string): string {
	try {
		const obj = new URL(u);
		if (obj.hostname.includes('consent.google.') && obj.searchParams.get('continue')) {
			return obj.searchParams.get('continue')!;
		}
	} catch {
		// ignore
	}
	return u;
}

function buildSmartAddressQueries(label: string): string[] {
	const clean = label.replace(/\s+/g, ' ').trim();
	if (!clean) return [];
	const queries: string[] = [];
	const push = (q: string) => {
		const v = q.replace(/^,\s*|,\s*$/g, '').trim();
		if (v.length >= 3 && !queries.includes(v)) queries.push(v);
	};

	const pinMatch = clean.match(/\b([1-9]\d{5})\b/);
	// Strip pincode from parts so "KARNATAKA 560066" becomes "KARNATAKA"
	const parts = clean
		.split(',')
		.map((s) => s.replace(/\b[1-9]\d{5}\b/g, '').replace(/\s+/g, ' ').trim())
		.filter(Boolean);

	// 1. Most specific reliable Indian area+city pairs from the END (e.g. "WHITEFIELD, BENGALURU")
	if (parts.length >= 3) {
		push(`${parts[parts.length - 3]}, ${parts[parts.length - 2]}`);
	}
	if (parts.length >= 4) {
		push(`${parts[parts.length - 4]}, ${parts[parts.length - 3]}, ${parts[parts.length - 2]}`);
	}
	if (parts.length >= 2) {
		push(`${parts[parts.length - 2]}, ${parts[parts.length - 1]}`);
	}
	// 2. Pincode + city / India
	if (pinMatch) {
		const cityPart = parts.length >= 2 ? parts[parts.length - 2] : '';
		if (cityPart) push(`${pinMatch[1]}, ${cityPart}, India`);
		push(`${pinMatch[1]}, India`);
	}
	// 3. Short suffix fallbacks (last 3..1 parts, NEVER starting from index 0 of a 10-part address)
	for (let k = Math.min(4, parts.length); k >= 1; k--) {
		push(parts.slice(-k).join(', '));
	}
	return queries.slice(0, 8);
}

async function geocodeSmartAddress(label: string): Promise<{ lat: number; lng: number } | null> {
	const clean = label.replace(/\s+/g, ' ').trim();
	if (!clean) return null;
	const queries = buildSmartAddressQueries(clean);

	for (const q of queries) {
		try {
			const pRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`);
			if (pRes.ok) {
				const pData = (await pRes.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
				const c = pData.features?.[0]?.geometry?.coordinates;
				if (c && c.length >= 2) return { lat: Number(c[1]), lng: Number(c[0]) };
			}
		} catch {
			// ignore
		}
		try {
			const nRes = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
				{ headers: { 'user-agent': 'MiracleApp/1.0' } }
			);
			if (nRes.ok) {
				const rows = (await nRes.json()) as Array<{ lat: string; lon: string }>;
				if (rows?.[0]) return { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
			}
		} catch {
			// ignore
		}
	}
	return null;
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsH });
	if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Use POST' }), { status: 405, headers: corsH });

	try {
		const body = (await req.json().catch(() => ({}))) as { url?: string };
		const raw = String(body.url ?? '').trim();
		const m = raw.match(/https?:\/\/[^\s"'<>]+/i);
		if (!m) return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: corsH });

		const origUrl = new URL(m[0]).toString();
		let finalUrl = origUrl;
		let coords: { lat: number; lng: number } | null = extractCoordsFromUrlOnly(origUrl);
		let strongCoords = !!coords;
		let label = extractName(origUrl);

		for (const ua of ['WhatsApp/2.23.20.0', 'curl/8.4.0', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36']) {
			if (strongCoords && label) break;
			let hopUrl = origUrl;
			let html = '';
			for (let hop = 0; hop < 6 && (!strongCoords || !label); hop++) {
				const res = await fetch(hopUrl, {
					method: 'GET',
					redirect: 'manual',
					headers: {
						'user-agent': ua,
						'accept-language': 'en-IN,en;q=0.9',
						cookie: 'SOCS=CAISHAgBEhJnd3NfMjAyNDAxMTAtMF9SQzIaAmVuIAEaBgiA_MCxBg'
					}
				});
				const loc = res.headers.get('location');
				if (loc) {
					const abs = unwrapConsent(new URL(loc, hopUrl).toString());
					finalUrl = abs;
					hopUrl = abs;
					const urlCoords = extractCoordsFromUrlOnly(abs);
					if (urlCoords) {
						coords = urlCoords;
						strongCoords = true;
					}
					if (!label) label = extractName(abs);
					continue;
				}
				html = (await res.text()).slice(0, 700_000);
				if (!strongCoords) {
					const htmlHit = extractPinFromHtml(html);
					if (htmlHit) {
						coords = { lat: htmlHit.lat, lng: htmlHit.lng };
						strongCoords = htmlHit.strong;
					}
				}
				const metaRef = html.match(/http-equiv=["']refresh["'][^>]*url=([^"'>\s]+)/i);
				const embUrl = html.match(/https:\/\/(?:www\.|maps\.)?google\.[a-z.]+\/maps[^"'\s<>\\]+/i);
				const next = metaRef?.[1] || embUrl?.[0];
				if (next && hopUrl.includes('goo.gl')) {
					const abs = unwrapConsent(normalize(next));
					if (abs !== hopUrl) {
						finalUrl = abs;
						hopUrl = abs;
						const urlCoords = extractCoordsFromUrlOnly(abs);
						if (urlCoords) {
							coords = urlCoords;
							strongCoords = true;
						}
						if (!label) label = extractName(abs);
						continue;
					}
				}
				break;
			}
			if (html && !label) {
				const og =
					html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
					html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i) ||
					html.match(/<title>([^<]+)<\/title>/i);
				if (og?.[1]) {
					const c = og[1].replace(/\s*[·\-–|]\s*Google Maps\s*$/i, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim();
					if (c && !/^(google maps|before you continue|dynamic link)/i.test(c)) label = c;
				}
			}
		}

		// Sanity check: if we have a rich label (with city/pincode) and weak/PoP coords, verify via address geocoder
		if (label) {
			const addrCoords = await geocodeSmartAddress(label);
			if (addrCoords) {
				if (!coords || !strongCoords || haversineKm(coords, addrCoords) > 40) {
					coords = addrCoords;
				}
			}
		}

		if (!coords) {
			return new Response(JSON.stringify({ error: 'Could not extract coordinates', finalUrl, label }), { status: 422, headers: corsH });
		}

		return new Response(
			JSON.stringify({
				lat: +coords.lat.toFixed(6),
				lng: +coords.lng.toFixed(6),
				label: label || 'Pinned Google Maps location',
				resolvedUrl: finalUrl
			}),
			{ status: 200, headers: corsH }
		);
	} catch (e) {
		return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: corsH });
	}
});
