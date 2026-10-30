import { POSTING_MEDIA_LIMIT } from './postTime';
// The creator's data: loads everything once, keeps it live with realtime, and saves edits.
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Priority } from './priority';
import { decide, type Decision, type FitData } from './decide';
import { askAi } from './ai';
import { voiceAlert, voiceLine } from './voice';
import { supabase } from './supabase';
import { isNative } from './native';
import type { Package } from './types';
import type { BankAlert, Brand, BrandPrivate, BrandReport, Checklist, Collab, Deliverable, DeliverableItem, IgAccount, IgMedia, Quote, Retainer, Settings, Stage } from './types';
import { collectPages, collectRanges } from './pagination';
import { balanceDue, normaliseInvoice, type Invoice, type InvoiceItem } from './invoice';
import { confetti, moneyIn, toast, ui } from './ui.svelte';
import { ask } from './confirm.svelte';
import { diff, errMessage, fmt, inr, stageLabel, todayIso, unreadFor } from './util';
import { isNetworkError, load as loadSaved, net, save as saveLocal } from './offline.svelte';
import { makePreview } from './draftPreview';
import { uploadResumable } from './resumable';

export const studio = $state<{
	loaded: boolean;
	/** Instagram and packages have arrived too (they load just after the rest). */
	extras: boolean;
	error: string;
	/** Changes only after a complete snapshot has been fetched. */
	revision: number;
	collabs: Collab[];
	brands: Brand[];
	notes: Record<string, BrandPrivate>;
	/** The AI's reading of each request for the "Should I take it?" report, by collab id. */
	fits: Record<string, FitData>;
	/** Requests the AI is reading right now. */
	reading: string[];
	/** Possible collabs spotted in her Instagram DMs, not on the board yet (shown on Today). */
	leads: { igsid: string; username: string; name: string; picture: string; collab_flag: string; collab_hint: string; last_at: string | null; unread: number }[];
	settings: Settings | null;
	alerts: BankAlert[];
	ig: IgAccount | null;
	media: IgMedia[];
	followersHistory: { day: string; followers: number }[];
	packages: Package[];
	retainers: Retainer[];
	me: { role: 'creator'; email: string; team_role: 'owner' | 'manager' | 'assistant' | 'accountant'; name?: string } | null;
}>({ revision: 0, me: null, loaded: false, extras: false, error: '', collabs: [], brands: [], notes: {}, fits: {}, reading: [], leads: [], settings: null, alerts: [], ig: null, media: [], followersHistory: [], packages: [], retainers: [] });

type CollabCursor = { created_at: string; id: string };
async function fetchCollabs(id?: string) {
	return collectPages<Collab, CollabCursor>(async (cursor) => {
		const { data, error } = await supabase.rpc('studio_collabs_page', { p_cursor: cursor, p_limit: 100, p_collab: id ?? null });
		if (error) throw error;
		if (!data || !Array.isArray(data.rows)) throw new Error('The collaboration page was incomplete. Please refresh.');
		return data as { rows: Collab[]; next: CollabCursor | null };
	});
}
const fetchBrands = () => collectRanges<Brand>((from, to) => supabase.from('brands').select('*').order('id').range(from, to));

