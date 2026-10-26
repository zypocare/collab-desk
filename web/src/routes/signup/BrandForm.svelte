<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '#lib/auth.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { claimInvite } from '#lib/invite.ts';
	import type { Account } from '#lib/types.ts';
	import { CATS, errMessage, phoneOk } from '#lib/util.ts';

	// Step 2 for a brand: the company once, then straight to the dashboard. Each creator later gets a copy.
	let { email }: { email: string } = $props();

	const ROLES = ['Founder', 'Marketing', 'Agency working for a brand', 'Other'];
	const GOALS = ['Find new creators', 'Manage creators I already work with', 'Run a campaign with several creators'];
	const acc = auth.account?.role === 'brand' ? auth.account : null;
	let f = $state({
		name: acc?.brand?.name ?? '',
		category: acc?.brand?.category ?? 'Beauty',
		website: acc?.brand?.website ?? '',
		instagram: acc?.brand?.instagram ?? '',
		you: acc?.full_name ?? '',
		role: '',
		phone: acc?.phone ?? '',
		city: '',
		goals: ['Find new creators'] as string[],
		legal: '',
		gstin: ''
	});
	let busy = $state(false);
	let error = $state('');

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!f.name.trim()) return (error = 'Add your brand name.');
		if (!f.you.trim()) return (error = 'Add your name so creators know who they are talking to.');
		if (f.phone.trim() && !phoneOk(f.phone)) return (error = 'That phone number looks short. Add the full number, with +91 for India.');
		busy = true;
		const { data, error: err } = await supabase.rpc('brand_signup', {
			p_name: f.name.trim(),
			p_category: f.category,
			p_website: f.website.trim(),
			p_instagram: f.instagram.trim(),
			p_full_name: f.you.trim(),
			p_role: f.role,
			p_phone: f.phone.trim(),
			p_city: f.city.trim(),
			p_goals: f.goals,
			p_legal_name: f.legal.trim(),
			p_gstin: f.gstin.trim()
		});
		if (err) {
			busy = false;
			return (error = errMessage(err));
		}
		auth.account = data as Account;
		await claimInvite('brand', f.name.trim());
		goto('/brand', { replaceState: true });
	}
</script>

<form class="su-plain" onsubmit={submit} novalidate>
	<ol class="su-steps" aria-label="Steps" style="--c:var(--g1)">
		<li class="done">✓ Email confirmed</li>
		<li class="on" aria-current="step">2 Your brand</li>
		<li>3 Your dashboard</li>
	</ol>
	<div style="display:grid;gap:6px">
		<h1 class="su-h1">Tell us about <em>your brand</em></h1>
		<p class="su-lead">Creators see this on every request you send, and it goes on the invoices they send you. Signed in as {email}.</p>
	</div>
	<div class="su-card su-wide">
		<div class="su-grid">
			<div class="su-f"><label for="bf-n">Brand name</label><input class="su-in" id="bf-n" autocomplete="organization" bind:value={f.name} /></div>
			<div class="su-f">
				<label for="bf-cat">Category</label>
				<select class="su-in" id="bf-cat" bind:value={f.category}>{#each CATS as c (c)}<option>{c}</option>{/each}</select>
			</div>
			<div class="su-f"><label for="bf-web">Website</label><input class="su-in" id="bf-web" type="url" inputmode="url" placeholder="https://" bind:value={f.website} /></div>
			<div class="su-f">
				<label for="bf-ig">Brand Instagram</label>
				<div class="su-pre"><span>@</span><input class="su-in" id="bf-ig" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={f.instagram} oninput={() => (f.instagram = f.instagram.replace(/^@+/, ''))} /></div>
			</div>
			<div class="su-f"><label for="bf-you">Your name</label><input class="su-in" id="bf-you" autocomplete="name" bind:value={f.you} /></div>
			<div class="su-f">
				<label for="bf-role">Your role</label>
				<select class="su-in" id="bf-role" bind:value={f.role}><option value="">Choose</option>{#each ROLES as r (r)}<option>{r}</option>{/each}</select>
			</div>
			<div class="su-f"><label for="bf-ph">Phone or WhatsApp</label><input class="su-in" id="bf-ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="+91" bind:value={f.phone} /></div>
			<div class="su-f"><label for="bf-city">City</label><input class="su-in" id="bf-city" autocomplete="address-level2" bind:value={f.city} /></div>
			<fieldset class="su-chips su-full" style="--c:var(--g1)">
				<legend class="su-lbl">What do you want to do first?</legend>
				<div>
					{#each GOALS as g (g)}
						<button type="button" class="su-chip" aria-pressed={f.goals.includes(g)} onclick={() => (f.goals = f.goals.includes(g) ? f.goals.filter((x) => x !== g) : [...f.goals, g])}>{f.goals.includes(g) ? '✓ ' : ''}{g}</button>
					{/each}
				</div>
			</fieldset>
			<details class="su-more su-full">
				<summary>Billing details <span>(optional now; needed for GST input credit)</span></summary>
				<div class="su-grid">
					<div class="su-f"><label for="bf-legal">Legal company name</label><input class="su-in" id="bf-legal" bind:value={f.legal} /></div>
					<div class="su-f"><label for="bf-gst">GSTIN</label><input class="su-in" id="bf-gst" autocapitalize="characters" maxlength="15" placeholder="29ABCDE1234F1Z5" bind:value={f.gstin} /></div>
				</div>
			</details>
		</div>
	</div>
	{#if error}<p class="su-err" role="alert">{error}</p>{/if}
	<div class="su-row">
		<button class="su-neo su-go" disabled={busy}>{busy ? 'One moment…' : 'Create my brand account'}</button>
		<span class="su-hint">You go straight to your dashboard. Add more brands and teammates later.</span>
	</div>
</form>
