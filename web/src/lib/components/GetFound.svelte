<script lang="ts">
	import { onMount } from 'svelte';
	import { askAi } from '../ai';
	import { checkups, loadCheckups } from '../checkup.svelte';
	import { loadPageViews, pageViews, summarise } from '../pageViews.svelte';
	import { saveSettings, studio } from '../studio.svelte';
	import { copyText, toast } from '../ui.svelte';
	import Icon from './Icon.svelte';

	// Get found: who opened her page and from where; her "about" line (on her page, in link previews and
	// what search engines and AI assistants read), with an AI draft and an Instagram bio; and three more
	// places brands look for creators. And the public creator directory on the website, which she
	// switches on herself (it also lists her in Discover).
	const DIR = 'https://www.miracleapp.live/creators';
	let { link }: { link: string } = $props();
	const s = $derived(studio.settings!);
	let bio = $state('');
	let ai = $state<{ bio: string; ig_bio: string; keywords: string[]; missing: string[] } | null>(null);
	let busy = $state(false);
	onMount(() => {
		bio = studio.settings?.bio ?? '';
		if (!pageViews.loaded) loadPageViews();
		if (!checkups.loaded) loadCheckups();
	});
	const sum = $derived(summarise(pageViews.rows, 4));
	const max = $derived(Math.max(1, ...sum.sources.map((x) => x.views)));
	const igLink = $derived(`${link}?utm_source=instagram`);
	async function write() {
		busy = true;
		try {
			const run = checkups.list[0];
			const brands = [...new Set(studio.collabs.filter((c) => c.stage === 'live' || c.stage === 'wrapped').map((c) => c.brand.name))];
			const ideal = run?.data.ideal;
			ai = await askAi('getfound', {
				name: s.display_name,
				niche: s.niche,
				city: s.city,
				languages: s.content_languages ?? [],
				topics: (run?.data.topics ?? []).map((t) => t.name).filter((t) => t !== 'Everything else'),
				brands,
				followers: studio.ig?.followers ?? s.followers,
				audience: ideal ? `${ideal.gender} ${ideal.age_from}-${ideal.age_to}${ideal.city ? `, ${ideal.city}` : ''}` : '',
				bio
			});
		} catch (e) {
			toast(e instanceof Error ? e.message : String(e), 'alert');
		} finally {
			busy = false;
		}
	}
	async function save(text: string) {
		bio = text.slice(0, 400);
		await saveSettings({ bio });
		toast('Saved. It shows on your page and in link previews.', 'check');
	}
	const verified = $derived(!!studio.ig?.connected);
	const dirSlug = (t: string | null | undefined) => (t ?? '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	const dirLink = $derived.by(() => {
		const n = dirSlug((s.niche ?? '').split(',')[0]);
		const c = dirSlug(s.city);
		return `${DIR}${n ? `/${n}` : ''}${c ? `/in/${c}` : ''}`;
	});
	let dirBusy = $state(false);
	async function setDirectory(on: boolean) {
		dirBusy = true;
		await saveSettings(on ? { directory_listed: true, listed: true } : { directory_listed: false });
		dirBusy = false;
		toast(on ? 'You are in the creator directory. It can take a few minutes to show.' : 'You are no longer in the creator directory', on ? 'check' : 'info');
	}
	const STEPS = $derived([
		{ icon: 'link', t: 'Your Instagram link', p: 'Use this link in your bio, so visits from Instagram show up above.', act: 'Copy link', run: () => copyText(igLink, 'Link copied. Paste it in Instagram › Edit profile › Links.') },
		{ icon: 'search', t: "Instagram's creator marketplace", p: 'Professional dashboard › Branded content: turn on being found by brands, and add your categories.' },
		{ icon: 'film', t: 'YouTube creator partnerships', p: 'If you post on YouTube: YouTube Studio › Earn › Creator partnerships, and opt in.' }
	]);
</script>

