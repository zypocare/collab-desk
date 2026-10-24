<script lang="ts">
	import { ago, label, when } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { toast } from '../ui.svelte.ts';
	import RecordHead from './RecordHead.svelte';
	import Notes from './Notes.svelte';

	// One support ticket: the conversation, what they tried in Help, their device, and the reply box.
	// They get an email (and creators a phone alert) for every reply; notes only the team sees stay here.
	let { id, onchange }: { id: string; onchange?: () => void } = $props();

	type R = Record<string, any>;
	let d = $state<R | null>(null);
	let extras = $state<{ notes: R[]; audit: R[] }>({ notes: [], audit: [] });
	let err = $state('');
	let tab = $state('conversation');
	let urls = $state<Record<string, string>>({});
	let reply = $state('');
	let internal = $state(false);
	let after = $state<'waiting' | 'solved' | 'open'>('waiting');
	let busy = $state(false);

	function take(x: R) {
		d = x;
		for (const m of x.messages) for (const f of m.files) if (!urls[f.path]) supabase.storage.from('support').createSignedUrl(f.path, 3600).then(({ data: u }) => u && (urls[f.path] = u.signedUrl));
	}
	async function load() {
		const [t, x] = await Promise.all([supabase.rpc('admin_support_ticket', { p_id: id }), supabase.rpc('admin_record_extras', { p_kind: 'ticket', p_record: id })]);
		err = t.error ? errMessage(t.error) : '';
		if (t.error) return;
		take(t.data as R);
		if (x.data) extras = x.data as { notes: R[]; audit: R[] };
		onchange?.();
	}
	$effect(() => {
		void id;
		d = null;
		tab = 'conversation';
		reply = '';
		internal = false;
		after = 'waiting';
		load();
	});

	async function send() {
		if (!d || !reply.trim()) return;
		busy = true;
		const { data, error } = await supabase.rpc('admin_support_reply', { p_id: d.id, p_body: reply.trim(), p_internal: internal, p_status: internal ? '' : after });
		busy = false;
		if (error) return toast(errMessage(error), true);
		take(data as R);
		toast(internal ? 'Note saved (only the team sees it)' : after === 'solved' ? 'Sent, and marked solved' : 'Sent. They get an email and an alert.');
		reply = '';
		internal = false;
		load();
	}
	async function set(status = '', priority = '') {
		if (!d) return;
		const { data, error } = await supabase.rpc('admin_support_set', { p_id: d.id, p_status: status, p_priority: priority });
		if (error) return toast(errMessage(error), true);
		take(data as R);
		load();
	}
	const CAT: Record<string, string> = { collabs: 'Collabs', money: 'Money', instagram: 'Instagram', account: 'Account', bug: 'Bug', idea: 'Idea', brand: 'Booking', other: 'Other' };
	const ST: Record<string, [string, string]> = { open: ['Your turn', 't-bad'], waiting: ['Waiting on them', 't-info'], solved: ['Solved', 't-ok'] };
	const tried = $derived(d?.tried ?? {});
	const dev = $derived(d?.device ?? {});
	const who = $derived(d ? (d.creator ? { label: d.creator.name, href: d.creator_id ? href('creators', d.creator_id) : null } : null) : null);
</script>

