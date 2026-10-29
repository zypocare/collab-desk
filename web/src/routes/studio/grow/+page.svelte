<script lang="ts">
	import { onMount } from 'svelte';
	import { loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { audience, boostBudget, boostPick, cancelCollab, answerCollab, grow, insights, loadGrow, planIt, planWeek, setMode, setPlan, stats, topReels, weekIdeas } from '#lib/grow.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { copyText, countUp } from '#lib/ui.svelte.ts';
	import { compact, firstName } from '#lib/util.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import { checkups, latest, loadCheckups } from '#lib/checkup.svelte.ts';
	import Icon from '#lib/components/Icon.svelte';
	import HealthCard from '#lib/components/HealthCard.svelte';
	import PhoneGrow from '#lib/components/PhoneGrow.svelte';
	import GrowthCoach from '#lib/components/GrowthCoach.svelte';
	import DayPerformance from '#lib/components/DayPerformance.svelte';
	import InstagramPanel from '#lib/components/InstagramPanel.svelte';

	// Grow: real followers and views from what already works for her. Her numbers, what's working, this
	// week's reel ideas (the growth autopilot), collab reels with other creators, and a reel worth boosting.
	onMount(async () => {
		if (!studio.media.length) await loadInstagram();
		await Promise.all([loadGrow(), loadCheckups()]);
		if (studio.ig?.connected) planWeek();
	});
	const connected = $derived(!!studio.ig?.connected);
	const st = $derived(stats(studio.media, studio.followersHistory, studio.ig));
	const tips = $derived(insights(studio.media, studio.followersHistory));
	const top = $derived(topReels(studio.media));
	const boost = $derived(boostPick(studio.media));
	const aud = $derived(audience(studio.ig));
	const ideas = $derived(weekIdeas());
	const mode = $derived(studio.settings?.grow_mode ?? 'ask');
	const incoming = $derived(grow.reels.filter((r) => r.incoming && r.status === 'pending'));
	const outgoing = $derived(grow.reels.filter((r) => !r.incoming && r.status === 'pending'));
	const invited = $derived(new Set(outgoing.map((r) => r.with.id)));
	const when = (iso: string | null) => {
		if (!iso) return { d: 'Any', t: 'day' };
		const x = new Date(iso);
		return { d: x.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' }).toUpperCase(), t: x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).replace(/\s?(am|pm)/i, '') };
	};
	const line = $derived.by(() => {
		const v = st.line;
		if (v.length < 2) return '';
		const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
		return v.map((y, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * 400).toFixed(1)} ${(80 - ((y - lo) / span) * 70).toFixed(1)}`).join(' ');
	});
	const up = (n: number | null) => (n === null ? '' : `${n >= 0 ? '+' : ''}${n}%`);
	const fmtN = (n: number) => n.toLocaleString('en-IN');
	const budget = $derived(boostBudget(st.followers));
	const boostText = $derived(boost ? `Boost: ${(boost.m.caption || 'my reel').split('\n')[0].slice(0, 60)}\nAudience: ${aud.text || 'my followers’ cities and ages'}\nBudget: ₹${budget} a day for 3 days\nGoal: more profile visits` : '');
	async function boostIt() {
		if (!boost) return;
		await copyText(boostText, 'Settings copied. Tap Boost under the reel in Instagram.');
		window.open(boost.m.permalink, '_blank', 'noopener');
	}
	const thumb = (u: string, i: number) => (u ? `background-image:url("${u}")` : `background:linear-gradient(160deg,var(--m${(i % 6) + 1}),#1c151c)`);
</script>

<svelte:head><title>Grow · Miracle</title></svelte:head>

{#if !phone.on}
<header class="ph rv">
	<div>
		<div class="eb">Instagram · last 30 days</div>
		<h1>Grow your <em>reach</em></h1>
		<p>Real followers and views, from what already works for you. Miracle never buys followers or likes.</p>
	</div>
	<div class="acts"><a class="btn grad" href="/studio/grow/check"><Icon name="film" />Check a reel before you post</a></div>
</header>
{/if}

{#if !connected}
	<div class="clear hero-card glow m-none">
		<div class="mesh" aria-hidden="true"></div>
		<span class="clear-ic"><Icon name="chart" /></span>
		<b>Connect Instagram to see what's working</b>
		<small>Grow reads your own posts and followers (never your DMs) to show what brings you new people, and plans your week from it.</small>
		<div class="clear-acts"><a class="glass-chip" href="/studio/settings?s=profile"><Icon name="link" />Connect Instagram</a></div>
	</div>
{:else if phone.on}
	<PhoneGrow />
{:else}
	<!-- The growth check-up: why she isn't growing, and what to change -->
	{@const cu = latest()}
	<a class="gr-cu rv" class:warn={!!cu?.data.findings.length} href="/studio/grow/checkup">
		<span class="gr-it">
			{#if cu && cu.data.findings.length}<b>Growth check-up: {cu.data.findings.length} thing{cu.data.findings.length === 1 ? '' : 's'} holding you back</b><small>Biggest: {cu.data.findings[0].title.toLowerCase()}</small>
			{:else if cu}<b>Growth check-up: nothing big holding you back</b><small>See what works and what to do more of</small>
			{:else}<b>{checkups.running ? 'Reading your reels and audience…' : 'Run your growth check-up'}</b><small>Why you're not growing, and what to change</small>{/if}
		</span>
		<Icon name="chevR" />
	</a>

	<a class="gr-cu rv" href="/studio/grow/insights">
		<span class="gr-it"><b>All your insights</b><small>Reach, views, engagement, your audience and best posts: everything brands see</small></span>
		<Icon name="chevR" />
	</a>

	<!-- The numbers that matter for growth -->
	<section class="hero-card glow gr-hero rv" aria-label="Your growth">
		<div class="mesh" aria-hidden="true"></div>
		<div class="gr-h1">
			<span class="hc-eb">Followers</span>
			<b class="gr-big num" use:countUp={{ value: st.followers ?? 0 }}>{fmtN(st.followers ?? 0)}</b>
			{#if st.gained !== null}<small class:gr-ok={st.gained >= 0}>{st.gained >= 0 ? '+' : ''}{fmtN(st.gained)} this month</small>{/if}
		</div>
		{#if line}<svg class="gr-line" viewBox="0 0 400 90" preserveAspectRatio="none" role="img" aria-label="Followers over the last 30 days"><path d="{line} L400 90 L0 90 Z" class="gr-fill"></path><path d={line} class="gr-stroke"></path></svg>{/if}
		<div class="gr-nums">
			<span><small>Reel views</small><b class="num">{compact(st.views)}</b>{#if st.viewsUp !== null}<small class:gr-ok={(st.viewsUp ?? 0) >= 0}>{up(st.viewsUp)}</small>{/if}</span>
			<span><small>Shares</small><b class="num">{fmtN(st.shares)}</b>{#if st.sharesUp !== null}<small class:gr-ok={(st.sharesUp ?? 0) >= 0}>{up(st.sharesUp)}</small>{/if}</span>
			{#if st.watch !== null}<span><small>Avg. watch</small><b class="num">{st.watch.toFixed(1)}s</b><small>per reel</small></span>{/if}
		</div>
	</section>

	<GrowthCoach />

	<!-- What brands see before they book her: audience health and brand safety -->
	<div class="gr-health"><HealthCard health={studio.ig?.health} mine connected /></div>

	<div class="gr-grid">
		<!-- What's working -->
		<section class="panel gr-card rv" style="--i:1">
			<div class="gr-ch"><h2>What's working</h2><small>from your last {studio.media.length} posts</small></div>
			{#if top.length}
				<div class="gr-reels">
					{#each top as m, i (m.id)}
						<a class="gr-reel" href={m.permalink} target="_blank" rel="noopener">
							<span class="gr-th" style={thumb(m.thumbnail_url, i)}><i>{compact(m.views || m.reach || 0)} views</i></span>
							<b>{(m.caption || 'Reel').split('\n')[0].slice(0, 48)}</b>
							<small>{fmtN(m.shares ?? 0)} shares · {fmtN(m.saves ?? 0)} saves{m.avg_watch_ms ? ` · ${(m.avg_watch_ms / 1000).toFixed(1)}s watched` : ''}</small>
						</a>
					{/each}
				</div>
			{/if}
			{#if tips.length}
				<ol class="gr-tips">
					{#each tips as t, i (i)}
						{@const [a, b] = t.text.split('{b}')}
						<li><b class="gr-n">{i + 1}</b><span>{a}<b>{t.bold}</b>{b}</span></li>
					{/each}
				</ol>
			{:else}
				<p class="hint">Post a few more reels and this fills in with what brings you new people.</p>
			{/if}
		</section>

		<!-- The growth autopilot -->
		<section class="panel gr-card gr-auto rv" style="--i:2">
			<div class="gr-ch">
				<h2>Growth autopilot</h2>
				<div class="m-stages gr-seg" role="radiogroup" aria-label="Growth autopilot">
					<button role="radio" aria-checked={mode === 'ask'} class:on={mode === 'ask'} onclick={() => setMode('ask')}>Ask me</button>
					<button role="radio" aria-checked={mode === 'auto'} class:on={mode === 'auto'} onclick={() => setMode('auto')}>Auto</button>
				</div>
			</div>
			<small class="gr-sub">{mode === 'auto' ? 'Every week: three reel ideas from what worked, on your best days, straight into your Calendar.' : 'Every week: three reel ideas from what worked, on your best days. You approve them and they go in your Calendar.'}</small>
			{#if grow.planning && !ideas.length}
				<div class="loader" style="min-height:140px"><span class="ring"><span></span></span></div>
			{:else if ideas.length}
				<div class="gr-ideas">
					{#each ideas as p (p.id)}
						{@const w = when(p.post_at)}
						<div class="gr-idea" class:done={p.status !== 'idea'}>
							<span class="gr-when">{w.d}<br />{w.t}</span>
							<span class="gr-it"><b>{p.title}</b><small>{p.why}</small></span>
							{#if p.status === 'idea'}<button class="icon-btn" onclick={() => setPlan(p, { status: 'dropped' })} aria-label="Not this one"><Icon name="x" /></button>{:else}<Icon name="check" />{/if}
						</div>
					{/each}
				</div>
				<div class="gr-acts">
					{#if ideas.some((p) => p.status === 'idea')}<button class="btn primary" onclick={() => planIt(ideas.filter((p) => p.status === 'idea').map((p) => p.id))}><Icon name="cal" />Add {ideas.filter((p) => p.status === 'idea').length === 1 ? 'it' : `all ${ideas.filter((p) => p.status === 'idea').length}`} to Calendar</button>
					{:else}<a class="btn" href="/studio/calendar"><Icon name="cal" />See them in Calendar</a>{/if}
					<button class="btn" onclick={() => planWeek(true)} disabled={grow.planning}>{#if grow.planning}<span class="spinner"></span>{/if}New ideas</button>
				</div>
			{:else}
				<p class="hint">Ideas come once you have a few reels with views.</p>
			{/if}
		</section>
	</div>

	<DayPerformance />

	<div class="gr-grid">
		<!-- Collab reels -->
		<section class="panel gr-card rv" id="collab" style="--i:3">
			<div class="gr-ch"><h2>Collab reels</h2><small>one reel, posted on both accounts</small></div>
			{#each incoming as r (r.id)}
				<div class="gr-inv">
					<Avatar name={r.with.name} src={r.with.photo ?? ''} size="44px" />
					<span class="gr-it"><b>{r.with.name} invited you</b><small>“{r.idea}”{r.post_at ? ` · post ${when(r.post_at).d} ${when(r.post_at).t}` : ''}</small></span>
					<button class="btn sm primary" onclick={() => answerCollab(r, true)}>Yes</button>
					<button class="btn sm" onclick={() => answerCollab(r, false)}>No</button>
				</div>
			{/each}
			<small class="gr-sub">Creators on Miracle in your niche and about your size. A collab reel shows to both audiences: the surest way to real new followers.</small>
			{#if grow.matches.length}
				<div class="gr-peers">
					{#each grow.matches.slice(0, phone.on ? 4 : 6) as c (c.id)}
						<div class="gr-peer">
							<Avatar name={c.name} src={c.photo ?? ''} size="48px" />
							<b>{c.name}</b>
							<small>{[c.niche?.split(',')[0]?.trim(), c.city].filter(Boolean).join(' · ')}</small>
							{#if c.followers}<small class="gr-ok">Shows to their {compact(c.followers)} followers</small>{/if}
							{#if invited.has(c.id)}<button class="btn sm" onclick={() => { const r = outgoing.find((x) => x.with.id === c.id); if (r) cancelCollab(r); }}>Invited · cancel</button>
							{:else}<a class="btn sm" href="/studio/grow/collab/{c.id}">Invite</a>{/if}
						</div>
					{/each}
				</div>
			{:else if grow.loaded}
				<p class="hint">No creators in your niche on Miracle yet. As more join, they show up here.</p>
			{/if}
		</section>

		<!-- Boost -->
		<section class="panel gr-card gr-boost rv" style="--i:4">
			<h2>Boost what already works</h2>
			{#if boost}
				<div class="gr-bp">
					<span class="gr-th sm" style={thumb(boost.m.thumbnail_url, 0)}></span>
					<span class="gr-it"><b>{(boost.m.caption || 'Your reel').split('\n')[0].slice(0, 60)}</b><small class="gr-ok">Shared and saved {boost.r.toFixed(1)}× more than your usual reel</small></span>
				</div>
				<div class="gr-facts">
					{#if aud.text}<span><small>Who to show it to</small><b>{aud.text}</b></span>{/if}
					<span><small>To start</small><b>₹{budget} a day for 3 days</b></span>
					<span><small>Goal</small><b>More profile visits</b></span>
				</div>
				<button class="btn grad" onclick={boostIt}><Icon name="spark" />Boost it in Instagram</button>
				<small class="gr-sub">Copies these settings and opens the reel in Instagram; tap Boost under it. You pay Instagram directly. Miracle takes nothing and never sees your card.</small>
			{:else}
				<p class="hint">When one of your recent reels is shared much more than usual, it shows up here as the one worth boosting. Boosting a reel people already share gets real followers for less.</p>
			{/if}
		</section>
	</div>
{/if}

<!-- Her Instagram numbers and latest posts (moved here from Content): followers, engagement, views, reach, the insights
     link brands see, and each recent post with the brand it was for. -->
{#if connected}<InstagramPanel />{/if}

<style>
	.gr-health {
		margin-bottom: 18px;
	}
	.gr-cu {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 16px 18px;
		margin-bottom: 16px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong, var(--line));
		color: inherit;
		text-decoration: none;
	}
	.gr-cu.warn {
		background: color-mix(in oklab, var(--bad) 8%, var(--surface));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 35%, transparent);
	}
	.gr-cu b {
		font-size: 15px;
	}
	.gr-hero {
		position: relative;
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr) auto;
		gap: 24px;
		align-items: center;
		padding: 24px 28px;
		margin-bottom: 20px;
	}
	.gr-hero > :not(.mesh) {
		position: relative;
		z-index: 1;
	}
	.gr-h1 {
		display: grid;
		gap: 6px;
	}
	.gr-big {
		font: 400 56px/1 var(--f-serif, Georgia, serif);
	}
	.gr-ok {
		color: var(--ok) !important;
	}
	.gr-line {
		width: 100%;
		height: 90px;
	}
	.gr-stroke {
		fill: none;
		stroke: var(--accent);
		stroke-width: 3;
		vector-effect: non-scaling-stroke;
	}
	.gr-fill {
		fill: color-mix(in oklab, var(--accent) 16%, transparent);
	}
	.gr-nums {
		display: flex;
		gap: 28px;
	}
	.gr-nums span {
		display: grid;
		gap: 2px;
	}
	.gr-nums small {
		font-size: 12px;
		opacity: 0.8;
	}
	.gr-nums b {
		font-size: 24px;
	}
	.gr-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 420px;
		gap: 20px;
		margin-bottom: 20px;
		align-items: start;
	}
	.gr-card {
		display: grid;
		gap: 14px;
		padding: 22px 24px;
	}
	.gr-ch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.gr-ch h2,
	.gr-boost h2 {
		margin: 0;
		font: 400 28px/1 var(--f-serif, Georgia, serif);
	}
	.gr-ch small,
	.gr-sub {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.gr-reels {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 14px;
	}
	.gr-reel {
		display: grid;
		gap: 6px;
		text-decoration: none;
		color: inherit;
		min-width: 0;
	}
	.gr-reel b {
		font-size: 13.5px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.gr-reel small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.gr-th {
		position: relative;
		aspect-ratio: 9 / 12;
		border-radius: 16px;
		background-size: cover;
		background-position: center;
	}
	.gr-th.sm {
		width: 72px;
		border-radius: 10px;
	}
	.gr-th i {
		position: absolute;
		left: 10px;
		top: 10px;
		padding: 3px 8px;
		border-radius: 99px;
		background: rgba(0, 0, 0, 0.5);
		color: #fff;
		font: 700 11px var(--f-body);
	}
	.gr-tips {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 8px;
	}
	.gr-tips li {
		display: flex;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2, var(--surface));
		font-size: 14px;
		line-height: 1.45;
	}
	.gr-n {
		color: var(--accent);
	}
	.gr-seg {
		margin: 0;
		flex: none;
	}
	.gr-ideas {
		display: grid;
		gap: 8px;
	}
	.gr-idea {
		display: grid;
		grid-template-columns: 54px minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 12px;
		border-radius: 14px;
		background: var(--surface-2, var(--surface));
	}
	.gr-idea.done {
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--ok) 40%, transparent);
	}
	.gr-idea > :global(.ic) {
		color: var(--ok);
	}
	.gr-when {
		display: grid;
		place-items: center;
		height: 54px;
		border-radius: 12px;
		background: var(--line);
		font-size: 11px;
		font-weight: 700;
		text-align: center;
		line-height: 1.2;
	}
	.gr-it {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.gr-it b {
		font-size: 14px;
	}
	.gr-it small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.gr-acts {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
	}
	.gr-acts :global(.btn) {
		justify-content: center;
	}
	.gr-inv {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) auto auto;
		gap: 10px;
		align-items: center;
		padding: 12px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--accent) 8%, var(--surface));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 35%, transparent);
	}
	.gr-peers {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	.gr-peer {
		display: grid;
		gap: 6px;
		justify-items: start;
		padding: 16px;
		border-radius: 16px;
		background: var(--surface-2, var(--surface));
		min-width: 0;
	}
	.gr-peer b {
		font-size: 15px;
	}
	.gr-peer small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.gr-boost {
		background: radial-gradient(120% 120% at 100% 0%, color-mix(in oklab, var(--g3, #ffae6b) 14%, transparent), transparent 55%), var(--surface);
	}
	.gr-bp {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 12px;
		align-items: center;
	}
	.gr-facts {
		display: grid;
		gap: 6px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2, var(--surface));
		font-size: 13px;
	}
	.gr-facts span {
		display: flex;
		justify-content: space-between;
		gap: 10px;
	}
	.gr-facts small {
		color: var(--ink-3);
	}
	.gr-facts b {
		text-align: right;
	}
	.gr-boost :global(.btn.grad) {
		justify-content: center;
		height: 46px;
	}
	@media (max-width: 1100px) {
		.gr-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.gr-hero {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 760px) {
		.gr-hero {
			padding: 20px;
			gap: 12px;
		}
		.gr-big {
			font-size: 48px;
		}
		.gr-nums {
			justify-content: space-between;
			gap: 12px;
		}
		.gr-nums b {
			font-size: 18px;
		}
		.gr-reels {
			grid-template-columns: repeat(3, 116px);
			overflow-x: auto;
			scrollbar-width: none;
		}
		.gr-peers {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.gr-inv {
			grid-template-columns: 44px minmax(0, 1fr);
		}
		.gr-inv :global(.btn) {
			grid-column: span 1;
		}
		.gr-card {
			padding: 18px;
		}
	}
</style>
