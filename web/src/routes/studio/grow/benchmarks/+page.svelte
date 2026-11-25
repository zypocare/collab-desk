<script lang="ts">
	import { onMount } from 'svelte';
	import { invokeFn, loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage } from '#lib/util.ts';
	import { igImg } from '#lib/igImg.ts';
	import Icon from '#lib/components/Icon.svelte';

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
	let busy = $state<'' | 'add' | 'refresh' | 'manual'>('');

	// Quick manual fallback when Instagram blocks automated public profile reads
	let manualFor = $state('');
	let mFollowers = $state('');
	let mLikes = $state('');
	let mPpw = $state('4');
	let mTopic = $state('');

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

	async function addPeer(e: SubmitEvent) {
		e.preventDefault();
		const clean = handle.replace(/^@/, '').trim();
		if (!clean || busy) return;
		busy = 'add';
		manualFor = '';
		try {
			const res = (await invokeFn('creator-benchmarks', { action: 'add', username: clean })) as {
				peer?: Peer;
				manual?: boolean;
				username?: string;
			};
			if (res?.peer) {
				peers = [res.peer, ...peers.filter((x) => x.id !== res.peer!.id)];
				handle = '';
				toast(`Added @${res.peer.username} to your benchmarks`);
			} else if (res?.manual) {
				manualFor = res.username || clean;
				toast(`Instagram limited auto-fetch for @${manualFor} — enter their quick numbers below`);
			}
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			busy = '';
		}
	}

	async function saveManual(e: SubmitEvent) {
		e.preventDefault();
		if (!manualFor || busy) return;
		busy = 'manual';
		try {
			const res = (await invokeFn('creator-benchmarks', {
				action: 'add_manual',
				username: manualFor,
				followers_count: Number(mFollowers) || 0,
				avg_likes: Number(mLikes) || 0,
				posts_per_week: Number(mPpw) || 0,
				top_topic: mTopic.trim()
			})) as { peer?: Peer };
			if (res?.peer) {
				peers = [res.peer, ...peers.filter((x) => x.id !== res.peer!.id)];
				handle = '';
				manualFor = '';
				mFollowers = '';
				mLikes = '';
				mTopic = '';
				toast(`Added @${res.peer.username} to your benchmarks`);
			}
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			busy = '';
		}
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
				{busy === 'add' ? 'Adding…' : 'Track'}
			</button>
		</form>

		{#if manualFor}
			<form class="bm-card bm-man" onsubmit={saveManual}>
				<div class="bm-man-h">
					<div>
						<b>Quick-add @{manualFor}</b>
						<small>Instagram rate-limited auto-fetch for this handle — enter their public numbers once to benchmark them.</small>
					</div>
					<button type="button" class="bm-del" aria-label="Cancel" onclick={() => (manualFor = '')}><Icon name="x" /></button>
				</div>
				<div class="bm-man-grid">
					<label><span>Followers</span><input type="number" min="0" bind:value={mFollowers} placeholder="e.g. 45000" required /></label>
					<label><span>Avg likes / post</span><input type="number" min="0" bind:value={mLikes} placeholder="e.g. 1800" required /></label>
					<label><span>Posts / week</span><input type="number" min="0" max="28" step="0.5" bind:value={mPpw} placeholder="4" /></label>
				</div>
				<label class="bm-man-f"><span>Their breakout Reel topic (optional)</span><input type="text" bind:value={mTopic} placeholder="e.g. Indiranagar thrift haul under ₹1k" /></label>
				<button class="bm-neopop" type="submit" disabled={busy === 'manual'}>{busy === 'manual' ? 'Saving…' : `Save @${manualFor}`}</button>
			</form>
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
		{:else if !peers.length && !manualFor}
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
	.bm-man {
		border-color: color-mix(in oklab, var(--g1) 42%, var(--line));
	}
	.bm-man-h {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.bm-man-h b {
		display: block;
		font-size: 15px;
	}
	.bm-man-h small {
		display: block;
		font-size: 12px;
		color: var(--ink-3);
		margin-top: 2px;
		line-height: 1.4;
	}
	.bm-man-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	@media (max-width: 520px) {
		.bm-man-grid {
			grid-template-columns: 1fr;
		}
	}
	.bm-man-grid label,
	.bm-man-f {
		display: grid;
		gap: 4px;
	}
	.bm-man-grid span,
	.bm-man-f span {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bm-man-grid input,
	.bm-man-f input {
		width: 100%;
		padding: 9px 11px;
		border-radius: 10px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--ink);
		font: inherit;
		font-size: 14px;
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
</style>
