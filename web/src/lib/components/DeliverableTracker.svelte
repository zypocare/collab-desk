<script lang="ts">
	import type { Collab, DeliverableItem, DeliverableStatus } from '../types';
	import { addDeliverable, removeDeliverable, saveDeliverableItem, setDeliverable, studio } from '../studio.svelte';
	import { ask } from '../confirm.svelte';
	import { KINDS, mediaLabel } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';
	import DatePicker from './DatePicker.svelte';
	let { c }: { c: Collab } = $props();
	const held = $derived(['paused', 'cancelled'].includes(c.stage));
	const readonly = $derived(studio.me?.team_role === 'accountant');
	const items = $derived(c.deliverables.flatMap((d) => d.items ?? []));
	const done = $derived(items.filter((x) => ['published', 'delivered'].includes(x.status)).length);
	const statuses: { value: DeliverableStatus; label: string }[] = [
		{ value: 'planned', label: 'Planned' }, { value: 'creating', label: 'Creating' },
		{ value: 'in_review', label: 'In review' }, { value: 'approved', label: 'Approved' },
		{ value: 'published', label: 'Published' }, { value: 'delivered', label: 'Delivered' }
	];
	let saving = $state<string[]>([]);
	async function save(item: DeliverableItem, patch: Parameters<typeof saveDeliverableItem>[1]) {
		saving = [...saving, item.id];
		try { await saveDeliverableItem(item, patch); } finally { saving = saving.filter((id) => id !== item.id); }
	}
</script>

<h3>Deliverables <span>{done} of {items.length || c.deliverables.reduce((n, d) => n + d.qty, 0)} done</span></h3>
{#if held}<p class="hint">Production is on hold. Resume the collaboration to update progress.</p>{/if}
<div class="deliverable-tracker">
	{#each c.deliverables as d (d.id)}
		<div class="deliverable-group">
			<div class="group-head">
				<b>{d.kind}</b>
				<label>Quantity <input class="inp qty num" type="number" min="1" max="50" value={d.qty} disabled={held || readonly} aria-label="How many {d.kind}" onchange={(e) => setDeliverable(d, { qty: Math.min(50, Math.max(1, Number(e.currentTarget.value) || 1)) })} /></label>
				<button class="icon-btn sm" disabled={held || readonly} aria-label="Remove {d.kind}" onclick={async () => (await ask({ title: `Remove ${d.kind}?`, body: 'This removes its individual progress and dates as well.', ok: 'Remove', danger: true })) && removeDeliverable(d)}><Icon name="x" /></button>
			</div>
			{#each d.items ?? [] as item (item.id)}
				<fieldset class="piece" disabled={readonly || saving.includes(item.id)} aria-label="{d.kind} {item.position}">
					<legend>{d.kind} {item.position}</legend>
					<div class="fields">
						<div class="f"><label for="item-status-{item.id}">Status</label><Select id="item-status-{item.id}" value={item.status} options={statuses} disabled={held} onchange={(v) => save(item, { status: v })} /></div>
						<div class="f"><label for="item-due-{item.id}">Due date</label><DatePicker id="item-due-{item.id}" value={item.due_date} onchange={(v) => save(item, { due_date: v || null })} /></div>
						<div class="f span2"><label for="item-owner-{item.id}">Assigned to</label><input id="item-owner-{item.id}" class="inp" maxlength="120" placeholder="Creator, editor or team member" value={item.assigned_to} onchange={(e) => save(item, { assigned_to: e.currentTarget.value.trim() })} /></div>
						<div class="f"><label for="item-draft-{item.id}">Draft</label><Select id="item-draft-{item.id}" value={item.draft_id ?? ''} disabled={held} options={[{ value: '', label: 'No draft linked' }, ...c.drafts.map((x) => ({ value: x.id, label: `Round ${x.round} · ${x.status}` }))]} onchange={(v) => save(item, { draft_id: v || null })} /></div>
						<div class="f"><label for="item-post-{item.id}">Published post</label><Select id="item-post-{item.id}" value={item.media_id ?? ''} disabled={held} options={[{ value: '', label: 'No post linked' }, ...c.posts.map(({ media: m }) => ({ value: m.id, label: `${mediaLabel(m.media_type, m.product_type)} · ${m.posted_at.slice(0, 10)}` }))]} onchange={(v) => save(item, v ? { media_id: v, status: 'published' } : { media_id: null })} /></div>
					</div>
				</fieldset>
			{/each}
		</div>
	{:else}<p class="hint">Add what the brand is expecting.</p>{/each}
</div>
<Select action class="add-sel" ariaLabel="Add deliverable" placeholder="+ Add deliverable" disabled={held || readonly} options={KINDS.map((k) => ({ value: k, label: k }))} onchange={(k) => addDeliverable(c, k)} />

<style>
	.deliverable-tracker { display: grid; gap: 16px; }
	.group-head { display: flex; align-items: center; gap: 10px; }
	.group-head b { margin-right: auto; }
	.group-head label { display: flex; align-items: center; gap: 8px; font-size: 12px; }
	.qty { width: 64px; }
	.piece { border: 1px solid var(--line, #8884); border-radius: 12px; margin: 10px 0; padding: 12px; min-width: 0; }
	.piece legend { padding: 0 6px; font-size: 12px; font-weight: 600; }
</style>
