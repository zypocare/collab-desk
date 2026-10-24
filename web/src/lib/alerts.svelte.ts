// Alerts kept in the app: the event notifications her phones got (requests, messages, quotes, drafts,
// payments...), kept for 90 days so she can find them later. Each login has its own unread count.
import { supabase } from './supabase';

export type Alert = { id: number; kind: string; title: string; body: string; url: string; created_at: string };
export const alerts = $state<{ list: Alert[]; loaded: boolean; unread: number; seenBefore: string | null }>({ list: [], loaded: false, unread: 0, seenBefore: null });

export async function loadAlerts() {
	const { data } = await supabase.from('creator_alerts').select('id, kind, title, body, url, created_at').order('created_at', { ascending: false }).limit(150);
	alerts.list = (data as Alert[]) ?? [];
	alerts.loaded = true;
}

export async function refreshUnread() {
	const { data } = await supabase.rpc('alerts_unread');
	if (typeof data === 'number') alerts.unread = data;
}

/** She opened Alerts: everything so far is seen. Keeps when she'd last looked, to mark what's new. */
export async function markAlertsSeen() {
	const { data } = await supabase.rpc('alerts_seen');
	alerts.seenBefore = typeof data === 'string' ? data : null;
	alerts.unread = 0;
}

let timer: ReturnType<typeof setInterval> | null = null;
/** Keep the bell's count fresh: now, every two minutes while the app is on screen, and on coming back. */
export function watchAlerts() {
	if (timer) return () => {};
	refreshUnread();
	timer = setInterval(() => document.visibilityState === 'visible' && refreshUnread(), 120_000);
	const back = () => document.visibilityState === 'visible' && refreshUnread();
	document.addEventListener('visibilitychange', back);
	return () => {
		if (timer) clearInterval(timer);
		timer = null;
		document.removeEventListener('visibilitychange', back);
	};
}

/** The icon for what happened. */
export function alertIcon(kind: string) {
	if (/request|email_request|question/.test(kind)) return 'inbox';
	if (/message|ig_dm|comment_dm|ig_collab/.test(kind)) return 'send';
	if (/quote|counter/.test(kind)) return 'rupee';
	if (/draft/.test(kind)) return 'image';
	if (/product|shipped/.test(kind)) return 'box';
	if (/pay|bank|sales/.test(kind)) return 'wallet';
	if (/post|live/.test(kind)) return 'film';
	if (/review/.test(kind)) return 'heart';
	if (/pitch|brief|reel_invite|reel_answer/.test(kind)) return 'spark';
	if (/checkup|insights|month/.test(kind)) return 'chart';
	if (/usage/.test(kind)) return 'shield';
	return 'bell';
}
