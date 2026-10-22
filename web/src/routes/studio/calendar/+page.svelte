<script lang="ts">
	// The calendar: an exact build of the approved design (artifact "Calendar redesign"), one page for
	// phone and laptop. Square toggles pick which dates show, the month marks each day's dates in their
	// colour, the picked day lists what is on it with the next step, and the coming week sits below.
	import { completeFollow, markPaid, markReceived, setStage, studio } from '#lib/studio.svelte.ts';
	import { ui } from '#lib/ui.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { delivText, diff, events, inr, iso, outstanding, stageIndex, today, type CalEvent } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	type Kind = CalEvent['kind'];
	const KIND: Record<Kind, { label: string; plural: string; color: string }> = {
		shoot: { label: 'Shoot', plural: 'Shoots', color: '#FFAE6B' },
		draft: { label: 'Draft due', plural: 'Drafts', color: '#9C7BFF' },
		live: { label: 'Goes live', plural: 'Go-lives', color: '#4CCFC2' },
		follow: { label: 'Follow-up', plural: 'Follow-ups', color: '#7EA2FF' },
		pay: { label: 'Payment', plural: 'Payments', color: '#6FD08C' },
		product: { label: 'Product', plural: 'Products', color: '#F25A90' }
	};
	const ORDER: Kind[] = ['shoot', 'draft', 'live', 'follow', 'pay', 'product'];

	const T = today();
	const todayIso = iso(T);
	let month = $state(new Date(T.getFullYear(), T.getMonth(), 1));
	let sel = $state(todayIso);
	let show = $state<'all' | Kind>('all');
	let flip = $state(0);

	const all = $derived(events(studio.collabs).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)));
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
		// The phone puts the busiest kinds first so they are in reach without scrolling.
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

	// The day you picked: a headline, then each date with its next step.
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
			const t = {
				shoot: n === 1 ? 'A shoot day.' : `${count(n)} shoots.`,
				draft: n === 1 ? 'A draft is due.' : `${count(n)} drafts due.`,
				live: n === 1 ? 'One goes live.' : `${count(n)} go live.`,
				follow: n === 1 ? 'A follow-up.' : `${count(n)} follow-ups.`,
				pay: n === 1 ? 'A payment is due.' : `${count(n)} payments due.`,
				product: n === 1 ? 'A product arrives.' : `${count(n)} products arrive.`
			}[k];
			return { t, color: KIND[k].color };
		}
		return { t: `${count(l.length)} things.`, color: 'var(--g3)' };
	});
	const sub = (e: CalEvent) =>
		e.label || (e.kind === 'follow' ? e.c.follow_note || 'Check in with the brand' : e.kind === 'pay' ? `${inr(outstanding(e.c))} · ${e.c.invoice_no || 'invoice'}` : delivText(e.c.deliverables));
	// The next step, when there is one to take from here; otherwise open the collab.
	function step(e: CalEvent): { label: string; run: () => unknown } | null {
		if (['paused', 'cancelled'].includes(e.c.stage)) return null;
		const due = diff(e.date) <= 0;
		if (e.kind === 'live' && due && stageIndex(e.c.stage) < 4) return { label: 'Posted', run: () => setStage(e.c, 'live') };
		if (e.kind === 'pay' && due) return { label: 'Paid?', run: () => markPaid(e.c) };
		if (e.kind === 'follow' && due) return { label: 'Done', run: () => completeFollow(e.c) };
		if (e.kind === 'product' && due && !e.c.product_received_at) return { label: 'Got it', run: () => markReceived(e.c) };
		return null;
	}
	const open = (e: CalEvent) => (ui.openCollab = e.c.id);

	// The coming week, from today.
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
	const todayN = $derived(all.filter((e) => e.date === todayIso).length);
	const monthName = $derived(month.toLocaleDateString('en-IN', { month: 'long' }));
	const wdShort = (ds: string) => new Date(ds + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
	const dayNum = (ds: string) => new Date(ds + 'T00:00:00').getDate();
</script>

<svelte:head><title>Calendar · {studio.settings?.app_name}</title></svelte:head>

{#snippet toggles()}
	<div class="cl-kinds" role="group" aria-label="Show">
		{#each kinds as k (k.id)}
			<button class="cl-neo cl-kind" class:on={show === k.id} aria-pressed={show === k.id} onclick={() => (show = k.id)}>
				<i style="background: {k.id === 'all' ? 'linear-gradient(135deg, var(--g1), var(--g2), var(--g3))' : k.color}"></i>{k.label}<span>{k.n}</span>
			</button>
		{/each}
	</div>
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
			{#each selList as e (e.c.id + e.kind)}
				{@const st = step(e)}
				<div class="cl-item">
					<span class="cl-node" style="--k: {KIND[e.kind].color}"></span>
					<button class="cl-it" onclick={() => open(e)}>
						<span class="cl-k" style="color: {KIND[e.kind].color}">{e.kind === 'live' && stageIndex(e.c.stage) >= 4 ? 'Went live' : KIND[e.kind].label}</span>
						<b>{e.c.brand.name}</b>
						<span>{sub(e)}</span>
					</button>
					{#if st}
						<button class="cl-neo cl-act on" onclick={st.run}>{st.label}</button>
					{:else}
						<button class="cl-neo cl-act" onclick={() => open(e)}>Open</button>
					{/if}
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
		{#each next as e (e.c.id + e.kind + e.date)}
			<button onclick={() => pick(e.date)}>
				<span class="cl-nd"><b>{dayNum(e.date)}</b><small>{wdShort(e.date)}</small></span>
				<span class="cl-nt"><span style="color: {KIND[e.kind].color}">{KIND[e.kind].label}</span><b>{e.c.brand.name} · {e.kind === 'pay' ? inr(outstanding(e.c)) : delivText(e.c.deliverables)}</b></span>
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
		<!-- The same header as Content; the shared top bar carries the tabs and buttons. -->
		<header class="ph rv">
			<div>
				<div class="eb">Plan · {inMonth.length} thing{inMonth.length === 1 ? '' : 's'} this month · {todayN} today</div>
				<h1>Your <em>calendar</em></h1>
				<p>Every shoot, draft, go-live, follow-up and payment date in one place.</p>
			</div>
		</header>
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
									{#each c.list.slice(0, 3) as e (e.c.id + e.kind)}<span class="cl-ev" style="--k: {KIND[e.kind].color}"><i></i><span>{e.c.brand.name}</span></span>{/each}
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

