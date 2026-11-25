<script lang="ts">
	import { onMount } from 'svelte';
	import { invokeFn, loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage } from '#lib/util.ts';
	import { igImg } from '#lib/igImg.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { portal } from '#lib/portal.ts';

	type PeerPost = {
		id: string;
		caption: string;
		likes: number;
		comments: number;
		media_type: string;
		permalink: string;
		timestamp: string;
	};

	type Peer = {
		id: string;
		username: string;
		name: string;
		profile_picture_url: string;
		followers_count: number;
		media_count: number;
		avg_likes: number;
		avg_comments: number;
		engagement_rate: number;
		posts_per_week: number;
		top_posts: PeerPost[];
		synced_at: string;
	};

	let peers = $state<Peer[]>([]);
	let handle = $state('');
	let loading = $state(true);
	let busy = $state<'' | 'add' | 'refresh'>('');
	let fetchingHandle = $state('');
	let fetchStep = $state(0);
	let suggestedHandle = $state('');
	let lookupNotice = $state('');

	const FETCH_STEPS = [
		'Locating public Instagram profile',
		'Reading followers & engagement pace',
		'Scanning recent breakout Reels'
	];

	$effect(() => {
		if (!busy) {
			fetchStep = 0;
			return;
		}
		fetchStep = 0;
		const timer = setInterval(() => {
			if (fetchStep < FETCH_STEPS.length - 1) fetchStep += 1;
		}, 1100);
		return () => clearInterval(timer);
	});

	const connected = $derived(!!studio.ig?.connected);

	const myStats = $derived.by(() => {
		const followers = Number(studio.ig?.followers ?? 0);
		const recent = studio.media.slice(0, 12);
		const avgEng = recent.length
			? recent.reduce((a, m) => a + Number(m.likes ?? 0) + Number(m.comments ?? 0), 0) / recent.length
			: 0;
		const er = followers > 0 ? Number(((avgEng / followers) * 100).toFixed(2)) : 0;
		let ppw = 0;
		if (recent.length >= 2) {
			const times = recent.map((m) => Date.parse(m.posted_at)).filter((t) => Number.isFinite(t)).sort((a, b) => b - a);
			if (times.length >= 2) {
				const days = Math.max(1, (times[0] - times[times.length - 1]) / 864e5);
				ppw = Number(Math.min(28, (times.length / days) * 7).toFixed(1));
			}
		}
		return { followers, er, ppw };
	});

	const peerAvg = $derived.by(() => {
		if (!peers.length) return null;
		const er = Number((peers.reduce((a, p) => a + Number(p.engagement_rate || 0), 0) / peers.length).toFixed(2));
		const ppw = Number((peers.reduce((a, p) => a + Number(p.posts_per_week || 0), 0) / peers.length).toFixed(1));
		const followers = Math.round(peers.reduce((a, p) => a + Number(p.followers_count || 0), 0) / peers.length);
		return { er, ppw, followers };
	});

	async function loadPeers() {
		const { data } = await supabase
			.from('creator_benchmarks')
			.select('*')
			.order('engagement_rate', { ascending: false });
		peers = (data ?? []) as Peer[];
	}

	async function trackHandle(raw: string) {
		const clean = raw.replace(/^@/, '').trim();
		if (!clean || busy) return;
		busy = 'add';
		fetchingHandle = clean;
		suggestedHandle = '';
		lookupNotice = '';
		try {
			const res = (await invokeFn('creator-benchmarks', { action: 'add', username: clean })) as {
				peer?: Peer;
				not_found?: boolean;
				suggested_handle?: string;
				error?: string;
			};
			if (res?.peer) {
				peers = [res.peer, ...peers.filter((x) => x.id !== res.peer!.id)];
				handle = '';
				toast(`Added @${res.peer.username} to your benchmarks`);
			} else if (res?.not_found) {
				suggestedHandle = res.suggested_handle ?? '';
				lookupNotice = res.error || `Couldn't find public Instagram profile @${clean}.`;
			}
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			busy = '';
			fetchingHandle = '';
		}
	}

	function addPeer(e: SubmitEvent) {
		e.preventDefault();
		void trackHandle(handle);
	}

	async function refreshAll() {
		if (busy || !peers.length) return;
		busy = 'refresh';
		try {
			const res = (await invokeFn('creator-benchmarks', { action: 'refresh' })) as { peers?: Peer[] };
			if (Array.isArray(res?.peers)) peers = res.peers;
			toast('Refreshed peer benchmarks');
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			busy = '';
		}
	}

	async function removePeer(p: Peer) {
		peers = peers.filter((x) => x.id !== p.id);
		try {
			await invokeFn('creator-benchmarks', { action: 'remove', id: p.id });
			toast(`Removed @${p.username}`);
		} catch (err) {
			toast(errMessage(err), 'alert');
			void loadPeers();
		}
	}

	function cleanCap(raw: string): string {
		const t = raw.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
		return t.length > 74 ? t.slice(0, 72).trim() + '…' : t || 'Instagram post';
	}

	onMount(async () => {
		if (!studio.media.length) await loadInstagram();
		await loadPeers();
		loading = false;
	});
