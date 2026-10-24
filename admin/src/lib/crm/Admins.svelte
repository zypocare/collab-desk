<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, day, num } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';

	// Who can open this panel. Adding or removing someone is logged.
	type A = { email: string; added_at: string; me: boolean; last_sign_in: string | null; actions_30d: number };
	let list = $state<A[] | null>(null);
	let err = $state('');
	let email = $state('');
	let busy = $state(false);

	async function load() {
		const { data, error } = await supabase.rpc('admin_admins');
		err = error ? errMessage(error) : '';
		if (!error) list = data as A[];
	}
	onMount(load);

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const who = email.trim().toLowerCase();
		if (!who) return;
		const reason = await askText({ title: `Make ${who} an admin?`, body: 'They can open this panel and use every control in it, after signing in with a code sent to that email.', ok: 'Add admin', input: { label: 'Why', required: true } });
		if (reason === null) return;
		busy = true;
		const { data, error } = await supabase.rpc('admin_admin_set', { p_email: who, p_add: true, p_reason: reason });
		busy = false;
		if (error) return toast(errMessage(error), true);
		list = data as A[];
		email = '';
		toast(`${who} is an admin`);
	}
	async function remove(a: A) {
		const reason = await askText({ title: `Remove ${a.email}?`, body: 'They can no longer open this panel. What they did stays in the audit trail.', ok: 'Remove', danger: true, input: { label: 'Why', required: true } });
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_admin_set', { p_email: a.email, p_add: false, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		list = data as A[];
		toast(`${a.email} removed`);
	}
</script>

<div class="ad">
	<header>
		<div class="eb">System</div>
		<h1>Admins</h1>
	</header>
	{#if err}<p class="err">{err}</p>{/if}
	<section class="card">
		<form class="af" onsubmit={add}>
			<div class="f grow"><label for="ad-e">Add an admin</label><input id="ad-e" class="inp" type="email" placeholder="name@miracleapp.live" bind:value={email} required /></div>
			<button class="btn pri" disabled={busy || !email.trim()}>Add</button>
		</form>
		{#if !list}
			<div class="ld"><span class="spinner"></span></div>
		{:else}
			<div class="tbl-wrap">
				<table class="tbl">
					<thead><tr><th>Email</th><th>Added</th><th>Last sign-in</th><th class="r">Actions (30 days)</th><th></th></tr></thead>
					<tbody>
						{#each list as a (a.email)}
							<tr>
								<td class="w5">{a.email}{#if a.me} <span class="tag t-acc">You</span>{/if}</td>
								<td>{day(a.added_at)}</td>
								<td>{ago(a.last_sign_in)}</td>
								<td class="r mono"><a href={href('audit')}>{num(a.actions_30d)}</a></td>
								<td class="r">{#if !a.me}<button class="btn sm warn" onclick={() => remove(a)}>Remove</button>{/if}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>

<style>
	.ad { display: flex; flex-direction: column; gap: 16px; max-width: 900px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.af { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); }
	.grow { flex: 1 1 260px; }
	.ld { padding: 30px; display: grid; place-items: center; }
	.w5 { font-weight: 500; }
</style>
