<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth, signOut } from '../auth.svelte';
	import { pub } from '../publicPage.svelte';
	import { appAddress, isAppHost } from '../creatorHost';
	import Logo from './Logo.svelte';

	// The foot of every brand-side page, like her page's: Miracle, who gets paid, the way back, and sign-in.
	const name = $derived(pub.data?.display_name ?? '');
	const first = $derived(name.split(' ')[0] || 'the creator');
	const brand = $derived(auth.account?.role === 'brand' ? auth.account : null);
	// Miracle's own address belongs to no creator.
	const onApp = isAppHost(location.hostname);

	async function logout() {
		await signOut();
		goto('/login', { replaceState: true });
	}
</script>

<footer class="bf">
	<div class="bf-in">
		<a class="bf-made" href="https://miracleapp.live" aria-label="Made with Miracle"><Logo size={28} /><span>Made with <b>Miracle</b></span></a>
		<span>Brands pay {onApp ? 'creators' : first} directly. Miracle never takes a cut.</span>
		{#if !onApp}<a href="/">{name ? `${first}'s page` : 'Her page'}</a>{/if}
		{#if brand}
			<span class="bf-me"><span class="bf-mail">{brand.email}</span> · <button onclick={logout}>Sign out</button></span>
		{:else if auth.account?.role === 'creator'}
			<a href="/studio">Back to studio</a>
		{:else}
			<a href="/login">Sign in</a>
		{/if}
		<a href={appAddress('/signup?as=creator')}>Are you a creator? Get your own page</a>
	</div>
</footer>

<style>
	.bf {
		margin-top: 48px;
		border-top: 1px solid var(--line);
		background: color-mix(in oklab, var(--surface) 70%, var(--bg));
		padding: 36px max(var(--bx-gut, 20px), calc((100vw - var(--bx-max, 1880px)) / 2));
		color: var(--ink-3);
		font-size: 13.5px;
	}
	.bf-in {
		display: flex;
		flex-wrap: wrap;
		gap: 14px 28px;
		align-items: center;
		justify-content: space-between;
	}
	.bf a,
	.bf button {
		color: var(--ink-2);
		text-decoration: none;
	}
	.bf a:hover,
	.bf button:hover {
		color: var(--ink);
	}
	.bf button {
		border: 0;
		padding: 0;
		background: none;
		font: inherit;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.bf-made {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--ink) !important;
	}
	.bf-made b {
		font: 400 22px/1 var(--f-serif);
		font-style: italic;
		color: var(--ink);
	}
	.bf-me {
		display: inline-flex;
		gap: 6px;
		min-width: 0;
	}
	.bf-mail {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 900px) {
		.bf-in {
			flex-direction: column;
			align-items: flex-start;
			gap: 12px;
		}
		/* room for what sits at the bottom of the screen (the tab bar, or the form's Send bar) */
		.bf {
			margin-top: 0;
			padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px));
		}
	}
</style>
