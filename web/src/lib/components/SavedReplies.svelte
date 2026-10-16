<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { PLACEHOLDERS, STARTER_REPLIES, type SavedReply } from '../savedReplies';
	import { saveSettings, studio } from '../studio.svelte';
	import Icon from './Icon.svelte';

	// Her own replies, offered in every message thread with the brand's details filled in.
	const s = $derived(studio.settings!);
	const list = $derived((s.saved_replies ?? []) as SavedReply[]);
	const save = (next: SavedReply[]) => saveSettings({ saved_replies: next });
	const id = () => Math.random().toString(36).slice(2, 10);

	function set(r: SavedReply, patch: Partial<SavedReply>) {
		save(list.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
	}
	async function remove(r: SavedReply) {
		if (await ask({ title: `Delete “${r.title || 'this reply'}”?`, ok: 'Delete', danger: true })) save(list.filter((x) => x.id !== r.id));
	}
</script>

<section class="panel rv" style="--i:3">
	<div class="panel-h"><h2>Saved replies</h2><small>one tap in any message thread</small></div>
	<div class="form-b" style="display:block">
		<p class="hint" style="margin:0 0 10px">These words fill in for each collab: {#each PLACEHOLDERS as p (p.key)}<code class="ph-code" title={p.label}>{p.key}</code> {/each}</p>
		{#each list as r (r.id)}
			<div class="sr-item">
				<div class="sr-top">
					<input class="inp" aria-label="Reply title" placeholder="Title" value={r.title} onchange={(e) => set(r, { title: (e.currentTarget as HTMLInputElement).value.trim().slice(0, 40) })} />
					<button class="icon-btn sm" aria-label="Delete {r.title}" onclick={() => remove(r)}><Icon name="x" /></button>
				</div>
				<textarea class="inp" rows="3" aria-label="Reply text" value={r.body} onchange={(e) => set(r, { body: (e.currentTarget as HTMLTextAreaElement).value.slice(0, 2000) })}></textarea>
			</div>
		{/each}
		<div class="row-btns" style="border:0;padding:4px 0 0">
			<button class="btn sm" onclick={() => save([...list, { id: id(), title: 'New reply', body: 'Hi {name}, \n{me}' }])}><Icon name="plus" />Add a reply</button>
			{#if !list.length}<button class="btn sm grad" onclick={() => save(STARTER_REPLIES.map((x) => ({ ...x, id: id() })))}><Icon name="spark" />Add starter replies</button>{/if}
		</div>
	</div>
</section>
