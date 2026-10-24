<script lang="ts">
	import type { Collab, DeliverableItem, DeliverableStatus } from '../types';
	import { addDeliverable, removeDeliverable, saveDeliverableItem, setDeliverable, studio } from '../studio.svelte';
	import { ask } from '../confirm.svelte';
	import { KINDS, fmt, mediaLabel } from '../util';
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
	const statusLabel = (s: DeliverableStatus) => statuses.find((x) => x.value === s)?.label ?? s;
	const setQty = (d: (typeof c.deliverables)[number], n: number) => setDeliverable(d, { qty: Math.min(50, Math.max(1, n || 1)) });
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
				<span class="qty-step" role="group" aria-label="How many {d.kind}">
					<button type="button" disabled={held || readonly || d.qty <= 1} aria-label="One less" onclick={() => setQty(d, d.qty - 1)}>−</button>
					<b class="num">{d.qty}</b>
					<button type="button" disabled={held || readonly || d.qty >= 50} aria-label="One more" onclick={() => setQty(d, d.qty + 1)}>+</button>
				</span>
				<button class="icon-btn sm" disabled={held || readonly} aria-label="Remove {d.kind}" onclick={async () => (await ask({ title: `Remove ${d.kind}?`, body: 'This removes its individual progress and dates as well.', ok: 'Remove', danger: true })) && removeDeliverable(d)}><Icon name="x" /></button>
			</div>
			{#each d.items ?? [] as item (item.id)}
				<!-- One line per piece; tap it to change the status, date, owner or links. -->
				<details class="piece">
					<summary>
						<span class="pc-n">{d.kind} {item.position}</span>
						<span class="pc-st st-{item.status}">{statusLabel(item.status)}</span>
						<span class="pc-meta">{item.due_date ? `due ${fmt(item.due_date)}` : 'no date'}{item.assigned_to ? ` · ${item.assigned_to}` : ''}</span>
						<Icon name="chevD" />
					</summary>
				<fieldset disabled={readonly || saving.includes(item.id)} aria-label="{d.kind} {item.position}">
					<div class="fields">
						<div class="f"><label for="item-status-{item.id}">Status</label><Select id="item-status-{item.id}" value={item.status} options={statuses} disabled={held} onchange={(v) => save(item, { status: v })} /></div>
						<div class="f"><label for="item-due-{item.id}">Due date</label><DatePicker id="item-due-{item.id}" value={item.due_date} onchange={(v) => save(item, { due_date: v || null })} /></div>
						<div class="f span2"><label for="item-owner-{item.id}">Assigned to</label><input id="item-owner-{item.id}" class="inp" maxlength="120" placeholder="Creator, editor or team member" value={item.assigned_to} onchange={(e) => save(item, { assigned_to: e.currentTarget.value.trim() })} /></div>
						<div class="f"><label for="item-draft-{item.id}">Draft</label><Select id="item-draft-{item.id}" value={item.draft_id ?? ''} disabled={held} options={[{ value: '', label: 'No draft linked' }, ...c.drafts.map((x) => ({ value: x.id, label: `Round ${x.round} · ${x.status}` }))]} onchange={(v) => save(item, { draft_id: v || null })} /></div>
						<div class="f"><label for="item-post-{item.id}">Published post</label><Select id="item-post-{item.id}" value={item.media_id ?? ''} disabled={held} options={[{ value: '', label: 'No post linked' }, ...c.posts.map(({ media: m }) => ({ value: m.id, label: `${mediaLabel(m.media_type, m.product_type)} · ${m.posted_at.slice(0, 10)}` }))]} onchange={(v) => save(item, v ? { media_id: v, status: 'published' } : { media_id: null })} /></div>
					</div>
				</fieldset>
				</details>
			{/each}
		</div>
	{:else}<p class="hint">Add what the brand is expecting.</p>{/each}
</div>
<Select action class="add-sel" ariaLabel="Add deliverable" placeholder="+ Add deliverable" disabled={held || readonly} options={KINDS.map((k) => ({ value: k, label: k }))} onchange={(k) => addDeliverable(c, k)} />

<style>
	.deliverable-tracker { display: grid; gap: 16px; }
	.deliverable-group { display: grid; gap: 6px; }
	.group-head { display: flex; align-items: center; gap: 10px; }
	.group-head b { margin-right: auto; }
	.qty-step { display: inline-flex; align-items: center; border: 1px solid var(--line-strong, #8886); border-radius: 999px; }
	.qty-step button { width: 32px; height: 30px; border: 0; background: none; color: var(--ink); font-size: 17px; cursor: pointer; }
	.qty-step button:disabled { opacity: .35; cursor: default; }
	.qty-step b { min-width: 18px; text-align: center; font-size: 14px; }
	.piece { border-radius: 12px; background: var(--surface-2); min-width: 0; }
	.piece summary { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 12px; list-style: none; cursor: pointer; }
	.piece summary::-webkit-details-marker { display: none; }
	.piece summary :global(.ic) { flex: none; width: 16px; height: 16px; color: var(--ink-3); transition: transform .2s; }
	.piece[open] summary :global(.ic) { transform: rotate(180deg); }
	.pc-n { flex: none; font-weight: 600; font-size: 14px; }
	.pc-st { flex: none; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .04em; background: color-mix(in oklab, var(--ink) 9%, transparent); color: var(--ink-2); }
	.pc-st:is(.st-creating, .st-in_review) { background: color-mix(in oklab, var(--warn) 18%, transparent); color: var(--warn); }
	.pc-st:is(.st-approved, .st-published, .st-delivered) { background: color-mix(in oklab, var(--ok) 18%, transparent); color: var(--ok); }
	.pc-meta { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12.5px; color: var(--ink-3); text-align: right; }
	.piece fieldset { margin: 0; padding: 4px 12px 14px; border: 0; min-width: 0; }
</style>
