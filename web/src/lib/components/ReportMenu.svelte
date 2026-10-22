<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { portal } from '../portal';
	import { block } from '../safety.svelte';
	import Icon from './Icon.svelte';
	import ReportDialog from './ReportDialog.svelte';

	// The ⋯ button on a creator (for a brand): report them, or block them.
	let { name, target, onblocked }: { name: string; target: { collab_id?: string; creator_id?: number }; onblocked?: () => void } = $props();
	let open = $state(false);
	let reporting = $state(false);
	let at = $state({ top: 0, right: 0 });
	function toggle(e: MouseEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		at = { top: r.bottom + 6, right: Math.max(8, innerWidth - r.right) };
		open = !open;
	}
	async function blockIt() {
		open = false;
		if (!(await ask({ title: `Block ${name}?`, body: 'They drop out of Discover and your pools, and can’t message you. Unblock any time in Settings › Blocked.', ok: 'Block', danger: true }))) return;
		if (await block(target, name)) onblocked?.();
	}
</script>

<button class="btn icon-only" type="button" onclick={toggle} aria-label="More" aria-expanded={open}><Icon name="more" /></button>
{#if open}
	<div class="more-scrim" role="presentation" use:portal onclick={() => (open = false)}></div>
	<div class="more-menu" role="menu" use:portal style="top:{at.top}px;right:{at.right}px">
		<button role="menuitem" onclick={() => ((open = false), (reporting = true))}><Icon name="flag" />Report {name}</button>
		<button role="menuitem" onclick={blockIt}><Icon name="ban" />Block {name}</button>
	</div>
{/if}
{#if reporting}<ReportDialog side="brand" {name} {target} onclose={() => (reporting = false)} ondone={(b) => b && onblocked?.()} />{/if}
