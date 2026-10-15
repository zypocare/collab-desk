<script lang="ts">
	import { onMount } from 'svelte';
	import { createCollab, studio } from '../studio.svelte';
	import { ui } from '../ui.svelte';
	import Icon from './Icon.svelte';

	let name = $state('');
	let busy = $state(false);
	let input = $state<HTMLInputElement>();

	onMount(() => input?.focus());

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		busy = true;
		const c = await createCollab(name);
		busy = false;
		if (c) {
			ui.newCollab = false;
			ui.openCollab = c.id;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (ui.newCollab = false)} />

<div class="dialog-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (ui.newCollab = false)}>
	<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="nc-title"><form onsubmit={submit}>
		<h2 id="nc-title">Add a collab</h2>
		<p>For deals that came by DM, email or phone. Pick an existing brand or type a new one.</p>
		<div class="f">
			<label for="nc-brand">Brand</label>
			<input class="inp" id="nc-brand" list="nc-brands" placeholder="Brand name" autocomplete="off" bind:value={name} bind:this={input} />
			<datalist id="nc-brands">
				{#each studio.brands as b (b.id)}<option value={b.name}></option>{/each}
			</datalist>
		</div>
		<div class="row">
			<button type="button" class="btn ghost" onclick={() => (ui.newCollab = false)}>Cancel</button>
			<button type="submit" class="btn primary" disabled={busy || !name.trim()}>
				{#if busy}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add collab
			</button>
		</div>
	</form></div>
</div>
