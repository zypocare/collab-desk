<script lang="ts">
	import { onDestroy } from 'svelte';
	import { studio } from '../studio.svelte';
	import { firstName } from '../util';
	import Icon from './Icon.svelte';

	const palettes = [
		['original', 'Miracle Original', 'Violet · Rose · Peach'],
		['cherry', 'Cherry Soda', 'Cherry · Lilac'],
		['velvet', 'Velvet Hour', 'Mulberry · Copper'],
		['dusk', 'Electric Dusk', 'Indigo · Fuchsia'],
		['mango', 'Mango Radio', 'Apricot · Raspberry'],
		['peach', 'Peach Veil', 'Lavender · Peach'],
		['nocturne', 'Plum Nocturne', 'Plum · Coral'],
		['rose', 'Rose Vinyl', 'Blush · Orchid']
	] as const;
	const displayName = $derived(firstName(studio.settings?.display_name ?? ''));
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

<dialog bind:this={dialog} class="mood-sheet" aria-label="Color theme" onclose={finish}>
	<header>
		<h2>Color theme</h2>
		<button class="close" type="button" aria-label="Cancel theme preview" onclick={() => dialog.close()}><Icon name="x" /></button>
	</header>
	<div class="choices">
		<div class="preview" data-swatch={selected} aria-hidden="true">
			<div class="preview-copy"><small>Home preview</small><span>{displayName ? 'Hello, ' : 'Your '}<em>{displayName || 'Miracle'}</em></span></div>
			<span class="orbit"><i>{displayName.charAt(0) || 'M'}</i></span>
		</div>
		<fieldset>
			<legend class="sr">Preview a color theme</legend>
			{#each palettes as [id, name, pair] (id)}
				<label data-swatch={id}>
					<input type="radio" name="mood" value={id} checked={selected === id} onchange={() => preview(id)} />
					<span class="sample" aria-hidden="true"></span>
					<span class="palette-name">{name}</span>
					<span class="pair">{pair}</span>
					{#if selected === id}<span class="check" aria-hidden="true"><Icon name="check" /></span>{/if}
				</label>
			{/each}
		</fieldset>
	</div>
	<button class="apply" type="button" onclick={apply}>Apply theme</button>
</dialog>

<style>
	.mood-trigger { display: inline-grid; place-items: center; width: 38px; height: 38px; padding: 0; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); flex: none; }
	.mood-trigger > span { width: 19px; height: 19px; border-radius: 50%; background: conic-gradient(from -30deg, var(--g1), var(--g2), var(--g3), var(--g1)); box-shadow: inset 0 0 0 1px #ffffff42; }
	.mood-sheet {
		position: fixed; inset: 0; margin: auto; box-sizing: border-box;
		width: min(440px, calc(100% - 24px)); max-height: calc(100dvh - 32px);
		padding: 18px; border: 1px solid var(--line-strong); border-radius: 24px;
		background: var(--surface); color: var(--ink); box-shadow: var(--shadow-lg); text-align: left;
	}
	.mood-sheet[open] { display: grid; grid-template-rows: auto minmax(0,1fr) auto; gap: 12px; overflow: hidden; }
	.mood-sheet::backdrop { background: rgb(12 9 14 / .65); }
	header { display: flex; align-items: center; justify-content: space-between; }
	h2 { margin: 0; font: 400 32px/1.1 var(--f-serif); }
	.close { width: 44px; height: 44px; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--surface-2); color: var(--ink); }
	.choices { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 4px; margin: -4px; }
	.preview {
		position: relative; isolation: isolate; display: flex; align-items: center; justify-content: space-between;
		gap: 12px; padding: 14px 20px; margin-bottom: 12px; overflow: hidden;
		border: 1px solid transparent; border-radius: 16px; color: #fff3fa;
		background: var(--tone-panel) padding-box, var(--tone-ribbon) border-box;
	}
	.preview-copy { min-width: 0; }
	.preview-copy small { display: block; margin-bottom: 3px; font: 650 10px/1.3 var(--f-body); text-transform: uppercase; letter-spacing: .12em; color: #f1dfea; }
	.preview-copy > span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 400 32px/1.15 var(--f-serif); }
	.preview em { background: var(--tone-ribbon); background-clip: text; color: transparent; padding-right: .1em; }
	.orbit { flex: none; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%; background: var(--tone-ribbon); box-shadow: 0 0 0 5px #ffffff0f, 0 0 0 12px #ffffff07; }
	.orbit i { display: grid; place-items: center; width: 40px; height: 40px; border-radius: inherit; background: var(--tone-panel); font: italic 26px/1 var(--f-serif); }
	fieldset { min-width: 0; margin: 0; padding: 0; border: 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
	label { position: relative; display: grid; align-content: start; overflow: hidden; padding: 0 0 8px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface-2); cursor: pointer; }
	label:has(:checked) { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); }
	label:has(:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
	input { position: absolute; width: 1px; height: 1px; opacity: 0; }
	.sample { position: relative; isolation: isolate; height: 30px; margin: 3px 3px 5px; border-radius: 8px 8px 3px 3px; overflow: hidden; background: var(--tone-ribbon); }
	.sample::before { content: ''; position: absolute; inset: -100% -12% 24% 8%; transform: rotate(-12deg); border-radius: 50%; background: linear-gradient(100deg,transparent,color-mix(in srgb,var(--tone-b) 55%,#251225)); box-shadow: 0 1px 0 #ffffff70, 0 4px 0 #ffffff14; }
	.palette-name, .pair { padding: 0 10px; }
	.palette-name { font: 650 14px/1.4 var(--f-body); }
	.pair { color: var(--ink-2); font: 400 11px/1.4 var(--f-body); }
	.check { position: absolute; right: 8px; top: 7px; width: 21px; height: 21px; display: grid; place-items: center; border-radius: 50%; background: #261822; color: white; }
	.check :global(svg) { width: 14px; height: 14px; }
	.apply { min-height: 46px; border: 0; border-radius: 12px; background: var(--ink); color: var(--surface); font: 700 15px/1.3 var(--f-body); }
	@media(max-width:760px) {
		.mood-sheet { inset: auto 0 0; margin: 0 auto; width: 100%; max-height: calc(100dvh - max(12px, env(safe-area-inset-top))); border-radius: 22px 22px 0 0; padding-bottom: max(16px, env(safe-area-inset-bottom)); }
	}
</style>
