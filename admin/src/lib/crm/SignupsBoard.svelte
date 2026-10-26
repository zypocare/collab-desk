<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, compact, initials, num } from '../format.ts';
	import { go, href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import Icon from '../Icon.svelte';
	import CreatorPage from './CreatorPage.svelte';
	import { LISTS, type Row } from './lists.ts';

	// Every creator as a pipeline, from asking to join to their first paid invoice. A card opens the creator in a
	// panel that slides over the board (#/signups/<id>); the board stays where it was behind it.
	let { openId = '', onchange }: { openId?: string; onchange?: () => void } = $props();

	let rows = $state<Row[] | null>(null);
	let err = $state('');
	let q = $state('');
	let since = $state(0);

	async function load() {
		const { data, error } = await supabase.rpc('admin_list', { p_kind: 'creators', p_q: '', p_filters: {}, p_sort: 'joined', p_desc: true, p_limit: 2000, p_offset: 0 });
		err = error ? errMessage(error) : '';
		if (!error) rows = (data as { rows: Row[] }).rows;
	}
	onMount(load);

	const STAGES = [
		{ id: 'asked', name: 'Asked to join', color: '#f2994a' },
		{ id: 'approved', name: 'Approved', color: '#6b3fd4' },
		{ id: 'instagram', name: 'Instagram linked', color: '#3a67d8' },
		{ id: 'collab', name: 'First collab', color: '#0b877d' },
		{ id: 'paid', name: 'First paid', color: '#1d6b45' },
		{ id: 'off', name: 'Paused or declined', color: '#8c8291' }
	] as const;
	function stageOf(r: Row): string {
		if (r.status === 'pending') return 'asked';
		if (r.status !== 'active') return 'off';
		if (Number(r.paid) > 0) return 'paid';
		if (Number(r.collabs) > 0) return 'collab';
		if (r.instagram) return 'instagram';
		return 'approved';
	}
	const shown = $derived.by(() => {
		const t = q.trim().toLowerCase();
		const from = since ? Date.now() - since * 864e5 : 0;
		return (rows ?? []).filter((r) => (!t || String(r._search ?? '').includes(t)) && (!from || Date.parse(r.requested_at ?? r.joined) >= from));
	});
	const columns = $derived(STAGES.map((s) => ({ ...s, rows: shown.filter((r) => stageOf(r) === s.id) })));
	const order = $derived(columns.flatMap((c) => c.rows.map((r) => String(r.id))));
	const at = $derived(order.indexOf(openId));
	const HUES = ['#d4296a', '#6b3fd4', '#3a67d8', '#0b877d', '#b4700a', '#7550d0', '#c8255e', '#4a7a3a'];
	const hue = (r: Row) => HUES[Number(r.id) % HUES.length];
	const sub = (r: Row) => [r.handle ? '@' + String(r.handle).replace(/^@/, '') : '', r.city, r.followers ? compact(r.followers) : r.followers_said].filter(Boolean).join(' · ');

	// Approve or decline straight from a card (the same as the list's buttons, with the same emails).
	async function act(r: Row, i: number, e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const a = LISTS.signups.rowActions?.[i];
		if (a && (await a.run([r])) !== false) {
			await load();
			onchange?.();
		}
	}
	function close() {
		go('signups');
	}
	function onKey(e: KeyboardEvent) {
		if (!openId) return;
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="sb">
	<header class="sb-h">
		<div>
			<h1>Creator pipeline</h1>
			<div class="dots">
				{#each columns.slice(0, 5) as c (c.id)}<span style:color={c.color}>● <b>{num(c.rows.length)}</b> {c.name.toLowerCase()}</span>{/each}
			</div>
		</div>
		<div class="acts">
			<a class="btn" href={href('creators')}><Icon name="list" />All creators</a>
			<a class="btn pri" href={href('growth')}><Icon name="send" />Invite creators</a>
		</div>
	</header>

	<div class="bar">
		<label class="search"><Icon name="search" /><span class="sr">Search creators</span><input type="search" placeholder="Name, email, handle, city" bind:value={q} /></label>
		<div class="seg" role="group" aria-label="Joined">
			{#each [[0, 'Any time'], [7, '7 days'], [30, '30 days']] as [v, l] (v)}<button class:on={since === v} onclick={() => (since = Number(v))}>{l}</button>{/each}
		</div>
		<button class="btn" onclick={load}><Icon name="refresh" />Refresh</button>
	</div>

	{#if err}<p class="err">{err}</p>{/if}
	{#if !rows}
		<div class="ld"><span class="spinner"></span></div>
	{:else}
		<div class="board">
			{#each columns as col (col.id)}
				<section class="col" aria-label={col.name}>
					<div class="col-h"><span class="tag" style:background={col.color} style:color="#fff">{col.name}</span><b>{num(col.rows.length)}</b></div>
					{#each col.rows.slice(0, 60) as r (r.id)}
						<a class="card pc" class:open={openId === String(r.id)} href={href('signups', r.id)}>
							<span class="who">
								<span class="av" style:background={hue(r)}>{initials(r.name || r.email)}</span>
								<span class="nm"><b>{r.name || r.email}</b><small>{sub(r) || r.email}</small></span>
							</span>
							<span class="ft">
								{#if r.niche}<span class="tag t-mute">{String(r.niche).split(',')[0]}</span>{/if}
								<span class="when">{col.id === 'asked' ? `asked ${ago(r.requested_at ?? r.joined)}` : `joined ${ago(r.joined)}`}</span>
								{#if col.id === 'asked'}
									<button class="btn sm pri" onclick={(e) => act(r, 0, e)}>Approve</button>
								{/if}
							</span>
						</a>
					{:else}
						<div class="none">Nobody here yet.</div>
					{/each}
					{#if col.rows.length > 60}<a class="more" href={href('creators')}>{num(col.rows.length - 60)} more in All creators ›</a>{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>

{#if openId}
	<div class="so" role="presentation">
		<button class="so-scrim" aria-label="Close" onclick={close}></button>
		<section class="so-panel" aria-label="Creator">
			<div class="so-top">
				<a class="btn sm" class:dis={at <= 0} href={at > 0 ? href('signups', order[at - 1]) : undefined} aria-label="Previous creator">‹</a>
				<a class="btn sm" class:dis={at < 0 || at >= order.length - 1} href={at >= 0 && at < order.length - 1 ? href('signups', order[at + 1]) : undefined} aria-label="Next creator">›</a>
				<span class="muted">{at >= 0 ? `${at + 1} of ${order.length}` : ''}</span>
				<span class="sp"></span>
				<a class="btn sm" href={href('creators', openId)}><Icon name="external" />Full page</a>
				<button class="btn sm ghost" aria-label="Close" onclick={close}><Icon name="x" /></button>
			</div>
			<div class="so-body">
				{#key openId}<CreatorPage id={openId} onchange={() => (load(), onchange?.())} />{/key}
			</div>
		</section>
	</div>
{/if}

<style>
	.sb { display: flex; flex-direction: column; gap: 18px; }
	.sb-h { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 14px; }
	h1 { font-size: 28px; font-weight: 800; letter-spacing: -.02em; }
	.dots { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; font-size: 12.5px; font-weight: 500; }
	.dots b { color: var(--ink); }
	.dots span { color: inherit; }
	.acts { display: flex; gap: 10px; flex-wrap: wrap; }
	.bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
	.search { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); flex: 1 1 240px; max-width: 340px; color: var(--ink-3); }
	.search input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--ink); font-size: 13.5px; }
	.seg { display: inline-flex; padding: 3px; border-radius: 11px; background: var(--surface); border: 1px solid var(--line); }
	.seg button { height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: none; font-size: 13px; font-weight: 600; color: var(--ink-3); }
	.seg button.on { background: var(--ink); color: #fff; }
	.ld { padding: 60px; display: grid; place-items: center; }
	.board { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 10px; align-items: flex-start; }
	.col { flex: 0 0 290px; display: flex; flex-direction: column; gap: 10px; padding: 10px; border-radius: 16px; background: #efecf2; }
	.col-h { display: flex; align-items: center; gap: 8px; padding: 2px 4px; }
	.col-h b { font-size: 13px; color: var(--ink-3); }
	.pc { display: grid; gap: 10px; padding: 13px 14px; color: var(--ink); transition: box-shadow .15s, transform .15s; }
	.pc:hover { text-decoration: none; color: var(--ink); box-shadow: var(--shadow); transform: translateY(-1px); }
	.pc.open { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
	.who { display: flex; align-items: center; gap: 10px; min-width: 0; }
	.av { width: 40px; height: 40px; border-radius: 50%; flex: none; display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 13px; }
	.nm { display: grid; gap: 2px; min-width: 0; }
	.nm b { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.nm small { font-size: 12px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ft { display: flex; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px solid var(--line-soft); }
	.when { flex: 1; font-size: 12px; color: var(--ink-3); }
	.none { padding: 14px 10px; font-size: 12.5px; color: var(--ink-3); text-align: center; }
	.more { font-size: 12.5px; font-weight: 600; padding: 4px 6px; }

	.so { position: fixed; inset: 0; z-index: 50; display: flex; justify-content: flex-end; }
	.so-scrim { position: absolute; inset: 0; border: 0; background: rgba(30, 23, 28, .5); backdrop-filter: blur(2px); cursor: pointer; animation: fade .2s both; }
	.so-panel { position: relative; width: min(1000px, 100%); height: 100%; display: flex; flex-direction: column; background: var(--bg); box-shadow: -30px 0 60px -30px rgba(0, 0, 0, .45); animation: slide .28s cubic-bezier(.2, .8, .2, 1) both; }
	.so-top { display: flex; align-items: center; gap: 8px; padding: 12px 20px; background: var(--surface); border-bottom: 1px solid var(--line); }
	.so-top .btn.sm { min-width: 32px; justify-content: center; }
	.so-top .dis { opacity: .4; pointer-events: none; }
	.sp { flex: 1; }
	.so-body { flex: 1; overflow-y: auto; padding: 26px var(--gut) 40px; }
	@keyframes slide { from { transform: translateX(40px); opacity: 0; } }
	@keyframes fade { from { opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .so-panel, .so-scrim { animation: none; } }
</style>
