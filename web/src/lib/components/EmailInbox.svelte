<script lang="ts">
	import { onMount } from 'svelte';
	import { gmailScript } from '../gmailScript';
	import { studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { copyText, ui } from '../ui.svelte';
	import Icon from './Icon.svelte';

	// Brand emails into the studio, through a small Gmail script with her key already filled in.
	type Row = { msg_id: string; sender: string; subject: string; collab_id: string | null; action: string; created_at: string };
	let recent = $state<Row[]>([]);
	const s = $derived(studio.settings!);
	const fnUrl = `${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')}/functions/v1`;
	const FILTER = 'collaboration OR collab OR barter OR "paid partnership" OR influencer OR "brand deal" OR campaign';

	onMount(async () => {
		const { data } = await supabase.from('inbound_emails').select('*').order('created_at', { ascending: false }).limit(5);
		recent = (data as Row[]) ?? [];
	});
	const what = (r: Row) => (r.action === 'new_request' ? 'New request' : r.action === 'message' ? 'Added to messages' : 'Skipped');
</script>

<section class="panel rv" style="--i:2">
	<div class="panel-h"><h2>Brand emails</h2><small>straight into your studio</small></div>
	<div class="form-b" style="display:block">
		<p class="hint" style="margin:0 0 12px">Brand emails you label <b>collab-desk</b> in Gmail come in by themselves: new ones become requests (brand, content, budget and dates picked up), replies land in that collab's messages. Bank "credited" alerts mark invoices paid too.</p>
		<ol class="steps">
			<li><span>Copy your Gmail script. Your private key is already in it.</span><button class="btn sm grad" onclick={() => copyText(gmailScript(fnUrl, s.inbox_token), 'Script copied. Keep it private.')}><Icon name="copy" />Copy script</button></li>
			<li><span>Open <a class="lnk" href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> with the Gmail brands write to. Paste it over everything, choose <b>setup</b> at the top, press <b>Run</b> and allow.</span></li>
			<li><span>Label brand emails <b>collab-desk</b>. To do it automatically: Gmail search with these words → <b>Create filter</b> → Apply the label.</span><button class="btn sm" onclick={() => copyText(FILTER, 'Filter words copied')}><Icon name="copy" />Filter words</button></li>
		</ol>
	</div>
	{#if recent.length}
		<div class="rv-list ap-log">
			<span class="lbl-t">Lately</span>
			{#each recent as r (r.msg_id)}
				<button class="rv-row" disabled={!r.collab_id} onclick={() => r.collab_id && (ui.openCollab = r.collab_id)}>
					<Icon name="mail" />
					<div><b>{r.subject || '(no subject)'}</b><small>{what(r)} · {r.sender}</small></div>
					<small>{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small>
				</button>
			{/each}
		</div>
	{/if}
</section>
