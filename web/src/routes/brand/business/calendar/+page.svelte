<script lang="ts">
	// The calendar, built exactly like the creator's: square toggles pick which dates show, the month marks
	// each day's dates in their colour, the picked day lists what's on it, and the coming week sits below.
	// Here it covers every creator the brand works with.
	import { call, type CalEvent } from '#lib/business.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { diff, errMessage, firstName, fmt, iso, today } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	type Kind = CalEvent['kind'];
	const KIND: Record<Kind, { label: string; plural: string; color: string; line: string }> = {
		shoot: { label: 'Shoot', plural: 'Shoots', color: '#FFAE6B', line: 'The creator films your content' },
		draft: { label: 'Draft due', plural: 'Drafts', color: '#9C7BFF', line: 'A first cut for you to approve' },
		live: { label: 'Goes live', plural: 'Go-lives', color: '#4CCFC2', line: 'The post goes up on Instagram' }
	};
	const ORDER: Kind[] = ['shoot', 'draft', 'live'];

	const T = today();
	const todayIso = iso(T);
	let month = $state(new Date(T.getFullYear(), T.getMonth(), 1));
	let sel = $state(todayIso);
	let show = $state<'all' | Kind>('all');
	let flip = $state(0);

	// The month on screen plus the week after today (the coming week can run into next month).
	let all = $state<CalEvent[]>([]);
	$effect(() => {
		const from = new Date(month.getFullYear(), month.getMonth(), -6);
		const end = new Date(month.getFullYear(), month.getMonth() + 1, 7);
		const to = new Date(Math.max(end.getTime(), T.getTime() + 7 * 864e5));
		call<CalEvent[]>('brand_calendar', { p_from: iso(from), p_to: iso(to) })
			.then((e) => (all = (e ?? []).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))))
			.catch((e) => toast(errMessage(e), 'alert'));
	});
	const shown = $derived(show === 'all' ? all : all.filter((e) => e.kind === show));
	const byDay = $derived.by(() => {
		const map: Record<string, CalEvent[]> = {};
		for (const e of shown) (map[e.date] ||= []).push(e);
		return map;
	});

	const ym = $derived(iso(month).slice(0, 7));
	const inMonth = $derived(all.filter((e) => e.date.startsWith(ym)));
	const kinds = $derived.by(() => {
		const n = (k: Kind) => inMonth.filter((e) => e.kind === k).length;
		const list = ORDER.map((k) => ({ id: k as 'all' | Kind, label: KIND[k].plural, n: n(k), color: KIND[k].color }));
		if (phone.on) list.sort((a, b) => b.n - a.n);
		return [{ id: 'all' as const, label: 'All', n: inMonth.length, color: '' }, ...list];
	});

	const cells = $derived.by(() => {
		const y = month.getFullYear(), mo = month.getMonth();
		const startOff = (new Date(y, mo, 1).getDay() + 6) % 7;
		const dim = new Date(y, mo + 1, 0).getDate();
		const n = Math.ceil((startOff + dim) / 7) * 7;
		return Array.from({ length: n }, (_, i) => {
			const dt = new Date(y, mo, 1 - startOff + i);
			const ds = iso(dt);
			return { ds, d: dt.getDate(), out: dt.getMonth() !== mo, weekend: i % 7 >= 5, list: byDay[ds] ?? [] };
		});
	});
	// Two posts the same day compete for the same audience.
	const clash = $derived(cells.filter((c) => !c.out && (byDay[c.ds] ?? []).filter((e) => e.kind === 'live').length > 1));

	function go(d: number) {
		flip++;
		if (d === 0) {
			month = new Date(T.getFullYear(), T.getMonth(), 1);
			sel = todayIso;
		} else month = new Date(month.getFullYear(), month.getMonth() + d, 1);
	}
	function pick(ds: string) {
		sel = ds;
		const d = new Date(ds + 'T00:00:00');
		if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) {
			flip++;
			month = new Date(d.getFullYear(), d.getMonth(), 1);
		}
	}

	const selDate = $derived(new Date(sel + 'T00:00:00'));
	const selList = $derived(byDay[sel] ?? []);
	const dayEb = $derived.by(() => {
		const wd = selDate.toLocaleDateString('en-IN', { weekday: 'long' });
		const d = diff(sel);
		return d === 0 ? `Today · ${wd}` : d === 1 ? `Tomorrow · ${wd}` : d === -1 ? `Yesterday · ${wd}` : wd;
	});
	const WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
	const count = (n: number) => WORD[n] ?? String(n);
	const daySay = $derived.by(() => {
		const l = selList;
		if (!l.length) return { t: 'Nothing planned.', color: 'var(--ink-3)' };
		const k = l[0].kind;
		if (l.every((e) => e.kind === k)) {
			const n = l.length;
			const t = { shoot: n === 1 ? 'A shoot day.' : `${count(n)} shoots.`, draft: n === 1 ? 'A draft is due.' : `${count(n)} drafts due.`, live: n === 1 ? 'One goes live.' : `${count(n)} go live.` }[k];
			return { t, color: KIND[k].color };
		}
		return { t: `${count(l.length)} things.`, color: 'var(--g3)' };
	});
	const at = (e: CalEvent) => (e.slug === pageSlug ? `/brand/r/${e.code}` : addressFor(e.slug, `/brand/r/${e.code}`));

	const week = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const dt = new Date(T.getFullYear(), T.getMonth(), T.getDate() + i);
			const ds = iso(dt);
			return { ds, l: dt.toLocaleDateString('en-IN', { weekday: 'short' }), n: dt.getDate(), now: i === 0, kinds: (byDay[ds] ?? []).map((e) => e.kind).slice(0, 4) };
		})
	);
	const weekCount = $derived(week.reduce((a, d) => a + (byDay[d.ds]?.length ?? 0), 0));
	const next = $derived(
		shown
			.filter((e) => diff(e.date) > 0 && diff(e.date) < 7)
			.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)))
			.slice(0, 4)
	);
	const monthName = $derived(month.toLocaleDateString('en-IN', { month: 'long' }));
	const wdShort = (ds: string) => new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
	const dayNum = (ds: string) => new Date(ds + 'T00:00:00').getDate();
