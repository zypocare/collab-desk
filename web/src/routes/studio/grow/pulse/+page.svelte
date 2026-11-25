<script lang="ts">
	import { onMount } from 'svelte';
	import { invokeFn, loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import { igImg } from '#lib/igImg.ts';
	import {
		buildFallbackPulse,
		isGoldenHour,
		minutesSince,
		statusCopy,
		suggestKeywordFromCaption,
		type LaunchPulse,
		type PulseComment
	} from '#lib/pulse.ts';
	import Icon from '#lib/components/Icon.svelte';

	let pulses = $state<LaunchPulse[]>([]);
	let comments = $state<PulseComment[]>([]);
	let needsCommentPerm = $state(false);
	let loading = $state(true);
	let syncing = $state(false);
	let commentsOpen = $state(false);
	let replyingId = $state('');
	let keywordInput = $state('');
	let savingDm = $state(false);
	let storyDoneLocal = $state(false);

	const connected = $derived(!!studio.ig?.connected);

	const activePulse = $derived.by<LaunchPulse | null>(() => {
		if (pulses.length) return pulses[0];
		return buildFallbackPulse(studio.media);
	});

	const pastPulses = $derived(pulses.slice(1, 6));

	const ageMin = $derived(activePulse ? minutesSince(activePulse.posted_at) : 0);
	const inGoldenHour = $derived(activePulse ? isGoldenHour(activePulse.posted_at) : false);
	const minutesLeft = $derived(Math.max(0, 60 - ageMin));
	const meta = $derived(activePulse ? statusCopy(activePulse.status) : null);

	const sharesPer1k = $derived.by(() => {
		if (!activePulse || activePulse.latest_views <= 0) return 0;
		return (activePulse.latest_shares / activePulse.latest_views) * 1000;
	});

	const savesPer1k = $derived.by(() => {
		if (!activePulse || activePulse.latest_views <= 0) return 0;
		return (activePulse.latest_saves / activePulse.latest_views) * 1000;
	});

	const expectedNow = $derived.by(() => {
		if (!activePulse) return 1;
		const m = Math.min(60, Math.max(5, ageMin));
		const frac = Math.min(1, Math.max(0.12, Math.pow(m / 60, 0.85)));
		return Math.max(50, activePulse.median_views * frac);
	});

	const viewMult = $derived(activePulse ? activePulse.latest_views / expectedNow : 1);
	const viewPct = $derived(Math.round((viewMult - 1) * 100));
	const shareMult = $derived(activePulse && activePulse.median_shares_1k > 0 ? sharesPer1k / activePulse.median_shares_1k : 1);
	const savePct = $derived(
		activePulse && activePulse.median_saves_1k > 0
			? Math.round((savesPer1k / activePulse.median_saves_1k - 1) * 100)
			: 0
	);

	const waitingComments = $derived(comments.filter((c) => !c.replied).length);
	const storyDone = $derived(!!activePulse?.story_done || storyDoneLocal);
	const dmActive = $derived(!!activePulse?.dm_keyword);
	const doneCount = $derived((comments.length > 0 && waitingComments === 0 ? 1 : 0) + (storyDone ? 1 : 0) + (dmActive ? 1 : 0));

	const ringOffset = $derived.by(() => {
		const score = activePulse?.pulse_score ?? 50;
		const circ = 263.89;
		return Number((circ * (1 - score / 100)).toFixed(1));
	});

	// SVG 0-60 min velocity curves
	const chart = $derived.by(() => {
		const W = 360;
		const H = 114;
		const padL = 8;
		const padR = 10;
		const padT = 10;
		const padB = 22;
		const p = activePulse;
		if (!p) return null;

		const medTotal = Math.max(250, p.median_views);
		const medPts = Array.from({ length: 13 }, (_, i) => {
			const m = i * 5;
			const v = m === 0 ? 0 : Math.round(medTotal * Math.pow(m / 60, 0.85));
			return { m, v };
		});

		const rawSnaps = (p.snapshots ?? [])
			.filter((s) => s.minute >= 0 && s.minute <= 60)
			.sort((a, b) => a.minute - b.minute);

		const curPts = [
			{ m: 0, v: 0 },
			...(rawSnaps.length
				? rawSnaps.map((s) => ({ m: Math.min(60, Math.max(1, s.minute)), v: s.views }))
				: [{ m: Math.min(60, Math.max(5, ageMin)), v: p.latest_views }])
		];

		const maxV = Math.max(
			medTotal,
			...curPts.map((pt) => pt.v),
			100
		) * 1.15;

		const xOf = (m: number) => padL + (m / 60) * (W - padL - padR);
		const yOf = (v: number) => padT + (1 - v / maxV) * (H - padT - padB);

		const medPath = medPts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${xOf(pt.m).toFixed(1)},${yOf(pt.v).toFixed(1)}`).join(' ');
		const curPath = curPts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${xOf(pt.m).toFixed(1)},${yOf(pt.v).toFixed(1)}`).join(' ');
		const last = curPts[curPts.length - 1];
		const lastX = Number(xOf(last.m).toFixed(1));
		const lastY = Number(yOf(last.v).toFixed(1));
		const baseY = H - padB;
		const areaPath = `${curPath} L${lastX},${baseY} L${xOf(0).toFixed(1)},${baseY} Z`;
		const ticks = [0, 15, 30, 45, 60].map((m) => ({ m, x: Number(xOf(m).toFixed(1)) }));

		return { medPath, curPath, areaPath, lastX, lastY, baseY, padT, H, ticks };
	});

	async function loadSavedPulses() {
		const { data } = await supabase
			.from('ig_launch_pulses')
			.select('*')
			.order('posted_at', { ascending: false })
			.limit(8);
		if (data) pulses = data as LaunchPulse[];
	}

	async function refreshLive(silent = false) {
		if (!connected || syncing) return;
		syncing = true;
		try {
			const res = (await invokeFn('golden-hour-pulse', { action: 'refresh' })) as {
				pulse?: LaunchPulse | null;
				comments?: PulseComment[];
				needsPerm?: boolean;
			};
			if (res?.pulse) {
				pulses = [res.pulse, ...pulses.filter((x) => x.id !== res.pulse!.id)];
				if (!keywordInput) keywordInput = res.pulse.dm_keyword || suggestKeywordFromCaption(res.pulse.caption);
			}
			if (Array.isArray(res?.comments)) comments = res.comments;
			needsCommentPerm = !!res?.needsPerm;
			if (!silent) toast('Synced live Instagram insights');
		} catch (e) {
			if (!silent) toast(errMessage(e));
		} finally {
			syncing = false;
		}
	}

	async function sendCommentReply(c: PulseComment) {
		if (replyingId) return;
		replyingId = c.id;
		try {
			await invokeFn('golden-hour-pulse', {
				action: 'reply_comment',
				comment_id: c.id,
				message: c.suggestedReply
			});
			comments = comments.map((x) => (x.id === c.id ? { ...x, replied: true } : x));
			toast(`Replied to @${c.username} on Instagram`);
		} catch (e) {
			toast(errMessage(e));
		} finally {
			replyingId = '';
		}
	}

	async function copyStoryHook() {
		if (!activePulse) return;
		const clean = activePulse.story_hook.replace(/^"|"$/g, '');
		await copyText(clean, 'Story hook copied — paste over your Reel reshare');
		storyDoneLocal = true;
		if (activePulse.id) {
			invokeFn('golden-hour-pulse', { action: 'mark_story', pulse_id: activePulse.id }).catch(() => {});
			pulses = pulses.map((p) => (p.id === activePulse.id ? { ...p, story_done: true } : p));
		}
	}

	async function activateDmRule() {
		if (!activePulse || savingDm) return;
		const kw = (keywordInput || suggestKeywordFromCaption(activePulse.caption))
			.trim()
			.toUpperCase()
			.replace(/[^A-Z0-9_-]/g, '');
		if (kw.length < 2) {
			toast('Enter a keyword with at least 2 letters');
			return;
		}
		savingDm = true;
		try {
			await invokeFn('golden-hour-pulse', {
				action: 'activate_dm',
				pulse_id: activePulse.id,
				keyword: kw,
				reply: 'Hi! Thanks for commenting — here is the link & details you asked for: {link}'
			});
			keywordInput = kw;
			if (activePulse.id) {
				pulses = pulses.map((p) => (p.id === activePulse.id ? { ...p, dm_keyword: kw } : p));
			}
			toast(`Comment-to-DM active for "${kw}"`);
		} catch (e) {
			toast(errMessage(e));
		} finally {
			savingDm = false;
		}
	}

	function shortTime(isoStr: string): string {
		const m = minutesSince(isoStr);
		if (m < 60) return `${m}m ago`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h}h ago`;
		return new Date(isoStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	}

	onMount(async () => {
		if (!studio.media.length) await loadInstagram();
		await loadSavedPulses();
		if (activePulse && !keywordInput) {
			keywordInput = activePulse.dm_keyword || suggestKeywordFromCaption(activePulse.caption);
		}
		loading = false;
		if (connected) void refreshLive(true);
	});
</script>

<svelte:head><title>Golden Hour Pulse · Miracle</title></svelte:head>

<div class="gh">
	<header class="gh-head">
		<div class="gh-top">
			<h1>Golden Hour Pulse</h1>
			<button class="gh-sync" onclick={() => refreshLive(false)} disabled={syncing || !connected}>
				<Icon name="refresh" />
				<span>{syncing ? 'Syncing…' : 'Sync now'}</span>
			</button>
		</div>
		<p>First-60-minute momentum vs your 90-day median — so you can ride Explore early or rescue a slow start.</p>
	</header>

	{#if loading}
		<div class="gh-empty"><span class="ring"><span></span></span></div>
	{:else if !connected}
		<section class="gh-card gh-empty">
			<span class="gh-ic-lg"><Icon name="link" /></span>
			<b>Connect Instagram to track your Golden Hour</b>
			<small>Miracle watches your Reel's first 60 minutes, compares shares and saves to your 90-day median, and nudges you while momentum is hot.</small>
			<a class="gh-neopop" href="/studio/settings?s=profile"><Icon name="link" />Connect Instagram</a>
		</section>
	{:else if !activePulse || !meta}
		<section class="gh-card gh-empty">
			<span class="gh-ic-lg"><Icon name="film" /></span>
			<b>Post a Reel to start your first Golden Hour Pulse</b>
			<small>As soon as a new Reel goes live, Miracle automatically tracks minute-by-minute views, shares, and early comments here.</small>
		</section>
	{:else}
		<!-- Hero Momentum Card -->
		<section class="gh-hero" style="--gh-accent:{meta.color}">
			<div class="gh-hero-top">
				<span class="gh-pill">
					<span class="gh-dot"></span>
					<span>{meta.pill}</span>
				</span>
				<span class="gh-timer">
					<Icon name="clock" />
					<span>{inGoldenHour ? `${minutesLeft}m left` : 'Hour 1 complete'}</span>
				</span>
			</div>

			<div class="gh-hero-main">
				<div class="gh-radar">
					{#if inGoldenHour}
						<span class="gh-wave" aria-hidden="true"></span>
						<span class="gh-wave w2" aria-hidden="true"></span>
					{/if}
					<svg class="gh-ring" viewBox="0 0 100 100" aria-hidden="true">
						<circle class="gh-ring-track" cx="50" cy="50" r="42" />
						<circle
							class="gh-ring-prog"
							cx="50"
							cy="50"
							r="42"
							stroke-dasharray="263.89"
							stroke-dashoffset={ringOffset}
						/>
					</svg>
					<div class="gh-ring-val">
						<b>{activePulse.pulse_score}</b>
						<small>Pulse</small>
					</div>
				</div>

				<div class="gh-hero-copy">
					<h2>{meta.title}</h2>
					<p>
						{#if activePulse.status === 'hot'}
							Shares are {shareMult.toFixed(1)}x your median. Reply to waiting comments now to keep Instagram pushing this Reel.
						{:else if activePulse.status === 'steady'}
							Tracking close to your usual pace. Answering early comments or resharing to Stories can trigger a second wave.
						{:else}
							Starting below your usual pace. Reshare to Stories with a curiosity hook and pin a Comment-to-DM keyword to spark replies.
						{/if}
					</p>
				</div>
			</div>

			<a class="gh-reel" href={activePulse.permalink || '#'} target="_blank" rel="noopener">
				{#if activePulse.thumbnail_url}
					<img class="gh-thumb" src={igImg(activePulse.thumbnail_url)} alt="" />
				{:else}
					<span class="gh-thumb gh-thumb-ph"><Icon name="film" /></span>
				{/if}
				<span class="gh-reel-meta">
					<b>{activePulse.caption || 'Latest Instagram Reel'}</b>
					<small>Posted {shortTime(activePulse.posted_at)} · {activePulse.latest_comments} comments</small>
				</span>
				<span class="gh-mult">{Math.max(0.1, viewMult).toFixed(1)}x</span>
			</a>
		</section>

		<!-- Algorithm Signal Trio -->
		<section class="gh-sigs" aria-label="Algorithm signals">
			<div class="gh-sig">
				<span class="gh-sk">Views</span>
				<b class="gh-sv">{activePulse.latest_views.toLocaleString('en-IN')}</b>
				<span class="gh-sd" class:up={viewPct >= 10} class:down={viewPct < -10}>
					{viewPct >= 0 ? `+${viewPct}%` : `${viewPct}%`} vs usual
				</span>
			</div>
			<div class="gh-sig hi">
				<span class="gh-sk">Shares / 1k <Icon name="send" /></span>
				<b class="gh-sv">{sharesPer1k.toFixed(1)}</b>
				<span class="gh-sd" class:up={shareMult >= 1.15} class:down={shareMult < 0.85}>
					{shareMult.toFixed(1)}x median
				</span>
			</div>
			<div class="gh-sig">
				<span class="gh-sk">Saves / 1k</span>
				<b class="gh-sv">{savesPer1k.toFixed(1)}</b>
				<span class="gh-sd" class:up={savePct >= 10} class:down={savePct < -10}>
					{savePct >= 0 ? `+${savePct}%` : `${savePct}%`} vs usual
				</span>
			</div>
		</section>

		<!-- First-Hour Velocity Chart -->
		{#if chart}
			<section class="gh-card">
				<div class="gh-ch">
					<h3>First-hour velocity</h3>
					<small>{inGoldenHour ? `Minute ${ageMin} of 60` : 'First 60 min vs 90-day median'}</small>
				</div>
				<div class="gh-leg">
					<span><i class="l-now"></i>This Reel</span>
					<span><i class="l-med"></i>90-day median</span>
				</div>
				<div class="gh-chart-box">
					<svg class="gh-chart" viewBox="0 0 360 124" preserveAspectRatio="none" role="img" aria-label="First-hour Reel views vs median">
						<defs>
							<linearGradient id="ghStroke" x1="0%" y1="0%" x2="100%" y2="0%">
								<stop offset="0%" stop-color="#9C7BFF" />
								<stop offset="55%" stop-color="#F25A90" />
								<stop offset="100%" stop-color="#FFAE6B" />
							</linearGradient>
							<linearGradient id="ghFill" x1="0%" y1="0%" x2="0%" y2="100%">
								<stop offset="0%" stop-color="#F25A90" stop-opacity="0.28" />
								<stop offset="100%" stop-color="#9C7BFF" stop-opacity="0" />
							</linearGradient>
						</defs>
						{#each chart.ticks as t (t.m)}
							<line x1={t.x} y1={chart.padT} x2={t.x} y2={chart.baseY} stroke="#2A222B" stroke-width="1" />
							<text x={t.x} y={chart.H - 5} text-anchor="middle" fill="#8C828A" font-size="10">{t.m}m</text>
						{/each}
						<path d={chart.medPath} fill="none" stroke="#6E646C" stroke-width="1.6" stroke-dasharray="4 4" />
						<path d={chart.areaPath} fill="url(#ghFill)" />
						<path d={chart.curPath} fill="none" stroke="url(#ghStroke)" stroke-width="2.8" stroke-linecap="round" />
						<circle cx={chart.lastX} cy={chart.lastY} r="5" fill="#FFAE6B" stroke="#1A151A" stroke-width="2" />
					</svg>
				</div>
			</section>
		{/if}

		<!-- Interactive Golden Hour Playbook -->
		<section class="gh-card">
			<div class="gh-ch">
				<h3>Golden Hour playbook</h3>
				<small>{doneCount} of 3 done</small>
			</div>

			<div class="gh-plays">
				<!-- 1. Early Comments -->
				<div class="gh-play" class:done={comments.length > 0 && waitingComments === 0}>
					<div class="gh-play-row">
						<span class="gh-play-ic"><Icon name="send" /></span>
						<div class="gh-play-body">
							<b>
								{#if needsCommentPerm}
									Reply to early comments on Instagram
								{:else if comments.length && waitingComments === 0}
									All early comments answered
								{:else if waitingComments > 0}
									Reply to {waitingComments} early comment{waitingComments === 1 ? '' : 's'}
								{:else}
									Watch for early comments
								{/if}
							</b>
							<p>Replying in the first 30 minutes doubles comment velocity and signals active conversation to Instagram.</p>
						</div>
					</div>
					<div class="gh-play-acts">
						{#if needsCommentPerm}
							<a class="gh-neopop" href={activePulse.permalink || 'https://instagram.com'} target="_blank" rel="noopener">Open Reel comments</a>
						{:else if comments.length}
							<button class="gh-neopop" onclick={() => (commentsOpen = !commentsOpen)}>
								{commentsOpen ? 'Hide replies' : 'Open 1-tap replies'}
							</button>
						{:else}
							<button class="gh-soft" onclick={() => refreshLive(false)} disabled={syncing}>Check for new comments</button>
						{/if}
					</div>

					{#if commentsOpen && comments.length}
						<div class="gh-cm-list">
							{#each comments as c (c.id)}
								<div class="gh-cm">
									<div class="gh-cm-top">
										<b>@{c.username}</b>
										<small>{shortTime(c.timestamp)}</small>
									</div>
									<p>{c.text}</p>
									{#if c.replied}
										<span class="gh-replied"><Icon name="check" />Replied on Instagram</span>
									{:else}
										<div class="gh-cm-sug">
											<span>{c.suggestedReply}</span>
											<button class="gh-cm-send" onclick={() => sendCommentReply(c)} disabled={replyingId === c.id}>
												{replyingId === c.id ? 'Sending…' : 'Send'}
											</button>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- 2. Story Reshare Hook -->
				<div class="gh-play" class:done={storyDone}>
					<div class="gh-play-row">
						<span class="gh-play-ic"><Icon name="plus" /></span>
						<div class="gh-play-body">
							<b>Reshare to Story with curiosity hook</b>
							<p>Pulls your loyal followers into the Reel during minute 20–40 to lift watch completion.</p>
							<div class="gh-story-box">
								<small>Suggested Story overlay</small>
								<span>{activePulse.story_hook}</span>
							</div>
						</div>
					</div>
					<div class="gh-play-acts">
						<button class="gh-neopop" onclick={copyStoryHook}>
							<Icon name="copy" />
							<span>{storyDone ? 'Copy hook again' : 'Copy hook & mark done'}</span>
						</button>
					</div>
				</div>

				<!-- 3. Comment-to-DM Keyword -->
				<div class="gh-play" class:done={dmActive}>
					<div class="gh-play-row">
						<span class="gh-play-ic"><Icon name="spark" /></span>
						<div class="gh-play-body">
							<b>{dmActive ? `Comment-to-DM active for "${activePulse.dm_keyword}"` : 'Turn on a Comment-to-DM keyword'}</b>
							<p>Viewers who comment your keyword get an automatic DM with your link, spiking comment count in Hour 1.</p>
						</div>
					</div>
					<div class="gh-dm-row">
						<input
							class="gh-kw-input"
							type="text"
							maxlength="30"
							bind:value={keywordInput}
							placeholder="e.g. LINK"
							aria-label="Comment-to-DM keyword"
						/>
						<button class="gh-neopop" onclick={activateDmRule} disabled={savingDm}>
							{savingDm ? 'Saving…' : dmActive ? 'Update keyword' : 'Activate auto-DM'}
						</button>
					</div>
				</div>
			</div>
		</section>

		<!-- Past Launch Pulses -->
		{#if pastPulses.length}
			<section class="gh-card">
				<div class="gh-ch">
					<h3>Past Golden Hours</h3>
					<small>How Hour 1 predicted final reach</small>
				</div>
				<div class="gh-hist">
					{#each pastPulses as hp (hp.id)}
						<a class="gh-hrow" href={hp.permalink || '#'} target="_blank" rel="noopener">
							<span class="gh-hl">
								<b>{hp.caption || 'Instagram Reel'}</b>
								<small>{shortTime(hp.posted_at)} · {hp.latest_shares} shares</small>
							</span>
							<span class="gh-hr">
								<b style="color:{statusCopy(hp.status).color}">Pulse {hp.pulse_score}</b>
								<small>{hp.latest_views.toLocaleString('en-IN')} views</small>
							</span>
						</a>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	.gh {
		max-width: 640px;
		margin: 0 auto;
		display: grid;
		gap: 14px;
		padding-bottom: 28px;
	}
	.gh-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.gh-sync {
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
	.gh-sync:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.gh-head h1 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 30px;
		line-height: 1.08;
		margin: 0;
	}
	.gh-head p {
		margin: 5px 0 0;
		font-size: 13.5px;
		color: var(--ink-2);
		line-height: 1.45;
	}
	.gh-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 15px;
		display: grid;
		gap: 11px;
	}
	.gh-empty {
		place-items: center;
		text-align: center;
		padding: 32px 20px;
		gap: 10px;
	}
	.gh-empty b {
		font-size: 16px;
		color: var(--ink);
	}
	.gh-empty small {
		font-size: 13px;
		color: var(--ink-2);
		max-width: 340px;
		line-height: 1.45;
	}
	.gh-ic-lg {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		display: grid;
		place-items: center;
		color: var(--g1);
	}
	.gh-hero {
		border-radius: 22px;
		border: 1px solid var(--line-strong);
		background:
			radial-gradient(240px 180px at 50% 0%, color-mix(in oklab, var(--gh-accent) 20%, transparent), transparent 72%),
			linear-gradient(180deg, #1e1721 0%, #151018 100%);
		padding: 18px 16px 15px;
		display: grid;
		gap: 14px;
	}
	.gh-hero-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.gh-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 99px;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--gh-accent);
		background: color-mix(in oklab, var(--gh-accent) 12%, transparent);
		border: 1px solid color-mix(in oklab, var(--gh-accent) 45%, transparent);
	}
	.gh-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	.gh-timer {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11.5px;
		font-weight: 600;
		color: var(--ink-2);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--line);
		padding: 4px 9px;
		border-radius: 99px;
	}
	.gh-hero-main {
		display: grid;
		grid-template-columns: 104px 1fr;
		align-items: center;
		gap: 16px;
	}
	.gh-radar {
		position: relative;
		width: 104px;
		height: 104px;
		display: grid;
		place-items: center;
	}
	.gh-wave {
		position: absolute;
		inset: 4px;
		border-radius: 50%;
		border: 1px solid var(--gh-accent);
		opacity: 0;
		animation: ghPing 2.8s cubic-bezier(0.2, 0.7, 0.2, 1) infinite;
	}
	.gh-wave.w2 {
		animation-delay: 1.4s;
	}
	@keyframes ghPing {
		0% {
			transform: scale(0.76);
			opacity: 0.55;
		}
		100% {
			transform: scale(1.22);
			opacity: 0;
		}
	}
	.gh-ring {
		width: 104px;
		height: 104px;
		transform: rotate(-90deg);
	}
	.gh-ring-track {
		fill: none;
		stroke: rgba(255, 255, 255, 0.08);
		stroke-width: 6;
	}
	.gh-ring-prog {
		fill: none;
		stroke: var(--gh-accent);
		stroke-width: 6;
		stroke-linecap: round;
		transition: stroke-dashoffset 0.6s ease;
	}
	.gh-ring-val {
		position: absolute;
		display: grid;
		place-items: center;
		text-align: center;
	}
	.gh-ring-val b {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 36px;
		line-height: 0.95;
		color: var(--ink);
	}
	.gh-ring-val small {
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.gh-hero-copy h2 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 26px;
		line-height: 1.08;
		margin: 0 0 6px;
	}
	.gh-hero-copy p {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.gh-reel {
		padding-top: 12px;
		border-top: 1px dashed var(--line-strong);
		display: flex;
		align-items: center;
		gap: 11px;
		text-decoration: none;
		color: inherit;
	}
	.gh-thumb {
		width: 42px;
		height: 54px;
		border-radius: 9px;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.14);
		flex-shrink: 0;
	}
	.gh-thumb-ph {
		display: grid;
		place-items: center;
		background: linear-gradient(155deg, #3a254b 0%, #5b2444 55%, #2b1f2e 100%);
		color: var(--ink);
	}
	.gh-reel-meta {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.gh-reel-meta b {
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.gh-reel-meta small {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.gh-mult {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 12px;
		font-weight: 600;
		padding: 5px 9px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--line-strong);
		color: var(--gh-accent);
		flex-shrink: 0;
	}
	.gh-sigs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.gh-sig {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 11px 10px;
		display: grid;
		gap: 3px;
	}
	.gh-sig.hi {
		border-color: color-mix(in oklab, var(--g2) 45%, var(--line));
		background: linear-gradient(180deg, color-mix(in oklab, var(--g2) 9%, var(--surface)) 0%, var(--surface) 100%);
	}
	.gh-sk {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.gh-sv {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 28px;
		line-height: 1.05;
		font-variant-numeric: tabular-nums;
	}
	.gh-sd {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10.5px;
		font-weight: 600;
		color: var(--g1);
	}
	.gh-sd.up {
		color: var(--ok);
	}
	.gh-sd.down {
		color: var(--warn);
	}
	.gh-ch {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.gh-ch h3 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 20px;
		margin: 0;
	}
	.gh-ch small {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.gh-leg {
		display: flex;
		gap: 14px;
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.gh-leg span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.l-now {
		display: inline-block;
		width: 14px;
		height: 2.5px;
		border-radius: 2px;
		background: var(--grad);
	}
	.l-med {
		display: inline-block;
		width: 14px;
		border-top: 2px dashed var(--ink-3);
	}
	.gh-chart-box {
		width: 100%;
		height: 130px;
	}
	.gh-chart {
		width: 100%;
		height: 100%;
		display: block;
	}
	.gh-plays {
		display: grid;
		gap: 10px;
	}
	.gh-play {
		background: var(--surface-2);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 12px;
		display: grid;
		gap: 10px;
	}
	.gh-play.done {
		border-color: color-mix(in oklab, var(--ok) 40%, var(--line));
		background: color-mix(in oklab, var(--ok) 5%, var(--surface-2));
	}
	.gh-play-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}
	.gh-play-ic {
		width: 32px;
		height: 32px;
		border-radius: 10px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		display: grid;
		place-items: center;
		color: var(--ink-2);
		flex-shrink: 0;
	}
	.gh-play.done .gh-play-ic {
		color: var(--ok);
		border-color: color-mix(in oklab, var(--ok) 50%, var(--line));
	}
	.gh-play-body {
		flex: 1;
		min-width: 0;
	}
	.gh-play-body b {
		display: block;
		font-size: 13.5px;
		font-weight: 600;
	}
	.gh-play-body p {
		margin: 3px 0 0;
		font-size: 12px;
		line-height: 1.4;
		color: var(--ink-3);
	}
	.gh-play-acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.gh-neopop {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 13px;
		border-radius: 6px;
		border: 0;
		background: #f4eef2;
		color: #110d11;
		font-size: 12px;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		box-shadow: 3px 3px 0 var(--g2);
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.gh-neopop:active {
		transform: translate(2px, 2px);
		box-shadow: 1px 1px 0 var(--g2);
	}
	.gh-neopop:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.gh-soft {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: 8px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink-2);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.gh-cm-list {
		padding-top: 10px;
		border-top: 1px solid var(--line);
		display: grid;
		gap: 8px;
	}
	.gh-cm {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 11px;
		padding: 9px 10px;
		display: grid;
		gap: 6px;
	}
	.gh-cm-top {
		display: flex;
		justify-content: space-between;
		font-size: 11.5px;
	}
	.gh-cm-top small {
		color: var(--ink-3);
		font-family: var(--f-mono, ui-monospace, monospace);
	}
	.gh-cm p {
		margin: 0;
		font-size: 12.5px;
		color: var(--ink-2);
	}
	.gh-cm-sug {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		background: color-mix(in oklab, var(--g1) 9%, var(--surface));
		border: 1px solid color-mix(in oklab, var(--g1) 28%, var(--line));
		border-radius: 8px;
		padding: 6px 8px;
		font-size: 11.5px;
		color: var(--ink-2);
	}
	.gh-cm-send {
		padding: 5px 10px;
		border-radius: 7px;
		border: 0;
		background: var(--grad);
		color: #fff;
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
		flex-shrink: 0;
	}
	.gh-replied {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11.5px;
		font-weight: 600;
		color: var(--ok);
	}
	.gh-story-box {
		margin-top: 8px;
		padding: 10px 12px;
		border-radius: 11px;
		background: linear-gradient(125deg, rgba(156, 123, 255, 0.14), rgba(242, 90, 144, 0.12));
		border: 1px solid rgba(242, 90, 144, 0.3);
		font-size: 12.5px;
		line-height: 1.4;
		display: grid;
		gap: 4px;
	}
	.gh-story-box small {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--g3);
	}
	.gh-dm-row {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.gh-kw-input {
		width: 130px;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink);
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 12.5px;
		font-weight: 600;
		text-transform: uppercase;
	}
	.gh-hist {
		display: grid;
		gap: 8px;
	}
	.gh-hrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		text-decoration: none;
		color: inherit;
	}
	.gh-hl {
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.gh-hl b {
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.gh-hl small {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.gh-hr {
		text-align: right;
		font-family: var(--f-mono, ui-monospace, monospace);
		flex-shrink: 0;
		display: grid;
		gap: 2px;
	}
	.gh-hr b {
		font-size: 12.5px;
	}
	.gh-hr small {
		font-size: 11px;
		color: var(--ink-3);
	}
</style>
