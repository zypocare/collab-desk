<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import { byCode, byId, priorityOf, setStage, studio } from '#lib/studio.svelte.ts';
	import type { Stage } from '#lib/types.ts';
	import { pointer, ui } from '#lib/ui.svelte.ts';
	import { STAGES, inrS, parse } from '#lib/util.ts';
	import CollabCard from '#lib/components/CollabCard.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Segmented from '#lib/components/Segmented.svelte';

	let filter = $state<'all' | 'paid' | 'barter'>('all');
	let q = $state('');
	let showDeclined = $state(false);
	let over = $state<string | null>(null);
	let popped = $state<string | null>(null);

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
	<div class="acts"><button class="btn primary" onclick={() => (ui.newCollab = true)}><Icon name="plus" />Add collab</button></div>
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
	<span class="hint-r"><Icon name="drag" />Drag cards between columns</span>
</div>

<div class="board-wrap">
	<div class="board">
		{#each columns as col, ci (col.s.id)}
			<section
				class="col st-{col.s.id}"
				class:over={over === col.s.id}
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
				</header>
				{#each col.cs as c, i (c.id)}
					<CollabCard {c} i={ci + i} pop={popped === c.id} />
				{:else}
					<div class="col-empty">{q ? 'No matches' : 'Drag a collab here'}</div>
				{/each}
			</section>
		{/each}
	</div>
</div>
