<script lang="ts">
	import Logo from './lib/Logo.svelte';
	import type { Session } from '@supabase/supabase-js';
	import { onMount } from 'svelte';
	import { supabase } from './lib/supabase.ts';
	import { answer, ui } from './lib/ui.svelte.ts';
	import Icon from './lib/Icon.svelte';
	import Login from './lib/Login.svelte';
	import Shell from './lib/Shell.svelte';

	// Signed out → the email-code sign-in. Signed in → the panel, but only for Miracle's admins.
	let ready = $state(false);
	let session = $state<Session | null>(null);
	let admin = $state<boolean | null>(null);
	let checkErr = $state('');

	async function check() {
		admin = null;
		checkErr = '';
		const { data, error } = await supabase.rpc('is_app_admin');
		if (error) checkErr = error.message;
		admin = !error && data === true;
	}

	onMount(() => {
		supabase.auth.getSession().then(async ({ data }) => {
			session = data.session;
			if (session) await check();
			ready = true;
		});
		// A question asked on one page shouldn't be answered on another.
		const onHash = () => ui.confirm && answer(false);
		addEventListener('hashchange', onHash);
		const { data } = supabase.auth.onAuthStateChange((event, s) => {
			session = s;
			if (event === 'SIGNED_OUT') admin = null;
		});
		return () => {
			data.subscription.unsubscribe();
			removeEventListener('hashchange', onHash);
		};
	});

	async function signedIn(s: Session) {
		session = s;
		await check();
	}
	async function signOut() {
		await supabase.auth.signOut({ scope: 'local' });
		session = null;
		admin = null;
	}
	function onKey(e: KeyboardEvent) {
		if (ui.confirm && e.key === 'Escape') answer(false);
	}
</script>

<svelte:window onkeydown={onKey} />

{#if !ready || (session && admin === null)}
	<div class="loader" aria-label="Loading"><span class="ring"><span></span></span></div>
{:else if !session}
	<Login onsignedin={signedIn} />
{:else if !admin}
	<div class="nope">
		<div class="nope-card">
			<Logo size={46} />
			<h1>Only Miracle admins can <em class="gt">open this</em></h1>
			<p>You're signed in as <b>{session.user.email}</b>, which isn't on the admin list.{checkErr ? ` (${checkErr})` : ''}</p>
			<button class="neo white lg" onclick={signOut}><Icon name="logout" />Sign out</button>
		</div>
	</div>
{:else}
	<Shell email={session.user.email ?? ''} onsignout={signOut} />
{/if}

<div class="toasts" aria-live="polite">
	{#each ui.toasts as t (t.id)}
		<div class="toast" class:bad={t.bad} role={t.bad ? 'alert' : 'status'}><Icon name={t.bad ? 'alert' : 'check'} /><span>{t.msg}</span></div>
	{/each}
</div>

{#if ui.confirm}
	<div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && answer(false)}>
		<div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
			<h2 id="dlg-t">{ui.confirm.title}</h2>
			{#if ui.confirm.body}<p>{ui.confirm.body}</p>{/if}
			{#if ui.confirm.input}
				<div class="f">
					<label for="dlg-in">{ui.confirm.input.label}</label>
					<input id="dlg-in" class="inp" {@attach (el) => el.focus()} placeholder={ui.confirm.input.placeholder ?? ''} bind:value={ui.confirm.text} onkeydown={(e) => e.key === 'Enter' && answer(true)} />
				</div>
			{/if}
			<div class="acts">
				<button class="btn" onclick={() => answer(false)}>Cancel</button>
				<button class="btn {ui.confirm.danger ? 'bad' : 'pri'}" {@attach (el) => void (!ui.confirm?.input && el.focus())} disabled={!!ui.confirm.input?.required && !ui.confirm.text.trim()} onclick={() => answer(true)}>{ui.confirm.ok ?? 'OK'}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.nope { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
	.nope-card { width: min(460px, 100%); padding: 28px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; display: grid; gap: 14px; }
	.nope-card h1 { font-size: 24px; line-height: 1.2; }
	.nope-card p { color: var(--ink-2); margin-bottom: 8px; word-break: break-word; }
	.nope-card b { color: var(--ink); }
</style>