</script>

<svelte:head><title>Calendar · Miracle</title></svelte:head>

{#snippet toggles()}
	<div class="cl-kinds" role="group" aria-label="Show">
		{#each kinds as k (k.id)}
			<button class="cl-neo cl-kind" class:on={show === k.id} aria-pressed={show === k.id} onclick={() => (show = k.id)}>
				<i style="background: {k.id === 'all' ? 'linear-gradient(135deg, var(--g1), var(--g2), var(--g3))' : k.color}"></i>{k.label}<span>{k.n}</span>
			</button>
		{/each}
	</div>
	{#if clash.length}<p class="hint" style="margin:-6px 2px 14px">{clash.length === 1 ? `Two posts go live on ${fmt(clash[0].ds)}.` : `Posts bunch up on ${clash.length} days this month.`} Spread them out so each one gets its own audience.</p>{/if}
{/snippet}

{#snippet monthBar()}
	<div class="cl-mbar">
		<h2>{monthName} <em>{month.getFullYear()}</em></h2>
		<button class="cl-neo cl-today" onclick={() => go(0)}>Today</button>
		<button class="cl-neo cl-arrow" onclick={() => go(-1)} aria-label="Previous month"><Icon name="chevL" /></button>
		<button class="cl-neo cl-arrow" onclick={() => go(1)} aria-label="Next month"><Icon name="chevR" /></button>
	</div>
{/snippet}

{#snippet dayCard()}
	<section class="cl-day">
		<div class="cl-dh">
			<span class="cl-eb">{dayEb}</span>
			<h3>{dayNum(sel)} {selDate.toLocaleDateString('en-IN', { month: 'long' })}. <em style="color: {daySay.color}">{daySay.t}</em></h3>
		</div>
		<div class="cl-items">
			{#each selList as e (e.code + e.kind)}
				<div class="cl-item">
					<span class="cl-node" style="--k: {KIND[e.kind].color}"></span>
					<a class="cl-it" href={at(e)}>
						<span class="cl-k" style="color: {KIND[e.kind].color}">{KIND[e.kind].label}</span>
						<b>{e.creator}</b>
						<span>{e.code} · {KIND[e.kind].line}</span>
					</a>
					<a class="cl-neo cl-act" class:on={e.kind === 'draft' && diff(e.date) <= 0} href={at(e)}>{e.kind === 'draft' ? 'Review' : 'Open'}</a>
				</div>
			{:else}
				<p class="cl-none">Nothing on this day{show !== 'all' ? ` for ${KIND[show].plural.toLowerCase()}` : ''}. Pick another day.</p>
			{/each}
		</div>
	</section>
{/snippet}

{#snippet comingWeek()}
	<div class="cl-wh"><span class="cl-eb">Next 7 days</span><span>{weekCount} thing{weekCount === 1 ? '' : 's'}</span></div>
	<div class="cl-week">
		{#each week as d (d.ds)}
			<button class:now={d.now} class:sel={!d.now && sel === d.ds} onclick={() => pick(d.ds)}>
				<small>{d.l}</small><b>{d.n}</b>
				<span>{#each d.kinds as k, i (i)}<i style="background: {d.now ? '#fff' : KIND[k].color}"></i>{/each}</span>
			</button>
		{/each}
	</div>
	<div class="cl-next">
		{#each next as e (e.code + e.kind + e.date)}
			<button onclick={() => pick(e.date)}>
				<span class="cl-nd"><b>{dayNum(e.date)}</b><small>{wdShort(e.date)}</small></span>
				<span class="cl-nt"><span style="color: {KIND[e.kind].color}">{KIND[e.kind].label}</span><b>{firstName(e.creator)} · {e.code}</b></span>
				{#if phone.on}<Icon name="chevR" />{/if}
			</button>
		{:else}
			<p class="cl-none">Nothing else in the next week.</p>
		{/each}
	</div>
{/snippet}

{#if phone.on}
	<div class="cl cl-ph">
		{@render monthBar()}
		{@render toggles()}
		<section class="cl-pm">
			<div class="cl-pwd">{#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as w, i (i)}<span>{w}</span>{/each}</div>
			{#key flip}
				<div class="cl-pgrid">
					{#each cells as c (c.ds)}
						<button class="cl-pc" class:out={c.out} class:today={c.ds === todayIso} class:sel={c.ds === sel && c.ds !== todayIso} onclick={() => pick(c.ds)} aria-label="{c.ds}, {c.list.length} date{c.list.length === 1 ? '' : 's'}">
							<span class="cl-n">{c.d}</span>
							<span class="cl-bars">{#each c.list.slice(0, 3) as e, i (i)}<i style="background: {KIND[e.kind].color}"></i>{/each}</span>
						</button>
					{/each}
				</div>
			{/key}
		</section>
		{@render dayCard()}
		<section class="cl-coming">{@render comingWeek()}</section>
	</div>
{:else}
	<div class="cl cl-lap">
		{@render toggles()}
		<div class="cl-body">
			<section class="cl-month">
				{@render monthBar()}
				<div class="cl-wd">{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as w (w)}<span>{w}</span>{/each}</div>
				{#key flip}
					<div class="cl-grid">
						{#each cells as c (c.ds)}
							<button class="cl-cell" class:out={c.out} class:wknd={c.weekend} class:today={c.ds === todayIso} class:sel={c.ds === sel && c.ds !== todayIso} onclick={() => pick(c.ds)}>
								<span class="cl-n">{c.d}</span>
								<span class="cl-evs">
									{#each c.list.slice(0, 3) as e (e.code + e.kind)}<span class="cl-ev" style="--k: {KIND[e.kind].color}"><i></i><span>{firstName(e.creator)}</span></span>{/each}
									{#if c.list.length > 3}<span class="cl-more">+{c.list.length - 3} more</span>{/if}
								</span>
							</button>
						{/each}
					</div>
				{/key}
			</section>
			<aside class="cl-side">
				{@render dayCard()}
				<section class="cl-coming">{@render comingWeek()}</section>
			</aside>
		</div>
	</div>
{/if}
