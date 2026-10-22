<script lang="ts">
	import { onMount } from 'svelte';
	import { addToPool, loadPools, pools, removeMember, savePool } from '../campaigns.svelte';
	import { askNote } from '../confirm.svelte';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// "+ Pool" on a creator's card: put them in one of the brand's pools (or a new one), or take them out.
	// With `pool` set (arrived from a pool's "Add creators"), it's one button for that pool.
	let { creator, name, pool = '' }: { creator: number; name: string; pool?: string } = $props();
	let open = $state(false);
	let wrap = $state<HTMLElement>();
	onMount(() => {
		if (!pools.loaded) loadPools().catch(() => {});
		const close = (e: MouseEvent) => open && wrap && !wrap.contains(e.target as Node) && (open = false);
		addEventListener('click', close);
		return () => removeEventListener('click', close);
	});
	const memberIn = (poolId: string) => pools.list.find((p) => p.id === poolId)?.members.find((m) => m.creator?.id === creator) ?? null;
	const target = $derived(pool ? pools.list.find((p) => p.id === pool) : null);

	async function toggle(poolId: string) {
		const m = memberIn(poolId);
		const pName = pools.list.find((p) => p.id === poolId)?.name ?? 'the pool';
		try {
			if (m) {
				await removeMember(m.id);
				toast(`${name} taken out of ${pName}`, 'x');
			} else {
				const skipped = await addToPool(poolId, [creator]);
				toast(skipped ? `${name} can't be added: they aren't listed for brands` : `${name} added to ${pName}`, skipped ? 'alert' : 'check');
			}
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	async function makeNew() {
		open = false;
		const n = await askNote({ title: 'New pool', note: 'Pool name', placeholder: 'e.g. Diwali beauty', ok: 'Make pool' });
		if (!n) return;
		try {
			const id = await savePool(n);
			await toggle(id);
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
</script>

{#if target}
	<button class="ap-one" class:in={!!memberIn(target.id)} onclick={() => toggle(target.id)}>
		{#if memberIn(target.id)}<Icon name="check" />In {target.name}{:else}<Icon name="plus" />Add to {target.name}{/if}
	</button>
{:else}
	<div class="ap" bind:this={wrap}>
		<button class="ap-btn" onclick={() => (open = !open)} aria-expanded={open} aria-haspopup="menu" aria-label="Add {name} to a pool"><Icon name="plus" />Pool</button>
		{#if open}
			<div class="ap-menu" role="menu">
				{#each pools.list as p (p.id)}
					<button role="menuitemcheckbox" aria-checked={!!memberIn(p.id)} onclick={() => toggle(p.id)}>
						<span class="ap-box" class:on={!!memberIn(p.id)} aria-hidden="true">{#if memberIn(p.id)}<Icon name="check" />{/if}</span>{p.name}
					</button>
				{/each}
				<button role="menuitem" class="ap-new" onclick={makeNew}>+ New pool</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.ap {
		position: relative;
	}
	.ap-btn,
	.ap-one {
		height: 44px;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0 14px;
		border: 0;
		background: transparent;
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1.5px var(--ink-3),
			4px 4px 0 var(--line);
		font: 700 12px/1 var(--f-body);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
		white-space: nowrap;
	}
	.ap-one {
		width: 100%;
		justify-content: center;
	}
	.ap-one.in {
		box-shadow: inset 0 0 0 1.5px var(--ok);
		color: var(--ok);
	}
	.ap-btn :global(.ic),
	.ap-one :global(.ic) {
		width: 15px;
		height: 15px;
	}
	.ap-menu {
		position: absolute;
		z-index: 40;
		bottom: calc(100% + 8px);
		right: 0;
		min-width: 220px;
		display: grid;
		gap: 2px;
		padding: 8px;
		border-radius: 14px;
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--line-strong),
			0 24px 50px -20px rgba(0, 0, 0, 0.6);
	}
	.ap-menu button {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 42px;
		padding: 0 10px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--ink);
		font: 14px/1.2 var(--f-body);
		text-align: left;
		cursor: pointer;
	}
	.ap-menu button:hover {
		background: color-mix(in oklab, var(--ink) 6%, transparent);
	}
	.ap-box {
		width: 18px;
		height: 18px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 5px;
		box-shadow: inset 0 0 0 1.5px var(--ink-3);
	}
	.ap-box.on {
		background: var(--g2);
		box-shadow: none;
		color: #fff;
	}
	.ap-box :global(.ic) {
		width: 13px;
		height: 13px;
		stroke-width: 2.6;
	}
	.ap-new {
		font-weight: 600 !important;
		border-top: 1px solid var(--line) !important;
		border-radius: 0 0 10px 10px !important;
	}
</style>
