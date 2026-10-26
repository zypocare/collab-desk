<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { supabase } from '#lib/supabase.ts';
	import AuthBackdrop from '#lib/components/AuthBackdrop.svelte';
	import Logo from '#lib/components/Logo.svelte';

	// "Leave this list" from a creator's email to her fans: one tap, no sign-in. The link carries a token
	// that only that email had. ?g= is an invitation from Miracle itself (the Growth Autopilot).
	let step = $state<'working' | 'done' | 'unknown' | 'miracle'>('working');
	let who = $state('');
	onMount(async () => {
		const g = page.url.searchParams.get('g') ?? '';
		if (g) {
			const { data } = await supabase.rpc('growth_unsubscribe', { p_token: g });
			return (step = (data as { ok?: boolean } | null)?.ok ? 'miracle' : 'unknown');
		}
		const t = page.url.searchParams.get('t') ?? '';
		if (!/^[0-9a-f-]{36}$/i.test(t)) return (step = 'unknown');
		const { data } = await supabase.rpc('fan_unsubscribe', { p_token: t });
		const r = data as { ok?: boolean; name?: string } | null;
		if (r?.ok) {
			who = r.name ?? '';
			step = 'done';
		} else step = 'unknown';
	});
</script>

<svelte:head><title>Leave the list</title><meta name="robots" content="noindex" /></svelte:head>

<div class="un">
	<AuthBackdrop />
	<div class="un-card">
		<Logo size={34} />
		{#if step === 'working'}
			<p>One moment…</p>
		{:else if step === 'miracle'}
			<h1>You won't hear from us <em>again</em></h1>
			<p>Sorry for the bother. Miracle won't email you again. If you ever want a free page for your brand deals, it's at miracleapp.live.</p>
		{:else if step === 'done'}
			<h1>You've left {who ? `${who}'s` : 'the'} <em>list</em></h1>
			<p>You won't get these emails any more. You can join again from {who ? `${who}'s` : 'the'} page any time.</p>
		{:else}
			<h1>That link didn't <em>work</em></h1>
			<p>It may be cut short. Open "Leave this list" from the email again, or reply to the email and ask to be removed.</p>
		{/if}
	</div>
</div>

<style>
	.un {
		position: relative;
		isolation: isolate;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: calc(env(safe-area-inset-top, 0px) + 24px) max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));
		background: #110d11;
		color: #f4eef2;
		font-family: 'Geist', ui-sans-serif, system-ui, sans-serif;
	}
	.un-card {
		width: min(440px, 100%);
		display: grid;
		gap: 14px;
		justify-items: start;
		padding: 30px;
		border-radius: 28px;
		background: rgba(26, 21, 26, 0.86);
		box-shadow: 0 0 0 1px #3e343e inset;
		backdrop-filter: blur(18px);
	}
	h1 {
		margin: 0;
		font: 400 38px/1.05 'Instrument Serif', Georgia, serif;
	}
	h1 em {
		font-style: italic;
		background: linear-gradient(115deg, #9c7bff, #f25a90 52%, #ffae6b);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 0.08em;
	}
	p {
		margin: 0;
		color: #a39aa1;
		line-height: 1.55;
	}
</style>
