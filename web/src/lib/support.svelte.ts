// Support: tickets to the people who run Miracle, when the help centre doesn't solve it. The same for
// creators (and their team) and brands; the Miracle team answers in the admin panel.
import { supportDevice } from './problems';
import { supabase } from './supabase';
import { errMessage } from './util';

export type SupportFile = { path: string; name: string; type: string; size: number };
export type SupportMessage = { id: number; from_team: boolean; internal: boolean; author: string; body: string; files: SupportFile[]; created_at: string };
export type TicketStatus = 'open' | 'waiting' | 'solved';
export type Ticket = {
	id: string;
	number: number;
	subject: string;
	category: string;
	status: TicketStatus;
	priority: 'normal' | 'urgent';
	user_unread: boolean;
	rating: number | null;
	created_at: string;
	updated_at: string;
	messages: SupportMessage[];
};
export type TicketRow = { id: string; number: number; subject: string; category: string; status: TicketStatus; user_unread: boolean; created_at: string; updated_at: string; last: { body: string; from_team: boolean; at: string } | null };

export const TOPICS: { id: string; label: string; icon: string; side?: 'creator' | 'brand' }[] = [
	{ id: 'collabs', label: 'Requests & collabs', icon: 'board', side: 'creator' },
	{ id: 'brand', label: 'Booking creators', icon: 'users', side: 'brand' },
	{ id: 'money', label: 'Invoices & payments', icon: 'wallet' },
	{ id: 'instagram', label: 'Instagram', icon: 'image', side: 'creator' },
	{ id: 'account', label: 'Sign-in & account', icon: 'shield' },
	{ id: 'bug', label: 'Something broke', icon: 'alert' },
	{ id: 'idea', label: 'An idea', icon: 'spark' },
	{ id: 'other', label: 'Something else', icon: 'info' }
];
export const topicLabel = (id: string) => TOPICS.find((t) => t.id === id)?.label ?? 'Something else';
export const STATUS: Record<TicketStatus, { label: string; tone: 'warn' | 'hot' | 'ok' }> = {
	open: { label: 'With Miracle support', tone: 'warn' },
	waiting: { label: 'Replied: your turn', tone: 'hot' },
	solved: { label: 'Solved', tone: 'ok' }
};

export const support = $state<{ list: TicketRow[]; loaded: boolean; unread: number }>({ list: [], loaded: false, unread: 0 });

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
	const { data, error } = await supabase.rpc(fn, args);
	if (error) throw new Error(errMessage(error).replace(/^LIMIT:[^:]+:/, ''));
	return data as T;
}

export async function loadTickets() {
	support.list = (await call<TicketRow[] | null>('support_mine')) ?? [];
	support.loaded = true;
	support.unread = support.list.filter((t) => t.user_unread).length;
}
export async function refreshSupportUnread() {
	const { data } = await supabase.rpc('support_unread');
	if (typeof data === 'number') support.unread = data;
}
export const getTicket = (id: string) => call<Ticket | null>('support_ticket', { p_id: id });
export const replyTicket = (id: string, body: string, files: SupportFile[] = []) => call<Ticket>('support_reply', { p_id: id, p_body: body, p_files: files });
export const solveTicket = (id: string, rating: number | null = null, note = '') => call<Ticket>('support_solved', { p_id: id, p_rating: rating, p_note: note });
export function createTicket(p: { category: string; subject: string; body: string; name: string; files: SupportFile[]; tried?: Record<string, unknown> }) {
	return call<Ticket>('support_create', { p: { ...p, device: supportDevice(), tried: p.tried ?? {} } });
}

/** Screenshots (or a short screen recording, or a PDF) into this login's own folder. */
export async function uploadSupportFiles(files: File[]): Promise<SupportFile[]> {
	const { data } = await supabase.auth.getUser();
	const uid = data.user?.id;
	if (!uid) throw new Error('Sign in again to add files.');
	const out: SupportFile[] = [];
	for (const f of files.slice(0, 4)) {
		if (f.size > 10 * 1024 * 1024) throw new Error(`${f.name} is over 10 MB.`);
		const safe = f.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80) || 'file';
		const path = `${uid}/${Date.now().toString(36)}-${safe}`;
		const { error } = await supabase.storage.from('support').upload(path, f, { contentType: f.type || undefined, upsert: false });
		if (error) throw new Error(`Couldn't add ${f.name}: ${error.message}`);
		out.push({ path, name: f.name.slice(0, 120), type: f.type, size: f.size });
	}
	return out;
}
export async function fileUrl(path: string) {
	const { data } = await supabase.storage.from('support').createSignedUrl(path, 3600);
	return data?.signedUrl ?? '';
}
