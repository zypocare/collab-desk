<script lang="ts">
	import { onMount } from 'svelte';
	import { ask } from '../confirm.svelte';
	import { igImg } from '../igImg';
	import { igSync, linkPost, sendReport, studio, unlinkPost } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import type { Collab, IgMedia } from '../types';
	import { compact, fmt, fmtTime, mediaLabel } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	let { c }: { c: Collab } = $props();
	const ig = $derived(studio.ig);
	const followers = $derived(Number(ig?.followers ?? studio.settings?.followers ?? 0));
	const linkedIds = $derived(new Set(studio.collabs.flatMap((x) => x.posts.map((p) => p.media.id))));
	const choices = $derived(studio.media.filter((m) => !linkedIds.has(m.id)).slice(0, 20));
	const report = $derived(c.reports[0]);
	let busy = $state(false);
	let syncing = $state(false);
	let pick = $state('');

	const syncedLabel = $derived.by(() => {
		if (!ig?.last_sync_at) return 'Not synced yet';
		const mins = Math.max(0, Math.round((Date.now() - Date.parse(ig.last_sync_at)) / 60_000));
		if (mins < 1) return 'Updated just now';
		if (mins < 60) return `Updated ${mins}m ago`;
		const hrs = Math.round(mins / 60);
		if (hrs < 24) return `Updated ${hrs}h ago`;
		return `Updated ${fmt(ig.last_sync_at.slice(0, 10))}`;
	});

	async function syncNow() {
		if (syncing) return;
		syncing = true;
		await igSync();
		syncing = false;
	}

	onMount(() => {
		if (!ig?.connected || !c.posts.length) return;
		const ageMs = ig.last_sync_at ? Date.now() - Date.parse(ig.last_sync_at) : Infinity;
		if (ageMs > 2 * 60_000) syncNow();
	});
	let failedThumbs = $state<Record<string, boolean>>({});

	const label = mediaLabel;

	function postEr(m: IgMedia): string {
		if (!followers) return '';
		const interactions = (m.likes || 0) + (m.comments || 0) + (m.saves || 0) + (m.shares || 0);
		if (!interactions) return '';
		return `${((interactions / followers) * 100).toFixed(2)}%`;
	}

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
	async function disclosureRecord(c: Collab, m: Collab['posts'][number]['media']) {
		const { lintDisclosure } = await import('../asci');
		const { letterPdf } = await import('../demand');
		const lint = lintDisclosure(m.caption ?? '', { type: c.type, format: m.media_type === 'VIDEO' || m.product_type === 'REELS' ? 'reel' : 'post', category: c.brand.category });
		const when = new Date(m.posted_at).toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
		const body = [
			`Collaboration ${c.code} with ${c.brand.name}${c.type === 'barter' ? ' (gifted product)' : ' (paid)'}.`,
			`Posted on Instagram on ${when}: ${m.permalink}`,
			`Caption as posted:\n${m.caption || '(no caption)'}`,
			`Disclosure checks (ASCI guidelines for influencer advertising):\n${lint.map((l) => `${l.level === 'ok' ? 'OK' : l.level === 'bad' ? 'FIX' : 'NOTE'}: ${l.title}${l.fix ? `. ${l.fix}` : ''}`).join('\n')}`,
			`Record made by Miracle on ${new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}. Keep it with the agreement and the invoice.`
		].join('\n\n');
		await letterPdf(`Disclosure record · ${c.code}`, body, `Disclosure-${c.code}.pdf`);
	}
</script>

