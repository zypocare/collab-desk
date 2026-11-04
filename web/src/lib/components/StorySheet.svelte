<script lang="ts">
	import { onMount } from 'svelte';
	import { portal } from '../portal';
	import { studio } from '../studio.svelte';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage, initials } from '../util';
	import { saveBlob } from '../download';
	import { loadPhoto } from '../brandQr';
	import { isNative, shareNativeFile } from '../native';
	import { drawStoryCard, storyCardBlob, type StoryCardData } from '../storyCard';
	import Icon from './Icon.svelte';

	// "Share to Story": a picture of her page, sized for an Instagram Story, to post with a Link sticker.
	// Each one shows her followers where to book her, and Miracle to every creator who sees it.
	let { onclose }: { onclose: () => void } = $props();
	const s = $derived(studio.settings!);
	const ig = $derived(studio.ig?.connected ? studio.ig : null);
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	const bare = $derived(link.replace(/^https?:\/\//, ''));
	let photo = $state<HTMLImageElement | null>(null);
	let ready = $state(false);
	let busy = $state(false);
	let canvas = $state<HTMLCanvasElement>();

	const data = (): StoryCardData => ({
		name: s.display_name || ig?.username || s.handle || 'Creator',
		niche: s.niche || '',
		city: s.city || '',
		link: bare,
		handle: ig?.username || s.handle || '',
		photo,
		initials: initials(s.display_name || s.handle || 'M').slice(0, 2),
		followers: ig?.followers ?? null,
		engagement: ig?.engagement_rate ?? null,
		avgViews: ig?.avg_views ?? null,
		accepting: s.accepting !== false
	});

	onMount(async () => {
		photo = ig ? await loadPhoto(ig.profile_picture_url) : null;
		await document.fonts?.ready;
		ready = true;
	});
	$effect(() => {
		if (canvas && ready) drawStoryCard(canvas, data());
	});

	// The phone app and phones with a share sheet send the picture straight to Instagram; elsewhere it's saved.
	const canShare = isNative() || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
	const NAME = 'miracle-story.png';
	async function share() {
		busy = true;
		try {
			const b = await storyCardBlob(data());
			if (!b) return toast("Couldn't make the picture just now", 'alert');
			if (isNative()) {
				await shareNativeFile(b, NAME);
				return;
			}
			const file = new File([b], NAME, { type: 'image/png' });
			if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
			else await saveBlob(b, NAME);
		} catch (e) {
			if ((e as Error)?.name !== 'AbortError') toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
	async function save() {
		const b = await storyCardBlob(data());
		if (b) saveBlob(b, NAME).catch((e) => toast(errMessage(e), 'alert'));
		else toast("Couldn't make the picture just now", 'alert');
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog ss" role="dialog" aria-modal="true" aria-labelledby="ss-title">
		<h2 id="ss-title">Share to your Story</h2>
		<p>A picture of your page for Instagram. Brands and followers who see it know where to book you.</p>
		<div class="ss-pic">{#if ready}<canvas bind:this={canvas} aria-label="Your Story picture"></canvas>{:else}<span class="spinner"></span>{/if}</div>
		<ol class="ss-how">
			<li>Post it to your Story.</li>
			<li>Add a <b>Link</b> sticker with your link: <button class="ss-copy" onclick={() => copyText(link, 'Link copied. Paste it in the Link sticker.')}>{bare}<Icon name="copy" /></button></li>
			<li>Mention <b>@themiracleapp</b> so we can see it.</li>
		</ol>
		<div class="ss-acts">
			{#if canShare}<button class="btn grad lg" onclick={share} disabled={!ready || busy}>{#if busy}<span class="spinner"></span>{:else}<Icon name="insta" />{/if}Share to Story</button>{/if}
			<button class="btn" class:grad={!canShare} class:lg={!canShare} onclick={save} disabled={!ready}><Icon name="download" />Save image</button>
		</div>
	</div>
</div>

<style>
	.ss { width: min(440px, 100%); }
	.ss p { margin: 4px 0 14px; color: var(--ink-3); }
	.ss-pic { display: grid; place-items: center; min-height: 300px; }
	.ss-pic canvas { width: min(190px, 46vw); height: auto; border-radius: 18px; box-shadow: 0 18px 40px -22px rgba(0, 0, 0, .55); }
	.ss-how { margin: 16px 0 0; padding-left: 20px; display: grid; gap: 8px; color: var(--ink-2); font-size: 15px; }
	.ss-how b { color: var(--ink); }
	.ss-copy { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--ink); font: 600 14px/1.6 var(--f-body); cursor: pointer; max-width: 100%; overflow-wrap: anywhere; }
	.ss-copy :global(.ic) { width: 14px; height: 14px; flex: none; }
	.ss-acts { display: grid; grid-template-columns: 1fr; gap: 12px; margin-top: 18px; }
	.ss-acts :global(.btn) { justify-content: center; }
</style>
