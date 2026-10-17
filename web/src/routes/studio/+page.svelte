<script lang="ts">
	import { phone } from '#lib/phone.svelte.ts';
	import PhoneToday from '#lib/components/PhoneToday.svelte';
	import { completeFollow, markPaid, markReceived, priorityOf, studio } from '#lib/studio.svelte.ts';
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
	import PriorityBadge from '#lib/components/PriorityBadge.svelte';
	import AiDesk from '#lib/components/AiDesk.svelte';
	import CollabLeads from '#lib/components/CollabLeads.svelte';
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

	const paidThisMonth = $derived(list.filter((c) => c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(ym)));
	const received = $derived(paidThisMonth.reduce((a, c) => a + c.pay_received, 0));
	const outs = $derived(list.reduce((a, c) => a + outstanding(c), 0));
	const od = $derived(list.filter(overdue).reduce((a, c) => a + outstanding(c), 0));
	const active = $derived(list.filter(isActive));
	const prodGot = $derived(list.filter((c) => hasProduct(c) && stageIndex(c.stage) >= 2 && c.product_date && diff(c.product_date) <= 0));
	const barter = $derived(prodGot.reduce((a, c) => a + c.product_value, 0));
	const goal = $derived(s.monthly_goal || 1);
	const pct = $derived(Math.min(1, received / goal));
	const pctN = $derived(Math.round((received / goal) * 100));
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
<!-- Laptop: the day's numbers in one row, what needs her on the left, AI and the week on the right. -->
<div class="td">
	<header class="ph rv">
		<div>
			<div class="eb">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
			<h1>{greet}, {firstName(s.display_name)}</h1>
			<p>
				{#if urgent}<span class="dt pulse k-bad"></span>{urgent} thing{urgent > 1 ? 's' : ''} need{urgent > 1 ? '' : 's'} you today.{:else}Nothing urgent today. Enjoy creating.{/if}
			</p>
		</div>
	</header>

	<AlertsPrompt />

	<section class="td-kpis rv" style="--i:1" aria-label="This month">
		<div class="td-kpi">
			<small>Received in {monthName}</small>
			<b use:countUp={{ value: received, money: true }}>{inr(received)}</b>
			<span class="td-goal"><i style="--p:{pct}"></i></span>
			<em>{pctN}% of {inrS(goal)} goal</em>
		</div>
		<div class="td-kpi">
			<small>Still to come</small>
			<b use:countUp={{ value: outs, money: true }}>{inr(outs)}</b>
			<em>{nextPayout ? `Next: ${nextPayout.brand.name} · ${fmt(nextPayout.pay_due)}` : 'No payment due yet'}</em>
		</div>
		<div class="td-kpi" class:bad={od > 0}>
			<small>Overdue</small>
			<b use:countUp={{ value: od, money: true }}>{inr(od)}</b>
			<em>{od > 0 ? `${list.filter(overdue).length} invoice${list.filter(overdue).length === 1 ? '' : 's'} late` : 'All payments on time'}</em>
		</div>
		<a class="td-kpi" href="/studio/collabs">
			<small>Active collabs</small>
			<b use:countUp={{ value: active.length }}>{active.length}</b>
			<span class="segbar td-seg" role="img" aria-label={pipe.map((p) => `${p.n} ${p.st.label}`).join(', ')}>
				{#each pipe as p, i (p.st.id)}{#if p.n}<i class="st-{p.st.id}" style="flex:{p.n};--d:{i}"></i>{/if}{/each}
			</span>
			<em>{pipe[0].n} new · {pipe[1].n} talking · {pipe[2].n + pipe[3].n} in work</em>
		</a>
		<div class="td-kpi">
			<small>Barter received</small>
			<b use:countUp={{ value: barter, money: true }}>{inr(barter)}</b>
			<em>{prodGot.length} product{prodGot.length === 1 ? '' : 's'}</em>
		</div>
	</section>

	<div class="td-grid">
		<div class="td-main">
			<CollabLeads />
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
								<button class="btn sm" onclick={() => leaveThen(t.c.id + t.kind, () => markPaid(t.c))}>Mark paid</button>
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
			<BrandQuestions />
		</div>

		<aside class="td-side">
			<AiDesk />
			<section class="panel td-week rv" style="--i:4">
				<div class="panel-h"><h2>This week</h2><a class="td-link" href="/studio/calendar">Calendar</a></div>
				{#each week.filter((d) => d.list.length) as d (d.ds)}
					<div class="td-day">
						<div class="td-day-h"><b>{d.i === 0 ? 'Today' : d.i === 1 ? 'Tomorrow' : d.dt.toLocaleDateString('en-IN', { weekday: 'long' })}</b><small>{d.dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small></div>
						{#each d.list as e (e.c.id + e.kind)}
							<button class="td-ev k-{e.kind}" onclick={() => (ui.openCollab = e.c.id)}><span class="dt"></span><span class="td-ev-t">{evLabel(e)}</span><small>{e.c.brand.name}</small></button>
						{/each}
					</div>
				{:else}
					<p class="td-free">Nothing scheduled this week. A good time to plan content.</p>
				{/each}
				{#if week.some((d) => d.list.length) && week.some((d) => !d.list.length)}
					<p class="td-free">Free: {week.filter((d) => !d.list.length).map((d) => (d.i === 0 ? 'today' : d.dt.toLocaleDateString('en-IN', { weekday: 'short' }))).join(', ')}</p>
				{/if}
			</section>
		</aside>
	</div>
</div>
{/if}
