<script lang="ts">
	import { ask } from '../confirm.svelte';
	import type { Collab } from '../types';
	import { reloadCollabs } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage, fmt } from '../util';
	import Icon from './Icon.svelte';

	// Files for the brand (raw footage, final edits, photos), sent as one no-sign-in download link.
	let { c }: { c: Collab } = $props();
	const MAX_MB = 50;
	let link = $state('');
	let label = $state('');
	let busy = $state(false);
	let input = $state<HTMLInputElement>();
	const files = $derived(c.files ?? []);
	const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b ? `${Math.max(1, Math.round(b / 1024))} KB` : 'link');

	async function upload(list: FileList | null) {
		const all = [...(list ?? [])];
		const big = all.filter((f) => f.size > MAX_MB * 1048576);
		if (big.length) toast(`${big.map((f) => f.name).join(', ')} ${big.length > 1 ? 'are' : 'is'} over ${MAX_MB} MB. Add a Drive link instead.`, 'alert');
		busy = true;
		for (const f of all.filter((x) => x.size <= MAX_MB * 1048576)) {
			const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
			const path = `${c.id}/${crypto.randomUUID()}.${ext}`;
			const up = await supabase.storage.from('deliveries').upload(path, f, { contentType: f.type || undefined });
			if (up.error) {
				toast(`Couldn't upload ${f.name}: ${errMessage(up.error)}`, 'alert');
				continue;
			}
			await supabase.from('collab_files').insert({ collab_id: c.id, label: f.name.slice(0, 120), file_path: path, file_type: f.type, size_bytes: f.size });
		}
		busy = false;
		if (input) input.value = '';
		reloadCollabs();
	}
	async function addLink(e: SubmitEvent) {
		e.preventDefault();
		const u = link.trim();
		if (!/^https?:\/\//i.test(u)) return toast('Paste the full link, starting with https://', 'alert');
		const { error } = await supabase.from('collab_files').insert({ collab_id: c.id, label: (label.trim() || u.replace(/^https?:\/\//, '').slice(0, 60)).slice(0, 120), url: u });
		if (error) return toast(`Couldn't save: ${errMessage(error)}`, 'alert');
		link = label = '';
		reloadCollabs();
	}
	async function remove(f: NonNullable<Collab['files']>[number]) {
		if (!(await ask({ title: `Remove “${f.label}”?`, body: 'The brand can no longer download it.', ok: 'Remove', danger: true }))) return;
		await supabase.from('collab_files').delete().eq('id', f.id);
		if (f.file_path) await supabase.storage.from('deliveries').remove([f.file_path]);
		reloadCollabs();
	}
	async function send() {
		if (!(await ask({ title: `Send ${files.length} file${files.length > 1 ? 's' : ''} to ${c.contact_name || c.brand.name}?`, body: `They get an email with one download link (no sign-in, works for 90 days).`, ok: 'Send' }))) return;
		const { error } = await supabase.rpc('send_files', { p_collab: c.id });
		if (error) return toast(errMessage(error), 'alert');
		toast('Files sent to the brand', 'send');
		reloadCollabs();
	}
</script>

<section class="sec">
	<h3>Files for the brand {#if c.files_sent_at}<span>sent {fmt(c.files_sent_at.slice(0, 10))}</span>{/if}</h3>
	{#each files as f (f.id)}
		<div class="exp-row">
			<Icon name={f.file_path ? 'film' : 'link'} />
			<span class="exp-l">{f.label}<small>{' · '}{size(f.size_bytes)}{f.downloaded_at ? ` · downloaded ${fmt(f.downloaded_at.slice(0, 10))}` : ''}</small></span>
			<button class="shot-x" style="opacity:1" aria-label="Remove {f.label}" onclick={() => remove(f)}><Icon name="x" /></button>
		</div>
	{/each}
	<div class="files-add">
		<label class="btn sm" class:disabled={busy}>
			{#if busy}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Upload files
			<input bind:this={input} type="file" multiple hidden disabled={busy} onchange={(e) => upload((e.currentTarget as HTMLInputElement).files)} />
		</label>
		<span class="hint">up to {MAX_MB} MB each, or add a link:</span>
	</div>
	<form class="exp-add" onsubmit={addLink}>
		<input class="inp" placeholder="https://drive.google.com/…" aria-label="Link to the files" bind:value={link} />
		<input class="inp" placeholder="Name (e.g. Raw footage)" aria-label="Name for the link" bind:value={label} style="max-width:200px" />
		<button class="btn sm" type="submit" disabled={!link.trim()}><Icon name="link" />Add link</button>
	</form>
	{#if files.length}
		<button class="btn sm primary" style="margin-top:10px" disabled={!c.contact_email} title={c.contact_email ? '' : 'Add the brand contact’s email first'} onclick={send}><Icon name="send" />{c.files_sent_at ? 'Send again' : 'Send to brand'}</button>
	{/if}
</section>
