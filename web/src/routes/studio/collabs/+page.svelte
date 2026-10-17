<script lang="ts">
	import { ask } from '#lib/confirm.svelte.ts';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { byCode, byId, markPaid, priorityOf, reloadCollabs, setStage, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import type { Stage } from '#lib/types.ts';
	import { confetti, copyText, pointer, toast, ui } from '#lib/ui.svelte.ts';
	import { STAGES, errMessage, inr, inrS, parse, stageLabel } from '#lib/util.ts';
	import Select from '#lib/components/Select.svelte';
	import CollabCard from '#lib/components/CollabCard.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import CollabRow from '#lib/components/CollabRow.svelte';
	import { phone } from '#lib/phone.svelte.ts';

	let filter = $state<'all' | 'paid' | 'barter'>('all');
	let q = $state('');
	let showDeclined = $state(false);
	let over = $state<string | null>(null);
	let popped = $state<string | null>(null);

	// Batch actions: pick several cards, then move, mark paid or remind them all at once.
	let selecting = $state(false);
	const picked = new SvelteSet<string>();
	let busy = $state(false);
	const pickedCollabs = $derived(studio.collabs.filter((c) => picked.has(c.id)));
	const payable = $derived(pickedCollabs.filter((c) => c.type !== 'barter' && c.fee > 0 && c.pay_status !== 'paid' && c.pay_status !== 'na'));
	const toggle = (id: string) => (picked.has(id) ? picked.delete(id) : picked.add(id));
	function stopSelecting() {
		selecting = false;
		picked.clear();
	}
	function pickColumn(ids: string[]) {
		const all = ids.every((id) => picked.has(id));
		for (const id of ids) all ? picked.delete(id) : picked.add(id);
	}
	async function batchMove(stage: Stage) {
		const list = pickedCollabs.filter((c) => c.stage !== stage);
		if (!list.length) return;
		if (!(await ask({ title: `Move ${list.length} collab${list.length > 1 ? 's' : ''} to ${stageLabel(stage)}?`, body: stage === 'declined' ? 'Brands with updates turned on are told politely.' : 'Brands with updates turned on get a short email about the new stage.', ok: 'Move', danger: stage === 'declined' }))) return;
		busy = true;
		for (const c of list) await setStage(c, stage, true);
		busy = false;
		if (stage === 'live' || stage === 'wrapped') confetti();
		toast(`${list.length} collab${list.length > 1 ? 's' : ''} moved to ${stageLabel(stage)}`, 'layers');
		stopSelecting();
	}
	async function batchPaid() {
		const list = payable;
		if (!list.length) return;
		if (!(await ask({ title: `Mark ${list.length} as paid?`, body: `${inr(list.reduce((a, c) => a + c.fee, 0))} in total, received today. Open invoices are settled in full.`, ok: 'Mark paid' }))) return;
		busy = true;
		for (const c of list) await markPaid(c, true);
		busy = false;
		confetti();
		toast(`${inr(list.reduce((a, c) => a + c.fee, 0))} from ${list.length} collab${list.length > 1 ? 's' : ''} marked as paid`, 'wallet');
		stopSelecting();
	}
	async function batchTrack() {
		const withEmail = pickedCollabs.filter((c) => c.contact_email);
		if (!withEmail.length) return toast('None of these has a brand email. Copy the link from each collab for their DM instead.', 'alert');
		if (!(await ask({ title: `Email tracking links to ${withEmail.length} brand${withEmail.length > 1 ? 's' : ''}?`, body: `Each gets a private link to follow their collab, no sign-up needed. Status emails are switched on for them.${pickedCollabs.length > withEmail.length ? ` ${pickedCollabs.length - withEmail.length} without an email are skipped.` : ''}`, ok: 'Send' }))) return;
		busy = true;
		const { data, error } = await supabase.rpc('send_track_links', { p_ids: withEmail.map((c) => c.id), p_notify: true });
		busy = false;
		if (error) return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
		toast(`${(data as { sent: number }).sent} tracking link${(data as { sent: number }).sent === 1 ? '' : 's'} sent`, 'send');
		await reloadCollabs();
		stopSelecting();
	}
	async function batchRemind() {
		if (!(await ask({ title: `Send reminders to ${picked.size} brand${picked.size > 1 ? 's' : ''}?`, body: 'Each gets the reminder that fits: unpaid invoice, open quote, or draft waiting. Nobody gets two in a day.', ok: 'Send' }))) return;
		busy = true;
		const { data, error } = await supabase.rpc('send_reminders', { p_ids: [...picked] });
		busy = false;
		if (error) return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
		const r = data as { payment: number; quote: number; draft: number; skipped: number };
		const parts = [r.payment && `${r.payment} payment`, r.quote && `${r.quote} quote`, r.draft && `${r.draft} draft`].filter(Boolean);
		const sent = r.payment + r.quote + r.draft;
		toast(
			sent
				? `${sent} reminder${sent > 1 ? 's' : ''} sent (${parts.join(', ')})${r.skipped ? `. ${r.skipped} had nothing to remind about` : ''}`
				: 'Nothing to remind about: no unpaid invoice, open quote or draft waiting (or reminded in the last day).',
			sent ? 'send' : 'alert'
		);
		await reloadCollabs();
		if (sent) stopSelecting();
	}

	// Open a collab from an email link (/studio/collabs?open=CODE), once, then tidy the address.
	$effect(() => {
		const code = page.url.searchParams.get('open');
		if (!code || !studio.loaded) return;
		const c = untrack(() => byCode(code));
		if (c) ui.openCollab = c.id;
		goto('/studio/collabs', { replace: true, shallow: true });
	});

	const visible = $derived(
		studio.collabs.filter(
			(c) =>
				(filter === 'all' || (filter === 'paid' ? c.type !== 'barter' : c.type !== 'paid')) &&
				(!q.trim() || `${c.brand.name} ${c.code} ${c.brand.category} ${c.brand.instagram} ${c.contact_name}`.toLowerCase().includes(q.trim().toLowerCase()))
		)
	);
	const key = (d: string | null) => (d ? parse(d).getTime() : 0);
	const columns = $derived(
		[...STAGES, ...(showDeclined ? [{ id: 'declined' as Stage, label: 'Declined', pub: '' }] : [])].map((s) => {
			const cs = visible
				.filter((c) => c.stage === s.id)
				.sort((a, b) => {
					// Requests still being decided: highest priority first (paid before barter).
					if (s.id === 'request' || s.id === 'negotiating') return (priorityOf(b)?.score ?? 0) - (priorityOf(a)?.score ?? 0);
					const ka = key(a.draft_date || a.live_date || a.received_on), kb = key(b.draft_date || b.live_date || b.received_on);
					return s.id === 'wrapped' || s.id === 'declined' ? kb - ka : ka - kb;
				});
			return { s, cs, sum: cs.reduce((a, c) => a + c.fee + c.product_value, 0) };
		})
	);
	// Phone: a list instead of the board, filtered by stage with a row of chips.
	let mstage = $state<'active' | Stage>('active');
	const ACTIVE: Stage[] = ['request', 'negotiating', 'confirmed', 'creating', 'live'];
	const mtabs = $derived(
		[
			{ id: 'active' as const, label: 'Active', n: visible.filter((c) => ACTIVE.includes(c.stage)).length },
			...[...STAGES, { id: 'declined' as Stage, label: 'Declined' }].map((s) => ({ id: s.id, label: s.label, n: visible.filter((c) => c.stage === s.id).length }))
		].filter((t) => t.id === 'active' || t.n || t.id === mstage)
	);
	const mgroups = $derived(
		[...STAGES, { id: 'declined' as Stage, label: 'Declined' }]
			.map((s) => ({ s, cs: columns.find((x) => x.s.id === s.id)?.cs ?? visible.filter((c) => c.stage === s.id) }))
			.map((g) => ({ ...g, sum: g.cs.reduce((a, c) => a + c.fee + c.product_value, 0) }))
			.filter((g) => g.cs.length && (mstage === 'active' ? ACTIVE.includes(g.s.id) : g.s.id === mstage))
	);
	const declinedCount = $derived(studio.collabs.filter((c) => c.stage === 'declined').length);

	async function drop(e: DragEvent, stage: Stage) {
		e.preventDefault();
		over = null;
		const id = e.dataTransfer?.getData('text/plain');
		const c = byId(id);
		if (!c || c.stage === stage) return;
		pointer.x = e.clientX;
		pointer.y = e.clientY;
		popped = c.id;
		await setStage(c, stage);
		setTimeout(() => (popped = null), 700);
	}
</script>

<svelte:head><title>Collabs · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Pipeline</div>
		<h1>Your <em>collabs</em></h1>
		<p>{studio.collabs.filter((c) => c.stage !== 'wrapped' && c.stage !== 'declined').length} active, {studio.collabs.filter((c) => c.stage === 'request').length} waiting for your reply.</p>
	</div>
</header>

<div class="toolbar rv" style="--i:1">
	<label class="search"><Icon name="search" /><span class="sr">Search collabs</span><input type="search" placeholder="Search brand, code or category" bind:value={q} autocomplete="off" /></label>
	<Segmented
		label="Filter"
		bind:value={filter}
		options={[
			{ value: 'all', label: 'All' },
			{ value: 'paid', label: 'Paid' },
			{ value: 'barter', label: 'Barter' }
		]}
	/>
	{#if declinedCount}
		<label class="declined-toggle"><input type="checkbox" class="cbx" bind:checked={showDeclined} />Show declined ({declinedCount})</label>
	{/if}
	{#if studio.collabs.some((c) => c.stage !== 'declined')}
	<span class="tb-gap"></span>
	<a class="btn" href="/studio/import" title="Add the collabs you already have from DMs, all at once"><Icon name="layers" />Import existing</a>
	<button class="btn" class:primary={selecting} title="Drag cards between columns, or select several to act on together" aria-pressed={selecting} onclick={() => (selecting ? stopSelecting() : (selecting = true))}><Icon name={selecting ? 'x' : 'check'} />{selecting ? 'Done' : 'Select'}</button>
	{/if}
</div>

{#if !studio.collabs.some((c) => c.stage !== 'declined')}
	<!-- Nothing yet: what the board is for, and the three ways collabs get here. -->
	<section class="board-empty rv" style="--i:2">
		<span class="be-ic"><Icon name="board" /></span>
		<div>
			<h2>Your board is ready</h2>
			<p>Requests from your brand page land here on their own. Add the collabs you already have from DMs one by one, or import them all at once, and each one moves across as it progresses.</p>
		</div>
		<div class="be-acts">
			<button class="btn grad" onclick={() => (ui.newCollab = true)}><Icon name="plus" />Add a collab</button>
			<a class="btn" href="/studio/import"><Icon name="layers" />Import from DMs</a>
			<button class="btn" onclick={() => copyText((studio.settings?.site_url || location.origin).replace(/\/$/, ''), 'Your page link is copied. Put it in your Instagram bio.')}><Icon name="link" />Copy your page link</button>
		</div>
		<ol class="be-flow" aria-label="How a collab moves">
			{#each ['New request', 'Negotiating', 'Confirmed', 'Creating', 'Live', 'Wrapped'] as st (st)}<li><span>{st}</span></li>{/each}
		</ol>
	</section>
{:else if phone.on}
	<div class="m-stages" role="tablist" aria-label="Stage">
		{#each mtabs as t (t.id)}
			<button role="tab" aria-selected={mstage === t.id} class:on={mstage === t.id} onclick={() => (mstage = t.id)}>{t.label}<span>{t.n}</span></button>
		{/each}
	</div>
	{#each mgroups as g (g.s.id)}
		<section class="m-group st-{g.s.id}">
			<h3><span class="dt"></span>{g.s.label}<small>{g.cs.length}{g.sum ? ` · ${inrS(g.sum)}` : ''}</small></h3>
			<div class="m-list">
				{#each g.cs as c (c.id)}<CollabRow {c} />{/each}
			</div>
		</section>
	{:else}
		<div class="m-empty"><Icon name="board" /><b>{q ? 'No matches' : 'Nothing here'}</b><span>{q ? 'Try another name or code.' : 'Collabs at this stage show up here.'}</span></div>
	{/each}
{:else}
<div class="board-wrap">
	<div class="board">
		{#each columns as col, ci (col.s.id)}
			<section
				class="col st-{col.s.id}"
				class:over={over === col.s.id}
				class:empty={!col.cs.length}
				aria-label={col.s.label}
				ondragover={(e) => {
					e.preventDefault();
					over = col.s.id;
				}}
				ondragleave={(e) => {
					if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) over = null;
				}}
				ondrop={(e) => drop(e, col.s.id)}
			>
				<header class="col-h">
					<span class="dt" class:pulse={col.s.id === 'request' && col.cs.length > 0}></span><b>{col.s.label}</b><span class="cnt tint">{col.cs.length}</span><span class="sum num">{col.sum ? inrS(col.sum) : ''}</span>
					{#if selecting && col.cs.length}<button class="lnk col-all" onclick={() => pickColumn(col.cs.map((c) => c.id))}>{col.cs.every((c) => picked.has(c.id)) ? 'None' : 'All'}</button>{/if}
				</header>
				{#each col.cs as c, i (c.id)}
					<CollabCard {c} i={ci + i} pop={popped === c.id} {selecting} picked={picked.has(c.id)} onpick={() => toggle(c.id)} />
				{:else}
					<div class="col-empty">{q ? 'No matches' : 'Drag a collab here'}</div>
				{/each}
			</section>
		{/each}
	</div>
</div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && selecting && !ui.openCollab && stopSelecting()} />

{#if selecting}
	<div class="batch-bar" role="toolbar" aria-label="Batch actions">
		<b>{picked.size ? `${picked.size} selected` : 'Tap cards to select'}</b>
		{#if picked.size}
			<Select
				size="sm"
				action
				placeholder="Move to…"
				ariaLabel="Move selected to"
				disabled={busy}
				options={[...STAGES, { id: 'declined' as Stage, label: 'Declined' }].map((s) => ({ value: s.id, label: s.label }))}
				onchange={(v) => batchMove(v)}
			/>
			<button class="btn sm" disabled={busy || !payable.length} title={payable.length ? '' : 'None of these has an unpaid fee'} onclick={batchPaid}><Icon name="wallet" />Mark paid{payable.length ? ` (${payable.length})` : ''}</button>
			<button class="btn sm" disabled={busy} onclick={batchTrack}><Icon name="link" />Send tracking links</button>
			<button class="btn sm" disabled={busy} onclick={batchRemind}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send reminders</button>
		{/if}
		<button class="btn sm ghost" onclick={stopSelecting}>Cancel</button>
	</div>
{/if}
