<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '../supabase';
	import Icon from './Icon.svelte';
	import type { DraftComment } from '../types';

	// A draft file (video or photo) with comments pinned to moments in the video.
	type Comment = DraftComment;
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

	let url = $state('');
	let failed = $state(false);
	let video = $state<HTMLVideoElement>();
	let duration = $state(0);
	let body = $state('');
	let at = $state<number | null>(null);
	let busy = $state(false);
	const isVideo = $derived(type.startsWith('video'));

	onMount(async () => {
		const { data, error } = await supabase.storage.from('drafts').createSignedUrl(path, 60 * 60 * 6);
		if (error || !data) failed = true;
		else url = data.signedUrl;
	});

	const mmss = (s: number | null) => (s === null ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
	function seek(s: number | null) {
		if (!video || s === null) return;
		video.currentTime = s;
		video.play().catch(() => {});
	}
	// Starting to type pins the comment to where the video is, and pauses it.
	function pin() {
		if (!video || !isVideo) return;
		if (at === null) {
			video.pause();
			at = Math.round(video.currentTime * 10) / 10;
		}
	}
	async function add(e: SubmitEvent) {
		e.preventDefault();
		if (!body.trim() || !onadd) return;
		busy = true;
		if (await onadd(at, body.trim())) {
			body = '';
			at = null;
		}
		busy = false;
	}
</script>

<div class="dplayer">
	{#if failed}
		<p class="hint">The file couldn't be opened. Ask for a fresh link.</p>
	{:else if !url}
		<div class="dp-media dp-load"><span class="spinner"></span></div>
	{:else if isVideo}
		<div class="dp-media">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} src={url} controls playsinline preload="metadata" onloadedmetadata={() => (duration = video?.duration ?? 0)}></video>
		</div>
		{#if duration && comments.some((c) => c.at !== null)}
			<div class="dp-marks" aria-hidden="true">
				{#each comments.filter((c) => c.at !== null) as c (c.id)}<button tabindex="-1" style="left:{Math.min(100, ((c.at ?? 0) / duration) * 100)}%" title="{mmss(c.at)} {c.body}" onclick={() => seek(c.at)}></button>{/each}
			</div>
		{/if}
	{:else}
		<div class="dp-media"><img src={url} alt="Draft" /></div>
	{/if}
	<a class="lnk dp-open" href={url || undefined} target="_blank" rel="noopener"><Icon name="eye" />Open full size</a>

	{#if comments.length}
		<ul class="dp-comments">
			{#each comments as c (c.id)}
				<li>
					{#if c.at !== null}<button class="dp-at" onclick={() => seek(c.at)}>{mmss(c.at)}</button>{/if}
					<span>{c.body}{#if c.name}<small>{' · '}{c.name}</small>{/if}</span>
					{#if ondelete}<button class="shot-x" aria-label="Remove comment" onclick={() => ondelete?.(c.id)}><Icon name="x" /></button>{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if canComment}
		<form class="dp-add" onsubmit={add}>
			{#if at !== null}<button type="button" class="dp-at" title="Remove the time" onclick={() => (at = null)}>{mmss(at)} ×</button>{/if}
			<input class="inp" placeholder={isVideo ? 'Pause where you want a change, then type it here' : 'What would you change?'} bind:value={body} onfocus={pin} oninput={pin} />
			<button class="btn sm" type="submit" disabled={busy || !body.trim()}>{#if busy}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add</button>
		</form>
	{/if}
</div>
