<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, num } from './format.ts';
	import { errMessage, supabase } from './supabase.ts';
	import { toast } from './ui.svelte.ts';

	// Support tickets from creators, their teams and brands. Answer here: they get an email, a phone alert
	// (creators) and the reply in the app. Notes only the team sees stay here.
	type Msg = { id: number; from_team: boolean; internal: boolean; author: string; body: string; files: { path: string; name: string; type: string }[]; created_at: string };
	type Row = { id: string; number: number; subject: string; category: string; status: 'open' | 'waiting' | 'solved'; priority: 'normal' | 'urgent'; side: string; name: string; email: string; team_unread: boolean; created_at: string; updated_at: string; creator: string | null; last: { body: string; from_team: boolean; at: string } | null };
	type Detail = Row & { messages: Msg[]; device: Record<string, unknown>; tried: Record<string, unknown>; rating: number | null; rating_note: string; creator: { slug: string; name: string; status: string } | null; brand: { name: string } | null; others: number };
	type Data = { counts: { open: number; waiting: number; solved: number; unread: number; urgent: number; rating: number | null; rated: number }; tickets: Row[] };

	let { onload }: { onload?: (n: number) => void } = $props();
	let data = $state<Data | null>(null);
	let err = $state('');
	let show = $state<'open' | 'waiting' | 'solved' | 'all'>('open');
	let openId = $state<string | null>(null);
	let d = $state<Detail | null>(null);
	let urls = $state<Record<string, string>>({});
	let reply = $state('');
	let internal = $state(false);
	let after = $state<'waiting' | 'solved' | 'open'>('waiting');
	let busy = $state(false);

	async function load() {
		const { data: x, error } = await supabase.rpc('admin_support', { p_status: show });
		err = error ? errMessage(error) : '';
		if (error) return;
		data = x as Data;
		onload?.(data.counts.unread);
		if (openId === null && data.tickets[0]) pick(data.tickets[0].id);
	}
	onMount(load);
	async function pick(id: string) {
		openId = id;
		d = null;
		reply = '';
		internal = false;
		after = 'waiting';
		const { data: x, error } = await supabase.rpc('admin_support_ticket', { p_id: id });
		if (error) return toast(errMessage(error), true);
		if (openId !== id) return;
		d = x as Detail;
		for (const m of d.messages) for (const f of m.files) if (!urls[f.path]) supabase.storage.from('support').createSignedUrl(f.path, 3600).then(({ data: u }) => u && (urls[f.path] = u.signedUrl));
		const row = data?.tickets.find((t) => t.id === id);
		if (row?.team_unread && data) {
			row.team_unread = false;
			data.counts.unread = Math.max(0, data.counts.unread - 1);
			onload?.(data.counts.unread);
		}
	}
	async function send() {
		if (!d || !reply.trim()) return;
		busy = true;
		const { data: x, error } = await supabase.rpc('admin_support_reply', { p_id: d.id, p_body: reply.trim(), p_internal: internal, p_status: internal ? '' : after });
		busy = false;
		if (error) return toast(errMessage(error), true);
		d = { ...(x as Detail) };
		toast(internal ? 'Note saved (only the team sees it)' : after === 'solved' ? 'Sent, and marked solved' : 'Sent. They get an email and an alert.');
		reply = '';
		internal = false;
		load();
	}
	async function set(status = '', priority = '') {
		if (!d) return;
		const { data: x, error } = await supabase.rpc('admin_support_set', { p_id: d.id, p_status: status, p_priority: priority });
		if (error) return toast(errMessage(error), true);
		d = { ...(x as Detail) };
		load();
	}
	const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
	const CAT: Record<string, string> = { collabs: 'Collabs', money: 'Money', instagram: 'Instagram', account: 'Account', bug: 'Bug', idea: 'Idea', brand: 'Booking', other: 'Other' };
	const ST: Record<string, string> = { open: 'Your turn', waiting: 'Waiting on them', solved: 'Solved' };
	const tried = $derived(d?.tried ?? {});
	const dev = $derived(d?.device ?? {});
</script>

<div class="pr-kpis">
	<div><small>Your turn</small><b class="num" class:bad={!!data?.counts.open}>{data ? num(data.counts.open) : '—'}</b></div>
	<div><small>Unread</small><b class="num">{data ? num(data.counts.unread) : '—'}</b></div>
	<div><small>Waiting on them</small><b class="num">{data ? num(data.counts.waiting) : '—'}</b></div>
	<div><small>Solved</small><b class="num ok">{data ? num(data.counts.solved) : '—'}</b></div>
	<div><small>Rating</small><b class="num">{data?.counts.rating ? `${data.counts.rating} ★` : '—'}</b></div>
</div>

