<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { askAi } from '#lib/ai.ts';
	import { insights, nextSlots, bestSlot, slotLabel, stats } from '#lib/grow.svelte.ts';
	import { loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// Check a reel before it goes up: its length against how long people watch her reels, the first second
	// (read from the first frame), text the buttons would cover, a first caption line, then schedule it at
	// her best time. Advice from her own numbers; it never promises views.
	type Result = { score: number; verdict: string; checks: { ok: boolean; title: string; detail: string }[]; line: string };
	let file = $state<File | null>(null);
	let url = $state('');
	let seconds = $state(0);
	let frame = $state('');
	let caption = $state('');
	let res = $state<Result | null>(null);
	let busy = $state<'' | 'check' | 'line' | 'post' | 'plan'>('');
	let video = $state<HTMLVideoElement>();
	onMount(() => {
		if (!studio.media.length) loadInstagram();
		return () => url && URL.revokeObjectURL(url);
	});
	const slot = $derived(nextSlots(studio.media, 1)[0] ?? null);
	const slotText = $derived(slot ? slot.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');

	function pick(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!f) return;
		if (url) URL.revokeObjectURL(url);
		file = f;
		url = URL.createObjectURL(f);
		res = null;
		frame = '';
		seconds = 0;
	}
	// The first frame, small: what a viewer sees in the first second.
	function grab() {
		const v = video;
		if (!v) return;
		seconds = Math.round(v.duration || 0);
		const draw = () => {
			const w = 360, h = Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * w) || 640;
			const c = document.createElement('canvas');
			c.width = w;
			c.height = h;
			c.getContext('2d')?.drawImage(v, 0, 0, w, h);
			try {
				frame = c.toDataURL('image/jpeg', 0.7);
			} catch {
				frame = '';
			}
		};
		v.currentTime = Math.min(0.4, (v.duration || 1) / 4);
		v.addEventListener('seeked', draw, { once: true });
	}
	async function check(lineOnly = false) {
		busy = lineOnly ? 'line' : 'check';
		try {
			const st = stats(studio.media, studio.followersHistory, studio.ig);
			const s = bestSlot(studio.media);
			const r = await askAi<Result>('reelcheck', {
				frame: lineOnly ? '' : frame,
				seconds,
				caption,
				avg_watch_s: st.watch ? Math.round(st.watch * 10) / 10 : 0,
				best_formats: insights(studio.media, studio.followersHistory).map((t) => t.bold),
				best_time: s ? slotLabel(s) : '',
				niche: studio.settings?.niche ?? ''
			});
			if (lineOnly && res) res = { ...res, line: r.line || res.line };
			else res = r;
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	const rid = () => Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
	const fullCaption = $derived([res?.line ?? '', caption].filter((x) => x.trim()).join('\n\n'));
	async function schedule(postIt: boolean) {
		if (!slot) return;
		busy = postIt ? 'post' : 'plan';
		try {
			let sp: string | null = null;
			if (postIt && file) {
				const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
				const path = `own/${studio.settings?.id}/${rid()}.${ext}`;
				const up = await supabase.storage.from('drafts').upload(path, file, { contentType: file.type || 'video/mp4' });
				if (up.error) throw up.error;
				const { data, error } = await supabase.from('scheduled_posts').insert({ collab_id: null, file_path: path, file_type: file.type || 'video/mp4', caption: fullCaption, collaborators: [], publish_at: slot.toISOString() }).select('id').single();
				if (error) throw error;
				sp = (data as { id: string }).id;
			}
			const title = (res?.line || caption || file?.name || 'Reel').split('\n')[0].replace(/[👇🔥✨]+/gu, '').trim().slice(0, 120) || 'Reel';
			const { error } = await supabase.from('content_plans').insert({ title, why: postIt ? 'Checked in Grow · posts by itself' : 'Checked in Grow', post_at: slot.toISOString(), status: 'planned', source: 'check', scheduled_post_id: sp });
			if (error) throw error;
			toast(postIt ? `Scheduled for ${slotText}. Miracle posts it to Instagram.` : `In your Calendar for ${slotText}`, 'cal');
			goto('/studio/grow');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	const ring = $derived(res ? `conic-gradient(var(--accent) 0 ${res.score}%, var(--line) ${res.score}% 100%)` : '');
</script>

<svelte:head><title>Check a reel · Miracle</title></svelte:head>

<a class="back rv" href="/studio/grow"><Icon name="back" />Grow</a>
<header class="ph rv">
	<div>
		<div class="eb">Before you post</div>
		<h1>Check a <em>reel</em></h1>
		<p>Pick the video. Miracle checks it against what works for you, then schedules it at your best time.</p>
	</div>
</header>

<div class="rc">
	<section class="panel rc-pick rv" style="--i:1">
		{#if url}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} src={url} playsinline muted preload="auto" onloadeddata={grab} controls></video>
		{:else}
			<!-- Nothing picked yet: the whole box is the button. -->
			<label class="rc-empty">
				<span class="rc-em-ic"><Icon name="film" /></span>
				<b>Tap to pick your reel</b>
				<small>From your gallery. It stays on this phone until you schedule it.</small>
				<span class="rc-tips"><i>Length</i><i>First second</i><i>Covered text</i><i>Best time</i></span>
				<input type="file" accept="video/*" onchange={pick} hidden />
			</label>
		{/if}
		{#if file}<label class="btn rc-file"><Icon name="film" />Pick another video<input type="file" accept="video/*" onchange={pick} hidden /></label>{/if}
		{#if seconds}<small class="hint">{seconds}s long</small>{/if}
		<label class="f"><span class="rc-eb">Caption (optional)</span><textarea class="inp" rows="3" bind:value={caption} placeholder="What you'd write under it"></textarea></label>
		<button class="btn primary" onclick={() => check()} disabled={!file || !!busy}>{#if busy === 'check'}<span class="spinner"></span>{:else}<Icon name="spark" />{/if}{file ? 'Check it' : 'Pick a reel to check'}</button>
	</section>

	{#if res}
		<div class="rc-res">
			<section class="rc-score rv">
				<span class="rc-ring" style="background:{ring}" role="img" aria-label="Score {res.score} out of 100"><span>{res.score}</span></span>
				<div><b>{res.verdict || (res.score >= 80 ? 'Ready to post' : 'A few things to fix first')}</b><small>Compared with your own best reels</small></div>
			</section>
			<section class="panel rc-checks rv" style="--i:1">
				{#each res.checks as c, i (i)}
					<div class="rc-c"><span class="rc-dot" class:ok={c.ok}>{c.ok ? '✓' : '!'}</span><span><b>{c.title}</b><small>{c.detail}</small></span></div>
				{/each}
			</section>
			{#if res.line}
				<section class="panel rc-line rv" style="--i:2">
					<span class="rc-eb">A first line that stops the scroll</span>
					<p>“{res.line}”</p>
					<div class="rc-btns"><button class="btn sm" onclick={() => copyText(res?.line ?? '', 'Copied')}>Copy</button><button class="btn sm" onclick={() => check(true)} disabled={!!busy}>{#if busy === 'line'}<span class="spinner"></span>{/if}Another one</button></div>
				</section>
			{/if}
			{#if slot}
				<div class="rc-go">
					{#if studio.ig?.connected}<button class="btn primary" onclick={() => schedule(true)} disabled={!!busy}>{#if busy === 'post'}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Schedule for {slotText}</button>{/if}
					<button class="btn" onclick={() => schedule(false)} disabled={!!busy}>{#if busy === 'plan'}<span class="spinner"></span>{:else}<Icon name="cal" />{/if}Just add to Calendar</button>
					<small class="hint">{studio.ig?.connected ? 'Your best time. Miracle posts it to Instagram for you, as it does for brand drafts.' : 'Connect Instagram to have Miracle post it for you.'}</small>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.rc {
		display: grid;
		grid-template-columns: 360px minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}
	.rc-pick {
		display: grid;
		gap: 12px;
		padding: 20px;
	}
	.rc-pick video,
	.rc-empty {
		width: 100%;
		aspect-ratio: 9 / 16;
		max-height: 520px;
		border-radius: 16px;
		background: var(--surface-2, var(--surface));
		object-fit: cover;
	}
	.rc-empty {
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 8px;
		padding: 24px;
		text-align: center;
		color: var(--ink-3);
		background:
			radial-gradient(90% 60% at 50% 0%, color-mix(in oklab, var(--g2) 16%, transparent), transparent 70%),
			var(--surface-2, var(--surface));
		border: 1.5px dashed var(--line-strong);
		cursor: pointer;
	}
	.rc-empty b {
		font: 400 24px/1.15 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.rc-empty small {
		max-width: 26ch;
		font-size: 13px;
		line-height: 1.45;
	}
	.rc-em-ic {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		margin-bottom: 4px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--g1), var(--g2));
		color: #fff;
	}
	.rc-em-ic :global(.ic) {
		width: 28px;
		height: 28px;
	}
	.rc-tips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px;
		margin-top: 8px;
	}
	.rc-tips i {
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--line-strong);
		font: 600 11.5px var(--f-body, inherit);
		font-style: normal;
		color: var(--ink-2);
	}
	@media (max-width: 760px) {
		.rc-empty {
			aspect-ratio: auto;
			min-height: 340px;
		}
	}
	.rc-file {
		justify-content: center;
		cursor: pointer;
	}
	.rc-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.rc-res {
		display: grid;
		gap: 14px;
	}
	.rc-score {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.rc-score div {
		display: grid;
		gap: 4px;
	}
	.rc-score b {
		font-size: 17px;
	}
	.rc-score small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.rc-ring {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		flex: none;
	}
	.rc-ring span {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: var(--bg);
		display: grid;
		place-items: center;
		font: 400 34px/1 var(--f-serif, Georgia, serif);
	}
	.rc-checks {
		display: grid;
	}
	.rc-c {
		display: grid;
		grid-template-columns: 26px minmax(0, 1fr);
		gap: 10px;
		padding: 14px 16px;
		border-top: 1px solid var(--line);
	}
	.rc-c:first-child {
		border-top: 0;
	}
	.rc-c > span:last-child {
		display: grid;
		gap: 2px;
	}
	.rc-c b {
		font-size: 14.5px;
	}
	.rc-c small {
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.rc-dot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 13px;
		background: color-mix(in oklab, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.rc-dot.ok {
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		color: var(--ok);
	}
	.rc-line {
		display: grid;
		gap: 8px;
		padding: 16px;
	}
	.rc-line p {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
	}
	.rc-btns {
		display: flex;
		gap: 8px;
	}
	.rc-go {
		display: grid;
		gap: 10px;
	}
	.rc-go :global(.btn) {
		height: 50px;
		justify-content: center;
	}
	.rc-go small {
		text-align: center;
	}
	@media (max-width: 900px) {
		.rc {
			grid-template-columns: minmax(0, 1fr);
		}
		.rc-pick video,
		.rc-empty {
			max-height: 360px;
		}
	}
</style>
