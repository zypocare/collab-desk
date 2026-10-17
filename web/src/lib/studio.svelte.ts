// The creator's data: loads everything once, keeps it live with realtime, and saves edits.
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Priority } from './priority';
import { decide, type Decision, type FitData } from './decide';
import { askAi } from './ai';
import { supabase } from './supabase';
import type { Package } from './types';
import type { BankAlert, Brand, BrandPrivate, BrandReport, Checklist, Collab, Deliverable, IgAccount, IgMedia, Quote, Retainer, Settings, Stage } from './types';
import { balanceDue, normaliseInvoice, type Invoice, type InvoiceItem } from './invoice';
import { confetti, toast, ui } from './ui.svelte';
import { diff, errMessage, inr, stageLabel, todayIso } from './util';
import { isNetworkError, load as loadSaved, net, save as saveLocal } from './offline.svelte';

export const studio = $state<{
	loaded: boolean;
	error: string;
	collabs: Collab[];
	brands: Brand[];
	notes: Record<string, BrandPrivate>;
	/** The AI's reading of each request for the "Should I take it?" report, by collab id. */
	fits: Record<string, FitData>;
	/** Requests the AI is reading right now. */
	reading: string[];
	/** Possible collabs spotted in her Instagram DMs, not on the board yet (shown on Today). */
	leads: { igsid: string; username: string; name: string; picture: string; collab_flag: string; collab_hint: string; last_at: string | null }[];
	settings: Settings | null;
	alerts: BankAlert[];
	ig: IgAccount | null;
	media: IgMedia[];
	followersHistory: { day: string; followers: number }[];
	packages: Package[];
	retainers: Retainer[];
	me: { role: 'creator'; email: string; team_role: 'owner' | 'manager'; name?: string } | null;
}>({ me: null, loaded: false, error: '', collabs: [], brands: [], notes: {}, fits: {}, reading: [], leads: [], settings: null, alerts: [], ig: null, media: [], followersHistory: [], packages: [], retainers: [] });

const COLLAB_SELECT = '*, brand:brands(*), deliverables(*), events:collab_events(*), quotes(*), drafts(*, comments:draft_comments(*)), expenses:collab_expenses(*), files:collab_files(*), invoices(*), posts:collab_posts(matched_by, media:ig_media(*)), reports:brand_reports(*), messages:collab_messages(id, sender, body, created_at), reads:collab_reads(side, read_at), links:collab_links(*)';

