<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth, refreshAccount, signOut } from '../auth.svelte';
	import { exportBrand } from '../brandExport';
	import { supabase } from '../supabase';
	import type { Closing } from '../types';
	import { toast } from '../ui.svelte';
	import { errMessage, fmt } from '../util';
	import Icon from './Icon.svelte';

	// An account on its way out, instead of the app: deleted (bring it back within 30 days), or closed by Miracle.
	let { closing }: { closing: Closing } = $props();
	let busy = $state<'' | 'back' | 'data' | 'out'>('');
	const brand = $derived(closing.kind === 'brand');
	async function back() {
		// The screen goes away as soon as the account is back: keep the name for the message.
		const name = closing.name;
		busy = 'back';
		const { error } = await supabase.rpc('account_restore');
		if (error) {
			busy = '';
			return toast(errMessage(error), 'alert');
		}
		await refreshAccount();
		busy = '';
		toast(`${name} is back`, 'check');
	}
	async function data() {
		busy = 'data';
		try {
			toast(`Download ready: ${await exportBrand(closing.name)} files in one .zip`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	async function out() {
		busy = 'out';
		await signOut();
		goto('/login', { replace: true });
	}
</script>

<svelte:head><title>{closing.state === 'closed' ? 'Account closed' : `${closing.name} is being deleted`} · Miracle</title></svelte:head>

<div class="cl">
	<header class="cl-top"><span class="cl-m">m.</span><b>Miracle</b></header>
	<div class="cl-in">
		<span class="cl-ring" aria-hidden="true"><Icon name={closing.state === 'closed' ? 'shield' : 'clock'} /></span>
		{#if closing.state === 'closed'}
			<h1>This account is <em>closed</em></h1>
			<p>{closing.name} was closed because it broke Miracle's <a class="lnk" href="/terms#reports">terms</a>, after reports from people on Miracle. We emailed {auth.account?.email ?? 'you'} why. If you think this is a mistake, reply to that email.</p>
		{:else if closing.owner}
			<h1>{closing.name} is <em>being deleted</em></h1>
			<p>Everything is erased for good on <b>{fmt(closing.erase_after?.slice(0, 10) ?? '')}</b>. Bring it back now and it's all as you left it{brand ? ', except requests that were cancelled' : ', except collabs that were cancelled'}.</p>
		{:else}
			<h1>{closing.name} is <em>being deleted</em></h1>
			<p>The owner of {closing.name} deleted it. It's erased for good on <b>{fmt(closing.erase_after?.slice(0, 10) ?? '')}</b> unless they bring it back.</p>
		{/if}
		<div class="cl-acts">
			{#if closing.state === 'deleting' && closing.owner}
				<button class="btn primary" type="button" onclick={back} disabled={!!busy}>{#if busy === 'back'}<span class="spinner"></span>{/if}Bring it back</button>
				{#if brand}<button class="btn" type="button" onclick={data} disabled={!!busy}>{#if busy === 'data'}<span class="spinner"></span>{:else}<Icon name="download" />{/if}Download our data</button>{/if}
			{/if}
			<button class="btn" type="button" onclick={out} disabled={!!busy}><Icon name="logout" />Sign out</button>
		</div>
	</div>
</div>

<style>
	.cl {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		padding: 0 max(24px, env(safe-area-inset-left, 0px)) 24px;
		background: radial-gradient(80% 50% at 50% 20%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 70%), var(--bg);
	}
	.cl-top {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 64px;
	}
	.cl-top b {
		font: italic 400 25px/1 var(--f-serif, Georgia, serif);
	}
	.cl-m {
		font: italic 400 28px/1 var(--f-serif, Georgia, serif);
		color: var(--accent);
	}
	.cl-in {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 18px;
		width: min(560px, 100%);
		margin: 0 auto;
	}
	.cl-ring {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		border: 2.5px solid var(--ink);
		display: grid;
		place-items: center;
	}
	.cl-ring :global(.ic) {
		width: 44px;
		height: 44px;
		stroke-width: 1.4;
	}
	h1 {
		margin: 0;
		font: 400 44px/1.04 var(--f-serif, Georgia, serif);
	}
	h1 em {
		font-style: italic;
	}
	p {
		margin: 0;
		font-size: 15.5px;
		line-height: 1.55;
		color: var(--ink-2);
	}
	p b {
		color: var(--ink);
	}
	.cl-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		padding-top: 6px;
	}
	.cl-acts :global(.btn) {
		height: 50px;
	}
</style>
