<script lang="ts">
	import { portal } from '../portal';
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { igSync, studio } from '../studio.svelte';
	import { nextStep } from '../suggest';
	import { ui } from '../ui.svelte';
	import { stageLabel } from '../util';
	import Icon from './Icon.svelte';

	// Ctrl+K (or "/"): find any collab, brand or page, or run an action, from the keyboard.
	type Item = { id: string; group: string; label: string; sub?: string; icon: string; hay: string; run: () => void };

	let open = $state(false);
	let q = $state('');
	let active = $state(0);
	let input = $state<HTMLInputElement>();
	let list = $state<HTMLElement>();

	export function show() {
		open = true;
		q = '';
		active = 0;
		tick().then(() => input?.focus());
	}

	const openCollab = (id: string, next?: string) => {
		if (next) ui.pendingNext = next;
		ui.openCollab = id;
	};

	const items = $derived.by(() => {
		const out: Item[] = [];
		const live = studio.collabs.filter((c) => c.stage !== 'declined');
		// Next steps first: the things that move work forward.
		for (const c of live) {
			const n = nextStep(c);
			if (n) out.push({ id: `n-${c.id}`, group: 'Next steps', label: `${n.label} · ${c.brand.name}`, sub: n.hint, icon: n.icon, hay: `${n.label} ${c.brand.name} ${c.code}`, run: () => openCollab(c.id, n.key) });
		}
		out.push(
			{ id: 'a-add', group: 'Actions', label: 'Add collab', sub: 'Paste a DM or type a brand', icon: 'plus', hay: 'add new collab paste dm email', run: () => (ui.newCollab = true) },
			{ id: 'a-import', group: 'Actions', label: 'Import existing collabs', sub: 'Many at once, from DMs', icon: 'layers', hay: 'import bulk existing many dms old collabs', run: () => goto('/studio/import') },
			{ id: 'a-sync', group: 'Actions', label: 'Sync Instagram now', icon: 'refresh', hay: 'sync instagram refresh stats', run: () => igSync() },
			{ id: 'a-kit', group: 'Actions', label: 'Media kit PDF', sub: 'From My page', icon: 'film', hay: 'media kit pdf download', run: () => goto('/studio/settings') }
		);
		for (const c of live.filter((x) => x.stage === 'request' || x.stage === 'negotiating'))
			out.push({ id: `q-${c.id}`, group: 'Actions', label: `Build quote for ${c.brand.name}`, sub: c.code, icon: 'rupee', hay: `quote ${c.brand.name} ${c.code}`, run: () => openCollab(c.id, 'quote') });
		for (const c of studio.collabs)
			out.push({ id: `c-${c.id}`, group: 'Collabs', label: c.brand.name, sub: `${c.code} · ${stageLabel(c.stage)}${c.contact_name ? ` · ${c.contact_name}` : ''}`, icon: 'board', hay: `${c.brand.name} ${c.code} ${c.contact_name} ${c.contact_email} ${c.brand.instagram} ${c.brand.category}`, run: () => openCollab(c.id) });
		for (const b of studio.brands)
			out.push({ id: `b-${b.id}`, group: 'Brands', label: b.name, sub: b.instagram ? `@${b.instagram}` : b.category, icon: 'users', hay: `${b.name} ${b.instagram} ${b.category}`, run: () => goto(`/studio/brands/${b.id}`) });
		const pages: [string, string, string][] = [
			['Today', '/studio', 'home'],
			['Collabs', '/studio/collabs', 'board'],
			['Calendar', '/studio/calendar', 'cal'],
			['Payments', '/studio/payments', 'wallet'],
			['Brands', '/studio/brands', 'users'],
			['Reports', '/studio/reports', 'chart'],
			['My page', '/studio/settings', 'link']
		];
		for (const [label, href, icon] of pages) out.push({ id: `p-${href}`, group: 'Pages', label, icon, hay: `${label} page go`, run: () => goto(href) });
		return out;
	});

	const results = $derived.by(() => {
		const words = q.toLowerCase().split(/\s+/).filter(Boolean);
		const hits = words.length ? items.filter((it) => words.every((w) => it.hay.toLowerCase().includes(w) || it.label.toLowerCase().includes(w))) : items.filter((it) => it.group !== 'Collabs' && it.group !== 'Brands');
		return hits.slice(0, 40);
	});
	$effect(() => {
		void q;
		active = 0;
	});

	function run(it: Item) {
		open = false;
		it.run();
	}
	function keydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') (e.preventDefault(), (active = Math.min(results.length - 1, active + 1)));
		else if (e.key === 'ArrowUp') (e.preventDefault(), (active = Math.max(0, active - 1)));
		else if (e.key === 'Enter' && results[active]) (e.preventDefault(), run(results[active]));
		else if (e.key === 'Escape') (e.preventDefault(), (open = false));
		else return;
		tick().then(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
	}
	function globalKey(e: KeyboardEvent) {
		const typing = e.target instanceof Element && e.target.closest('input, textarea, [contenteditable="true"], [role="combobox"]');
		if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing && !open)) {
			e.preventDefault();
			if (open) open = false;
			else show();
		}
	}
</script>

<svelte:window onkeydown={globalKey} />

{#if open}
	<div class="dialog-scrim cmdk-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (open = false)}>
		<div class="cmdk" role="dialog" aria-modal="true" aria-label="Search and actions">
			<div class="cmdk-in">
				<Icon name="search" />
				<input bind:this={input} bind:value={q} placeholder="Search collabs, brands, pages or actions…" onkeydown={keydown} aria-controls="cmdk-list" aria-activedescendant={results[active] ? `cmdk-${results[active].id}` : undefined} role="combobox" aria-expanded="true" />
				<kbd>Esc</kbd>
				<button type="button" class="cmdk-cancel" onclick={() => (open = false)}>Cancel</button>
			</div>
			<div class="cmdk-list" id="cmdk-list" role="listbox" bind:this={list}>
				{#each results as it, i (it.id)}
					{#if i === 0 || results[i - 1].group !== it.group}<div class="cmdk-g">{it.group}</div>{/if}
					<button id="cmdk-{it.id}" class="cmdk-it" role="option" aria-selected={i === active} onmouseenter={() => (active = i)} onclick={() => run(it)}>
						<span class="cmdk-ic"><Icon name={it.icon} /></span>
						<span class="cmdk-l"><b>{it.label}</b>{#if it.sub}<small>{it.sub}</small>{/if}</span>
						{#if i === active}<kbd>↵</kbd>{/if}
					</button>
				{:else}
					<div class="cmdk-empty">Nothing matches “{q}”.</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
