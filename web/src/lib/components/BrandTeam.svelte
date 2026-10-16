<script lang="ts">
	import { onMount } from 'svelte';
	import { ask } from '../confirm.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// Colleagues and agencies who can see this brand's requests, and people invited.
	type Team = { members: { email: string; name: string; me: boolean }[]; invites: { email: string; name: string; invited_by: string }[] };
	let team = $state<Team>({ members: [], invites: [] });
	let email = $state('');
	let name = $state('');
	let busy = $state(false);

	async function load() {
		const { data } = await supabase.rpc('brand_team');
		team = (data as Team) ?? { members: [], invites: [] };
	}
	onMount(load);

	async function invite(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		const { error } = await supabase.rpc('brand_invite', { p_email: email, p_name: name });
		busy = false;
		if (error) return toast(errMessage(error), 'alert');
		toast(`${name.trim() || email.trim()} can now sign in with ${email.trim()} and see your requests`, 'users');
		email = name = '';
		load();
	}
	async function remove(em: string, who: string) {
		if (!(await ask({ title: `Remove ${who}?`, body: 'They will no longer see this brand’s requests.', ok: 'Remove', danger: true }))) return;
		const { error } = await supabase.rpc('brand_remove', { p_email: em });
		if (error) return toast(errMessage(error), 'alert');
		load();
	}
</script>

<section class="panel rv" style="--i:3;margin-top:18px">
	<div class="panel-h"><h2>Your team</h2><small>colleagues and agencies</small></div>
	<div class="rv-list">
		{#each team.members as m (m.email)}
			<div class="rv-row">
				<span class="set-ic"><Icon name="users" /></span>
				<div><b>{m.name || m.email}{m.me ? ' (you)' : ''}</b><small>{m.email}</small></div>
				{#if !m.me}<button class="shot-x" style="opacity:1" aria-label="Remove {m.email}" onclick={() => remove(m.email, m.name || m.email)}><Icon name="x" /></button>{/if}
			</div>
		{/each}
		{#each team.invites as i (i.email)}
			<div class="rv-row">
				<span class="set-ic"><Icon name="mail" /></span>
				<div><b>{i.name || i.email} <span class="pill tint plain">Invited</span></b><small>{i.email} · added by {i.invited_by}</small></div>
				<button class="shot-x" style="opacity:1" aria-label="Remove {i.email}" onclick={() => remove(i.email, i.name || i.email)}><Icon name="x" /></button>
			</div>
		{/each}
	</div>
	<form class="form-b team-add" onsubmit={invite}>
		<div class="f"><label for="bt-email">Their work email</label><input class="inp" id="bt-email" type="email" autocomplete="off" placeholder="colleague@brand.com" bind:value={email} /></div>
		<div class="f"><label for="bt-name">Name <span class="hint">(optional)</span></label><input class="inp" id="bt-name" autocomplete="off" bind:value={name} /></div>
		<div class="f span2">
			<button class="btn sm primary" type="submit" disabled={busy || !email.trim()}><Icon name="plus" />Add to team</button>
			<p class="hint" style="margin-top:8px">They get an email and sign in with a 6-digit code. They see and can act on every request, quote, draft, invoice and report for this brand.</p>
		</div>
	</form>
</section>
