// The brand's Business section: money, content, calendar, shipping and the team, across every creator.
import { supabase } from './supabase';
import { errMessage } from './util';

export type MoneyInvoice = {
	number: string;
	kind: string;
	code: string;
	creator: string;
	slug: string;
	total: number;
	payable: number;
	due: number;
	gst: number;
	tds: number;
	currency: string;
	issue_date: string;
	due_date: string | null;
	status: 'sent' | 'partly_paid' | 'paid';
	paid_on: string | null;
	token: string;
	claimed: boolean;
	claim_ref: string | null;
};
export type Money = {
	invoices: MoneyInvoice[];
	to_pay: number;
	to_pay_count: number;
	overdue: number;
	paid_month: number;
	paid_month_creators: number;
	gst_fy: number;
	tds_fy: number;
};
export type ContentItem = {
	collab_id: string;
	code: string;
	slug: string;
	creator: string;
	usage: string;
	usage_ends: string | null;
	usage_ext_status: string | null;
	files: number;
	posts: { permalink: string; thumb: string | null; type: string; product: string | null; posted_at: string; views: number | null; likes: number | null }[];
};
export type CalEvent = { date: string; kind: 'live' | 'draft' | 'shoot'; code: string; slug: string; creator: string; creator_id: number };
export type Shipment = {
	collab_id: string;
	code: string;
	slug: string;
	creator: string;
	product: string;
	address_ready: boolean;
	name: string | null;
	address: string | null;
	phone: string | null;
	carrier: string | null;
	tracking: string | null;
	shipped_at: string | null;
	received_at: string | null;
};
export type TeamRole = 'admin' | 'approver' | 'finance' | 'member';
export type Team = {
	role: TeamRole;
	owner: { email: string; name: string | null; you: boolean };
	approval_on: boolean;
	approval_limit: number;
	members: { email: string; name: string; role: TeamRole; joined: boolean; you: boolean }[];
	approvals: { id: string; total: number; code: string; slug: string; creator: string; by: string | null; at: string; campaign: string | null }[];
};

export async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
	const { data, error } = await supabase.rpc(fn, args);
	if (error) throw new Error(errMessage(error));
	return data as T;
}

export const team = $state<{ data: Team | null }>({ data: null });
export async function loadTeam() {
	team.data = await call<Team>('team_get');
}

export const ROLE_LABEL: Record<TeamRole, string> = { admin: 'Admin', approver: 'Approver', finance: 'Finance', member: 'Member' };
export const ROLE_NOTE: Record<TeamRole, string> = {
	admin: 'everything, including the team',
	approver: 'accepts quotes above the limit',
	finance: 'Money and invoices',
	member: 'campaigns and requests, within the limit'
};

/** Join the teams this email was invited to (once per visit; cheap when there are none). True when it
 * joined one just now, so the screens can reload with that team's companies. */
let joined = false;
export async function joinTeam() {
	if (joined) return false;
	joined = true;
	const { data } = await supabase.rpc('team_join');
	return ((data as { joined?: number } | null)?.joined ?? 0) > 0;
}
