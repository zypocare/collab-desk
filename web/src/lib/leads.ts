import { supabase } from './supabase';
import { studio } from './studio.svelte';
import { toast, ui } from './ui.svelte';

/** "Add": a possible collab from Instagram goes into Add a collab, where its chat is read and filled in. */
export async function addLeadAsCollab(igsid: string, username: string, name = '') {
	const { data, error } = await supabase.from('ig_dms').select('from_me, text').eq('igsid', igsid).order('created_at', { ascending: false }).limit(15);
	if (error) return toast(error.message, 'alert');
	const me = studio.settings?.display_name || 'Me';
	ui.pasteText = (data ?? []).reverse().map((m) => `${m.from_me ? me : username || 'Brand'}: ${m.text}`).join('\n');
	ui.fromIg = igsid;
	ui.fromIgUser = username;
	ui.fromIgName = name;
	ui.newCollab = true;
}

/** The brand's latest words in each of these chats (only chats already flagged as possible collabs). */
export async function lastBrandLines(igsids: string[]): Promise<Record<string, string>> {
	if (!igsids.length) return {};
	const { data } = await supabase.from('ig_dms').select('igsid, text, from_me, created_at').in('igsid', igsids).eq('from_me', false).order('created_at', { ascending: false }).limit(40);
	const out: Record<string, string> = {};
	for (const m of data ?? []) if (!out[m.igsid] && String(m.text ?? '').trim()) out[m.igsid] = String(m.text).trim();
	return out;
}
