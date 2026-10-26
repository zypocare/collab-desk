<script lang="ts">
	import { studio } from '../studio.svelte';
	import { addLeadAsCollab } from '../leads';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';

	// Inside the AI assistant card on Today: possible collabs spotted in her Instagram DMs and not on
	// the board yet. The three most likely show; all of them are one tap away in Possible collabs.
	const SHOW = 3;
	// Likely collabs first, then the maybes; newest first within each.
	const leads = $derived([...studio.leads].sort((a, b) => Number(b.collab_flag === 'likely') - Number(a.collab_flag === 'likely')));
	const title = $derived(leads.length === 1 ? 'You might have a new collab' : `You might have ${leads.length} new collabs`);
	const more = $derived(leads.length - SHOW);
	let busy = $state<string | null>(null);

	/** "Add": the chat goes into Add a collab, where it's read and filled in. */
	async function add(igsid: string, username: string, name = '') {
		busy = igsid;
		await addLeadAsCollab(igsid, username, name);
		busy = null;
	}
</script>

{#if leads.length}
	<div class="ai-leads">
		<p class="ai-leads-h"><b>{title}</b>{#if leads.length > 1}<span>{leads.length}</span>{/if}</p>
		<ul>
			{#each leads.slice(0, SHOW) as t (t.igsid)}
				<li>
					<a class="ail-who" href="/studio/inbox/ig/{t.igsid}" title="Open the chat">
						<span class="lead-av">{#if t.picture}<img src={t.picture} alt="" referrerpolicy="no-referrer" />{:else}<Mono name={t.username || 'IG'} />{/if}</span>
						<span class="ail-t">
							<b>@{t.username || 'someone'}{#if t.collab_flag === 'likely'}<em>Likely</em>{/if}</b>
							<small>{t.collab_hint || (t.collab_flag === 'likely' ? 'May want to work with you' : 'Might be asking about a collab')}</small>
						</span>
					</a>
					<button class="ail-add" disabled={busy === t.igsid} onclick={() => add(t.igsid, t.username, t.name)} aria-label="Add @{t.username || 'this chat'} as a collab">
						{#if busy === t.igsid}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add
					</button>
				</li>
			{/each}
		</ul>
		<a class="ail-more" href="/studio/possible-collabs">{more > 0 ? `+${more} more · ` : ''}All possible collabs<Icon name="chevR" /></a>
	</div>
{/if}
