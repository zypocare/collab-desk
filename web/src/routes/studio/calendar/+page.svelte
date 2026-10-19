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
		e.kind === 'follow' ? e.c.follow_note || 'Check in with the brand' : e.kind === 'pay' ? `${inr(outstanding(e.c))} · ${e.c.invoice_no || 'invoice'}` : delivText(e.c.deliverables);
	// The next step, when there is one to take from here; otherwise open the collab.
	function step(e: CalEvent): { label: string; run: () => unknown } | null {
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

<style>
	/* Every size, gap and colour below is taken from the approved Calendar design. */
	.cl { display: flex; flex-direction: column; color: var(--ink); font-family: var(--f-body, Inter, system-ui, sans-serif); }
	.cl-lap { gap: 24px; padding-bottom: 56px; }
	.cl-ph { gap: 18px; padding-bottom: 24px; }
	.cl-eb { font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	h1, h2, h3 { margin: 0; font-family: var(--f-serif, Georgia, serif); font-weight: 400; letter-spacing: -.01em; }
	h1 em, h2 em { background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 4px; }

	/* NeoPOP blocks */
	.cl-neo { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 0; font-family: var(--f-body, inherit); cursor: pointer; transition: transform .07s, box-shadow .07s; }
	.cl-neo:active { transform: translate(3px, 3px); box-shadow: none !important; }
	.cl-neo :global(.ic) { width: 16px; height: 16px; stroke-width: 2.2; }

	/* What to show */
	.cl-kinds { display: flex; flex-wrap: wrap; gap: 10px; }
	.cl-ph .cl-kinds { flex-wrap: nowrap; gap: 8px; overflow-x: auto; margin: 0 -16px; padding: 0 16px 6px; scrollbar-width: none; }
	.cl-ph .cl-kinds::-webkit-scrollbar { display: none; }
	.cl-kind { flex: none; height: 40px; padding: 0 14px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink); font-size: 11.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
	.cl-ph .cl-kind { height: 38px; padding: 0 12px; gap: 7px; font-size: 11px; }
	.cl-kind i { width: 8px; height: 8px; border-radius: 50%; }
	.cl-ph .cl-kind i { width: 7px; height: 7px; }
	.cl-kind span { letter-spacing: 0; font-weight: 600; color: var(--ink-3); }
	.cl-kind.on { border-color: var(--ink); background: var(--ink); color: var(--bg); box-shadow: 3px 3px 0 var(--g2); }
	.cl-kind.on span { color: color-mix(in oklab, var(--bg) 60%, transparent); }

	/* Month bar */
	.cl-mbar { display: flex; align-items: center; gap: 12px; }
	.cl-ph .cl-mbar { gap: 8px; margin-top: 4px; }
	.cl-mbar h2 { flex: 1; font-size: 40px; line-height: 1; }
	.cl-ph .cl-mbar h2 { font-size: 36px; }
	.cl-today { height: 40px; padding: 0 16px; border: 0; background: var(--ink); color: var(--bg); font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; box-shadow: 3px 3px 0 var(--g2); }
	.cl-ph .cl-today { padding: 0 12px; font-size: 10.5px; }
	.cl-arrow { width: 40px; height: 40px; padding: 0; border: 1px solid var(--line-strong); background: transparent; color: var(--ink); box-shadow: 3px 3px 0 var(--line-strong); }

	/* Laptop: the month */
	.cl-body { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 22px; align-items: start; }
	.cl-month { border-radius: 26px; border: 1px solid var(--line); background: var(--surface); padding: 22px 22px 18px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
	.cl-wd, .cl-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
	.cl-wd span { padding: 0 10px; font-size: 10.5px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; color: var(--ink-3); }
	.cl-grid { animation: cl-in .35s cubic-bezier(.2, .9, .25, 1) both; }
	@keyframes cl-in { from { opacity: 0; transform: translateY(8px); } }
	.cl-cell { min-height: 118px; min-width: 0; padding: 10px; box-sizing: border-box; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; border: 1px solid var(--line); border-radius: 0; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; transition: border-color .2s, box-shadow .12s; }
	.cl-cell.wknd { background: color-mix(in oklab, var(--ink) 2.5%, transparent); }
	.cl-cell:hover { border-color: var(--line-strong); }
	.cl-cell.out { opacity: .4; }
	.cl-cell.today, .cl-cell.sel { border: 1.5px solid var(--ink); background: color-mix(in oklab, var(--ink) 6%, var(--surface)); box-shadow: 4px 4px 0 var(--g2); }
	.cl-cell.sel { box-shadow: 4px 4px 0 var(--line-strong); }
	.cl-n { font-family: var(--f-serif, Georgia, serif); font-size: 22px; line-height: 1; }
	.today > .cl-n { width: 32px; height: 32px; display: grid; place-items: center; margin: -4px 0 0 -4px; color: #fff; background: linear-gradient(135deg, var(--g1), var(--g2) 60%, var(--g3)); }
	.cl-evs { display: flex; flex-direction: column; gap: 4px; width: 100%; min-width: 0; }
	.cl-ev { display: flex; align-items: center; gap: 6px; height: 20px; padding-right: 6px; font-size: 11.5px; font-weight: 600; white-space: nowrap; overflow: hidden; color: var(--ink); background: color-mix(in oklab, var(--k) 16%, transparent); }
	.cl-ev i { flex: none; width: 3px; align-self: stretch; background: var(--k); }
	.cl-ev span { overflow: hidden; text-overflow: ellipsis; }
	.cl-more { padding-left: 2px; font-size: 11px; font-weight: 700; color: var(--ink-3); }
	.cl-side { display: flex; flex-direction: column; gap: 18px; min-width: 0; }

	/* The day you picked */
	.cl-day { border-radius: 26px; padding: 24px; border: 1px solid var(--line); background: radial-gradient(120% 60% at 100% 0%, color-mix(in oklab, var(--g2) 14%, transparent), transparent 60%), var(--surface); display: flex; flex-direction: column; gap: 16px; }
	.cl-ph .cl-day { border-radius: 24px; padding: 20px 18px; gap: 12px; }
	.cl-dh { display: grid; gap: 6px; }
	.cl-ph .cl-dh .cl-eb { font-size: 10.5px; }
	.cl-dh h3 { font-size: 34px; line-height: 1.05; }
	.cl-ph .cl-dh h3 { font-size: 30px; }
	.cl-items { display: flex; flex-direction: column; }
	.cl-item { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 14px 0; border-top: 1px solid var(--line); }
	.cl-ph .cl-item { grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; }
	.cl-node { margin-top: 3px; width: 12px; height: 12px; border-radius: 50%; background: var(--k); box-shadow: 0 0 0 4px var(--surface), 0 0 14px var(--k); }
	.cl-ph .cl-node { margin-top: 0; }
	.cl-it { display: grid; gap: 4px; min-width: 0; padding: 0; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
	.cl-ph .cl-it { gap: 3px; }
	.cl-k { font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
	.cl-it b { font-family: var(--f-serif, Georgia, serif); font-style: italic; font-weight: 400; font-size: 24px; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.cl-ph .cl-it b { font-size: 22px; }
	.cl-it > span:last-child { font-size: 12.5px; color: var(--ink-3); }
	.cl-act { height: 36px; padding: 0 14px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink); font-size: 12.5px; font-weight: 700; box-shadow: 3px 3px 0 var(--line-strong); }
	.cl-ph .cl-act { padding: 0 12px; }
	.cl-act.on { border: 0; background: var(--ink); color: var(--bg); box-shadow: 3px 3px 0 var(--g2); }
	.cl-none { margin: 0; padding: 14px 0; border-top: 1px solid var(--line); font-size: 13.5px; color: var(--ink-3); }

	/* The coming week */
	.cl-coming { display: flex; flex-direction: column; gap: 14px; }
	.cl-lap .cl-coming { border-radius: 26px; padding: 22px 24px; border: 1px solid var(--line); background: var(--surface); }
	.cl-ph .cl-coming { gap: 12px; }
	.cl-wh { display: flex; align-items: center; }
	.cl-wh > span:last-child { margin-left: auto; font-size: 13px; color: var(--ink-2); }
	.cl-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
	.cl-week button { height: 84px; padding: 10px 0 9px; box-sizing: border-box; border-radius: 999px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; border: 1px solid var(--line); background: color-mix(in oklab, var(--ink) 3%, var(--bg)); color: var(--ink); font: inherit; cursor: pointer; transition: transform .3s cubic-bezier(.2, 1.6, .4, 1); }
	.cl-ph .cl-week button { height: 76px; padding: 9px 0 8px; }
	.cl-week button:active { transform: scale(.94); }
	.cl-week small { font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
	.cl-ph .cl-week small { font-size: 8.5px; letter-spacing: .06em; }
	.cl-week b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 22px; line-height: 1; }
	.cl-ph .cl-week b { font-size: 20px; }
	.cl-week span { display: flex; gap: 3px; height: 6px; }
	.cl-ph .cl-week span { height: 5px; }
	.cl-week i { width: 5px; height: 5px; border-radius: 50%; }
	.cl-week button.now { border: 0; color: #fff; background: linear-gradient(170deg, var(--g1), var(--g2) 60%, var(--g3)); box-shadow: 0 12px 30px -10px color-mix(in oklab, var(--g2) 70%, transparent); }
	.cl-week button.now small { color: #fff; }
	.cl-week button.sel { border: 1.5px solid var(--ink); transform: translateY(-4px); }
	.cl-next { display: flex; flex-direction: column; }
	.cl-next button { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 12px; align-items: center; width: 100%; padding: 11px 0; border: 0; border-top: 1px solid var(--line); background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
	.cl-ph .cl-next button { grid-template-columns: 44px minmax(0, 1fr) 16px; padding: 12px 0; }
	.cl-ph .cl-next button :global(.ic) { width: 16px; height: 16px; color: var(--ink-3); }
	.cl-nd { display: grid; gap: 1px; }
	.cl-nd b { font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: 22px; line-height: 1; }
	.cl-ph .cl-nd b { font-size: 24px; }
	.cl-nd small { font-size: 9.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
	.cl-nt { display: grid; gap: 2px; min-width: 0; }
	.cl-nt > span { font-size: 9.5px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
	.cl-nt b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.cl-ph .cl-nt b { font-size: 14.5px; }

	/* Phone: the month */
	.cl-pm { display: flex; flex-direction: column; gap: 6px; }
	.cl-pwd, .cl-pgrid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
	.cl-pwd { text-align: center; }
	.cl-pwd span { font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
	.cl-pgrid { gap: 4px; animation: cl-in .35s cubic-bezier(.2, .9, .25, 1) both; }
	.cl-pc { height: 56px; padding: 6px 0 7px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: space-between; border: 1px solid transparent; border-radius: 0; background: transparent; color: var(--ink); font: inherit; cursor: pointer; transition: box-shadow .12s; }
	.cl-pc.out { opacity: .35; }
	.cl-pc .cl-n { font-size: 20px; }
	.cl-pc.today, .cl-pc.sel { border: 1.5px solid var(--ink); background: color-mix(in oklab, var(--ink) 6%, var(--surface)); box-shadow: 3px 3px 0 var(--g2); }
	.cl-pc.sel { box-shadow: 3px 3px 0 var(--line-strong); }
	.cl-pc.today > .cl-n { width: 28px; height: 28px; margin: 0; }
	.cl-bars { display: flex; gap: 2px; height: 4px; }
	.cl-bars i { width: 9px; height: 4px; }

	@media (max-width: 1180px) and (min-width: 761px) {
		.cl-body { grid-template-columns: minmax(0, 1fr); }
	}
	@media (prefers-reduced-motion: reduce) {
		.cl-grid, .cl-pgrid { animation: none; }
	}
</style>
