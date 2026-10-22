<script lang="ts">
	import { onMount } from 'svelte';
	import { checkups, loadCheckups, markSeen, unseen } from '../checkup.svelte';
	import Icon from './Icon.svelte';

	// On Today: one slim row for a new growth check-up she hasn't opened yet. Tapping it opens the
	// check-up and the row goes away.
	let { phone = false }: { phone?: boolean } = $props();
	onMount(() => {
		if (!checkups.loaded) loadCheckups();
	});
	const run = $derived(unseen());
	const n = $derived(run?.data.findings.length ?? 0);
	const line = $derived(n ? `${n} thing${n === 1 ? '' : 's'} holding you back` : 'See what’s working');
</script>

{#if run}
	<a class="cuc" class:phone href="/studio/grow/checkup" onclick={() => markSeen()}>
		<span class="cuc-ic" aria-hidden="true"><Icon name="chart" /></span>
		<span class="cuc-t"><b>New growth check-up</b><span>{line}</span></span>
		<Icon name="chevR" />
	</a>
{/if}

<style>
	.cuc {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 56px;
		padding: 0 14px 0 10px;
		margin: 0 0 16px;
		border-radius: 16px;
		color: var(--ink);
		text-decoration: none;
		background: linear-gradient(90deg, color-mix(in oklab, var(--accent) 16%, var(--surface)), var(--surface) 70%);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 35%, var(--line));
	}
	.cuc-ic {
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: color-mix(in oklab, var(--accent) 20%, transparent);
		color: var(--accent);
	}
	.cuc-ic :global(.ic) {
		width: 17px;
		height: 17px;
	}
	.cuc-t {
		flex: 1;
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
	}
	.cuc-t b {
		font-size: 14.5px;
	}
	.cuc-t span {
		font-size: 13px;
		color: var(--ink-3);
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cuc > :global(.ic) {
		flex: none;
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}
	.cuc.phone {
		margin: 0 16px 14px;
	}
	.cuc.phone .cuc-t {
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
	}
	.cuc.phone .cuc-t b {
		font-size: 14px;
	}
	.cuc.phone .cuc-t span {
		font-size: 12px;
		max-width: 100%;
	}
</style>
