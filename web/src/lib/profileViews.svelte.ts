// Who viewed your profile (migration 190): how many brands opened her full profile, this week and the week
// before. Counts only, free for every creator. Loaded once per visit.
import { supabase } from './supabase';

export const views = $state<{ week: number; month: number; before: number; loaded: boolean }>({ week: 0, month: 0, before: 0, loaded: false });
let asked = false;
export async function loadViews() {
	if (asked) return;
	asked = true;
	const { data } = await supabase.rpc('my_profile_views');
	const v = data as { week?: number; month?: number; before?: number } | null;
	views.week = Number(v?.week ?? 0);
	views.month = Number(v?.month ?? 0);
	views.before = Number(v?.before ?? 0);
	views.loaded = true;
}
