<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import Icon from './Icon.svelte';
	import type { DraftComment } from '../types';

	// A draft file (video or photo) with frame-accurate comments, timeline pins,
	// category tags, playback speed control, and open/resolved tracking.
	type Comment = DraftComment & { resolved?: boolean };
	let {
		path,
		type,
		comments = [],
		canComment = false,
		onadd,
		ondelete
	}: {
		path: string;
		type: string;
		comments?: Comment[];
		canComment?: boolean;
		onadd?: (at: number | null, body: string) => Promise<boolean>;
		ondelete?: (id: number) => void;
	} = $props();

	const CATS = ['Visual', 'Product', 'Audio', 'ASCI'] as const;
	let url = $state('');
	let failed = $state(false);
	let video = $state<HTMLVideoElement>();
	let duration = $state(0);
	let current = $state(0);
	let speed = $state(1);
	let body = $state('');
	let at = $state<number | null>(null);
	let cat = $state<(typeof CATS)[number]>('Visual');
	let filter = $state<'all' | 'open' | 'resolved'>('all');
	let busy = $state(false);
	let localResolved = $state<Record<number, boolean>>({});
	const isVideo = $derived(type.startsWith('video'));

	onMount(async () => {
		const { data, error } = await supabase.storage.from('drafts').createSignedUrl(path, 60 * 60 * 6);
		if (error || !data) failed = true;
		else url = data.signedUrl;
	});

	const mmss = (s: number | null) => (s === null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

	function isResolved(c: Comment) {
		return localResolved[c.id] ?? !!c.resolved;
	}

	function parseBody(raw: string): { tag: string | null; text: string } {
		const m = raw.match(/^\[(Visual|Product|Audio|ASCI)\]\s*(.*)$/i);
		return m ? { tag: m[1], text: m[2] } : { tag: null, text: raw };
	}

	function seek(s: number | null) {
		if (!video || s === null) return;
		video.currentTime = s;
		current = s;
		video.play().catch(() => {});
	}

	function cycleSpeed() {
		speed = speed === 1 ? 1.5 : speed === 1.5 ? 0.5 : 1;
		if (video) video.playbackRate = speed;
	}

	// Starting to type pins the comment to where the video is, and pauses it.
	function pin() {
		if (!video || !isVideo) return;
		if (at === null) {
			video.pause();
			at = Math.round(video.currentTime * 10) / 10;
		}
	}

	async function toggleResolve(c: Comment) {
		const next = !isResolved(c);
		localResolved = { ...localResolved, [c.id]: next };
		try {
			const { error } = await supabase.rpc('draft_comment_resolve', { p_id: c.id, p_resolved: next });
			if (error) throw error;
			toast(next ? 'Marked note resolved' : 'Reopened note', 'check');
		} catch {
			// Still works optimistically in session if SQL migration hasn't been applied yet.
			toast(next ? 'Marked resolved' : 'Reopened');
		}
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (!body.trim() || !onadd) return;
		busy = true;
		const payload = `[${cat}] ${body.trim()}`;
		if (await onadd(at, payload)) {
			body = '';
			at = null;
		}
		busy = false;
	}

	const sortedComments = $derived(
		[...comments]
			.filter((c) => (filter === 'all' ? true : filter === 'open' ? !isResolved(c) : isResolved(c)))
			.sort((a, b) => (a.at ?? 1e9) - (b.at ?? 1e9))
	);
	const pinnedCount = $derived(comments.filter((c) => c.at !== null).length);
</script>

<div class="dp-shell">
	<div class="dp-top">
		<span class="dp-eb">{isVideo ? 'Reel Draft Studio' : 'Draft Preview'}</span>
		<div class="dp-top-r">
			{#if isVideo && url}
				<button type="button" class="dp-pill-btn" onclick={cycleSpeed}>{speed.toFixed(1)}×</button>
			{/if}
			{#if url}
				<a class="dp-pill-btn" href={url} target="_blank" rel="noopener"><Icon name="eye" />Full size</a>
			{/if}
		</div>
	</div>

	{#if failed}
		<p class="dp-hint">The file couldn't be opened. Ask for a fresh link.</p>
	{:else if !url}
		<div class="dp-media dp-load"><span class="spinner"></span></div>
	{:else if isVideo}
		<div class="dp-media">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={video}
				src={url}
				controls
				playsinline
				preload="metadata"
				onloadedmetadata={() => {
					duration = video?.duration ?? 0;
					if (video) video.playbackRate = speed;
				}}
				ontimeupdate={() => (current = video?.currentTime ?? 0)}
			></video>
		</div>
		{#if duration}
			<div class="dp-tl-meta">
				<span>{mmss(current)}</span>
				<span>{pinnedCount} pin{pinnedCount === 1 ? '' : 's'} on timeline</span>
				<span>{mmss(duration)}</span>
			</div>
			{#if pinnedCount}
				<div class="dp-marks" aria-label="Pinned timestamps">
					<div class="dp-marks-track">
						<div class="dp-marks-fill" style="width:{Math.min(100, (current / duration) * 100)}%"></div>
					</div>
					{#each comments.filter((c) => c.at !== null) as c (c.id)}
						<button
							type="button"
							class="dp-pin"
							class:resolved={isResolved(c)}
							style="left:{Math.min(100, ((c.at ?? 0) / duration) * 100)}%"
							title="{mmss(c.at)} · {parseBody(c.body).text}"
							onclick={() => seek(c.at)}
						></button>
					{/each}
				</div>
			{/if}
		{/if}
	{:else}
		<div class="dp-media"><img src={url} alt="Draft" /></div>
	{/if}

	{#if canComment}
		<form class="dp-composer" onsubmit={add}>
			<div class="dp-comp-top">
				{#if at !== null}
					<button type="button" class="dp-ts-pin" title="Clear pinned time" onclick={() => (at = null)}>
						<Icon name="clock" />Pinned at {mmss(at)} ×
					</button>
				{:else}
					<span class="dp-ts-idle">{isVideo ? 'Pause video to pin a timestamp' : 'Add a draft note'}</span>
				{/if}
				<div class="dp-cats" role="group" aria-label="Comment category">
					{#each CATS as k (k)}
						<button type="button" class="dp-cat" class:on={cat === k} onclick={() => (cat = k)}>{k}</button>
					{/each}
				</div>
			</div>
			<div class="dp-comp-row">
				<input
					class="dp-inp"
					placeholder={isVideo ? 'Add a note at this exact second…' : 'What would you change?'}
					bind:value={body}
					onfocus={pin}
					oninput={pin}
					disabled={busy}
				/>
				<button class="dp-pin-btn" type="submit" disabled={busy || !body.trim()}>
					{#if busy}<span class="spinner"></span>{:else}Pin{/if}
				</button>
			</div>
		</form>
	{/if}

	{#if comments.length}
		<div class="dp-c-head">
			<span class="dp-eb">Timestamped Notes ({comments.length})</span>
			<div class="dp-filters">
				<button type="button" class="dp-f" class:on={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
				<button type="button" class="dp-f" class:on={filter === 'open'} onclick={() => (filter = 'open')}>Open</button>
				<button type="button" class="dp-f" class:on={filter === 'resolved'} onclick={() => (filter = 'resolved')}>Resolved</button>
			</div>
		</div>

		<ul class="dp-comments">
			{#each sortedComments as c (c.id)}
				{@const parsed = parseBody(c.body)}
				{@const res = isResolved(c)}
				<li class="dp-c-card" class:resolved={res}>
					<div class="dp-c-top">
						<div class="dp-c-meta">
							{#if c.at !== null}<button type="button" class="dp-at" onclick={() => seek(c.at)}>{mmss(c.at)}</button>{/if}
							{#if parsed.tag}<span class="dp-tag">{parsed.tag}</span>{/if}
							{#if c.name}<span class="dp-author">{c.name}</span>{/if}
						</div>
						<div class="dp-c-acts">
							<button type="button" class="dp-res-btn" onclick={() => toggleResolve(c)}>{res ? 'Reopen' : 'Resolve'}</button>
							{#if ondelete}
								<button type="button" class="dp-del" aria-label="Remove comment" onclick={() => ondelete?.(c.id)}><Icon name="x" /></button>
							{/if}
						</div>
					</div>
					<p class="dp-c-body">{parsed.text}</p>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.dp-shell {
		display: grid;
		gap: 12px;
		padding: 14px;
		border-radius: 20px;
		background: linear-gradient(180deg, rgba(31, 24, 34, 0.94) 0%, rgba(21, 16, 23, 0.98) 100%);
		border: 1px solid rgba(255, 255, 255, 0.09);
		color: #faf7fc;
	}
	.dp-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.dp-top-r { display: flex; align-items: center; gap: 6px; }
	.dp-eb {
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.dp-pill-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		border-radius: 9px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: #faf7fc;
		font: 700 11px/1 var(--f-mono, ui-monospace, monospace);
		text-decoration: none;
		cursor: pointer;
	}
	.dp-pill-btn :global(.ic) { width: 13px; height: 13px; }

	.dp-media {
		border-radius: 16px;
		overflow: hidden;
		background: #0d0a0e;
		border: 1px solid rgba(255, 255, 255, 0.1);
		display: grid;
		place-items: center;
	}
	.dp-load { min-height: 200px; }
	.dp-media video,
	.dp-media img { width: 100%; max-height: 460px; object-fit: contain; display: block; }

	.dp-tl-meta {
		display: flex;
		justify-content: space-between;
		font: 600 10.5px/1 var(--f-mono, ui-monospace, monospace);
		color: #8f8499;
	}
	.dp-marks { position: relative; height: 22px; display: flex; align-items: center; }
	.dp-marks-track { width: 100%; height: 6px; border-radius: 999px; background: #2f2433; overflow: hidden; }
	.dp-marks-fill { height: 100%; background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b); }
	.dp-pin {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #ffb85c;
		border: 2px solid #0d0a0e;
		cursor: pointer;
		padding: 0;
	}
	.dp-pin.resolved { background: #3ce29b; }

	.dp-composer {
		display: grid;
		gap: 9px;
		padding: 11px;
		border-radius: 15px;
		background: rgba(12, 9, 14, 0.72);
		border: 1px solid rgba(255, 255, 255, 0.12);
	}
	.dp-comp-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
	.dp-ts-pin {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 9px;
		border-radius: 8px;
		background: rgba(242, 90, 144, 0.16);
		border: 1px solid rgba(242, 90, 144, 0.42);
		color: #ff8eb6;
		font: 700 11px/1 var(--f-mono, ui-monospace, monospace);
		cursor: pointer;
	}
	.dp-ts-pin :global(.ic) { width: 13px; height: 13px; }
	.dp-ts-idle { font-size: 11.5px; color: #8f8499; }
	.dp-cats { display: flex; gap: 5px; flex-wrap: wrap; }
	.dp-cat {
		padding: 4px 8px;
		border-radius: 999px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.12);
		color: #8f8499;
		font: 600 10.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}
	.dp-cat.on { background: #faf7fc; color: #140e16; border-color: #faf7fc; }
	.dp-comp-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
	.dp-inp {
		width: 100%;
		min-width: 0;
		height: 44px;
		padding: 0 12px;
		box-sizing: border-box;
		border-radius: 11px;
		background: #1a141d;
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #faf7fc;
		font: 400 14px/1.3 var(--f-body, system-ui, sans-serif);
		outline: none;
	}
	.dp-inp:focus { border-color: #f25a90; }
	.dp-pin-btn {
		height: 44px;
		padding: 0 16px;
		border: 0;
		border-radius: 10px;
		background: #faf7fc;
		color: #140e16;
		font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		box-shadow: 0 3px 0 0 #f25a90;
		cursor: pointer;
	}
	.dp-pin-btn:disabled { opacity: 0.45; cursor: default; }

	.dp-c-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
	.dp-filters { display: flex; gap: 5px; }
	.dp-f {
		padding: 5px 9px;
		border-radius: 8px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #8f8499;
		font: 700 10.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}
	.dp-f.on { background: #faf7fc; color: #140e16; border-color: #faf7fc; }

	.dp-comments { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
	.dp-c-card {
		padding: 11px 12px;
		border-radius: 14px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.08);
		display: grid;
		gap: 7px;
	}
	.dp-c-card.resolved { opacity: 0.68; border-color: rgba(60, 226, 155, 0.35); }
	.dp-c-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.dp-c-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
	.dp-at {
		padding: 3px 8px;
		border-radius: 7px;
		background: rgba(156, 123, 255, 0.16);
		border: 1px solid rgba(156, 123, 255, 0.4);
		color: #d2c2ff;
		font: 700 11px/1 var(--f-mono, ui-monospace, monospace);
		cursor: pointer;
	}
	.dp-tag {
		font: 700 9.5px/1 var(--f-mono, ui-monospace, monospace);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #ffae6b;
	}
	.dp-author { font-size: 11.5px; color: #8f8499; }
	.dp-c-acts { display: flex; align-items: center; gap: 6px; }
	.dp-res-btn {
		padding: 4px 9px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: #faf7fc;
		font: 700 11px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}
	.dp-del {
		width: 26px;
		height: 26px;
		border-radius: 7px;
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #8f8499;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.dp-del :global(.ic) { width: 13px; height: 13px; }
	.dp-c-body { margin: 0; font-size: 13px; line-height: 1.45; color: #faf7fc; }
	.dp-hint { margin: 0; font-size: 12.5px; color: #8f8499; }
</style>
