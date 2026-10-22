<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth, refreshAccount, signOut } from '../auth.svelte';
	import { exportBrand } from '../brandExport';
	import { phone } from '../phone.svelte';
	import { supabase } from '../supabase';
	import { ask } from '../confirm.svelte';
	import { theme, toast, toggleTheme } from '../ui.svelte';
	import { errMessage } from '../util';
	import DeleteAccount from './DeleteAccount.svelte';
	import Icon from './Icon.svelte';

	// A brand's Sign-in & account: everything in one download, sign-in, leaving the team, deleting the company.
	let { company }: { company: string } = $props();
	const email = $derived(auth.account?.email ?? '');
	let check = $state<ComponentProps<typeof DeleteAccount>['check']>(null);
	const owner = $derived(check ? check.owner : auth.account?.role === 'brand' && !!auth.account.profile);
	let busy = $state<'' | 'data' | 'all' | 'leave'>('');
	async function download() {
		busy = 'data';
		try {
			toast(`Download ready: ${await exportBrand(company)} files in one .zip`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	async function outEverywhere() {
		if (!(await ask({ title: 'Sign out on every device?', body: 'Your phones and computers are signed out, this one too. Sign in again with your email.', ok: 'Sign out everywhere' }))) return;
		busy = 'all';
		await supabase.auth.signOut({ scope: 'global' }).catch(() => {});
		await signOut();
		goto('/login', { replace: true });
	}
	async function leave() {
		if (!(await ask({ title: `Leave ${company}?`, body: 'You lose access to its requests, campaigns and money. The owner can invite you again.', ok: 'Leave', danger: true }))) return;
		busy = 'leave';
		const { error } = await supabase.rpc('team_leave');
		busy = '';
		if (error) return toast(errMessage(error), 'alert');
		await refreshAccount();
		toast(`You left ${company}`, 'check');
		goto('/brand', { replace: true });
	}
</script>

<section class="hero-card glow m-hero rv" style="--i:1" aria-label="Your data">
	<div class="mesh" aria-hidden="true"></div>
	<div class="hc-in">
		<div class="hc-top"><span class="hc-eb">Your data</span></div>
		<div class="ba-h">Everything {company} has on Miracle, in <em>one file</em></div>
		<div class="hc-sub">A .zip with every request and quote, invoices, all messages, your briefs and applications, ratings and the Reports workbook in Excel. For your records or your CA.</div>
		<div class="clear-acts ba-acts">
			<button class="glass-chip" type="button" onclick={download} disabled={!!busy}>{#if busy === 'data'}<span class="spinner"></span>{:else}<Icon name="download" />{/if}Download all our data</button>
		</div>
	</div>
</section>

<section class="panel rv" style="--i:2">
	<div class="switch-row" style="border-top:0">
		<div><b>Signed in as {email}</b><small>{owner ? `Owner of ${company}` : `On ${company}'s team`}</small></div>
		<button class="btn sm" type="button" onclick={outEverywhere} disabled={!!busy}>{#if busy === 'all'}<span class="spinner"></span>{/if}Sign out on every device</button>
	</div>
	<div class="switch-row">
		<div><b>{theme.value === 'dark' ? 'Light look' : 'Dark look'}</b><small>How the app looks on this {phone.on ? 'phone' : 'computer'}</small></div>
		<button class="btn sm" type="button" onclick={toggleTheme}><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} />Switch</button>
	</div>
	{#if !owner}
		<div class="switch-row">
			<div><b>Leave {company}</b><small>Removes just your login from the team.</small></div>
			<button class="btn sm" type="button" onclick={leave} disabled={!!busy}>{#if busy === 'leave'}<span class="spinner"></span>{/if}Leave</button>
		</div>
	{/if}
	<div class="switch-row">
		<div><b>Sign out</b><small>Just this {phone.on ? 'phone' : 'computer'}</small></div>
		<button class="btn sm" type="button" onclick={async () => (await signOut(), goto('/login', { replace: true }))}><Icon name="logout" />Sign out</button>
	</div>
</section>

<DeleteAccount bind:check />

<style>
	.ba-h {
		margin-top: 10px;
		font: 400 30px/1.1 var(--f-serif, Georgia, serif);
	}
	.ba-h em {
		font-style: italic;
	}
	.ba-acts {
		justify-content: flex-start;
	}
</style>
