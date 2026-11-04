<script lang="ts">
	import { untrack } from 'svelte';
	import { refreshAccount } from '#lib/auth.svelte.ts';
	import { LANGUAGES } from '#lib/languages.ts';
	import { supabase } from '#lib/supabase.ts';
	import { claimInvite } from '#lib/invite.ts';
	import type { CreatorRequest } from '#lib/types.ts';
	import { errMessage } from '#lib/util.ts';
	import { cleanSlug, forgetWantedSlug, wantedSlug } from '#lib/slug.ts';
	import LinkField from './LinkField.svelte';

	// Step 2 for a creator: who they are, for the review and for brands later, and her link (name.miracleapp.live),
	// which she must pick here, in the app as on the website. It's kept for her and opens once she's approved.
	// `onswitch`: a login that hasn't joined yet can go to the brand form instead.
	let { email, request = null, onswitch }: { email: string; request?: CreatorRequest | null; onswitch?: () => void } = $props();

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

	// Her link: the one she holds from a request sent before, the name she claimed on the website, or (until
	// she types her own) her Instagram handle.
	const mine = r?.slug ?? '';
	let slug = $state(mine || wantedSlug());
	let slugOk = $state(false);
	let slugTyped = untrack(() => !!slug);
	$effect(() => {
		const fromHandle = cleanSlug(f.handle);
		if (!slugTyped) slug = fromHandle;
	});
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
		if (!slug) return (error = 'Pick your link, like yourname.miracleapp.live.');
		if (!slugOk) return (error = `${slug}.miracleapp.live can't be used. Pick another link.`);
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
			p_note: f.note.trim(),
			p_slug: slug
		});
		if (err) {
			busy = false;
			return (error = err.code === '23505' ? `@${handle} is already on Miracle. If it's yours, write to support@miracleapp.live and we'll sort it out.` : errMessage(err));
		}
		forgetWantedSlug();
		await claimInvite('creator', f.name.trim());
		await refreshAccount();
		busy = false;
	}
</script>

<form class="su-plain" onsubmit={submit} novalidate>
	<ol class="su-steps" aria-label="Steps">
		<li class="done">✓ Email confirmed</li>
		<li class="on" aria-current="step">2 About you and your link</li>
		<li>3 Review by Miracle</li>
	</ol>
	<div style="display:grid;gap:6px">
		<h1 class="su-h1">Tell us about <em>you</em></h1>
		<p class="su-lead">This helps us review your profile, and helps brands find you later. Signed in as {email}.</p>
		{#if onswitch}<button type="button" class="su-link" style="justify-self:start" onclick={onswitch}>Joining as a brand? Switch</button>{/if}
	</div>
	<div class="su-card su-wide">
		<div class="su-grid">
			<div class="su-f"><label for="cf-name">Your name <span class="su-hint">(as brands see it)</span></label><input class="su-in" id="cf-name" autocomplete="name" bind:value={f.name} /></div>
			<div class="su-f">
				<label for="cf-ig">Instagram handle</label>
				<div class="su-pre"><span>@</span><input class="su-in" id="cf-ig" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="31" bind:value={f.handle} oninput={() => (f.handle = f.handle.replace(/^@+/, ''))} /></div>
			</div>
			<div onfocusin={() => (slugTyped = true)} style="display:contents"><LinkField bind:slug bind:ok={slugOk} {mine} name={f.name} handle={f.handle} /></div>
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
	{#if error}<p class="su-err" role="alert">{error}</p>{/if}
	<div class="su-row">
		<button class="su-neo su-go" disabled={busy}>{busy ? 'Setting up…' : request ? 'Send again' : 'Create my page'}</button>
		<span class="su-hint">You can change all of this later in Settings, except your link.</span>
	</div>
</form>
