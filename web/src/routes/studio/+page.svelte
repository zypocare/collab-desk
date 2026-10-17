<script lang="ts">
	import { phone } from '#lib/phone.svelte.ts';
	import PhoneToday from '#lib/components/PhoneToday.svelte';
	import { completeFollow, markPaid, markReceived, priorityOf, studio } from '#lib/studio.svelte.ts';
	import { countUp, ui } from '#lib/ui.svelte.ts';
	import { flip, tilt } from '#lib/motion.ts';
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
<header class="ph rv">
	<div>
		<div class="eb">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
		<h1>{greet}, <em class="name-grad">{firstName(s.display_name)}</em></h1>
		<p>
			{#if urgent}<span class="dt pulse k-bad"></span>{urgent} thing{urgent > 1 ? 's' : ''} need{urgent > 1 ? '' : 's'} you today.{:else}Nothing urgent today. Enjoy creating.{/if}
		</p>
	</div>
	<div class="acts"><button class="btn primary" onclick={() => (ui.newCollab = true)}><Icon name="plus" />Add collab</button></div>
</header>


<AlertsPrompt />

<!-- What needs her first, with the month's money beside it. -->
<div class="t-row t-a">
	<section class="panel needs-panel rv" style="--i:1">
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
	<section class="hero-card glow rv" style="--i:2" use:tilt={{ max: 3.5 }}>
		<div class="mesh" aria-hidden="true"></div>
		<div class="hc-in">
			<div class="hc-top"><span class="hc-eb">Received in {monthName}</span><span class="glass-chip"><Icon name="spark" />Goal {inrS(goal)}</span></div>
			<div class="hc-main">
				<div>
					<div class="hc-val" use:countUp={{ value: received, money: true }}>{inr(received)}</div>
					<div class="hc-sub">from {paidThisMonth.length} brand{paidThisMonth.length === 1 ? '' : 's'} · <b>{pctN}%</b> of this month's goal</div>
				</div>
				<div class="goal" style="--p:{pct}">
					<svg viewBox="0 0 120 120" aria-hidden="true"
						><defs
							><linearGradient id="goalGrad" x1="0" y1="0" x2="1" y2="1"
								><stop offset="0" style="stop-color:var(--g3)" /><stop offset=".5" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g1)" /></linearGradient
							></defs
						><circle class="g-track" cx="60" cy="60" r="50" /><circle class="g-prog" cx="60" cy="60" r="50" pathLength="100" /></svg
					>
					<div class="g-txt"><b use:countUp={{ value: pctN, suffix: '%' }}>{pctN}%</b><small>of goal</small></div>
				</div>
			</div>
			<div class="hc-foot">
				<div><small>Still to come</small><b use:countUp={{ value: outs, money: true }}>{inr(outs)}</b></div>
				<div><small>Overdue</small><b class:od={od > 0} use:countUp={{ value: od, money: true }}>{inr(od)}</b></div>
				<div><small>Next payout</small><b>{nextPayout ? `${nextPayout.brand.name} · ${fmt(nextPayout.pay_due)}` : 'None scheduled'}</b></div>
			</div>
		</div>
	</section>
</div>

<BrandQuestions />

<div class="t-row t-b">
	<section class="panel rv" style="--i:3">
		<div class="panel-h"><h2>Next 7 days</h2><small>drafts, go-lives, follow-ups and payments</small></div>
		<div class="week-wrap">
			<div class="week">
				{#each week as d (d.ds)}
					<div class="day" class:is-today={d.i === 0} style="--i:{d.i}">
						<div class="day-h"><b>{d.dt.getDate()}</b><small>{d.i === 0 ? 'Today' : d.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small></div>
						{#each d.list.slice(0, 4) as e (e.c.id + e.kind)}
							<button class="ev tint k-{e.kind}" onclick={() => (ui.openCollab = e.c.id)} title="{evLabel(e)} · {e.c.brand.name}"><span class="dt"></span><span>{e.c.brand.name}</span></button>
						{/each}
						{#if d.list.length > 4}<small class="hint">+{d.list.length - 4} more</small>{/if}
						{#if !d.list.length}<span class="none">Free day</span>{/if}
					</div>
				{/each}
			</div>
		</div>
	</section>
	<div class="side-stack">
		<section class="panel glow pipe rv" style="--i:2">
			<div class="pipe-h">
				<div><div class="lbl">Active collabs</div><div class="big" use:countUp={{ value: active.length }}>{active.length}</div></div>
				<a class="btn sm ghost" href="/studio/collabs">Open board<Icon name="arrow" /></a>
			</div>
			<div class="segbar" role="img" aria-label={pipe.map((p) => `${p.n} ${p.st.label}`).join(', ')}>
				{#each pipe as p, i (p.st.id)}{#if p.n}<i class="st-{p.st.id}" style="flex:{p.n};--d:{i}"></i>{/if}{/each}
			</div>
			<ul class="seg-legend">
				{#each pipe as p (p.st.id)}<li class="st-{p.st.id}"><span class="dt"></span>{p.st.label}<b>{p.n}</b></li>{/each}
			</ul>
		</section>
		<section class="panel glow mini rv" style="--i:3">
			<span class="mini-ic tint k-product"><Icon name="gift" /></span>
			<div><div class="lbl">Barter value received</div><div class="big" use:countUp={{ value: barter, money: true }}>{inr(barter)}</div></div>
			<small>{prodGot.length} product{prodGot.length === 1 ? '' : 's'}</small>
		</section>
	</div>
</div>
{/if}
