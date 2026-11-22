export type AppUpdateInfo = {
	latestVersion: string;
	playStoreUrl: string;
};

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=live.miracleapp.app';

const SEMVER_RE = /^\d+\.\d+(?:\.\d+)*$/;
const CACHE_KEY = 'miracle.play_version.cache.v1';
const CACHE_TTL_MS = 10 * 60 * 1000;

/** Compare semver strings like "1.1.2" < "1.1.3". Returns -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a: string, b: string): number {
	const pa = a.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
	const pb = b.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const da = pa[i] ?? 0;
		const db = pb[i] ?? 0;
		if (da < db) return -1;
		if (da > db) return 1;
	}
	return 0;
}

type CapWindow = Window & {
	Capacitor?: {
		isNativePlatform?: () => boolean;
		getPlatform?: () => string;
		Plugins?: {
			App?: { getInfo?: () => Promise<{ version?: string; build?: string }> };
		};
	};
};

/** Returns the installed Android app version when running inside Capacitor Android, or null on web. */
export async function getInstalledAndroidVersion(): Promise<string | null> {
	if (typeof window === 'undefined') return null;
	const cap = (window as CapWindow).Capacitor;
	if (!cap?.isNativePlatform?.()) return null;
	if (cap.getPlatform?.() !== 'android') return null;
	try {
		const info = await cap.Plugins?.App?.getInfo?.();
		const v = info?.version?.trim() ?? '';
		return SEMVER_RE.test(v) ? v : null;
	} catch {
		return null;
	}
}

async function fetchLivePlayStoreInfo(): Promise<AppUpdateInfo | null> {
	try {
		const raw = sessionStorage.getItem(CACHE_KEY);
		if (raw) {
			const cached = JSON.parse(raw) as { ts: number; info: AppUpdateInfo | null };
			if (Date.now() - cached.ts < CACHE_TTL_MS) return cached.info;
		}
	} catch {
		// Ignore storage errors.
	}

	const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
	if (!supabaseUrl) return null;

	try {
		const res = await fetch(`${supabaseUrl}/functions/v1/play-version`, { cache: 'no-store' });
		if (!res.ok) return null;
		const data = (await res.json()) as {
			ok?: boolean;
			latestVersion?: string | null;
			playStoreUrl?: string;
		};
		const latest = data.latestVersion?.trim() ?? '';
		const info: AppUpdateInfo | null =
			data.ok && SEMVER_RE.test(latest)
				? { latestVersion: latest, playStoreUrl: data.playStoreUrl || PLAY_STORE_URL }
				: null;

		try {
			sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), info }));
		} catch {
			// Ignore storage errors.
		}
		return info;
	} catch {
		return null;
	}
}

/**
 * Dynamically compares the installed Android APK version against the actual live version
 * currently published on Google Play Store (never hardcoded).
 */
export async function checkPlayStoreUpdate(): Promise<{
	available: boolean;
	installed: string | null;
	info: AppUpdateInfo | null;
}> {
	const installed = await getInstalledAndroidVersion();
	if (!installed) {
		return { available: false, installed: null, info: null };
	}
	const info = await fetchLivePlayStoreInfo();
	if (!info) {
		return { available: false, installed, info: null };
	}
	const available = compareVersions(installed, info.latestVersion) < 0;
	return { available, installed, info };
}
