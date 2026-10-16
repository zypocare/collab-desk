<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { igConnect } from '#lib/studio.svelte.ts';
	import { confetti, toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	let status = $state<'working' | 'error'>('working');
	let message = $state('Connecting to Instagram…');

	onMount(async () => {
		const q = page.url.searchParams;
		const code = (q.get('code') ?? '').replace(/#_$/, '');
		const state = q.get('state') ?? '';
		let expected: string | null = null;
		try {
			expected = sessionStorage.getItem('ig_state');
			sessionStorage.removeItem('ig_state');
		} catch {
			/* storage blocked */
		}
		if (q.get('error')) {
			status = 'error';
			message = q.get('error_description') || 'Instagram sign-in was cancelled.';
			return;
		}
		if (!code || (expected && state !== expected)) {
			status = 'error';
			message = "This sign-in link isn't valid any more. Start again from My page.";
			return;
		}
		try {
			message = 'Getting your numbers from Instagram…';
			await igConnect(code, `${location.origin}/studio/instagram`);
			confetti();
			toast('Instagram connected');
			goto('/studio/settings?s=profile', { replace: true });
		} catch (e) {
			status = 'error';
			message = errMessage(e);
		}
	});
</script>

<svelte:head><title>Connecting Instagram</title></svelte:head>

<div class="empty-card" style="max-width:520px;margin:60px auto">
	{#if status === 'working'}
		<div class="loader" style="min-height:0;margin-bottom:16px"><span class="ring"><span></span></span></div>
		<h2>{message}</h2>
		<p>This takes a few seconds.</p>
	{:else}
		<span class="mini-ic tint k-bad" style="margin:0 auto 14px"><Icon name="alert" /></span>
		<h2>Couldn't connect Instagram</h2>
		<p>{message}</p>
		<a class="btn" href="/studio/settings?s=profile">Back to My page</a>
	{/if}
</div>
