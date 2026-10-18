<script lang="ts">
	import { receivedIn } from '#lib/invoice.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import PhoneToday from '#lib/components/PhoneToday.svelte';
	import { askPaid, completeFollow, markPaid, markReceived, priorityOf, studio } from '#lib/studio.svelte.ts';
	import { countUp, ui } from '#lib/ui.svelte.ts';
	import { flip } from '#lib/motion.ts';
	import {
		KIND_ICON,
		STAGES,
		diff,
		events,
		evLabel,
		firstName,
		fmt,
		hasProduct,
		inTransit,
		inr,
		inrS,
		isActive,
		isPaid,
		iso,
		outstanding,
		overdue,
		parse,
		rel,
		relWord,
		stageIndex,
		tasks,
		today,
		type Task
	} from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import PriorityBadge from '#lib/components/PriorityBadge.svelte';
	import AiDesk from '#lib/components/AiDesk.svelte';
	import NudgeList from '#lib/components/NudgeList.svelte';
	import AwayMode from '#lib/components/AwayMode.svelte';
	import AlertsPrompt from '#lib/components/AlertsPrompt.svelte';
	import BrandQuestions from '#lib/components/BrandQuestions.svelte';

	const s = $derived(studio.settings!);
	const list = $derived(studio.collabs);
	// New requests are listed by priority (paid first), in the place the first one would have been.
	const ts = $derived.by(() => {
		const all = tasks(list);
		const ranked = all.filter((t) => t.kind === 'new').sort((a, b) => (priorityOf(b.c)?.score ?? 0) - (priorityOf(a.c)?.score ?? 0));
		let n = 0;
		return all.map((t) => (t.kind === 'new' ? ranked[n++] : t));
	});
	const urgent = $derived(ts.filter((t) => t.d <= 0).length);

	const T = today();
	const hour = new Date().getHours();
	const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
	const monthName = T.toLocaleDateString('en-IN', { month: 'long' });
	const ym = iso(T).slice(0, 7);

	const received = $derived(list.reduce((a, c) => a + receivedIn(c, ym), 0));
	const outs = $derived(list.reduce((a, c) => a + outstanding(c), 0));
	const od = $derived(list.filter(overdue).reduce((a, c) => a + outstanding(c), 0));
	const active = $derived(list.filter(isActive));
	const prodGot = $derived(list.filter((c) => hasProduct(c) && stageIndex(c.stage) >= 2 && c.product_date && diff(c.product_date) <= 0));
	const barter = $derived(prodGot.reduce((a, c) => a + c.product_value, 0));
	// No goal set (0): no percentage, just the amount.
	const goal = $derived(Math.max(0, s.monthly_goal || 0));
	const pct = $derived(goal ? Math.min(1, received / goal) : 0);
	const pctN = $derived(goal ? Math.round((received / goal) * 100) : 0);
	const nextPayout = $derived(
		list
			.filter((c) => isPaid(c) && c.pay_status !== 'paid' && c.pay_due && diff(c.pay_due) >= 0)
			.sort((a, b) => parse(a.pay_due!).getTime() - parse(b.pay_due!).getTime())[0]
	);


	const evs = $derived(events(list));
	const week = $derived(
		Array.from({ length: 7 }, (_, i) => {
			const ds = rel(i);
			return { ds, dt: parse(ds), i, list: evs.filter((e) => e.date === ds) };
		})
	);
	const pipe = $derived(STAGES.slice(0, 5).map((st) => ({ st, n: list.filter((c) => c.stage === st.id).length })));
	// Atelier cards: last month for comparison, the month's curve, the week's money, the pipeline's value.
	const prev = new Date(T.getFullYear(), T.getMonth() - 1, 1);
	const prevName = prev.toLocaleDateString('en-IN', { month: 'long' });
	const prevYm = iso(prev).slice(0, 7);
	const lastMonth = $derived(list.reduce((a, c) => a + receivedIn(c, prevYm), 0));
	const vs = $derived(lastMonth > 0 ? Math.round(((received - lastMonth) / lastMonth) * 100) : null);
	const curve = $derived.by(() => {
		const days = T.getDate();
		const per = Array(days + 1).fill(0);
		for (const c of list) {
			const live = (c.invoices ?? []).filter((i) => i.status === 'paid' && (i.paid_on ?? '').startsWith(ym));
			if ((c.invoices ?? []).some((i) => i.status !== 'draft' && i.status !== 'cancelled')) {
				for (const i of live) per[Math.min(days, Number(i.paid_on!.slice(8, 10)))] += (Number(i.subtotal) || 0) * (Number(i.inr_rate) || 1);
			} else if (c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(ym)) per[Math.min(days, Number(c.paid_on!.slice(8, 10)))] += Number(c.pay_received) || 0;
		}
		let run = 0;
		const pts = per.map((v) => (run += v));
		const max = Math.max(1, run);
		const xy = pts.map((v, i) => [Math.round((i / Math.max(1, days)) * 520), Math.round(84 - (v / max) * 74)]);
		const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
		return { line, area: `${line} L520 90 L0 90 Z`, end: xy[xy.length - 1] };
	});
	const weekIn = $derived(list.filter((c) => c.pay_due && diff(c.pay_due) >= 0 && diff(c.pay_due) <= 6).reduce((a, c) => a + outstanding(c), 0));
	const HUE: Record<string, string> = { request: 'var(--h-request)', negotiating: 'var(--h-nego)', confirmed: 'var(--h-confirmed)', creating: 'var(--h-creating)', live: 'var(--h-live)' };
	const pipeV = $derived(pipe.map((p) => ({ ...p, v: list.filter((c) => c.stage === p.st.id).reduce((a, c) => a + (Number(c.fee) || 0), 0) })));
	const pipeTotal = $derived(pipeV.reduce((a, p) => a + p.v, 0));

	let leaving = $state<string | null>(null);
	function leaveThen(key: string, fn: () => void) {
		leaving = key;
		setTimeout(() => {
			fn();
			leaving = null;
		}, 330);
	}
	const when = (t: Task) => {
		if (t.kind === 'msg') return { text: 'waiting for your reply', cls: 'today' };
		if (t.kind === 'new') return { text: `received ${relWord(diff(t.c.received_on))}`, cls: '' };
		if (t.kind === 'pay') return { text: `due ${fmt(t.c.pay_due)}, ${-t.d} day${-t.d > 1 ? 's' : ''} late`, cls: 'late' };
		if (t.d < 0) return { text: `${-t.d} day${-t.d > 1 ? 's' : ''} late`, cls: 'late' };
		if (t.d === 0) return { text: 'today', cls: 'today' };
		return { text: relWord(t.d), cls: '' };
	};
