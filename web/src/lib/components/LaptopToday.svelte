<script lang="ts">
	import { receivedIn } from '../invoice';
	import { askPaid, completeFollow, markPaid, markReceived, priorityOf, studio } from '../studio.svelte';
	import { countUp, ui } from '../ui.svelte';
	import {
		STAGES,
		TYPE_LABEL,
		delivText,
		diff,
		evLabel,
		events,
		firstName,
		fmt,
		hueOf,
		inTransit,
		initials,
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
		stageLabel,
		tasks,
		today,
		type Task
	} from '../util';
	import AiDesk from './AiDesk.svelte';
	import AlertsPrompt from './AlertsPrompt.svelte';
	import AwayMode from './AwayMode.svelte';
	import BrandQuestions from './BrandQuestions.svelte';
	import Icon from './Icon.svelte';
	import NudgeList from './NudgeList.svelte';
	import Ticket from './Ticket.svelte';

	// Today on a laptop, in the same look as the phone: greeting in serif, story rings, the moving line
	// of numbers, the money card next to Desk AI, Needs you as tickets beside the week, and the pipeline.
	const s = $derived(studio.settings!);
	const list = $derived(studio.collabs);
	const T = today();
	const hour = new Date().getHours();
	const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
	const monthName = T.toLocaleDateString('en-IN', { month: 'long' });
	const ym = iso(T).slice(0, 7);

	const ts = $derived.by(() => {
		const all = tasks(list);
		const ranked = all.filter((t) => t.kind === 'new').sort((a, b) => (priorityOf(b.c)?.score ?? 0) - (priorityOf(a.c)?.score ?? 0));
		let n = 0;
		return all.map((t) => (t.kind === 'new' ? ranked[n++] : t));
	});
	const urgent = $derived(ts.filter((t) => t.d <= 0).length);
	const active = $derived(list.filter(isActive));

	// Money
	const received = $derived(list.reduce((a, c) => a + receivedIn(c, ym), 0));
	const goal = $derived(Math.max(0, s.monthly_goal || 0));
	const pctN = $derived(goal ? Math.round((received / goal) * 100) : 0);
	const ring = $derived(Math.min(1, goal ? received / goal : 0));
	const outs = $derived(list.reduce((a, c) => a + outstanding(c), 0));
	const od = $derived(list.filter(overdue).reduce((a, c) => a + outstanding(c), 0));
	const paidN = $derived(new Set(list.filter((c) => receivedIn(c, ym) > 0).map((c) => c.brand_id)).size);
	const nextPayout = $derived(
		list.filter((c) => isPaid(c) && c.pay_status !== 'paid' && c.pay_due && diff(c.pay_due) >= 0).sort((a, b) => parse(a.pay_due!).getTime() - parse(b.pay_due!).getTime())[0]
	);

	// Story rings: who needs her first, then the rest of what's active.
	const need = $derived([...new Map(ts.map((t) => [t.c.id, t])).values()]);
	const rest = $derived(active.filter((c) => !need.some((t) => t.c.id === c.id)));
	const rings = $derived([...need.map((t) => ({ c: t.c, hot: true })), ...rest.map((c) => ({ c, hot: false }))].slice(0, 12));

	// The moving line of numbers.
	const ticker = $derived(
		[
			received > 0 && { b: inrS(received), t: ` came in this ${monthName}` },
			urgent > 0 && { b: String(urgent), t: ' due today' },
			list.filter((c) => c.stage === 'request').length > 0 && { b: String(list.filter((c) => c.stage === 'request').length), t: ' new requests waiting' },
			outs > 0 && { b: inrS(outs), t: ' still to come in' },
			goal > 0 && { b: `${pctN}%`, t: ` of the ${inrS(goal)} goal` },
			active.length > 0 && { b: String(active.length), t: ` active collab${active.length === 1 ? '' : 's'}` },
			nextPayout && { b: nextPayout.brand.name, t: ` pays next, ${fmt(nextPayout.pay_due!)}` }
		].filter((x): x is { b: string; t: string } => !!x)
	);

	// Needs you: four tickets, then "+N more".
	let fanned = $state(false);
	let leaving = $state<string | null>(null);
	function leaveThen(key: string, fn: () => void) {
		leaving = key;
		setTimeout(() => {
			fn();
			leaving = null;
		}, 380);
	}
	const hot = (t: Task) => t.kind === 'pay' || t.kind === 'msg' || t.d < 0 || (t.kind === 'new' && diff(t.c.received_on) <= -1);
	const ticketMoney = (t: Task) => (t.c.type === 'barter' ? (t.c.product_value ? inrS(t.c.product_value) : 'Barter') : t.c.fee ? inrS(t.c.fee) : 'Quote');
	const when = (t: Task) => {
		if (t.kind === 'msg') return 'waiting for your reply';
		if (t.kind === 'new') return `received ${relWord(diff(t.c.received_on))}`;
		if (t.kind === 'pay' || t.d < 0) return `${-t.d} day${-t.d > 1 ? 's' : ''} late`;
		return t.d === 0 ? 'today' : relWord(t.d);
	};

	// This week
	const evs = $derived(events(list));
	const week = $derived(Array.from({ length: 7 }, (_, i) => ({ i, dt: parse(rel(i)), list: evs.filter((e) => e.date === rel(i)) })));
	let pick = $state(0);
	const picked = $derived(week[pick]);
	const KIND_WORD: Record<string, string> = { shoot: 'Shoot', draft: 'Draft due', live: 'Goes live', pay: 'Payment due', follow: 'Follow-up', product: 'Product arrives' };
	const weekN = $derived(week.reduce((a, d) => a + d.list.length, 0));
	const busiest = $derived([...week].sort((a, b) => b.list.length - a.list.length)[0]);
	const dayName = (d: Date, i: number) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'long' }));
	const NUM = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

	// Pipeline as capsules.
	const PH: Record<string, string> = { request: 'var(--h-request)', negotiating: 'var(--h-nego)', confirmed: 'var(--h-confirmed)', creating: 'var(--h-creating)', live: 'var(--h-live)' };
	const pipe = $derived(STAGES.slice(0, 5).map((st) => ({ st, n: list.filter((c) => c.stage === st.id).length, v: list.filter((c) => c.stage === st.id).reduce((a, c) => a + (Number(c.fee) || 0), 0) })));
	const pipeMax = $derived(Math.max(1, ...pipe.map((p) => p.n)));
	const pipeTotal = $derived(pipe.reduce((a, p) => a + p.v, 0));
