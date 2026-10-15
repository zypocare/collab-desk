<script lang="ts">
	import { auth, refreshAccount } from '../auth.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { CATS, errMessage } from '../util';
	import Icon from './Icon.svelte';

	let { onsaved, submitLabel = 'Save details' }: { onsaved?: () => void; submitLabel?: string } = $props();

	const acc = auth.account?.role === 'brand' ? auth.account : null;
	let name = $state(acc?.brand?.name ?? '');
	let instagram = $state(acc?.brand?.instagram ?? '');
	let website = $state(acc?.brand?.website ?? '');
	let category = $state(acc?.brand?.category ?? 'Beauty');
	let fullName = $state(acc?.full_name ?? '');
	let phone = $state(acc?.phone ?? '');
	let busy = $state(false);
	let error = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!name.trim()) return (error = 'Add your brand name.');
		if (!fullName.trim()) return (error = 'Add your name so we know who to reply to.');
		busy = true;
		const { error: err } = await supabase.rpc('register_brand', {
			p_name: name,
			p_instagram: instagram,
			p_website: website,
			p_category: category,
			p_full_name: fullName,
			p_phone: phone
		});
		if (err) {
			busy = false;
			error = errMessage(err);
			return;
		}
		await refreshAccount();
		busy = false;
		toast('Details saved');
		onsaved?.();
	}
</script>

<form onsubmit={submit} novalidate>
	<div class="fields">
		<div class="f"><label for="bd-name">Brand name</label><input class="inp" id="bd-name" autocomplete="organization" bind:value={name} /></div>
		<div class="f"><label for="bd-ig">Instagram handle</label><div class="pre"><span>@</span><input class="inp" id="bd-ig" placeholder="yourbrand" bind:value={instagram} /></div></div>
		<div class="f"><label for="bd-web">Website <span class="hint">(optional)</span></label><input class="inp" id="bd-web" placeholder="https://" bind:value={website} /></div>
		<div class="f"><label for="bd-cat">Category</label><select class="inp" id="bd-cat" bind:value={category}>{#each CATS as c (c)}<option value={c}>{c}</option>{/each}</select></div>
		<div class="f"><label for="bd-you">Your name</label><input class="inp" id="bd-you" autocomplete="name" bind:value={fullName} /></div>
		<div class="f"><label for="bd-phone">Phone or WhatsApp <span class="hint">(optional)</span></label><input class="inp" id="bd-phone" inputmode="tel" autocomplete="tel" bind:value={phone} /></div>
	</div>
	{#if error}<div class="err" style="margin-top:12px">{error}</div>{/if}
	<div style="margin-top:18px;display:flex;justify-content:flex-end">
		<button class="btn grad lg" type="submit" disabled={busy}>{#if busy}<span class="spinner"></span>Saving…{:else}<Icon name="check" />{submitLabel}{/if}</button>
	</div>
</form>
