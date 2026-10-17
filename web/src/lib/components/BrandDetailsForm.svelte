<script lang="ts">
	import { untrack } from 'svelte';
	import { auth, refreshAccount } from '../auth.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { CATS, errMessage, phoneOk } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	let { onsaved, submitLabel = 'Save details', isNew = false }: { onsaved?: () => void; submitLabel?: string; isNew?: boolean } = $props();

	const acc = auth.account?.role === 'brand' ? auth.account : null;
	// Starting values only (the page re-creates the form when switching to "add a brand").
	const start = untrack(() => (isNew ? null : acc?.brand));
	let name = $state(start?.name ?? '');
	let instagram = $state(start?.instagram ?? '');
	let website = $state(start?.website ?? '');
	let category = $state(start?.category ?? 'Beauty');
	let fullName = $state(acc?.full_name ?? '');
	let phone = $state(acc?.phone ?? '');
	let busy = $state(false);
	let error = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!name.trim()) return (error = 'Add your brand name.');
		if (!fullName.trim()) return (error = 'Add your name so we know who to reply to.');
		if (!phoneOk(phone)) return (error = 'That phone number doesn’t look right. Use digits, like +91 98450 00000, or leave it empty.');
		if (website.trim() && !/^(https?:\/\/)?[^\s/.]+\.[^\s]{2,}$/.test(website.trim())) return (error = 'That website doesn’t look right. Use something like brand.com, or leave it empty.');
		busy = true;
		const { error: err } = await supabase.rpc('register_brand', {
			p_name: name,
			p_instagram: instagram,
			p_website: website,
			p_category: category,
			p_full_name: fullName,
			p_phone: phone,
			p_new: isNew
		});
		if (err) {
			busy = false;
			error = errMessage(err);
			return;
		}
		await refreshAccount();
		busy = false;
		toast(isNew ? `${name.trim()} added. You're now working as ${name.trim()}.` : 'Details saved');
		onsaved?.();
	}
</script>

<form onsubmit={submit} novalidate>
	<div class="fields">
		<div class="f"><label for="bd-name">Brand name</label><input class="inp" id="bd-name" autocomplete="organization" bind:value={name} /></div>
		<div class="f"><label for="bd-ig">Instagram handle</label><div class="pre"><span>@</span><input class="inp" id="bd-ig" placeholder="yourbrand" bind:value={instagram} /></div></div>
		<div class="f"><label for="bd-web">Website <span class="hint">(optional)</span></label><input class="inp" id="bd-web" placeholder="https://" bind:value={website} /></div>
		<div class="f"><label for="bd-cat">Category</label><Select id="bd-cat" bind:value={category} options={CATS.map((c) => ({ value: c, label: c }))} /></div>
		<div class="f"><label for="bd-you">Your name</label><input class="inp" id="bd-you" autocomplete="name" bind:value={fullName} /></div>
		<div class="f"><label for="bd-phone">Phone or WhatsApp <span class="hint">(optional)</span></label><input class="inp" id="bd-phone" inputmode="tel" autocomplete="tel" bind:value={phone} /></div>
	</div>
	{#if error}<div class="err" style="margin-top:12px">{error}</div>{/if}
	<div style="margin-top:18px;display:flex;justify-content:flex-end">
		<button class="btn grad lg" type="submit" disabled={busy}>{#if busy}<span class="spinner"></span>Saving…{:else}<Icon name="check" />{submitLabel}{/if}</button>
	</div>
</form>
