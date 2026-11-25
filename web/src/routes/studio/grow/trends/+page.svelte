<script lang="ts">
	import { onMount } from 'svelte';
	import { askAi } from '#lib/ai.ts';
	import { invokeFn, loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	type MinedQuestion = {
		id: string;
		username: string;
		text: string;
		mediaCaption: string;
		permalink: string;
		timestamp: string;
	};

	type TrendItem = {
		title: string;
		format: string;
		why_now: string;
		hook: string;
		dm_keyword: string;
	};

	type QuestionIdea = {
		question: string;
		reel_title: string;
		hook: string;
	};

	type RadarResult = {
		trends: TrendItem[];
		question_ideas: QuestionIdea[];
	};

	let questions = $state<MinedQuestion[]>([]);
	let needsPerm = $state(false);
	let radar = $state<RadarResult | null>(null);
	let city = $state('');
	let busy = $state<'' | 'scan'>('');

	async function runRadar(silent = false) {
		if (busy) return;
		busy = 'scan';
		try {
			// 1. Mine real audience questions from recent Instagram comments (if connected)
			let mined: MinedQuestion[] = [];
			if (studio.ig?.connected) {
				try {
					const qRes = (await invokeFn('creator-benchmarks', { action: 'mine_comments' })) as {
						questions?: MinedQuestion[];
						needsPerm?: boolean;
					};
					mined = Array.isArray(qRes?.questions) ? qRes.questions : [];
					needsPerm = !!qRes?.needsPerm;
					questions = mined;
				} catch {
					/* proceed with trend radar even if comment mining fails */
				}
			}

			// 2. Pull any saved peer benchmark breakout topics to inform trends
			const { data: peerRows } = await supabase.from('creator_benchmarks').select('username, top_posts').limit(5);
			const peerTopics = (peerRows ?? [])
				.flatMap((p) => (Array.isArray(p.top_posts) ? p.top_posts : []))
				.map((post: { caption?: string }) => String(post?.caption ?? '').slice(0, 90))
				.filter(Boolean)
				.slice(0, 6);

			const topReels = studio.media
				.slice(0, 8)
				.map((m) => ({
					caption: (m.caption || '').replace(/#\S+/g, '').trim().slice(0, 80),
					views: Number(m.views ?? m.reach ?? 0),
					shares: Number(m.shares ?? 0),
					saves: Number(m.saves ?? 0)
				}));

			radar = await askAi<RadarResult>('trendradar', {
				niche: studio.settings?.niche ?? '',
				city: city.trim() || studio.settings?.city || 'India',
				top_reels: topReels,
				peer_topics: peerTopics,
				audience_questions: mined.slice(0, 10).map((q) => q.text)
			});

			if (!silent) toast('Trend Radar updated');
		} catch (err) {
			if (!silent) toast(errMessage(err), 'alert');
		} finally {
			busy = '';
		}
	}

	onMount(async () => {
		if (!studio.media.length) await loadInstagram();
		city = studio.settings?.city ?? '';
		void runRadar(true);
	});
</script>

<svelte:head><title>Trend Radar · Miracle</title></svelte:head>

<div class="tr">
	<header class="tr-head">
		<div class="tr-top">
			<h1>Trend Radar</h1>
			<button class="tr-sync" onclick={() => runRadar(false)} disabled={busy === 'scan'}>
				<Icon name="refresh" />
				<span>{busy === 'scan' ? 'Scanning…' : 'Refresh'}</span>
			</button>
		</div>
		<p>Rising Reel formats in your niche &amp; city, plus real questions mined from your followers' comments.</p>
	</header>

	<form class="tr-bar" onsubmit={(e) => (e.preventDefault(), runRadar(false))}>
		<input type="text" bind:value={city} placeholder="City or region (e.g. Bengaluru, Mumbai, India)" />
		<button class="tr-neopop" type="submit" disabled={busy === 'scan'}>
			<Icon name="spark" />
			<span>{busy === 'scan' ? 'Scanning…' : 'Scan trends'}</span>
		</button>
	</form>

	{#if busy === 'scan' && !radar}
		<section class="tr-card tr-empty">
			<span class="ring"><span></span></span>
			<small>Scanning your top Reels, peer topics, and follower comments…</small>
		</section>
	{:else}
		<!-- 1. Rising Formats in Niche -->
		{#if radar?.trends?.length}
			<section class="tr-sec">
				<div class="tr-sh">
					<h2>Rising formats right now</h2>
					<small>Tailored to {studio.settings?.niche || 'your niche'} · {city || 'India'}</small>
				</div>
				<div class="tr-list">
					{#each radar.trends as t, idx (idx)}
						<article class="tr-card">
							<div class="tr-meta">
								<span class="tr-pill">{t.format}</span>
								{#if t.dm_keyword}<span class="tr-kw">DM: {t.dm_keyword}</span>{/if}
							</div>
							<h3>{t.title}</h3>
							<p class="tr-why">{t.why_now}</p>
							<div class="tr-hook">
								<small>0–2s Hook</small>
								<span>“{t.hook}”</span>
							</div>
							<a class="tr-neopop sm" href="/studio/grow/studio?topic={encodeURIComponent(t.title)}">
								<Icon name="script" />
								<span>Build full script</span>
							</a>
						</article>
					{/each}
				</div>
			</section>
		{/if}

		<!-- 2. Audience Questions Mined from Comments -->
		<section class="tr-sec">
			<div class="tr-sh">
				<h2>What your followers keep asking</h2>
				<small>Mined from your recent Reel comments</small>
			</div>

			{#if needsPerm}
				<section class="tr-card tr-empty">
					<b>Enable comment access to mine follower questions</b>
					<small>Reconnect Instagram with comment permission in Settings so Miracle can spot recurring viewer questions automatically.</small>
					<a class="tr-soft" href="/studio/settings?s=profile">Open Instagram settings</a>
				</section>
			{:else if radar?.question_ideas?.length}
				<div class="tr-list">
					{#each radar.question_ideas as q, idx (idx)}
						<article class="tr-card">
							<span class="tr-q">“{q.question}”</span>
							<h3>{q.reel_title}</h3>
							<p class="tr-why">Hook: “{q.hook}”</p>
							<a class="tr-soft" href="/studio/grow/studio?topic={encodeURIComponent(q.reel_title)}">
								<Icon name="script" />
								<span>Turn into Reel script</span>
							</a>
						</article>
					{/each}
				</div>
			{:else if questions.length}
				<div class="tr-list">
					{#each questions.slice(0, 6) as q (q.id)}
						<article class="tr-card">
							<div class="tr-meta">
								<span class="tr-user">@{q.username}</span>
								<small>{q.mediaCaption}</small>
							</div>
							<p class="tr-q">“{q.text}”</p>
							<a class="tr-soft" href="/studio/grow/studio?topic={encodeURIComponent(`Answering follower question: ${q.text}`)}">
								<Icon name="script" />
								<span>Turn into Reel script</span>
							</a>
						</article>
					{/each}
				</div>
			{:else}
				<section class="tr-card tr-empty">
					<small>No viewer questions detected on your latest 8 Reels yet. As viewers ask for locations, links, or tips, they will show up here automatically.</small>
				</section>
			{/if}
		</section>
	{/if}
</div>

<style>
	.tr {
		max-width: 680px;
		margin: 0 auto;
		display: grid;
		gap: 16px;
		padding-bottom: 32px;
	}
	.tr-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.tr-head h1 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 30px;
		line-height: 1.08;
		margin: 0;
	}
	.tr-head p {
		margin: 5px 0 0;
		font-size: 13.5px;
		color: var(--ink-2);
		line-height: 1.45;
	}
	.tr-sync {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: 99px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink);
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.tr-bar {
		display: flex;
		gap: 8px;
		padding: 6px 6px 6px 14px;
		border-radius: 14px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
	}
	.tr-bar input {
		flex: 1;
		min-width: 0;
		height: 38px;
		border: 0;
		outline: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 14px;
	}
	.tr-neopop {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 9px 14px;
		border-radius: 7px;
		border: 0;
		background: #f4eef2;
		color: #110d11;
		font-size: 12.5px;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		box-shadow: 3px 3px 0 var(--g2);
		width: fit-content;
	}
	.tr-neopop.sm {
		padding: 8px 12px;
		font-size: 12px;
	}
	.tr-soft {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: 9px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 12px;
		font-weight: 600;
		text-decoration: none;
		width: fit-content;
	}
	.tr-sec {
		display: grid;
		gap: 10px;
	}
	.tr-sh {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.tr-sh h2 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 22px;
		margin: 0;
	}
	.tr-sh small {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.tr-list {
		display: grid;
		gap: 10px;
	}
	.tr-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 16px;
		padding: 14px 15px;
		display: grid;
		gap: 8px;
	}
	.tr-empty {
		place-items: center;
		text-align: center;
		padding: 26px 18px;
	}
	.tr-empty small {
		font-size: 13px;
		color: var(--ink-2);
		max-width: 340px;
		line-height: 1.45;
	}
	.tr-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.tr-pill {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 3px 9px;
		border-radius: 99px;
		color: var(--g1);
		background: color-mix(in oklab, var(--g1) 14%, var(--surface-2));
	}
	.tr-kw {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11px;
		font-weight: 600;
		color: var(--ok);
	}
	.tr-user {
		font-weight: 700;
		font-size: 12.5px;
		color: var(--g2);
	}
	.tr-card h3 {
		margin: 0;
		font-size: 15.5px;
		font-weight: 600;
		line-height: 1.35;
	}
	.tr-why {
		margin: 0;
		font-size: 13px;
		color: var(--ink-2);
		line-height: 1.45;
	}
	.tr-hook {
		padding: 8px 11px;
		border-left: 2px solid var(--g2);
		background: linear-gradient(90deg, color-mix(in oklab, var(--g2) 8%, transparent), transparent 85%);
		display: grid;
		gap: 2px;
	}
	.tr-hook small {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--g3);
	}
	.tr-hook span {
		font-size: 13px;
		color: var(--ink);
	}
	.tr-q {
		margin: 0;
		font-size: 13.5px;
		color: var(--g3);
		font-style: italic;
	}
</style>
