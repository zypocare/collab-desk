<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { auth, signOut } from '#lib/auth.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import Logo from '#lib/components/Logo.svelte';
	import StartStep from './StartStep.svelte';
	import CreatorForm from './CreatorForm.svelte';
	import BrandForm from './BrandForm.svelte';
	import Waiting from './Waiting.svelte';
	import ChooseLink from './ChooseLink.svelte';
	import { isNative } from '#lib/native.ts';
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
	let as = $state<'creator' | 'brand'>(asked === 'brand' || asked === 'creator' ? asked : stored());
	function stored(): 'creator' | 'brand' {
		try {
			return sessionStorage.getItem(KEY) === 'brand' ? 'brand' : 'creator';
		} catch {
			return 'creator';
		}
	}
	$effect(() => {
		try {
			sessionStorage.setItem(KEY, as);
		} catch {
			/* storage blocked */
		}
	});

	let editing = $state(false);
	const acc = $derived(auth.account);
	const email = $derived(acc?.email ?? auth.session?.user.email ?? '');
	// A login that already works as a brand (a company, or requests sent with this email).
	const isBrand = $derived(acc?.role === 'brand' && !!(acc.profile || acc.brand || acc.companies?.length || acc.creators?.length));

	const view = $derived.by(() => {
		if (!auth.session) return 'start';
		if (!acc) return 'loading';
		if (acc.role === 'creator') return acc.needs_link ? 'link' : 'loading';
		if (acc.role === 'pending') return editing || !acc.request ? 'creator' : 'waiting';
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

<div class="su">
	<header class="su-top">
		<a class="su-brand" href="https://www.miracleapp.live" aria-label="Miracle website"><Logo size={30} /><b>Miracle</b></a>
		{#if auth.session}
			<small>{email} · <button class="su-link" onclick={leave}>Sign out</button></small>
		{:else}
			<small>Already on Miracle? <a href="/login?next=%2Fsignup">Sign in</a></small>
		{/if}
	</header>
	<main class="su-main">
		{#if view === 'start'}
			<StartStep bind:as />
		{:else if view === 'creator'}
			<CreatorForm {email} request={acc?.role === 'pending' ? acc.request : null} />
		{:else if view === 'waiting' && acc?.role === 'pending' && acc.request}
			<Waiting request={acc.request} {email} onedit={() => (editing = true)} />
		{:else if view === 'link' && acc?.role === 'creator'}
			<ChooseLink name={acc.name} handle={acc.handle} />
		{:else if view === 'brand'}
			<BrandForm {email} />
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
</div>
