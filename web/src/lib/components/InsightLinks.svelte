<script lang="ts">
	import { onMount } from 'svelte';
	import { ask } from '../confirm.svelte';
	import { SECTIONS, type SectionKey } from '../insights';
	import { studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage, fmtUpdated } from '../util';
	import Icon from './Icon.svelte';

	// A link per brand: you see when they open it (and get a phone alert), and choose what it shows.
	type Link = { token: string; label: string; hide: SectionKey[]; active: boolean; views: number; last_viewed_at: string | null; created_at: string };
	let links = $state<Link[]>([]);
	let label = $state('');
	let hide = $state(new Set<SectionKey>());
	let busy = $state(false);
	const site = $derived((studio.settings?.site_url || location.origin).replace(/\/$/, ''));
	const url = (l: Link) => `${site}/insights?for=${l.token}`;

	async function load() {
		const { data } = await supabase.from('insight_links').select('*').order('created_at', { ascending: false });
		links = (data as Link[] | null) ?? [];
	}
	onMount(load);

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (!label.trim()) return;
		busy = true;
		const { data, error } = await supabase.from('insight_links').insert({ label: label.trim(), hide: [...hide] }).select().single();
		busy = false;
		if (error) return toast(`Couldn't make the link: ${errMessage(error)}`, 'alert');
		label = '';
		hide = new Set();
		await load();
		copyText(url(data as Link), 'Link copied. Send it to the brand.');
	}
	async function toggleSection(l: Link, k: SectionKey) {
		const next = l.hide.includes(k) ? l.hide.filter((x) => x !== k) : [...l.hide, k];
		await supabase.from('insight_links').update({ hide: next }).eq('token', l.token);
		l.hide = next;
	}
	async function remove(l: Link) {
		if (!(await ask({ title: `Delete the link for ${l.label}?`, body: 'It stops working for them straight away.', ok: 'Delete', danger: true }))) return;
		await supabase.from('insight_links').delete().eq('token', l.token);
		links = links.filter((x) => x.token !== l.token);
	}
	const flip = (k: SectionKey) => {
		const n = new Set(hide);
		if (n.has(k)) n.delete(k);
		else n.add(k);
		hide = n;
	};
</script>

<div class="ilinks">
	<div class="switch-row" style="border-top:1px solid var(--line)">
		<div><b>Links for each brand</b><small>Send a brand their own link. You'll see when they open it, with a phone alert, and you choose what it shows.</small></div>
	</div>
	<form class="ilink-new" onsubmit={create}>
		<input class="inp" placeholder="Brand name, e.g. Glowberry" aria-label="Brand name for the link" bind:value={label} maxlength="80" />
		<div class="ilink-secs" role="group" aria-label="Sections to show">
			{#each SECTIONS as sct (sct.k)}
				<button type="button" class="cat-chip" class:on={!hide.has(sct.k)} aria-pressed={!hide.has(sct.k)} onclick={() => flip(sct.k)}>{sct.label}</button>
			{/each}
		</div>
		<button class="btn sm primary" type="submit" disabled={busy || !label.trim()}><Icon name="link" />Make link and copy</button>
	</form>
	{#each links as l (l.token)}
		<div class="ilink">
			<div class="ilink-top">
				<b>{l.label}</b>
				<span class="ilink-seen" class:on={l.views > 0}>{l.views ? `Opened ${l.views} time${l.views === 1 ? '' : 's'} · last ${fmtUpdated(l.last_viewed_at!)}` : 'Not opened yet'}</span>
				<button class="btn sm" onclick={() => copyText(url(l), 'Link copied')}><Icon name="copy" />Copy</button>
				<button class="icon-btn sm" aria-label="Delete the link for {l.label}" onclick={() => remove(l)}><Icon name="x" /></button>
			</div>
			<div class="ilink-secs" role="group" aria-label="Sections {l.label} sees">
				{#each SECTIONS as sct (sct.k)}
					<button type="button" class="cat-chip sm" class:on={!l.hide.includes(sct.k)} aria-pressed={!l.hide.includes(sct.k)} onclick={() => toggleSection(l, sct.k)}>{sct.label}</button>
				{/each}
			</div>
		</div>
	{/each}
</div>
