<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { auth, isNewLogin, signOut } from '#lib/auth.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import Logo from '#lib/components/Logo.svelte';
	import AuthBackdrop from '#lib/components/AuthBackdrop.svelte';
	import StartStep from './StartStep.svelte';
	import CreatorForm from './CreatorForm.svelte';
	import BrandForm from './BrandForm.svelte';
	import Waiting from './Waiting.svelte';
	import ChooseLink from './ChooseLink.svelte';
	import { inInstalledApp, isNative } from '#lib/native.ts';
	import { keepInvite } from '#lib/invite.ts';
	import { supabase } from '#lib/supabase.ts';
	import './signup.css';

	// Sign-up on Miracle's own address (app.miracleapp.live/signup), linked from every Join button on the website.
	// Creators: email, a short profile, review by the Miracle team, then they pick their link.
	// Brands: email, their company, then straight to the dashboard.
	const KEY = 'mc-signup-as';
	const asked = page.url.searchParams.get('as');
	// "Claim your link" on the website: keep the name for when she picks her link after review.
	const link = (page.url.searchParams.get('link') ?? '').trim().toLowerCase().slice(0, 30);
	if (link)
		try {
			localStorage.setItem('mc-wanted-link', link);
		} catch {
			/* storage blocked */
		}
	// Opened from a creator's invite (her page, invoice or quote): she's thanked once they've joined.
	keepInvite(page.url.searchParams.get('invite'));
	// Opened from a Growth Autopilot email: the admin panel sees it was clicked.
	const g = page.url.searchParams.get('g');
	if (g && /^[0-9a-f]{32}$/.test(g)) supabase.rpc('growth_seen', { p_token: g }).then(() => {});
	const chosen = asked === 'brand' || asked === 'creator';
	const kept = stored();
	let as = $state<'creator' | 'brand'>(chosen ? asked : (kept ?? 'creator'));
	// Creator or brand has been said: by the link, earlier in this tab, or by sending the code here. A login
	// that hasn't (they typed their email on Sign in) is asked before any form, since it may be a creator.
	let picked = $state(chosen || !!kept);
	// In the phone app or the installed web app, the logo stays here instead of opening the website inside it.
	const inApp = inInstalledApp();
	function stored(): 'creator' | 'brand' | null {
		try {
			const v = sessionStorage.getItem(KEY);
			return v === 'brand' || v === 'creator' ? v : null;
		} catch {
			return null;
		}
	}
	$effect(() => {
		if (!picked) return;
		try {
			sessionStorage.setItem(KEY, as);
		} catch {
			/* storage blocked */
		}
	});
	let pickAs = $state<'creator' | 'brand'>('creator');
	const pick = (v: 'creator' | 'brand') => ((as = v), (picked = true));

	let editing = $state(false);
	const acc = $derived(auth.account);
	const email = $derived(acc?.email ?? auth.session?.user.email ?? '');
	// A login that already works as a brand (a company, or requests sent with this email).
	const isBrand = $derived(acc?.role === 'brand' && !isNewLogin(acc));

	const view = $derived.by(() => {
		if (!auth.session) return 'start';
		if (!acc) return 'loading';
		if (acc.role === 'creator') return acc.needs_link ? 'link' : 'loading';
		if (acc.role === 'pending') return editing || !acc.request ? 'creator' : 'waiting';
		if (!isBrand && !picked) return 'pick';
		if (as === 'creator') return isBrand ? 'brand-email' : 'creator';
		return isBrand ? 'loading' : 'brand';
	});

	// Already set up: a creator goes to their studio (on their own address), a brand to its dashboard.
	$effect(() => {
		if (acc?.role === 'creator' && !acc.needs_link && acc.slug) location.replace(isNative() ? '/studio' : addressFor(acc.slug, '/studio'));
		else if (acc?.role === 'brand' && isBrand && as === 'brand') goto('/brand', { replaceState: true });
	});
	// A request that was sent again goes back to the waiting screen.
	$effect(() => {
		if (acc?.role === 'pending' && acc.request?.status === 'pending' && editing && acc.request.requested_at) editing = false;
	});

	async function leave() {
		await signOut();
		editing = false;
	}
</script>

<svelte:head><title>{view === 'link' ? 'Pick your link' : view === 'waiting' ? 'Your request' : 'Join Miracle'}</title></svelte:head>

<!-- The same look as Sign in: the drifting glows and the "m" tracing itself behind one card. -->
<div class="su">
	<AuthBackdrop />
	<header class="su-top">
		{#if inApp}
			<span class="su-brand"><Logo size={34} /><b>Miracle</b></span>
		{:else}
			<a class="su-brand" href="https://www.miracleapp.live" aria-label="Miracle website"><Logo size={34} /><b>Miracle</b></a>
		{/if}
	</header>
	<main class="su-main">
		{#if view === 'start'}
			<StartStep bind:as {chosen} onpick={() => (picked = true)} />
		{:else if view === 'pick'}
			<form class="su-card" onsubmit={(e) => (e.preventDefault(), pick(pickAs))}>
				<div class="su-head">
					<span class="su-eb">Welcome to Miracle</span>
					<h1 class="su-h1">Who are you <em>joining as?</em></h1>
					<p class="su-lead">Signed in as <b>{email}</b>. Pick one to set up your account.</p>
				</div>
				<fieldset class="su-as">
					<legend class="sr-only">Join as</legend>
					<label style="--c:var(--g2)">
						<input type="radio" name="su-pick" value="creator" bind:group={pickAs} />
						<b>A creator</b>
						<span>Run my brand collabs.</span>
					</label>
					<label style="--c:var(--g1)">
						<input type="radio" name="su-pick" value="brand" bind:group={pickAs} />
						<b>A brand</b>
						<span>Work with creators. Start straight away.</span>
					</label>
				</fieldset>
				<button class="su-neo su-go su-block">Continue</button>
			</form>
		{:else if view === 'creator'}
			<CreatorForm {email} request={acc?.role === 'pending' ? acc.request : null} onswitch={acc?.role === 'brand' ? () => pick('brand') : undefined} />
		{:else if view === 'waiting' && acc?.role === 'pending' && acc.request}
			<Waiting request={acc.request} {email} onedit={() => (editing = true)} />
		{:else if view === 'link' && acc?.role === 'creator'}
			<ChooseLink name={acc.name} handle={acc.handle} />
		{:else if view === 'brand'}
			<BrandForm {email} onswitch={() => pick('creator')} />
		{:else if view === 'brand-email'}
			<div class="su-card">
				<h1 class="su-h1">This email is a <em>brand</em> account</h1>
				<p class="su-lead">{email} already works with creators as a brand. To join as a creator, sign out and use a different email.</p>
				<div class="su-row">
					<a class="su-neo su-light" href="/brand">Go to my dashboard</a>
					<button class="su-link" onclick={leave}>Sign out</button>
				</div>
			</div>
		{:else}
			<div class="su-load"><span class="ring"><span></span></span></div>
		{/if}
	</main>
	<p class="su-acct">
		{#if auth.session}
			{email} · <button class="su-link" onclick={leave}>Sign out</button>
		{:else}
			Already on Miracle? <a href="/login?next=%2Fsignup">Sign in</a>
		{/if}
	</p>
</div>
