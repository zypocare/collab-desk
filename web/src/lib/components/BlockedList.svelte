<script lang="ts">
	import { onMount } from 'svelte';
	import { blocks, loadBlocks, unblock } from '../safety.svelte';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';

	// Who you've blocked (brands for a creator, creators for a brand), with a way to unblock.
	let { side }: { side: 'creator' | 'brand' } = $props();
	onMount(loadBlocks);
</script>

<section class="panel rv" style="--i:1">
	<div class="panel-h"><h2>Blocked</h2><small>{side === 'creator' ? 'brands that can’t send you requests or messages' : 'creators you won’t see in Discover or get messages from'}</small></div>
	{#if !blocks.loaded}
		<div class="loader" style="min-height:120px"><span class="ring"><span></span></span></div>
	{:else if !blocks.list.length}
		<div class="bl-none"><Icon name="ban" /><span>No one blocked. You can block {side === 'creator' ? 'a brand from its request' : 'a creator from their page or a request'}, with ⋯ at the top.</span></div>
	{:else}
		{#each blocks.list as b (b.id)}
			<div class="switch-row">
				<span class="bl-who"><Avatar name={b.name} src={b.photo ?? ''} size="40px" /><span><b>{b.name}</b><small>Blocked {new Date(b.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</small></span></span>
				<button class="btn sm" type="button" onclick={() => unblock(b)}>Unblock</button>
			</div>
		{/each}
	{/if}
</section>

<style>
	.bl-none {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 20px 20px;
		color: var(--ink-3);
		font-size: 14px;
	}
	.bl-who {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.bl-who > span {
		display: grid;
		min-width: 0;
	}
	.bl-who small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
</style>
