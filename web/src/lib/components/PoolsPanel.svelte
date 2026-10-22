<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ask, askNote } from '../confirm.svelte';
	import { deletePool, loadPools, pools, removeMember, savePool, updateMember } from '../campaigns.svelte';
	import { toast } from '../ui.svelte';
	import { compact, errMessage } from '../util';
	import type { PoolMember } from '../types';
	import Avatar from './Avatar.svelte';
	import Icon from './Icon.svelte';
	import InviteCreator from './InviteCreator.svelte';

	// Pools: the brand's own saved groups of creators, with private notes and tags.
	const picked = $derived(page.url.searchParams.get('pool') ?? '');
	const pool = $derived(pools.list.find((p) => p.id === picked) ?? pools.list[0] ?? null);
	let naming = $state(false);
	let newName = $state('');
	let inviting = $state(false);
	let editing = $state<string | null>(null);
	let note = $state('');
	let tags = $state('');

	onMount(() => {
		loadPools().catch((e) => toast(errMessage(e), 'alert'));
	});
	const open = (id: string) => goto(`?tab=pools&pool=${id}`, { replaceState: true });

	async function create(e: SubmitEvent) {
		e.preventDefault();
		try {
			const id = await savePool(newName);
			newName = '';
			naming = false;
			open(id);
		} catch (err) {
			toast(errMessage(err), 'alert');
		}
	}
	async function rename() {
		if (!pool) return;
		const name = await askNote({ title: `Rename ${pool.name}`, note: 'New name', placeholder: pool.name, ok: 'Rename' });
		if (!name || name === pool.name) return;
		try {
			await savePool(name, pool.id);
		} catch (err) {
			toast(errMessage(err), 'alert');
		}
	}
	async function remove() {
		if (!pool) return;
		if (!(await ask({ title: `Delete ${pool.name}?`, body: 'The creators stay on Miracle and your requests to them are kept. Only this list goes.', ok: 'Delete pool', danger: true }))) return;
		await deletePool(pool.id).catch((err) => toast(errMessage(err), 'alert'));
	}
	function edit(m: PoolMember) {
		editing = m.id;
		note = m.note;
		tags = m.tags.join(', ');
	}
	async function saveEdit(e: SubmitEvent) {
		e.preventDefault();
		if (!editing) return;
		try {
			await updateMember(editing, note, tags.split(',').map((t) => t.trim()).filter(Boolean));
			editing = null;
		} catch (err) {
			toast(errMessage(err), 'alert');
		}
	}
	const label = (m: PoolMember) => (m.creator ? m.creator.name : `@${m.handle}`);
	const sub = (m: PoolMember) =>
		m.creator
			? [m.creator.niche?.split(',')[0]?.trim(), m.creator.city].filter(Boolean).join(' · ') + (m.joined ? ' · joined Miracle' : '')
			: 'Not on Miracle yet · invited';
</script>