function normalise(c: Collab): Collab {
	c.fee = Number(c.fee) || 0;
	c.product_value = Number(c.product_value) || 0;
	c.pay_received = Number(c.pay_received) || 0;
	c.usage_ext_price = Number(c.usage_ext_price) || 0;
	c.expenses = (c.expenses ?? []).map((x) => ({ ...x, amount: Number(x.amount) || 0 })).sort((a, b) => a.spent_on.localeCompare(b.spent_on));
	c.deliverables = (c.deliverables ?? []).map((d) => ({ ...d, items: (d.items ?? []).sort((a, b) => a.position - b.position) })).sort((a, b) => a.position - b.position);
	c.events = (c.events ?? []).sort((a, b) => b.at.localeCompare(a.at));
	c.quotes = (c.quotes ?? [])
		.map((q) => ({ ...q, total: Number(q.total) || 0, usage_fee: Number(q.usage_fee) || 0, discount: Number(q.discount) || 0 }))
		.sort((a, b) => b.version - a.version);
	c.drafts = (c.drafts ?? []).sort((a, b) => b.round - a.round);
	c.invoices = (c.invoices ?? []).map((i) => normaliseInvoice(i)).sort((a, b) => b.created_at.localeCompare(a.created_at));
	c.checklist = c.checklist ?? {};
	c.posts = (c.posts ?? []).filter((p) => p.media).sort((a, b) => a.media.posted_at.localeCompare(b.media.posted_at));
	c.reports = (c.reports ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
	c.messages = (c.messages ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
	c.reads = c.reads ?? [];
	return c;
}

// ---------- Offline: the last loaded data is kept on this device and shown while offline ----------
const savedKey = async () => `studio:${(await supabase.auth.getSession()).data.session?.user.id ?? ''}`;
type Saved = Pick<typeof studio, 'collabs' | 'brands' | 'notes' | 'settings' | 'alerts' | 'ig' | 'media' | 'followersHistory' | 'packages' | 'retainers' | 'me'> & { at: string; version: 2 };
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Keep a copy of what's loaded (a second after the last change). */
export function keepCopy() {
	if (!studio.loaded) return;
	clearTimeout(saveTimer);
	saveTimer = setTimeout(async () => {
		const at = new Date().toISOString();
		const { collabs, brands, notes, settings, alerts, ig, media, followersHistory, packages, retainers, me } = studio;
		await saveLocal(await savedKey(), { collabs, brands, notes, settings, alerts, ig, media, followersHistory, packages, retainers, me, at, version: 2 });
		net.savedAt = at;
	}, 1000);
}
async function restoreCopy() {
	const s = await loadSaved<Saved>(await savedKey());
	if (!s?.settings || s.version !== 2 || studio.loaded) return false;
	Object.assign(studio, { ...s, loaded: true, error: '' });
	net.savedAt = s.at;
	return true;
}

export async function loadStudio() {
	// Show the saved copy straight away (instant start, and the app works offline), then refresh.
	if (!studio.loaded) await restoreCopy();
	try {
		const [collabs, brands, notes, settings] = await Promise.all([
			fetchCollabs(), fetchBrands(),
			collectRanges<BrandPrivate>((from, to) => supabase.from('brand_private').select('*').order('brand_id').range(from, to)),
			// the access rules show only the creator being worked for
			supabase.from('creator_settings').select('*').single()
		]);
		if (settings.error) throw settings.error;
		loadAlerts();
		Promise.allSettled([loadInstagram(), loadPackages()]).then(() => (studio.extras = true));
		loadRetainers();
		loadFits();
		loadLeads();
		supabase.rpc('studio_account').then(({ data }) => {
			studio.me = (data as typeof studio.me) ?? null;
		});
		studio.collabs = collabs.map(normalise);
		studio.brands = brands.sort((a, b) => a.name.localeCompare(b.name));
		studio.notes = Object.fromEntries(notes.map((n) => [n.brand_id, n]));
		studio.settings = settings.data as Settings;
		studio.loaded = true;
		studio.error = '';
		studio.revision++;
		lastSync = Date.now();
		keepCopy();
	} catch (err) {
		// Offline with a saved copy: keep showing it.
		studio.error = isNetworkError(err) ? "You're offline and nothing is saved on this phone yet. Connect once and it will work offline after that." : errMessage(err);
		if (studio.loaded && isNetworkError(err)) studio.error = 'Could not refresh all records. Showing the last complete saved snapshot.';
		return;
	}
}

let channel: RealtimeChannel | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let lastSync = 0;
// The live connection dropped (sleep, a background tab, a network blip): anything that happened meanwhile was missed.
let missed = false;
export function watchStudio() {
	if (channel) return;
	clearTimeout(retryTimer);
	const schedule = () => {
		clearTimeout(reloadTimer);
		reloadTimer = setTimeout(reloadCollabs, 500);
	};
	let me: RealtimeChannel;
	channel = me = supabase
		.channel('studio')
		.on('postgres_changes', { event: '*', schema: 'public', table: 'collabs' }, (p) => {
			if (p.eventType === 'INSERT' && (p.new as Collab).code && !byId((p.new as Collab).id)) {
				toast(`New request ${(p.new as Collab).code}`, 'inbox');
				speak('New request.');
			}
			schedule();
		})
		.on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, schedule)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'deliverable_items' }, schedule)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'ig_threads' }, () => loadLeads())
		.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collab_events' }, schedule)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, (p) => {
			const q = p.new as Quote;
			if (p.eventType === 'UPDATE' && q.status === 'accepted') {
				confetti();
				toast('A brand accepted your quote', 'check');
			}
			schedule();
		})
		.on('postgres_changes', { event: '*', schema: 'public', table: 'drafts' }, schedule)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, schedule)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'collab_posts' }, schedule)
		.on('postgres_changes', { event: '*', schema: 'public', table: 'brand_reports' }, schedule)
		.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collab_messages' }, (p) => {
			const m = p.new as { sender: string; collab_id: string };
			if (m.sender === 'brand' && ui.openCollab !== m.collab_id && !location.pathname.endsWith(`/inbox/${byId(m.collab_id)?.code}`)) toast(`New message from ${byId(m.collab_id)?.brand.name ?? 'a brand'}`, 'mail');
			schedule();
		})
		.on('postgres_changes', { event: '*', schema: 'public', table: 'collab_reads' }, schedule)
		.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ig_account' }, () => loadInstagram())
		.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bank_alerts' }, () => {
			toast('Your bank reported a payment', 'wallet');
			loadAlerts();
			schedule();
		})
		.subscribe((status) => {
			if (channel !== me) return;
			if (status === 'SUBSCRIBED') {
				// Back after a drop: catch up on what was missed.
				if (missed) {
					missed = false;
					catchUp(0);
				}
			} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
				// Start a fresh connection in a moment and catch up once it is back.
				missed = true;
				channel = null;
				supabase.removeChannel(me);
				clearTimeout(retryTimer);
				retryTimer = setTimeout(watchStudio, 3000);
			}
		});
}
export function stopWatching() {
	clearTimeout(retryTimer);
	const c = channel;
	channel = null;
	if (c) supabase.removeChannel(c);
}

/** Coming back to the app (tab shown again, window focused, back online): fetch the latest if it may be stale,
 *  and say what arrived meanwhile. */
export async function catchUp(minAgeMs = 30_000) {
	if (!studio.loaded || Date.now() - lastSync < minAgeMs) return;
	lastSync = Date.now();
	const known = new Set(studio.collabs.map((c) => c.id));
	const unreadBefore = studio.collabs.reduce((a, c) => a + unreadFor(c), 0);
	await reloadCollabs();
	loadLeads();
	loadAlerts();
	const fresh = studio.collabs.filter((c) => !known.has(c.id) && c.stage === 'request').length;
	const unreadNow = studio.collabs.reduce((a, c) => a + unreadFor(c), 0);
	if (fresh) toast(fresh === 1 ? 'A new request came in' : `${fresh} new requests came in`, 'inbox');
	else if (unreadNow > unreadBefore) toast(unreadNow - unreadBefore === 1 ? 'A new message from a brand' : `${unreadNow - unreadBefore} new messages from brands`, 'mail');
}