function normalise(c: Collab): Collab {
	c.fee = Number(c.fee) || 0;
	c.product_value = Number(c.product_value) || 0;
	c.pay_received = Number(c.pay_received) || 0;
	c.usage_ext_price = Number(c.usage_ext_price) || 0;
	c.expenses = (c.expenses ?? []).map((x) => ({ ...x, amount: Number(x.amount) || 0 })).sort((a, b) => a.spent_on.localeCompare(b.spent_on));
	c.deliverables = (c.deliverables ?? []).sort((a, b) => a.position - b.position);
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
type Saved = Pick<typeof studio, 'collabs' | 'brands' | 'notes' | 'settings' | 'alerts' | 'ig' | 'media' | 'followersHistory' | 'packages' | 'retainers' | 'me'> & { at: string };
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** Keep a copy of what's loaded (a second after the last change). */
export function keepCopy() {
	if (!studio.loaded) return;
	clearTimeout(saveTimer);
	saveTimer = setTimeout(async () => {
		const at = new Date().toISOString();
		const { collabs, brands, notes, settings, alerts, ig, media, followersHistory, packages, retainers, me } = studio;
		await saveLocal(await savedKey(), { collabs, brands, notes, settings, alerts, ig, media, followersHistory, packages, retainers, me, at });
		net.savedAt = at;
	}, 1000);
}
async function restoreCopy() {
	const s = await loadSaved<Saved>(await savedKey());
	if (!s?.settings || studio.loaded) return false;
	Object.assign(studio, { ...s, loaded: true, error: '' });
	net.savedAt = s.at;
	return true;
}

export async function loadStudio() {
	// Show the saved copy straight away (instant start, and the app works offline), then refresh.
	if (!studio.loaded) await restoreCopy();
	const [collabs, brands, notes, settings] = await Promise.all([
		supabase.from('collabs').select(COLLAB_SELECT).order('received_on', { ascending: false }),
		supabase.from('brands').select('*').order('name'),
		supabase.from('brand_private').select('*'),
		supabase.from('creator_settings').select('*').eq('id', 1).single()
	]);
	loadAlerts();
	loadInstagram();
	loadPackages();
	loadRetainers();
	loadFits();
	loadLeads();
	supabase.rpc('studio_account').then(({ data }) => (studio.me = (data as typeof studio.me) ?? null));
	const err = collabs.error || brands.error || notes.error || settings.error;
	if (err) {
		// Offline with a saved copy: keep showing it.
		if (studio.loaded && isNetworkError(err)) return;
		studio.error = isNetworkError(err) ? "You're offline and nothing is saved on this phone yet. Connect once and it will work offline after that." : errMessage(err);
		return;
	}
	studio.collabs = (collabs.data as Collab[]).map(normalise);
	studio.brands = brands.data as Brand[];
	studio.notes = Object.fromEntries((notes.data as BrandPrivate[]).map((n) => [n.brand_id, n]));
	studio.settings = settings.data as Settings;
	studio.loaded = true;
	studio.error = '';
	keepCopy();
}

let channel: RealtimeChannel | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;
export function watchStudio() {
	if (channel) return;
	const schedule = () => {
		clearTimeout(reloadTimer);
		reloadTimer = setTimeout(reloadCollabs, 500);
	};
	channel = supabase
		.channel('studio')
		.on('postgres_changes', { event: '*', schema: 'public', table: 'collabs' }, (p) => {
			if (p.eventType === 'INSERT' && (p.new as Collab).code && !byId((p.new as Collab).id)) {
				toast(`New request ${(p.new as Collab).code}`, 'inbox');
			}
			schedule();
		})
		.on('postgres_changes', { event: '*', schema: 'public', table: 'deliverables' }, schedule)
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
		.subscribe();
}
export function stopWatching() {
	if (channel) supabase.removeChannel(channel);
	channel = null;
}

export async function reloadCollabs() {
	const { data, error } = await supabase.from('collabs').select(COLLAB_SELECT).order('received_on', { ascending: false });
	if (!error && data) studio.collabs = (data as Collab[]).map(normalise);
	const b = await supabase.from('brands').select('*').order('name');
	if (!b.error && b.data) studio.brands = b.data as Brand[];
	keepCopy();
	autoFit();
}

async function reloadOne(id: string) {
	const { data, error } = await supabase.from('collabs').select(COLLAB_SELECT).eq('id', id).single();
	if (error || !data) return;
	const fresh = normalise(data as Collab);
	const i = studio.collabs.findIndex((c) => c.id === id);
	if (i >= 0) studio.collabs[i] = fresh;
	else studio.collabs.unshift(fresh);
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

/** Instagram chats that look like a collab and aren't on the board yet. */
export async function loadLeads() {
	const { data } = await supabase
		.from('ig_threads')
		.select('igsid, username, name, picture, collab_flag, collab_hint, last_at')
		.is('collab_id', null)
		.in('collab_flag', ['likely', 'maybe'])
		.order('last_at', { ascending: false, nullsFirst: false })
		.limit(12);
	if (data) studio.leads = data as typeof studio.leads;
}

export async function loadFits() {
	const { data } = await supabase.from('collab_fit').select('collab_id, data');
	if (data) studio.fits = Object.fromEntries(data.map((r) => [r.collab_id as string, r.data as FitData]));
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

/** Saves fields on a collab. Updates the screen first, then the database. */
export async function updateCollab(id: string, patch: CollabPatch) {
	const c = byId(id);
	if (c) Object.assign(c, patch);
	const { error } = await supabase.from('collabs').update(patch).eq('id', id);
	if (error) {
		toast(`Couldn't save: ${errMessage(error)}`, 'alert');
	}
	await reloadOne(id);
}

export async function setStage(c: Collab, stage: Stage, quiet = false) {
	if (c.stage === stage) return;
	const patch: CollabPatch = { stage };
	if (stage === 'live' && !c.live_date) patch.live_date = todayIso();
	await updateCollab(c.id, patch);
	if (stage === 'live' && c.deliverables.some((d) => !d.done)) {
		await supabase.from('deliverables').update({ done: true }).eq('collab_id', c.id);
		await reloadOne(c.id);
	}
	if (quiet) return;
	if (stage === 'live' || stage === 'wrapped') confetti();
	toast(`${c.brand.name} moved to ${stageLabel(stage)}`, 'layers');
}

export async function markPaid(c: Collab, quiet = false) {
	const open = c.invoices.filter((i) => i.status === 'sent' || i.status === 'partly_paid');
	if (open.length) {
		// With invoices, "paid in full" means every open invoice was paid (TDS deducted as expected).
		for (const i of open) await recordPayment(i, { amount: balanceDue(i), tds: i.tds_amount, date: todayIso(), ref: '' }, true);
	} else {
		await updateCollab(c.id, { pay_status: 'paid', pay_received: c.fee, paid_on: todayIso(), ...(c.stage === 'live' ? { stage: 'wrapped' as Stage } : {}) });
	}
	if (quiet) return;
	confetti();
	toast(`${inr(c.fee)} from ${c.brand.name} marked as paid`, 'wallet');
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------
export async function loadPackages() {
	const { data, error } = await supabase.from('packages').select('*').order('position').order('created_at');
	if (error && isNetworkError(error)) return;
	studio.packages = ((data as Package[]) ?? []).map((p) => ({ ...p, price: Number(p.price) || 0 }));
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
	const c = byId(d.collab_id);
	const local = c?.deliverables.find((x) => x.id === d.id);
	if (local) Object.assign(local, patch);
	const { error } = await supabase.from('deliverables').update(patch).eq('id', d.id);
	if (error) toast(`Couldn't save: ${errMessage(error)}`, 'alert');
	if (c && patch.done && c.deliverables.every((x) => x.done)) {
		confetti();
		toast('All deliverables done');
	}
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
	const { data, error } = await supabase.from('retainers').select('*').order('created_at', { ascending: false });
	if (error && isNetworkError(error)) return;
	studio.retainers = ((data as Retainer[]) ?? []).map((r) => ({ ...r, fee: Number(r.fee) || 0 }));
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
	const { data, error } = await supabase
		.from('collabs')
		.insert({ ...(extra?.collab ?? {}), brand_id: brand.id, source: 'manual', code: '' })
		.select('id')
		.single();
	if (error || !data) {
		toast(`Couldn't add collab: ${errMessage(error)}`, 'alert');
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
	const { error } = await supabase.from('creator_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1);
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
>;

/** Saves a quote. Editing a draft updates it; anything else becomes a new version. */
export async function saveQuote(c: Collab, input: QuoteInput, send: boolean, editId?: string) {
	const row = { ...input, status: send ? 'sent' : 'draft' };
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
export async function shareDraft(c: Collab, d: { link: string; caption: string; note: string }, file?: File | null) {
	let file_path: string | null = null;
	if (file) {
		if (file.size > DRAFT_MAX_MB * 1024 * 1024) {
			toast(`That file is over ${DRAFT_MAX_MB} MB. Share a Google Drive link instead.`, 'alert');
			return false;
		}
		const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
		file_path = `${c.id}/${crypto.randomUUID()}.${ext}`;
		const up = await supabase.storage.from('drafts').upload(file_path, file, { contentType: file.type || undefined, upsert: false });
		if (up.error) {
			toast(`Couldn't upload the file: ${errMessage(up.error)}`, 'alert');
			return false;
		}
	}
	const { error } = await supabase.from('drafts').insert({ collab_id: c.id, ...d, file_path, file_type: file?.type ?? '' });
	if (error) {
		toast(`Couldn't share the draft: ${errMessage(error)}`, 'alert');
		return false;
	}
	await reloadOne(c.id);
	toast(`Draft sent to ${c.brand.name} for approval`, 'send');
	return true;
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
	toast(issue ? `Invoice ${data?.number} sent to ${c.brand.name}` : 'Invoice saved as draft', issue ? 'send' : 'check');
	return true;
}

export async function recordPayment(inv: Invoice, p: { amount: number; tds: number; date: string; ref: string }, quiet = false) {
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
	if (!quiet) {
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
		supabase.from('ig_account').select('*').eq('id', 1).single(),
		supabase.from('ig_media').select('*').order('posted_at', { ascending: false }).limit(40),
		supabase.from('ig_followers_history').select('*').order('day', { ascending: false }).limit(60)
	]);
	if (acct.error && isNetworkError(acct.error)) return;
	studio.ig = (acct.data as IgAccount) ?? null;
	studio.media = (media.data as IgMedia[]) ?? [];
	studio.followersHistory = ((hist.data as { day: string; followers: number }[]) ?? []).reverse();
	keepCopy();
}

async function invokeFn(name: string, body: Record<string, unknown>) {
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
		await supabase.from('deliverables').update({ done: true }).eq('collab_id', c.id);
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
