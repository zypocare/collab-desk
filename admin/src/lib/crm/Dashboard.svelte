<script lang="ts">
	import { untrack } from 'svelte';
	import { ago, inrShort, num, STAGE_LABEL, when } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import Icon from '../Icon.svelte';
	import { recordHref } from './lists.ts';

	// How Miracle is doing: key numbers for a period, what's waiting on an admin, both funnels, the collab
	// pipeline, money that moved between brands and creators, system health and the latest events.
	let { onqueue }: { onqueue?: (q: Record<string, number>) => void } = $props();

	type D = Record<string, any>;
	let days = $state(30);
	let d = $state<D | null>(null);
	let err = $state('');
	let busy = $state(false);

	async function load() {
		busy = true;
		const { data, error } = await supabase.rpc('admin_dashboard', { p_days: days });
		busy = false;
		err = error ? errMessage(error) : '';
		if (error) return;
		d = data as D;
		onqueue?.(d.queue);
	}
	$effect(() => {
		void days;
		untrack(load);
	});

	const RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [0, 'All time']] as const;
	const period = $derived(days ? `vs the ${days} days before` : 'since launch');
	function delta(cur: number, prev: number | undefined): [string, string] {
		if (!days || prev === undefined) return ['', 't-mute'];
		if (!prev) return cur ? ['new', 't-ok'] : ['—', 't-mute'];
		const p = Math.round(((cur - prev) / prev) * 100);
		return [`${p >= 0 ? '+' : ''}${p}%`, p > 0 ? 't-ok' : p < 0 ? 't-bad' : 't-mute'];
	}
	const dl = $derived(
		d
			? { collabs: delta(d.kpis.collabs.cur, d.kpis.collabs.prev), paid: delta(Number(d.kpis.paid.cur), Number(d.kpis.paid.prev)), ai: delta(Number(d.kpis.ai.cur), Number(d.kpis.ai.prev)) }
			: { collabs: ['', ''], paid: ['', ''], ai: ['', ''] }
	);
	const q = $derived(d?.queue ?? {});
	const h = $derived(d?.health ?? {});
	const STAGES = ['request', 'negotiating', 'confirmed', 'creating', 'live', 'wrapped', 'paused', 'cancelled', 'declined'];
	const STAGE_COLOR: Record<string, string> = {
		request: '#b9b1bf', negotiating: '#e9b949', confirmed: '#7e9ce0', creating: '#5b34c4', live: '#c2416f', wrapped: '#1d6b45', paused: '#8e8594', cancelled: '#a3241a', declined: '#d5d0c8'
	};
	const stages = $derived(d ? STAGES.filter((s) => d!.stages[s]).map((s) => ({ s, ...d!.stages[s] })) : []);
	const stageTotal = $derived(stages.reduce((a, x) => a + x.n, 0) || 1);
	const weekMax = $derived(d ? Math.max(1, ...d.weeks.map((w: D) => Number(w.paid))) : 1);
	function funnel(f: D, keys: [string, string][]) {
		const top = Number(f[keys[0][0]]) || 0;
		return keys.map(([k, name], i) => {
			const n = Number(f[k]) || 0;
			const prev = i ? Number(f[keys[i - 1][0]]) || 0 : 0;
			return { name, n, pct: top ? Math.round((n / top) * 100) : 0, conv: i && prev ? Math.round((n / prev) * 100) + '%' : '' };
		});
	}
	const FEED_TAG: Record<string, [string, string]> = {
		admin: ['Admin', 't-mute'], collab: ['Collab', 't-acc'], signup: ['Sign-up', 't-warn'], email: ['Email', 't-bad'], support: ['Support', 't-info']
	};
	function feedHref(e: D): string | null {
		if (e.link === 'outbox') return null;
		if (e.link === 'ticket') return href('support');
		return recordHref(e.link, e.id);
	}
</script>