export async function reloadCollabs() {
	try {
		const [collabs, brands] = await Promise.all([fetchCollabs(), fetchBrands()]);
		studio.collabs = collabs.map(normalise);
		studio.brands = brands.sort((a, b) => a.name.localeCompare(b.name));
		studio.error = '';
		studio.revision++;
		lastSync = Date.now();
		keepCopy();
		autoFit();
	} catch (error) {
		studio.error = `Could not refresh all records. Showing the last complete snapshot. ${errMessage(error)}`;
	}
}

export async function reloadOne(id: string) {
	let data: Collab | undefined;
	try { data = (await fetchCollabs(id))[0]; } catch (error) { toast(`Couldn't refresh: ${errMessage(error)}`, 'alert'); return; }
	if (!data) return;
	const fresh = normalise(data);
	const i = studio.collabs.findIndex((c) => c.id === id);
	if (i >= 0) studio.collabs[i] = fresh;
	else studio.collabs.unshift(fresh);
	studio.revision++;
	keepCopy();
}

export const byId = (id: string | null | undefined) => studio.collabs.find((c) => c.id === id);
export const byCode = (code: string) => studio.collabs.find((c) => c.code.toUpperCase() === code.toUpperCase());
/** "Should I take it?" for a request (see decide.ts). */
export const decisionOf = (c: Collab): Decision | null => (studio.settings ? decide(c, studio.settings, studio.collabs, studio.notes[c.brand_id], studio.fits[c.id]) : null);
/** The same score in the shape the badges and sorting use. */
export const priorityOf = (c: Collab): Priority | null => {
	const d = decisionOf(c);
	if (!d) return null;
	return {
		score: d.score,
		tier: d.score >= 80 ? 'top' : d.score >= 70 ? 'high' : d.score >= 50 ? 'normal' : 'low',
		reasons: d.factors.map((f) => ({ text: `${f.label}: ${f.headline}`, pts: Math.round(f.score) })),
		counterFee: d.counterFee
	};
};

/** An Instagram handle that belongs to a brand she already has a collab going with: its handle, or her
 * name for the brand plus a usual ending (@sunveda.in, @sunveda_official for "Sunveda"). Only a whole
 * match counts, so @brandelevate isn't taken for a brand called "Brand". The Messages count and the
 * Desk AI card both use this, so they always agree. */
export function knownBrandHandle(u: string) {
	const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
	const h = norm(u);
	if (!h) return false;
	const ENDS = ['', 'in', 'india', 'official', 'store', 'shop', 'co', 'hq', 'brand', 'world'];
	return studio.brands.some((br) => {
		if (!studio.collabs.some((c) => c.brand_id === br.id && !['declined', 'cancelled', 'wrapped'].includes(c.stage))) return false;
		if (br.instagram && norm(br.instagram) === h) return true;
		const n = norm(br.name);
		return n.length >= 4 && ENDS.some((e) => h === n + e);
	});
}

/** Instagram chats that look like a collab and aren't on the board yet. */
export async function loadLeads() {
	let { data } = await supabase
		.from('ig_threads')
		.select('igsid, username, name, picture, collab_flag, collab_hint, last_at, unread')
		.is('collab_id', null)
		.in('collab_flag', ['likely', 'maybe'])
		.order('last_at', { ascending: false, nullsFirst: false })
		.limit(12);
	if (data) {
		data = (data as typeof studio.leads).filter((t) => !knownBrandHandle(t.username || ''));
		// A possible collab that wasn't there before: chime and say so (not on the first load).
		const fresh = (data as typeof studio.leads).filter((t) => !seenLeads.has(t.igsid));
		if (leadsLoaded && fresh.length) speak(fresh.length === 1 ? 'You might have a new collab.' : `You might have ${fresh.length} new collabs.`);
		for (const t of data as typeof studio.leads) seenLeads.add(t.igsid);
		leadsLoaded = true;
		studio.leads = data as typeof studio.leads;
	}
}
const seenLeads = new Set<string>();
let leadsLoaded = false;
/** Her voice alert, if she has it on. A teammate signed in to her studio hears their own name. */
function speak(what: string) {
	const s = studio.settings;
	const mate = studio.me && studio.me.team_role !== 'owner' ? String(studio.me.name ?? '').trim().split(/\s+/)[0] : null;
	// Her "Call me" name, else the first name on her profile (as the phone alerts do).
	const hers = s?.alert_name?.trim() || String(s?.display_name ?? '').trim().split(/\s+/)[0] || '';
	if (s) voiceAlert(voiceLine(mate ?? hers, what), { on: s.voice_alerts !== false });
}

export async function loadFits() {
	try {
		const data = await collectRanges<{ collab_id: string; data: FitData }>((from, to) => supabase.from('collab_fit').select('collab_id, data').order('collab_id').range(from, to));
		studio.fits = Object.fromEntries(data.map((r) => [r.collab_id, r.data]));
	} catch { return; }
	autoFit();
}