</script>

<svelte:head><title>Peer Benchmarks · Miracle</title></svelte:head>

<div class="bm">
	<header class="bm-head">
		<div class="bm-top">
			<p>Compare your engagement and posting pace against creators in your niche, and remix what is breaking out for them.</p>
			{#if peers.length}
				<button class="bm-sync" onclick={refreshAll} disabled={busy === 'refresh'}>
					<Icon name="refresh" />
					<span>{busy === 'refresh' ? 'Refreshing…' : 'Refresh'}</span>
				</button>
			{/if}
		</div>
	</header>

	{#if !connected}
		<section class="bm-card bm-empty">
			<span class="bm-ic"><Icon name="link" /></span>
			<b>Connect Instagram to benchmark peers</b>
			<small>Connect your Instagram account so Miracle can compare your metrics against niche peers.</small>
			<a class="bm-neopop" href="/studio/settings?s=profile"><Icon name="link" />Connect Instagram</a>
		</section>
	{:else}
		<form class="bm-add" onsubmit={addPeer}>
			<span class="bm-at">@</span>
			<input type="text" bind:value={handle} placeholder="Add a creator handle (e.g. honee_buneee)" autocomplete="off" />
			<button class="bm-neopop" type="submit" disabled={!handle.trim() || busy === 'add'}>
				{busy === 'add' ? 'Fetching…' : 'Track'}
			</button>
		</form>

		{#if lookupNotice}
			<section class="bm-card bm-hint">
				<p>{lookupNotice}</p>
				{#if suggestedHandle}
					<button type="button" class="bm-neopop" disabled={busy === 'add'} onclick={() => { handle = suggestedHandle; void trackHandle(suggestedHandle); }}>
						Track @{suggestedHandle}
					</button>
				{/if}
			</section>
		{/if}

		{#if peerAvg}
			<section class="bm-vs">
				<div class="bm-stat">
					<small>Engagement rate</small>
					<b>{myStats.er}%</b>
					<span class:ok={myStats.er >= peerAvg.er}>Peers avg {peerAvg.er}%</span>
				</div>
				<div class="bm-stat">
					<small>Posts / week</small>
					<b>{myStats.ppw}</b>
					<span class:ok={myStats.ppw >= peerAvg.ppw}>Peers avg {peerAvg.ppw}</span>
				</div>
				<div class="bm-stat">
					<small>Followers</small>
					<b>{compact(myStats.followers)}</b>
					<span>Peers avg {compact(peerAvg.followers)}</span>
				</div>
			</section>
		{/if}

		{#if loading}
			<div class="bm-empty"><span class="ring"><span></span></span></div>
		{:else if !peers.length}
			<section class="bm-card bm-empty">
				<span class="bm-ic"><Icon name="users" /></span>
				<b>Track 3–5 creators in your niche</b>
				<small>Add public Creator or Business handles above to see how often they post, their engagement rate, and their top-performing Reels.</small>
			</section>
		{:else if peers.length}
			<div class="bm-list">
				{#each peers as p (p.id)}
					<article class="bm-card">
						<div class="bm-row">
							{#if p.profile_picture_url}
								<img class="bm-av" src={igImg(p.profile_picture_url)} alt="" />
							{:else}
								<span class="bm-av bm-av-ph">{p.username.slice(0, 1).toUpperCase()}</span>
							{/if}
							<div class="bm-who">
								<b>@{p.username}</b>
								<small>{p.name || 'Creator'} · {compact(p.followers_count)} followers</small>
							</div>
							<button class="bm-del" type="button" aria-label="Remove @{p.username}" onclick={() => removePeer(p)}>
								<Icon name="x" />
							</button>
						</div>

						<div class="bm-kpis">
							<span><small>Engagement</small><b>{p.engagement_rate}%</b></span>
							<span><small>Posts/wk</small><b>{p.posts_per_week}</b></span>
							<span><small>Avg likes</small><b>{compact(p.avg_likes)}</b></span>
							<span><small>Avg comments</small><b>{compact(p.avg_comments)}</b></span>
						</div>

						{#if p.top_posts?.length}
							<div class="bm-posts">
								<span class="bm-plbl">Top breakout posts</span>
								{#each p.top_posts as post (post.id)}
									{@const label = cleanCap(post.caption)}
									<div class="bm-post">
										<a href={post.permalink} target="_blank" rel="noopener">
											<b>{label}</b>
											<small>{compact(post.likes)} likes · {compact(post.comments)} comments</small>
										</a>
										<a class="bm-remix" href="/studio/grow/studio?topic={encodeURIComponent(`My own angle on: ${label}`)}">
											Remix
										</a>
									</div>
								{/each}
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	{/if}
</div>

{#if busy === 'add' || busy === 'refresh'}
	<div class="bm-ov" use:portal aria-live="polite" role="status">
		<section class="bm-ov-card">
			<div class="bm-orb" aria-hidden="true">
				<span class="bm-ring"></span>
				<span class="bm-core"><Logo size={30} /></span>
			</div>
			<span class="bm-ov-eb">Peer Benchmarks</span>
			<h2>{busy === 'add' ? `Scanning @${fetchingHandle}` : 'Refreshing your peers'}</h2>
			<p class="bm-ov-sub">
				{busy === 'add'
					? 'Pulling public followers, posting pace, and breakout Reels automatically.'
					: 'Syncing the latest public engagement and Reels across your tracked peers.'}
			</p>
			<div class="bm-steps">
				{#each FETCH_STEPS as label, i (label)}
					<div class="bm-step" class:done={i < fetchStep} class:active={i === fetchStep}>
						<span class="bm-sdot" aria-hidden="true">
							{#if i < fetchStep}<Icon name="check" />{:else}<i></i>{/if}
						</span>
						<span>{label}</span>
					</div>
				{/each}
			</div>
		</section>
	</div>
{/if}

<style>
	.bm {
		max-width: 680px;
		margin: 0 auto;
		display: grid;
		gap: 14px;
		padding-bottom: 32px;
	}
	.bm-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}
	.bm-head p {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-2);
		line-height: 1.45;
	}
	.bm-sync {
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
		flex-shrink: 0;
	}
	.bm-add {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 6px 6px 14px;
		border-radius: 14px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
	}
	.bm-at {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 15px;
		color: var(--g1);
		font-weight: 700;
	}
	.bm-add input {
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
	.bm-neopop {
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
	}
	.bm-neopop:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.bm-hint {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	.bm-hint p {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.bm-vs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.bm-stat {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 14px;
		padding: 12px 11px;
		display: grid;
		gap: 3px;
	}
	.bm-stat small {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bm-stat b {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 28px;
		line-height: 1.05;
	}
	.bm-stat span {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10.5px;
		color: var(--ink-3);
	}
	.bm-stat span.ok {
		color: var(--ok);
	}
	.bm-list {
		display: grid;
		gap: 12px;
	}
	.bm-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 15px;
		display: grid;
		gap: 12px;
	}
	.bm-empty {
		place-items: center;
		text-align: center;
		padding: 30px 18px;
		gap: 10px;
	}
	.bm-empty b {
		font-size: 16px;
	}
	.bm-empty small {
		font-size: 13px;
		color: var(--ink-2);
		max-width: 340px;
		line-height: 1.45;
	}
	.bm-ic {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		display: grid;
		place-items: center;
		color: var(--g1);
	}
	.bm-row {
		display: flex;
		align-items: center;
		gap: 11px;
	}
	.bm-av {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--line-strong);
		flex-shrink: 0;
	}
	.bm-av-ph {
		display: grid;
		place-items: center;
		background: var(--surface-2);
		font-weight: 700;
		color: var(--g1);
	}
	.bm-who {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.bm-who b {
		font-size: 15px;
	}
	.bm-who small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.bm-del {
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--ink-3);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.bm-del:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.bm-kpis {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		padding: 10px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
	}
	.bm-kpis span {
		display: grid;
		gap: 2px;
	}
	.bm-kpis small {
		font-size: 10px;
		color: var(--ink-3);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.bm-kpis b {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 13.5px;
	}
	.bm-posts {
		display: grid;
		gap: 7px;
	}
	.bm-plbl {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bm-post {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 9px 11px;
		border-radius: 11px;
		background: var(--surface-2);
		border: 1px solid var(--line);
	}
	.bm-post > a:first-child {
		min-width: 0;
		flex: 1;
		text-decoration: none;
		color: inherit;
		display: grid;
		gap: 2px;
	}
	.bm-post b {
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bm-post small {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11px;
		color: var(--ink-3);
	}
	.bm-remix {
		padding: 5px 10px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--g1) 16%, var(--surface));
		color: var(--g1);
		font-size: 11.5px;
		font-weight: 700;
		text-decoration: none;
		white-space: nowrap;
	}

	@property --bm-rim {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}
	@keyframes bmSpin {
		to { --bm-rim: 360deg; }
	}
	@keyframes bmPulse {
		0%, 100% { transform: scale(1); opacity: 0.7; }
		50% { transform: scale(1.16); opacity: 1; }
	}
	.bm-ov {
		position: fixed;
		inset: 0;
		z-index: 220;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		background: rgba(12, 8, 14, 0.88);
		-webkit-backdrop-filter: blur(18px);
		backdrop-filter: blur(18px);
	}
	.bm-ov-card {
		position: relative;
		width: 100%;
		max-width: 390px;
		padding: 30px 22px 26px;
		border-radius: 24px;
		background:
			radial-gradient(120% 90% at 95% 0%, rgba(242, 90, 144, 0.16), transparent 55%),
			radial-gradient(95% 95% at 5% 100%, rgba(156, 123, 255, 0.14), transparent 55%),
			#19131e;
		text-align: center;
		display: grid;
		justify-items: center;
		gap: 10px;
		box-shadow: 0 24px 50px -28px rgba(0, 0, 0, 0.75);
	}
	.bm-ov-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1.25px;
		background: conic-gradient(from var(--bm-rim), #9c7bff, #f25a90, #ffae6b, rgba(255, 255, 255, 0.08) 48%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
		animation: bmSpin 5s linear infinite;
	}
	.bm-orb {
		position: relative;
		width: 72px;
		height: 72px;
		margin-bottom: 4px;
		display: grid;
		place-items: center;
	}
	.bm-ring {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		padding: 2.5px;
		background: conic-gradient(from var(--bm-rim), #9c7bff, #f25a90, #ffae6b, transparent 62%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		animation: bmSpin 1.8s linear infinite;
	}
	.bm-core {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: #140f17;
		border: 1px solid rgba(255, 255, 255, 0.08);
		display: grid;
		place-items: center;
	}
	.bm-ov-eb {
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #9b8fa8;
	}
	.bm-ov-card h2 {
		margin: 0;
		font: 400 26px/1.1 var(--f-serif, Georgia, serif);
		color: #faf7fc;
		word-break: break-word;
	}
	.bm-ov-sub {
		margin: 0;
		font-size: 13px;
		line-height: 1.5;
		color: #cfc6d6;
		max-width: 32ch;
	}
	.bm-steps {
		width: 100%;
		margin-top: 10px;
		padding-top: 14px;
		border-top: 1px solid rgba(255, 255, 255, 0.09);
		display: grid;
		gap: 10px;
		text-align: left;
	}
	.bm-step {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13px;
		color: #7d7288;
		transition: color 0.2s;
	}
	.bm-step.active {
		color: #faf7fc;
		font-weight: 500;
	}
	.bm-step.done {
		color: #4ade80;
	}
	.bm-sdot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.14);
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}
	.bm-step.active .bm-sdot {
		border-color: #f25a90;
	}
	.bm-step.active .bm-sdot i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: linear-gradient(135deg, #9c7bff, #f25a90, #ffae6b);
		animation: bmPulse 1.1s ease-in-out infinite;
	}
	.bm-step.done .bm-sdot {
		border-color: rgba(74, 222, 128, 0.45);
		background: rgba(74, 222, 128, 0.12);
		color: #4ade80;
	}
	.bm-step.done .bm-sdot :global(.ic) {
		width: 12px;
		height: 12px;
	}
</style>
