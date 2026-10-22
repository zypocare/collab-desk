<script lang="ts">
	import { onMount } from 'svelte';
	import { igStart, invokeFn, saveSettings, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';
	import Segmented from './Segmented.svelte';

	// Comment-to-DM: someone comments a keyword ("COLLAB", "RATES") on her post and gets a DM with her link.
	// Ask: each reply waits here for a tap. Auto: it goes straight away (up to 200 a day).
	type Rule = { id: string; keyword: string; reply: string; active: boolean; uses: number };
	type Log = { id: string; from_username: string; text: string; reply: string; status: string; created_at: string; error: string | null };
	const s = $derived(studio.settings!);
	let rules = $state<Rule[]>([]);
	let logs = $state<Log[]>([]);
	let perms = $state('');
	let busy = $state('');
	let kw = $state('');
	let text = $state('');
	const allowed = $derived(perms.includes('instagram_business_manage_comments') && perms.includes('instagram_business_manage_messages'));
	const pending = $derived(logs.filter((l) => l.status === 'pending'));
	const sentWeek = $derived(logs.filter((l) => l.status === 'sent' && Date.now() - Date.parse(l.created_at) < 7 * 864e5).length);
	const DEFAULTS = [
		{ keyword: 'COLLAB', reply: 'Hi! Thanks for asking about a collab. My rates, packages and the request form are all here: {link}' },
		{ keyword: 'RATES', reply: 'Hi! Here are my rates and packages, with a form to send a request: {link}' }
	];

	async function load() {
		const [r, l, p] = await Promise.all([
			supabase.from('dm_rules').select('id, keyword, reply, active, uses').order('created_at'),
			supabase.from('dm_auto_log').select('id, from_username, text, reply, status, created_at, error').order('created_at', { ascending: false }).limit(30),
			supabase.rpc('ig_permissions')
		]);
		rules = (r.data ?? []) as Rule[];
		logs = (l.data ?? []) as Log[];
		perms = String(p.data ?? '');
	}
	onMount(load);

	async function setMode(m: string) {
		await saveSettings({ comment_dm_mode: m as 'off' | 'ask' | 'auto' });
		if (m !== 'off' && !rules.length) {
			await supabase.from('dm_rules').insert(DEFAULTS);
			await load();
		}
	}
	async function add() {
		if (!kw.trim() || !text.trim()) return;
		const { error } = await supabase.from('dm_rules').insert({ keyword: kw.trim().replace(/^#/, '').toUpperCase(), reply: text.trim() });
		if (error) return toast(errMessage(error).includes('duplicate') ? 'You already have that keyword.' : errMessage(error), 'alert');
		kw = '';
		text = '';
		await load();
	}
	async function update(r: Rule, patch: Partial<Rule>) {
		const { error } = await supabase.from('dm_rules').update(patch).eq('id', r.id);
		if (error) toast(errMessage(error), 'alert');
		else Object.assign(r, patch);
	}
	async function remove(r: Rule) {
		await supabase.from('dm_rules').delete().eq('id', r.id);
		rules = rules.filter((x) => x.id !== r.id);
	}
	async function answer(l: Log, send: boolean) {
		busy = l.id;
		try {
			await invokeFn('instagram-dm', { comment_log: l.id, text: send ? l.reply : false });
			toast(send ? `Sent to @${l.from_username}` : 'Skipped', send ? 'send' : 'check');
			await load();
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	async function allow() {
		try {
			location.href = await igStart(true, true);
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
</script>

<section class="panel cdm rv" aria-labelledby="cdm-t">
	<div class="panel-h"><h2 id="cdm-t">Comment-to-DM</h2><small>{sentWeek ? `${sentWeek} sent this week` : 'Someone comments a keyword, they get a DM with your link'}</small></div>
	<div class="cdm-b">
		<Segmented
			label="Comment-to-DM"
			value={s.comment_dm_mode ?? 'off'}
			onchange={(v) => setMode(v)}
			options={[
				{ value: 'off', label: 'Off' },
				{ value: 'ask', label: 'Ask me' },
				{ value: 'auto', label: 'Auto' }
			]}
		/>
		<small class="hint">{s.comment_dm_mode === 'auto' ? 'Replies go straight away, once per comment, up to 200 a day.' : s.comment_dm_mode === 'ask' ? 'Each reply waits below (and on your phone) for a tap.' : 'Turn it on, then say in a reel: "Comment COLLAB and I\'ll send you my rates".'}</small>

		{#if (s.comment_dm_mode ?? 'off') !== 'off' && !allowed}
			<div class="cdm-allow">
				<span><b>Allow comments on Instagram</b><small>Instagram asks once: "read comments" and "send messages". Nothing else changes.</small></span>
				<button class="btn primary sm" onclick={allow}>Allow</button>
			</div>
		{/if}

		{#if pending.length}
			<div class="cdm-wait">
				<span class="lbl-t">Waiting for you · {pending.length}</span>
				{#each pending as l (l.id)}
					<div class="cdm-l">
						<span><b>@{l.from_username || 'someone'}</b> commented "{l.text}"</span>
						<small>{l.reply}</small>
						<span class="row"><button class="btn sm primary" disabled={busy === l.id} onclick={() => answer(l, true)}><Icon name="send" />Send DM</button><button class="btn sm ghost" disabled={busy === l.id} onclick={() => answer(l, false)}>Skip</button></span>
					</div>
				{/each}
			</div>
		{/if}

		<span class="lbl-t">Keywords</span>
		{#each rules as r (r.id)}
			<div class="cdm-r" class:off={!r.active}>
				<div class="cdm-rh">
					<b>{r.keyword}</b>
					<small>{r.uses} sent</small>
					<input type="checkbox" class="tgl" checked={r.active} aria-label="Use {r.keyword}" onchange={(e) => update(r, { active: (e.currentTarget as HTMLInputElement).checked })} />
					<button class="icon-btn sm" onclick={() => remove(r)} aria-label="Remove {r.keyword}"><Icon name="x" /></button>
				</div>
				<textarea class="inp" rows="2" maxlength="900" value={r.reply} aria-label="Reply for {r.keyword}" onchange={(e) => update(r, { reply: (e.currentTarget as HTMLTextAreaElement).value })}></textarea>
			</div>
		{/each}
		<form class="cdm-add" onsubmit={(e) => (e.preventDefault(), add())}>
			<input class="inp" placeholder="Keyword, e.g. PRICE" maxlength="30" bind:value={kw} aria-label="New keyword" />
			<textarea class="inp" rows="2" maxlength="900" placeholder={'The DM they get. {link} becomes your page link.'} bind:value={text} aria-label="The reply"></textarea>
			<button class="btn sm" disabled={!kw.trim() || !text.trim()}><Icon name="plus" />Add keyword</button>
		</form>
		{#if logs.some((l) => l.status === 'failed')}<small class="err">Some replies failed: {logs.find((l) => l.status === 'failed')?.error}</small>{/if}
	</div>
</section>

<style>
	.cdm-b {
		display: grid;
		gap: 12px;
		padding: 0 18px 18px;
	}
	.cdm-allow,
	.cdm-l,
	.cdm-r {
		display: grid;
		gap: 8px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2);
	}
	.cdm-allow {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
	}
	.cdm-allow span,
	.cdm-l > span:first-child {
		display: grid;
		gap: 2px;
	}
	.cdm-allow small,
	.cdm-l small {
		color: var(--ink-3);
		line-height: 1.45;
	}
	.cdm-wait {
		display: grid;
		gap: 8px;
	}
	.cdm-r.off {
		opacity: 0.6;
	}
	.cdm-rh {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.cdm-rh small {
		margin-right: auto;
		color: var(--ink-3);
	}
	.cdm-add {
		display: grid;
		gap: 8px;
		justify-items: start;
	}
	.cdm-add .inp {
		width: 100%;
	}
</style>
