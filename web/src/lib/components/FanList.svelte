<script lang="ts">
	import { onMount } from 'svelte';
	import { ask } from '../confirm.svelte';
	import { downloadCsv } from '../reports';
	import { saveSettings, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage, fmt } from '../util';
	import Icon from './Icon.svelte';

	// Her email list: followers join from her page, she writes to them now and then. One email a day to at
	// most 200 people (what the free email account can send); replies come to her own email; every email
	// has a link to leave the list.
	type Fan = { id: string; email: string; name: string; created_at: string; unsubscribed_at: string | null };
	type Sent = { id: string; subject: string; sent_to: number; created_at: string };
	const CAP = 200;
	const s = $derived(studio.settings!);
	const canSend = $derived(!studio.me || ['owner', 'manager'].includes(studio.me.team_role));
	let fans = $state<Fan[]>([]);
	let sent = $state<Sent[]>([]);
	let loaded = $state(false);
	let showAll = $state(false);
	let subject = $state('');
	let body = $state('');
	let busy = $state(false);

	const active = $derived(fans.filter((f) => !f.unsubscribed_at));
	const left = $derived(fans.length - active.length);
	const sentToday = $derived(sent.some((b) => Date.now() - new Date(b.created_at).getTime() < 20 * 3600_000));

	async function load() {
		const [f, b] = await Promise.all([
			supabase.from('fans').select('id, email, name, created_at, unsubscribed_at').order('created_at', { ascending: false }).limit(5000),
			supabase.from('fan_broadcasts').select('id, subject, sent_to, created_at').order('created_at', { ascending: false }).limit(10)
		]);
		if (f.error) toast(errMessage(f.error), 'alert');
		fans = (f.data as Fan[]) ?? [];
		sent = (b.data as Sent[]) ?? [];
		loaded = true;
	}
	onMount(load);

	async function remove(f: Fan) {
		if (!(await ask({ title: `Remove ${f.email}?`, body: "They won't get your emails. They can join again from your page.", ok: 'Remove', danger: true }))) return;
		const { error } = await supabase.from('fans').delete().eq('id', f.id);
		if (error) return toast(errMessage(error), 'alert');
		fans = fans.filter((x) => x.id !== f.id);
	}

	function exportCsv() {
		downloadCsv(`${s.handle || 'fans'}-email-list.csv`, [['Name', 'Email', 'Joined', 'Left'], ...fans.map((f) => [f.name, f.email, f.created_at.slice(0, 10), f.unsubscribed_at?.slice(0, 10) ?? ''])]);
	}

	async function send(e: SubmitEvent) {
		e.preventDefault();
		if (!subject.trim() || !body.trim()) return toast('Add a subject and a message.', 'alert');
		const n = Math.min(active.length, CAP);
		if (!(await ask({ title: `Send to ${n} ${n === 1 ? 'person' : 'people'}?`, body: `"${subject.trim()}" goes out now, from Miracle with your name; replies come to your email.${active.length > CAP ? ` Your list has ${active.length}: the first ${CAP} to join get it today.` : ''}`, ok: 'Send' }))) return;
		busy = true;
		const { data, error } = await supabase.rpc('fan_broadcast_send', { p_subject: subject.trim(), p_body: body.trim() });
		busy = false;
		if (error) return toast(errMessage(error).replace(/^LIMIT:[^:]+:/, ''), 'alert');
		toast(`Sending to ${(data as { sent_to: number }).sent_to} people`, 'send');
		subject = '';
		body = '';
		await load();
	}
</script>