<div class="pr-chips" role="tablist" aria-label="Show">
	{#each [['open', 'Your turn'], ['waiting', 'Waiting on them'], ['solved', 'Solved'], ['all', 'All']] as const as [k, l] (k)}
		<button role="tab" aria-selected={show === k} class:on={show === k} onclick={() => ((show = k), (openId = null), (d = null), load())}>{l}</button>
	{/each}
	<button class="lnk su-ref" onclick={load}>Refresh</button>
</div>

{#if err}<p class="err">{err}</p>{/if}

{#if !data}
	<div class="pr-load"><span class="spinner"></span></div>
{:else}
	<div class="pr-grid">
		<div class="pr-list">
			{#each data.tickets as t (t.id)}
				<button class="su-row" class:on={openId === t.id} onclick={() => pick(t.id)}>
					<span class="su-top">
						{#if t.team_unread}<i class="su-dot" aria-label="Unread"></i>{/if}
						<b>#{t.number} {t.subject}</b>
						{#if t.priority === 'urgent'}<em class="su-urg">Urgent</em>{/if}
					</span>
					<small>{t.name || t.email} · {t.side === 'creator' ? `creator${t.creator ? ` (${t.creator})` : ''}` : t.side} · {CAT[t.category] ?? t.category} · {ago(t.updated_at)}</small>
					{#if t.last}<small class="su-last">{t.last.from_team ? 'Us: ' : ''}{t.last.body}</small>{/if}
				</button>
			{:else}
				<p class="pr-none">{show === 'open' ? 'Nobody is waiting on you.' : 'No tickets here.'}</p>
			{/each}
		</div>

		<aside class="pr-pane">
			{#if openId === null}
				<p class="pr-none">Pick a ticket.</p>
			{:else if !d}
				<div class="pr-load"><span class="spinner"></span></div>
			{:else}
				<div class="pr-top">
					<small>#{d.number} · {CAT[d.category] ?? d.category} · {ST[d.status]}{d.priority === 'urgent' ? ' · urgent' : ''} · opened {time(d.created_at)}</small>
					<b>{d.subject}</b>
					<small>{d.name ? `${d.name} · ` : ''}<a href="mailto:{d.email}">{d.email}</a>{d.creator ? ` · creator ${d.creator.name} (${d.creator.slug}, ${d.creator.status})` : ''}{d.brand ? ` · brand ${d.brand.name}` : ''}{d.others ? ` · ${d.others} other ticket${d.others === 1 ? '' : 's'}` : ''}</small>
					{#if dev.device}<small>{dev.device}{dev.app ? ` · app ${dev.app}` : ''}{dev.release ? ` · release ${dev.release}` : ''}{dev.page ? ` · on ${dev.page}` : ''}</small>{/if}
				</div>

				{#if tried.question || tried.ai || (Array.isArray(tried.guides) && tried.guides.length)}
					<div class="pr-note su-tried">
						<small>What they tried in Help</small>
						{#if tried.question}<span>Asked: “{tried.question}”</span>{/if}
						{#if tried.ai}<span class="su-ai">AI said: {tried.ai}</span>{/if}
						{#if Array.isArray(tried.guides) && tried.guides.length}<small>Guides: {(tried.guides as string[]).join(', ')}</small>{/if}
					</div>
				{/if}
				{#if Array.isArray(dev.steps) && dev.steps.length}
					<div class="pr-sec"><span>Last screens</span><ol>{#each dev.steps as s, i (i)}<li>{s}</li>{/each}</ol></div>
				{/if}

				<ol class="su-msgs">
					{#each d.messages as m (m.id)}
						<li class:team={m.from_team} class:note={m.internal}>
							<small>{m.internal ? 'Team note' : m.from_team ? 'Miracle support' : d.name || 'They'} · {time(m.created_at)}</small>
							{#if m.body}<p>{m.body}</p>{/if}
							{#each m.files as f (f.path)}
								<a href={urls[f.path] || undefined} target="_blank" rel="noopener" class="su-file">{#if f.type.startsWith('image/') && urls[f.path]}<img src={urls[f.path]} alt={f.name} />{:else}{f.name}{/if}</a>
							{/each}
						</li>
					{/each}
				</ol>
				{#if d.rating}<p class="su-rate">Rated {d.rating} ★{d.rating_note ? `: “${d.rating_note}”` : ''}</p>{/if}

				<div class="f">
					<textarea class="inp su-box" rows="5" bind:value={reply} placeholder={internal ? 'A note only the team sees' : `Reply to ${d.name || 'them'} (they get an email and an alert)`}></textarea>
				</div>
				<div class="su-opts">
					<label><input type="checkbox" bind:checked={internal} /> Note only for the team</label>
					{#if !internal}
						<label>Then
							<select class="inp su-sel" bind:value={after}>
								<option value="waiting">Wait for them</option>
								<option value="solved">Mark solved</option>
								<option value="open">Keep it on our side</option>
							</select>
						</label>
					{/if}
				</div>
				<div class="pr-acts">
					<button class="neo white" onclick={send} disabled={busy || !reply.trim()}>{busy ? 'Sending…' : internal ? 'Save note' : 'Send reply'}</button>
					{#if d.status === 'solved'}<button class="neo dark" onclick={() => set('open')}>Open again</button>
					{:else}<button class="neo dark" onclick={() => set('solved')}>Solve without reply</button>{/if}
				</div>
				<button class="lnk su-pri" onclick={() => set('', d!.priority === 'urgent' ? 'normal' : 'urgent')}>{d.priority === 'urgent' ? 'Not urgent' : 'Mark urgent'}</button>
			{/if}
		</aside>
	</div>
{/if}

<style>
	.pr-kpis { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px; }
	.pr-kpis > div { padding: 10px 16px; border: 1px solid var(--line); background: var(--surface); display: grid; min-width: 120px; }
	.pr-kpis small { font-size: 11.5px; color: var(--ink-3); }
	.pr-kpis b { font-size: 22px; }
	.bad { color: var(--bad) !important; }
	.ok { color: var(--ok); }
	.pr-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 16px; }
	.pr-chips button:not(.lnk) { height: 34px; padding: 0 14px; border: 1px solid var(--line-strong); background: none; color: var(--ink-2); font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
	.pr-chips button.on { background: var(--ink); border-color: var(--ink); color: var(--bg); }
	.su-ref { margin-left: auto; font-size: 13px; }
	.pr-load { min-height: 200px; display: grid; place-items: center; }
	.pr-grid { display: grid; grid-template-columns: minmax(0, 1fr) 480px; gap: 18px; align-items: start; }
	.pr-list { border: 1px solid var(--line); background: var(--surface); }
	.su-row { width: 100%; display: grid; gap: 4px; padding: 13px 16px; border: 0; border-top: 1px solid var(--line); background: none; color: inherit; text-align: left; }
	.su-row:first-child { border-top: 0; }
	.su-row:hover { background: color-mix(in oklab, var(--surface-2) 60%, transparent); }
	.su-row.on { background: var(--surface-2); box-shadow: inset 3px 0 0 var(--accent); }
	.su-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.su-top b { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.su-row small { font-size: 12px; color: var(--ink-3); }
	.su-last { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-2) !important; }
	.su-dot { flex: none; width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
	.su-urg { flex: none; padding: 2px 8px; border-radius: 99px; background: var(--bad); color: #1c0912; font: 800 10.5px var(--f-body); font-style: normal; text-transform: uppercase; letter-spacing: .06em; }
	.pr-none { padding: 22px 16px; color: var(--ink-3); }
	.pr-pane { position: sticky; top: 84px; display: flex; flex-direction: column; gap: 14px; padding: 20px; border: 1px solid var(--line); background: var(--chrome); min-width: 0; max-height: calc(100vh - 110px); overflow: auto; }
	.pr-top { display: grid; gap: 6px; }
	.pr-top small { font-size: 12px; color: var(--ink-3); overflow-wrap: anywhere; }
	.pr-top b { font-size: 18px; line-height: 1.3; overflow-wrap: anywhere; }
	.pr-sec { display: grid; gap: 6px; }
	.pr-sec > span { font-size: 11px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-3); }
	.pr-sec ol { margin: 0; padding-left: 18px; display: grid; gap: 3px; font-size: 13px; color: var(--ink-2); }
	.pr-note { display: grid; gap: 4px; padding: 12px 14px; border: 1px solid var(--line); background: var(--surface); }
	.pr-note small { font-size: 12px; color: var(--ink-3); }
	.pr-note span { font-size: 13.5px; }
	.su-ai { color: var(--ink-2); white-space: pre-line; }
	.su-msgs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
	.su-msgs li { display: grid; gap: 6px; padding: 12px 14px; border: 1px solid var(--line); background: var(--surface); }
	.su-msgs li.team { border-color: color-mix(in oklab, var(--g1) 45%, var(--line)); background: color-mix(in oklab, var(--g1) 8%, var(--surface)); }
	.su-msgs li.note { border-style: dashed; border-color: var(--warn); background: color-mix(in oklab, var(--warn) 8%, var(--surface)); }
	.su-msgs small { font-size: 11.5px; font-weight: 700; color: var(--ink-3); }
	.su-msgs p { margin: 0; font-size: 14px; line-height: 1.55; white-space: pre-line; overflow-wrap: anywhere; }
	.su-file { font-size: 13px; color: var(--accent); }
	.su-file img { max-width: 100%; max-height: 260px; border: 1px solid var(--line); }
	.su-rate { margin: 0; font-size: 13px; color: var(--ink-2); }
	.su-box { height: auto; padding: 12px 14px; line-height: 1.5; resize: vertical; }
	.su-opts { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--ink-2); }
	.su-opts label { display: inline-flex; align-items: center; gap: 8px; }
	.su-sel { width: auto; height: 36px; padding: 0 10px; }
	.pr-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.su-pri { align-self: flex-start; font-size: 13px; }
	@media (max-width: 1000px) {
		.pr-grid { grid-template-columns: minmax(0, 1fr); }
		.pr-pane { position: static; max-height: none; }
	}
</style>