<section class="panel gf rv" aria-labelledby="gf-t">
	<div class="panel-h"><h2 id="gf-t">Get found</h2><small>where brands find you</small></div>
	<div class="gf-b">
		<div class="gf-card gf-visits">
			<span class="gf-eb">Visits · last 30 days</span>
			<div class="gf-vm">
				<div class="gf-n"><b>{sum.total}</b><small>{sum.total === 1 ? 'page view' : 'page views'}</small></div>
				{#if sum.sources.length}
					<div class="gf-bars">
						{#each sum.sources as x (x.key)}
							<div class="gf-bar"><span>{x.label}</span><b>{x.views}</b><i style="width:{Math.max(5, (x.views / max) * 100)}%"></i></div>
						{/each}
					</div>
				{:else}
					<p class="gf-hint">Views show here once people open your page.</p>
				{/if}
			</div>
		</div>

		<div class="gf-card gf-dir">
			<div class="gf-row">
				<span class="gf-eb">Creator directory</span>
				<input type="checkbox" class="tgl" checked={!!s.directory_listed} disabled={dirBusy} aria-label="Show me in the creator directory" onchange={(e) => setDirectory((e.currentTarget as HTMLInputElement).checked)} />
			</div>
			<p class="gf-hint">Show your page on miracleapp.live/creators, where brands and Google find creators by niche and city. It shows your name, niche, city, about line, starting price, reviews{verified ? ' and your Instagram numbers' : ''}. Never your email or phone.</p>
			<div class="gf-dir-v" class:on={verified}>
				<Icon name={verified ? 'check' : 'info'} />
				<small>{#if verified}<b>Verified.</b> Your Instagram is connected, so your numbers show with a blue tick, and you're shown first.{:else}Connect Instagram in Settings to show your followers, engagement and views with a blue tick. Verified creators are shown first.{/if}</small>
			</div>
			{#if s.directory_listed}<a class="btn sm" href={dirLink} target="_blank" rel="noopener"><Icon name="arrow" />See your listing</a>{/if}
		</div>

		<div class="gf-card">
			<label class="gf-eb" for="gf-bio">About you</label>
			<p class="gf-hint">On your page, in link previews, and what Google and AI assistants read about you.</p>
			<textarea class="gf-in" id="gf-bio" rows="3" maxlength="400" placeholder="e.g. Bengaluru skincare and home-decor reels in Kannada and English, for women 22–35." bind:value={bio} onchange={() => save(bio)}></textarea>
			<div class="gf-row">
				<small class="gf-hint">{bio.length}/400</small>
				{#if !ai}<button class="btn sm" onclick={write} disabled={busy}>{#if busy}<span class="spinner"></span>Writing…{:else}<Icon name="spark" />Write it with AI{/if}</button>{/if}
			</div>
			{#if ai}
				<div class="gf-ai">
					<span class="gf-eb">Suggested</span>
					<p>{ai.bio}</p>
					<div class="gf-row"><button class="btn sm primary" onclick={() => save(ai!.bio)}>Use on my page</button><button class="btn sm" onclick={write} disabled={busy}>{#if busy}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Another</button></div>
					{#if ai.ig_bio}
						<span class="gf-eb">Instagram bio</span>
						<p>{ai.ig_bio}</p>
						<div class="gf-row"><button class="btn sm" onclick={() => copyText(ai!.ig_bio, 'Copied. Paste it in Instagram › Edit profile › Bio.')}><Icon name="copy" />Copy</button></div>
					{/if}
					{#if ai.keywords.length}
						<span class="gf-eb">What brands search for</span>
						<div class="gf-kw">{#each ai.keywords as k (k)}<span>{k}</span>{/each}</div>
						<small class="gf-hint">Use these words in your captions, bio and highlights.</small>
					{/if}
					{#if ai.missing.length}<small class="gf-hint">Brands also look for: {ai.missing.join(' · ')}</small>{/if}
				</div>
			{/if}
		</div>

		<div class="gf-steps">
			<span class="gf-eb">Three more places brands look</span>
			{#each STEPS as st, i (st.t)}
				<div class="gf-step">
					<span class="gf-num">{i + 1}</span>
					<div class="gf-st"><b>{st.t}</b><small>{st.p}</small>{#if st.run}<button class="btn sm" onclick={st.run}><Icon name="copy" />{st.act}</button>{/if}</div>
				</div>
			{/each}
		</div>
	</div>
</section>

<style>
	.gf-b {
		display: grid;
		gap: 14px;
		padding: 0 18px 18px;
	}
	.gf-card {
		display: grid;
		gap: 10px;
		padding: 16px;
		border-radius: 18px;
		background: var(--surface-2);
	}
	.gf-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.17em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.gf-hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-3);
	}
	.gf-vm {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 20px;
		align-items: center;
	}
	.gf-n {
		display: grid;
		gap: 2px;
		min-width: 76px;
	}
	.gf-n b {
		font: 400 46px/1 var(--f-serif, Georgia, serif);
		font-variant-numeric: tabular-nums;
	}
	.gf-n small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.gf-bars {
		display: grid;
		gap: 9px;
		min-width: 0;
	}
	.gf-bar {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		row-gap: 4px;
		column-gap: 8px;
		font-size: 13px;
	}
	.gf-bar span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--ink-2);
	}
	.gf-bar b {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.gf-bar i {
		grid-column: 1 / -1;
		height: 4px;
		border-radius: 99px;
		background: linear-gradient(90deg, var(--g1), var(--g2));
	}
	.gf-dir {
		justify-items: start;
	}
	.gf-dir .gf-row {
		width: 100%;
	}
	.gf-dir-v {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px;
		align-items: start;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--surface);
		color: var(--ink-3);
	}
	.gf-dir-v :global(.ic) {
		width: 17px;
		height: 17px;
		margin-top: 1px;
	}
	.gf-dir-v.on :global(.ic) {
		color: #5aa7ff;
	}
	.gf-dir-v small {
		font-size: 13px;
		line-height: 1.45;
	}
	.gf-dir-v b {
		color: var(--ink);
	}
	.gf-in {
		width: 100%;
		min-height: 96px;
		padding: 12px 14px;
		border: 0;
		border-radius: 12px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		font: 400 15.5px/1.5 var(--f-body, system-ui);
		resize: vertical;
		box-sizing: border-box;
	}
	.gf-in::placeholder {
		color: var(--ink-3);
		opacity: 0.8;
	}
	.gf-in:focus {
		outline: 0;
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.gf-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.gf-ai {
		display: grid;
		gap: 8px;
		padding: 14px;
		border-radius: 14px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g1) 35%, transparent);
	}
	.gf-ai p {
		margin: 0;
		line-height: 1.5;
	}
	.gf-kw {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.gf-kw span {
		padding: 4px 10px;
		border-radius: 99px;
		box-shadow: inset 0 0 0 1px var(--line-strong, var(--line));
		font-size: 12.5px;
	}
	.gf-steps {
		display: grid;
		gap: 10px;
	}
	.gf-step {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		padding: 14px 16px;
		border-radius: 16px;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.gf-num {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: var(--ink);
		color: var(--bg);
		font: 700 13px/1 var(--f-body, system-ui);
	}
	.gf-st {
		display: grid;
		gap: 4px;
		justify-items: start;
		min-width: 0;
	}
	.gf-st b {
		font-size: 15px;
	}
	.gf-st small {
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-3);
	}
	.gf-st .btn {
		margin-top: 6px;
	}
</style>
