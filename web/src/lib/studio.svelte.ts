// The creator's data: loads everything once, keeps it live with realtime, and saves edits.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { BankAlert, Brand, BrandPrivate, BrandReport, Checklist, Collab, Deliverable, IgAccount, IgMedia, Quote, Settings, Stage } from './types';
import { balanceDue, normaliseInvoice, type Invoice, type InvoiceItem } from './invoice';
import { confetti, toast } from './ui.svelte';
import { errMessage, inr, stageLabel, todayIso } from './util';

export const studio = $state<{
	loaded: boolean;
	error: string;
	collabs: Collab[];
	brands: Brand[];
	notes: Record<string, BrandPrivate>;
	settings: Settings | null;
	alerts: BankAlert[];
	ig: IgAccount | null;
	media: IgMedia[];
	followersHistory: { day: string; followers: number }[];
}>({ loaded: false, error: '', collabs: [], brands: [], notes: {}, settings: null, alerts: [], ig: null, media: [], followersHistory: [] });

const COLLAB_SELECT = '*, brand:brands(*), deliverables(*), events:collab_events(*), quotes(*), drafts(*), invoices(*), posts:collab_posts(matched_by, media:ig_media(*)), reports:brand_reports(*)';

function normalise(c: Collab): Collab {
	c.fee = Number(c.fee) || 0;
	c.product_value = Number(c.product_value) || 0;
	c.pay_received = Number(c.pay_received) || 0;
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
	return c;
}

export async function loadStudio() {
	const [collabs, brands, notes, settings] = await Promise.all([
		supabase.from('collabs').select(COLLAB_SELECT).order('received_on', { ascending: false }),
		supabase.from('brands').select('*').order('name'),
		supabase.from('brand_private').select('*'),
		supabase.from('creator_settings').select('*').eq('id', 1).single()
	]);
	loadAlerts();
	loadInstagram();
	const err = collabs.error || brands.error || notes.error || settings.error;
	if (err) {
		studio.error = errMessage(err);
		return;
	}
	studio.collabs = (collabs.data as Collab[]).map(normalise);
	studio.brands = brands.data as Brand[];
	studio.notes = Object.fromEntries((notes.data as BrandPrivate[]).map((n) => [n.brand_id, n]));
	studio.settings = settings.data as Settings;
	studio.loaded = true;
	studio.error = '';
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

async function reloadCollabs() {
	const { data, error } = await supabase.from('collabs').select(COLLAB_SELECT).order('received_on', { ascending: false });
	if (!error && data) studio.collabs = (data as Collab[]).map(normalise);
	const b = await supabase.from('brands').select('*').order('name');
	if (!b.error && b.data) studio.brands = b.data as Brand[];
}

async function reloadOne(id: string) {
	const { data, error } = await supabase.from('collabs').select(COLLAB_SELECT).eq('id', id).single();
	if (error || !data) return;
	const fresh = normalise(data as Collab);
	const i = studio.collabs.findIndex((c) => c.id === id);
	if (i >= 0) studio.collabs[i] = fresh;
	else studio.collabs.unshift(fresh);
}

export const byId = (id: string | null | undefined) => studio.collabs.find((c) => c.id === id);
export const byCode = (code: string) => studio.collabs.find((c) => c.code.toUpperCase() === code.toUpperCase());

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

export async function setStage(c: Collab, stage: Stage) {
	if (c.stage === stage) return;
	const patch: CollabPatch = { stage };
	if (stage === 'live' && !c.live_date) patch.live_date = todayIso();
	await updateCollab(c.id, patch);
	if (stage === 'live' && c.deliverables.some((d) => !d.done)) {
		await supabase.from('deliverables').update({ done: true }).eq('collab_id', c.id);
		await reloadOne(c.id);
	}
	if (stage === 'live' || stage === 'wrapped') confetti();
	toast(`${c.brand.name} moved to ${stageLabel(stage)}`, 'layers');
}

export async function markPaid(c: Collab) {
	const open = c.invoices.filter((i) => i.status === 'sent' || i.status === 'partly_paid');
	if (open.length) {
		// With invoices, "paid in full" means every open invoice was paid (TDS deducted as expected).
		for (const i of open) await recordPayment(i, { amount: balanceDue(i), tds: i.tds_amount, date: todayIso(), ref: '' }, true);
	} else {
		await updateCollab(c.id, { pay_status: 'paid', pay_received: c.fee, paid_on: todayIso(), ...(c.stage === 'live' ? { stage: 'wrapped' as Stage } : {}) });
	}
	confetti();
	toast(`${inr(c.fee)} from ${c.brand.name} marked as paid`, 'wallet');
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
export async function createCollab(brandName: string): Promise<Collab | null> {
	const name = brandName.trim();
	if (!name) return null;
	let brand = studio.brands.find((b) => b.name.toLowerCase() === name.toLowerCase());
	if (!brand) {
		const { data, error } = await supabase.from('brands').insert({ name }).select('*').single();
		if (error) {
			toast(`Couldn't add brand: ${errMessage(error)}`, 'alert');
			return null;
		}
		brand = data as Brand;
		studio.brands.push(brand);
	}
	const { data, error } = await supabase
		.from('collabs')
		.insert({ brand_id: brand.id, source: 'manual', code: '' })
		.select('id')
		.single();
	if (error || !data) {
		toast(`Couldn't add collab: ${errMessage(error)}`, 'alert');
		return null;
	}
	await supabase.from('deliverables').insert({ collab_id: data.id, kind: 'Reel', qty: 1 });
	await supabase.from('collab_events').insert({ collab_id: data.id, kind: 'note', text: 'Added manually (DM, email or call)' });
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
	'items' | 'usage' | 'usage_fee' | 'discount' | 'advance_pct' | 'pay_days' | 'revision_rounds' | 'exclusivity_days' | 'valid_until' | 'notes'
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

export async function shareDraft(c: Collab, d: { link: string; caption: string; note: string }) {
	const { error } = await supabase.from('drafts').insert({ collab_id: c.id, ...d });
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
	const { data } = await supabase.from('bank_alerts').select('*').order('created_at', { ascending: false }).limit(50);
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
	studio.ig = (acct.data as IgAccount) ?? null;
	studio.media = (media.data as IgMedia[]) ?? [];
	studio.followersHistory = ((hist.data as { day: string; followers: number }[]) ?? []).reverse();
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