{#if err}
	<p class="err">{err}</p>
{:else if !d}
	<div class="ld"><span class="spinner"></span></div>
{:else}
	<RecordHead
		crumb={{ label: 'Support', href: href('support') }}
		title={`#${d.number} ${d.subject}`}
		square
		color="#1c539f"
		bind:tab
		tabs={[
			{ id: 'conversation', label: 'Conversation', n: d.messages.length },
			{ id: 'log', label: 'Notes & log', n: extras.notes.length + extras.audit.length }
		]}
	>
		{#snippet tags()}
			<span class="tag {ST[d!.status]?.[1] ?? 't-mute'}">{ST[d!.status]?.[0] ?? d!.status}</span>
			{#if d!.priority === 'urgent'}<span class="tag t-bad">Urgent</span>{/if}
			<span class="tag t-mute">{CAT[d!.category] ?? label(d!.category)}</span>
		{/snippet}
		{#snippet sub()}
			<span>{d!.name ? d!.name + ' · ' : ''}<a href="mailto:{d!.email}">{d!.email}</a></span>
			<span>{label(d!.side)}</span>
			<span>Opened {when(d!.created_at)}</span>
			{#if d!.others}<span>{d!.others} other ticket{d!.others === 1 ? '' : 's'} from them</span>{/if}
		{/snippet}
		{#snippet actions()}
			<button class="btn" onclick={() => set('', d!.priority === 'urgent' ? 'normal' : 'urgent')}>{d!.priority === 'urgent' ? 'Not urgent' : 'Mark urgent'}</button>
			{#if d!.status === 'solved'}<button class="btn" onclick={() => set('open')}>Open again</button>{:else}<button class="btn" onclick={() => set('solved')}>Solve without reply</button>{/if}
		{/snippet}
	</RecordHead>

	<div class="rec">
		<div class="main">
			{#if tab === 'conversation'}
				<section class="card">
					<ol class="msgs">
						{#each d.messages as m (m.id)}
							<li class:team={m.from_team} class:note={m.internal}>
								<div class="mh"><b>{m.internal ? 'Team note' : m.from_team ? 'Miracle support' : d.name || 'They'}</b> <span class="muted">· {when(m.created_at)}</span></div>
								{#if m.body}<p>{m.body}</p>{/if}
								{#each m.files as f (f.path)}
									<a href={urls[f.path] || undefined} target="_blank" rel="noopener" class="file">{#if f.type.startsWith('image/') && urls[f.path]}<img src={urls[f.path]} alt={f.name} />{:else}{f.name}{/if}</a>
								{/each}
							</li>
						{/each}
					</ol>
					{#if d.rating}<p class="rate">Rated {'★'.repeat(d.rating)}{d.rating_note ? `: “${d.rating_note}”` : ''}</p>{/if}
				</section>
				<section class="card reply">
					<label class="sr" for="rp">{internal ? 'Team note' : 'Reply'}</label>
					<textarea id="rp" class="inp" rows="5" bind:value={reply} placeholder={internal ? 'A note only the team sees' : `Reply to ${d.name || 'them'} (they get an email${d.side === 'creator' ? ' and a phone alert' : ''})`}></textarea>
					<div class="ro">
						<label class="ck"><input type="checkbox" bind:checked={internal} /> Note only for the team</label>
						{#if !internal}
							<label class="ck">Then
								<select class="inp sel" bind:value={after}>
									<option value="waiting">Wait for them</option>
									<option value="solved">Mark solved</option>
									<option value="open">Keep it on our side</option>
								</select>
							</label>
						{/if}
						<span class="sp"></span>
						<button class="btn pri" onclick={send} disabled={busy || !reply.trim()}>{busy ? 'Sending…' : internal ? 'Save note' : 'Send reply'}</button>
					</div>
				</section>
			{:else}
				<Notes kind="ticket" record={d.id} notes={extras.notes as never} audit={extras.audit as never} onsaved={(x) => (extras = x)} />
			{/if}
		</div>
		<aside class="side">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Who</h2></div>
				<dl class="kv">
					<div><dt>Name</dt><dd>{d.name || '—'}</dd></div>
					<div><dt>Email</dt><dd>{d.email}</dd></div>
					<div><dt>Side</dt><dd>{label(d.side)}</dd></div>
					{#if who}<div><dt>Creator</dt><dd>{#if who.href}<a href={who.href}>{who.label}</a>{:else}{who.label}{/if}{d.creator?.status ? ` · ${label(d.creator.status)}` : ''}</dd></div>{/if}
					{#if d.brand}<div><dt>Brand</dt><dd>{d.brand.name}</dd></div>{/if}
					<div><dt>Updated</dt><dd>{ago(d.updated_at)}</dd></div>
				</dl>
			</section>
			{#if dev.device || dev.app || dev.page}
				<section class="card">
					<div class="card-h"><h2 class="card-t">Device</h2></div>
					<dl class="kv">
						{#if dev.device}<div><dt>Device</dt><dd>{dev.device}</dd></div>{/if}
						{#if dev.app}<div><dt>App</dt><dd>{dev.app}</dd></div>{/if}
						{#if dev.release}<div><dt>Release</dt><dd class="mono">{dev.release}</dd></div>{/if}
						{#if dev.page}<div><dt>On</dt><dd class="mono">{dev.page}</dd></div>{/if}
					</dl>
					{#if Array.isArray(dev.steps) && dev.steps.length}<ol class="steps">{#each dev.steps as s, i (i)}<li>{s}</li>{/each}</ol>{/if}
				</section>
			{/if}
			{#if tried.question || tried.ai || (Array.isArray(tried.guides) && tried.guides.length)}
				<section class="card">
					<div class="card-h"><h2 class="card-t">What they tried in Help</h2></div>
					<div class="card-b tried">
						{#if tried.question}<p>Asked: “{tried.question}”</p>{/if}
						{#if tried.ai}<p class="muted">AI said: {tried.ai}</p>{/if}
						{#if Array.isArray(tried.guides) && tried.guides.length}<p class="muted">Guides: {(tried.guides as string[]).join(', ')}</p>{/if}
					</div>
				</section>
			{/if}
		</aside>
	</div>
{/if}

<style>
	.ld { padding: 60px; display: grid; place-items: center; }
	.rec { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-top: 20px; }
	.main { flex: 999 1 540px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.side { flex: 1 1 290px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.msgs { list-style: none; margin: 0; padding: 14px 16px; display: grid; gap: 10px; }
	.msgs li { padding: 10px 12px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--line-soft); max-width: 86%; }
	.msgs li.team { justify-self: end; background: var(--accent-soft); border-color: #ddd3f7; }
	.msgs li.note { justify-self: end; background: var(--warn-bg); border-color: #ecd6a8; }
	.mh { font-size: 12px; margin-bottom: 4px; }
	.msgs p { font-size: 13.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
	.file { display: inline-block; margin-top: 6px; font-size: 12.5px; }
	.file img { max-width: 240px; max-height: 200px; border-radius: 6px; border: 1px solid var(--line); display: block; }
	.rate { padding: 0 16px 14px; font-size: 13px; color: var(--ink-2); }
	.reply { padding: 12px 16px; display: grid; gap: 10px; }
	.ro { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 13px; }
	.ck { display: inline-flex; align-items: center; gap: 6px; }
	.sel { height: 30px; width: auto; }
	.sp { flex: 1; }
	.steps { margin: 0; padding: 8px 16px 12px 34px; font-size: 12.5px; color: var(--ink-2); }
	.tried { display: grid; gap: 6px; font-size: 13px; }
</style>