</script>

<svelte:head><title>Today · {s.app_name}</title></svelte:head>

{#if phone.on}
	<PhoneToday />
{:else}
<!-- Laptop: the brand page's hero, for her: who, the day, this month's money and the numbers that matter. -->
<div class="td at-td">
	<section class="bx-hero at-hero rv">
		<div class="mesh" aria-hidden="true"></div>
		<div class="bx-hero-main">
			<div class="bx-id">
				<Avatar name={s.display_name} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} size="clamp(78px, 8vw, 104px)" />
				<div class="bx-id-t">
					<span class="bx-eb">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
					<h1>{greet}, <em>{firstName(s.display_name)}</em></h1>
					<div class="bx-handle">{#if urgent}{urgent} due today{ts.length > urgent ? ` · ${ts.length} on your list` : ''}{:else}Nothing urgent today{/if}{#if weekIn} · {inr(weekIn)} due to you this week{/if}</div>
				</div>
			</div>
			<div class="ah-earn">
				<small>Earned in {monthName}</small>
				<div class="ah-row"><b class="num" use:countUp={{ value: received, money: true }}>{inr(received)}</b>{#if vs !== null}<span class="bx-pill" class:off={vs < 0}><span class="dt"></span>{vs >= 0 ? '+' : ''}{vs}% vs {prevName}</span>{/if}</div>
				{#if goal}<div class="ah-goal"><span><i style="width:{Math.round(pct * 100)}%"></i></span><small><b>{pctN}%</b> of your {inrS(goal)} goal</small></div>{/if}
			</div>
			<div class="bx-cta">
				<button class="btn grad lg" onclick={() => (ui.newCollab = true)}><Icon name="plus" />New collab</button>
				<button class="btn" onclick={() => (ui.askOpen = true)}><Icon name="spark" />Ask your desk</button>
				<a class="btn" href="/studio/collabs"><Icon name="board" />Open board</a>
			</div>
		</div>
		<div class="bx-stats">
			<a class="bx-stat" href="/studio/payments" style="--i:0"><b class="num">{inrS(outs)}</b><small>Still to come</small></a>
			<a class="bx-stat" class:bad={od > 0} href="/studio/payments" style="--i:1"><b class="num">{inrS(od)}</b><small>{od > 0 ? `Overdue · ${list.filter(overdue).length} late` : 'Overdue · all on time'}</small></a>
			<a class="bx-stat" href="/studio/collabs" style="--i:2"><b class="num">{active.length}</b><small>Active collabs</small></a>
			<a class="bx-stat" href="/studio/content" style="--i:3"><b class="num">{inrS(barter)}</b><small>Barter · {prodGot.length} product{prodGot.length === 1 ? '' : 's'}</small></a>
			<div class="bx-live"><span class="dt"></span>{nextPayout ? `Next payment: ${nextPayout.brand.name} · ${fmt(nextPayout.pay_due)}` : 'No payment due yet'}</div>
			<a class="bx-ins" href="/studio/reports">See this month's report<Icon name="arrow" /></a>
		</div>
	</section>

	<AwayMode banner />
	<AlertsPrompt />

	<div class="at-top rv" style="--i:1">
		<section class="at-card at-money" aria-label="Money this month">
			<div class="at-h"><div><span class="bx-eb">Money in</span><h2>{monthName}, day by day</h2></div>{#if vs !== null}<span class="chip" class:up={vs >= 0} class:down={vs < 0}>{vs >= 0 ? '+' : ''}{vs}% vs {prevName}</span>{/if}</div>
			<svg class="at-spark" viewBox="0 0 520 90" preserveAspectRatio="none" aria-hidden="true"
				><defs
					><linearGradient id="tdArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--g2);stop-opacity:.34" /><stop offset="1" style="stop-color:var(--g2);stop-opacity:0" /></linearGradient
					><linearGradient id="tdLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--g1)" /><stop offset=".6" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g3)" /></linearGradient
				></defs
				><path d={curve.area} fill="url(#tdArea)" /><path d={curve.line} fill="none" stroke="url(#tdLine)" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke" /></svg
			>
			<div class="at-mini">
				<div><span class="lbl">Received</span><b class="num">{inr(received)}</b><small>this month</small></div>
				<div><span class="lbl">Still to come</span><b class="num">{inr(outs)}</b><small>{nextPayout ? `Next: ${nextPayout.brand.name}` : 'Nothing due yet'}</small></div>
				<div class:bad={od > 0}><span class="lbl">Overdue</span><b class="num">{inr(od)}</b><small class:ok={!od}>{od > 0 ? `${list.filter(overdue).length} late` : 'All on time'}</small></div>
			</div>
		</section>

		<section class="at-card at-pipe" aria-label="Pipeline">
			<div class="at-h"><div><span class="bx-eb">Pipeline</span><h2>Deals in play</h2></div><a href="/studio/collabs">Open board</a></div>
			<div class="at-pv"><b class="num">{inrS(pipeTotal)}</b><span>across {active.length} open collab{active.length === 1 ? '' : 's'}</span></div>
			<span class="at-seg" role="img" aria-label={pipeV.map((p) => `${p.n} ${p.st.label}`).join(', ')}>
				{#each pipeV as p (p.st.id)}{#if p.n}<i style="flex:{p.n};background:{HUE[p.st.id]}"></i>{/if}{/each}
			</span>
			<div class="at-stages">
				{#each pipeV as p (p.st.id)}
					<a href="/studio/collabs" class="at-st"><i style="background:{HUE[p.st.id]}"></i><span>{p.st.label}</span><span class="num at-n">{p.n}</span><b class="num">{inrS(p.v)}</b></a>
				{/each}
			</div>
		</section>
	</div>

	<div class="at-grid">
		<div class="at-main">
			<section class="panel needs-panel rv" style="--i:2">
				<div class="panel-h"><h2>Needs you</h2><span class="count-chip tint {urgent ? 'k-bad' : 'k-pay'}">{ts.length} item{ts.length === 1 ? '' : 's'}</span></div>
				<div class="task-list" use:flip>
				{#each ts as t, i (t.c.id + t.kind)}
					{@const w = when(t)}
					<div class="task" class:leaving={leaving === t.c.id + t.kind} style="--i:{i}">
						<span class="ticon tint k-{t.kind === 'pay' ? 'bad' : t.kind}"><Icon name={KIND_ICON[t.kind]} /></span>
						<div class="tbody"><div class="tt">{t.title}{#if t.kind === 'new' && priorityOf(t.c)}<PriorityBadge p={priorityOf(t.c)!} compact />{/if}</div><div class="tm">{t.c.brand.name} · <span class={w.cls}>{w.text}</span></div></div>
						<div class="tact">
							{#if t.kind === 'follow'}
								<button class="btn sm" onclick={() => leaveThen(t.c.id + t.kind, () => completeFollow(t.c))}><Icon name="check" />Done</button>
							{:else if t.kind === 'pay'}
								<button class="btn sm" onclick={async () => (await askPaid(t.c)) && leaveThen(t.c.id + t.kind, () => markPaid(t.c, false, true))}>Mark paid</button>
							{:else if t.kind === 'product' && inTransit(t.c)}
								<button class="btn sm" onclick={() => leaveThen(t.c.id + t.kind, () => markReceived(t.c))}><Icon name="box" />Received</button>
							{:else if t.kind === 'new' || t.kind === 'msg' || t.kind === 'usage'}
								<button class="btn sm" onclick={() => (ui.openCollab = t.c.id)}>{t.kind === 'msg' ? 'Reply' : t.kind === 'usage' ? 'Open' : 'Review'}</button>
							{/if}
							<button class="icon-btn sm go" onclick={() => (ui.openCollab = t.c.id)} aria-label="Open {t.c.brand.name}"><Icon name="arrow" /></button>
						</div>
					</div>
				{:else}
					<div class="empty"><span class="empty-ic"><Icon name="check" /></span><b>You're all caught up</b><small>New requests and follow-ups will show up here.</small></div>
				{/each}
				</div>
			</section>
			<NudgeList />
			<BrandQuestions />
		</div>
		<aside class="at-aside">
			<AiDesk />
		</aside>
	</div>

	<section class="at-card at-week rv" style="--i:4" aria-label="This week">
		<div class="at-h"><div><span class="bx-eb">Coming up</span><h2>This week</h2></div><a href="/studio/calendar">Calendar</a></div>
		<div class="at-days">
			{#each week as d (d.ds)}
				<div class="at-day" class:now={d.i === 0}>
					<div class="at-dh"><b>{d.i === 0 ? 'Today' : d.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</b><span class="num">{d.dt.getDate()}</span></div>
					{#each d.list as e (e.c.id + e.kind)}
						<button class="at-ev k-{e.kind}" onclick={() => (ui.openCollab = e.c.id)}><span>{evLabel(e)}</span><small>{e.c.brand.name}</small></button>
					{:else}
						<span class="at-free">Free</span>
					{/each}
				</div>
			{/each}
		</div>
	</section>
</div>
{/if}
