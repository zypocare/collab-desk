<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { INDIAN_STATES } from '../invoice';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	let gstin = $state('');
	let address = $state('');
	let stateName = $state('');
	let accounts = $state('');
	let busy = $state(false);
	let error = $state('');

	onMount(async () => {
		const { data } = await supabase.rpc('my_billing');
		if (data) ({ gstin, address, state: stateName, accounts_email: accounts } = data as { gstin: string; address: string; state: string; accounts_email: string });
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		busy = true;
		const { error: err } = await supabase.rpc('update_brand_billing', { p_gstin: gstin, p_address: address, p_state: stateName, p_accounts_email: accounts });
		busy = false;
		if (err) return (error = errMessage(err));
		toast('Billing details saved');
	}
</script>

<form onsubmit={submit} novalidate>
	<div class="fields">
		<div class="f"><label for="bb-gstin">GSTIN <span class="hint">(optional)</span></label><input class="inp" id="bb-gstin" placeholder="27AAACB1234C1Z5" bind:value={gstin} /></div>
		<div class="f">
			<label for="bb-state">State</label>
			<select class="inp" id="bb-state" bind:value={stateName}><option value="">Choose</option>{#each INDIAN_STATES as st (st)}<option value={st}>{st}</option>{/each}</select>
		</div>
		<div class="f span2"><label for="bb-addr">Billing address</label><textarea class="inp" id="bb-addr" rows="2" bind:value={address}></textarea></div>
		<div class="f span2"><label for="bb-acc">Accounts team email <span class="hint">(gets a copy of invoices)</span></label><input class="inp" id="bb-acc" type="email" placeholder="accounts@brand.com" bind:value={accounts} /></div>
	</div>
	{#if error}<div class="err" style="margin-top:12px">{error}</div>{/if}
	<div style="margin-top:18px;display:flex;justify-content:flex-end">
		<button class="btn primary" type="submit" disabled={busy}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Save billing details</button>
	</div>
</form>
