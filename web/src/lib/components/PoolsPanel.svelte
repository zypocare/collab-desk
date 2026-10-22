<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ask, askNote } from '../confirm.svelte';
	import { deletePool, loadPools, pools, removeMember, savePool, updateMember } from '../campaigns.svelte';
	import { toast } from '../ui.svelte';
	import { compact, errMessage } from '../util';
	import type { PoolMember } from '../types';
	import Ticket from './Ticket.svelte';
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

<!-- Pools in the creator app's pieces: the pools as filter chips, the open pool as the glowing card
     with its actions, then each creator in it as a ticket. -->
{#if !pools.loaded}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<div class="m-stages" role="tablist" aria-label="Your pools">
		{#each pools.list as p, k (p.id)}
			<button role="tab" aria-selected={pool?.id === p.id} class:on={pool?.id === p.id} onclick={() => open(p.id)}><i class="dt" style="--hue:var(--m{(k % 6) + 1})"></i>{p.name}<span>{p.members.length}</span></button>
		{/each}
		<button onclick={() => (naming = true)}><i class="dt" style="--hue:var(--accent)"></i>+ New pool</button>
	</div>
	{#if naming}
		<form class="panel pl-form" onsubmit={create}>
			<input class="inp" bind:value={newName} placeholder="Pool name, e.g. Diwali beauty" maxlength="80" aria-label="Pool name" />
			<div class="pl-row"><button class="btn primary" type="submit" disabled={!newName.trim()}>Make pool</button><button type="button" class="btn ghost" onclick={() => (naming = false)}>Cancel</button></div>
		</form>
	{/if}

	{#if !pool}
		<div class="clear hero-card glow m-none">
			<div class="mesh" aria-hidden="true"></div>
			<span class="clear-ic"><Icon name="layers" /></span>
			<b>Make your first pool</b>
			<small>Save groups of creators, like "Bangalore food" or "Diwali beauty", then send a campaign to a whole pool at once.</small>
			<div class="clear-acts"><button class="glass-chip" onclick={() => (naming = true)}><Icon name="plus" />New pool</button></div>
		</div>
	{:else}
		<section class="hero-card glow m-hero m-pipe" aria-label={pool.name}>
			<div class="mesh" aria-hidden="true"></div>
			<div class="hc-in">
				<div class="hc-top">
					<span class="hc-eb">{pool.name}</span>
					<button class="glass-chip" onclick={rename}><Icon name="edit" />Rename</button>
				</div>
				<div class="hc-val">{pool.members.length}</div>
				<div class="hc-sub">creator{pool.members.length === 1 ? '' : 's'} in this pool{pool.members.some((m) => !m.creator) ? ` · ${pool.members.filter((m) => !m.creator).length} not on Miracle yet` : ''} · only you see it</div>
				<div class="hc-foot">
					<a href="?tab=discover&pool={pool.id}"><small><span class="dt" style="--hue:var(--g2)"></span>Add</small><b>Creators</b></a>
					<button onclick={() => (inviting = true)}><small><span class="dt" style="--hue:var(--g1)"></span>Invite</small><b>@handle</b></button>
					<a href="/brand/campaigns/new?pool={pool.id}"><small><span class="dt" style="--hue:var(--ok)"></span>Start</small><b>Campaign</b></a>
				</div>
			</div>
		</section>
		<div class="tks m-plist">
			{#each pool.members as m, i (m.id)}
				<div class="pl-one">
					<Ticket
						name={label(m)}
						sub={sub(m)}
						money={m.creator?.followers != null ? compact(m.creator.followers) : ''}
						moneySub={m.creator?.followers != null ? (m.creator.engagement != null ? `${Number(m.creator.engagement).toFixed(1)}% eng.` : 'followers') : ''}
						task={m.note || (m.tags.length ? m.tags.join(' · ') : 'No note yet')}
						status={m.creator ? 'On Miracle' : 'Invited, not on Miracle yet'}
						tone={m.creator ? 'ok' : 'warn'}
						{i}
					>
						<button class="btn" onclick={() => edit(m)} aria-label="Edit note and tags for {label(m)}"><Icon name="edit" /></button>
						<button class="btn" onclick={() => removeMember(m.id).catch((e) => toast(errMessage(e), 'alert'))} aria-label="Remove {label(m)} from the pool"><Icon name="x" /></button>
					</Ticket>
					{#if editing === m.id}
						<form class="panel pl-form" onsubmit={saveEdit}>
							<input class="inp" bind:value={note} placeholder="Note" maxlength="300" aria-label="Note" />
							<input class="inp" bind:value={tags} placeholder="Tags, with commas" aria-label="Tags" />
							<div class="pl-row"><button class="btn primary" type="submit">Save</button><button type="button" class="btn ghost" onclick={() => (editing = null)}>Cancel</button></div>
						</form>
					{/if}
				</div>
			{:else}
				<div class="clear hero-card glow m-none">
					<div class="mesh" aria-hidden="true"></div>
					<span class="clear-ic"><Icon name="users" /></span>
					<b>No creators yet</b>
					<small>Add them from Discover or from your creators, or invite someone by their Instagram handle.</small>
					<div class="clear-acts"><a class="glass-chip" href="?tab=discover&pool={pool.id}"><Icon name="search" />Add creators</a></div>
				</div>
			{/each}
		</div>
		<p class="hint" style="margin:14px 4px 0"><button class="lnk" onclick={remove}>Delete this pool</button></p>
	{/if}
	{#if inviting && pool}<InviteCreator pool={pool.id} poolName={pool.name} onclose={() => (inviting = false)} />{/if}
{/if}

<style>
	.pl-one {
		display: grid;
		gap: 10px;
	}
	.pl-form {
		display: grid;
		gap: 10px;
		padding: 16px;
		margin-bottom: 14px;
	}
	.pl-row {
		display: flex;
		gap: 10px;
	}
	.lnk {
		border: 0;
		background: none;
		padding: 0;
		color: var(--bad);
		font: inherit;
		cursor: pointer;
	}
</style>
