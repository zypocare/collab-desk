<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { loadStudio, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// Clears test data so she can start fresh. Owner only, and only after typing RESET.
	let word = $state('');
	let logins = $state(true);
	let busy = $state(false);
	const owner = $derived(studio.me?.team_role === 'owner');

	// Uploaded drafts and brand files live in storage, one folder per collab.
	async function clearBucket(bucket: string) {
		const { data: folders } = await supabase.storage.from(bucket).list('', { limit: 1000 });
		for (const f of folders ?? []) {
			const { data: items } = await supabase.storage.from(bucket).list(f.name, { limit: 1000 });
			const paths = (items ?? []).map((x) => `${f.name}/${x.name}`);
			if (paths.length) await supabase.storage.from(bucket).remove(paths);
		}
	}

	async function reset() {
		if (word !== 'RESET') return;
		const ok = await ask({
			title: 'Delete all collabs and brands?',
			body: `${studio.collabs.length} collabs and ${studio.brands.length} brands, with their quotes, drafts, invoices, messages and files, are deleted for good.${logins ? ' Brand sign-ins are removed too.' : ''} Your profile, rates, packages, settings, team and Instagram stay.`,
			ok: 'Delete everything',
			cancel: 'Keep my data',
			danger: true
		});
		if (!ok) return;
		busy = true;
		try {
			await clearBucket('drafts');
			await clearBucket('deliveries');
			const { data, error } = await supabase.rpc('reset_studio_data', { p_confirm: 'RESET', p_brand_logins: logins });
			if (error) throw error;
			const r = data as { collabs: number; brands: number; logins: number };
			await loadStudio();
			word = '';
			toast(`Fresh start: removed ${r.collabs} collabs, ${r.brands} brands${r.logins ? ` and ${r.logins} brand sign-ins` : ''}.`, 'check');
		} catch (e) {
			toast(`Couldn't reset: ${errMessage(e)}`, 'alert');
		}
		busy = false;
	}
</script>

{#if owner}
	<section class="panel rv danger-zone" style="--i:5">
		<div class="panel-h"><h2>Start fresh</h2><small>clear test data</small></div>
		<div class="form-b" style="display:block">
			<p class="hint" style="margin:0 0 12px">Deletes <b>every collab and brand</b> (quotes, drafts, invoices, messages, files, costs, reviews, bank credits). Keeps your profile, rates, packages, settings, team and Instagram. This can't be undone.</p>
			<label class="check-row" style="padding:0 0 12px"><input type="checkbox" class="cbx" bind:checked={logins} /><span>Also remove brand sign-ins (test brand accounts)</span></label>
			<div class="reset-row">
				<input class="inp" placeholder="Type RESET" aria-label="Type RESET to confirm" autocomplete="off" bind:value={word} />
				<button class="btn danger-solid" disabled={busy || word !== 'RESET'} onclick={reset}>{#if busy}<span class="spinner"></span>{:else}<Icon name="alert" />{/if}Delete all data</button>
			</div>
		</div>
	</section>
{/if}
