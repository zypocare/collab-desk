<script lang="ts">
	import type { BrandRequest } from '../types';
	let { deliverables }: Pick<BrandRequest, 'deliverables'> = $props();
	const names: Record<string, string> = { planned: 'Planned', creating: 'Creating', in_review: 'In review', approved: 'Approved', published: 'Published', delivered: 'Delivered' };
</script>

{#if deliverables.some((d) => d.items?.length)}
	<section class="panel" style="padding:20px;margin:18px 0" aria-label="Individual deliverable progress">
		<h2>Deliverable progress</h2>
		{#each deliverables as d, i (i)}
			{#each d.items ?? [] as item (item.position)}
				<div class="progress-piece"><b>{d.kind} {item.position}</b><span>{names[item.status] ?? item.status}</span>{#if item.due_date}<small>Due {item.due_date}</small>{/if}</div>
			{/each}
		{/each}
	</section>
{/if}

<style>.progress-piece { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 10px 0; font-size: 13px; }.progress-piece b { margin-right: auto; }</style>
