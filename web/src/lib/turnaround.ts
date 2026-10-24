// Turnaround (migration 150): a clock on every handoff, who owns it, and how fast the team turns things round.
import { supabase } from './supabase';
import { errMessage } from './util';

export type Person = { id: string; name: string; email: string; role?: string } | null;
export type Stage = 'quote_decision' | 'approval' | 'draft_review' | 'message_reply' | 'payment' | 'quote_reply' | 'draft_revision';
export type OpenClock = {
	clock: string;
	stage: Stage;
	side: 'brand' | 'creator';
	started_at: string;
	due_at: string | null;
	hours_left: number | null;
	overdue: boolean;
	paused: boolean;
	collab: string;
	code: string;
	creator: string;
	company: string;
	owner: Person;
	backup: Person;
	alerted: number | null;
};
export type StageStat = { stage: Stage; side: 'brand' | 'creator'; done: number; median: number | null; p90: number | null; on_time: number | null; median_before: number | null; done_before: number; open: number; overdue: number };
export type PersonStat = { person: Person; done: number; median: number | null; on_time: number | null; open: number; overdue: number };
export type Tat = {
	from: string;
	to: string;
	settings: { hours: Record<string, number>; skip_sundays: boolean; escalate: boolean; backup: Person };
	can_edit: boolean;
	open: OpenClock[];
	stages: StageStat[];
	people: PersonStat[];
	team: NonNullable<Person>[];
	owners: Record<string, { assignee: string | null; backup: string | null }>;
};

export const STAGE: Record<Stage, { label: string; who: string }> = {
	quote_decision: { label: 'Deciding on a quote', who: 'your team' },
	approval: { label: 'Approving a quote', who: 'an approver' },
	draft_review: { label: 'Reviewing a draft', who: 'your team' },
	message_reply: { label: 'Replying to a creator', who: 'your team' },
	payment: { label: 'Paying an invoice', who: 'finance' },
	quote_reply: { label: 'First quote after a request', who: 'the creator' },
	draft_revision: { label: 'Revised draft after changes', who: 'the creator' }
};
/** The handoffs whose hours a team can set (payment follows each invoice's due date). */
export const TARGETS: Stage[] = ['quote_decision', 'approval', 'draft_review', 'message_reply', 'quote_reply', 'draft_revision'];

/** Hours as people say them: "5h", "2.5 days". */
export const hrs = (h: number | null | undefined) => (h == null ? '—' : Math.abs(h) < 48 ? `${Math.round(Math.abs(h) * 10) / 10}h` : `${Math.round((Math.abs(h) / 24) * 10) / 10} days`);

export async function loadTat(from?: string, to?: string) {
	const { data, error } = await supabase.rpc('brand_tat', from && to ? { p_from: from, p_to: to } : {});
	if (error) throw new Error(errMessage(error));
	return data as Tat;
}
export async function assignTat(collab: string, assignee: string | null, backup: string | null) {
	const { data, error } = await supabase.rpc('brand_tat_assign', { p_collab: collab, p_assignee: assignee, p_backup: backup });
	if (error) throw new Error(errMessage(error));
	return data as Tat;
}
export async function saveTat(p: { hours?: Record<string, number>; skip_sundays?: boolean; escalate?: boolean; backup?: string | null }) {
	const { data, error } = await supabase.rpc('brand_tat_save', { p: { ...p, ...(p.backup !== undefined ? { backup: p.backup ?? '' } : {}) } });
	if (error) throw new Error(errMessage(error));
	return data as Tat;
}
