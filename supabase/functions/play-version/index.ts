// Fetches the currently live, published Android version of Miracle from Google Play Store.
// Cached in-memory for 15 minutes so Play Store is hit at most once per 15m per edge isolate,
// and never shows an update prompt while a release is still "In review" in Play Console.

const PACKAGE_ID = 'live.miracleapp.app';
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_ID}`;
const FETCH_URL = `${PLAY_STORE_URL}&hl=en&gl=US`;
const CACHE_TTL_MS = 15 * 60 * 1000;
const SEMVER_RE = /^\d+\.\d+(?:\.\d+)*$/;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
  'Content-Type': 'application/json; charset=utf-8',
};

type CachedResult = {
  latestVersion: string | null;
  fetchedAt: number;
};

let cache: CachedResult | null = null;

function extractVersionFromHtml(html: string): string | null {
  // Primary: parse AF_initDataCallback JSON blobs and read Google Play's ds:5 version slot a[140][0][0][0].
  const cbRe = /AF_initDataCallback\(\{[\s\S]*?data:([\s\S]*?),\s*sideChannel:/g;
  let match: RegExpExecArray | null;
  while ((match = cbRe.exec(html)) !== null) {
    const raw = match[1]?.trim();
    if (!raw || !raw.startsWith('[')) continue;
    try {
      const parsed = JSON.parse(raw);
      const app = parsed?.[1]?.[2];
      const v = app?.[140]?.[0]?.[0]?.[0];
      if (typeof v === 'string' && SEMVER_RE.test(v.trim())) {
        return v.trim();
      }
    } catch {
      // Ignore non-JSON or unrelated callback blocks.
    }
  }

  // Secondary fallback: Google Play embeds the version triple as [[["1.1.3"]]] inside ds:5.
  const fallback = html.match(/\[\[\["(\d+\.\d+(?:\.\d+)*)"\]\]/);
  if (fallback?.[1] && SEMVER_RE.test(fallback[1])) {
    return fallback[1];
  }

  return null;
}

async function fetchLivePlayVersion(): Promise<string | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.latestVersion;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(FETCH_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) {
      return cache?.latestVersion ?? null;
    }
    const html = await res.text();
    const version = extractVersionFromHtml(html);
    cache = { latestVersion: version, fetchedAt: Date.now() };
    return version;
  } catch {
    return cache?.latestVersion ?? null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const latestVersion = await fetchLivePlayVersion();
  return new Response(
    JSON.stringify({
      ok: Boolean(latestVersion),
      packageId: PACKAGE_ID,
      latestVersion,
      playStoreUrl: PLAY_STORE_URL,
    }),
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=900, stale-while-revalidate=300',
      },
    },
  );
});