{#if !pools.loaded}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<div class="pl">
		<aside class="pl-list" aria-label="Your pools">
			{#each pools.list as p (p.id)}
				<button class="pl-p" class:on={pool?.id === p.id} onclick={() => open(p.id)}>
					<b>{p.name}</b>
					<small>{p.members.length} creator{p.members.length === 1 ? '' : 's'}{p.members.some((m) => !m.creator) ? ` · ${p.members.filter((m) => !m.creator).length} not on Miracle yet` : ''}</small>
				</button>
			{/each}
			{#if naming}
				<form class="pl-new" onsubmit={create}>
					<input bind:value={newName} placeholder="Pool name, e.g. Diwali beauty" maxlength="80" aria-label="Pool name" />
					<button class="pl-neo pl-grad" type="submit" disabled={!newName.trim()}>Make pool</button>
				</form>
			{:else}
				<button class="pl-p pl-add" onclick={() => (naming = true)}>+ New pool</button>
			{/if}
		</aside>

		<section class="pl-main" aria-label={pool?.name ?? 'Pool'}>
			{#if !pool}
				<div class="empty-card"><h2>Make your first pool</h2><p>Save groups of creators, like "Bangalore food" or "Diwali beauty", then send a campaign to a whole pool at once.</p><button class="btn grad" onclick={() => (naming = true)}>New pool</button></div>
			{:else}
				<div class="pl-h">
					<div><h2>{pool.name}</h2><small>Only you see this pool, its notes and tags</small></div>
					<div class="pl-acts">
						<a class="pl-neo pl-ghost" href="?tab=discover&pool={pool.id}">Add creators</a>
						<button class="pl-neo pl-ghost" onclick={() => (inviting = true)}>Invite by @handle</button>
						<a class="pl-neo pl-grad" href="/brand/campaigns/new?pool={pool.id}">Start a campaign</a>
					</div>
				</div>
				{#if !pool.members.length}
					<p class="pl-none">No creators yet. Add them from Discover or from your creators, or invite someone by their Instagram handle.</p>
				{:else}
					<div class="pl-t" role="table" aria-label="Creators in {pool.name}">
						<div class="pl-r pl-th" role="row"><span role="columnheader">Creator</span><span role="columnheader">Followers</span><span role="columnheader">Eng.</span><span role="columnheader">Your note</span><span role="columnheader"><span class="sr">Actions</span></span></div>
						{#each pool.members as m (m.id)}
							<div class="pl-r" role="row">
								<span class="pl-who" role="cell">
									{#if m.creator}<Avatar name={m.creator.name} src={m.creator.photo} size="40px" />{:else}<span class="pl-at" aria-hidden="true">@</span>{/if}
									<span><b>{label(m)}</b><small class:warn={!m.creator}>{sub(m)}</small></span>
								</span>
								<span role="cell">{m.creator?.followers != null ? compact(m.creator.followers) : '—'}</span>
								<span role="cell">{m.creator?.engagement != null ? `${Number(m.creator.engagement).toFixed(1)}%` : '—'}</span>
								<span class="pl-tags" role="cell">
									{#if editing === m.id}
										<form class="pl-edit" onsubmit={saveEdit}>
											<input bind:value={note} placeholder="Note" maxlength="300" aria-label="Note" />
											<input bind:value={tags} placeholder="Tags, with commas" aria-label="Tags" />
											<button class="pl-mini" type="submit">Save</button>
										</form>
									{:else}
										{#each m.tags as t (t)}<span class="pl-tag">{t}</span>{/each}
										{#if m.note}<span class="pl-note">{m.note}</span>{/if}
										{#if !m.note && !m.tags.length}<button class="pl-link" onclick={() => edit(m)}>Add a note</button>{/if}
									{/if}
								</span>
								<span class="pl-act" role="cell">
									<button class="pl-ib" onclick={() => edit(m)} aria-label="Edit note and tags for {label(m)}"><Icon name="edit" /></button>
									<button class="pl-ib" onclick={() => removeMember(m.id).catch((e) => toast(errMessage(e), 'alert'))} aria-label="Remove {label(m)} from the pool"><Icon name="x" /></button>
								</span>
							</div>
						{/each}
					</div>
				{/if}
				<div class="pl-foot"><button class="pl-link" onclick={rename}>Rename pool</button><button class="pl-link" onclick={remove}>Delete pool</button></div>
			{/if}
		</section>
	</div>
	{#if inviting && pool}<InviteCreator pool={pool.id} poolName={pool.name} onclose={() => (inviting = false)} />{/if}
{/if}

<style>
	.pl {
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr);
		gap: 22px;
	}
	.pl-list {
		display: grid;
		align-content: start;
		gap: 10px;
	}
	.pl-p {
		display: grid;
		gap: 4px;
		padding: 16px 18px;
		border: 0;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.pl-p.on {
		background:
			radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g2) 16%, transparent), transparent 60%),
			var(--surface);
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.pl-p b {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 24px;
		line-height: 1.1;
	}
	.pl-p small {
		font-size: 13px;
		color: var(--ink-3);
	}
	.pl-add {
		background: transparent;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
		font-weight: 600;
	}
	.pl-new {
		display: grid;
		gap: 8px;
	}
	.pl-new input,
	.pl-edit input {
		height: 44px;
		padding: 0 12px;
		border: 0;
		background: color-mix(in oklab, var(--ink) 4%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		font: 14px/1 var(--f-body);
		outline: 0;
	}
	.pl-new input:focus,
	.pl-edit input:focus {
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.pl-main {
		display: grid;
		align-content: start;
		gap: 14px;
		min-width: 0;
	}
	.pl-h {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
	}
	.pl-h > div:first-child {
		flex: 1;
		min-width: 200px;
		display: grid;
		gap: 2px;
	}
	.pl-h h2 {
		margin: 0;
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 34px;
		line-height: 1;
	}
	.pl-h small {
		font-size: 13px;
		color: var(--ink-3);
	}
	.pl-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.pl-neo {
		height: 44px;
		display: inline-grid;
		place-items: center;
		padding: 0 16px;
		border: 0;
		cursor: pointer;
		text-decoration: none;
		font: 700 12px/1 var(--f-body);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.pl-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 4px 4px 0 #6a4bc9;
	}
	.pl-grad:disabled {
		opacity: 0.6;
	}
	.pl-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1.5px var(--ink-3),
			4px 4px 0 var(--line);
	}
	.pl-neo:hover {
		transform: translate(-2px, -2px);
	}
	.pl-neo:active {
		transform: translate(4px, 4px);
		box-shadow: none;
	}
	.pl-none {
		margin: 0;
		padding: 18px;
		border-radius: 18px;
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink-3);
		font-size: 14px;
	}
	.pl-t {
		display: grid;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.pl-r {
		display: grid;
		grid-template-columns: minmax(0, 2.2fr) minmax(0, 0.9fr) minmax(0, 0.7fr) minmax(0, 1.8fr) 84px;
		gap: 12px;
		align-items: center;
		padding: 12px 18px;
	}
	.pl-r + .pl-r {
		border-top: 1px solid var(--line);
	}
	.pl-th {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.pl-who {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.pl-who > span:last-child {
		min-width: 0;
		display: grid;
	}
	.pl-who b {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pl-who small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.pl-who small.warn {
		color: var(--g3);
	}
	.pl-at {
		width: 40px;
		height: 40px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
		color: var(--ink-3);
	}
	.pl-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		min-width: 0;
	}
	.pl-tag {
		font-size: 12px;
		padding: 4px 9px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--g1) 16%, transparent);
		color: var(--ink-2);
	}
	.pl-note {
		font-size: 13px;
		color: var(--ink-2);
	}
	.pl-edit {
		display: grid;
		gap: 6px;
		width: 100%;
	}
	.pl-mini {
		justify-self: start;
		height: 34px;
		padding: 0 12px;
		border: 0;
		background: var(--ink);
		color: var(--bg);
		font: 700 11px/1 var(--f-body);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.pl-act {
		display: flex;
		justify-content: flex-end;
		gap: 4px;
	}
	.pl-ib {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--ink-3);
		cursor: pointer;
	}
	.pl-ib:hover {
		background: color-mix(in oklab, var(--ink) 6%, transparent);
		color: var(--ink);
	}
	.pl-ib :global(.ic) {
		width: 16px;
		height: 16px;
	}
	.pl-link {
		border: 0;
		padding: 0;
		background: none;
		color: var(--ink-2);
		font: inherit;
		font-size: 13px;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.pl-foot {
		display: flex;
		gap: 18px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	@media (max-width: 900px) {
		.pl {
			grid-template-columns: minmax(0, 1fr);
		}
		.pl-list {
			display: flex;
			overflow-x: auto;
			scrollbar-width: none;
		}
		.pl-p {
			flex: none;
			min-width: 200px;
		}
		.pl-th {
			display: none;
		}
		.pl-r {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.pl-r > :nth-child(2),
		.pl-r > :nth-child(3) {
			display: none;
		}
		.pl-tags {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