<div class="db">
	<header class="db-h">
		<div>
			<div class="eb">Overview</div>
			<h1>Dashboard</h1>
		</div>
		<div class="db-acts">
			{#if busy}<span class="spinner muted"></span>{/if}
			<div class="seg" role="group" aria-label="Period">
				{#each RANGES as [v, name] (v)}<button class:on={days === v} aria-pressed={days === v} onclick={() => (days = v)}>{name}</button>{/each}
			</div>
			<button class="btn" onclick={load}><Icon name="refresh" />Refresh</button>
		</div>
	</header>

	{#if err}<p class="err">{err}</p>{/if}

	{#if !d}
		<div class="ld"><span class="spinner"></span></div>
	{:else}
		{@const k = d.kpis}
		<section class="kpis" aria-label="Key numbers">
			<a class="card kpi" href={href('creators')}>
				<small>Active creators</small><b class="mono">{num(k.creators.now)}</b>
				<span><span class="tag t-ok">+{num(k.creators.cur)}</span> approved {days ? `in ${days} days` : 'in all'}</span>
			</a>
			<a class="card kpi" href={href('brand-logins')}>
				<small>Brand logins</small><b class="mono">{num(k.brand_logins.now)}</b>
				<span><span class="tag t-ok">+{num(k.brand_logins.cur)}</span> new {days ? `in ${days} days` : ''}</span>
			</a>
			<div class="card kpi">
				<small>Collabs started</small><b class="mono">{num(k.collabs.cur)}</b>
				<span>{#if dl.collabs[0]}<span class="tag {dl.collabs[1]}">{dl.collabs[0]}</span>{/if} {period}</span>
			</div>
			<div class="card kpi">
				<small>Paid brand → creator</small><b class="mono">{inrShort(k.paid.cur) === '—' ? '₹0' : inrShort(k.paid.cur)}</b>
				<span>{#if dl.paid[0]}<span class="tag {dl.paid[1]}">{dl.paid[0]}</span>{/if} direct, no cut</span>
			</div>
			<div class="card kpi">
				<small>Emails sent</small><b class="mono">{num(k.emails.cur)}</b>
				<span>{#if k.emails.failed}<span class="tag t-bad">{num(k.emails.failed)} failed</span>{:else}<span class="tag t-ok">none failed</span>{/if}</span>
			</div>
			<div class="card kpi">
				<small>AI calls</small><b class="mono">{num(k.ai.cur)}</b>
				<span>{#if dl.ai[0]}<span class="tag {dl.ai[1]}">{dl.ai[0]}</span>{/if} {num(k.ai.today)} today</span>
			</div>
		</section>

		<div class="two">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Needs you</h2></div>
				<a class="qrow" href={href('signups')}><span class="tag {q.signups ? 't-warn' : 't-ok'} n">{num(q.signups)}</span><span class="qt"><b>Creator sign-ups waiting</b><small>{q.signups ? `oldest asked ${ago(q.signups_oldest)}` : 'All caught up'}</small></span><Icon name="arrow" /></a>
				<a class="qrow" href={href('support')}><span class="tag {q.support ? 't-bad' : 't-ok'} n">{num(q.support)}</span><span class="qt"><b>Support tickets open</b><small>{num(q.support_urgent)} urgent · {num(q.support_unread)} unread</small></span><Icon name="arrow" /></a>
				<a class="qrow" href={href('safety')}><span class="tag {q.safety ? 't-bad' : 't-ok'} n">{num(q.safety)}</span><span class="qt"><b>Accounts with open reports</b><small>{num(q.safety_paused)} paused by themselves</small></span><Icon name="arrow" /></a>
				<div class="qrow"><span class="tag {q.emails_failed ? 't-warn' : 't-ok'} n">{num(q.emails_failed)}</span><span class="qt"><b>Emails failed this week</b><small>Retry and skip arrive with the Controls phase</small></span></div>
				<a class="qrow" href={href('problems')}><span class="tag {q.problems_new ? 't-info' : 't-ok'} n">{num(q.problems_new)}</span><span class="qt"><b>New problems today</b><small>{num(q.problems_open)} open in all</small></span><Icon name="arrow" /></a>
				<div class="qrow"><span class="tag {q.ig_expiring ? 't-warn' : 't-ok'} n">{num(q.ig_expiring)}</span><span class="qt"><b>Instagram logins expiring in 7 days</b><small>Creators get a reconnect alert</small></span></div>
			</section>

			<section class="card">
				<div class="card-h"><h2 class="card-t">Creator funnel</h2><span class="muted sm">signed up {days ? `in the last ${days} days` : 'ever'}</span></div>
				<div class="fun">
					{#each funnel(d.creator_funnel, [['signed_up', 'Asked to join'], ['approved', 'Approved'], ['instagram', 'Instagram linked'], ['collab', 'First collab'], ['paid', 'First paid invoice']]) as s (s.name)}
						<div class="fr"><span>{s.name}</span><span class="bar"><span style:width="{s.pct}%" style:background="#5b34c4"></span></span><span class="mono r">{num(s.n)} <small class="muted">{s.conv}</small></span></div>
					{/each}
				</div>
			</section>
		</div>

		<div class="two">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Brand funnel</h2><span class="muted sm">brand accounts made {days ? `in the last ${days} days` : 'ever'}</span></div>
				<div class="fun">
					{#each funnel(d.brand_funnel, [['signed_up', 'Signed up'], ['company', 'Has a company'], ['asked', 'Asked a creator'], ['accepted', 'Accepted a quote'], ['paid', 'Paid a creator']]) as s (s.name)}
						<div class="fr"><span>{s.name}</span><span class="bar"><span style:width="{s.pct}%" style:background="#c2416f"></span></span><span class="mono r">{num(s.n)} <small class="muted">{s.conv}</small></span></div>
					{/each}
				</div>
			</section>

			<section class="card">
				<div class="card-h"><h2 class="card-t">Collab pipeline</h2><span class="muted sm">every collab, by stage</span></div>
				<div class="card-b">
					<div class="stack" aria-hidden="true">{#each stages as s (s.s)}<span style:width="{(s.n / stageTotal) * 100}%" style:background={STAGE_COLOR[s.s]}></span>{/each}</div>
					<div class="stg">
						{#each stages as s (s.s)}
							<div class="sg"><span class="sl"><i style:background={STAGE_COLOR[s.s]}></i>{STAGE_LABEL[s.s]}</span><b class="mono">{num(s.n)}</b><small class="mono muted">{inrShort(s.value)}</small></div>
						{/each}
					</div>
				</div>
			</section>
		</div>

		<div class="two">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Paid brand → creator, by week</h2><span class="muted sm">invoices marked paid · Miracle takes no cut</span></div>
				<div class="weeks">
					{#each d.weeks as w (w.week)}
						<div class="wk" title="{inrShort(Number(w.paid))} in the week of {w.week}"><span class="wb" style:height="{Math.max(2, (Number(w.paid) / weekMax) * 100)}%"></span><small class="mono muted">{new Date(w.week).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small></div>
					{/each}
				</div>
			</section>

			<section class="card">
				<div class="card-h"><h2 class="card-t">System health</h2></div>
				<div class="hrow"><i class:ok={!h.outbox_pending || (h.outbox_last_sent && Date.now() - new Date(h.outbox_last_sent).getTime() < 36e5)}></i><span>Outbox</span><span class="mono muted">last sent {ago(h.outbox_last_sent)} · {num(h.outbox_pending)} waiting</span></div>
				<div class="hrow"><i class:ok={!h.ig_errors} class:warn={h.ig_errors}></i><span>Instagram sync</span><span class="mono muted">{h.ig_last_sync ? 'last ' + ago(h.ig_last_sync) : 'no accounts'} · {num(h.ig_errors)} with errors</span></div>
				<div class="hrow"><i class:ok={h.jobs && !h.jobs.failed} class:bad={h.jobs?.failed}></i><span>Scheduled jobs (24 hours)</span><span class="mono muted">{h.jobs ? `${num(h.jobs.runs)} runs · ${num(h.jobs.failed)} failed` : 'not readable'}</span></div>
				<div class="hrow"><i class:ok={!d.queue.problems_open} class:bad={d.queue.problems_new}></i><span>App problems</span><span class="mono muted">{num(d.queue.problems_open)} open · {num(d.queue.problems_new)} new today</span></div>
				<div class="hrow"><i class:ok={!d.kpis.emails.failed} class:warn={d.kpis.emails.failed}></i><span>Email delivery</span><span class="mono muted">{num(d.kpis.emails.failed)} failed {days ? `in ${days} days` : ''}</span></div>
			</section>
		</div>

		<section class="card">
			<div class="card-h"><h2 class="card-t">Latest across Miracle</h2><a href={href('audit')}>Audit trail</a></div>
			{#if !d.feed.length}<div class="card-empty">Nothing yet.</div>{/if}
			{#each d.feed as e, i (i)}
				{@const t = FEED_TAG[e.kind] ?? ['Event', 't-mute']}
				{@const to = feedHref(e)}
				<div class="frow"><span class="mono muted fa">{when(e.at)}</span><span class="tag {t[1]} ft">{t[0]}</span>{#if to}<a href={to} class="fx">{e.text}</a>{:else}<span class="fx">{e.text}</span>{/if}</div>
			{/each}
		</section>
	{/if}
</div>

<style>
	.db { display: flex; flex-direction: column; gap: 16px; }
	.db-h { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.db-acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
	.seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 7px; overflow: hidden; background: var(--surface); }
	.seg button { height: 32px; padding: 0 12px; border: 0; background: none; font-size: 13px; font-weight: 500; color: var(--ink-2); }
	.seg button.on { background: var(--ink); color: #fff; }
	.ld { padding: 60px; display: grid; place-items: center; }
	.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
	.kpi { padding: 14px 16px; display: flex; flex-direction: column; gap: 5px; color: var(--ink); }
	a.kpi:hover { border-color: var(--line-strong); text-decoration: none; color: var(--ink); }
	.kpi small { font-size: 12.5px; color: var(--ink-3); }
	.kpi b { font-size: 25px; font-weight: 500; letter-spacing: -.02em; }
	.kpi > span { font-size: 12px; color: var(--ink-3); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 16px; }
	.sm { font-size: 12px; }
	.qrow { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-top: 1px solid var(--line-soft); color: var(--ink); font-size: 13.5px; }
	a.qrow:hover { background: var(--surface-2); text-decoration: none; color: var(--ink); }
	.qrow .n { min-width: 36px; justify-content: center; font-family: var(--f-mono); }
	.qrow :global(.ic) { color: var(--ink-3); }
	.qt { flex: 1; min-width: 0; display: grid; }
	.qt b { font-weight: 500; }
	.qt small { font-size: 12px; color: var(--ink-3); }
	.fun { padding: 14px 16px 16px; display: grid; gap: 11px; }
	.fr { display: grid; grid-template-columns: 136px 1fr 84px; gap: 12px; align-items: center; font-size: 13px; }
	.bar { height: 20px; background: #f1efeb; border-radius: 4px; overflow: hidden; }
	.bar span { display: block; height: 100%; border-radius: 4px; min-width: 2px; }
	.r { text-align: right; }
	.stack { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: #f1efeb; margin-bottom: 14px; }
	.stg { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
	.sg { display: grid; gap: 1px; padding: 9px 11px; border: 1px solid var(--line-soft); border-radius: 8px; }
	.sl { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
	.sl i { width: 8px; height: 8px; border-radius: 2px; }
	.sg b { font-size: 17px; font-weight: 500; }
	.sg small { font-size: 11.5px; }
	.weeks { display: flex; align-items: flex-end; gap: 6px; height: 180px; padding: 16px; }
	.wk { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; min-width: 0; }
	.wb { width: 100%; max-width: 30px; background: #dcd3f6; border-top: 2px solid var(--accent); border-radius: 3px 3px 0 0; }
	.wk small { font-size: 10px; white-space: nowrap; }
	.hrow { display: grid; grid-template-columns: 10px 1fr auto; gap: 12px; align-items: center; padding: 10px 16px; border-top: 1px solid var(--line-soft); font-size: 13px; }
	.hrow i { width: 9px; height: 9px; border-radius: 50%; background: var(--line-strong); }
	.hrow i.ok { background: var(--ok); }
	.hrow i.warn { background: #e9b949; }
	.hrow i.bad { background: var(--bad); }
	.hrow .mono { font-size: 12px; text-align: right; }
	.frow { display: grid; grid-template-columns: 92px 76px 1fr; gap: 12px; align-items: center; padding: 9px 16px; border-top: 1px solid var(--line-soft); font-size: 13px; }
	.fa { font-size: 11.5px; }
	.ft { justify-content: center; }
	.fx { min-width: 0; overflow-wrap: anywhere; color: var(--ink); }
	a.fx:hover { color: var(--accent); }
	@media (max-width: 560px) {
		.fr { grid-template-columns: 1fr 70px; }
		.fr .bar { grid-column: 1 / -1; order: 3; }
		.frow { grid-template-columns: 76px 1fr; }
		.frow .fa { grid-column: 1 / -1; }
		.hrow { grid-template-columns: 10px 1fr; }
		.hrow .mono { grid-column: 2; text-align: left; }
	}
</style>
