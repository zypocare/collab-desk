<script lang="ts">
	import { supabase } from '../supabase';
	import { studio } from '../studio.svelte';
	import { toast, ui } from '../ui.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';

	// Home: possible collabs spotted in her Instagram DMs and not on the board yet.
	let { phone = false }: { phone?: boolean } = $props();
	// Likely collabs first, then the maybes; newest first within each.
	const leads = $derived([...studio.leads].sort((a, b) => Number(b.collab_flag === 'likely') - Number(a.collab_flag === 'likely')));
	const title = $derived(leads.length === 1 ? 'You might have a new collab' : `You might have ${leads.length} new collabs`);
	let busy = $state<string | null>(null);

	/** "Add as collab": the chat goes into Add a collab, where it's read and filled in. */
	async function add(igsid: string, username: string) {
		busy = igsid;
		const { data, error } = await supabase.from('ig_dms').select('from_me, text').eq('igsid', igsid).order('created_at', { ascending: false }).limit(15);
		busy = null;
		if (error) return toast(error.message, 'alert');
		const me = studio.settings?.display_name || 'Me';
		ui.pasteText = (data ?? []).reverse().map((m) => `${m.from_me ? me : username || 'Brand'}: ${m.text}`).join('\n');
		ui.fromIg = igsid;
		ui.newCollab = true;
	}
</script>

{#if leads.length}
	<section class={phone ? 'hs leads-m' : 'panel leads rv'} style={phone ? '' : '--i:2'}>
		{#if phone}
			<header class="hs-h"><h2>{title}</h2><span class="ai-tag"><Icon name="spark" />AI</span></header>
		{:else}
			<div class="panel-h"><h2>{title} <span class="ai-tag"><Icon name="spark" />AI</span></h2><small>spotted in your Instagram DMs</small></div>
		{/if}
		<div class="lead-list">
			{#each leads.slice(0, 4) as t (t.igsid)}
				<div class="lead">
					<a class="lead-who" href="/studio/inbox/ig/{t.igsid}">
						<span class="lead-av">{#if t.picture}<img src={t.picture} alt="" referrerpolicy="no-referrer" />{:else}<Mono name={t.username || 'IG'} />{/if}</span>
						<span class="lead-t">
							<b>@{t.username || 'someone'} <span>{t.collab_flag === 'likely' ? 'may want to work with you' : 'might be asking about a collab'}</span></b>
							{#if t.collab_hint}<small>{t.collab_hint}</small>{/if}
						</span>
					</a>
					<span class="lead-acts">
						<a class="btn sm" href="/studio/inbox/ig/{t.igsid}">See message</a>
						<button class="btn sm grad" disabled={busy === t.igsid} onclick={() => add(t.igsid, t.username)}>{#if busy === t.igsid}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add as collab</button>
					</span>
				</div>
			{/each}
		</div>
		{#if leads.length > 4}<a class="lead-more" href="/studio/inbox">See all {leads.length} in Messages</a>{/if}
	</section>
{/if}
