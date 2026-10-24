<script lang="ts">
	import { ago, label, num, when } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { toast } from '../ui.svelte.ts';
	import RecordHead from './RecordHead.svelte';
	import Notes from './Notes.svelte';

	// One problem (a crash grouped by what went wrong): the stack, what people did before it, who hit it.
	let { id, onchange }: { id: string; onchange?: () => void } = $props();

	type R = Record<string, any>;
	let p = $state<R | null>(null);
	let extras = $state<{ notes: R[]; audit: R[] }>({ notes: [], audit: [] });
	let err = $state('');
	let tab = $state('overview');
	let busy = $state(false);

	async function load() {
		const [a, x] = await Promise.all([supabase.rpc('admin_problem', { p_id: Number(id) }), supabase.rpc('admin_record_extras', { p_kind: 'problem', p_record: id })]);
		err = a.error ? errMessage(a.error) : !a.data ? 'Not found.' : '';
		if (a.error || !a.data) return;
		p = a.data as R;
		if (x.data) extras = x.data as { notes: R[]; audit: R[] };
	}
	$effect(() => {
		void id;
		p = null;
		tab = 'overview';
		load();
	});
	async function set(to: 'open' | 'fixed' | 'ignored') {
		busy = true;
		const { error } = await supabase.rpc('admin_problem_set', { p_id: Number(id), p_status: to });
		busy = false;
		if (error) return toast(errMessage(error), true);
		toast(to === 'fixed' ? 'Marked fixed. You’ll hear if it comes back.' : to === 'ignored' ? 'Ignored' : 'Opened again');
		await load();
		onchange?.();
	}
	const SRC: Record<string, string> = { app: 'App', server: 'Server', jobs: 'Emails & jobs' };
	const TAG: Record<string, string> = { open: 't-warn', fixed: 't-ok', ignored: 't-mute' };
</script>

{#if err}
	<p class="err">{err}</p>
{:else if !p}
	<div class="ld"><span class="spinner"></span></div>
{:else}
	<RecordHead
		crumb={{ label: 'Problems', href: href('problems') }}
		title={p.message}
		square
		color="#a3241a"
		bind:tab
		tabs={[
			{ id: 'overview', label: 'What happened' },
			{ id: 'events', label: 'Each time', n: p.events.length },
			{ id: 'notes', label: 'Notes & log', n: extras.notes.length + extras.audit.length }
		]}
	>
		{#snippet tags()}
			<span class="tag {TAG[p!.status] ?? 't-mute'}">{label(p!.status)}</span>
			<span class="tag t-mute">{SRC[p!.source] ?? p!.source}</span>
		{/snippet}
		{#snippet sub()}
			<span>{num(p!.times)} times</span>
			{#if p!.place}<span class="mono">{p!.place}</span>{/if}
			{#if p!.release}<span>release {p!.release}</span>{/if}
			<span>First seen {when(p!.first_seen)} · last {ago(p!.last_seen)}</span>
		{/snippet}
		{#snippet actions()}
			{#if p!.status !== 'fixed'}<button class="btn pri" disabled={busy} onclick={() => set('fixed')}>Mark fixed</button>{/if}
			{#if p!.status === 'open'}<button class="btn" disabled={busy} onclick={() => set('ignored')}>Ignore</button>{/if}
			{#if p!.status !== 'open'}<button class="btn" disabled={busy} onclick={() => set('open')}>Open again</button>{/if}
		{/snippet}
	</RecordHead>

	<div class="rec">
		<div class="main">
			{#if tab === 'overview'}
				{#if p.sample?.stack}
					<section class="card"><div class="card-h"><h2 class="card-t">Stack</h2>{#if p.sample.ref}<span class="mono muted sm">ref {p.sample.ref}</span>{/if}</div><pre class="stack">{p.sample.stack}</pre></section>
				{/if}
				{#if p.sample?.steps?.length}
					<section class="card">
						<div class="card-h"><h2 class="card-t">What they did before</h2></div>
						<ol class="steps">{#each p.sample.steps as s, i (i)}<li>{s}</li>{/each}<li class="bad">It broke</li></ol>
					</section>
				{/if}
				<section class="card">
					<div class="card-h"><h2 class="card-t">What people said</h2></div>
					{#if !p.notes.length}<div class="card-empty">Nobody added a note when it happened.</div>{/if}
					{#each p.notes as n (n.ref)}<div class="nt"><p>“{n.note}”</p><small class="muted">{n.who || 'Signed out'} · {n.device} · ref {n.ref} · {ago(n.at)}</small></div>{/each}
				</section>
			{:else if tab === 'events'}
				<section class="card tbl-wrap">
					<table class="tbl">
						<thead><tr><th>When</th><th>Who</th><th>Device</th><th>Screen</th><th>Release</th><th>Ref</th></tr></thead>
						<tbody>{#each p.events as e (e.ref)}<tr><td>{when(e.at)}</td><td>{e.who || 'Signed out'}</td><td class="wr">{e.device}</td><td class="mono">{e.place}</td><td class="mono">{e.release}</td><td class="mono">{e.ref}</td></tr>{/each}</tbody>
					</table>
				</section>
			{:else}
				<Notes kind="problem" record={String(p.id)} notes={extras.notes as never} audit={extras.audit as never} onsaved={(x) => (extras = x)} />
			{/if}
		</div>
		<aside class="side">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Details</h2></div>
				<dl class="kv">
					<div><dt>Where</dt><dd>{SRC[p.source] ?? p.source}</dd></div>
					<div><dt>Screen</dt><dd class="mono">{p.place || '—'}</dd></div>
					<div><dt>Release</dt><dd class="mono">{p.release || '—'}</dd></div>
					<div><dt>Times</dt><dd>{num(p.times)}</dd></div>
					{#if p.sample?.device}<div><dt>Device</dt><dd>{p.sample.device}</dd></div>{/if}
				</dl>
			</section>
		</aside>
	</div>
{/if}

<style>
	.ld { padding: 60px; display: grid; place-items: center; }
	.rec { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-top: 20px; }
	.main { flex: 999 1 540px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.side { flex: 1 1 290px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.sm { font-size: 12px; }
	.stack { margin: 0; padding: 12px 16px; font: 12px/1.5 var(--f-mono); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 420px; overflow: auto; background: var(--surface-2); border-radius: 0 0 10px 10px; }
	.steps { margin: 0; padding: 10px 16px 14px 36px; font-size: 13px; display: grid; gap: 4px; }
	.steps .bad { color: var(--bad); font-weight: 500; }
	.nt { padding: 10px 16px; border-top: 1px solid var(--line-soft); display: grid; gap: 3px; font-size: 13px; }
	.nt small { font-size: 12px; }
	.wr { white-space: normal; min-width: 160px; }
</style>
