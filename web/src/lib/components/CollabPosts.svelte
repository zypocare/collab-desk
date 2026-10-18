<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { igSync, linkPost, sendReport, studio, unlinkPost } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import type { IgMedia } from '../types';
	import type { Collab } from '../types';
	import { compact, fmt, fmtTime, mediaLabel } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	let { c }: { c: Collab } = $props();
	const ig = $derived(studio.ig);
	const linkedIds = $derived(new Set(studio.collabs.flatMap((x) => x.posts.map((p) => p.media.id))));
	const choices = $derived(studio.media.filter((m) => !linkedIds.has(m.id)).slice(0, 20));
	const report = $derived(c.reports[0]);
	let busy = $state(false);
	let pick = $state('');

	const label = mediaLabel;

	// Or paste the post's link (instagram.com/p/…, /reel/…, /tv/…): found among her synced posts.
	let url = $state('');
	let finding = $state(false);
	const codeOf = (u: string) => u.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i)?.[1] ?? '';
	async function find(code: string) {
		const { data } = await supabase.from('ig_media').select('*').ilike('permalink', `%/${code}/%`).limit(1);
		return (data?.[0] as IgMedia | undefined) ?? null;
	}
	async function linkUrl() {
		const code = codeOf(url.trim());
		if (!code) return toast('Paste the post link from Instagram (Share → Copy link).', 'alert');
		finding = true;
		let m = await find(code);
		// Posted just now: fetch her latest posts once, then look again.
		if (!m) {
			await igSync();
			m = await find(code);
		}
		finding = false;
		if (!m) return toast("That post isn't on your connected Instagram account (or it's older than your last 60 posts). A collab post made by the brand's account can't be read.", 'alert');
		if (c.posts.some((p) => p.media.id === m!.id)) return toast('That post is already linked.', 'check');
		await linkPost(c, m);
		url = '';
	}
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
					<button class="icon-btn sm" onclick={async () => (await ask({ title: 'Unlink this post?', body: 'It stops counting towards this collab and its report.', ok: 'Unlink', danger: true })) && unlinkPost(c, m.id)} aria-label="Unlink this post"><Icon name="x" /></button>
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
		<form class="link-url" onsubmit={(e) => (e.preventDefault(), linkUrl())}>
			<input class="inp" type="url" inputmode="url" placeholder="Paste the post link (instagram.com/reel/…)" aria-label="Instagram post link" bind:value={url} />
			<button class="btn sm" type="submit" disabled={!url.trim() || finding}>{#if finding}<span class="spinner"></span>{:else}<Icon name="link" />{/if}Link</button>
		</form>
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
					{#if report.status === 'ready'}<button class="btn sm primary" onclick={async () => (await ask({ title: `Email the results report to ${c.contact_name || c.brand.name}?`, body: 'They get the views, reach and cost per view, with a PDF to download.', ok: 'Send' })) && sendReport(report)}><Icon name="send" />Send to brand</button>{/if}
				{:else}
					<div><b>Results report</b><small>Made automatically 7 days after the post goes live.</small></div>
				{/if}
				<button class="btn sm ghost" disabled={busy} onclick={freshReport}>{#if busy}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Make one now</button>
			</div>
		{/if}
	</section>
{/if}

<style>
	.link-url { display: flex; gap: 8px; align-items: center; margin: 0 0 8px; }
	.link-url .inp { flex: 1; min-width: 0; }
	.link-url .btn { flex: none; }
</style>