{#if ig?.connected && ['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage)}
	<section class="sec cp2">
		<h3>Instagram posts {#if c.posts.length}<span>{c.posts.length} linked</span>{/if}</h3>

		<div class="cp2-stack">
		<div class="cp2-syncbar">
			<span class="cp2-syncmeta"><i class="cp2-sdot" class:live={syncing} aria-hidden="true"></i>{syncing ? 'Fetching live Instagram numbers…' : syncedLabel}</span>
			<button type="button" class="cp2-syncbtn" disabled={syncing} onclick={syncNow}>
				{#if syncing}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}
				<span>Sync live</span>
			</button>
		</div>

		{#each c.posts as p (p.media.id)}
			{@const m = p.media}
			{@const thumb = !failedThumbs[m.id] && m.thumbnail_url ? igImg(m.thumbnail_url) : ''}
			{@const er = postEr(m)}
			<article class="cp2-card">
				<!-- Media Preview Header -->
				<div class="cp2-top">
					<a class="cp2-thumb" href={m.permalink} target="_blank" rel="noopener" aria-label="Open post on Instagram">
						{#if thumb}
							<img src={thumb} alt="" referrerpolicy="no-referrer" onerror={() => (failedThumbs = { ...failedThumbs, [m.id]: true })} />
						{:else}
							<Icon name="film" />
						{/if}
					</a>

					<div class="cp2-meta">
						<div class="cp2-badges">
							<span class="cp2-pill">{label(m.media_type, m.product_type)}</span>
							<span class="cp2-date">{fmt(m.posted_at.slice(0, 10))}</span>
							{#if p.matched_by === 'auto'}
								<span class="cp2-auto">Auto-linked</span>
							{/if}
						</div>
						{#if m.caption}
							<p class="cp2-cap">{m.caption}</p>
						{:else}
							<p class="cp2-cap muted">No caption</p>
						{/if}
					</div>

					<button
						type="button"
						class="cp2-x"
						onclick={async () =>
							(await ask({
								title: 'Unlink this post?',
								body: 'It stops counting towards this collab and its report.',
								ok: 'Unlink',
								danger: true
							})) && unlinkPost(c, m.id)}
						aria-label="Unlink this post"
					>
						<Icon name="x" />
					</button>
				</div>

				<!-- Primary Reach & Views KPIs -->
				<div class="cp2-hero-kpis" class:cols3={!!er}>
					<div class="cp2-hk">
						<small>Views</small>
						<b>{compact(m.views)}</b>
					</div>
					<div class="cp2-hk">
						<small>Reach</small>
						<b>{compact(m.reach)}</b>
					</div>
					{#if er}
						<div class="cp2-hk hi">
							<small>Eng. rate</small>
							<b>{er}</b>
						</div>
					{/if}
				</div>

				<!-- 4-Column Engagement Breakdown -->
				<div class="cp2-eng">
					<div><b>{compact(m.likes)}</b><small>Likes</small></div>
					<div><b>{compact(m.comments)}</b><small>Comments</small></div>
					<div><b>{compact(m.saves)}</b><small>Saves</small></div>
					<div><b>{compact(m.shares)}</b><small>Shares</small></div>
				</div>

				<!-- Footer Actions -->
				<div class="cp2-acts">
					<button type="button" class="cp2-btn" onclick={() => disclosureRecord(c, m)}>
						<Icon name="shield" /><span>Disclosure PDF</span>
					</button>
					<a class="cp2-btn primary" href={m.permalink} target="_blank" rel="noopener">
						<Icon name="insta" /><span>Open on IG</span>
					</a>
				</div>
			</article>
		{:else}
			<div class="cp2-empty">
				<span class="cp2-eic"><Icon name="insta" /></span>
				<div>
					<b>No post linked yet</b>
					<small>Post and @mention @{c.brand.instagram || 'the brand'} — Miracle links it automatically on the next sync, or paste the link below.</small>
				</div>
			</div>
		{/each}

		<!-- Link a Post Card -->
		<div class="cp2-linkbox">
			<span class="cp2-eb">Link an Instagram post</span>
			<form class="cp2-url" onsubmit={(e) => (e.preventDefault(), linkUrl())}>
				<input
					class="cp2-inp"
					type="url"
					inputmode="url"
					placeholder="Paste link (instagram.com/reel/…)"
					aria-label="Instagram post link"
					bind:value={url}
				/>
				<button class="cp2-neo sm cp2-linkbtn" type="submit" disabled={!url.trim() || finding}>
					{#if finding}<span class="spinner"></span>{:else}<Icon name="link" />{/if}
					<span>Link</span>
				</button>
			</form>

			{#if choices.length}
				<div class="cp2-or"><span>or pick from synced posts</span></div>
				<div class="cp2-pick">
					<Select
						size="sm"
						ariaLabel="Link a post by hand"
						placeholder="Choose a synced post…"
						bind:value={pick}
						options={choices.map((m) => ({
							value: m.id,
							label: (m.caption || 'No caption').slice(0, 60),
							hint: `${fmt(m.posted_at.slice(0, 10))} · ${label(m.media_type, m.product_type)}`
						}))}
					/>
					<button
						type="button"
						class="cp2-btn cp2-linkbtn"
						disabled={!pick}
						onclick={() => {
							const m = studio.media.find((x) => x.id === pick);
							if (m) linkPost(c, m);
							pick = '';
						}}
					>
						<span>Link</span>
					</button>
				</div>
			{/if}
		</div>

		<!-- Results Report Card -->
		{#if c.posts.length}
			<div class="cp2-rep">
				<div class="cp2-rep-top">
					<div>
						<div class="cp2-rep-h">
							<b>Results report</b>
							<span class="cp2-rpill" class:ok={report?.status === 'sent'}>
								{report ? (report.status === 'sent' ? 'Sent' : 'Ready') : 'Auto · Day 7'}
							</span>
						</div>
						{#if report}
							<small>
								{report.status === 'sent'
									? `Sent to brand ${report.sent_at ? fmtTime(report.sent_at) : ''}`
									: 'Ready to review and send'} · {compact(report.data.totals.views)} views · {compact(report.data.totals.reach)} reached
							</small>
						{:else}
							<small>Generated automatically 7 days after your post goes live.</small>
						{/if}
					</div>
				</div>

				<div class="cp2-rep-acts">
					{#if report}
						<a class="cp2-btn" href="/report/{report.public_token}" target="_blank" rel="noopener">
							<Icon name="eye" /><span>View</span>
						</a>
						{#if report.status === 'ready'}
							<button
								type="button"
								class="cp2-neo sm"
								onclick={async () =>
									(await ask({
										title: `Email the results report to ${c.contact_name || c.brand.name}?`,
										body: 'They get the views, reach and cost per view, with a PDF to download.',
										ok: 'Send'
									})) && sendReport(report)}
							>
								<Icon name="send" /><span>Send to brand</span>
							</button>
						{/if}
					{/if}
					<button type="button" class="cp2-btn" disabled={busy} onclick={freshReport}>
						{#if busy}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}
						<span>{report ? 'Refresh' : 'Make one now'}</span>
					</button>
				</div>
			</div>
		{/if}
		</div>
	</section>
{/if}

<style>
	.cp2-stack {
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding-top: 4px;
	}
	.cp2-syncbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 9px 12px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
	}
	.cp2-syncmeta {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-family: var(--mono);
		font-size: 11.5px;
		color: var(--ink-2);
	}
	.cp2-sdot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: #7ee8a5;
	}
	.cp2-sdot.live {
		background: #f25a90;
	}
	.cp2-syncbtn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 30px;
		padding: 0 10px;
		border-radius: 8px;
		border: 1px solid rgba(156, 123, 255, 0.34);
		background: rgba(156, 123, 255, 0.14);
		color: #dfd3ff;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.cp2-syncbtn:disabled { opacity: 0.6; cursor: wait; }
	.cp2-syncbtn :global(.ic) { width: 13px; height: 13px; }

	/* Linked Post Card */
	.cp2-card {
		display: grid;
		gap: 12px;
		padding: 14px;
		border-radius: 18px;
		border: 1px solid rgba(156, 123, 255, 0.22);
		background:
			radial-gradient(110% 80% at 0% 0%, rgba(156, 123, 255, 0.12), transparent 60%),
			var(--paper, var(--surface));
	}
	.cp2-top {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.cp2-thumb {
		flex: none;
		width: 54px;
		height: 70px;
		border-radius: 11px;
		overflow: hidden;
		display: grid;
		place-items: center;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(156, 123, 255, 0.12);
		color: #c8b6ff;
		text-decoration: none;
	}
	.cp2-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.cp2-thumb :global(.ic) { width: 20px; height: 20px; }

	.cp2-meta {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 5px;
	}
	.cp2-badges {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}
	.cp2-pill {
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 999px;
		background: rgba(74, 222, 128, 0.14);
		border: 1px solid rgba(74, 222, 128, 0.3);
		color: #7ee8a5;
	}
	.cp2-date {
		font-family: var(--mono);
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.cp2-auto {
		font-family: var(--mono);
		font-size: 10px;
		color: #c8b6ff;
		padding: 2px 7px;
		border-radius: 999px;
		background: rgba(156, 123, 255, 0.12);
	}
	.cp2-cap {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--ink-2);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.cp2-cap.muted { color: var(--ink-3); font-style: italic; }

	.cp2-x {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.09);
		background: rgba(255, 255, 255, 0.04);
		color: var(--ink-3);
		cursor: pointer;
	}
	.cp2-x :global(.ic) { width: 14px; height: 14px; }

	/* Primary KPIs */
	.cp2-hero-kpis {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.cp2-hero-kpis.cols3 {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.cp2-hk {
		display: grid;
		gap: 2px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(255, 255, 255, 0.03);
	}
	.cp2-hk.hi {
		border-color: rgba(242, 90, 144, 0.28);
		background: rgba(242, 90, 144, 0.08);
	}
	.cp2-hk small {
		font-family: var(--mono);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--ink-3);
	}
	.cp2-hk b {
		font: 400 22px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.cp2-hk.hi b { color: #f79fc0; }

	/* 4-Col Engagement Strip */
	.cp2-eng {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
		padding: 10px 8px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		background: rgba(13, 10, 14, 0.45);
		text-align: center;
	}
	.cp2-eng b {
		display: block;
		font-size: 14.5px;
		font-weight: 700;
		color: var(--ink);
	}
	.cp2-eng small {
		display: block;
		font-size: 11px;
		color: var(--ink-3);
		margin-top: 2px;
	}

	/* Card Actions */
	.cp2-acts {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.cp2-acts .cp2-btn { flex: 1; }

	/* Empty State */
	.cp2-empty {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 14px;
		border-radius: 16px;
		border: 1px dashed rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.02);
	}
	.cp2-eic {
		flex: none;
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: rgba(156, 123, 255, 0.14);
		color: #c8b6ff;
	}
	.cp2-eic :global(.ic) { width: 17px; height: 17px; }
	.cp2-empty b { display: block; font-size: 14.5px; margin-bottom: 3px; }
	.cp2-empty small { display: block; font-size: 13px; line-height: 1.45; color: var(--ink-2); }

	/* Link Box */
	.cp2-linkbox {
		display: grid;
		gap: 10px;
		padding: 14px;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--paper, var(--surface));
	}
	.cp2-eb {
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.cp2-url, .cp2-pick {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.cp2-pick > :global(:first-child) { flex: 1; min-width: 0; }
	.cp2-inp {
		flex: 1;
		min-width: 0;
		height: 38px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(13, 10, 14, 0.65);
		color: var(--ink);
		font: 400 13.5px/1 var(--f-sans, inherit);
		outline: none;
	}
	.cp2-inp:focus { border-color: rgba(156, 123, 255, 0.55); }
	.cp2-or {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.cp2-or::before, .cp2-or::after {
		content: '';
		flex: 1;
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
	}

	/* Results Report Card */
	.cp2-rep {
		display: grid;
		gap: 12px;
		padding: 14px 15px;
		border-radius: 16px;
		border: 1px solid rgba(242, 90, 144, 0.24);
		background: linear-gradient(150deg, rgba(156, 123, 255, 0.1), rgba(242, 90, 144, 0.06) 55%, var(--paper, var(--surface)));
	}
	.cp2-rep-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.cp2-rep-h { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
	.cp2-rep-h b { font-size: 15px; color: var(--ink); }
	.cp2-rpill {
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 2px 8px;
		border-radius: 999px;
		background: rgba(156, 123, 255, 0.16);
		color: #c8b6ff;
	}
	.cp2-rpill.ok { background: rgba(74, 222, 128, 0.14); color: #7ee8a5; }
	.cp2-rep small { display: block; font-size: 13px; line-height: 1.45; color: var(--ink-2); }
	.cp2-rep-acts { display: flex; flex-wrap: wrap; gap: 8px; }
	.cp2-rep-acts > :global(*) { flex: 1 1 120px; }
	.cp2-linkbtn { flex: none; min-width: 82px; height: 38px; }

	/* Shared Buttons */
	.cp2-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 36px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		color: var(--ink);
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
		cursor: pointer;
	}
	.cp2-btn.primary {
		border-color: rgba(156, 123, 255, 0.34);
		background: rgba(156, 123, 255, 0.14);
		color: #dfd3ff;
	}
	.cp2-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.cp2-btn :global(.ic) { width: 14px; height: 14px; }

	.cp2-neo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 38px;
		padding: 0 14px;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		color: var(--bg);
		font: 700 13px/1 var(--f-sans, inherit);
		box-shadow: 3px 3px 0 var(--g2);
		cursor: pointer;
	}
	.cp2-neo.sm { height: 36px; padding: 0 13px; }
	.cp2-neo:disabled { opacity: 0.5; cursor: not-allowed; }
	.cp2-neo :global(.ic) { width: 14px; height: 14px; }
</style>
