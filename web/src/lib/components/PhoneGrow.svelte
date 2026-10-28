<script lang="ts">
	import { studio } from '../studio.svelte';
	import { answerCollab, audience, boostBudget, boostPick, cancelCollab, grow, insights, planIt, planWeek, setMode, setPlan, stats, topReels, weekIdeas } from '../grow.svelte';
	import { latest } from '../checkup.svelte';
	import { GRADE, isHealth, safetyText } from '../health';
	import { copyText, countUp } from '../ui.svelte';
	import { compact } from '../util';
	import Avatar from './Avatar.svelte';
	import HealthCard from './HealthCard.svelte';
	import GrowthCoach from './GrowthCoach.svelte';
	import DayPerformance from './DayPerformance.svelte';
	import Icon from './Icon.svelte';

	// Grow on the phone: an app, not an article. The growth meter on top, the tools as tiles, then what to
	// do this week and what's working as swipeable cards, the audience check folded into one row, collab
	// partners as a carousel, and the reel worth boosting as one ticket.
	const st = $derived(stats(studio.media, studio.followersHistory, studio.ig));
	const tips = $derived(insights(studio.media, studio.followersHistory));
	const top = $derived(topReels(studio.media, 6));
	const boost = $derived(boostPick(studio.media));
	const aud = $derived(audience(studio.ig));
	const ideas = $derived(weekIdeas());
	const open = $derived(ideas.filter((p) => p.status === 'idea'));
	const mode = $derived(studio.settings?.grow_mode ?? 'ask');
	const incoming = $derived(grow.reels.filter((r) => r.incoming && r.status === 'pending'));
	const outgoing = $derived(grow.reels.filter((r) => !r.incoming && r.status === 'pending'));
	const invited = $derived(new Set(outgoing.map((r) => r.with.id)));
	const cu = $derived(latest());
	const h = $derived(isHealth(studio.ig?.health) ? studio.ig!.health : null);
	const budget = $derived(boostBudget(st.followers));
	let healthOpen = $state(false);
	let healthEl = $state<HTMLElement | null>(null);

	const fmtN = (n: number) => n.toLocaleString('en-IN');
	const up = (n: number | null) => (n === null ? '' : `${n >= 0 ? '+' : ''}${n}%`);
	const when = (iso: string | null) => {
		if (!iso) return { d: 'ANY', t: 'day' };
		const x = new Date(iso);
		return { d: x.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).toUpperCase(), t: x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase()) };
	};
	const line = $derived.by(() => {
		const v = st.line;
		if (v.length < 2) return '';
		const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
		return v.map((y, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * 400).toFixed(1)} ${(64 - ((y - lo) / span) * 54).toFixed(1)}`).join(' ');
	});
	const thumb = (u: string, i: number) => (u ? `background-image:url("${u}")` : `background:linear-gradient(160deg,var(--g${(i % 3) + 1}),var(--hero))`);
	const cap = (c: string | null | undefined, n = 44) => (c || 'Reel').split('\n')[0].slice(0, n);
	const boostText = $derived(boost ? `Boost: ${cap(boost.m.caption, 60)}\nAudience: ${aud.text || 'my followers’ cities and ages'}\nBudget: ₹${budget} a day for 3 days\nGoal: more profile visits` : '');
	async function boostIt() {
		if (!boost) return;
		await copyText(boostText, 'Settings copied. Tap Boost under the reel in Instagram.');
		window.open(boost.m.permalink, '_blank', 'noopener');
	}
	function showHealth() {
		healthOpen = true;
		requestAnimationFrame(() => healthEl?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
	}
	function toBoost() {
		document.getElementById('pg-boost')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
</script>

<div class="pg">
	<!-- The growth meter -->
	<section class="hero-card glow pg-hero rv" aria-label="Your growth">
		<div class="mesh" aria-hidden="true"></div>
		<div class="pg-orbit" aria-hidden="true"><span></span><i></i><Icon name="spark" /></div>
		<div class="pg-h-in">
			<div class="pg-h-top">
				<span class="pg-eb">Followers · 30 days</span>
				{#if st.gained !== null}<span class="pg-gain" class:down={st.gained < 0}><Icon name={st.gained >= 0 ? 'chevU' : 'chevD'} />{st.gained >= 0 ? '+' : ''}{fmtN(st.gained)}</span>{/if}
			</div>
			<b class="pg-big" use:countUp={{ value: st.followers ?? 0 }}>{fmtN(st.followers ?? 0)}</b>
			{#if line}
				<svg class="pg-line" viewBox="0 0 400 64" preserveAspectRatio="none" role="img" aria-label="Followers over the last 30 days"><defs><linearGradient id="grow-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--g2)" stop-opacity=".42" /><stop offset="100%" stop-color="var(--g1)" stop-opacity="0" /></linearGradient></defs><path d="{line} L400 64 L0 64 Z" class="pg-fill"></path><path d={line} pathLength="1" class="pg-stroke"></path></svg>
			{/if}
			<div class="pg-stats">
				<span><small>Reel views</small><b>{compact(st.views)}</b>{#if st.viewsUp !== null}<i class:ok={(st.viewsUp ?? 0) >= 0}>{up(st.viewsUp)}</i>{/if}</span>
				<span><small>Shares</small><b>{compact(st.shares)}</b>{#if st.sharesUp !== null}<i class:ok={(st.sharesUp ?? 0) >= 0}>{up(st.sharesUp)}</i>{/if}</span>
				<span><small>Avg. watch</small><b>{st.watch !== null ? `${st.watch.toFixed(1)}s` : '—'}</b><i>per reel</i></span>
			</div>
		</div>
	</section>

	<!-- The tools -->
	<div class="pg-tools rv" style="--i:1">
		<a class="pg-tool pg-wide" href="/studio/grow/insights" style="--hue:var(--g1)">
			<span class="pg-ti"><Icon name="chart" /></span>
			<b>All your insights</b>
			<small>Reach, views, audience, your best posts: everything brands see</small>
		</a>
		<a class="pg-tool" href="/studio/grow/check" style="--hue:var(--g2)">
			<span class="pg-ti"><Icon name="film" /></span>
			<b>Check a reel</b>
			<small>Before you post it</small>
		</a>
		<a class="pg-tool" href="/studio/grow/checkup" style="--hue:{cu?.data.findings.length ? 'var(--warn)' : 'var(--g1)'}">
			<span class="pg-ti"><Icon name="chart" /></span>
			<b>Growth check-up</b>
			<small>{cu ? (cu.data.findings.length ? `${cu.data.findings.length} thing${cu.data.findings.length === 1 ? '' : 's'} holding you back` : 'Nothing big holding you back') : 'Why you’re not growing'}</small>
		</a>
		<button class="pg-tool" onclick={showHealth} style="--hue:{h?.grade === 'weak' ? 'var(--bad)' : h?.grade === 'fair' ? 'var(--warn)' : 'var(--ok)'}">
			<span class="pg-ti"><Icon name="shield" /></span>
			<b>{h?.score != null ? `Audience ${h.score}` : 'Audience health'}</b>
			<small>{h?.grade ? `${GRADE[h.grade]} · what brands see` : 'What brands see'}</small>
		</button>
		<button class="pg-tool" onclick={toBoost} style="--hue:var(--g3)">
			<span class="pg-ti"><Icon name="spark" /></span>
			<b>Boost</b>
			<small>{boost ? '1 reel worth boosting' : 'When a reel takes off'}</small>
		</button>
	</div>

	<GrowthCoach />

	<!-- This week: the autopilot's three reels -->
	<section class="pg-sec rv" style="--i:2">
		<header class="pg-sh">
			<div><h2>This week's reels</h2><small>{mode === 'auto' ? 'Autopilot puts them in your Calendar' : 'You approve, they go in your Calendar'}</small></div>
			<label class="pg-auto"><span>Auto</span><input type="checkbox" class="tgl" checked={mode === 'auto'} aria-label="Growth autopilot: add ideas to the Calendar automatically" onchange={(e) => setMode((e.currentTarget as HTMLInputElement).checked ? 'auto' : 'ask')} /></label>
		</header>
		{#if grow.planning && !ideas.length}
			<div class="pg-rail">{#each [0, 1, 2] as i (i)}<div class="pg-idea sk"></div>{/each}</div>
		{:else if ideas.length}
			<div class="pg-rail" role="list">
				{#each ideas as p, i (p.id)}
					{@const w = when(p.post_at)}
					<article class="pg-idea" class:done={p.status !== 'idea'} role="listitem" style="--i:{i}">
						<div class="pg-stub"><b>{w.d}</b><small>{w.t}</small></div>
						<div class="pg-cut" aria-hidden="true"></div>
						<div class="pg-ib">
							<span class="pg-n">Reel {i + 1} of {ideas.length}</span>
							<b>{p.title}</b>
							<small>{p.why}</small>
						</div>
						<div class="pg-ia">
							{#if p.status === 'idea'}
								<button class="btn sm primary" onclick={() => planIt([p.id])}><Icon name="cal" />Plan it</button>
								<button class="icon-btn" onclick={() => setPlan(p, { status: 'dropped' })} aria-label="Not this one"><Icon name="x" /></button>
							{:else}
								<span class="pg-in"><Icon name="check" />In your Calendar</span>
							{/if}
						</div>
					</article>
				{/each}
			</div>
			<div class="pg-acts">
				{#if open.length > 1}<button class="btn primary" onclick={() => planIt(open.map((p) => p.id))}><Icon name="cal" />Plan all {open.length}</button>
				{:else if !open.length}<a class="btn" href="/studio/calendar"><Icon name="cal" />See Calendar</a>{/if}
				<button class="btn ghost" onclick={() => planWeek(true)} disabled={grow.planning}>{#if grow.planning}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}New ideas</button>
			</div>
		{:else}
			<div class="pg-empty"><Icon name="spark" /><span><b>Ideas are on the way</b><small>They come once a few of your reels have views.</small></span></div>
		{/if}
	</section>

	<!-- What's working -->
	<section class="pg-sec rv" style="--i:3">
		<header class="pg-sh"><div><h2>What's working</h2><small>Your top reels, last 90 days</small></div></header>
		{#if top.length}
			<div class="pg-rail pg-reels">
				{#each top as m, i (m.id)}
					<a class="pg-reel" href={m.permalink} target="_blank" rel="noopener" style={thumb(m.thumbnail_url, i)}>
						<span class="pg-rank">{i + 1}</span>
						<span class="pg-views"><Icon name="eye" />{compact(m.views || m.reach || 0)}</span>
						<span class="pg-rc"><b>{cap(m.caption, 40)}</b><small>{compact(m.shares ?? 0)} shares · {compact(m.saves ?? 0)} saves</small></span>
					</a>
				{/each}
			</div>
		{/if}
		{#if tips.length}
			<div class="pg-rail pg-tips" role="list">
				{#each tips as t, i (i)}
					{@const [a, b] = t.text.split('{b}')}
					<div class="pg-tip" role="listitem"><span class="pg-tn">{i + 1}</span><p>{a}<b>{t.bold}</b>{b}</p></div>
				{/each}
			</div>
		{:else if !top.length}
			<div class="pg-empty"><Icon name="film" /><span><b>Post a few reels</b><small>This fills in with what brings you new people.</small></span></div>
		{/if}
	</section>

	<DayPerformance />

	<!-- Audience health, folded -->
	<section class="pg-sec rv" style="--i:4" bind:this={healthEl}>
		<button class="pg-hrow" onclick={() => (healthOpen = !healthOpen)} aria-expanded={healthOpen}>
			<span class="pg-ring" style="--p:{(h?.score ?? 0) / 100};--hue:{h?.grade === 'weak' ? 'var(--bad)' : h?.grade === 'fair' ? 'var(--warn)' : 'var(--ok)'}"><b>{h?.score ?? '—'}</b></span>
			<span class="pg-ht">
				<small>Audience health</small>
				<b>{h?.grade ? `${GRADE[h.grade]} audience` : 'Not checked yet'}</b>
				<em>Brand safety: {safetyText(h?.safety)}</em>
			</span>
			<Icon name={healthOpen ? 'chevU' : 'chevD'} />
		</button>
		{#if healthOpen}<div class="pg-hfull"><HealthCard health={studio.ig?.health} mine connected /></div>{/if}
	</section>

	<!-- Collab reels -->
	<section class="pg-sec rv" style="--i:5" id="collab">
		<header class="pg-sh"><div><h2>Collab reels</h2><small>One reel on both accounts: both audiences see it</small></div></header>
		{#each incoming as r (r.id)}
			<div class="pg-inv">
				<Avatar name={r.with.name} src={r.with.photo ?? ''} size="44px" />
				<span><b>{r.with.name} invited you</b><small>“{r.idea}”{r.post_at ? ` · ${when(r.post_at).d} ${when(r.post_at).t}` : ''}</small></span>
				<div class="pg-yn"><button class="btn sm" onclick={() => answerCollab(r, false)}>No</button><button class="btn sm primary" onclick={() => answerCollab(r, true)}>Yes</button></div>
			</div>
		{/each}
		{#if grow.matches.length}
			<div class="pg-rail pg-peers" role="list">
				{#each grow.matches.slice(0, 8) as c (c.id)}
					<div class="pg-peer" role="listitem">
						<Avatar name={c.name} src={c.photo ?? ''} size="58px" />
						<b>{c.name}</b>
						<small>{[c.niche?.split(',')[0]?.trim(), c.city].filter(Boolean).join(' · ')}</small>
						{#if c.followers}<span class="pg-reach">+{compact(c.followers)} reach</span>{/if}
						{#if invited.has(c.id)}<button class="btn sm" onclick={() => { const r = outgoing.find((x) => x.with.id === c.id); if (r) cancelCollab(r); }}>Invited · undo</button>
						{:else}<a class="btn sm primary" href="/studio/grow/collab/{c.id}">Invite</a>{/if}
					</div>
				{/each}
			</div>
		{:else if grow.loaded}
			<div class="pg-empty"><Icon name="users" /><span><b>No partners yet</b><small>Creators in your niche show here as they join Miracle.</small></span></div>
		{/if}
	</section>

	<!-- Boost -->
	<section class="pg-sec rv" style="--i:6" id="pg-boost">
		<header class="pg-sh"><div><h2>Boost what already works</h2><small>You pay Instagram directly; Miracle takes nothing</small></div></header>
		{#if boost}
			<article class="pg-boost">
				<div class="pg-bt">
					<span class="pg-bth" style={thumb(boost.m.thumbnail_url, 0)}></span>
					<span><small class="pg-x">{boost.r.toFixed(1)}× more shares and saves</small><b>{cap(boost.m.caption, 60)}</b></span>
				</div>
				<div class="pg-cut2" aria-hidden="true"></div>
				<dl class="pg-facts">
					{#if aud.text}<div><dt>Show it to</dt><dd>{aud.text}</dd></div>{/if}
					<div><dt>Budget</dt><dd>₹{budget} a day · 3 days</dd></div>
					<div><dt>Goal</dt><dd>Profile visits</dd></div>
				</dl>
				<button class="btn grad pg-bb" onclick={boostIt}><Icon name="spark" />Boost it in Instagram</button>
			</article>
		{:else}
			<div class="pg-empty"><Icon name="spark" /><span><b>Nothing to boost yet</b><small>When a reel is shared far more than usual, it shows here.</small></span></div>
		{/if}
	</section>
</div>

<style>
	.pg {
		display: grid;
		gap: 22px;
		padding-bottom: 12px;
	}
	/* The growth meter */
	.pg-hero {
		min-height: 0;
	}
	.pg-h-in {
		position: relative;
		z-index: 1;
		display: grid;
		gap: 6px;
		padding: 20px 20px 16px;
	}
	.pg-h-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.pg-eb {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.17em;
		text-transform: uppercase;
		opacity: 0.72;
	}
	.pg-gain {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 4px 10px 4px 6px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ok) 22%, transparent);
		color: color-mix(in oklab, var(--ok) 70%, var(--hero-ink));
		font-size: 13px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.pg-gain.down {
		background: color-mix(in oklab, var(--bad) 22%, transparent);
		color: color-mix(in oklab, var(--bad) 70%, var(--hero-ink));
	}
	.pg-gain :global(.ic) {
		width: 15px;
		height: 15px;
	}
	.pg-big {
		font: 400 54px/1 var(--f-serif, Georgia, serif);
		letter-spacing: -0.01em;
		font-variant-numeric: tabular-nums;
	}
	.pg-line {
		width: calc(100% + 40px);
		height: 64px;
		margin: 4px -20px 0;
		display: block;
	}
	.pg-fill {
		fill: color-mix(in oklab, var(--g2) 22%, transparent);
	}
	.pg-stroke {
		fill: none;
		stroke: var(--g2);
		stroke-width: 2.5;
		vector-effect: non-scaling-stroke;
	}
	.pg-stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		margin-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.12);
	}
	.pg-stats span {
		display: grid;
		gap: 2px;
		padding: 12px 0 0;
	}
	.pg-stats span + span {
		padding-left: 14px;
		border-left: 1px solid rgba(255, 255, 255, 0.12);
	}
	.pg-stats small {
		font-size: 11px;
		opacity: 0.7;
	}
	.pg-stats b {
		font: 400 26px/1.05 var(--f-serif, Georgia, serif);
		font-variant-numeric: tabular-nums;
	}
	.pg-stats i {
		font-style: normal;
		font-size: 12px;
		opacity: 0.7;
	}
	.pg-stats i.ok {
		opacity: 1;
		color: color-mix(in oklab, var(--ok) 70%, var(--hero-ink));
	}
	/* Tools */
	.pg-tools {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.pg-wide {
		grid-column: 1 / -1;
	}
	.pg-tool {
		position: relative;
		display: grid;
		align-content: start;
		gap: 4px;
		min-height: 118px;
		padding: 14px;
		border: 0;
		border-radius: 20px;
		background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--hue) 16%, transparent), transparent 60%), var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.pg-tool:active {
		transform: scale(0.97);
	}
	.pg-ti {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		margin-bottom: 8px;
		border-radius: 13px;
		background: color-mix(in oklab, var(--hue) 20%, var(--surface-2));
		color: var(--hue);
	}
	.pg-ti :global(.ic) {
		width: 20px;
		height: 20px;
	}
	.pg-tool b {
		font: 400 19px/1.15 var(--f-serif, Georgia, serif);
	}
	.pg-tool small {
		font-size: 12.5px;
		line-height: 1.35;
		color: var(--ink-3);
	}
	/* Sections */
	.pg-sec {
		display: grid;
		gap: 12px;
		min-width: 0;
		scroll-margin-top: 70px;
	}
	.pg-sh {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
	}
	.pg-sh h2 {
		margin: 0;
		font: 400 24px/1.1 var(--f-serif, Georgia, serif);
		letter-spacing: -0.005em;
	}
	.pg-sh small {
		display: block;
		margin-top: 3px;
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.pg-auto {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: none;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.pg-rail {
		display: flex;
		gap: 12px;
		margin: 0 -16px;
		padding: 2px 16px 6px;
		overflow-x: auto;
		scroll-snap-type: x mandatory;
		scroll-padding: 0 16px;
		scrollbar-width: none;
	}
	.pg-rail::-webkit-scrollbar {
		display: none;
	}
	.pg-rail > * {
		scroll-snap-align: start;
		flex: none;
	}
	/* Reel ideas: tickets with a day stub */
	.pg-idea {
		display: grid;
		grid-template-rows: auto auto 1fr auto;
		width: min(78vw, 300px);
		min-height: 232px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.pg-idea.sk {
		background: linear-gradient(100deg, var(--surface) 30%, var(--surface-2) 50%, var(--surface) 70%);
		background-size: 300% 100%;
		animation: pg-sk 1.2s linear infinite;
	}
	.pg-idea.done {
		opacity: 0.72;
	}
	.pg-stub {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 14px 16px 12px;
		background: linear-gradient(115deg, color-mix(in oklab, var(--g1) 55%, var(--hero)), color-mix(in oklab, var(--g2) 55%, var(--hero)));
		color: #fff;
	}
	.pg-stub b {
		font: 400 26px/1 var(--f-serif, Georgia, serif);
		letter-spacing: 0.02em;
	}
	.pg-stub small {
		font-size: 13px;
		font-weight: 600;
		opacity: 0.85;
	}
	.pg-cut {
		height: 0;
		border-top: 2px dashed var(--line-strong, var(--line));
		margin: 0 14px;
	}
	.pg-ib {
		display: grid;
		align-content: start;
		gap: 6px;
		padding: 14px 16px 0;
	}
	.pg-n {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.pg-ib b {
		font: 400 20px/1.2 var(--f-serif, Georgia, serif);
	}
	.pg-ib small {
		font-size: 13px;
		line-height: 1.4;
		color: var(--ink-2);
	}
	.pg-ia {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 12px 12px 14px 16px;
	}
	.pg-in {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		font-weight: 600;
		color: var(--ok);
	}
	.pg-in :global(.ic) {
		width: 16px;
		height: 16px;
	}
	.pg-acts {
		display: flex;
		gap: 10px;
	}
	.pg-acts .btn {
		flex: 1;
	}
	/* Reels: posters */
	.pg-reel {
		position: relative;
		display: block;
		width: 132px;
		aspect-ratio: 9 / 16;
		max-width: 100%;
		border-radius: 18px;
		background-size: cover;
		background-position: center;
		color: #fff;
		text-decoration: none;
		overflow: hidden;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
	}
	.pg-reel::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(0, 0, 0, 0.25), transparent 30%, transparent 45%, rgba(0, 0, 0, 0.82));
	}
	.pg-rank {
		position: absolute;
		top: 8px;
		left: 10px;
		z-index: 1;
		font: italic 400 30px/1 var(--f-serif, Georgia, serif);
	}
	.pg-views {
		position: absolute;
		top: 10px;
		right: 8px;
		z-index: 1;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		border-radius: 99px;
		background: rgba(0, 0, 0, 0.45);
		font-size: 11.5px;
		font-weight: 700;
	}
	.pg-views :global(.ic) {
		width: 13px;
		height: 13px;
	}
	.pg-rc {
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: 10px;
		z-index: 1;
		display: grid;
		gap: 3px;
	}
	.pg-rc b {
		font-size: 13px;
		line-height: 1.25;
		font-weight: 600;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.pg-rc small {
		font-size: 11px;
		opacity: 0.8;
	}
	/* Tips */
	.pg-tip {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		width: min(80vw, 300px);
		padding: 16px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.pg-tn {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		background: var(--ink);
		color: var(--bg);
		font: 400 18px/1 var(--f-serif, Georgia, serif);
	}
	.pg-tip p {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.pg-tip b {
		color: var(--ink);
	}
	/* Audience health row */
	.pg-hrow {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 14px;
		align-items: center;
		padding: 14px 16px;
		border: 0;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.pg-hrow > :global(.ic) {
		width: 20px;
		height: 20px;
		color: var(--ink-3);
	}
	.pg-ring {
		display: grid;
		place-items: center;
		width: 58px;
		height: 58px;
		border-radius: 50%;
		background: radial-gradient(closest-side, var(--surface) 76%, transparent 78%), conic-gradient(var(--hue) calc(var(--p) * 360deg), color-mix(in oklab, var(--ink) 10%, transparent) 0);
	}
	.pg-ring b {
		font: 400 22px/1 var(--f-serif, Georgia, serif);
	}
	.pg-ht {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.pg-ht small {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.pg-ht b {
		font: 400 20px/1.15 var(--f-serif, Georgia, serif);
	}
	.pg-ht em {
		font-style: normal;
		font-size: 13px;
		color: var(--ink-2);
	}
	/* Collab partners */
	.pg-inv {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		align-items: center;
		padding: 14px;
		border-radius: 18px;
		background: color-mix(in oklab, var(--g2) 10%, var(--surface));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g2) 35%, var(--line));
	}
	.pg-inv b {
		display: block;
		font-size: 15px;
	}
	.pg-inv small {
		font-size: 13px;
		color: var(--ink-2);
	}
	.pg-yn {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.pg-peer {
		display: grid;
		justify-items: center;
		gap: 4px;
		width: 150px;
		padding: 16px 12px 14px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		text-align: center;
	}
	.pg-peer b {
		margin-top: 6px;
		font: 400 17px/1.2 var(--f-serif, Georgia, serif);
	}
	.pg-peer small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.pg-reach {
		margin: 4px 0 6px;
		padding: 3px 9px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		color: var(--ok);
		font-size: 11.5px;
		font-weight: 700;
	}
	.pg-peer .btn {
		width: 100%;
	}
	/* Boost ticket */
	.pg-boost {
		display: grid;
		border-radius: 22px;
		background: radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--g3) 16%, transparent), transparent 60%), var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.pg-bt {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 14px;
		align-items: center;
		padding: 16px;
	}
	.pg-bth {
		width: 62px;
		aspect-ratio: 9 / 16;
		border-radius: 12px;
		background-size: cover;
		background-position: center;
	}
	.pg-bt b {
		display: block;
		margin-top: 4px;
		font: 400 19px/1.2 var(--f-serif, Georgia, serif);
	}
	.pg-x {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ok);
	}
	.pg-cut2 {
		border-top: 2px dashed var(--line-strong, var(--line));
		margin: 0 16px;
	}
	.pg-facts {
		display: grid;
		gap: 0;
		margin: 0;
		padding: 6px 16px;
	}
	.pg-facts div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 9px 0;
		font-size: 13.5px;
	}
	.pg-facts div + div {
		border-top: 1px solid var(--line);
	}
	.pg-facts dt {
		color: var(--ink-3);
	}
	.pg-facts dd {
		margin: 0;
		font-weight: 600;
		text-align: right;
	}
	.pg-bb {
		margin: 6px 16px 16px;
	}
	/* Empty */
	.pg-empty {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		align-items: center;
		padding: 16px;
		border-radius: 18px;
		border: 1px dashed var(--line-strong, var(--line));
		color: var(--ink-3);
	}
	.pg-empty > :global(.ic) {
		width: 22px;
		height: 22px;
	}
	.pg-empty b {
		display: block;
		color: var(--ink);
		font-size: 15px;
	}
	.pg-empty small {
		font-size: 13px;
	}
	@keyframes pg-sk {
		to {
			background-position: -300% 0;
		}
	}
	/* Keep the Content card's shared hero background and mesh; only Grow's layout is local. */
	.pg { gap: 26px; }
	.pg .pg-hero {
		position: relative; isolation: isolate; overflow: hidden; border-radius: 28px;
	}
	.pg-h-in { padding: 22px 20px 18px; }
	.pg-big { font-size: 64px; padding-right: 90px; margin-top: 6px; }
	.pg-eb { opacity: .9; }
	.pg-orbit { position: absolute; z-index: 1; top: 48px; right: 18px; width: 86px; height: 86px; display: grid; place-items: center; pointer-events: none; }
	.pg-orbit span { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 0deg, var(--g1), transparent 27%, var(--g2) 50%, var(--g3) 72%, transparent 90%, var(--g1)); mask: radial-gradient(closest-side, transparent calc(100% - 2px), #000 calc(100% - 1px)); animation: pg-orbit-turn 24s linear infinite; }
	.pg-orbit i { position: absolute; inset: 10px; border: 1px solid rgba(255, 255, 255, .16); border-radius: 50%; background: radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--g2) 35%, transparent), color-mix(in oklab, var(--g1) 20%, transparent)); box-shadow: 0 0 30px -10px var(--g1); }
	.pg-orbit :global(svg) { position: relative; width: 28px; height: 28px; color: var(--hero-ink); }
	.pg-line { height: 58px; }
	.pg-fill { fill: url(#grow-chart-fill); }
	.pg-stroke { stroke: var(--g2); stroke-width: 2.5; filter: drop-shadow(0 0 5px color-mix(in oklab, var(--g2) 75%, transparent)); stroke-dasharray: 1; animation: pg-line-draw 1.2s ease-out both; }
	.pg-stats { border: 1px solid color-mix(in oklab, var(--hero-ink) 12%, transparent); border-radius: 16px; background: color-mix(in oklab, var(--hero-ink) 6%, transparent); }
	.pg-stats span { padding: 12px; }
	.pg-stats span + span { padding-left: 12px; }
	.pg-stats small { opacity: .8; }
	.pg-stats b { margin-top: 2px; color: var(--hero-ink); font-size: 26px; }
	.pg-tool { border-radius: 21px; border: 1px solid color-mix(in oklab, var(--hue) 28%, var(--line)); background: radial-gradient(130% 120% at 100% 0%, color-mix(in oklab, var(--hue) 27%, transparent), transparent 70%), var(--surface); box-shadow: 0 8px 24px -22px var(--hue); }
	.pg-ti { border: 1px solid color-mix(in oklab, var(--hue) 36%, transparent); background: linear-gradient(140deg, color-mix(in oklab, var(--hue) 35%, transparent), color-mix(in oklab, var(--hue) 9%, var(--surface))); box-shadow: inset 0 1px 0 color-mix(in oklab, var(--hue) 32%, transparent); }
	.pg-tool b { font-size: 21px; font-style: italic; }
	.pg-sh h2 { font-size: 28px; }
	.pg-idea { border: 1px solid color-mix(in oklab, var(--g1) 32%, var(--line)); background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--g1) 15%, transparent), transparent 70%), var(--surface); }
	.pg-idea:nth-child(3n + 2) { border-color: color-mix(in oklab, var(--g2) 32%, var(--line)); background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--g2) 15%, transparent), transparent 70%), var(--surface); }
	.pg-idea:nth-child(3n + 3) { border-color: color-mix(in oklab, var(--g3) 32%, var(--line)); background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--g3) 15%, transparent), transparent 70%), var(--surface); }
	.pg-stub { background: linear-gradient(115deg, color-mix(in oklab, var(--g1) 65%, var(--hero)), color-mix(in oklab, var(--g2) 55%, var(--hero))); }
	.pg-idea:nth-child(3n + 2) .pg-stub { background: linear-gradient(115deg, color-mix(in oklab, var(--g2) 60%, var(--hero)), color-mix(in oklab, var(--g3) 45%, var(--hero))); }
	.pg-idea:nth-child(3n + 3) .pg-stub { background: linear-gradient(115deg, color-mix(in oklab, var(--g3) 55%, var(--hero)), color-mix(in oklab, var(--g1) 55%, var(--hero))); }
	.pg-stub b { font-size: 30px; font-style: italic; }
	.pg-ib b { font-size: 23px; }
	.pg-reel { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .14), 0 8px 22px -20px var(--g2); }
	.pg-tip { border: 1px solid color-mix(in oklab, var(--g2) 23%, var(--line)); background: radial-gradient(120% 100% at 0% 0%, color-mix(in oklab, var(--g2) 14%, transparent), transparent 70%), var(--surface); }
	.pg-tn { color: var(--hero-ink); background: linear-gradient(140deg, color-mix(in oklab, var(--g1) 75%, var(--hero)), color-mix(in oklab, var(--g2) 70%, var(--hero))); border-radius: 9px; }
	.pg-hrow { border: 1px solid color-mix(in oklab, var(--g1) 22%, var(--line)); background: radial-gradient(100% 140% at 100% 0%, color-mix(in oklab, var(--g1) 20%, transparent), transparent 70%), var(--surface); }
	.pg-peer { border: 1px solid color-mix(in oklab, var(--g1) 24%, var(--line)); background: radial-gradient(100% 80% at 50% 0%, color-mix(in oklab, var(--g1) 18%, transparent), transparent 70%), var(--surface); }
	.pg-boost { border: 1px solid color-mix(in oklab, var(--g3) 30%, var(--line)); background: radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g3) 25%, transparent), transparent 70%), var(--surface); }
	.pg-empty { border-style: solid; border-color: color-mix(in oklab, var(--g1) 22%, var(--line)); background: radial-gradient(120% 130% at 0% 0%, color-mix(in oklab, var(--g1) 11%, transparent), transparent 70%), var(--surface); }
	.pg-empty > :global(svg) { box-sizing: content-box; width: 22px; height: 22px; padding: 9px; border-radius: 12px; background: color-mix(in oklab, var(--g1) 15%, transparent); color: var(--g1); }
	@keyframes pg-orbit-turn { to { transform: rotate(360deg); } }
	@keyframes pg-line-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
	@media (prefers-reduced-motion: reduce) { .pg-orbit span, .pg-stroke, .pg-idea.sk { animation: none; } }
</style>
