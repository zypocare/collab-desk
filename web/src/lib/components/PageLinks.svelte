<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// Links on her page for her followers (YouTube, her shop, a latest video, a WhatsApp channel): what
	// Linktree and Beacons are for, on the page she already shares. Each shows how often it was tapped.
	type Link = { id: string; title: string; url: string; position: number; active: boolean; clicks: number };
	const MAX = 20;
	let links = $state<Link[]>([]);
	let loaded = $state(false);
	let title = $state('');
	let url = $state('');
	let busy = $state(false);

	async function load() {
		const { data, error } = await supabase.from('page_links').select('id, title, url, position, active, clicks').order('position').order('created_at');
		if (error) return toast(errMessage(error), 'alert');
		links = (data as Link[]) ?? [];
		loaded = true;
	}
	onMount(load);

	/** "youtube.com/@me" → "https://youtube.com/@me"; anything that still isn't a web address is refused. */
	function fullUrl(v: string) {
		const t = v.trim();
		const u = /^https?:\/\//i.test(t) ? t : `https://${t}`;
		try {
			const p = new URL(u);
			return p.hostname.includes('.') && !/\s/.test(u) ? u : '';
		} catch {
			return '';
		}
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const u = fullUrl(url);
		if (!title.trim()) return toast('Give the link a name, like "My YouTube".', 'alert');
		if (!u) return toast("That doesn't look like a web address.", 'alert');
		if (links.length >= MAX) return toast(`Up to ${MAX} links.`, 'alert');
		busy = true;
		const { error } = await supabase.from('page_links').insert({ title: title.trim().slice(0, 60), url: u, position: (links.at(-1)?.position ?? 0) + 1 });
		busy = false;
		if (error) return toast(errMessage(error), 'alert');
		title = '';
		url = '';
		await load();
		toast('Added to your page', 'check');
	}

	async function save(l: Link, patch: Partial<Link>) {
		if (patch.url !== undefined) {
			const u = fullUrl(patch.url);
			if (!u) return toast("That doesn't look like a web address.", 'alert');
			patch.url = u;
		}
		if (patch.title !== undefined && !patch.title.trim()) return toast('A link needs a name.', 'alert');
		Object.assign(l, patch);
		const { error } = await supabase.from('page_links').update(patch).eq('id', l.id);
		if (error) toast(errMessage(error), 'alert');
	}

	async function remove(l: Link) {
		const { error } = await supabase.from('page_links').delete().eq('id', l.id);
		if (error) return toast(errMessage(error), 'alert');
		links = links.filter((x) => x.id !== l.id);
	}

	/** Swap with the one above or below, and save both positions. */
	async function move(i: number, by: -1 | 1) {
		const j = i + by;
		if (j < 0 || j >= links.length) return;
		const next = [...links];
		[next[i], next[j]] = [next[j], next[i]];
		links = next.map((l, k) => ({ ...l, position: k }));
		const res = await Promise.all([links[i], links[j]].map((l) => supabase.from('page_links').update({ position: l.position }).eq('id', l.id)));
		if (res.some((r) => r.error)) toast("Couldn't save the order. Try again.", 'alert');
	}
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
</script>

<section class="panel rv" style="--i:1" id="links">
	<div class="panel-h"><h2>Links on your page</h2><small>for your followers: YouTube, your shop, a latest video</small></div>
	<div class="pl">
		{#if loaded && links.length}
			<ul class="pl-list">
				{#each links as l, i (l.id)}
					<li class:off={!l.active}>
						<div class="pl-move">
							<button class="icon-btn" aria-label="Move up" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="chevU" /></button>
							<button class="icon-btn" aria-label="Move down" disabled={i === links.length - 1} onclick={() => move(i, 1)}><Icon name="chevD" /></button>
						</div>
						<div class="pl-fields">
							<input class="inp" aria-label="Link name" value={l.title} maxlength="60" onchange={(e) => save(l, { title: val(e).trim() })} />
							<input class="inp sm" aria-label="Web address" inputmode="url" value={l.url} maxlength="500" onchange={(e) => save(l, { url: val(e) })} />
							<small class="hint">{l.clicks} tap{l.clicks === 1 ? '' : 's'}</small>
						</div>
						<input type="checkbox" class="tgl" checked={l.active} aria-label="Show on your page" onchange={(e) => save(l, { active: (e.currentTarget as HTMLInputElement).checked })} />
						<button class="icon-btn" aria-label="Remove link" onclick={() => remove(l)}><Icon name="x" /></button>
					</li>
				{/each}
			</ul>
		{:else if loaded}
			<p class="hint">No links yet. They show under your name on your page, for followers who come from your bio.</p>
		{/if}
		<form class="pl-add" onsubmit={add}>
			<input class="inp" aria-label="New link's name" placeholder="Name, e.g. My YouTube" maxlength="60" bind:value={title} />
			<input class="inp" aria-label="New link's web address" inputmode="url" placeholder="youtube.com/@you" maxlength="500" bind:value={url} />
			<button class="btn" disabled={busy || links.length >= MAX}><Icon name="plus" />Add link</button>
		</form>
	</div>
</section>

<style>
	.pl {
		display: grid;
		gap: 14px;
		padding: 0 18px 18px;
	}
	.pl-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.pl-list li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 10px;
		padding: 10px;
		border-radius: 14px;
		background: var(--surface-2);
	}
	.pl-list li.off .pl-fields {
		opacity: 0.55;
	}
	.pl-move {
		display: grid;
		gap: 2px;
	}
	.pl-move .icon-btn {
		width: 28px;
		height: 24px;
	}
	.pl-fields {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.pl-add {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) auto;
		gap: 8px;
	}
	@media (max-width: 640px) {
		.pl-add {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
