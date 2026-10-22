// Crashes in the app go to the admin panel's Problems tab, with the last few things the person did and
// which phone or browser it was. Never the text they typed, messages, quotes or bank details.
import { version } from '$app/env';
import { supabase } from './supabase';
import { onLimit } from './util';

const steps: string[] = [];
let session = '';
const sent = new Map<string, number>();

/** Something the person did (shown as "What they did before"). Numbers are left out. */
export function step(what: string) {
	const s = what.replace(/\s+/g, ' ').replace(/[0-9]+/g, '#').trim().slice(0, 60);
	if (!s || steps[steps.length - 1] === s) return;
	steps.push(s);
	if (steps.length > 8) steps.shift();
}

// A random id for this tab (randomUUID is missing on older phones and plain-http pages).
const rid = () => Array.from({ length: 18 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
function sessionId() {
	if (session) return session;
	try {
		session = sessionStorage.getItem('cd-session') ?? '';
		if (!session) sessionStorage.setItem('cd-session', (session = rid()));
	} catch {
		session = rid();
	}
	return session;
}

function device() {
	const ua = navigator.userAgent;
	const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other';
	const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` : /CriOS\/(\d+)|Chrome\/(\d+)/.exec(ua) ? `Chrome ${(/CriOS\/(\d+)|Chrome\/(\d+)/.exec(ua)!.slice(1).find(Boolean))}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}` : /Version\/(\d+).*Safari/.exec(ua) ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}` : 'Browser';
	const app = matchMedia('(display-mode: standalone)').matches ? ' · app' : '';
	return `${os}, ${b}${app}, ${innerWidth}px`;
}

const NOISE = /ResizeObserver loop|Script error|AbortError|The user aborted|cancelled|Load failed$|Failed to fetch$|NetworkError/i;
const CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** Sends one crash; hands back the reference shown to the person (or '' when it isn't worth sending). */
export async function reportProblem(e: unknown, place = location.pathname): Promise<string> {
	const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : String((e as { message?: unknown })?.message ?? e));
	const message = err.message || String(e);
	if (!message || NOISE.test(message) || /^LIMIT:/.test(message) || !navigator.onLine) return '';
	// The same crash again within a few seconds is the same crash.
	const key = message + place;
	if (Date.now() - (sent.get(key) ?? 0) < 8000) return '';
	sent.set(key, Date.now());
	const { data } = await supabase.rpc('problem_report', {
		p: { source: 'app', message: message.slice(0, 300), stack: String(err.stack ?? '').slice(0, 4000), place, steps, device: device(), release: Number(version) ? Number(version).toString(36) : String(version).slice(-8), session: sessionId() }
	});
	return typeof data === 'string' ? data : '';
}

/** What the person was doing, from the "Something broke" screen. */
export async function noteProblem(ref: string, note: string) {
	if (ref && note.trim()) await supabase.rpc('problem_note', { p_ref: ref, p_note: note.trim() });
}

let started = false;
export function initProblems() {
	if (started || typeof window === 'undefined') return;
	started = true;
	addEventListener('error', (ev) => {
		// An old tab after a deploy asks for files that are gone: load the new version (once).
		if (CHUNK.test(ev.message ?? '')) return reloadOnce(ev.error ?? ev.message);
		if (ev.error || ev.message) reportProblem(ev.error ?? ev.message);
	});
	addEventListener('unhandledrejection', (ev) => {
		const r = ev.reason;
		if (CHUNK.test(String(r?.message ?? r))) return reloadOnce(r);
		// Supabase answers (a refused save, a rule) are shown to the person; only real crashes are problems.
		if (r instanceof Error) reportProblem(r);
	});
	addEventListener(
		'click',
		(ev) => {
			const el = (ev.target as HTMLElement | null)?.closest?.('button, a, [role="tab"], summary');
			if (!el || el.closest('input, textarea')) return;
			const label = el.getAttribute('aria-label') || (el.textContent ?? '');
			if (label.trim().length && label.trim().length <= 40) step(`Tapped ${label.trim()}`);
		},
		{ capture: true, passive: true }
	);
	// One visit a day per device, so the panel can say how many went without a problem.
	try {
		const day = new Date().toISOString().slice(0, 10);
		if (localStorage.getItem('cd-visit') !== day) {
			localStorage.setItem('cd-visit', day);
			supabase.rpc('problem_visit', { p_session: sessionId() }).then(() => {});
		}
	} catch {
		/* storage blocked */
	}
	// Limits people run into go to the Safety tab (at most once a minute each).
	const hit = new Map<string, number>();
	onLimit((k) => {
		if (Date.now() - (hit.get(k) ?? 0) < 60_000) return;
		hit.set(k, Date.now());
		supabase.rpc('safety_hit', { p_kind: k }).then(() => {});
	});
}

export function reloadOnce(e: unknown) {
	try {
		const last = Number(sessionStorage.getItem('cd-reloaded') ?? 0);
		if (Date.now() - last > 60_000) {
			sessionStorage.setItem('cd-reloaded', String(Date.now()));
			reportProblem(e).finally(() => location.reload());
			return;
		}
	} catch {
		/* storage blocked */
	}
	reportProblem(e);
}
