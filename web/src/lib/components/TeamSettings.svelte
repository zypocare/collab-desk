<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { onMount } from 'svelte';
	import { studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage, firstName } from '../util';
	import Icon from './Icon.svelte';

	// Her team: people who sign in with their own email and run the studio with her.
	type Member = { email: string; name: string; role: 'manager'; copy_emails: boolean; added_at: string; last_seen_at: string | null };
	let team = $state<Member[]>([]);
	let email = $state('');
	let name = $state('');
	let busy = $state(false);
	const owner = $derived(studio.me?.team_role === 'owner');
	const ownerName = $derived(firstName(studio.settings?.display_name ?? ''));

	async function load() {
		const { data } = await supabase.from('team_members').select('*').order('added_at');
		team = (data as Member[]) ?? [];
	}
	onMount(load);

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const em = email.trim().toLowerCase();
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast('Type a full email address', 'alert');
		if (em === studio.settings?.creator_email.toLowerCase()) return toast("That's your own sign-in email", 'alert');
		busy = true;
		const { error } = await supabase.from('team_members').insert({ email: em, name: name.trim() });
		busy = false;
		if (error) return toast(error.code === '23505' ? 'Already on your team' : `Couldn't add: ${errMessage(error)}`, 'alert');
		toast(`${name.trim() || em} can now sign in at your link with ${em}`, 'users');
		email = name = '';
		load();
	}
	async function remove(m: Member) {
		if (!(await ask({ title: `Remove ${m.name || m.email}?`, body: "They won't be able to open the studio any more. You can add them again later.", ok: 'Remove', danger: true }))) return;
		const { error } = await supabase.from('team_members').delete().eq('email', m.email);
		if (error) return toast(`Couldn't remove: ${errMessage(error)}`, 'alert');
		load();
	}
	async function copies(m: Member, on: boolean) {
		const mine = m.email === studio.me?.email;
		const { error } = owner && !mine ? await supabase.from('team_members').update({ copy_emails: on }).eq('email', m.email) : await supabase.rpc('team_set_copies', { p_on: on });
		if (error) return toast(`Couldn't save: ${errMessage(error)}`, 'alert');
		m.copy_emails = on;
	}
	const seen = (d: string | null) => (d ? `last in ${new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'not signed in yet');
</script>

<section class="panel rv" style="--i:1">
	<div class="panel-h"><h2>Team</h2><small>{owner ? 'people who run the studio with you' : `you're on ${ownerName}'s team`}</small></div>
	<div class="rv-list">
		<div class="rv-row">
			<span class="set-ic"><Icon name="users" /></span>
			<div><b>{studio.settings?.display_name} <span class="pill tint k-pay">Owner</span></b><small class="wrap-any">{studio.settings?.creator_email}</small></div>
		</div>
		{#each team as m (m.email)}
			<div class="rv-row">
				<span class="set-ic"><Icon name="users" /></span>
				<div><b>{m.name || m.email} <span class="pill tint plain">Manager</span></b><small class="wrap-any">{m.email} · {seen(m.last_seen_at)}</small></div>
				{#if owner || m.email === studio.me?.email}
					<label class="team-copy" title="Gets copies of your notification emails"><input type="checkbox" class="tgl sm" checked={m.copy_emails} onchange={(e) => copies(m, (e.currentTarget as HTMLInputElement).checked)} />Emails</label>
				{/if}
				{#if owner}<button class="shot-x" style="opacity:1" aria-label="Remove {m.email}" onclick={() => remove(m)}><Icon name="x" /></button>{/if}
			</div>
		{/each}
	</div>
	{#if owner}
		<form class="form-b team-add" onsubmit={add}>
			<div class="f"><label for="tm-email">Their email</label><input class="inp" id="tm-email" type="email" autocomplete="off" placeholder="manager@gmail.com" bind:value={email} /></div>
			<div class="f"><label for="tm-name">Name <span class="hint">(optional)</span></label><input class="inp" id="tm-name" autocomplete="off" placeholder="Jiten" bind:value={name} /></div>
			<div class="f span2">
				<button class="btn sm primary" type="submit" disabled={busy || !email.trim()}><Icon name="plus" />Add to team</button>
				<p class="hint" style="margin-top:8px">They sign in at your link with this email (a one-time code, no password) and can do everything in the studio: requests, quotes, drafts, invoices and payments. Only you can add or remove people. Phone alerts: they turn them on from their own phone.</p>
			</div>
		</form>
	{/if}
</section>
