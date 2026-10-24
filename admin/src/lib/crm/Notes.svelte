<script lang="ts">
	import { ago, when } from '../format.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { toast } from '../ui.svelte.ts';
	import { change } from './lists.ts';

	export type Note = { id: number; body: string; admin: string; at: string };
	export type AuditRow = { at: string; admin: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; reason: string };

	// Notes only admins see, and every admin action on this record. Both come with each record page.
	let { kind, record, notes, audit, onsaved }: { kind: string; record: string; notes: Note[]; audit: AuditRow[]; onsaved: (x: { notes: Note[]; audit: AuditRow[] }) => void } = $props();
	let body = $state('');
	let busy = $state(false);

	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (!body.trim()) return;
		busy = true;
		const { data, error } = await supabase.rpc('admin_note_add', { p_kind: kind, p_record: record, p_body: body.trim() });
		busy = false;
		if (error) return toast(errMessage(error), true);
		body = '';
		onsaved(data as { notes: Note[]; audit: AuditRow[] });
		toast('Note saved');
	}
</script>

<section class="card">
	<div class="card-h"><h2 class="card-t">Admin notes</h2><span class="muted sm">Only admins see these</span></div>
	<form class="nf" onsubmit={add}>
		<label class="sr" for="note-{record}">New note</label>
		<textarea id="note-{record}" class="inp" rows="2" placeholder="Write a note for the team…" bind:value={body}></textarea>
		<button class="btn sm" disabled={busy || !body.trim()}>{busy ? 'Saving…' : 'Add note'}</button>
	</form>
	{#each notes as n (n.id)}
		<div class="note"><p>{n.body}</p><small class="muted">{n.admin} · {ago(n.at)}</small></div>
	{/each}
</section>

<section class="card">
	<div class="card-h"><h2 class="card-t">Admin log</h2><span class="muted sm">{audit.length}</span></div>
	{#if !audit.length}
		<div class="card-empty">No admin has changed anything here.</div>
	{:else}
		<ol class="al">
			{#each audit as a, i (i)}
				<li>
					<span class="mono muted">{when(a.at)}</span>
					<span><b>{a.action.replace(/_/g, ' ')}</b> <span class="muted">by {a.admin}</span>{#if a.before || a.after}<br /><span class="mono ch">{change(a.before, a.after)}</span>{/if}{#if a.reason}<br /><span class="muted">“{a.reason}”</span>{/if}</span>
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.sm { font-size: 12px; }
	.nf { display: grid; gap: 8px; padding: 12px 16px; justify-items: end; }
	.nf textarea { width: 100%; }
	.note { padding: 10px 16px; border-top: 1px solid var(--line-soft); display: grid; gap: 4px; font-size: 13px; }
	.note p { white-space: pre-wrap; overflow-wrap: anywhere; }
	.note small { font-size: 12px; }
	.al { list-style: none; margin: 0; padding: 4px 16px 12px; }
	.al li { display: grid; grid-template-columns: 96px 1fr; gap: 10px; padding: 7px 0; font-size: 12.5px; border-bottom: 1px solid var(--line-soft); }
	.al li:last-child { border-bottom: 0; }
	.al b { font-weight: 500; text-transform: capitalize; }
	.ch { font-size: 11.5px; color: var(--ink-2); overflow-wrap: anywhere; }
</style>
