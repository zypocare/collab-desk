<script lang="ts">
	import { untrack } from 'svelte';
	import { refreshAccount } from '#lib/auth.svelte.ts';
	import { LANGUAGES } from '#lib/languages.ts';
	import { supabase } from '#lib/supabase.ts';
	import { claimInvite } from '#lib/invite.ts';
	import type { CreatorRequest } from '#lib/types.ts';
	import { errMessage } from '#lib/util.ts';

	// Step 2 for a creator: who they are, for the review and for brands later. No link yet: that comes after approval.
	let { email, request = null }: { email: string; request?: CreatorRequest | null } = $props();

	const NICHES = ['Beauty', 'Skincare', 'Fashion', 'Jewellery', 'Food & drink', 'Travel', 'Fitness', 'Wellness', 'Tech', 'Lifestyle', 'Comedy & memes', 'Parenting', 'Home', 'Other'];
	const FOLLOWERS = ['Under 10K', '10K to 50K', '50K to 1 lakh', '1 lakh to 5 lakh', 'Over 5 lakh'];
	const COLLABS = ['None yet', '1 to 10', 'More than 10'];
	const HEARD = ['Another creator', 'A brand', 'Instagram', 'A friend', 'Other'];

	// Sent before (and declined): the form comes back as they sent it.
	const r = untrack(() => request);
	let f = $state({
		name: r?.name ?? '',
		handle: r?.handle ?? '',
		whatsapp: r?.whatsapp ?? '',
		city: r?.city ?? '',
		niches: r?.signup?.niches ?? (r?.niche ? r.niche.split(',').map((x) => x.trim()).filter(Boolean) : []),
		languages: r?.languages ?? ['English'],
		followers: r?.signup?.followers ?? '',
		collabs: r?.signup?.collabs ?? '',
		heard: r?.signup?.heard ?? '',
		note: r?.note ?? ''
	});
	let busy = $state(false);
	let error = $state('');

	const linkIdea = $derived(f.handle.trim().replace(/^@+/, '').toLowerCase().replace(/[._\s]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30));
	const toggle = (list: string[], v: string, max = 99) => (list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		const handle = f.handle.trim().replace(/^@+/, '');
		if (f.name.trim().length < 2) return (error = 'Add your name as brands should see it.');
		if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return (error = 'Add your Instagram handle (letters, numbers, dots and underscores).');
		if (!/^\d{10,13}$/.test(f.whatsapp.replace(/\D/g, ''))) return (error = 'Add your WhatsApp number, with the country code if outside India.');
		if (!f.city.trim()) return (error = 'Add your city.');
		if (!f.niches.length) return (error = 'Pick what you create (up to 3).');
		if (!f.followers) return (error = 'Pick roughly how many followers you have.');
		busy = true;
		const { error: err } = await supabase.rpc('creator_signup', {
			p_name: f.name.trim(),
			p_handle: handle,
			p_whatsapp: f.whatsapp.trim(),
			p_city: f.city.trim(),
			p_niches: f.niches,
			p_languages: f.languages,
			p_followers: f.followers,
			p_collabs: f.collabs,
			p_heard: f.heard,
			p_note: f.note.trim()
		});
		if (err) {
			busy = false;
			return (error = err.code === '23505' ? `@${handle} is already on Miracle. If it's yours, write to support@miracleapp.live and we'll sort it out.` : errMessage(err));
		}
		await claimInvite('creator', f.name.trim());
		await refreshAccount();
		busy = false;
	}
</script>

<form class="su-plain" onsubmit={submit} novalidate>
	<ol class="su-steps" aria-label="Steps">
		<li class="done">✓ Email confirmed</li>
		<li class="on" aria-current="step">2 About you</li>
		<li>3 Review by Miracle</li>
		<li>4 Pick your link</li>
	</ol>
	<div style="display:grid;gap:6px">
		<h1 class="su-h1">Tell us about <em>you</em></h1>
		<p class="su-lead">This helps us review your profile, and helps brands find you later. Signed in as {email}.</p>
	</div>
	<div class="su-card su-wide">
		<div class="su-grid">
			<div class="su-f"><label for="cf-name">Your name <span class="su-hint">(as brands see it)</span></label><input class="su-in" id="cf-name" autocomplete="name" bind:value={f.name} /></div>
			<div class="su-f">
				<label for="cf-ig">Instagram handle</label>
				<div class="su-pre"><span>@</span><input class="su-in" id="cf-ig" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="31" bind:value={f.handle} oninput={() => (f.handle = f.handle.replace(/^@+/, ''))} /></div>
			</div>
			<div class="su-f"><label for="cf-wa">WhatsApp number</label><input class="su-in" id="cf-wa" type="tel" inputmode="tel" autocomplete="tel" placeholder="+91" bind:value={f.whatsapp} /></div>
			<div class="su-f"><label for="cf-city">City</label><input class="su-in" id="cf-city" autocomplete="address-level2" bind:value={f.city} /></div>
			<fieldset class="su-chips su-full">
				<legend class="su-lbl">What you create <span class="su-hint">(pick up to 3)</span></legend>
				<div>
					{#each NICHES as n (n)}
						<button type="button" class="su-chip" aria-pressed={f.niches.includes(n)} disabled={!f.niches.includes(n) && f.niches.length >= 3} onclick={() => (f.niches = toggle(f.niches, n, 3))}>{f.niches.includes(n) ? '✓ ' : ''}{n}</button>
					{/each}
				</div>
			</fieldset>
			<fieldset class="su-chips su-full">
				<legend class="su-lbl">Languages you post in</legend>
				<div>
					{#each LANGUAGES as l (l)}
						<button type="button" class="su-chip" aria-pressed={f.languages.includes(l)} onclick={() => (f.languages = toggle(f.languages, l))}>{f.languages.includes(l) ? '✓ ' : ''}{l}</button>
					{/each}
				</div>
			</fieldset>
			<div class="su-f">
				<label for="cf-f">Followers</label>
				<select class="su-in" id="cf-f" bind:value={f.followers}><option value="" disabled>Choose</option>{#each FOLLOWERS as o (o)}<option>{o}</option>{/each}</select>
			</div>
			<div class="su-f">
				<label for="cf-c">Paid collabs so far</label>
				<select class="su-in" id="cf-c" bind:value={f.collabs}><option value="">Choose</option>{#each COLLABS as o (o)}<option>{o}</option>{/each}</select>
			</div>
			<div class="su-f">
				<label for="cf-h">How did you hear about Miracle?</label>
				<select class="su-in" id="cf-h" bind:value={f.heard}><option value="">Choose</option>{#each HEARD as o (o)}<option>{o}</option>{/each}</select>
			</div>
			<div class="su-f"><label for="cf-n">Anything we should know <span class="su-hint">(optional)</span></label><input class="su-in" id="cf-n" placeholder="A manager, a second account…" maxlength="600" bind:value={f.note} /></div>
		</div>
	</div>
	<div class="su-note">
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;color:var(--g3)"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"></path><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"></path></svg>
		<span>You'll pick your own link, like <b>{linkIdea || 'yourname'}.miracleapp.live</b>, once the Miracle team approves your profile.</span>
	</div>
	{#if error}<p class="su-err" role="alert">{error}</p>{/if}
	<div class="su-row">
		<button class="su-neo su-go" disabled={busy}>{busy ? 'Sending…' : request ? 'Send again for review' : 'Send for review'}</button>
		<span class="su-hint">You can change all of this later in Settings.</span>
	</div>
</form>
