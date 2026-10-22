<script lang="ts">
	import { onMount } from 'svelte';
	import { boostText, checkups, enoughReels, latest, loadCheckups, planMoments, planWeekly, runCheckup, setDone, type Action, type Run } from '#lib/checkup.svelte.ts';
	import { setMode } from '#lib/grow.svelte.ts';
	import { loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { copyText } from '#lib/ui.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';

	// The growth check-up: why she isn't growing and what to change, from her own reels and audience.
	onMount(async () => {
		if (!studio.media.length) await loadInstagram();
		await loadCheckups();
		if (!latest() && studio.ig?.connected && enoughReels()) runCheckup();
	});
	const run = $derived(latest());
	const prev = $derived(checkups.list[1] ?? null);
	const c = $derived(run?.data ?? null);
	const when = $derived(run ? new Date(run.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
	const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
	const n = (x: number) => x.toLocaleString('en-IN');
	const k = (x: number) => (x >= 10000 ? `${Math.round(x / 1000)}K` : n(x));
	const signed = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${n(Math.abs(x))}`);
	const doneN = $derived(run ? run.data.actions.filter((a) => run.done[a.key]).length : 0);
	const ord = $derived(run ? [...run.data.actions].sort((a, b) => Number(!!run.done[a.key]) - Number(!!run.done[b.key])) : []);
	const womenLabel = $derived(c?.women === null || c?.women === undefined ? '—' : c.women < 0.25 ? `1 in ${Math.max(2, Math.round(1 / Math.max(c.women, 0.01)))}` : pct(c.women));
	const moved = (now: number | null, before: number | null | undefined, unit = '') => (now === null || before === null || before === undefined ? '' : `${now - before >= 0 ? '+' : ''}${Math.round((now - before) * 10) / 10}${unit} since ${new Date(prev!.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`);
	async function act(r: Run, a: Action) {
		if (a.kind === 'copy') {
			await copyText(a.text ?? '', 'Bio copied. Paste it in Instagram › Edit profile.');
			await setDone(r, a.key, true);
		} else if (a.kind === 'moments') await planMoments(r, a);
		else if (a.kind === 'weekly') await planWeekly(r, a);
		else if (a.kind === 'autopilot') {
			await setMode('auto');
			await setDone(r, a.key, true);
		} else if (a.kind === 'boost' && r.data.best) {
			await copyText(boostText(r), 'Settings copied. Tap Boost under the reel in Instagram.');
			window.open(r.data.best.permalink, '_blank', 'noopener');
			await setDone(r, a.key, true);
		}
	}
	const BTN: Record<Action['kind'], string> = { copy: 'Copy bio', moments: 'Plan them', weekly: 'Add weekly', check: 'Check a reel', boost: 'Boost', autopilot: 'Turn on', tick: 'Done' };
</script>

<svelte:head><title>Growth check-up · Miracle</title></svelte:head>

<a class="back rv" href="/studio/grow"><Icon name="back" />Grow</a>
<header class="ph rv">
	<div>
		<div class="eb">Growth check-up{run ? ` · ${when} · from your last ${c?.reels} reels and your audience` : ''}</div>
		<h1>Why you're <em>not growing</em>, and what to change</h1>
	</div>
	{#if run}<div class="acts"><button class="btn" onclick={runCheckup} disabled={checkups.running}>{#if checkups.running}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Run it again</button></div>{/if}
</header>

{#if !studio.ig?.connected}
	<div class="clear hero-card glow m-none"><div class="mesh" aria-hidden="true"></div><span class="clear-ic"><Icon name="chart" /></span><b>Connect Instagram first</b><small>The check-up reads your own reels and audience (never your DMs).</small><div class="clear-acts"><a class="glass-chip" href="/studio/settings?s=profile"><Icon name="link" />Connect Instagram</a></div></div>
{:else if !run && !enoughReels()}
	<div class="clear hero-card glow m-none"><div class="mesh" aria-hidden="true"></div><span class="clear-ic"><Icon name="film" /></span><b>A few more reels first</b><small>The check-up needs at least 6 reels with views to tell what works for you.</small></div>
{:else if !run || !c}
	<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span><p class="hint" style="margin-top:14px">Reading your reels and audience…</p></div>
{:else}
	<section class="hero-card glow cu-hero rv" aria-label="In one line">
		<div class="mesh" aria-hidden="true"></div>
		<div class="cu-v"><span class="hc-eb">In one line</span><b>{c.verdict}</b></div>
		<div class="cu-n"><small>Typical reel</small><b class="num">{n(c.typical)}</b><small>views</small></div>
		<div class="cu-n"><small>Followers this week</small><b class="num" class:bad={(c.week ?? 0) < 0}>{signed(c.week)}</b><small>{c.followers !== null ? `${n(c.followers)} now` : ''}</small></div>
		{#if c.women !== null}<div class="cu-n"><small>Women in your audience</small><b class="num" class:bad={c.ideal.gender === 'women' && c.women < 0.5}>{womenLabel}</b><small>of those Instagram knows</small></div>{/if}
	</section>

	<div class="cu-grid">
		<section class="panel cu-card rv" style="--i:1">
			<h2>What's holding you back</h2>
			{#each c.findings as f (f.key)}
				<div class="cu-f" class:lead={f.big}><span>{#if f.big}<small>Biggest</small>{/if}<b>{f.title}</b></span><p>{f.text}</p></div>
			{:else}
				<p class="hint">Nothing big. Keep going with what works.</p>
			{/each}
		</section>

		<section class="panel cu-card rv" style="--i:2">
			<div class="cu-ch"><h2>What's working</h2><small>topics read from your captions</small></div>
			{#if c.topics.length}
				<div class="cu-t" role="table" aria-label="Topics">
					<div class="cu-tr cu-th" role="row"><span role="columnheader">Topic</span><span role="columnheader">Reels</span><span role="columnheader">Views</span><span role="columnheader">Shares/1k</span></div>
					{#each c.topics as t, i (t.name)}
						<div class="cu-tr" class:dim={i >= 3 || t.name === 'Everything else'} role="row"><b role="cell">{t.name}</b><span role="cell">{t.n}</span><b role="cell">{k(t.views)}</b><span role="cell" class:good={t.shares1k >= 8}>{t.shares1k}</span></div>
					{/each}
				</div>
			{/if}
			<div class="cu-lines">
				{#if c.watch}<span>Reels watched <b>{c.watch.cut}s or more</b> got about <b>{c.watch.ratio}×</b> the views.</span>{/if}
				{#if c.caption}<span>Captions that start with <b>a sentence</b> got {k(c.caption.sentence)} views; starting with hashtags, {k(c.caption.tags)}.</span>{/if}
				{#if c.days}<span>Best: <b>{c.days.best}</b>.{#if c.days.worst}{' '}Worst: {c.days.worst}.{/if}</span>{/if}
			</div>
		</section>
	</div>

	<section class="panel cu-card rv" style="--i:3">
		<div class="cu-ch"><h2>What to change</h2><small>{doneN} of {c.actions.length} done · tick them off as you go</small></div>
		<div class="cu-acts">
			{#each ord as a, i (a.key)}
				{@const done = !!run.done[a.key]}
				<div class="cu-a" class:done>
					<button class="cu-num" onclick={() => setDone(run, a.key, !done)} aria-label={done ? `Mark “${a.title}” not done` : `Mark “${a.title}” done`}>{#if done}<Icon name="check" />{:else}{i + 1}{/if}</button>
					<span class="cu-at"><b>{a.title}</b><small>{a.sub}</small></span>
					{#if !done}
						{#if a.kind === 'check'}<a class="btn sm" href="/studio/grow/check">{BTN[a.kind]}</a>
						{:else if a.kind === 'tick'}<button class="btn sm" onclick={() => setDone(run, a.key, true)}>{BTN[a.kind]}</button>
						{:else}<button class="btn sm {a.kind === 'boost' ? 'grad' : a.kind === 'moments' ? 'primary' : ''}" onclick={() => act(run, a)}>{BTN[a.kind]}</button>{/if}
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<section class="panel cu-card cu-work rv" style="--i:4">
		<div class="cu-wt"><h2>Is it working?</h2><small>Watch these, in this order. Run the check-up again in two weeks to see what moved.</small></div>
		<div class="cu-n"><small>1 · Saves and shares per 1,000</small><b class="num">{c.rate}</b><small>aim for 6+{prev ? ` · ${moved(c.rate, prev.data.rate)}` : ''}</small></div>
		{#if c.women !== null && c.ideal.gender !== 'everyone'}<div class="cu-n"><small>2 · {c.ideal.gender === 'women' ? 'Women' : 'Men'} in your audience</small><b class="num">{pct(c.ideal.gender === 'women' ? c.women : 1 - c.women)}</b><small>aim for 30%+{prev && prev.data.women !== null ? ` · ${moved(Math.round((c.women ?? 0) * 100), Math.round((prev.data.women ?? 0) * 100), ' pts')}` : ''}</small></div>{/if}
		<div class="cu-n"><small>3 · Followers a week</small><b class="num">{signed(c.week)}</b><small>aim for +200{prev ? ` · ${moved(c.week, prev.data.week)}` : ''}</small></div>
	</section>
{/if}

<style>
	.cu-hero {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) repeat(3, 170px);
		gap: 24px;
		align-items: center;
		padding: 26px 28px;
		margin-bottom: 20px;
	}
	.cu-hero > :not(.mesh) {
		position: relative;
		z-index: 1;
	}
	.cu-v {
		display: grid;
		gap: 8px;
	}
	.cu-v b {
		font: 400 30px/1.15 var(--f-serif, Georgia, serif);
	}
	.cu-n {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	.cu-n small {
		font-size: 12px;
		opacity: 0.8;
	}
	.cu-n b {
		font-size: 26px;
	}
	.bad {
		color: var(--bad);
	}
	.good {
		color: var(--ok);
		font-weight: 700;
	}
	.cu-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 20px;
		margin-bottom: 20px;
		align-items: start;
	}
	.cu-card {
		display: grid;
		gap: 12px;
		padding: 22px 24px;
		margin-bottom: 20px;
	}
	.cu-grid .cu-card {
		margin-bottom: 0;
	}
	.cu-card h2 {
		margin: 0;
		font: 400 28px/1 var(--f-serif, Georgia, serif);
	}
	.cu-ch {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 10px;
		flex-wrap: wrap;
	}
	.cu-ch small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.cu-f {
		display: grid;
		gap: 4px;
		padding: 14px 16px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--warn) 7%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--warn) 30%, transparent);
	}
	.cu-f.lead {
		background: color-mix(in oklab, var(--bad) 8%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 35%, transparent);
	}
	.cu-f span {
		display: flex;
		gap: 8px;
		align-items: baseline;
		flex-wrap: wrap;
	}
	.cu-f small {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--bad);
	}
	.cu-f b {
		font-size: 15px;
	}
	.cu-f p {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.cu-t {
		display: grid;
		border-radius: 14px;
		background: var(--bg);
		box-shadow: inset 0 0 0 1px var(--line);
		font-size: 13.5px;
	}
	.cu-tr {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 50px 80px 80px;
		gap: 10px;
		padding: 11px 14px;
		border-top: 1px solid var(--line);
	}
	.cu-th {
		border-top: 0;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.cu-tr.dim {
		color: var(--ink-3);
	}
	.cu-tr.dim b {
		font-weight: 500;
	}
	.cu-lines {
		display: grid;
		gap: 6px;
		font-size: 13.5px;
		line-height: 1.45;
	}
	.cu-acts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.cu-a {
		display: grid;
		grid-template-columns: 30px minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 14px;
		border-radius: 14px;
		background: var(--surface-2, var(--surface));
	}
	.cu-a.done {
		opacity: 0.6;
	}
	.cu-a.done b {
		text-decoration: line-through;
	}
	.cu-num {
		width: 26px;
		height: 26px;
		border: 0;
		border-radius: 50%;
		background: var(--accent);
		color: #fff;
		display: grid;
		place-items: center;
		font: 700 13px var(--f-body);
		cursor: pointer;
	}
	.cu-a.done .cu-num {
		background: var(--line);
		color: var(--ok);
	}
	.cu-num :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.cu-at {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.cu-at b {
		font-size: 14.5px;
	}
	.cu-at small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.cu-work {
		grid-template-columns: minmax(0, 1fr) repeat(3, 200px);
		gap: 20px;
		align-items: center;
	}
	.cu-wt {
		display: grid;
		gap: 6px;
	}
	.cu-wt small {
		font-size: 13px;
		color: var(--ink-3);
	}
	.cu-work .cu-n b {
		font-size: 22px;
	}
	@media (max-width: 1100px) {
		.cu-hero,
		.cu-work {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
		}
		.cu-v,
		.cu-wt {
			grid-column: 1 / -1;
		}
		.cu-grid,
		.cu-acts {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 760px) {
		.cu-hero {
			padding: 20px;
			gap: 12px;
		}
		.cu-v b {
			font-size: 25px;
		}
		.cu-n b {
			font-size: 17px;
		}
		.cu-card {
			padding: 18px;
		}
		.cu-a {
			grid-template-columns: 28px minmax(0, 1fr);
		}
		.cu-a :global(.btn) {
			grid-column: 2;
			justify-self: start;
		}
		.cu-tr {
			grid-template-columns: minmax(0, 1fr) 36px 56px 56px;
			padding: 10px 12px;
		}
	}
</style>
