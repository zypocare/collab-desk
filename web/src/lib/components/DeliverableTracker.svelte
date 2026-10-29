<script lang="ts">
	import type { Collab, DeliverableItem, DeliverableStatus } from '../types';
	import { addDeliverable, removeDeliverable, saveDeliverableItem, setDeliverable, studio } from '../studio.svelte';
	import { ask } from '../confirm.svelte';
	import { KINDS, compact, fmt, mediaLabel, noPost } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';
	import DatePicker from './DatePicker.svelte';
	// cards: the phone sheet (each piece a card with a tap-to-move track); otherwise the full form.
	let { c, cards = false }: { c: Collab; cards?: boolean } = $props();
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
	// The phone track: five steps, the last one "Delivered" when nothing gets posted.
	const TRACK = $derived<{ value: DeliverableStatus; label: string }[]>([
		{ value: 'planned', label: 'Planned' }, { value: 'creating', label: 'Making' }, { value: 'in_review', label: 'Review' },
		{ value: 'approved', label: 'Approved' }, noPost(c) ? { value: 'delivered', label: 'Delivered' } : { value: 'published', label: 'Posted' }
	]);
	const step = (s: DeliverableStatus) => (s === 'published' || s === 'delivered' ? 4 : TRACK.findIndex((t) => t.value === s));
	const KIND_IC: Record<string, string> = { Reel: 'film', Story: 'image', 'Static post': 'grid', Carousel: 'layers', 'UGC video': 'film', Shoot: 'box' };
	let more = $state<string[]>([]);
	const flip = (id: string) => (more = more.includes(id) ? more.filter((x) => x !== id) : [...more, id]);
	// "+ Reel" adds one more to the Reels already there, or starts a new kind.
	const addOne = (k: string) => {
		const d = c.deliverables.find((x) => x.kind === k);
		return d ? setQty(d, d.qty + 1) : addDeliverable(c, k);
	};
	async function dropLast(d: (typeof c.deliverables)[number]) {
		if (!(await ask({ title: `Remove ${d.kind} ${d.qty}?`, body: 'This removes its progress and date as well.', ok: 'Remove', danger: true }))) return;
		return d.qty > 1 ? setQty(d, d.qty - 1) : removeDeliverable(d);
	}
	let saving = $state<string[]>([]);
	async function save(item: DeliverableItem, patch: Parameters<typeof saveDeliverableItem>[1]) {
		saving = [...saving, item.id];
		try { await saveDeliverableItem(item, patch); } finally { saving = saving.filter((id) => id !== item.id); }
	}
</script>

