<script lang="ts">
	import { outstanding } from '#lib/util.ts';
	import { studio } from '#lib/studio.svelte.ts';
	import { ui } from '#lib/ui.svelte.ts';
	import { KIND_ICON, KIND_LABEL, delivText, events, evLabel, fmtLong, iso, today, inr, type CalEvent } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	const T = today();
	let month = $state(new Date(T.getFullYear(), T.getMonth(), 1));
	let sel = $state(iso(T));
	let dir = $state(0);
	let gridKey = $state(0);

	const byDay = $derived.by(() => {
		const map: Record<string, CalEvent[]> = {};
		const order = { draft: 0, live: 1, follow: 2, pay: 3, product: 4 };
		for (const e of events(studio.collabs)) (map[e.date] ||= []).push(e);
		Object.values(map).forEach((l) => l.sort((a, b) => order[a.kind] - order[b.kind]));
		return map;
	});
	const cells = $derived.by(() => {
		const y = month.getFullYear(), mo = month.getMonth();
		const startOff = (new Date(y, mo, 1).getDay() + 6) % 7;
		const dim = new Date(y, mo + 1, 0).getDate();
		const n = Math.ceil((startOff + dim) / 7) * 7;
		return Array.from({ length: n }, (_, i) => {
			const dt = new Date(y, mo, 1 - startOff + i);
			const ds = iso(dt);
			return { dt, ds, out: dt.getMonth() !== mo, list: byDay[ds] ?? [] };
		});
	});
	const selList = $derived(byDay[sel] ?? []);

	function shift(d: number) {
		dir = d;
		gridKey++;
		if (d === 0) {
			month = new Date(T.getFullYear(), T.getMonth(), 1);
			sel = iso(T);
		} else month = new Date(month.getFullYear(), month.getMonth() + d, 1);
	}
	const detail = (e: CalEvent) =>
		e.kind === 'follow' ? e.c.follow_note : e.kind === 'pay' ? `${inr(outstanding(e.c))} · ${e.c.invoice_no || 'invoice'}` : delivText(e.c.deliverables);
</script>

<svelte:head><title>Calendar · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Schedule</div>
		<h1>Calendar</h1>
		<p>Every draft, go-live, follow-up and payment date in one place.</p>
	</div>
</header>

<div class="cal-layout">
	<section class="panel cal rv" style="--i:1">
		<div class="cal-top">
			<h2>{month.toLocaleDateString('en-IN', { month: 'long' })} <span>{month.getFullYear()}</span></h2>
			<button class="btn sm" onclick={() => shift(0)}>Today</button>
			<button class="icon-btn" onclick={() => shift(-1)} aria-label="Previous month"><Icon name="chevL" /></button>
			<button class="icon-btn" onclick={() => shift(1)} aria-label="Next month"><Icon name="chevR" /></button>
		</div>
		<div class="cal-head">{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as d (d)}<span>{d}</span>{/each}</div>
		{#key gridKey}
			<div class="cal-grid" class:slide-l={dir > 0} class:slide-r={dir < 0}>
				{#each cells as cell (cell.ds)}
					<div
						class="cell"
						class:out={cell.out}
						class:is-today={cell.ds === iso(T)}
						class:sel={cell.ds === sel}
						role="button"
						tabindex="0"
						aria-label="{fmtLong(cell.ds)}, {cell.list.length} item{cell.list.length === 1 ? '' : 's'}"
						onclick={() => (sel = cell.ds)}
						onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), (sel = cell.ds))}
					>
						<span class="dn">{cell.dt.getDate()}</span>
						<div class="evs">
							{#each cell.list.slice(0, 3) as e (e.c.id + e.kind)}<span class="ev tint k-{e.kind}"><span class="dt"></span><span>{e.c.brand.name}</span></span>{/each}
						</div>
						{#if cell.list.length > 3}<span class="more">+{cell.list.length - 3} more</span>{/if}
						<div class="dots">{#each cell.list.slice(0, 4) as e (e.c.id + e.kind)}<span class="dt k-{e.kind}"></span>{/each}</div>
					</div>
				{/each}
			</div>
		{/key}
		<div class="legend">
			{#each ['draft', 'live', 'follow', 'pay', 'product'] as k (k)}<span><i class="dt k-{k}"></i>{KIND_LABEL[k]}</span>{/each}
		</div>
	</section>
	<section class="panel agenda rv" style="--i:2">
		<div class="panel-h"><h2>{sel === iso(T) ? 'Today' : fmtLong(sel)}</h2><small>{selList.length} item{selList.length === 1 ? '' : 's'}</small></div>
		{#key sel}
			{#each selList as e, i (e.c.id + e.kind)}
				<button class="ag ag-in" style="--i:{i}" onclick={() => (ui.openCollab = e.c.id)}>
					<span class="ticon tint k-{e.kind}"><Icon name={KIND_ICON[e.kind]} /></span>
					<div><b>{evLabel(e)} · {e.c.brand.name}</b><small>{detail(e)}</small></div>
					<Icon name="chevR" />
				</button>
			{:else}
				<div class="empty">Nothing scheduled. Pick another day.</div>
			{/each}
		{/key}
	</section>
</div>
