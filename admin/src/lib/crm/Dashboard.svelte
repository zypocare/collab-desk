<script lang="ts">
	import { untrack } from 'svelte';
	import { ago, inrShort, num, STAGE_LABEL, when } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import Icon from '../Icon.svelte';
	import { recordHref } from './lists.ts';
	import QuotaBars, { quotasOf } from './QuotaBars.svelte';
	import SiteStats from './SiteStats.svelte';

	// How Miracle is doing: key numbers for a period, what's waiting on an admin, both funnels, the collab
	// pipeline, money that moved between brands and creators, system health and the latest events.
	let { onqueue }: { onqueue?: (q: Record<string, number>) => void } = $props();

	type D = Record<string, any>;
	let days = $state(30);
	let d = $state<D | null>(null);
	let quota = $state<D | null>(null);
	let err = $state('');
	let busy = $state(false);

	// The cards at the top also read the website and the Growth Autopilot.
	let site = $state<D | null>(null);
	let grow = $state<D | null>(null);
	async function load() {
		busy = true;
		supabase.rpc('admin_quotas').then(({ data }) => data && (quota = data as D));
		supabase.rpc('admin_site_stats', { p_days: days }).then(({ data }) => data && (site = data as D));
		supabase.rpc('admin_growth').then(({ data }) => data && (grow = data as D));
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
	// The six cards at the top: what each part of Miracle is doing, and where to look closer.
	type Deck = { pill: string; tone: string; kind: string; title: string; meta: string; a: string; aL: string; b: string; bL: string; barL: string; barV: string; pct: number; line: string; foot: string; cta: string; to?: string; scroll?: string };
	const pct = (a: number, b: number) => (b ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);
	const span = $derived(days ? `in the last ${days} days` : 'ever');
	const deck = $derived.by((): Deck[] => {
		if (!d) return [];
		const cf = d.creator_funnel, bf = d.brand_funnel, sw = d.stages ?? {};
		const open = ['request', 'negotiating', 'confirmed', 'creating', 'live'].reduce((a, s) => a + (sw[s]?.n ?? 0), 0);
		const wrapped = sw.wrapped?.n ?? 0;
		const g = grow?.counts ?? {}, gs = grow?.settings ?? {};
		const searching = ((grow?.runs ?? []) as D[]).some((r) => !r.finished_at && r.batch_id);
		const jobs = d.health?.jobs;
		return [
			{ pill: q.signups ? `${num(q.signups)} waiting` : 'All caught up', tone: q.signups ? 't-warn' : 't-ok', kind: 'Creators', title: 'Creator sign-ups', meta: `Asked to join ${span}`, a: num(cf.signed_up), aL: 'Asked to join', b: num(cf.approved), bL: 'Approved', barL: 'Approved', barV: `${pct(Number(cf.approved), Number(cf.signed_up))}%`, pct: pct(Number(cf.approved), Number(cf.signed_up)), line: '#f2994a', foot: q.signups ? `Oldest waiting ${ago(q.signups_oldest)}` : 'Nobody waiting', cta: 'Pipeline', to: href('signups') },
			{ pill: site ? 'Live' : '…', tone: 't-ok', kind: 'Website', title: 'www.miracleapp.live', meta: 'Counted without cookies', a: num(site?.visits), aL: 'Visits', b: num(site?.clicks), bL: 'Join clicks', barL: 'Visits to sign-ups', barV: site && Number(site.visits) ? `${Math.round((Number(site.signups) / Number(site.visits)) * 1000) / 10}%` : '—', pct: site ? pct(Number(site.signups) * 10, Number(site.visits)) : 0, line: '#0b877d', foot: `${num(site?.signups)} sign-ups ${span}`, cta: 'Report', scroll: 'site' },
			{ pill: searching ? 'Searching' : gs.on ? 'On' : 'Off', tone: searching || gs.on ? 't-acc' : 't-mute', kind: 'Growth', title: 'Growth Autopilot', meta: gs.mode === 'auto' ? 'Auto: emails go out by themselves' : 'Approve: emails wait for you', a: num(g.waiting), aL: 'Waiting for you', b: num(g.sent_today), bL: 'Emailed today', barL: 'Claude credit this month', barV: `$${Number(grow?.month_cost ?? 0).toFixed(2)} of $200`, pct: pct(Number(grow?.month_cost ?? 0), 200), line: '#6b3fd4', foot: `${num(g.joined)} joined from invitations`, cta: 'Open', to: href('growth') },
			{ pill: `${num(bf.signed_up)} new`, tone: 't-bad', kind: 'Brands', title: 'Brand funnel', meta: `Brand accounts made ${span}`, a: num(bf.signed_up), aL: 'Signed up', b: num(bf.asked), bL: 'Asked a creator', barL: 'Asked a creator', barV: `${pct(Number(bf.asked), Number(bf.signed_up))}%`, pct: pct(Number(bf.asked), Number(bf.signed_up)), line: '#d4296a', foot: `${num(bf.paid)} paid a creator`, cta: 'Brands', to: href('brand-logins') },
			{ pill: `${num(open)} open`, tone: 't-info', kind: 'Deals', title: 'Collab pipeline', meta: 'Every collab, by stage', a: inrShort(Number(sw.live?.value ?? 0)) === '—' ? '₹0' : inrShort(Number(sw.live?.value ?? 0)), aL: 'Live now', b: inrShort(Number(d.kpis.paid.cur)) === '—' ? '₹0' : inrShort(Number(d.kpis.paid.cur)), bL: `Paid ${span}`, barL: 'Wrapped', barV: `${num(wrapped)} of ${num(open + wrapped)}`, pct: pct(wrapped, open + wrapped), line: '#3a67d8', foot: `${num(sw.request?.n ?? 0)} new requests waiting`, cta: 'Collabs', to: href('collabs') },
			{ pill: jobs?.failed || d.queue.problems_new ? 'Needs a look' : 'All good', tone: jobs?.failed || d.queue.problems_new ? 't-bad' : 't-ok', kind: 'System', title: 'System health', meta: 'Jobs, email, Instagram, problems', a: num(jobs?.runs), aL: 'Jobs in 24 hours', b: num(jobs?.failed), bL: 'Failed', barL: 'Email delivery', barV: d.kpis.emails.cur ? `${100 - pct(Number(d.kpis.emails.failed), Number(d.kpis.emails.cur))}%` : '—', pct: d.kpis.emails.cur ? 100 - pct(Number(d.kpis.emails.failed), Number(d.kpis.emails.cur)) : 0, line: '#1d6b45', foot: `${num(d.health?.outbox_pending)} emails waiting to send`, cta: 'Jobs', to: href('jobs') }
		];
	});
	function scrollTo(id: string) {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	function feedHref(e: D): string | null {
		if (e.link === 'outbox') return null;
		if (e.link === 'ticket') return href('support', e.id);
		return recordHref(e.link, e.id);
	}
</script>

<div class="db">
	<header class="db-h">
		<div class="db-t">
			<h1>Overview</h1>
			{#if d}
				<div class="dots">
					<span style:color="#1d6b45">● <b>{num(d.kpis.creators.now)}</b> active creator{d.kpis.creators.now === 1 ? '' : 's'}</span>
					<span style:color="#f2994a">● <b>{num(q.signups)}</b> waiting</span>
					<span style:color="#6b3fd4">● <b>{num(d.kpis.brand_logins.now)}</b> brand logins</span>
					<span style:color="#3a67d8">● <b>{num(d.kpis.collabs.cur)}</b> collabs started {days ? `in ${days} days` : ''}</span>
					<span style:color="#b4600a">● <b>{num(d.kpis.ai.today)}</b> AI calls today</span>
				</div>
			{/if}
		</div>
		<div class="db-acts">
			{#if busy}<span class="spinner muted"></span>{/if}
			<div class="seg" role="group" aria-label="Period">
				{#each RANGES as [v, name] (v)}<button class:on={days === v} aria-pressed={days === v} onclick={() => (days = v)}>{name}</button>{/each}
			</div>
			<button class="btn" onclick={load}><Icon name="refresh" />Refresh</button>
			<a class="btn pri" href={href('growth')}><Icon name="search" />Find creators</a>
		</div>
	</header>

	{#if err}<p class="err">{err}</p>{/if}

	{#if !d}
		<div class="ld"><span class="spinner"></span></div>
	{:else}
		<section class="deck" aria-label="Miracle at a glance">
			{#each deck as c (c.title)}
				<article class="card lift dk" style:border-bottom-color={c.line}>
					<div class="dk-top"><span class="tag {c.tone}"><i class="pd"></i>{c.pill}</span><span class="dk-k">{c.kind}</span></div>
					<div class="dk-t"><h2>{c.title}</h2><span>{c.meta}</span></div>
					<div class="dk-s"><div><b>{c.a}</b><small>{c.aL}</small></div><div><b>{c.b}</b><small>{c.bL}</small></div></div>
					<div class="dk-p"><div><span>{c.barL}</span><b>{c.barV}</b></div><span class="dk-bar"><i style:width="{c.pct}%" style:background={c.line}></i></span></div>
					<div class="dk-f"><span>{c.foot}</span>{#if c.to}<a href={c.to}>{c.cta} ›</a>{:else if c.scroll}<button class="lnk" onclick={() => scrollTo(c.scroll!)}>{c.cta} ›</button>{/if}</div>
				</article>
			{/each}
		</section>

		<div id="site">
		<SiteStats {days} />
		</div>

		{#if quota}
			<section class="card">
				<div class="card-h"><h2 class="card-t">Daily quotas</h2><a href={href('quotas')}>Details and limits</a></div>
				<QuotaBars quotas={quotasOf(quota)} />
			</section>
		{/if}

		<div class="two">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Needs you</h2></div>
				<a class="qrow" href={href('signups')}><span class="tag {q.signups ? 't-warn' : 't-ok'} n">{num(q.signups)}</span><span class="qt"><b>Creator sign-ups waiting</b><small>{q.signups ? `oldest asked ${ago(q.signups_oldest)}` : 'All caught up'}</small></span><Icon name="arrow" /></a>
				<a class="qrow" href={href('support')}><span class="tag {q.support ? 't-bad' : 't-ok'} n">{num(q.support)}</span><span class="qt"><b>Support tickets open</b><small>{num(q.support_urgent)} urgent · {num(q.support_unread)} unread</small></span><Icon name="arrow" /></a>
				<a class="qrow" href={href('safety')}><span class="tag {q.safety ? 't-bad' : 't-ok'} n">{num(q.safety)}</span><span class="qt"><b>Accounts with open reports</b><small>{num(q.safety_paused)} paused by themselves</small></span><Icon name="arrow" /></a>
				<a class="qrow" href={href('outbox')}><span class="tag {q.emails_failed ? 't-warn' : 't-ok'} n">{num(q.emails_failed)}</span><span class="qt"><b>Emails failed this week</b><small>Send them again or skip them in the outbox</small></span><Icon name="arrow" /></a>
				<a class="qrow" href={href('problems')}><span class="tag {q.problems_new ? 't-info' : 't-ok'} n">{num(q.problems_new)}</span><span class="qt"><b>New problems today</b><small>{num(q.problems_open)} open in all</small></span><Icon name="arrow" /></a>
				<a class="qrow" href={href('instagram')}><span class="tag {q.ig_expiring ? 't-warn' : 't-ok'} n">{num(q.ig_expiring)}</span><span class="qt"><b>Instagram logins expiring in 7 days</b><small>Creators get a reconnect alert</small></span><Icon name="arrow" /></a>
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
							<a class="sg" href={href('collabs')}><span class="sl"><i style:background={STAGE_COLOR[s.s]}></i>{STAGE_LABEL[s.s]}</span><b class="mono">{num(s.n)}</b><small class="mono muted">{inrShort(s.value)}</small></a>
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
	.db-h { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 14px; }
	.db-t { display: grid; gap: 8px; }
	h1 { font-size: 28px; font-weight: 800; letter-spacing: -.02em; }
	.dots { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; font-weight: 500; }
	.dots b { color: var(--ink); }
	.deck { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 18px; }
	.dk { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; border-bottom: 3px solid; }
	.dk-top { display: flex; align-items: center; gap: 10px; }
	.dk-top .pd { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
	.dk-k { font-size: 13.5px; font-weight: 600; color: var(--ink-3); }
	.dk-t { display: grid; gap: 4px; }
	.dk-t h2 { font-size: 19px; font-weight: 700; }
	.dk-t span { font-size: 13px; color: var(--ink-3); }
	.dk-s { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface-2); }
	.dk-s > div { display: grid; gap: 2px; padding: 12px 14px; min-width: 0; }
	.dk-s > div + div { border-left: 1px solid var(--line-soft); }
	.dk-s b { font-size: 22px; font-weight: 800; letter-spacing: -.02em; }
	.dk-s small { font-size: 12.5px; color: var(--ink-3); }
	.dk-p { display: grid; gap: 8px; }
	.dk-p > div { display: flex; justify-content: space-between; font-size: 12.5px; color: var(--ink-3); }
	.dk-p b { color: var(--ink); }
	.dk-bar { height: 6px; border-radius: 6px; background: #eeeaf1; overflow: hidden; }
	.dk-bar i { display: block; height: 100%; border-radius: 6px; min-width: 2px; }
	.dk-f { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; color: var(--ink-3); padding-top: 2px; }
	.dk-f a, .dk-f .lnk { font-weight: 700; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
	#site { scroll-margin-top: 80px; }
	.db-acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
	.seg { display: inline-flex; padding: 3px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); }
	.seg button { height: 32px; padding: 0 12px; border: 0; border-radius: 8px; background: none; font-size: 13px; font-weight: 600; color: var(--ink-3); }
	.seg button.on { background: var(--ink); color: #fff; }
	.ld { padding: 60px; display: grid; place-items: center; }
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
	.sg { display: grid; gap: 1px; padding: 9px 11px; border: 1px solid var(--line-soft); border-radius: 8px; color: var(--ink); }
	a.sg:hover { border-color: var(--line-strong); text-decoration: none; color: var(--ink); }
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
