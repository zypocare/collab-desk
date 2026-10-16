<script lang="ts">
	import { igSync, linkPost, sendReport, studio, unlinkPost } from '../studio.svelte';
	import type { Collab } from '../types';
	import { compact, fmt, fmtTime } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	let { c }: { c: Collab } = $props();
	const ig = $derived(studio.ig);
	const linkedIds = $derived(new Set(studio.collabs.flatMap((x) => x.posts.map((p) => p.media.id))));
	const choices = $derived(studio.media.filter((m) => !linkedIds.has(m.id)).slice(0, 20));
	const report = $derived(c.reports[0]);
	let busy = $state(false);
	let pick = $state('');

	const label = (t: string, p: string) => (p === 'REELS' ? 'Reel' : t === 'CAROUSEL_ALBUM' ? 'Carousel' : t === 'VIDEO' ? 'Video' : 'Post');
	async function freshReport() {
		busy = true;
		await igSync(c.id);
		busy = false;
	}
</script>

{#if ig?.connected && ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage)}
	<section class="sec">
		<h3>Instagram posts {#if c.posts.length}<span>{c.posts.length} linked</span>{/if}</h3>
		{#each c.posts as p (p.media.id)}
			{@const m = p.media}
			<div class="post-row">
				<div class="post-h">
					<span class="pill tint k-live">{label(m.media_type, m.product_type)}</span>
					<span class="hint">{fmt(m.posted_at.slice(0, 10))}{p.matched_by === 'auto' ? ' · spotted automatically' : ''}</span>
					<a class="lnk" style="margin-left:auto" href={m.permalink} target="_blank" rel="noopener">Open</a>
					<button class="icon-btn sm" onclick={() => unlinkPost(c, m.id)} aria-label="Unlink this post"><Icon name="x" /></button>
				</div>
				<div class="post-stats">
					<div><b>{compact(m.views)}</b><small>views</small></div>
					<div><b>{compact(m.reach)}</b><small>reach</small></div>
					<div><b>{compact(m.likes)}</b><small>likes</small></div>
					<div><b>{compact(m.comments)}</b><small>comments</small></div>
					<div><b>{compact(m.saves)}</b><small>saves</small></div>
					<div><b>{compact(m.shares)}</b><small>shares</small></div>
				</div>
				{#if m.caption}<p class="hint post-cap">{m.caption}</p>{/if}
			</div>
		{:else}
			<p class="hint" style="margin:0 0 10px">No post linked yet. When you post and @mention @{c.brand.instagram || 'the brand'}, it's linked automatically at the next sync.</p>
		{/each}
		{#if choices.length}
			<div class="link-post">
				<Select size="sm" ariaLabel="Link a post by hand" placeholder="Link a post by hand…" bind:value={pick} options={choices.map((m) => ({ value: m.id, label: (m.caption || 'No caption').slice(0, 60), hint: `${fmt(m.posted_at.slice(0, 10))} · ${label(m.media_type, m.product_type)}` }))} />
				<button class="btn sm" disabled={!pick} onclick={() => { const m = studio.media.find((x) => x.id === pick); if (m) linkPost(c, m); pick = ''; }}>Link</button>
			</div>
		{/if}

		{#if c.posts.length}
			<div class="report-box">
				{#if report}
					<div>
						<b>Results report</b>
						<small>{report.status === 'sent' ? `Sent to the brand ${report.sent_at ? fmtTime(report.sent_at) : ''}` : 'Ready. Check it, then send it.'} · {compact(report.data.totals.views)} views · {compact(report.data.totals.reach)} reached</small>
					</div>
					<a class="btn sm" href="/report/{report.public_token}" target="_blank" rel="noopener"><Icon name="eye" />View</a>
					{#if report.status === 'ready'}<button class="btn sm primary" onclick={() => sendReport(report)}><Icon name="send" />Send to brand</button>{/if}
				{:else}
					<div><b>Results report</b><small>Made automatically 7 days after the post goes live.</small></div>
				{/if}
				<button class="btn sm ghost" disabled={busy} onclick={freshReport}>{#if busy}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Make one now</button>
			</div>
		{/if}
	</section>
{/if}
