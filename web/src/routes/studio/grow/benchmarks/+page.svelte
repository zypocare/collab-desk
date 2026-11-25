<script lang="ts">
	import { onMount } from 'svelte';
	import { invokeFn, loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage } from '#lib/util.ts';
	import { igImg } from '#lib/igImg.ts';
	import { portal } from '#lib/portal.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';

	type PeerPost = {
		id: string;
		caption: string;
		likes: number;
		comments: number;
		views?: number;
		thumbnail_url?: string;
		media_type: string;
		permalink: string;
		timestamp: string;
		multiplier?: number;
		has_dm_cta?: boolean;
	};

	type PeerInsights = {
		bio?: string;
		category?: string;
		avg_views?: number;
		median_likes?: number;
		reels_pct?: number;
		carousel_pct?: number;
		photo_pct?: number;
		comment_magnet_posts?: number;
		comment_magnet_lift?: number;
		collab_posts?: number;
		collab_brands?: string[];
		best_day?: string;
		best_time?: string;
		top_hashtags?: string[];
		sample_size?: number;
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
		insights?: PeerInsights;
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
		'Analyzing Reel views, format mix & collabs',
		'Spotting breakout hooks & comment magnets'
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

	// Exclude Stories so engagement rate and posts/week reflect actual feed/Reel posts.
	const myStats = $derived.by(() => {
		const followers = Number(studio.ig?.followers ?? 0);
		const feed = studio.media.filter((m) => m.media_type !== 'STORY' && m.product_type !== 'STORY');
		const recent = feed.slice(0, 12);
		const avgEng = recent.length
			? recent.reduce((a, m) => a + Number(m.likes ?? 0) + Number(m.comments ?? 0), 0) / recent.length
			: 0;
		const er = followers > 0 && recent.length ? Number(((avgEng / followers) * 100).toFixed(2)) : 0;
		const viewed = recent.map((m) => Number(m.views ?? 0)).filter((v) => v > 0);
		const avgViews = viewed.length ? Math.round(viewed.reduce((a, b) => a + b, 0) / viewed.length) : 0;
		let ppw = 0;
		if (recent.length >= 2) {
			const times = recent.map((m) => Date.parse(m.posted_at)).filter((t) => Number.isFinite(t)).sort((a, b) => b - a);
			if (times.length >= 2) {
				const days = Math.max(1, (times[0] - times[times.length - 1]) / 864e5);
				ppw = Number(Math.min(21, (times.length / days) * 7).toFixed(1));
			}
		}
		return { followers, er, ppw, avgViews };
	});

	const peerAvg = $derived.by(() => {
		if (!peers.length) return null;
		const er = Number((peers.reduce((a, p) => a + Number(p.engagement_rate || 0), 0) / peers.length).toFixed(2));
		const ppw = Number((peers.reduce((a, p) => a + Number(p.posts_per_week || 0), 0) / peers.length).toFixed(1));
		const followers = Math.round(peers.reduce((a, p) => a + Number(p.followers_count || 0), 0) / peers.length);
		const vPeers = peers.map((p) => Number(p.insights?.avg_views ?? 0)).filter((v) => v > 0);
		const avgViews = vPeers.length ? Math.round(vPeers.reduce((a, b) => a + b, 0) / vPeers.length) : 0;
		return { er, ppw, followers, avgViews };
	});

	// Concrete, actionable takeaways comparing you vs your tracked peers.
	const takeaways = $derived.by(() => {
		if (!peerAvg || !peers.length) return [];
		const out: { title: string; detail: string; href: string; cta: string }[] = [];

		const magnetPeer = peers.find((p) => (p.insights?.comment_magnet_posts ?? 0) > 0);
		if (magnetPeer) {
			const lift = magnetPeer.insights?.comment_magnet_lift;
			out.push({
				title: `@${magnetPeer.username} uses Comment-to-DM magnets`,
				detail: lift
					? `Their "comment for link/location" Reels pull ${lift}× more comments than their usual posts.`
					: 'They drive replies with "comment for link/location" hooks to boost Reel distribution.',
				href: '/studio/grow/automations',
				cta: 'Set up Auto-DM'
			});
		}

		if (myStats.er > 0 && peerAvg.er > 0) {
			if (myStats.er >= peerAvg.er) {
				out.push({
					title: `Your engagement beats peers (${myStats.er}% vs ${peerAvg.er}%)`,
					detail:
						myStats.ppw < peerAvg.ppw
							? `You hold stronger engagement, while peers post faster (${peerAvg.ppw}/wk vs your ${myStats.ppw}/wk). Adding 1 extra Reel/week can compound reach.`
							: 'You lead on both engagement and consistency—use their breakout topics below to widen non-follower reach.',
					href: '/studio/grow/studio',
					cta: 'Script next Reel'
				});
			} else {
				out.push({
					title: `Peers average ${peerAvg.er}% ER vs your ${myStats.er}%`,
					detail: 'Compare their highest-multiplier Reels below and test tighter 0–3s hooks on your next shoot.',
					href: '/studio/grow/check',
					cta: 'Audit a Reel'
				});
			}
		}

		const collabPeer = peers.find((p) => (p.insights?.collab_posts ?? 0) > 0);
		if (collabPeer) {
			const c = collabPeer.insights?.collab_posts ?? 0;
			const n = collabPeer.insights?.sample_size ?? 12;
			const brands = collabPeer.insights?.collab_brands ?? [];
			out.push({
				title: `Collab cadence: ${c} of ${n} recent posts on @${collabPeer.username}`,
				detail: brands.length
					? `Active brand tags spotted: ${brands.map((b) => `@${b}`).join(', ')}. Pitch similar brands in this niche.`
					: 'Track their organic-to-collab ratio to keep your own feed discovery-first.',
				href: '/studio/pitches',
				cta: 'Open Pitches'
			});
		}

		return out.slice(0, 3);
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
		return t.length > 76 ? t.slice(0, 74).trim() + '…' : t || 'Instagram post';
	}

	function formatMixText(ins?: PeerInsights): string {
		if (!ins) return '';
		const parts: string[] = [];
		if (ins.reels_pct) parts.push(`${ins.reels_pct}% Reels`);
		if (ins.carousel_pct) parts.push(`${ins.carousel_pct}% Carousels`);
		if (ins.photo_pct) parts.push(`${ins.photo_pct}% Photos`);
		return parts.join(' · ');
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
			<p>See what actually drives views, comments, and brand deals for creators in your niche—then remix their winning angles.</p>
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
			<input type="text" bind:value={handle} placeholder="Add a creator handle (e.g. honeee_buneee)" autocomplete="off" />
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
					<small>Your Engagement</small>
					<b>{myStats.er}%</b>
					<span class:good={myStats.er >= peerAvg.er} class:warn={myStats.er < peerAvg.er}>
						Peers avg {peerAvg.er}%
					</span>
				</div>
				<div class="bm-stat">
					<small>Your Posts / wk</small>
					<b>{myStats.ppw}</b>
					<span class:good={myStats.ppw >= peerAvg.ppw} class:warn={myStats.ppw < peerAvg.ppw}>
						Peers avg {peerAvg.ppw}
					</span>
				</div>
				<div class="bm-stat">
					<small>{peerAvg.avgViews ? 'Avg Reel Views' : 'Your Followers'}</small>
					<b>{peerAvg.avgViews ? compact(myStats.avgViews) : compact(myStats.followers)}</b>
					<span>Peers avg {compact(peerAvg.avgViews || peerAvg.followers)}</span>
				</div>
			</section>

			{#if takeaways.length}
				<section class="bm-card bm-play">
					<span class="bm-sub">What to act on</span>
					<div class="bm-act-list">
						{#each takeaways as t (t.title)}
							<div class="bm-act">
								<div>
									<b>{t.title}</b>
									<small>{t.detail}</small>
								</div>
								<a class="bm-act-btn" href={t.href}>{t.cta}</a>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		{/if}

		{#if loading}
			<div class="bm-empty"><span class="ring"><span></span></span></div>
		{:else if !peers.length}
			<section class="bm-card bm-empty">
				<span class="bm-ic"><Icon name="users" /></span>
				<b>Track 3–5 creators in your niche</b>
				<small>Add public Creator or Business handles above to uncover their Reel views, format mix, posting schedule, comment magnets, and breakout posts.</small>
			</section>
		{:else}
			<div class="bm-list">
				{#each peers as p (p.id)}
					{@const ins = p.insights}
					{@const mixText = formatMixText(ins)}
					{@const erDiff = Number((myStats.er - Number(p.engagement_rate || 0)).toFixed(2))}
					<article class="bm-card bm-peer">
						<div class="bm-peer-h">
							{#if p.profile_picture_url}
								<img class="bm-av" src={igImg(p.profile_picture_url)} alt="" referrerpolicy="no-referrer" />
							{:else}
								<span class="bm-av bm-av-ph">{p.username.slice(0, 1).toUpperCase()}</span>
							{/if}
							<div class="bm-peer-meta">
								<div class="bm-peer-t">
									<a href="https://www.instagram.com/{p.username}/" target="_blank" rel="noopener">@{p.username}</a>
									{#if myStats.er > 0 && Number(p.engagement_rate) > 0}
										<span class="bm-delta" class:good={erDiff >= 0} class:warn={erDiff < 0}>
											{erDiff >= 0 ? `You +${erDiff}% ER` : `Peer +${Math.abs(erDiff)}% ER`}
										</span>
									{/if}
								</div>
								<small>{[ins?.category || p.name, `${compact(p.followers_count)} followers`].filter(Boolean).join(' · ')}</small>
								{#if ins?.bio}
									<p class="bm-bio">{ins.bio}</p>
								{/if}
							</div>
							<button class="bm-del" aria-label="Remove @{p.username}" onclick={() => removePeer(p)}>
								<Icon name="x" />
							</button>
						</div>

						<div class="bm-metrics">
							<div><small>Engagement</small><b>{p.engagement_rate}%</b></div>
							<div><small>Posts/wk</small><b>{p.posts_per_week}</b></div>
							{#if ins?.avg_views}
								<div><small>Avg views</small><b>{compact(ins.avg_views)}</b></div>
							{:else}
								<div><small>Avg likes</small><b>{compact(p.avg_likes)}</b></div>
							{/if}
							<div><small>Avg comments</small><b>{compact(p.avg_comments)}</b></div>
						</div>

						{#if mixText || ins?.best_time || ins?.comment_magnet_posts || ins?.collab_posts || ins?.top_hashtags?.length}
							<div class="bm-signals">
								{#if mixText}
									<div class="bm-sig">
										<Icon name="film" />
										<span><b>Format mix:</b> {mixText}</span>
									</div>
								{/if}
								{#if ins?.best_day || ins?.best_time}
									<div class="bm-sig">
										<Icon name="clock" />
										<span><b>Peak cadence:</b> {[ins.best_day, ins.best_time].filter(Boolean).join(' · ')}</span>
									</div>
								{/if}
								{#if ins?.comment_magnet_posts}
									<div class="bm-sig bm-sig-hot">
										<Icon name="spark" />
										<span>
											<b>Comment-to-DM magnet:</b> used on {ins.comment_magnet_posts} recent {ins.comment_magnet_posts === 1 ? 'post' : 'posts'}{ins.comment_magnet_lift ? ` (${ins.comment_magnet_lift}× comment lift)` : ''}
										</span>
									</div>
								{/if}
								{#if ins?.collab_posts}
									<div class="bm-sig">
										<Icon name="board" />
										<span>
											<b>Brand collabs:</b> {ins.collab_posts} of {ins.sample_size ?? 12} recent posts{ins.collab_brands?.length ? ` (${ins.collab_brands.map((b) => `@${b}`).join(', ')})` : ''}
										</span>
									</div>
								{/if}
								{#if ins?.top_hashtags?.length}
									<div class="bm-tags">
										{#each ins.top_hashtags as tag (tag)}<span>{tag}</span>{/each}
									</div>
								{/if}
							</div>
						{:else}
							<p class="bm-refresh-note">Tap <b>Refresh</b> above to load Reel views, format mix, posting schedule, and collab signals for @{p.username}.</p>
						{/if}

						{#if p.top_posts?.length}
							<div class="bm-posts">
								<span class="bm-sub">Top breakout posts</span>
								{#each p.top_posts as post (post.id)}
									<div class="bm-post">
										{#if post.thumbnail_url}
											<a class="bm-pthumb" href={post.permalink} target="_blank" rel="noopener">
												<img src={igImg(post.thumbnail_url)} alt="" loading="lazy" referrerpolicy="no-referrer" />
											</a>
										{:else}
											<a class="bm-pthumb bm-pthumb-ph" href={post.permalink} target="_blank" rel="noopener" aria-label="Open post">
												<Icon name="film" />
											</a>
										{/if}
										<div class="bm-post-body">
											<a href={post.permalink} target="_blank" rel="noopener">{cleanCap(post.caption)}</a>
											<div class="bm-pmeta">
												<small>
													{#if post.views}{compact(post.views)} views · {/if}{compact(post.likes)} likes · {compact(post.comments)} comments
												</small>
												{#if post.multiplier}
													<span class="bm-mult">{post.multiplier}× avg</span>
												{/if}
												{#if post.has_dm_cta}
													<span class="bm-dm">DM magnet</span>
												{/if}
											</div>
										</div>
										<a class="bm-remix" href="/studio/grow/studio?topic={encodeURIComponent(cleanCap(post.caption))}">
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
					? 'Pulling Reel views, format mix, posting schedule, collabs, and breakout hooks.'
					: 'Syncing the latest Reel views, format mix, and breakout posts across your tracked peers.'}
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
		max-width: 720px;
		margin: 0 auto;
		display: grid;
		gap: 14px;
		padding-bottom: 32px;
	}
	.bm-head {
		display: grid;
		gap: 8px;
	}
	.bm-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.bm-top p {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--ink-2);
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
		font: 600 12px var(--f-body, inherit);
		cursor: pointer;
		flex-shrink: 0;
	}
	.bm-sync :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.bm-add {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 6px 6px 14px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--line-strong);
	}
	.bm-at {
		font-weight: 700;
		color: var(--g1);
	}
	.bm-add input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: 14px;
		outline: none;
	}
	.bm-neopop {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 9px 15px;
		border-radius: 9px;
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--bg);
		font: 700 12.5px var(--f-body, inherit);
		text-decoration: none;
		cursor: pointer;
		box-shadow: 2.5px 2.5px 0 var(--g2);
		flex-shrink: 0;
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
		font: 400 24px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.bm-stat span {
		font-size: 11px;
		color: var(--ink-3);
	}
	.bm-stat span.good {
		color: var(--ok);
	}
	.bm-stat span.warn {
		color: var(--g2);
	}
	.bm-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 15px;
		display: grid;
		gap: 12px;
	}
	.bm-play {
		border-color: color-mix(in oklab, var(--g1) 34%, var(--line));
		background: linear-gradient(160deg, color-mix(in oklab, var(--g1) 8%, var(--surface)), var(--surface) 75%);
	}
	.bm-act-list {
		display: grid;
		gap: 9px;
	}
	.bm-act {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 11px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
	}
	.bm-act > div {
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.bm-act b {
		font-size: 13px;
		color: var(--ink);
	}
	.bm-act small {
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--ink-2);
	}
	.bm-act-btn {
		flex-shrink: 0;
		padding: 6px 10px;
		border-radius: 8px;
		border: 1px solid color-mix(in oklab, var(--g1) 42%, var(--line));
		background: color-mix(in oklab, var(--g1) 14%, transparent);
		color: var(--ink);
		font: 600 11.5px var(--f-body, inherit);
		text-decoration: none;
		white-space: nowrap;
	}
	.bm-empty {
		justify-items: center;
		text-align: center;
		padding: 28px 18px;
		gap: 8px;
	}
	.bm-empty b {
		font-size: 16px;
	}
	.bm-empty small {
		font-size: 13px;
		color: var(--ink-3);
		max-width: 34ch;
		line-height: 1.45;
	}
	.bm-ic {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--g1);
	}
	.bm-list {
		display: grid;
		gap: 12px;
	}
	.bm-peer-h {
		display: flex;
		align-items: flex-start;
		gap: 11px;
	}
	.bm-av {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--line-strong);
		flex-shrink: 0;
	}
	.bm-av-ph {
		display: grid;
		place-items: center;
		background: var(--surface-2);
		color: var(--g1);
		font-weight: 700;
	}
	.bm-peer-meta {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 3px;
	}
	.bm-peer-t {
		display: flex;
		align-items: center;
		gap: 7px;
		flex-wrap: wrap;
	}
	.bm-peer-t a {
		font-weight: 700;
		font-size: 15px;
		color: var(--ink);
		text-decoration: none;
	}
	.bm-delta {
		padding: 2px 7px;
		border-radius: 99px;
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
	}
	.bm-delta.good {
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 13%, transparent);
		border: 1px solid color-mix(in oklab, var(--ok) 32%, var(--line));
	}
	.bm-delta.warn {
		color: var(--g2);
		background: color-mix(in oklab, var(--g2) 13%, transparent);
		border: 1px solid color-mix(in oklab, var(--g2) 32%, var(--line));
	}
	.bm-peer-meta small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.bm-bio {
		margin: 2px 0 0;
		font-size: 12px;
		line-height: 1.4;
		color: var(--ink-2);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.bm-del {
		border: 0;
		background: transparent;
		color: var(--ink-3);
		padding: 6px;
		cursor: pointer;
	}
	.bm-del :global(.ic) {
		width: 16px;
		height: 16px;
	}
	.bm-metrics {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
		padding: 10px 11px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
	}
	.bm-metrics small {
		display: block;
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ink-3);
	}
	.bm-metrics b {
		font-size: 14px;
		color: var(--ink);
	}
	.bm-signals {
		display: grid;
		gap: 7px;
		padding: 10px 11px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--surface-2) 65%, transparent);
		border: 1px solid var(--line);
	}
	.bm-sig {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		font-size: 12px;
		line-height: 1.4;
		color: var(--ink-2);
	}
	.bm-sig :global(.ic) {
		width: 14px;
		height: 14px;
		margin-top: 2px;
		flex-shrink: 0;
		color: var(--g1);
	}
	.bm-sig b {
		color: var(--ink);
		font-weight: 600;
	}
	.bm-sig-hot :global(.ic) {
		color: var(--g2);
	}
	.bm-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		margin-top: 2px;
	}
	.bm-tags span {
		padding: 3px 8px;
		border-radius: 99px;
		background: var(--surface);
		border: 1px solid var(--line);
		font: 600 10.5px var(--f-mono, ui-monospace, monospace);
		color: var(--ink-3);
	}
	.bm-refresh-note {
		margin: 0;
		font-size: 12px;
		color: var(--ink-3);
	}
	.bm-sub {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bm-posts {
		display: grid;
		gap: 8px;
	}
	.bm-post {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 10px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
	}
	.bm-pthumb {
		width: 40px;
		height: 52px;
		border-radius: 8px;
		overflow: hidden;
		flex-shrink: 0;
		border: 1px solid var(--line);
		display: block;
	}
	.bm-pthumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.bm-pthumb-ph {
		display: grid;
		place-items: center;
		background: var(--surface);
		color: var(--ink-3);
	}
	.bm-pthumb-ph :global(.ic) {
		width: 16px;
		height: 16px;
	}
	.bm-post-body {
		min-width: 0;
		flex: 1;
		display: grid;
		gap: 3px;
	}
	.bm-post-body a {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bm-pmeta {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.bm-pmeta small {
		font-size: 11px;
		color: var(--ink-3);
	}
	.bm-mult {
		padding: 1px 6px;
		border-radius: 99px;
		font: 700 9.5px/1.3 var(--f-mono, ui-monospace, monospace);
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 14%, transparent);
	}
	.bm-dm {
		padding: 1px 6px;
		border-radius: 99px;
		font: 700 9.5px/1.3 var(--f-mono, ui-monospace, monospace);
		color: var(--g2);
		background: color-mix(in oklab, var(--g2) 14%, transparent);
	}
	.bm-remix {
		padding: 6px 11px;
		border-radius: 99px;
		border: 1px solid color-mix(in oklab, var(--g1) 45%, var(--line));
		background: color-mix(in oklab, var(--g1) 14%, transparent);
		color: var(--g1);
		font: 600 11.5px var(--f-body, inherit);
		text-decoration: none;
		flex-shrink: 0;
	}

	/* Instagram-connect style animated fetching overlay */
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
