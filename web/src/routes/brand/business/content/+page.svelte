<script lang="ts">
	import { onMount } from 'svelte';
	import { call, type ContentItem } from '#lib/business.svelte.ts';
	import { askNote } from '#lib/confirm.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage, firstName, fmt, mediaLabel, todayIso } from '#lib/util.ts';

	// Content: every post and file creators delivered, with how long it may be used in ads.
	let items = $state<ContentItem[] | null>(null);
	let show = $state<'all' | 'ending' | 'ads'>('all');
	async function load() {
		try {
			items = await call<ContentItem[]>('brand_content');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	onMount(load);
	const today = todayIso();
	const daysLeft = (c: ContentItem) => (c.usage_ends ? Math.round((Date.parse(c.usage_ends) - Date.parse(today)) / 864e5) : null);
	const ads = (c: ContentItem) => c.usage !== 'Organic only';
	const ending = (c: ContentItem) => ads(c) && (daysLeft(c) ?? 999) <= 14 && (daysLeft(c) ?? -1) >= 0;
	const list = $derived((items ?? []).filter((c) => (show === 'ending' ? ending(c) : show === 'ads' ? ads(c) : true)));
	const usageText = (c: ContentItem) => {
		if (!ads(c)) return { text: 'Organic only', tone: '' };
		const d = daysLeft(c);
		if (c.usage_ext_status === 'requested') return { text: 'Extension asked', tone: '' };
		if (d === null) return { text: c.usage, tone: 'ok' };
		if (d < 0) return { text: `Ad rights ended ${fmt(c.usage_ends)}`, tone: 'bad' };
		return { text: `Paid ads until ${fmt(c.usage_ends)}${d <= 14 ? ` · ${d} day${d === 1 ? '' : 's'} left` : ''}`, tone: d <= 14 ? 'warn' : 'ok' };
	};
	// Instagram thumbnails expire; show the placeholder instead of a broken image.
	let broken = $state<Record<string, boolean>>({});
	const at = (c: ContentItem, path: string) => (c.slug === pageSlug ? path : addressFor(c.slug, path));
	async function extend(c: ContentItem) {
		const v = await askNote({ title: 'Extend ad rights', body: `${firstName(c.creator)} gets your request with the price, and confirms it.`, note: 'More days (30, 60 or 90)', placeholder: '30', ok: 'Ask to extend' });
		if (v === null) return;
		const d = [30, 60, 90].includes(Number(v)) ? Number(v) : 30;
		try {
			await call('content_extend', { p_collab: c.collab_id, p_days: d });
			toast(`Asked ${firstName(c.creator)} for ${d} more days`, 'check');
			load();
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	async function askAds(c: ContentItem) {
		try {
			await call('brand_ask', { p_collab: c.collab_id, p_what: 'ads' });
			toast(`Asked ${firstName(c.creator)} about ad rights in your chat`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
</script>

<svelte:head><title>Content · Miracle</title></svelte:head>

{#if !items}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<div class="ct-chips" role="group" aria-label="Show">
		<button class:on={show === 'all'} onclick={() => (show = 'all')}>All · {items.length}</button>
		<button class:on={show === 'ending'} onclick={() => (show = 'ending')}>Usage ending soon · {items.filter(ending).length}</button>
		<button class:on={show === 'ads'} onclick={() => (show = 'ads')}>Ads allowed · {items.filter(ads).length}</button>
	</div>
	<div class="ct-grid">
			{#each list as c (c.collab_id)}
				{@const u = usageText(c)}
				{@const p = c.posts[0]}
				<article class="ct-c" class:warn={u.tone === 'warn'}>
					{#if p?.thumb && !broken[c.collab_id]}<a class="ct-img" href={p.permalink} target="_blank" rel="noopener"><img src={p.thumb} alt="Post by {c.creator}" loading="lazy" referrerpolicy="no-referrer" onerror={() => (broken[c.collab_id] = true)} /></a>{:else}<div class="ct-img ct-ph">{c.files ? `${c.files} file${c.files === 1 ? '' : 's'}` : p ? 'Preview not available' : 'No preview'}</div>{/if}
					<div class="ct-b">
						<div class="ct-t"><b>{firstName(c.creator)}</b><small>{p ? `${mediaLabel(p.type, p.product ?? '')} · ${fmt(p.posted_at?.slice(0, 10))}` : c.code}</small></div>
						{#if p}<span class="ct-n">{p.views != null ? `${compact(p.views)} views` : ''}{p.views != null && p.likes != null ? ' · ' : ''}{p.likes != null ? `${compact(p.likes)} likes` : ''}{c.posts.length > 1 ? ` · ${c.posts.length} posts` : ''}</span>{/if}
						<span class="ct-u {u.tone}">{u.text}</span>
						<div class="ct-a">
							{#if ads(c) && c.usage_ends && c.usage_ext_status !== 'requested' && (daysLeft(c) ?? 0) <= 30}
								<button class="ct-neo ct-light ct-grow" onclick={() => extend(c)}>Extend usage</button>
							{:else if !ads(c)}
								<button class="ct-neo ct-ghost ct-grow" onclick={() => askAds(c)}>Ask for ad rights</button>
							{:else if p}
								<a class="ct-neo ct-ghost ct-grow" href={p.permalink} target="_blank" rel="noopener">Open post</a>
							{/if}
							<a class="ct-neo ct-ghost" href={at(c, `/brand/r/${c.code}`)}>{c.files ? 'Files' : 'Open'}</a>
						</div>
					</div>
				</article>
			{/each}
			<p class="ct-none">Posts appear here once a creator's post goes live and is matched to your request, with the raw files they send you.</p>
		</div>
{/if}

<style>
	.ct-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 16px;
	}
	.ct-chips button {
		height: 36px;
		padding: 0 14px;
		border: 0;
		border-radius: 99px;
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink-2);
		font: 600 13px/1 var(--f-body);
		cursor: pointer;
	}
	.ct-chips button.on {
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		box-shadow: none;
		color: var(--g2);
	}
	.ct-none {
		margin: 0;
		display: grid;
		place-items: center;
		min-height: 180px;
		padding: 20px;
		border-radius: 18px;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
		color: var(--ink-3);
		font-size: 13.5px;
		line-height: 1.5;
		text-align: center;
	}
	.ct-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
		gap: 14px;
	}
	.ct-c {
		display: grid;
		grid-template-rows: auto 1fr;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		overflow: hidden;
	}
	.ct-c.warn {
		box-shadow: inset 0 0 0 1.5px var(--g3);
	}
	.ct-img {
		display: block;
		height: 220px;
		background: color-mix(in oklab, var(--ink) 6%, var(--bg));
	}
	.ct-img img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.ct-ph {
		display: grid;
		place-items: center;
		color: var(--ink-3);
		font-size: 13px;
	}
	.ct-b {
		display: grid;
		align-content: start;
		gap: 8px;
		padding: 14px;
	}
	.ct-t {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.ct-t b {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 20px;
	}
	.ct-t small,
	.ct-n {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.ct-u {
		justify-self: start;
		font-size: 12px;
		font-weight: 700;
		padding: 5px 9px;
		border-radius: 99px;
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink-2);
	}
	.ct-u.ok {
		box-shadow: none;
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		color: var(--ok);
	}
	.ct-u.warn {
		box-shadow: none;
		background: color-mix(in oklab, var(--g3) 16%, transparent);
		color: var(--g3);
	}
	.ct-u.bad {
		box-shadow: none;
		background: color-mix(in oklab, var(--bad) 14%, transparent);
		color: var(--bad);
	}
	.ct-a {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}
	.ct-grow {
		flex: 1;
	}
	.ct-neo {
		height: 38px;
		display: inline-grid;
		place-items: center;
		padding: 0 12px;
		border: 0;
		cursor: pointer;
		text-decoration: none;
		font: 700 11px/1 var(--f-body);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.ct-light {
		background: var(--ink);
		color: var(--bg);
		box-shadow: 3px 3px 0 var(--g2);
	}
	.ct-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--ink-3);
	}
</style>
