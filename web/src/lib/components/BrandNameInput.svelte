<script lang="ts">
	import { studio } from '../studio.svelte';
	let { id, value = $bindable(''), onedit }: { id: string; value?: string; onedit?: () => void } = $props();
	let focused = $state(false), dismissed = $state(false), active = $state(-1);
	const searchText = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLocaleLowerCase();
	const query = $derived(searchText(value));
	const matches = $derived(query ? studio.brands.filter((brand) => searchText(brand.name).includes(query)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 4) : []);
	const open = $derived(focused && !dismissed && matches.length > 0);
	function choose(name: string) { value = name; dismissed = true; active = -1; onedit?.(); }
	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); dismissed = true; active = -1; }
		else if (matches.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
			event.preventDefault(); dismissed = false;
			active = event.key === 'ArrowDown' ? (active + 1) % matches.length : (active <= 0 ? matches.length - 1 : active - 1);
		} else if (event.key === 'Enter' && open && active >= 0 && matches[active]) { event.preventDefault(); choose(matches[active].name); }
	}
</script>

<div class="brand-name-field">
	<input {id} class="brand-name-input" placeholder="Brand name" autocomplete="off" spellcheck="false" autocapitalize="words" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="{id}-matches" aria-activedescendant={open && active >= 0 ? `${id}-match-${active}` : undefined} bind:value oninput={() => { onedit?.(); dismissed = false; active = -1; }} onfocus={() => { focused = true; dismissed = false; }} onblur={() => { focused = false; active = -1; }} onkeydown={keydown} />
	{#if open}
		<div class="brand-name-matches" id="{id}-matches" role="listbox" aria-label="Existing brands">
			{#each matches as brand, i (brand.id)}
				<button type="button" id="{id}-match-{i}" role="option" aria-selected={active === i} tabindex="-1" onpointerdown={(event) => event.preventDefault()} onclick={() => choose(brand.name)}>{brand.name}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.brand-name-field { flex: none; min-width: 0; width: 100%; }
	.brand-name-input { display: block; width: 100%; height: 54px; box-sizing: border-box; padding: 0 2px; border: 0; border-bottom: 2px solid var(--line-strong); outline: 0; border-radius: 0; background: transparent; color: var(--ink); font: 400 28px var(--f-serif, Georgia, serif); }
	.brand-name-input:focus { border-bottom-color: var(--ink); }
	/* In the form's flow: suggestions cannot cover the message, title or footer. */
	.brand-name-matches { position: relative; display: flex; flex-direction: column; margin-top: 6px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); overflow: hidden; }
	.brand-name-matches button { display: block; flex: none; width: 100%; min-height: 44px; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 400 14px/1.45 var(--f-body, sans-serif); text-align: left; overflow-wrap: anywhere; cursor: pointer; }
	.brand-name-matches button:last-child { border-bottom: 0; }
	.brand-name-matches button[aria-selected=true], .brand-name-matches button:active { background: var(--surface-2); color: var(--accent); }
</style>
