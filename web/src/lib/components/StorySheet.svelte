<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { portal } from '../portal';
	import { studio } from '../studio.svelte';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage, initials, inrS } from '../util';
	import { saveBlob } from '../download';
	import { loadPhoto } from '../brandQr';
	import { isNative, shareNativeFile } from '../native';
	import { monthFacts, monthLabel, reviewMonths } from '../monthSummary';
	import {
		drawStoryCard,
		drawWrappedCard,
		storyCardBlob,
		wrappedCardBlob,
		type StoryCardData,
		type WrappedCardData,
		type WrappedTheme
	} from '../storyCard';
	import Icon from './Icon.svelte';

	// "Share to Story": switches between her "Book Me" profile card and "Creator Wrapped" monthly
	// milestone card (9:16 PNG for Instagram Stories) with 3 visual themes and a 1-tap Link sticker copy.
	let {
		onclose,
		initialMode = 'profile',
		wrappedMonth = ''
	}: {
		onclose: () => void;
		initialMode?: 'profile' | 'wrapped';
		wrappedMonth?: string;
	} = $props();

	const s = $derived(studio.settings!);
	const ig = $derived(studio.ig?.connected ? studio.ig : null);
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	const bare = $derived(link.replace(/^https?:\/\//, ''));

	let mode = $state<'profile' | 'wrapped'>(untrack(() => initialMode));
	let theme = $state<WrappedTheme>('aurora');
	let showRevenue = $state(false);
	let photo = $state<HTMLImageElement | null>(null);
	let ready = $state(false);
	let busy = $state(false);
	let canvas = $state<HTMLCanvasElement>();

	const activeMonth = $derived(wrappedMonth || reviewMonths(studio.collabs)[0] || new Date().toISOString().slice(0, 7));

	const profileData = (): StoryCardData => ({
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

	const wrappedData = (): WrappedCardData => {
		const mf = monthFacts(activeMonth, studio.collabs, s, studio.media, studio.followersHistory);
		const liveCollabs = studio.collabs.filter((c) => c.stage === 'live' || c.stage === 'wrapped');
		let totalViews = 0;
		let topBrand = '';
		let topViews = 0;
		for (const c of liveCollabs) {
			const v = c.posts?.reduce((a, x) => a + (x.media?.views ?? x.media?.reach ?? 0), 0) ?? 0;
			totalViews += v;
			if (v > topViews) {
				topViews = v;
				topBrand = c.brand.name;
			}
		}
		if (!topBrand && mf.wentLive.length) topBrand = mf.wentLive[0];
		const growth = mf.followers ? mf.followers.end - mf.followers.start : null;

		return {
			monthLabel: monthLabel(activeMonth),
			name: s.display_name || ig?.username || s.handle || 'Creator',
			handle: ig?.username || s.handle || '',
			link: bare,
			photo,
			initials: initials(s.display_name || s.handle || 'M').slice(0, 2),
			totalViews,
			collabsCount: mf.wentLive.length || liveCollabs.length,
			topBrand,
			topViews,
			followerGrowth: growth,
			earnedLabel: showRevenue && mf.earned > 0 ? inrS(mf.earned) : null,
			accepting: s.accepting !== false,
			theme
		};
	};

	onMount(async () => {
		photo = ig ? await loadPhoto(ig.profile_picture_url) : null;
		await document.fonts?.ready;
		ready = true;
	});

	$effect(() => {
		if (!canvas || !ready) return;
		if (mode === 'wrapped') drawWrappedCard(canvas, wrappedData());
		else drawStoryCard(canvas, profileData());
	});

	const canShare = isNative() || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
	const fileName = () => (mode === 'wrapped' ? `miracle-wrapped-${activeMonth}.png` : 'miracle-story.png');
	const makeBlob = () => (mode === 'wrapped' ? wrappedCardBlob(wrappedData()) : storyCardBlob(profileData()));

	async function share() {
		busy = true;
		try {
			const b = await makeBlob();
			if (!b) return toast("Couldn't make the picture just now", 'alert');
			const name = fileName();
			if (isNative()) {
				await shareNativeFile(b, name);
				return;
			}
			const file = new File([b], name, { type: 'image/png' });
			if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
			else await saveBlob(b, name);
		} catch (e) {
			if ((e as Error)?.name !== 'AbortError') toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}

	async function save() {
		const b = await makeBlob();
		if (b) saveBlob(b, fileName()).catch((e) => toast(errMessage(e), 'alert'));
		else toast("Couldn't make the picture just now", 'alert');
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog ss" role="dialog" aria-modal="true" aria-labelledby="ss-title">
		<h2 id="ss-title">{mode === 'wrapped' ? 'Creator Wrapped Story' : 'Share to your Story'}</h2>
		<p>{mode === 'wrapped' ? 'Share your verified monthly reach and top collab to Instagram Stories.' : 'A picture of your page for Instagram. Brands and followers who see it know where to book you.'}</p>

		<div class="ss-tabs section-tabs" role="tablist" aria-label="Story card style">
			<button type="button" role="tab" aria-selected={mode === 'profile'} class:on={mode === 'profile'} onclick={() => (mode = 'profile')}>Book Me Card</button>
			<button type="button" role="tab" aria-selected={mode === 'wrapped'} class:on={mode === 'wrapped'} onclick={() => (mode = 'wrapped')}>Month Wrapped</button>
		</div>

		{#if mode === 'wrapped'}
			<div class="ss-opts">
				<div class="ss-themes" aria-label="Color theme">
					{#each [['aurora', 'Aurora'], ['noir', 'Noir Gold'], ['sunset', 'Sunset']] as [tKey, tLbl] (tKey)}
						<button type="button" class="ss-th" class:on={theme === tKey} onclick={() => (theme = tKey as WrappedTheme)}>{tLbl}</button>
					{/each}
				</div>
				<label class="ss-rev"><input type="checkbox" bind:checked={showRevenue} /><span>Show revenue</span></label>
			</div>
		{/if}

		<div class="ss-pic">{#if ready}<canvas bind:this={canvas} aria-label="Your Story picture"></canvas>{:else}<span class="spinner"></span>{/if}</div>
		<ol class="ss-how">
			<li>Post it to your Story.</li>
			<li>Add a <b>Link</b> sticker with your link: <button class="ss-copy" onclick={() => copyText(link, 'Link copied. Paste it in the Link sticker.')}>{bare}<Icon name="copy" /></button></li>
			<li>Mention <b>@themiracleapp</b> so we can repost it.</li>
		</ol>
		<div class="ss-acts">
			{#if canShare}<button class="btn grad lg" onclick={share} disabled={!ready || busy}>{#if busy}<span class="spinner"></span>{:else}<Icon name="insta" />{/if}Share to Story</button>{/if}
			<button class="btn" class:grad={!canShare} class:lg={!canShare} onclick={save} disabled={!ready}><Icon name="download" />Save 9:16 PNG</button>
		</div>
	</div>
</div>

<style>
	.ss { width: min(440px, 100%); }
	.ss p { margin: 4px 0 12px; color: var(--ink-3); }
	.ss-tabs { margin-bottom: 12px; }
	@media (width > 760px) {
		.ss-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 3px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); }
		.ss-tabs button { appearance: none; border: 0; background: none; color: var(--ink-2); font: 700 12.5px/1 var(--f-body); padding: 9px 10px; border-radius: 999px; cursor: pointer; }
		.ss-tabs button.on { background: var(--ink); color: var(--bg); }
	}
	.ss-opts { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
	.ss-themes { display: flex; gap: 6px; }
	.ss-th { appearance: none; border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-2); font: 600 11.5px/1 var(--f-body); padding: 6px 10px; border-radius: 999px; cursor: pointer; }
	.ss-th.on { border-color: var(--g1); color: var(--ink); background: color-mix(in oklab, var(--g1) 18%, var(--surface)); }
	.ss-rev { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-2); cursor: pointer; }
	.ss-pic { display: grid; place-items: center; min-height: 300px; }
	.ss-pic canvas { width: min(190px, 46vw); height: auto; border-radius: 18px; box-shadow: 0 18px 40px -22px rgba(0, 0, 0, .55); }
	.ss-how { margin: 14px 0 0; padding-left: 20px; display: grid; gap: 8px; color: var(--ink-2); font-size: 14.5px; }
	.ss-how b { color: var(--ink); }
	.ss-copy { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--ink); font: 600 13.5px/1.6 var(--f-body); cursor: pointer; max-width: 100%; overflow-wrap: anywhere; }
	.ss-copy :global(.ic) { width: 14px; height: 14px; flex: none; }
	.ss-acts { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 16px; }
	.ss-acts :global(.btn) { justify-content: center; }
</style>
