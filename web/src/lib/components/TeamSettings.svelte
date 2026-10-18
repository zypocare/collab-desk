<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { onMount } from 'svelte';
	import { studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage, firstName } from '../util';
	import Icon from './Icon.svelte';

	// Her team: people who sign in with their own email and run the studio with her.
	type Role = 'manager' | 'assistant' | 'accountant';
	type Member = { email: string; name: string; role: Role; copy_emails: boolean; added_at: string; last_seen_at: string | null };
	let team = $state<Member[]>([]);
	let email = $state('');
	let name = $state('');
	let newRole = $state<Role>('manager');
	let busy = $state(false);
	const ROLES: { v: Role; label: string; what: string }[] = [
		{ v: 'manager', label: 'Manager', what: 'Everything except your team and sign-in email' },
		{ v: 'assistant', label: 'Assistant', what: 'Collabs, content and brand messages; no invoices or payments' },
		{ v: 'accountant', label: 'Accountant', what: 'Invoices, payments and reports; no brand messages' }
	];
	const roleLabel = (r: Role) => ROLES.find((x) => x.v === r)?.label ?? 'Manager';
	async function setRole(m: Member, r: Role) {
		const { error } = await supabase.from('team_members').update({ role: r }).eq('email', m.email);
		if (error) return toast(`Couldn't change the role: ${errMessage(error)}`, 'alert');
		m.role = r;
		toast(`${m.name || m.email} is now ${r === 'accountant' ? 'the accountant' : `a${r === 'assistant' ? 'n' : ''} ${r}`}`, 'users');
	}
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
		const { error } = await supabase.from('team_members').insert({ email: em, name: name.trim(), role: newRole });
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
				<div><b>{m.name || m.email} {#if !owner}<span class="pill tint plain">{roleLabel(m.role)}</span>{/if}</b><small class="wrap-any">{m.email} · {seen(m.last_seen_at)}</small></div>
				{#if owner}
					<select class="inp team-role" aria-label="Role for {m.name || m.email}" value={m.role} onchange={(e) => setRole(m, (e.currentTarget as HTMLSelectElement).value as Role)}>
						{#each ROLES as r (r.v)}<option value={r.v}>{r.label}</option>{/each}
					</select>
				{/if}
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
				<span class="lbl-t">Role</span>
				<div class="team-roles" role="radiogroup" aria-label="Role">
					{#each ROLES as r (r.v)}
						<label class="team-r" class:on={newRole === r.v}><input type="radio" name="tm-role" value={r.v} bind:group={newRole} /><b>{r.label}</b><small>{r.what}</small></label>
					{/each}
				</div>
			</div>
			<div class="f span2">
				<button class="btn sm primary" type="submit" disabled={busy || !email.trim()}><Icon name="plus" />Add to team</button>
				<p class="hint" style="margin-top:8px">They sign in at your link with this email (a one-time code, no password). The database enforces each role, so a hidden button can't be worked around. Only you can add or remove people and change roles. Phone alerts: they turn them on from their own phone.</p>
			</div>
		</form>
	{/if}
</section>

<style>
	.team-role { width: auto; height: 36px; padding: 0 12px; font-size: 14px; }
	.lbl-t { display: block; font-size: 14px; font-weight: 600; color: var(--ink-2); margin-bottom: 8px; }
	.team-roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
	.team-r { position: relative; display: grid; gap: 3px; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--line); cursor: pointer; }
	.team-r.on { border-color: color-mix(in oklab, var(--g1) 55%, var(--line)); background: color-mix(in oklab, var(--g1) 8%, transparent); }
	.team-r input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
	.team-r:focus-within { outline: 2px solid color-mix(in oklab, var(--g1) 50%, transparent); outline-offset: 2px; }
	.team-r b { font-size: 14.5px; }
	.team-r small { font-size: 12.5px; color: var(--ink-3); line-height: 1.4; }
</style>
