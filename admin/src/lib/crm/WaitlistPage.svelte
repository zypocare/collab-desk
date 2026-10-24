<script lang="ts">
	import { untrack } from 'svelte';
	import { ago, day, num } from '../format.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';
	import Icon from '../Icon.svelte';

	// The website's pre-launch waitlist: who joined and when, who brought whom, and launch-day batches marked
	// invited. "Joined" fills in by itself when that email signs up for real.
	type R = Record<string, any>;
	let d = $state<R | null>(null);
	let err = $state('');
	let busy = $state(false);
	let role = $state<'' | 'creator' | 'brand' | 'agency'>('');
	let status = $state<'all' | 'waiting' | 'invited' | 'joined'>('all');
	let q = $state('');
	let picked = $state<Record<number, boolean>>({});
	let sort = $state<'position' | 'created_at' | 'referrals'>('position');

	let asked = 0;
	async function load() {
		const n = ++asked;
		busy = true;
		const { data, error } = await supabase.rpc('admin_waitlist', { p_role: role || null, p_q: q.trim() || null });
		if (n !== asked) return;
		busy = false;
		err = error ? errMessage(error) : '';
		if (!error) d = data as R;
	}
	$effect(() => {
		void role;
		untrack(load);
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	function onSearch() {
		clearTimeout(timer);
		timer = setTimeout(load, 280);
	}

	const rows = $derived.by(() => {
		const all = (d?.rows ?? []) as R[];
		const f = all.filter((r) => status === 'all' || (status === 'joined' ? r.joined_at : status === 'invited' ? r.invited_at && !r.joined_at : !r.invited_at && !r.joined_at));
		const by = sort;
		return [...f].sort((a, b) => (by === 'position' ? (a.position ?? 1e9) - (b.position ?? 1e9) : by === 'referrals' ? b.referrals - a.referrals : b.created_at.localeCompare(a.created_at)));
	});
	const pickedIds = $derived(rows.filter((r) => picked[r.id]).map((r) => r.id as number));
	const allPicked = $derived(rows.length > 0 && rows.every((r) => picked[r.id]));
	function pickAll() {
		const on = !allPicked;
		picked = Object.fromEntries(rows.map((r) => [r.id, on]));
	}
	async function mark(invited: boolean) {
		const n = pickedIds.length;
		const note = await askText({
			title: invited ? `Mark ${n} ${n === 1 ? 'person' : 'people'} invited?` : `Unmark ${n} ${n === 1 ? 'person' : 'people'}?`,
			body: invited ? 'Use this after you have sent them their invite, so the next batch skips them.' : 'They go back to waiting.',
			ok: invited ? 'Mark invited' : 'Unmark',
			input: { label: 'Note (optional, saved on each)', placeholder: 'e.g. Launch batch 1' }
		});
		if (note === null) return;
		const { error } = await supabase.rpc('admin_waitlist_mark', { p_ids: pickedIds, p_invited: invited, p_note: note || null });
		if (error) return toast(errMessage(error), true);
		picked = {};
		toast(invited ? `${n} marked invited` : `${n} back to waiting`);
		load();
	}
	function csv() {
		const list = pickedIds.length ? rows.filter((r) => picked[r.id]) : rows;
		if (!list.length) return toast('Nobody to export.', true);
		const cols: [string, (r: R) => unknown][] = [
			['Position', (r) => r.position], ['Email', (r) => r.email], ['Role', (r) => r.role], ['Name', (r) => r.name], ['Instagram', (r) => r.instagram],
			['City', (r) => r.city], ['Company', (r) => r.company], ['Website', (r) => r.website], ['Niche', (r) => r.niche], ['Followers', (r) => r.followers],
			['Held link', (r) => r.link ?? ''], ['Referral code', (r) => r.ref_code], ['Referred by', (r) => r.referred_by ?? ''], ['Referrals', (r) => r.referrals],
			['Source', (r) => r.source], ['Joined waitlist', (r) => r.created_at], ['Invited', (r) => r.invited_at ?? ''], ['Signed up', (r) => r.joined_at ?? ''], ['Note', (r) => r.note]
		];
		const cell = (v: unknown) => {
			const s = v === null || v === undefined ? '' : String(v);
			return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
		};
		const text = [cols.map(([h]) => cell(h)).join(','), ...list.map((r) => cols.map(([, f]) => cell(f(r))).join(','))].join('\n');
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
		a.download = `miracle-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 2000);
	}

	// Sixty days, empty days included.
	const days = $derived.by(() => {
		const have = new Map(((d?.by_day ?? []) as R[]).map((x) => [String(x.day), Number(x.n)]));
		const out: { day: string; n: number }[] = [];
		const now = new Date();
		for (let i = 59; i >= 0; i--) {
			const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
			out.push({ day: k, n: have.get(k) ?? 0 });
		}
		return out;
	});
	const maxDay = $derived(Math.max(1, ...days.map((x) => x.n)));
	const c = $derived(d?.counts ?? {});
	const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—');
	const ROLE: Record<string, [string, string]> = { creator: ['Creator', 't-ok'], brand: ['Brand', 't-info'], agency: ['Agency', 't-acc'] };
</script>

<div class="wl">
	<header class="wh">
		<div>
			<div class="eb">Growth</div>
			<h1>Waitlist</h1>
			<p class="muted lead">People who joined the pre-launch waitlist on the website. “Signed up” fills in by itself when that email creates an account.</p>
		</div>
		<div class="acts">
			<button class="btn" onclick={csv}><Icon name="download" />{pickedIds.length ? `Export ${pickedIds.length} picked` : 'Export CSV'}</button>
		</div>
	</header>
	{#if err}<p class="err">{err}</p>{/if}

	{#if d}
		<section class="kpis">
			<div class="card k"><small>On the waitlist</small><b class="mono">{num(c.total)}</b><span>+{num(c.today)} today · +{num(c.week)} this week</span></div>
			<div class="card k"><small>Creators · brands · agencies</small><b class="mono">{num(c.creator)} · {num(c.brand)} · {num(c.agency)}</b><span>by role</span></div>
			<div class="card k"><small>Came through a referral</small><b class="mono">{num(c.referred)}</b><span>{pct(Number(c.referred), Number(c.total))} of everyone</span></div>
			<div class="card k"><small>Invited</small><b class="mono">{num(c.invited)}</b><span>{num(Number(c.total) - Number(c.invited))} still waiting</span></div>
			<div class="card k"><small>Signed up</small><b class="mono">{num(c.joined)}</b><span>{pct(Number(c.joined), Number(c.invited))} of invited · {pct(Number(c.joined), Number(c.total))} of all</span></div>
		</section>

		<div class="two">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Joins by day</h2><span class="muted sm">last 60 days</span></div>
				<div class="chart" role="img" aria-label="Waitlist joins per day for the last 60 days">
					{#each days as x (x.day)}<span class="b" style:height="{Math.max(x.n ? 4 : 1, (x.n / maxDay) * 100)}%" title="{day(x.day)}: {x.n}"></span>{/each}
				</div>
				<div class="axis muted"><span>{day(days[0].day)}</span><span>today</span></div>
			</section>
			<section class="card">
				<div class="card-h"><h2 class="card-t">Top referrers</h2></div>
				{#if !d.top_referrers.length}<div class="card-empty">Nobody has brought anyone yet.</div>{:else}
					<ol class="refs">
						{#each d.top_referrers as r, i (r.email)}<li><span class="mono muted">{i + 1}</span><span class="nm"><b>{r.name || r.email}</b><small class="muted">{r.email}</small></span><span class="tag {ROLE[r.role]?.[1] ?? 't-mute'}">{ROLE[r.role]?.[0] ?? r.role}</span><span class="mono">{num(r.referrals)}</span></li>{/each}
					</ol>
				{/if}
			</section>
		</div>
	{/if}

	<nav class="tabs" aria-label="Role">
		{#each [['', 'Everyone', c.total], ['creator', 'Creators', c.creator], ['brand', 'Brands', c.brand], ['agency', 'Agencies', c.agency]] as [k, l, n] (k)}
			<button class:on={role === k} onclick={() => ((role = k as typeof role), (picked = {}))}>{l} <span class="mono muted">{num(n)}</span></button>
		{/each}
	</nav>
	<div class="bar">
		<label class="search"><Icon name="search" /><span class="sr">Search the waitlist</span><input type="search" placeholder="Email, name, Instagram, company, city" bind:value={q} oninput={onSearch} />{#if busy}<span class="spinner"></span>{/if}</label>
		<div class="seg" role="group" aria-label="Status">
			{#each [['all', 'All'], ['waiting', 'Waiting'], ['invited', 'Invited'], ['joined', 'Signed up']] as [k, l] (k)}<button class:on={status === k} onclick={() => ((status = k as typeof status), (picked = {}))}>{l}</button>{/each}
		</div>
		<label class="srt">Sort <select class="inp" bind:value={sort}><option value="position">Place in line</option><option value="created_at">Newest first</option><option value="referrals">Most referrals</option></select></label>
	</div>

	{#if pickedIds.length}
		<div class="bulk" role="region" aria-label="Actions on picked people">
			<b>{pickedIds.length} picked</b>
			<button class="btn sm dk" onclick={() => mark(true)}>Mark invited</button>
			<button class="btn sm dk" onclick={() => mark(false)}>Unmark</button>
			<button class="btn sm dk" onclick={csv}>Export</button>
			<button class="btn sm dk end" onclick={() => (picked = {})}>Clear</button>
		</div>
	{/if}

	<div class="card tbl-wrap">
		{#if !d}
			<div class="ld"><span class="spinner"></span></div>
		{:else if !rows.length}
			<div class="card-empty">{d.rows.length ? 'Nobody matches.' : 'Nobody on the waitlist yet.'}</div>
		{:else}
			<table class="tbl">
				<thead><tr>
					<th class="ck"><input type="checkbox" aria-label="Pick everyone shown" checked={allPicked} onchange={pickAll} /></th>
					<th class="r">#</th><th>Person</th><th>Role</th><th>Instagram · company</th><th>City · niche</th><th>Followers</th><th>Held link</th><th class="r">Referrals</th><th>Joined</th><th>Status</th>
				</tr></thead>
				<tbody>
					{#each rows as r (r.id)}
						<tr class:sel={picked[r.id]}>
							<td class="ck"><input type="checkbox" aria-label="Pick {r.email}" bind:checked={picked[r.id]} /></td>
							<td class="r mono">{r.position ?? '—'}</td>
							<td><b class="w5">{r.name || '—'}</b><small class="d">{r.email}</small></td>
							<td><span class="tag {ROLE[r.role]?.[1] ?? 't-mute'}">{ROLE[r.role]?.[0] ?? r.role}</span></td>
							<td>{#if r.instagram}<a href="https://instagram.com/{r.instagram.replace(/^@/, '')}" target="_blank" rel="noopener">@{r.instagram.replace(/^@/, '')}</a>{/if}{#if r.company}<small class="d">{r.company}</small>{/if}{#if !r.instagram && !r.company}—{/if}</td>
							<td>{[r.city, r.niche].filter(Boolean).join(' · ') || '—'}</td>
							<td>{r.followers || '—'}</td>
							<td class="mono">{r.link ?? '—'}</td>
							<td class="r mono">{num(r.referrals)}</td>
							<td>{ago(r.created_at)}{#if r.referred_by}<small class="d">via {r.referred_by}</small>{/if}{#if r.source}<small class="d">{r.source}</small>{/if}</td>
							<td>
								{#if r.joined_at}<span class="tag t-ok">Signed up</span><small class="d">{day(r.joined_at)}</small>
								{:else if r.invited_at}<span class="tag t-info">Invited</span><small class="d">{day(r.invited_at)}</small>
								{:else}<span class="tag t-mute">Waiting</span>{/if}
								{#if r.note}<small class="d">{r.note}</small>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
	{#if d && rows.length}<p class="muted sm">{num(rows.length)} shown</p>{/if}
</div>

<style>
	.wl { display: flex; flex-direction: column; gap: 14px; }
	.wh { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.lead { margin-top: 4px; font-size: 13.5px; }
	.acts { display: flex; gap: 8px; }
	.ld { padding: 40px; display: grid; place-items: center; }
	.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
	.k { padding: 14px 16px; display: grid; gap: 4px; }
	.k small { font-size: 12.5px; color: var(--ink-3); }
	.k b { font-size: 22px; font-weight: 500; }
	.k span { font-size: 12px; color: var(--ink-3); }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 16px; align-items: start; }
	.sm { font-size: 12px; }
	.chart { display: flex; align-items: flex-end; gap: 2px; height: 150px; padding: 16px 16px 6px; }
	.chart .b { flex: 1; background: var(--accent); border-radius: 2px 2px 0 0; min-width: 2px; opacity: .85; }
	.axis { display: flex; justify-content: space-between; padding: 0 16px 12px; font-size: 11.5px; }
	.refs { list-style: none; margin: 0; padding: 4px 16px 10px; }
	.refs li { display: grid; grid-template-columns: 22px 1fr auto 44px; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line-soft); font-size: 13px; }
	.refs li:last-child { border-bottom: 0; }
	.nm { display: grid; min-width: 0; }
	.nm b { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.nm small { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.refs .mono:last-child { text-align: right; }
	.tabs { display: flex; gap: 18px; border-bottom: 1px solid var(--line); overflow-x: auto; }
	.tabs button { height: 36px; padding: 0 2px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ink-2); font-weight: 500; font-size: 13.5px; white-space: nowrap; }
	.tabs button.on { color: var(--ink); border-bottom-color: var(--accent); }
	.tabs .mono { font-size: 11.5px; }
	.bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
	.search { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; border: 1px solid var(--line-strong); border-radius: 7px; background: var(--surface); flex: 1 1 240px; max-width: 360px; color: var(--ink-3); }
	.search input { flex: 1; min-width: 0; border: 0; outline: none; background: none; color: var(--ink); font-size: 13px; }
	.seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 7px; overflow: hidden; background: var(--surface); }
	.seg button { height: 32px; padding: 0 12px; border: 0; background: none; font-size: 13px; font-weight: 500; color: var(--ink-2); }
	.seg button.on { background: var(--ink); color: #fff; }
	.srt { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); }
	.srt .inp { height: 32px; width: auto; }
	.bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; background: var(--side); color: #fff; font-size: 13px; }
	.btn.dk { background: var(--side-2); border-color: #3a333f; color: #fff; }
	.btn.dk:hover { background: #3a333f; color: #fff; }
	.end { margin-left: auto; }
	.ck { width: 36px; }
	.w5 { font-weight: 500; }
	.d { display: block; font-size: 12px; color: var(--ink-3); }
	.tbl tbody tr:hover td { background: var(--surface-2); }
	.tbl tr.sel td { background: #f4f0fd; }
</style>
