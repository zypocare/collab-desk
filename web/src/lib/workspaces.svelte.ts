// Client workspaces (migration 147): the brand teams this login works for, e.g. an agency's staff with one
// team per client. Everything on the brand side shows the team picked here; the list doubles as the
// across-clients view (open requests, things waiting, approvals and money due in each).
import { supabase } from './supabase';
import { errMessage } from './util';

export type Workspace = {
	owner: string;
	name: string;
	current: boolean;
	own: boolean;
	role: 'admin' | 'approver' | 'finance' | 'member' | null;
	companies: number;
	open: number;
	waiting: number;
	approvals: number;
	to_pay: number;
};

export const workspaces = $state<{ list: Workspace[]; loaded: boolean }>({ list: [], loaded: false });

export async function loadWorkspaces() {
	const { data, error } = await supabase.rpc('brand_workspaces');
	if (error) throw new Error(errMessage(error));
	workspaces.list = (data as Workspace[]) ?? [];
	workspaces.loaded = true;
}

/** Work in another client's team. Every screen's data is that team's, so the app starts afresh. */
export async function useWorkspace(owner: string) {
	const { error } = await supabase.rpc('brand_use_workspace', { p_owner: owner });
	if (error) throw new Error(errMessage(error));
	location.reload();
}
