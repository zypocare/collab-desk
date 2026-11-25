<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { askAi, shrinkImage } from '#lib/ai.ts';
	import { insights, nextSlots, bestSlot, slotLabel, stats } from '#lib/grow.svelte.ts';
	import { postingEvidence } from '#lib/postTime.ts';
	import { loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// Deep 0-5s Reel Hook Audit: works directly with Instagram Edits (via Share -> Check Reel in Miracle,
	// Edits screenshot before export, or exported video file), sampling 0.2s, 2.0s, and 4.5s frames.
	type Result = {
		score: number;
		verdict: string;
		checks: { ok: boolean; title: string; detail: string }[];
		line: string;
		hook_rewrite?: string;
		trim_tip?: string;
		pin_comment?: string;
		dm_keyword?: string;
	};
	type FrameShot = { label: string; at: number; data: string };
	type SharedReelPayload = { name?: string; seconds?: number; source?: string; frames?: FrameShot[] };

	let mode = $state<'edits' | 'video' | 'shot'>('edits');
	let file = $state<File | null>(null);
	let url = $state('');
	let sharedName = $state('');
	let seconds = $state(0);
	let manualSeconds = $state('');
	let frame = $state('');
	let frames = $state<FrameShot[]>([]);
	let spokenHook = $state('');
	let caption = $state('');
	let res = $state<Result | null>(null);
	let busy = $state<'' | 'check' | 'line' | 'post' | 'plan' | 'dm'>('');
	let dmActivated = $state(false);
	let video = $state<HTMLVideoElement>();

	const hasReelReady = $derived(!!file || frames.length > 0 || !!frame);
	const effectiveSeconds = $derived(seconds || Math.max(0, Math.round(Number(manualSeconds) || 0)));

	function loadSharedFromAndroid() {
		const bridge = (window as unknown as { MiracleShare?: { consumeSharedReel?: () => string } }).MiracleShare;
		if (!bridge?.consumeSharedReel) return;
		try {
			const raw = bridge.consumeSharedReel();
			if (!raw) return;
			const data = JSON.parse(raw) as SharedReelPayload;
			if (Array.isArray(data.frames) && data.frames.length) {
				frames = data.frames;
				frame = data.frames[0].data;
				seconds = Number(data.seconds) || 0;
				sharedName = data.name || 'Reel from Edits';
				mode = 'edits';
				res = null;
				toast('Loaded Reel directly from Edits — ready to audit');
			}
		} catch {
			/* ignore malformed bridge payload */
		}
	}

	onMount(() => {
		if (!studio.media.length) loadInstagram();
		loadSharedFromAndroid();
		return () => url && URL.revokeObjectURL(url);
	});

	const slot = $derived(nextSlots(studio.media, 1)[0] ?? null);
	const slotText = $derived(
		slot ? slot.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : ''
	);

	function pickVideo(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!f) return;
		if (url) URL.revokeObjectURL(url);
		file = f;
		url = URL.createObjectURL(f);
		sharedName = '';
		res = null;
		frame = '';
		frames = [];
		dmActivated = false;
		seconds = 0;
		mode = 'video';
	}

	async function pickEditsScreenshot(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!f) return;
		try {
			const data = await shrinkImage(f, 720);
			file = null;
			if (url) URL.revokeObjectURL(url);
			url = '';
			sharedName = f.name || 'Edits preview frame';
			frame = data;
			frames = [{ label: '0.0s', at: 0, data }];
			res = null;
			dmActivated = false;
			mode = 'shot';
		} catch (err) {
			toast(errMessage(err), 'alert');
		}
	}

	// Sample 3 key frames in the first 5 seconds (0.2s, 2.0s, 4.5s) to inspect visual hook & early pacing.
	async function grab() {
		const v = video;
		if (!v) return;
		const dur = v.duration || 0;
		seconds = Math.round(dur);
		const marks = [
			{ label: '0.2s', at: Math.min(0.2, Math.max(0.05, dur * 0.05)) },
			...(dur >= 2.2 ? [{ label: '2.0s', at: Math.min(2.0, dur * 0.35) }] : []),
			...(dur >= 4.8 ? [{ label: '4.5s', at: Math.min(4.5, dur * 0.65) }] : [])
		];

		const captured: FrameShot[] = [];
		const w = 360;
		const h = Math.round((v.videoHeight / Math.max(1, v.videoWidth)) * w) || 640;
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');

		for (const m of marks) {
			await new Promise<void>((resolve) => {
				const onSeek = () => {
					try {
						ctx?.drawImage(v, 0, 0, w, h);
						captured.push({ label: m.label, at: m.at, data: canvas.toDataURL('image/jpeg', 0.7) });
					} catch {
						/* ignore */
					}
					resolve();
				};
				v.addEventListener('seeked', onSeek, { once: true });
				v.currentTime = m.at;
			});
		}
		frames = captured;
		frame = captured[0]?.data ?? '';
		v.currentTime = 0;
	}

	async function check(lineOnly = false) {
		busy = lineOnly ? 'line' : 'check';
		dmActivated = false;
		try {
			const st = stats(studio.media, studio.followersHistory, studio.ig);
			const s = bestSlot(studio.media);
			const r = await askAi<Result>('reelcheck', {
				frame: lineOnly ? '' : frame,
				frames: lineOnly ? [] : frames.map((f) => ({ label: f.label, data: f.data })),
				spoken_hook: spokenHook.trim(),
				seconds: effectiveSeconds,
				caption,
				avg_watch_s: st.watch ? Math.round(st.watch * 10) / 10 : 0,
				best_formats: insights(studio.media, studio.followersHistory).map((t) => t.bold),
				best_time: s ? slotLabel(s) : '',
				posting_evidence: s ? postingEvidence(s) : '',
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

	async function activateKeyword(kw: string) {
		const clean = kw.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
		if (clean.length < 2 || busy) return;
		busy = 'dm';
		try {
			const reply = 'Hi! Thanks for commenting — here is the link & details from the Reel: {link}';
			const { data: existing } = await supabase.from('dm_rules').select('id').ilike('keyword', clean).maybeSingle();
			if (existing) {
				const { error } = await supabase.from('dm_rules').update({ active: true, reply }).eq('id', existing.id);
				if (error) throw error;
			} else {
				const { error } = await supabase.from('dm_rules').insert({ keyword: clean, reply, active: true });
				if (error) throw error;
			}
			dmActivated = true;
			toast(`Comment-to-DM active for "${clean}"`);
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}

	const rid = () =>
		Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
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
				const { data, error } = await supabase
					.from('scheduled_posts')
					.insert({
						collab_id: null,
						file_path: path,
						file_type: file.type || 'video/mp4',
						caption: fullCaption,
						collaborators: [],
						publish_at: slot.toISOString()
					})
					.select('id')
					.single();
				if (error) throw error;
				sp = (data as { id: string }).id;
			}
			const title =
				(res?.line || caption || sharedName || file?.name || 'Reel')
					.split('\n')[0]
					.replace(/[👇🔥✨]+/gu, '')
					.trim()
					.slice(0, 120) || 'Reel';
			const { error } = await supabase.from('content_plans').insert({
				title,
				why: postIt ? 'Checked in Grow · posts by itself' : 'Checked in Grow',
				post_at: slot.toISOString(),
				status: 'planned',
				source: 'check',
				scheduled_post_id: sp
			});
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
		<div class="eb">Before you post · Works with Instagram Edits</div>
		<h1>Check a <em>reel</em></h1>
		<p>Share straight from Instagram Edits, drop a pre-export frame, or pick an exported video to audit your first 5 seconds.</p>
	</div>
</header>

<div class="rc">
	<section class="panel rc-pick rv" style="--i:1">
		<!-- Source switcher -->
		<div class="rc-modes" role="tablist" aria-label="How to load your reel">
			<button class:on={mode === 'edits'} onclick={() => (mode = 'edits')} role="tab" aria-selected={mode === 'edits'}>Edits App</button>
			<button class:on={mode === 'video'} onclick={() => (mode = 'video')} role="tab" aria-selected={mode === 'video'}>Video File</button>
			<button class:on={mode === 'shot'} onclick={() => (mode = 'shot')} role="tab" aria-selected={mode === 'shot'}>Pre-Export</button>
		</div>

		{#if url}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video bind:this={video} src={url} playsinline muted preload="auto" onloadeddata={grab} controls></video>
		{:else if frames.length > 0}
			<div class="rc-shared-ok">
				<span class="rc-sh-badge"><Icon name="check" /><span>{sharedName || 'Loaded from Edits'}</span></span>
				<div class="rc-strip" aria-label="Captured opening frames">
					{#each frames as f (f.label)}
						<figure>
							<img src={f.data} alt="Frame at {f.label}" />
							<figcaption>{f.label}</figcaption>
						</figure>
					{/each}
				</div>
			</div>
		{:else if mode === 'edits'}
			<div class="rc-edits-guide">
				<span class="rc-em-ic"><Icon name="share" /></span>
				<b>Share straight from Instagram Edits</b>
				<ol class="rc-steps">
					<li>Finish your cut in <b>Edits</b> (or CapCut / VN / InShot)</li>
					<li>Tap <b>Export → Share → Check Reel in Miracle</b></li>
					<li>Miracle opens here with your 0–5s frames already loaded</li>
				</ol>
				<label class="btn primary rc-file">
					<Icon name="film" />Or pick an Edits export now
					<input type="file" accept="video/*" onchange={pickVideo} hidden />
				</label>
			</div>
		{:else if mode === 'shot'}
			<label class="rc-empty">
				<span class="rc-em-ic"><Icon name="image" /></span>
				<b>Check before exporting from Edits</b>
				<small>Take a screenshot of frame 1 inside Edits and drop it here — no need to export the full video first.</small>
				<span class="rc-tips"><i>0.0s hook</i><i>Covered text</i><i>Spoken intro</i></span>
				<input type="file" accept="image/*" onchange={pickEditsScreenshot} hidden />
			</label>
		{:else}
			<label class="rc-empty">
				<span class="rc-em-ic"><Icon name="film" /></span>
				<b>Pick a video from Files or Gallery</b>
				<small>Supports exports from Instagram Edits, CapCut, InShot, VN, or your camera roll.</small>
				<span class="rc-tips"><i>0–5s frames</i><i>Spoken hook</i><i>Covered text</i><i>Pin comment</i></span>
				<input type="file" accept="video/*" onchange={pickVideo} hidden />
			</label>
		{/if}

		{#if url && frames.length > 1}
			<div class="rc-strip" aria-label="First 5 seconds preview">
				{#each frames as f (f.label)}
					<figure>
						<img src={f.data} alt="Frame at {f.label}" />
						<figcaption>{f.label}</figcaption>
					</figure>
				{/each}
			</div>
		{/if}

		{#if hasReelReady}
			<div class="rc-swap-row">
				<label class="btn sm rc-file"><Icon name="film" />Pick video<input type="file" accept="video/*" onchange={pickVideo} hidden /></label>
				<label class="btn sm rc-file"><Icon name="image" />Pick Edits frame<input type="file" accept="image/*" onchange={pickEditsScreenshot} hidden /></label>
			</div>
		{/if}

		{#if seconds}
			<small class="hint">{seconds}s long · {frames.length} opening frame{frames.length === 1 ? '' : 's'} captured</small>
		{:else if mode === 'shot'}
			<label class="f">
				<span class="rc-eb">Reel length in seconds (optional)</span>
				<input class="inp" type="number" min="3" max="180" bind:value={manualSeconds} placeholder="e.g. 24" />
			</label>
		{/if}

		<label class="f">
			<span class="rc-eb">Opening spoken line (optional)</span>
			<input
				class="inp"
				type="text"
				bind:value={spokenHook}
				placeholder="What do you say in the first 3 seconds?"
			/>
		</label>

		<label class="f">
			<span class="rc-eb">Caption (optional)</span>
			<textarea class="inp" rows="3" bind:value={caption} placeholder="What you'd write under it"></textarea>
		</label>

		<button class="btn primary" onclick={() => check()} disabled={!hasReelReady || !!busy}>
			{#if busy === 'check'}<span class="spinner"></span>{:else}<Icon name="spark" />{/if}
			{hasReelReady ? 'Run 0–5s hook audit' : 'Load a reel or Edits frame first'}
		</button>
	</section>

	{#if res}
		<div class="rc-res">
			<section class="rc-score rv">
				<span class="rc-ring" style="background:{ring}" role="img" aria-label="Score {res.score} out of 100"><span>{res.score}</span></span>
				<div>
					<b>{res.verdict || (res.score >= 80 ? 'Ready to post' : 'A few things to fix first')}</b>
					<small>Viral readiness compared with your own best reels</small>
				</div>
			</section>

			<section class="panel rc-checks rv" style="--i:1">
				{#each res.checks as c, i (i)}
					<div class="rc-c">
						<span class="rc-dot" class:ok={c.ok}>{c.ok ? '✓' : '!'}</span>
						<span><b>{c.title}</b><small>{c.detail}</small></span>
					</div>
				{/each}
			</section>

			{#if res.hook_rewrite || res.trim_tip}
				<section class="panel rc-fixes rv" style="--i:2">
					<span class="rc-eb">Exact 0–3s fixes before posting</span>
					{#if res.hook_rewrite}
						<div class="rc-fix-box">
							<small>Put this text on screen at 0.0s</small>
							<b>{res.hook_rewrite}</b>
							<button class="btn sm" onclick={() => copyText(res?.hook_rewrite ?? '', 'On-screen hook copied')}>Copy hook</button>
						</div>
					{/if}
					{#if res.trim_tip}
						<div class="rc-fix-box">
							<small>Opening pacing fix</small>
							<p>{res.trim_tip}</p>
						</div>
					{/if}
				</section>
			{/if}

			{#if res.line}
				<section class="panel rc-line rv" style="--i:3">
					<span class="rc-eb">A first caption line that stops the scroll</span>
					<p>“{res.line}”</p>
					<div class="rc-btns">
						<button class="btn sm" onclick={() => copyText(res?.line ?? '', 'Copied')}>Copy</button>
						<button class="btn sm" onclick={() => check(true)} disabled={!!busy}>
							{#if busy === 'line'}<span class="spinner"></span>{/if}Another one
						</button>
					</div>
				</section>
			{/if}

			{#if res.pin_comment || res.dm_keyword}
				<section class="panel rc-fixes rv" style="--i:4">
					<span class="rc-eb">Hour-1 comment boost</span>
					{#if res.pin_comment}
						<div class="rc-fix-box">
							<small>Pin this as your first comment</small>
							<p>{res.pin_comment}</p>
							<button class="btn sm" onclick={() => copyText(res?.pin_comment ?? '', 'Pinned comment copied')}>Copy comment</button>
						</div>
					{/if}
					{#if res.dm_keyword}
						<div class="rc-fix-box">
							<small>Comment-to-DM magnet</small>
							<p>Tell viewers: “Comment <b>{res.dm_keyword}</b> and I’ll DM you the details.”</p>
							<button
								class="btn sm primary"
								onclick={() => activateKeyword(res?.dm_keyword ?? '')}
								disabled={busy === 'dm' || dmActivated}
							>
								{dmActivated ? `Active for "${res.dm_keyword}"` : `Activate "${res.dm_keyword}" auto-DM`}
							</button>
						</div>
					{/if}
				</section>
			{/if}

			{#if slot}
				<div class="rc-go">
					{#if studio.ig?.connected && file}
						<button class="btn primary" onclick={() => schedule(true)} disabled={!!busy}>
							{#if busy === 'post'}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Schedule for {slotText}
						</button>
					{/if}
					<button class="btn" onclick={() => schedule(false)} disabled={!!busy}>
						{#if busy === 'plan'}<span class="spinner"></span>{:else}<Icon name="cal" />{/if}Add to Calendar for {slotText}
					</button>
					<small class="hint">
						{studio.ig?.connected
							? file
								? 'Your suggested time from your own posts. Miracle posts it to Instagram for you.'
								: 'Saved to your Calendar so you can post straight from Instagram Edits at your best time.'
							: 'Connect Instagram to have Miracle post it for you.'}
					</small>
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
	.rc-modes {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 4px;
		padding: 4px;
		border-radius: 12px;
		background: var(--surface-2, var(--surface));
		border: 1px solid var(--line);
	}
	.rc-modes button {
		padding: 7px 6px;
		border-radius: 8px;
		border: 0;
		background: transparent;
		color: var(--ink-3);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.rc-modes button.on {
		background: var(--surface);
		color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.rc-edits-guide {
		display: grid;
		justify-items: center;
		text-align: center;
		gap: 10px;
		padding: 22px 16px;
		border-radius: 16px;
		background:
			radial-gradient(90% 60% at 50% 0%, color-mix(in oklab, var(--g1) 18%, transparent), transparent 70%),
			var(--surface-2, var(--surface));
		border: 1px solid var(--line-strong);
	}
	.rc-edits-guide b {
		font: 400 22px/1.15 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.rc-steps {
		margin: 0;
		padding: 0 0 0 18px;
		text-align: left;
		display: grid;
		gap: 6px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.rc-steps b {
		font-family: inherit;
		font-size: inherit;
		font-weight: 600;
		color: var(--ink);
	}
	.rc-shared-ok {
		display: grid;
		gap: 10px;
		padding: 12px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--ok) 7%, var(--surface-2));
		border: 1px solid color-mix(in oklab, var(--ok) 35%, var(--line));
	}
	.rc-sh-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ok);
	}
	.rc-swap-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
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
	.rc-strip {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.rc-strip figure {
		margin: 0;
		display: grid;
		gap: 4px;
		text-align: center;
	}
	.rc-strip img {
		width: 100%;
		aspect-ratio: 9 / 16;
		object-fit: cover;
		border-radius: 10px;
		border: 1px solid var(--line-strong);
	}
	.rc-strip figcaption {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11px;
		color: var(--ink-3);
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
		width: 58px;
		height: 58px;
		margin-bottom: 4px;
		border-radius: 50%;
		background: color-mix(in oklab, var(--g1) 16%, transparent);
		color: color-mix(in oklab, var(--g1) 70%, var(--ink));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g1) 32%, transparent);
	}
	.rc-em-ic :global(.ic) {
		width: 26px;
		height: 26px;
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
	.rc-file {
		justify-content: center;
		cursor: pointer;
	}
	.rc-eb {
		font-size: 11.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
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
		padding: 18px 20px;
		border-radius: 18px;
		background: var(--surface);
		border: 1px solid var(--line);
	}
	.rc-ring {
		width: 68px;
		height: 68px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}
	.rc-ring span {
		width: 54px;
		height: 54px;
		border-radius: 50%;
		background: var(--surface);
		display: grid;
		place-items: center;
		font: 400 26px/1 var(--f-serif, Georgia, serif);
	}
	.rc-score b {
		display: block;
		font-size: 18px;
		margin-bottom: 2px;
	}
	.rc-score small {
		color: var(--ink-3);
		font-size: 13px;
	}
	.rc-checks,
	.rc-line,
	.rc-fixes {
		padding: 18px 20px;
		display: grid;
		gap: 12px;
	}
	.rc-c {
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.rc-dot {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 12px;
		font-weight: 700;
		flex-shrink: 0;
		background: color-mix(in oklab, var(--warn) 18%, var(--surface));
		color: var(--warn);
	}
	.rc-dot.ok {
		background: color-mix(in oklab, var(--ok) 18%, var(--surface));
		color: var(--ok);
	}
	.rc-c b {
		display: block;
		font-size: 14.5px;
	}
	.rc-c small {
		display: block;
		font-size: 13px;
		color: var(--ink-2);
		margin-top: 2px;
		line-height: 1.45;
	}
	.rc-fix-box {
		padding: 12px 13px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		display: grid;
		gap: 6px;
		justify-items: start;
	}
	.rc-fix-box small {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--g3);
	}
	.rc-fix-box b {
		font-size: 15px;
		color: var(--ink);
	}
	.rc-fix-box p {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-2);
		line-height: 1.45;
	}
	.rc-line p {
		margin: 0;
		font: 400 20px/1.3 var(--f-serif, Georgia, serif);
	}
	.rc-btns {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.rc-go {
		display: grid;
		gap: 10px;
	}
	@media (max-width: 760px) {
		.rc {
			grid-template-columns: 1fr;
		}
		.rc-empty {
			aspect-ratio: auto;
			min-height: 300px;
		}
	}
</style>