<section class="panel rv" style="--i:2" id="fans">
	<div class="panel-h"><h2>Fan email list</h2><small>followers join from your page; you write to them</small></div>
	<div class="switch-row" style="border-top:0">
		<div><b>Show "Get my updates by email" on your page</b><small>Under your links. Followers leave their name and email; nobody else sees the list.</small></div>
		<input type="checkbox" class="tgl" checked={!!s.fan_list_on} aria-label="Show the email sign-up on your page" onchange={(e) => saveSettings({ fan_list_on: (e.currentTarget as HTMLInputElement).checked })} />
	</div>
	{#if s.fan_list_on}
		<div class="form-b">
			<div class="f span2">
				<label for="fan-pitch">The line under it <span class="hint">(optional)</span></label>
				<input class="inp" id="fan-pitch" maxlength="160" placeholder="e.g. New videos, my skincare finds and early offers, twice a month." value={s.fan_list_pitch ?? ''} onchange={(e) => saveSettings({ fan_list_pitch: (e.currentTarget as HTMLInputElement).value.trim() })} />
			</div>
		</div>
	{/if}

	<div class="fl">
		<div class="fl-stats">
			<div><b>{active.length}</b><small>on your list</small></div>
			<div><b>{left}</b><small>left the list</small></div>
			<div><b>{sent.length ? fmt(sent[0].created_at.slice(0, 10)) : '—'}</b><small>last email</small></div>
		</div>

		{#if canSend}
			<form class="fl-write" onsubmit={send}>
				<b>Write to your list</b>
				<input class="inp" aria-label="Subject" placeholder="Subject, e.g. My new skincare video is up" maxlength="120" bind:value={subject} disabled={busy || sentToday} />
				<textarea class="inp" aria-label="Message" rows="5" placeholder="Write as you'd talk to them. Add links as plain web addresses." maxlength="4000" bind:value={body} disabled={busy || sentToday}></textarea>
				<div class="fl-go">
					<button class="btn grad" disabled={busy || sentToday || !active.length}>{#if busy}<span class="spinner"></span>Sending…{:else}<Icon name="send" />Send to {Math.min(active.length, CAP)}{/if}</button>
					<small class="hint">{sentToday ? 'You have written to your list today. The next email can go tomorrow.' : `One email a day, to up to ${CAP} people. Each has a link to leave the list.`}</small>
				</div>
			</form>
		{/if}

		{#if sent.length}
			<div class="fl-past">
				<span class="lbl-t">Sent</span>
				{#each sent as b (b.id)}<div class="fl-row"><span>{b.subject}</span><small>{fmt(b.created_at.slice(0, 10))} · {b.sent_to} people</small></div>{/each}
			</div>
		{/if}

		{#if loaded && fans.length}
			<div class="fl-people">
				<div class="fl-ph"><span class="lbl-t">People</span><button class="btn sm" onclick={exportCsv}><Icon name="download" />Download list</button></div>
				{#each showAll ? fans : fans.slice(0, 20) as f (f.id)}
					<div class="fl-row" class:off={!!f.unsubscribed_at}>
						<span><b>{f.name || f.email.split('@')[0]}</b> <small>{f.email}</small></span>
						<small>{f.unsubscribed_at ? 'left' : `joined ${fmt(f.created_at.slice(0, 10))}`}</small>
						{#if canSend}<button class="icon-btn" aria-label="Remove {f.email}" onclick={() => remove(f)}><Icon name="x" /></button>{/if}
					</div>
				{/each}
				{#if fans.length > 20 && !showAll}<button class="btn sm" onclick={() => (showAll = true)}>Show all {fans.length}</button>{/if}
			</div>
		{:else if loaded}
			<p class="hint">Nobody yet. {s.fan_list_on ? 'Put your page link in your Instagram bio so followers can join.' : 'Turn on the sign-up above to start your list.'}</p>
		{/if}
	</div>
</section>

<style>
	.fl {
		display: grid;
		gap: 16px;
		padding: 0 18px 18px;
	}
	.fl-stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.fl-stats div {
		display: grid;
		gap: 2px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2);
	}
	.fl-stats b {
		font: 400 26px/1 var(--f-serif, Georgia, serif);
	}
	.fl-stats small {
		color: var(--ink-3);
	}
	.fl-write {
		display: grid;
		gap: 8px;
		padding: 14px;
		border-radius: 16px;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.fl-go {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.fl-past,
	.fl-people {
		display: grid;
		gap: 6px;
	}
	.fl-ph {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.fl-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px solid var(--line);
	}
	.fl-row span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.fl-row small {
		color: var(--ink-3);
	}
	.fl-row.off span {
		opacity: 0.5;
	}
</style>
