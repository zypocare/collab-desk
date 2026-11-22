<script lang="ts">
	import { onDestroy } from 'svelte';
	import Icon from './Icon.svelte';

	const palettes = [
		['original', 'Miracle Original'], ['velvet', 'Velvet Hour'],
		['tidal', 'Tidal Glass'], ['dusk', 'Electric Dusk'],
		['mango', 'Mango Radio'], ['cherry', 'Cherry Soda'],
		['glacier', 'Glacier Signal'], ['matcha', 'Matcha Garden']
	] as const;
	let dialog: HTMLDialogElement;
	let saved = 'original';
	let selected = $state('original');
	let previewing = false;

	function paint(id: string) {
		if (id === 'original') delete document.documentElement.dataset.mood;
		else document.documentElement.dataset.mood = id;
	}
	function open() {
		saved = document.documentElement.dataset.mood || 'original';
		selected = saved;
		previewing = true;
		dialog.showModal();
	}
	function preview(id: string) {
		selected = id;
		paint(id);
	}
	function finish() {
		if (previewing) paint(saved);
		previewing = false;
	}
	function apply() {
		saved = selected;
		try {
			if (saved === 'original') localStorage.removeItem('cd.mood');
			else localStorage.setItem('cd.mood', saved);
		} catch { /* The selection still applies for this session. */ }
		dialog.close();
	}
	onDestroy(finish);
</script>

<button type="button" class="m-ib mood-trigger" aria-label="Choose color theme" title="Choose color theme" aria-haspopup="dialog" onclick={open}>
	<span aria-hidden="true"></span>
</button>

<dialog bind:this={dialog} class="mood-sheet" aria-labelledby="mood-title" onclose={finish}>
	<header>
		<h2 id="mood-title">Color theme</h2>
		<button class="close" type="button" aria-label="Cancel theme preview" onclick={() => dialog.close()}><Icon name="x" /></button>
	</header>
	<fieldset>
		<legend class="sr">Preview a color theme</legend>
		{#each palettes as [id, name] (id)}
			<label data-swatch={id}>
				<input type="radio" name="mood" value={id} checked={selected === id} onchange={() => preview(id)} />
				<span class="sample" aria-hidden="true"><i></i><i></i><i></i></span>
				<span class="palette-name">{name}</span>
				{#if selected === id}<span class="check"><Icon name="check" /></span>{/if}
			</label>
		{/each}
	</fieldset>
	<button class="apply" type="button" onclick={apply}>Apply theme</button>
</dialog>

<style>
	.mood-trigger { display: inline-grid; place-items: center; width: 38px; height: 38px; padding: 0; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); flex: none; }
	.mood-trigger > span { width: 19px; height: 19px; border-radius: 50%; background: conic-gradient(from -30deg, var(--g1), var(--g2), var(--g3), var(--g1)); box-shadow: inset 0 0 0 1px #ffffff42; }
	.mood-sheet { position: fixed; inset: 0; margin: auto; box-sizing: border-box; width: min(420px, calc(100% - 24px)); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 20px; border-radius: 22px; border: 1px solid var(--line-strong); color: var(--ink); background: var(--surface); box-shadow: var(--shadow-lg); text-align: left; }
	.mood-sheet::backdrop { background: rgb(12 9 14 / .54); }
	header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
	h2 { font: 400 30px/1.1 var(--f-serif); }
	.close { width: 40px; height: 40px; display: grid; place-items: center; border: 0; background: transparent; color: var(--ink-2); }
	fieldset { margin: 0; padding: 0; border: 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
	label { position: relative; display: grid; gap: 6px; padding: 7px; border: 1px solid var(--line-strong); border-radius: 12px; cursor: pointer; }
	label:has(:checked) { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
	label:has(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
	input { position: absolute; width: 1px; height: 1px; opacity: 0; }
	.sample { height: 30px; display: flex; align-items: center; padding: 0 10px; border-radius: 7px; background: linear-gradient(110deg,var(--tone-base),color-mix(in srgb,var(--tone-base) 55%,#100e14)); }
	.sample i { width: 14px; height: 14px; margin-right: -3px; border-radius: 50%; background: var(--tone-a); }
	.sample i:nth-child(2) { background: var(--tone-b); } .sample i:nth-child(3) { background: var(--tone-c); }
	.palette-name { padding: 0 2px 2px; font: 600 13px/1.3 var(--f-body); }
	.check { position: absolute; right: 12px; top: 14px; display: grid; color: white; } .check :global(svg) { width: 16px; height: 16px; }
	.apply { width: 100%; margin-top: 16px; min-height: 44px; border: 0; border-radius: 9px; background: var(--ink); color: var(--bg); font-weight: 700; }
	@media(max-width:760px) {
		.mood-sheet { inset: auto 0 0; margin: 0 auto; width: 100%; border-radius: 22px 22px 0 0; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
	}
</style>
