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

/** The brand's latest message in each of these chats (only chats already flagged as possible collabs).
 * One look per chat, so a busy chat never pushes out another chat's newest line; a photo, video or
 * voice note with no words says so instead of falling back to an older message. */
export async function lastBrandLines(igsids: string[]): Promise<Record<string, string>> {
	if (!igsids.length) return {};
	const rows = await Promise.all(
		igsids.map((id) => supabase.from('ig_dms').select('igsid, text, attachments').eq('igsid', id).eq('from_me', false).order('created_at', { ascending: false }).limit(1).maybeSingle())
	);
	const out: Record<string, string> = {};
	for (const { data: m } of rows) {
		if (!m) continue;
		const text = String(m.text ?? '').trim();
		const kinds = ((m.attachments as { type?: string }[] | null) ?? []).map((a) => String(a?.type ?? ''));
		out[m.igsid] = text || (kinds.some((k) => k.includes('video')) ? 'Sent a video' : kinds.some((k) => k.includes('audio')) ? 'Sent a voice note' : kinds.length ? 'Sent a photo or file' : '');
		if (!out[m.igsid]) delete out[m.igsid];
	}
	return out;
}