/** Ask the AI to read a request (store visit, location, look, red flags) and keep the result. */
export async function readFit(c: Collab) {
	const s = studio.settings;
	if (!s) return;
	studio.reading = [...studio.reading, c.id];
	try {
		await readFitNow(c, s);
	} finally {
		studio.reading = studio.reading.filter((x) => x !== c.id);
	}
}
async function readFitNow(c: Collab, s: Settings) {
	const res = await askAi<FitData & { home?: { lat: number; lng: number } | null }>('fit', {
		collab: {
			brand: c.brand.name,
			category: c.brand.category,
			website: c.brand.website,
			instagram: c.brand.instagram,
			type: c.type,
			fee: c.fee,
			product: c.product,
			product_value: c.product_value,
			deliverables: c.deliverables.map((d) => `${d.qty} ${d.kind}`).join(', '),
			usage: c.usage,
			go_live: c.preferred_live,
			package: c.package_name,
			brief: c.brief.slice(0, 3000),
			brief_details: c.brief_details,
			messages: c.messages.filter((m) => m.sender === 'brand').slice(-6).map((m) => m.body.slice(0, 500))
		},
		creator: { niche: s.niche, city: s.city, avoid: s.avoid_brands, home_area: s.home_area, home_lat: s.home_lat, home_lng: s.home_lng }
	});
	if (res.home && !s.home_lat) saveSettings({ home_lat: res.home.lat, home_lng: res.home.lng });
	const data: FitData = { ai: res.ai ?? {}, travel: res.travel ?? null, read_at: res.read_at };
	studio.fits[c.id] = data;
	await supabase.from('collab_fit').upsert({ collab_id: c.id, data });
}

// New requests are read in the background, a few at a time (each read uses one of the 50 free AI
// calls a day). Recent ones first; older or decided ones only when she asks.
const tried = new Set<string>();
let fitting = false;
export async function autoFit() {
	if (fitting || !studio.settings || typeof navigator === 'undefined' || !navigator.onLine) return;
	const due = studio.collabs
		.filter((c) => (c.stage === 'request' || c.stage === 'negotiating') && !studio.fits[c.id] && !tried.has(c.id) && -diff(c.received_on) <= 30)
		.slice(0, 4);
	if (!due.length) return;
	fitting = true;
	try {
		for (const c of due) {
			tried.add(c.id);
			await readFit(c);
		}
	} catch {
		// AI unavailable (limit reached, offline, local app): the report still works from her numbers.
	} finally {
		fitting = false;
	}
}

type CollabPatch = Partial<Omit<Collab, 'id' | 'brand' | 'deliverables' | 'events'>>;

/** Publish confirmed changes after the database has checked the workflow rules. */
export async function updateCollab(id: string, patch: CollabPatch) {
	const { error } = await supabase.from('collabs').update(patch).eq('id', id);
	if (error) {
		toast(`Couldn't save: ${errMessage(error)}`, 'alert');
		return false;
	}
	await reloadOne(id);
	return true;
}

export async function setStage(c: Collab, stage: Stage, quiet = false) {
	if (c.stage === stage) return;
	const patch: CollabPatch = { stage };
	// Posted today: a planned go-live date still in the future becomes today (invoice dates follow it).
	if (stage === 'live' && (!c.live_date || c.live_date > todayIso())) patch.live_date = todayIso();
	// Agreed after she sent a quote: the fee is what she quoted (so the go-live invoice charges that).
	const early = c.stage === 'request' || c.stage === 'negotiating';
	const q = [...(c.quotes ?? [])].sort((a, b) => b.version - a.version)[0];
	if (early && ['confirmed', 'creating', 'live'].includes(stage) && q && (q.status === 'sent' || q.status === 'accepted')) {
		const quoted = Math.round(q.total * (q.inr_rate || 1));
		if (quoted > 0 && quoted !== c.fee) patch.fee = quoted;
	}
	if (!(await updateCollab(c.id, patch))) return;
	if (quiet) return;
	if (stage === 'live' || stage === 'wrapped') confetti();
	toast(`${c.brand.name} moved to ${stageLabel(stage)}`, 'layers');
}

/** Someday: a request or a talk that might happen, with no date yet. It leaves Today and the reminders
 * until she brings it back (or the day she picked to check back comes). */
export async function setSomeday(c: Collab, on: boolean, checkOn: string | null = null) {
	if (!(await updateCollab(c.id, on ? { someday: true, someday_on: checkOn } : { someday: false, someday_on: null }))) return false;
	toast(on ? `${c.brand.name} is kept for someday${checkOn ? `, check back ${fmt(checkOn)}` : ''}` : `${c.brand.name} is back in your active collabs`, on ? 'clock' : 'layers');
	return true;
}

/** What's still owed on a collab: the fee less what has come in. */
export const owedOn = (c: Collab) => Math.max(0, (Number(c.fee) || 0) - (Number(c.pay_received) || 0));

/** "Mark paid" is money she's saying arrived (the brand may be emailed): always confirm it first. */
export const askPaid = (c: Collab) =>
	ask({ title: `Mark ${inr(owedOn(c))} from ${c.brand.name} as paid?`, body: 'It’s recorded as received today and counts in this month’s money. Open invoices are settled in full.', ok: 'Mark paid' });