{#if cards}
<h3>Pieces <span>{done} of {items.length || c.deliverables.reduce((n, d) => n + d.qty, 0)} done{items.length && !held && !readonly ? ' · tap a step to move a piece' : ''}</span></h3>
{#if held}<p class="hint">Production is on hold. Resume the collaboration to update progress.</p>{/if}
<div class="pz-list">
	{#each c.deliverables as d (d.id)}
		{#each d.items ?? [] as item (item.id)}
			{@const post = item.media_id ? c.posts.find((x) => x.media.id === item.media_id)?.media : undefined}
			<div class="pz" class:busy={saving.includes(item.id)}>
				<div class="pz-h">
					<span class="pz-ic"><Icon name={KIND_IC[d.kind] ?? 'film'} /></span>
					<b>{d.kind} {item.position}</b>
					<DatePicker class="pz-date" size="sm" ariaLabel="{d.kind} {item.position} date" placeholder="Add date" value={item.due_date} disabled={held || readonly} onchange={(v) => save(item, { due_date: v || null })} />
					<button type="button" class="pz-more" aria-label="More for {d.kind} {item.position}" aria-expanded={more.includes(item.id)} onclick={() => flip(item.id)}><Icon name="more" /></button>
				</div>
				<div class="pz-track" role="radiogroup" aria-label="Where {d.kind} {item.position} is">
					{#each TRACK as t, k (t.value)}
						<button type="button" role="radio" aria-checked={step(item.status) === k} class:past={k < step(item.status)} class:now={k === step(item.status)} disabled={held || readonly || saving.includes(item.id)} onclick={() => step(item.status) !== k && save(item, { status: t.value })}>{t.label}</button>
					{/each}
				</div>
				{#if post}
					<a class="pz-post" href={post.permalink} target="_blank" rel="noopener">
						<span class="pz-th" style={post.thumbnail_url ? `background-image:url('${post.thumbnail_url}')` : ''} aria-hidden="true"></span>
						<span><b>{mediaLabel(post.media_type, post.product_type)} · {fmt(post.posted_at.slice(0, 10))}</b><small>{[post.views != null ? `${compact(post.views)} views` : '', post.likes != null ? `${compact(post.likes)} likes` : ''].filter(Boolean).join(' · ') || 'Open on Instagram'}</small></span>
					</a>
				{/if}
				{#if more.includes(item.id)}
					<fieldset class="pz-x" disabled={readonly || saving.includes(item.id)} aria-label="More for {d.kind} {item.position}">
						<div class="fields">
							<div class="f span2"><label for="pk-owner-{item.id}">Who's making it</label><input id="pk-owner-{item.id}" class="inp" maxlength="120" placeholder="You, an editor or a team member" value={item.assigned_to} onchange={(e) => save(item, { assigned_to: e.currentTarget.value.trim() })} /></div>
							<div class="f"><label for="pk-draft-{item.id}">Draft</label><Select id="pk-draft-{item.id}" value={item.draft_id ?? ''} disabled={held} options={[{ value: '', label: 'No draft linked' }, ...c.drafts.map((x) => ({ value: x.id, label: `Round ${x.round} · ${x.status}` }))]} onchange={(v) => save(item, { draft_id: v || null })} /></div>
							<div class="f"><label for="pk-post-{item.id}">Instagram post</label><Select id="pk-post-{item.id}" value={item.media_id ?? ''} disabled={held} options={[{ value: '', label: 'No post linked' }, ...c.posts.map(({ media: m }) => ({ value: m.id, label: `${mediaLabel(m.media_type, m.product_type)} · ${m.posted_at.slice(0, 10)}` }))]} onchange={(v) => save(item, v ? { media_id: v, status: 'published' } : { media_id: null })} /></div>
						</div>
						{#if item.position === d.qty}<button type="button" class="lnk danger pz-rm" disabled={held} onclick={() => dropLast(d)}>Remove {d.kind} {item.position}</button>{/if}
					</fieldset>
				{/if}
			</div>
		{/each}
	{:else}<p class="hint">Add what the brand is expecting.</p>{/each}
</div>
{#if !held && !readonly}
	<div class="pz-add">
		<span>Add a piece</span>
		<div>{#each KINDS as k (k)}<button type="button" onclick={() => addOne(k)}>+ {k}</button>{/each}</div>
	</div>
{/if}
{:else}
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
{/if}

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
	/* Phone sheet: each piece a card, its state a five-step track she taps. */
	.pz-list { display: grid; gap: 12px; }
	.pz { display: grid; gap: 12px; min-width: 0; padding: 14px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); transition: opacity .2s; }
	.pz.busy { opacity: .7; }
	.pz-h { display: flex; align-items: center; gap: 10px; min-width: 0; }
	.pz-ic { width: 34px; height: 34px; flex: none; display: grid; place-items: center; border-radius: 11px; background: color-mix(in oklab, var(--g1, #9c7bff) 18%, transparent); color: var(--g1, #9c7bff); }
	.pz-ic :global(.ic) { width: 17px; height: 17px; }
	.pz-h b { flex: 1; min-width: 0; font-size: 15.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.pz-h :global(.pz-date) { flex: none; width: auto; height: 30px; padding: 0 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; }
	.pz-more { width: 32px; height: 32px; flex: none; display: grid; place-items: center; border: 0; border-radius: 50%; background: none; color: var(--ink-3); cursor: pointer; }
	.pz-more[aria-expanded='true'] { background: var(--surface-2); color: var(--ink); }
	.pz-more :global(.ic) { width: 18px; height: 18px; }
	.pz-track { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 3px; padding: 3px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); }
	.pz-track button { height: 32px; min-width: 0; padding: 0 2px; border: 0; border-radius: 9px; background: none; color: var(--ink-3); font: inherit; font-size: 10.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; transition: background .2s, color .2s; }
	.pz-track button.past { color: var(--ok); }
	.pz-track button.now { background: var(--ink); color: var(--bg); box-shadow: 2px 2px 0 var(--g2, #f25a90); }
	.pz-track button:disabled { cursor: default; }
	.pz-post { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px; border-radius: 14px; background: var(--bg); color: inherit; text-decoration: none; }
	.pz-th { width: 40px; height: 52px; flex: none; border-radius: 9px; background: radial-gradient(120% 90% at 20% 10%, var(--g2, #f25a90), transparent 60%), radial-gradient(120% 100% at 100% 100%, var(--g1, #9c7bff), transparent 60%), var(--surface-2); background-size: cover; background-position: center; }
	.pz-post > span:last-child { display: grid; gap: 2px; min-width: 0; }
	.pz-post b { font-size: 13.5px; }
	.pz-post small { font-size: 12px; color: var(--ink-3); }
	.pz-x { display: grid; gap: 10px; margin: 0; padding: 2px 0 0; border: 0; min-width: 0; }
	.pz-rm { justify-self: start; }
	.pz-add { display: grid; gap: 10px; margin-top: 18px; }
	.pz-add > span { font-size: 10.5px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	.pz-add > div { display: flex; flex-wrap: wrap; gap: 8px; }
	.pz-add button { height: 36px; padding: 0 13px; border: 1px dashed var(--line-strong); border-radius: 999px; background: none; color: var(--ink); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
	.pz-add button:active { transform: scale(.96); }
</style>
