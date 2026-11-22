export type AppUpdateInfo = {
	latestVersion: string;
	minVersion?: string;
	required?: boolean;
	title?: string;
	message?: string;
	playStoreUrl?: string;
};

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=live.miracleapp.app';

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
		return info?.version ?? null;
	} catch {
		return null;
	}
}

export async function checkPlayStoreUpdate(): Promise<{
	available: boolean;
	required: boolean;
	installed: string | null;
	info: AppUpdateInfo | null;
}> {
	const installed = await getInstalledAndroidVersion();
	if (!installed) {
		return { available: false, required: false, installed: null, info: null };
	}
	try {
		const res = await fetch(`/app-version.json?t=${Date.now()}`, { cache: 'no-store' });
		if (!res.ok) return { available: false, required: false, installed, info: null };
		const info = (await res.json()) as AppUpdateInfo;
		const available = compareVersions(installed, info.latestVersion) < 0;
		const belowMin = !!info.minVersion && compareVersions(installed, info.minVersion) < 0;
		return { available, required: !!info.required || belowMin, installed, info };
	} catch {
		return { available: false, required: false, installed, info: null };
	}
}
