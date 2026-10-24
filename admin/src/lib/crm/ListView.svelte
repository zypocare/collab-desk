<script lang="ts" module>
	// Each list keeps its search, filters, sort and page while you open a record and come back.
	type Memo = { preset: string; q: string; filters: Record<string, unknown>; sort: string; desc: boolean; page: number };
	const memo = new Map<string, Memo>();
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { ago, compact, day, inrShort, num, when } from '../format.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';
	import Icon from '../Icon.svelte';
	import type { Col, ListConfig, Row } from './lists.ts';

	let { config, onchange }: { config: ListConfig; onchange?: () => void } = $props();

	const PAGE = 50;
	type View = { id: string; name: string; filters: Record<string, unknown>; q: string; sort: string; desc: boolean };

	// svelte-ignore state_referenced_locally
	const start: Memo = memo.get(config.id) ?? { preset: config.presets[0]?.id ?? 'all', q: '', filters: {}, sort: config.sort, desc: config.desc ?? true, page: 0 };
	let preset = $state(start.preset);
	let q = $state(start.q);
	let filters = $state<Record<string, unknown>>({ ...start.filters });
	let sort = $state(start.sort);
	let desc = $state(start.desc);
	let page = $state(start.page);

	let rows = $state<Row[] | null>(null);
	let total = $state(0);
	let counts = $state<Record<string, number>>({});
	let views = $state<View[]>([]);
	let err = $state('');
	let busy = $state(false);
	let picked = $state<Record<string, boolean>>({});
	let acting = $state(false);

	const presetFilters = $derived.by(() => {
		if (preset.startsWith('view:')) return {};
		return config.presets.find((p) => p.id === preset)?.filters ?? {};
	});
	// "days:30" in a filter means "30 days ago" (a date the database can compare).
	function resolve(f: Record<string, unknown>) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(f)) {
			if (v === '' || v === undefined) continue;
			out[k] = typeof v === 'string' && v.startsWith('days:') ? new Date(Date.now() - Number(v.slice(5)) * 864e5).toISOString() : v;
		}
		return out;
	}
	const allFilters = $derived(resolve({ ...(config.base ?? {}), ...presetFilters, ...filters }));

	let asked = 0;
	async function load() {
		const n = ++asked;
		busy = true;
		const countMap = Object.fromEntries(config.presets.map((p) => [p.id, resolve({ ...(config.base ?? {}), ...p.filters })]));
		const { data, error } = await supabase.rpc('admin_list', {
			p_kind: config.kind, p_q: q, p_filters: allFilters, p_sort: sort, p_desc: desc, p_limit: PAGE, p_offset: page * PAGE, p_counts: countMap
		});
		if (n !== asked) return;
		busy = false;
		err = error ? errMessage(error) : '';
		if (error) return;
		const d = data as { total: number; rows: Row[]; counts: Record<string, number> };
		rows = d.rows;
		total = d.total;
		counts = d.counts;
		memo.set(config.id, { preset, q, filters: { ...filters }, sort, desc, page });
	}
	async function loadViews() {
		const { data } = await supabase.rpc('admin_views', { p_list: config.id });
		views = (data as View[]) ?? [];
	}
	$effect(() => {
		void allFilters;
		void sort;
		void desc;
		void page;
		untrack(load);
	});
	$effect(() => {
		untrack(loadViews);
	});

	let timer: ReturnType<typeof setTimeout> | undefined;
	function onSearch() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			page = 0;
			load();
		}, 280);
	}
	function pickPreset(id: string) {
		preset = id;
		filters = {};
		page = 0;
		picked = {};
	}
	function pickView(v: View) {
		preset = 'view:' + v.id;
		filters = { ...v.filters };
		q = v.q;
		sort = v.sort || config.sort;
		desc = v.desc;
		page = 0;
		picked = {};
	}
	function setFilter(key: string, raw: string) {
		const def = config.filters.find((f) => f.key === key);
		const opt = def?.options.find((o) => JSON.stringify(o.value) === raw);
		const next = { ...filters };
		if (!opt) delete next[key];
		else next[key] = opt.value;
		filters = next;
		page = 0;
	}
	function clearAll() {
		filters = {};
		q = '';
		page = 0;
		load();
	}
	function sortBy(c: Col) {
		if (c.nosort) return;
		if (sort === c.key) desc = !desc;
		else {
			sort = c.key;
			desc = !(c.type === 'text' || c.type === undefined || c.type === 'mono');
		}
		page = 0;
	}

	async function saveView() {
		const name = await askText({
			title: 'Save this view',
			body: 'Keeps the tab, search, filters and sort. Only you see your saved views.',
			ok: 'Save',
			input: { label: 'Name', placeholder: 'e.g. Pune beauty creators', required: true, value: preset.startsWith('view:') ? (views.find((v) => 'view:' + v.id === preset)?.name ?? '') : '' }
		});
		if (!name) return;
		const { data, error } = await supabase.rpc('admin_view_save', {
			p_list: config.id, p_name: name, p_filters: { ...presetFilters, ...filters }, p_q: q, p_sort: sort, p_desc: desc
		});
		if (error) return toast(errMessage(error), true);
		views = data as View[];
		const v = views.find((x) => x.name === name);
		if (v) preset = 'view:' + v.id;
		toast('View saved');
	}
	async function deleteView(v: View) {
		const { data, error } = await supabase.rpc('admin_view_delete', { p_id: v.id });
		if (error) return toast(errMessage(error), true);
		views = data as View[];
		pickPreset(config.presets[0].id);
	}

	const pickedRows = $derived((rows ?? []).filter((r) => picked[r._key]));
	const allPicked = $derived(!!rows?.length && rows.every((r) => picked[r._key]));
	function pickAll() {
		const on = !allPicked;
		picked = Object.fromEntries((rows ?? []).map((r) => [r._key, on]));
	}
	async function run(a: { run: (rows: Row[]) => Promise<boolean | void> }, list: Row[]) {
		acting = true;
		const ok = await a.run(list);
		acting = false;
		if (ok !== false) {
			picked = {};
			await load();
			onchange?.();
		}
	}

	// The whole filtered list (up to 5,000 rows) as a CSV file.
	async function exportCsv() {
		const { data, error } = await supabase.rpc('admin_list', { p_kind: config.kind, p_q: q, p_filters: allFilters, p_sort: sort, p_desc: desc, p_limit: 5000, p_offset: 0 });
		if (error) return toast(errMessage(error), true);
		const list = (data as { rows: Row[] }).rows;
		const cols = config.columns;
		const cell = (v: unknown) => {
			const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
			return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
		};
		const csv = [cols.map((c) => cell(c.label)).join(','), ...list.map((r) => cols.map((c) => cell(c.text && c.type !== 'tag' ? c.text(r) : r[c.key])).join(','))].join('\n');
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
		a.download = `miracle-${config.id}-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 2000);
	}

	function shown(c: Col, r: Row): string {
		const v = r[c.key];
		if (c.text) return c.text(r);
		if (v === undefined || v === null || v === '') return '—';
		switch (c.type) {
			case 'num': return num(v);
			case 'money': return inrShort(v);
			case 'compact': return compact(v);
			case 'ago': return ago(v);
			case 'day': return day(v);
			case 'when': return when(v);
			default: return String(v);
		}
	}
	const right = (c: Col) => c.type === 'num' || c.type === 'money' || c.type === 'compact';
	const activeFilters = $derived(Object.keys(filters).length + (q ? 1 : 0));
	const shownBulk = $derived((config.bulk ?? []).filter((a) => pickedRows.length && pickedRows.every((r) => !a.show || a.show(r))));
</script>

<div class="lv">
	<header class="lv-h">
		<div>
			<div class="eb">{config.group}</div>
			<h1>{config.title} <span class="mono muted">{num(total)}</span></h1>
		</div>
		<div class="lv-acts">
			{#if config.create}<button class="btn" disabled={acting} onclick={() => run({ run: () => config.create!.run() }, [])}><Icon name="plus" />{config.create.label}</button>{/if}
			<button class="btn" onclick={exportCsv}><Icon name="download" />Export CSV</button>
			<button class="btn pri" onclick={saveView}><Icon name="plus" />Save view</button>
		</div>
	</header>

	<nav class="lv-tabs" aria-label="Views">
		{#each config.presets as p (p.id)}
			<button class="vw" class:on={preset === p.id} onclick={() => pickPreset(p.id)}>{p.label} {#if counts[p.id] !== undefined}<span class="mono muted">{num(counts[p.id])}</span>{/if}</button>
		{/each}
		{#each views as v (v.id)}
			<span class="vw-wrap">
				<button class="vw saved" class:on={preset === 'view:' + v.id} onclick={() => pickView(v)}>{v.name}</button>
				{#if preset === 'view:' + v.id}<button class="vw-x" aria-label="Delete view {v.name}" title="Delete this view" onclick={() => deleteView(v)}><Icon name="x" /></button>{/if}
			</span>
		{/each}
	</nav>

	<div class="lv-bar">
		<label class="lv-search">
			<Icon name="search" />
			<span class="sr">Search {config.title}</span>
			<input type="search" placeholder={config.search} bind:value={q} oninput={onSearch} />
			{#if busy}<span class="spinner"></span>{/if}
		</label>
		{#each config.filters as f (f.key)}
			<label class="chip" class:set={filters[f.key] !== undefined}>
				<span class="sr">{f.label}</span>
				<select value={filters[f.key] === undefined ? '' : JSON.stringify(filters[f.key])} onchange={(e) => setFilter(f.key, e.currentTarget.value)}>
					<option value="">{f.label}: any</option>
					{#each f.options as o (JSON.stringify(o.value))}<option value={JSON.stringify(o.value)}>{f.label}: {o.label}</option>{/each}
				</select>
			</label>
		{/each}
		{#if activeFilters}<button class="lnk" onclick={clearAll}>Clear</button>{/if}
	</div>

	{#if pickedRows.length}
		<div class="lv-bulk" role="region" aria-label="Actions on selected rows">
			<b>{pickedRows.length} selected</b>
			{#each shownBulk as a (a.label)}<button class="btn sm dk" disabled={acting} onclick={() => run(a, pickedRows)}>{a.label}</button>{/each}
			{#if !shownBulk.length && config.bulk?.length}<span class="muted-l">No action fits every selected row</span>{/if}
			<button class="btn sm dk end" onclick={() => (picked = {})}>Clear</button>
		</div>
	{/if}

	{#if err}<p class="err">{err}</p>{/if}

	<div class="card tbl-wrap">
		{#if rows === null}
			<div class="lv-load"><span class="spinner"></span></div>
		{:else if !rows.length}
			<div class="card-empty">No {config.noun}s match. {#if activeFilters}<button class="lnk" onclick={clearAll}>Clear the search and filters</button>{/if}</div>
		{:else}
			<table class="tbl">
				<thead>
					<tr>
						{#if config.bulk?.length}<th class="ck"><input type="checkbox" aria-label="Select all on this page" checked={allPicked} onchange={pickAll} /></th>{/if}
						{#each config.columns as c (c.key)}
							<th class:r={right(c)} aria-sort={sort === c.key ? (desc ? 'descending' : 'ascending') : 'none'}>
								{#if c.nosort}{c.label}{:else}<button class="th-b" onclick={() => sortBy(c)}>{c.label}<span aria-hidden="true">{sort === c.key ? (desc ? ' ↓' : ' ↑') : ''}</span></button>{/if}
							</th>
						{/each}
						{#if config.rowActions?.length}<th><span class="sr">Actions</span></th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r._key)}
						{@const link = config.href?.(r)}
						<tr class:sel={picked[r._key]}>
							{#if config.bulk?.length}<td class="ck"><input type="checkbox" aria-label="Select {r.name || r.email || r._key}" bind:checked={picked[r._key]} /></td>{/if}
							{#each config.columns as c, i (c.key)}
								{@const to = c.link ? c.link(r) : i === 0 ? link : null}
								<td class:r={right(c)} class:wrap={c.wrap} class:mono={c.type === 'mono' || right(c)}>
									{#if c.type === 'tag' && c.tag && r[c.key] !== undefined}
										{@const t = c.tag(r[c.key], r)}<span class="tag {t[1]}">{t[0]}</span>
									{:else if to}
										<a href={to} class:strong={i === 0} target={to.startsWith('http') ? '_blank' : undefined} rel={to.startsWith('http') ? 'noopener' : undefined}>{shown(c, r)}</a>
									{:else}
										<span class:strong={i === 0}>{shown(c, r)}</span>
									{/if}
									{#if c.sub && r[c.sub]}<small>{r[c.sub]}</small>{/if}
								</td>
							{/each}
							{#if config.rowActions?.length}
								<td class="ra">
									{#each config.rowActions.filter((a) => !a.show || a.show(r)) as a (a.label)}<button class="btn sm" class:warn={a.danger} disabled={acting} onclick={() => run(a, [r])}>{a.label}</button>{/each}
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	{#if total > PAGE}
		<div class="lv-pg">
			<span class="muted">{num(page * PAGE + 1)}–{num(Math.min(total, (page + 1) * PAGE))} of {num(total)}</span>
			<span class="pg-b"><button class="btn sm" disabled={page === 0} onclick={() => page--}>Previous</button><button class="btn sm" disabled={(page + 1) * PAGE >= total} onclick={() => page++}>Next</button></span>
		</div>
	{/if}
</div>

<style>
	.lv { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
	.lv-h { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	h1 .mono { font-size: 15px; font-weight: 400; }
	.lv-acts { display: flex; gap: 8px; flex-wrap: wrap; }
	.lv-tabs { display: flex; gap: 18px; border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: thin; }
	.vw { height: 36px; padding: 0 2px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ink-2); font-weight: 500; font-size: 13.5px; white-space: nowrap; display: inline-flex; gap: 6px; align-items: center; }
	.vw .mono { font-size: 11.5px; }
	.vw.on { color: var(--ink); border-bottom-color: var(--accent); }
	.vw.saved::before { content: '★'; color: var(--accent); font-size: 11px; }
	.vw-wrap { display: inline-flex; align-items: center; gap: 2px; }
	.vw-x { width: 22px; height: 22px; border: 0; background: none; color: var(--ink-3); display: grid; place-items: center; border-radius: 5px; }
	.vw-x:hover { background: var(--mute-bg); color: var(--bad); }
	.vw-x :global(.ic) { width: 13px; height: 13px; }
	.lv-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
	.lv-search { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); flex: 1 1 240px; max-width: 360px; color: var(--ink-3); }
	.lv-search input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--ink); font-size: 13px; }
	.lv-search:focus-within { border-color: var(--accent); }
	.chip { position: relative; display: inline-flex; align-items: center; height: 32px; border-radius: 16px; border: 1px dashed #c9c3ba; background: var(--surface); }
	.chip.set { border-style: solid; border-color: #cfc2f5; background: #f4f0fd; }
	.chip select { appearance: none; -webkit-appearance: none; border: 0; background: none; height: 100%; padding: 0 12px; font-size: 12.5px; font-weight: 500; color: var(--ink-2); cursor: pointer; border-radius: 16px; }
	.chip.set select { color: var(--accent-2); }
	.lv-bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; background: var(--side); color: #fff; font-size: 13px; }
	.btn.dk { background: var(--side-2); border-color: #3a333f; color: #fff; }
	.btn.dk:hover:not(:disabled) { background: #3a333f; color: #fff; }
	.end { margin-left: auto; }
	.muted-l { color: var(--side-ink); font-size: 12.5px; }
	.lv-load { padding: 30px; display: grid; place-items: center; color: var(--ink-3); }
	.th-b { all: unset; cursor: pointer; display: inline-flex; gap: 2px; }
	.th-b:focus-visible { outline: 2px solid var(--accent); }
	.tbl th.r .th-b { justify-content: flex-end; }
	.tbl td small { display: block; font-size: 12px; color: var(--ink-3); font-family: var(--f-body); }
	.tbl td.wrap { white-space: normal; min-width: 180px; max-width: 360px; }
	.tbl tbody tr:hover td { background: var(--surface-2); }
	.tbl tr.sel td { background: #f4f0fd; }
	.strong { font-weight: 500; color: var(--ink); }
	a.strong:hover { color: var(--accent); }
	.ck { width: 36px; }
	.ra { display: flex; gap: 6px; justify-content: flex-end; }
	.lv-pg { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; }
	.pg-b { display: flex; gap: 8px; }
</style>