export async function markPaid(c: Collab, quiet = false, asked = false) {
	if (!quiet && !asked && !(await askPaid(c))) return false;
	const owed = owedOn(c);
	const open = c.invoices.filter((i) => i.status === 'sent' || i.status === 'partly_paid');
	if (open.length) {
		// With invoices, "paid in full" means every open invoice was paid (TDS deducted as expected).
		for (const i of open) await recordPayment(i, { amount: balanceDue(i), tds: i.tds_amount, date: todayIso(), ref: '' }, true);
	} else {
		await updateCollab(c.id, { pay_status: 'paid', pay_received: c.fee, paid_on: todayIso(), ...(c.stage === 'live' ? { stage: 'wrapped' as Stage } : {}) });
	}
	if (quiet) return true;
	// On the phone, CRED's money-in moment; on the laptop, confetti and a note.
	if (!moneyIn(owed, c.brand.name)) {
		confetti();
		toast(`${inr(owed)} from ${c.brand.name} marked as paid`, 'wallet');
	}
	return true;
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------
export async function loadPackages() {
	try {
		const data = await collectRanges<Package>((from, to) => supabase.from('packages').select('*').order('id').range(from, to));
		studio.packages = data.map((p) => ({ ...p, price: Number(p.price) || 0 })).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
	} catch { return; }
	keepCopy();
}

export async function savePackage(p: Partial<Package> & { id?: string }) {
	const { id, ...rest } = p;
	const q = id ? supabase.from('packages').update(rest).eq('id', id) : supabase.from('packages').insert({ ...rest, position: studio.packages.length });
	const { error } = await q;
	if (error) return toast(`Couldn't save: ${errMessage(error)}`, 'alert');
	await loadPackages();
}

export async function deletePackage(id: string) {
	const { error } = await supabase.from('packages').delete().eq('id', id);
	if (error) return toast(`Couldn't delete: ${errMessage(error)}`, 'alert');
	toast('Package removed', 'check');
	await loadPackages();
}

export async function respondUsage(c: Collab, approve: boolean) {
	const { error } = await supabase.rpc('respond_usage_extension', { p_collab: c.id, p_approve: approve });
	if (error) return toast(`Couldn't save: ${errMessage(error)}`, 'alert');
	toast(approve ? `Extended. ${inr(c.usage_ext_price)} added to the fee.` : 'Extension declined', approve ? 'check' : 'x');
	await reloadCollabs();
}

export async function markReceived(c: Collab) {
	const { error } = await supabase.rpc('mark_product_received', { p_collab: c.id });
	if (error) return toast(`Couldn't save: ${errMessage(error)}`, 'alert');
	toast('Marked received. The draft clock has started.', 'box');
	await reloadCollabs();
}

export async function completeFollow(c: Collab) {
	await updateCollab(c.id, { follow_date: null, follow_note: '' });
	toast('Follow-up done');
}

export async function setDeliverable(d: Deliverable, patch: Partial<Pick<Deliverable, 'done' | 'qty'>>) {
	const { error } = await supabase.from('deliverables').update(patch).eq('id', d.id);
	if (error) toast(`Couldn't save: ${errMessage(error)}`, 'alert');
	await reloadOne(d.collab_id);
}

export async function saveDeliverableItem(item: DeliverableItem, patch: Partial<Pick<DeliverableItem, 'status' | 'due_date' | 'assigned_to' | 'draft_id' | 'media_id'>>) {
	const { error } = await supabase.from('deliverable_items').update(patch).eq('id', item.id);
	if (error) toast(`Couldn't save this item: ${errMessage(error)}`, 'alert');
	await reloadOne(item.collab_id);
	return !error;
}

export async function changeLifecycle(c: Collab, stage: 'paused' | 'cancelled' | 'resume', reason = '', resumeOn: string | null = null) {
	const { error } = await supabase.from('collabs').update(stage === 'resume'
		? { stage: c.resume_stage ?? 'request' }
		: { stage, lifecycle_reason: reason.trim(), resume_on: stage === 'paused' ? resumeOn : null }).eq('id', c.id);
	if (error) { toast(`Couldn't update this collaboration: ${errMessage(error)}`, 'alert'); return false; }
	await reloadOne(c.id);
	toast(stage === 'resume' ? 'Collaboration resumed. Review dates and held posts before scheduling.' : `Collaboration ${stage}. Existing invoices and payments are retained.`, 'check');
	return true;
}

export async function addDeliverable(c: Collab, kind: string) {
	const { error } = await supabase
		.from('deliverables')
		.insert({ collab_id: c.id, kind, qty: 1, position: c.deliverables.length });
	if (error) toast(`Couldn't add: ${errMessage(error)}`, 'alert');
	await reloadOne(c.id);
}

export async function removeDeliverable(d: Deliverable) {
	const { error } = await supabase.from('deliverables').delete().eq('id', d.id);
	if (error) toast(`Couldn't remove: ${errMessage(error)}`, 'alert');
	await reloadOne(d.collab_id);
}

/** Creates a collab the creator got by DM, email or phone. */
export type NewCollabExtra = { collab: Partial<Collab>; deliverables: { kind: string; qty: number }[]; instagram: string };

/** The brand with this name, added if it's new. */
export async function ensureBrand(brandName: string, instagram = ''): Promise<Brand | null> {
	const name = brandName.trim();
	if (!name) return null;
	let brand = studio.brands.find((b) => b.name.toLowerCase() === name.toLowerCase());
	if (brand && instagram && !brand.instagram) await saveBrand(brand.id, { instagram });
	if (!brand) {
		const { data, error } = await supabase.from('brands').insert({ name, instagram }).select('*').single();
		if (error) {
			toast(`Couldn't add brand: ${errMessage(error)}`, 'alert');
			return null;
		}
		brand = data as Brand;
		studio.brands.push(brand);
	}
	return brand;
}

// ---------- Monthly deals ----------
export async function loadRetainers() {
	try {
		const data = await collectRanges<Retainer>((from, to) => supabase.from('retainers').select('*').order('id').range(from, to));
		studio.retainers = data.map((r) => ({ ...r, fee: Number(r.fee) || 0 })).sort((a, b) => b.created_at.localeCompare(a.created_at));
	} catch { return; }
	keepCopy();
}
export async function saveRetainer(r: Partial<Retainer> & { brand_id: string }) {
	const { id, ...rest } = r;
	const { data, error } = id
		? await supabase.from('retainers').update(rest).eq('id', id).select('*').single()
		: await supabase.from('retainers').insert(rest).select('*').single();
	if (error) {
		toast(`Couldn't save the monthly deal: ${errMessage(error)}`, 'alert');
		return null;
	}
	// A new deal (or one switched back on) starts its current month straight away.
	if (!id || rest.active) await supabase.rpc('start_retainer', { p_id: (data as Retainer).id });
	await Promise.all([loadRetainers(), reloadCollabs()]);
	return data as Retainer;
}
export async function deleteRetainer(id: string) {
	const { error } = await supabase.from('retainers').delete().eq('id', id);
	if (error) return toast(`Couldn't remove it: ${errMessage(error)}`, 'alert');
	await loadRetainers();
}

export async function createCollab(brandName: string, extra?: NewCollabExtra): Promise<Collab | null> {
	const brand = await ensureBrand(brandName, extra?.instagram ?? '');
	if (!brand) return null;
	const brandIsNew = !studio.collabs.some((x) => x.brand_id === brand.id);
	const { data, error } = await supabase
		.from('collabs')
		.insert({ ...(extra?.collab ?? {}), brand_id: brand.id, source: 'manual', code: '' })
		.select('id')
		.single();
	if (error || !data) {
		// Don't leave behind a brand made just for this collab.
		if (brandIsNew) {
			await supabase.from('brands').delete().eq('id', brand.id);
			studio.brands = studio.brands.filter((b) => b.id !== brand.id);
		}
		const m = errMessage(error);
		toast(`Couldn't add ${brandName}: ${/fee_check/.test(m) ? "the fee can't be below ₹0." : /product_value/.test(m) ? "the product value can't be below ₹0." : m}`, 'alert');
		return null;
	}
	// Nothing pasted? Start from what this brand booked last time.
	const last = studio.collabs.filter((x) => x.brand_id === brand!.id && x.id !== data.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
	if (!extra && last) await supabase.from('collabs').update({ type: last.type, usage: last.usage, contact_name: last.contact_name, contact_email: last.contact_email, contact_phone: last.contact_phone }).eq('id', data.id);
	const deliv = extra?.deliverables.length ? extra.deliverables : last?.deliverables.length ? last.deliverables.map((d) => ({ kind: d.kind, qty: d.qty })) : [{ kind: 'Reel', qty: 1 }];
	await supabase.from('deliverables').insert(deliv.map((d, i) => ({ collab_id: data.id, kind: d.kind, qty: d.qty, position: i })));
	await supabase.from('collab_events').insert({ collab_id: data.id, kind: 'note', text: extra ? 'Added from a pasted message' : 'Added manually (DM, email or call)' });
	await reloadOne(data.id);
	return byId(data.id) ?? null;
}

export async function saveSettings(patch: Partial<Settings>) {
	if (studio.settings) Object.assign(studio.settings, patch);
	const id = studio.settings?.id;
	if (!id) return;
	const { error } = await supabase.from('creator_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
	if (error) toast(`Couldn't save: ${errMessage(error)}`, 'alert');
}

export async function saveBrand(id: string, patch: Partial<Brand>) {
	const b = studio.brands.find((x) => x.id === id);
	if (b) Object.assign(b, patch);
	studio.collabs.forEach((c) => c.brand_id === id && Object.assign(c.brand, patch));
	const { error } = await supabase.from('brands').update(patch).eq('id', id);
	if (error) toast(`Couldn't save: ${errMessage(error)}`, 'alert');
}

export async function saveBrandNotes(brandId: string, patch: Partial<Omit<BrandPrivate, 'brand_id'>>) {
	const current = studio.notes[brandId] ?? { brand_id: brandId, notes: '', competitors: [] };
	const next = { ...current, ...patch };
	studio.notes[brandId] = next;
	const { error } = await supabase.from('brand_private').upsert(next);
	if (error) toast(`Couldn't save: ${errMessage(error)}`, 'alert');
}

export type QuoteInput = Pick<
	Quote,
	'items' | 'usage' | 'usage_fee' | 'discount' | 'advance_pct' | 'pay_days' | 'revision_rounds' | 'exclusivity_days' | 'valid_until' | 'notes' | 'currency' | 'inr_rate'
> & { options?: Quote['options']; wait_advance?: boolean };

/** The line the brand reads when work waits for the advance (kept in the quote's notes, which every
 *  brand page and the agreement show). */
export const WAIT_LINE = 'Work starts once the advance arrives.';

/** Saves a quote. Editing a draft updates it; anything else becomes a new version. */
export async function saveQuote(c: Collab, input: QuoteInput, send: boolean, editId?: string) {
	const plain = input.notes.replace(WAIT_LINE, '').trim();
	const wait = !!input.wait_advance && input.advance_pct > 0;
	const row = { ...input, wait_advance: wait, notes: wait ? `${WAIT_LINE}${plain ? `\n${plain}` : ''}` : plain, status: send ? 'sent' : 'draft' };
	const { error } = editId
		? await supabase.from('quotes').update(row).eq('id', editId)
		: await supabase.from('quotes').insert({ ...row, collab_id: c.id });
	if (error) {
		toast(`Couldn't save the quote: ${errMessage(error)}`, 'alert');
		return false;
	}
	await reloadOne(c.id);
	toast(send ? `Quote sent to ${c.brand.name}` : 'Quote saved as draft', send ? 'send' : 'check');
	return true;
}

export async function withdrawQuote(q: Quote) {
	const { error } = await supabase.from('quotes').update({ status: 'withdrawn' }).eq('id', q.id);
	if (error) toast(`Couldn't withdraw: ${errMessage(error)}`, 'alert');
	await reloadOne(q.collab_id);
}

export const DRAFT_MAX_MB = 50;
export type DraftProgress = { pct: number; label: string };
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * Send a draft to the brand. A video or photo also gets a light preview with "DRAFT · for <brand>"
 * across it (made on this device); the brand sees only that until the collab is paid. Files go up
 * in resumable pieces, so a dropped signal doesn't start them over.
 */
export async function shareDraft(c: Collab, d: { link: string; caption: string; note: string }, file?: File | null, onProgress?: (p: DraftProgress) => void, signal?: AbortSignal) {
	let file_path: string | null = null;
	let preview_path: string | null = null;
	let preview_type = '';
	if (file) {
		if (file.size > DRAFT_MAX_MB * 1024 * 1024) {
			toast(`That file is over ${DRAFT_MAX_MB} MB. Share a Google Drive link instead.`, 'alert');
			return false;
		}
		const id = crypto.randomUUID();
		const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
		file_path = `${c.id}/${id}.${ext}`;
		let preview: File | null = null;
		try {
			preview = await makePreview(file, c.brand.name, (done, total) => onProgress?.({ pct: Math.round((done / total) * 100), label: `Making ${c.brand.name}'s watermarked preview · ${mmss(done)} of ${mmss(total)}` }), signal);
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') return false;
			preview = null;
		}
		try {
			const share = preview ? 0.75 : 1;
			onProgress?.({ pct: 0, label: 'Uploading…' });
			await uploadResumable('drafts', file_path, file, { type: file.type, signal, onProgress: (pct) => onProgress?.({ pct: Math.round(pct * share), label: `Uploading · ${Math.round(pct * share)}%` }) });
			if (preview) {
				preview_path = `${c.id}/${id}-preview.${preview.type === 'image/jpeg' ? 'jpg' : preview.type === 'video/mp4' ? 'mp4' : 'webm'}`;
				preview_type = preview.type;
				await uploadResumable('drafts', preview_path, preview, { type: preview.type, signal, onProgress: (pct) => onProgress?.({ pct: 75 + Math.round(pct / 4), label: `Uploading · ${75 + Math.round(pct / 4)}%` }) });
			}
		} catch (e) {
			if ((e as Error)?.name !== 'AbortError') toast((e as Error).message, 'alert');
			return false;
		}
	}
	const { error } = await supabase.from('drafts').insert({ collab_id: c.id, ...d, file_path, file_type: file?.type ?? '', preview_path, preview_type });
	if (error) {
		toast(`Couldn't share the draft: ${errMessage(error)}`, 'alert');
		return false;
	}
	await reloadOne(c.id);
	toast(preview_path ? `Draft sent to ${c.brand.name}, with their watermarked preview` : `Draft sent to ${c.brand.name} for approval`, 'send');
	return true;
}

/** Let the brand open the clean draft file before payment (it opens by itself once paid). */
export async function releaseDraft(id: string, collabId: string) {
	const { error } = await supabase.from('drafts').update({ released_at: new Date().toISOString() }).eq('id', id);
	if (error) return toast(`Couldn't send it: ${errMessage(error)}`, 'alert');
	await reloadOne(collabId);
	toast('The brand can now open the clean file', 'send');
}

export async function setChecklist(c: Collab, patch: Checklist) {
	await updateCollab(c.id, { checklist: { ...c.checklist, ...patch } });
}

// ---- invoices ----
export type InvoiceInput = {
	kind: Invoice['kind'];
	items: InvoiceItem[];
	tax_mode: Invoice['tax_mode'];
	gst_rate: number;
	currency?: string;
	inr_rate?: number;
	tds_rate: number;
	/** 194J fees or 194C contract work (Section 393 of the Income-tax Act, 2025, from 1 Apr 2026). */
	tds_section?: '194J' | '194C';
	issue_date: string;
	due_date: string | null;
	send_to: string;
	notes: string;
	auto_remind: boolean;
};

/** Saves a draft invoice, or issues it (gets its number and is emailed to the brand). */
export async function saveInvoice(c: Collab, input: InvoiceInput, issue: boolean, editId?: string) {
	const row = { ...input, status: issue ? 'sent' : 'draft' };
	const { data, error } = editId
		? await supabase.from('invoices').update(row).eq('id', editId).select('number').single()
		: await supabase.from('invoices').insert({ ...row, collab_id: c.id }).select('number').single();
	if (error) {
		toast(`Couldn't save the invoice: ${errMessage(error)}`, 'alert');
		return false;
	}
	await reloadOne(c.id);
	const emailedTo = c.brand.accounts_email || input.send_to || c.contact_email;
	toast(issue ? (emailedTo ? `Invoice ${data?.number} sent to ${c.brand.name}` : `Invoice ${data?.number} is ready to send on WhatsApp`) : 'Invoice saved as draft', issue ? 'send' : 'check');
	return true;
}

export async function recordPayment(inv: Invoice, p: { amount: number; tds: number; date: string; ref: string }, quiet = false) {
	const room = inv.total - inv.amount_received - Math.max(inv.tds_deducted, Math.max(0, p.tds));
	if (p.amount > room + 1) {
		toast(`That's more than the ${inr(Math.max(0, room))} still to receive on ${inv.number}.`, 'alert');
		return false;
	}
	const { error } = await supabase
		.from('invoices')
		.update({
			amount_received: inv.amount_received + Math.max(0, p.amount),
			tds_deducted: Math.max(inv.tds_deducted, Math.max(0, p.tds)),
			paid_on: p.date || todayIso(),
			payment_ref: p.ref || inv.payment_ref
		})
		.eq('id', inv.id);
	if (error) {
		toast(`Couldn't record the payment: ${errMessage(error)}`, 'alert');
		return false;
	}
	await reloadOne(inv.collab_id);
	if (!quiet && !moneyIn(p.amount, byId(inv.collab_id)?.brand.name ?? '')) {
		confetti();
		toast(`${inr(p.amount)} recorded for ${inv.number}`, 'wallet');
	}
	return true;
}

export async function setInvoiceFlags(inv: Invoice, patch: Partial<Pick<Invoice, 'tds_certificate' | 'auto_remind'>>) {
	Object.assign(inv, patch);
	const { error } = await supabase.from('invoices').update(patch).eq('id', inv.id);
	if (error) toast(`Couldn't save: ${errMessage(error)}`, 'alert');
}

export async function cancelInvoice(inv: Invoice) {
	const { error } = inv.status === 'draft'
		? await supabase.from('invoices').delete().eq('id', inv.id)
		: await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', inv.id);
	if (error) toast(`Couldn't cancel: ${errMessage(error)}`, 'alert');
	await reloadOne(inv.collab_id);
}

export async function loadAlerts() {
	const { data, error } = await supabase.from('bank_alerts').select('*').order('created_at', { ascending: false }).limit(50);
	if (error && isNetworkError(error)) return;
	studio.alerts = ((data ?? []) as BankAlert[]).map((a) => ({ ...a, amount: a.amount === null ? null : Number(a.amount) }));
}

export async function assignAlert(a: BankAlert, inv: Invoice) {
	const amount = a.amount ?? 0;
	const net = inv.payable - inv.amount_received;
	const withTds = inv.tds_amount > 0 && Math.abs(net - amount) <= 1;
	const ok = await recordPayment(inv, { amount, tds: withTds ? inv.tds_amount : 0, date: (a.received_at ?? a.created_at).slice(0, 10), ref: a.ref });
	if (!ok) return;
	await supabase.from('bank_alerts').update({ status: 'matched', invoice_id: inv.id }).eq('id', a.id);
	await loadAlerts();
}

export async function ignoreAlert(a: BankAlert) {
	await supabase.from('bank_alerts').update({ status: 'ignored' }).eq('id', a.id);
	await loadAlerts();
}

// ---- Instagram ----
export async function loadInstagram() {
	const [acct, media, hist] = await Promise.all([
		supabase.from('ig_account').select('*').single(),
		supabase.from('ig_media').select('*').order('posted_at', { ascending: false }).limit(POSTING_MEDIA_LIMIT),
		supabase.from('ig_followers_history').select('*').order('day', { ascending: false }).limit(60)
	]);
	if (acct.error && isNetworkError(acct.error)) return;
	studio.ig = (acct.data as IgAccount) ?? null;
	studio.media = (media.data as IgMedia[]) ?? [];
	studio.followersHistory = ((hist.data as { day: string; followers: number }[]) ?? []).reverse();
	keepCopy();
}

export async function invokeFn(name: string, body: Record<string, unknown>) {
	const { data, error } = await supabase.functions.invoke(name, { body });
	if (error) {
		let msg = errMessage(error);
		try {
			const b = await (error as { context?: Response }).context?.json();
			if (b?.error) msg = b.error;
		} catch {
			/* keep the generic message */
		}
		throw new Error(msg);
	}
	return data;
}

/** Pulls fresh numbers from Instagram now (or makes a fresh report for one collab). */
export async function igSync(reportFor?: string) {
	try {
		const r = await invokeFn('instagram-sync', reportFor ? { report_for: reportFor } : {});
		// Live Stories too, while their numbers still exist.
		await invokeFn('instagram-stories', {}).catch(() => null);
		await Promise.all([loadInstagram(), reloadCollabs()]);
		if (reportFor) toast('Fresh results report ready', 'chart');
		else toast(r?.detected ? `Synced. ${r.detected} new collab post${r.detected > 1 ? 's' : ''} spotted.` : 'Instagram numbers updated', 'refresh');
		return true;
	} catch (e) {
		toast(`Instagram: ${errMessage(e)}`, 'alert');
		return false;
	}
}

/** The Instagram sign-in address for this creator. Every creator comes back through the same server
 * address (the one registered with Meta), and the signed state says whose account it is. */
export async function igStart(extra: boolean, comments = false): Promise<string> {
	const r = (await invokeFn('instagram-auth', { action: 'start', extra, comments, app: isNative() })) as { url?: string };
	if (!r?.url) throw new Error('Instagram sign-in could not start. Try again.');
	return r.url;
}

export async function igConnect(code: string, redirectUri: string) {
	await invokeFn('instagram-auth', { code, redirect_uri: redirectUri });
	await Promise.all([loadInstagram(), reloadCollabs()]);
}

export async function igDisconnect() {
	try {
		await invokeFn('instagram-auth', { action: 'disconnect' });
		await loadInstagram();
		toast('Instagram disconnected');
	} catch (e) {
		toast(errMessage(e), 'alert');
	}
}

/** Links a post to a collab by hand (when the brand wasn't @mentioned). */
export async function linkPost(c: Collab, m: IgMedia) {
	const { error } = await supabase.from('collab_posts').insert({ collab_id: c.id, media_id: m.id, matched_by: 'manual' });
	if (error) return toast(`Couldn't link the post: ${errMessage(error)}`, 'alert');
	if (['confirmed', 'creating'].includes(c.stage)) {
		await updateCollab(c.id, { stage: 'live', live_date: m.posted_at.slice(0, 10) });
	}
	await reloadOne(c.id);
	toast('Post linked');
}

export async function unlinkPost(c: Collab, mediaId: string) {
	await supabase.from('collab_posts').delete().eq('collab_id', c.id).eq('media_id', mediaId);
	await reloadOne(c.id);
}

export async function sendReport(r: BrandReport) {
	const { error } = await supabase.from('brand_reports').update({ status: 'sent' }).eq('id', r.id);
	if (error) return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
	await reloadOne(r.collab_id);
	confetti();
	toast('Results report sent to the brand', 'send');
}
