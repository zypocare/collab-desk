<script lang="ts">
	import { onMount } from 'svelte';
	import { saveSettings, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { compact, errMessage, fmt } from '../util';
	import Icon from './Icon.svelte';

	// Her YouTube channel: recent Shorts and videos with views, synced every morning.
	type V = { video_id: string; title: string; published_at: string; views: number | null; likes: number | null; thumbnail: string; is_short: boolean };
	let videos = $state<V[]>([]);
	let channel = $state('');
	let busy = $state(false);
	const s = $derived(studio.settings!);
	const shorts = $derived(videos.filter((v) => v.is_short));
	const longs = $derived(videos.filter((v) => !v.is_short));
	const avg = (xs: V[]) => {
		const v = xs.slice(0, 12).map((x) => x.views ?? 0).filter(Boolean);
		return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
	};

	async function load() {
		const { data } = await supabase.from('yt_videos').select('*').order('published_at', { ascending: false }).limit(24);
		videos = (data as V[]) ?? [];
	}
	onMount(load);

	async function sync() {
		busy = true;
		const { data, error } = await supabase.functions.invoke('youtube-sync', { body: {} });
		busy = false;
		if (error || (data as { error?: string })?.error) {
			let msg = (data as { error?: string })?.error ?? errMessage(error);
			try {
				msg = (await (error as { context?: Response })?.context?.json())?.error ?? msg;
			} catch {
				/* keep it */
			}
			return toast(msg, 'alert');
		}
		const r = data as { videos?: number; shorts?: number };
		toast(`YouTube synced: ${r.videos ?? 0} videos (${r.shorts ?? 0} Shorts)`, 'check');
		const { data: fresh } = await supabase.from('creator_settings').select('*').eq('id', 1).single();
		if (fresh) studio.settings = fresh as typeof studio.settings;
		load();
	}
	async function connect(e: SubmitEvent) {
		e.preventDefault();
		if (!channel.trim()) return;
		await saveSettings({ youtube_channel: channel.trim(), youtube_channel_id: '' });
		await sync();
	}
</script>

<section class="panel rv yt-panel">
	<div class="panel-h">
		<h2><span class="yt-dot"></span>YouTube</h2>
		{#if s.youtube_channel_id}<button class="btn sm" disabled={busy} onclick={sync}>{#if busy}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Sync now</button>{/if}
	</div>
	{#if !s.youtube_channel_id}
		<form class="form-b yt-connect" onsubmit={connect}>
			<p class="hint" style="margin:0">Add your channel to show your Shorts and video views next to Instagram, in reports and your media kit. No sign-in needed.</p>
			<div class="row-inline"><input class="inp" placeholder="youtube.com/@yourname" bind:value={channel} /><button class="btn primary" type="submit" disabled={busy || !channel.trim()}>{#if busy}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add</button></div>
			{#if s.youtube_error}<p class="err">{s.youtube_error}</p>{/if}
		</form>
	{:else}
		<div class="yt-stats">
			<div><b>{s.youtube_subscribers ? compact(s.youtube_subscribers) : '—'}</b><small>subscribers</small></div>
			<div><b>{avg(shorts) ? compact(avg(shorts)!) : '—'}</b><small>typical Short views</small></div>
			<div><b>{avg(longs) ? compact(avg(longs)!) : '—'}</b><small>typical video views</small></div>
		</div>
		<div class="yt-grid">
			{#each videos.slice(0, 9) as v (v.video_id)}
				<a class="yt-v" class:short={v.is_short} href="https://www.youtube.com/{v.is_short ? 'shorts/' : 'watch?v='}{v.video_id}" target="_blank" rel="noopener">
					<img src={v.thumbnail} alt="" loading="lazy" />
					<span class="yt-views"><Icon name="eye" />{v.views ? compact(v.views) : '—'}</span>
					{#if v.is_short}<span class="yt-tag">Short</span>{/if}
				</a>
			{/each}
		</div>
		<p class="hint yt-foot">
			{s.youtube_title} · updated {s.youtube_synced_at ? fmt(s.youtube_synced_at.slice(0, 10)) : '—'} · syncs every morning.
			{#if !s.youtube_subscribers}Subscriber count needs a free YouTube key (ask for it to be added).{/if}
			<button class="lnk" onclick={() => saveSettings({ youtube_channel: '', youtube_channel_id: '' })}>Change channel</button>
		</p>
	{/if}
</section>