</script>

<div class="lt">
	<header class="lt-h">
		<div class="lt-hi">
			<span class="lt-eb">{T.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{urgent ? ` · ${urgent} due today` : ' · nothing urgent'}</span>
			<h1>{greet}, <em>{firstName(s.display_name)}</em></h1>
		</div>
		<button class="lt-search" onclick={() => (ui.searchOpen = true)}><Icon name="search" /><span>Search collabs, brands or actions</span><kbd>Ctrl K</kbd></button>
		<button class="lt-btn grad" onclick={() => (ui.newCollab = true)}><Icon name="plus" />New collab</button>
	</header>

	{#if rings.length}
		<nav class="lt-rings" aria-label="Collabs that need you">
			<button class="lt-ring me" onclick={() => (ui.newCollab = true)}><span class="r"><b>+</b></span><small>New collab</small></button>
			{#each rings as r (r.c.id)}
				<a class="lt-ring" class:seen={!r.hot} href="/studio/c/{r.c.code}" title={r.c.brand.name}>
					<span class="r"><b style="--h:var(--m{hueOf(r.c.brand.name)})">{initials(r.c.brand.name)}</b></span>
					<small>{r.c.brand.name}</small>
				</a>
			{/each}
		</nav>
	{/if}

	{#if ticker.length > 1}
		<div class="cr-ticker cr-tk lt-tk" aria-label="Today in numbers"><div>{#each [0, 1] as k (k)}{#each ticker as f, j (j)}<span aria-hidden={k === 1}><b>{f.b}</b>{f.t}</span><i aria-hidden="true">✦</i>{/each}{/each}</div></div>
	{/if}

	<AwayMode banner />
	<AlertsPrompt />

	<div class="lt-row">
		<section class="lt-money" aria-label="Money this month">
			<div class="lt-mt"><span>Received in {monthName}</span>{#if goal}<a href="/studio/settings?s=payments">Goal {inrS(goal)}</a>{/if}</div>
			<div class="lt-mm">
				<div class="lt-big">
					<b use:countUp={{ value: received, money: true }}>{inr(received)}</b>
					<small>from {paidN} brand{paidN === 1 ? '' : 's'}{#if goal}{' · '}<strong>{pctN}%</strong> of this month's goal{/if}</small>
				</div>
				{#if goal}
					<div class="lt-goal">
						<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="ltGoal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--g1)" /><stop offset=".55" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g3)" /></linearGradient></defs><circle cx="60" cy="60" r="50" class="tr" /><circle cx="60" cy="60" r="50" class="pr" pathLength="100" style="stroke-dasharray:{Math.round(ring * 100)} 100" /></svg>
						<span><b>{pctN}%</b><small>of goal</small></span>
					</div>
				{/if}
			</div>
			<div class="lt-mini">
				<a href="/studio/payments"><small>Still to come</small><b>{inr(outs)}</b></a>
				<a href="/studio/payments" class:bad={od > 0}><small>Overdue</small><b>{inr(od)}</b></a>
				<a href="/studio/payments"><small>Next payout</small><b class="t">{nextPayout ? `${nextPayout.brand.name} · ${fmt(nextPayout.pay_due)}` : 'None scheduled'}</b></a>
			</div>
		</section>
		<div class="lt-ai"><AiDesk phone /></div>
	</div>

	<div class="lt-row">
		<section class="lt-col">
			<header class="lt-sh"><h2>Needs you</h2>{#if ts.length}<i class="lt-n">{ts.length}</i>{/if}<a href="/studio/collabs">Board</a></header>
			{#if ts.length}
				<div class="tks lt-tks">
					{#each fanned ? ts : ts.slice(0, 4) as t, i (t.c.id + t.kind)}
						{@const key = t.c.id + t.kind}
						<Ticket name={t.c.brand.name} sub={stageLabel(t.c.stage)} money={ticketMoney(t)} moneySub={delivText(t.c.deliverables) || TYPE_LABEL[t.c.type]} task={t.title} status={when(t)} tone={hot(t) ? 'hot' : 'warn'} href="/studio/c/{t.c.code}" leaving={leaving === key} {i}>
							{#if t.kind === 'follow'}
								<button class="lt-btn" onclick={() => leaveThen(key, () => completeFollow(t.c))}>Done</button>
							{:else if t.kind === 'pay'}
								<button class="lt-btn ink" onclick={async () => (await askPaid(t.c)) && leaveThen(key, () => markPaid(t.c, false, true))}>Mark paid</button>
							{:else if t.kind === 'product' && inTransit(t.c)}
								<button class="lt-btn" onclick={() => leaveThen(key, () => markReceived(t.c))}>Received</button>
							{:else if t.kind === 'msg'}
								<a class="lt-btn grad" href="/studio/inbox/{t.c.code}">Reply</a>
							{:else}
								<a class="lt-btn grad" href="/studio/c/{t.c.code}">{t.kind === 'new' ? 'Review' : 'Open'}</a>
							{/if}
						</Ticket>
					{/each}
				</div>
				{#if ts.length > 4}<button class="cr-more lt-more" onclick={() => (fanned = !fanned)}>{fanned ? 'Show less' : `+${ts.length - 4} more`}</button>{/if}
			{:else}
				<div class="lt-clear"><b>You're all caught up</b><small>New requests, payments and follow-ups land here.</small></div>
			{/if}
		</section>

		<div class="lt-col">
		<section class="lt-col wk2">
			<header class="lt-sh"><h2>This week</h2><a href="/studio/calendar">Calendar</a></header>
			<div class="lt-card">
				<p class="wk2-say">
					{#if weekN}{NUM[weekN] ?? weekN} thing{weekN === 1 ? '' : 's'} this week.{#if busiest.list.length > 1}{' '}<em>{dayName(busiest.dt, busiest.i)}</em> is the big one.{/if}{:else}A free week. <em>Make it count.</em>{/if}
				</p>
				<div class="wk2-days" role="group" aria-label="Pick a day">
					{#each week as d (d.i)}
						<button class="wk2-d" class:now={d.i === 0} class:on={d.i === pick} onclick={() => (pick = d.i)} aria-pressed={d.i === pick} aria-label="{dayName(d.dt, d.i)}, {d.list.length} things">
							<small>{d.i === 0 ? 'Today' : d.dt.toLocaleDateString('en-IN', { weekday: 'short' })}</small>
							<b>{d.dt.getDate()}</b>
							<span class="wk2-dots">{#each d.list.slice(0, 3) as e (e.c.id + e.kind)}<i class="k-{e.kind}"></i>{/each}</span>
						</button>
					{/each}
				</div>
				{#key pick}
					<div class="lt-day">
						<div class="wk2-day-h"><b>{dayName(picked.dt, picked.i)}</b><small>{picked.list.length ? `${picked.list.length} thing${picked.list.length === 1 ? '' : 's'}` : 'Free'}</small></div>
						{#if picked.list.length}
							<ul class="wk2-tl">
								{#each picked.list as e (e.c.id + e.kind)}
									<li class="k-{e.kind}"><a href="/studio/c/{e.c.code}"><span class="wk2-node" aria-hidden="true"></span><span class="wk2-ev"><em>{KIND_WORD[e.kind] ?? evLabel(e)}</em><b>{e.c.brand.name}{delivText(e.c.deliverables) ? ` · ${delivText(e.c.deliverables)}` : ''}</b><small>{e.kind === 'pay' ? `${inr(outstanding(e.c))} to come in` : stageLabel(e.c.stage)}</small></span></a></li>
								{/each}
							</ul>
						{:else}
							<p class="wk2-free">Nothing booked. A good day to plan content or pitch a dream brand.</p>
						{/if}
					</div>
				{/key}
			</div>
		</section>
		<section class="lt-col lt-sub">
			<header class="lt-sh"><h2>Pipeline · {inrS(pipeTotal)} in play</h2><a href="/studio/collabs">Open board</a></header>
			<div class="lt-card lt-pipe">
				{#each pipe as p (p.st.id)}
					<a href="/studio/collabs" style="--c:{PH[p.st.id]};--p:{Math.max(6, Math.round((p.n / pipeMax) * 100))}%">
						<b>{p.n}</b>
						<span class="bar"><i></i></span>
						<small>{p.st.label}</small>
					</a>
				{/each}
			</div>
		</section>
		<NudgeList />
		<BrandQuestions />
		</div>
	</div>

</div>

<style>
	.lt { display: flex; flex-direction: column; gap: 26px; padding-bottom: 40px; }
	.lt-h { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 18px; }
	.lt-hi { flex: 1 1 360px; display: grid; gap: 6px; }
	.lt-eb, .lt-sh h2 { margin: 0; font-family: var(--f-body, inherit); font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	.lt-hi h1 { margin: 0; font: 400 52px/1.02 var(--f-serif, Georgia, serif); letter-spacing: -.01em; }
	.lt-hi h1 em { background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 4px; }
	.lt-search { flex: 0 1 340px; height: 48px; display: flex; align-items: center; gap: 12px; padding: 0 18px; border-radius: 999px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink-3); font: 500 14px var(--f-body, inherit); cursor: pointer; transition: border-color .2s, box-shadow .2s; }
	.lt-search:hover { border-color: var(--ink); box-shadow: 3px 3px 0 var(--accent); }
	.lt-search :global(.ic) { width: 18px; height: 18px; color: var(--ink); }
	.lt-search span { flex: 1; min-width: 0; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.lt-search kbd { margin-left: auto; font: 600 11px var(--f-mono, monospace); padding: 3px 7px; border: 1px solid var(--line-strong); color: var(--ink-3); background: none; }

	/* NeoPOP buttons, as on the phone. */
	.lt :global(.lt-btn) { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 18px; border: 1px solid var(--line-strong); border-radius: 0; background: var(--surface); color: var(--ink); font: 700 14px var(--f-body, inherit); text-decoration: none; cursor: pointer; box-shadow: 3px 3px 0 var(--line-strong); transition: transform .07s, box-shadow .07s; flex: none; }
	.lt :global(.lt-btn.grad) { border: 0; color: #fff; background: linear-gradient(110deg, var(--g1), var(--g2) 55%, var(--g3)); box-shadow: 4px 4px 0 color-mix(in oklab, var(--g1) 60%, #000); }
	.lt :global(.lt-btn.ink) { border: 0; color: var(--bg); background: var(--ink); box-shadow: 4px 4px 0 var(--accent); }
	.lt :global(.lt-btn:active) { transform: translate(3px, 3px); box-shadow: none; }
	.lt :global(.lt-btn .ic) { width: 17px; height: 17px; }
	.lt-h .lt-btn { height: 48px; }

	/* Story rings */
	.lt-rings { display: flex; gap: 18px; overflow-x: auto; padding: 2px 2px 4px; scrollbar-width: none; }
	.lt-ring { flex: none; width: 76px; display: grid; justify-items: center; gap: 7px; border: 0; background: none; padding: 0; color: var(--ink-2); font: inherit; text-decoration: none; cursor: pointer; }
	.lt-ring .r { width: 70px; height: 70px; box-sizing: border-box; padding: 3px; border-radius: 50%; background: conic-gradient(from var(--cr-a, 0deg), var(--g3), var(--g2), var(--g1), var(--g3)); animation: lt-turn 5s linear infinite; transition: transform .3s cubic-bezier(.2, 1.6, .4, 1); }
	.lt-ring.seen .r { background: var(--line-strong); animation: none; }
	.lt-ring.me .r { background: var(--line-strong); animation: none; }
	.lt-ring:hover .r { transform: scale(1.06); }
	.lt-ring .r b { display: grid; place-items: center; width: 100%; height: 100%; box-sizing: border-box; border-radius: 50%; border: 3px solid var(--bg); background: var(--h, var(--surface)); color: #fff; font-size: 16px; font-weight: 700; }
	.lt-ring.me .r b { background: var(--surface); color: var(--ink); font-size: 28px; font-weight: 400; }
	.lt-ring small { max-width: 76px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	@keyframes lt-turn { to { --cr-a: 360deg; } }
	.lt-tk { overflow: hidden; margin: 0; border-radius: 999px; background: var(--chrome); }
	.lt-tk :global(div) { display: inline-flex; gap: 22px; padding: 11px 0 11px 22px; white-space: nowrap; font-size: 12.5px; color: rgba(255, 255, 255, .72); animation: lt-tick 40s linear infinite; }
	.lt-tk :global(b) { color: var(--g3); }
	.lt-tk :global(i) { font-style: normal; color: var(--g2); }
	@keyframes lt-tick { to { transform: translateX(-50%); } }

	.lt-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 24px; align-items: start; }
	.lt-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
	.lt-sh { display: flex; align-items: center; gap: 10px; }
	.lt-sh a { margin-left: auto; font-size: 13px; color: var(--ink-2); text-decoration: none; }
	.lt-sh a:hover { color: var(--accent); }
	.lt-n { min-width: 22px; height: 22px; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: var(--bad); color: #fff; font: 800 12px var(--f-body, inherit); display: inline-grid; place-items: center; }
	.lt-card { padding: 22px; border-radius: 26px; border: 1px solid var(--line); background: radial-gradient(120% 60% at 100% 0%, color-mix(in oklab, var(--g2) 10%, transparent), transparent 60%), var(--surface); }

	/* Money */
	.lt-money { display: flex; flex-direction: column; gap: 20px; padding: 26px; border-radius: 26px; color: #fff;
		background: radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g2) 38%, transparent), transparent 55%), radial-gradient(90% 90% at 100% 100%, color-mix(in oklab, var(--g1) 34%, transparent), transparent 60%), linear-gradient(140deg, #2a1424, #160c14 70%); }
	.lt-mt { display: flex; align-items: center; justify-content: space-between; }
	.lt-mt span { font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: rgba(255, 255, 255, .7); }
	.lt-mt a { height: 30px; padding: 0 12px; display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .22); color: #fff; font-size: 12px; font-weight: 600; text-decoration: none; }
	.lt-mm { display: flex; align-items: center; gap: 22px; }
	.lt-big { flex: 1; display: grid; gap: 8px; }
	.lt-big b { font: 400 68px/1 var(--f-serif, Georgia, serif); letter-spacing: -.02em; }
	.lt-big small { font-size: 14px; color: rgba(255, 255, 255, .75); }
	.lt-big strong { color: #fff; }
	.lt-goal { position: relative; width: 124px; height: 124px; flex: none; }
	.lt-goal svg { width: 124px; height: 124px; transform: rotate(-90deg); }
	.lt-goal circle { fill: none; stroke-width: 10; }
	.lt-goal .tr { stroke: rgba(255, 255, 255, .12); }
	.lt-goal .pr { stroke: url(#ltGoal); stroke-linecap: round; animation: lt-draw 1.2s cubic-bezier(.2, .9, .25, 1) both; }
	@keyframes lt-draw { from { stroke-dasharray: 0 100; } }
	.lt-goal > span { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
	.lt-goal b { font: 400 30px var(--f-serif, Georgia, serif); }
	.lt-goal small { font-size: 11px; color: rgba(255, 255, 255, .7); }
	.lt-mini { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
	.lt-mini a { display: grid; gap: 4px; padding: 14px 16px; border-radius: 16px; background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .12); color: #fff; text-decoration: none; transition: background .2s; }
	.lt-mini a:hover { background: rgba(255, 255, 255, .1); }
	.lt-mini small { font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: rgba(255, 255, 255, .62); }
	.lt-mini b { font: 400 26px var(--f-serif, Georgia, serif); }
	.lt-mini b.t { font: 700 14px var(--f-body, inherit); padding-top: 6px; }
	.lt-mini a.bad b { color: #ffb3aa; }

	/* Desk AI sits in a card */
	.lt-ai { padding: 22px; border-radius: 26px; border: 1px solid var(--line); background: var(--surface); }
	.lt-ai :global(.dk2) { margin: 0; }
	.lt-ai :global(h2.dk2-say) { font: 400 32px/1.08 var(--f-serif, Georgia, serif); letter-spacing: -.01em; }
	.lt :global(.cr-more) { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink); font: 600 13px var(--f-body, inherit); cursor: pointer; }
	.lt-sub { margin-top: 10px; }
	.lt-ai :global(.ai-desk-acts) { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 6px 4px 0 0; }
	.lt-ai :global(.ai-desk-acts .btn) { height: 46px; justify-content: center; border-radius: 0; font-weight: 700; box-shadow: 3px 3px 0 var(--line-strong); }
	.lt-ai :global(.ai-desk-acts .btn.ai-btn) { border: 0; background: var(--ink); color: var(--bg); box-shadow: 4px 4px 0 var(--accent); animation: none; }
	.lt-ai :global(.dk2-acts .btn) { border-radius: 0; font-weight: 700; }
	.lt-ai :global(.dk2-add) { border: 0; background: var(--ink); color: var(--bg); box-shadow: 4px 4px 0 var(--accent); }
	.lt-ai :global(.dk2-open) { box-shadow: 3px 3px 0 var(--line-strong); }

	/* Needs you */
	.lt-tks { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
	.lt-tks :global(.tk) { transition: transform .35s cubic-bezier(.2, 1.5, .35, 1); }
	.lt-tks :global(.tk:hover) { transform: translateY(-3px); }
	.lt-more { align-self: center; }
	.lt-clear { padding: 26px; border-radius: 22px; border: 1px dashed var(--line-strong); display: grid; gap: 4px; }
	.lt-clear b { font: 400 26px var(--f-serif, Georgia, serif); }
	.lt-clear small { color: var(--ink-3); }

	/* This week */
	.lt-col.wk2 :global(.wk2-say) { margin: 0 0 16px; font-size: 32px; }
	.lt-day { margin-top: 18px; padding-top: 16px; border-top: 1px dashed var(--line-strong); display: grid; gap: 12px; }

	/* Pipeline */
	.lt-pipe { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; align-items: end; }
	.lt-pipe a { display: grid; justify-items: center; gap: 8px; color: var(--ink); text-decoration: none; }
	.lt-pipe b { font: 400 30px/1 var(--f-serif, Georgia, serif); }
	.lt-pipe .bar { position: relative; width: 100%; height: 130px; border-radius: 16px; background: var(--surface-2); overflow: hidden; }
	.lt-pipe .bar i { position: absolute; left: 0; right: 0; bottom: 0; height: var(--p); border-radius: 16px; background: linear-gradient(0deg, var(--c), color-mix(in oklab, var(--c) 50%, transparent)); transform-origin: bottom; animation: lt-grow .9s cubic-bezier(.2, .9, .25, 1) both; }
	@keyframes lt-grow { from { transform: scaleY(0); } }
	.lt-pipe small { font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }

	@media (prefers-reduced-motion: reduce) { .lt-ring .r, .lt-goal .pr, .lt-pipe .bar i, .lt-tk :global(div) { animation: none; } }
</style>
