<script lang="ts">
	import { onMount } from 'svelte';
	import { askAi } from '../ai';
	import { checkups, loadCheckups } from '../checkup.svelte';
	import { saveSettings, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { copyText, toast } from '../ui.svelte';
	import Icon from './Icon.svelte';

	// Get found: her "about" line (on her page, in link previews and what search engines and AI assistants
	// read), an Instagram bio and the words brands search for; and who visited her page, from where.
	let { link }: { link: string } = $props();
	const s = $derived(studio.settings!);
	let bio = $state('');
	let views = $state<{ day: string; source: string; views: number }[]>([]);
	let ai = $state<{ bio: string; ig_bio: string; keywords: string[]; missing: string[] } | null>(null);
	let busy = $state(false);
	onMount(async () => {
		bio = studio.settings?.bio ?? '';
		const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
		const { data } = await supabase.from('page_views').select('day, source, views').gte('day', since);
		views = (data ?? []) as typeof views;
		if (!checkups.loaded) loadCheckups();
	});
	const total = $derived(views.reduce((a, v) => a + v.views, 0));
	const sources = $derived(
		Object.entries(views.reduce<Record<string, number>>((a, v) => ((a[v.source] = (a[v.source] ?? 0) + v.views), a), {}))
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
	);
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
</script>

<section class="panel gf rv" aria-labelledby="gf-t">
	<div class="panel-h"><h2 id="gf-t">Get found</h2><small>{total ? `${total} page view${total === 1 ? '' : 's'} in 30 days` : 'Views show here once people open your page'}</small></div>
	<div class="gf-b">
		{#if sources.length}
			<div class="gf-src" aria-label="Where visitors came from">
				{#each sources as [src, n] (src)}<span><b>{n}</b>{src === 'direct' ? 'typed or shared' : src}</span>{/each}
			</div>
		{/if}
		<div class="f">
			<label for="gf-bio">About you <span class="hint">(on your page, in link previews and what search engines read)</span></label>
			<textarea class="inp" id="gf-bio" rows="3" maxlength="400" placeholder="e.g. Bengaluru skincare and home-decor reels in Kannada and English, for women 22-35. A fit for beauty, home and festive brands." bind:value={bio} onchange={() => save(bio)}></textarea>
		</div>
		{#if ai}
			<div class="gf-ai">
				<span class="lbl-t">Suggested</span>
				<p>{ai.bio}</p>
				<div class="row"><button class="btn sm primary" onclick={() => save(ai!.bio)}>Use on my page</button></div>
				{#if ai.ig_bio}
					<span class="lbl-t">Instagram bio</span>
					<p>{ai.ig_bio}</p>
					<div class="row"><button class="btn sm" onclick={() => copyText(ai!.ig_bio, 'Copied. Paste it in Instagram › Edit profile › Bio.')}><Icon name="copy" />Copy</button></div>
				{/if}
				{#if ai.keywords.length}
					<span class="lbl-t">What brands search for</span>
					<div class="gf-kw">{#each ai.keywords as k (k)}<span>{k}</span>{/each}</div>
					<small class="hint">Use these words in your captions, bio and highlights. Instagram's and YouTube's own search for brands match on them.</small>
				{/if}
				{#if ai.missing.length}<small class="hint">Brands also look for: {ai.missing.join(' · ')}</small>{/if}
			</div>
		{:else}
			<button class="btn sm" onclick={write} disabled={busy}>{#if busy}<span class="spinner"></span>Writing…{:else}<Icon name="spark" />Write it with AI{/if}</button>
		{/if}
		<div class="gf-steps">
			<span class="lbl-t">Three more places brands look</span>
			<ol>
				<li><b>Your Instagram link.</b> Use <button class="lnk" onclick={() => copyText(igLink, 'Link copied. Paste it in Instagram › Edit profile › Links.')}>{igLink.replace(/^https?:\/\//, '')}</button> so the visits from Instagram show above.</li>
				<li><b>Instagram's creator marketplace.</b> In Instagram, Professional dashboard › Branded content: turn on being found by brands, and add your categories.</li>
				<li><b>YouTube creator partnerships.</b> If you post on YouTube: YouTube Studio › Earn › Creator partnerships, and opt in.</li>
			</ol>
		</div>
	</div>
</section>

<style>
	.gf-b {
		display: grid;
		gap: 14px;
		padding: 0 18px 18px;
	}
	.gf-b > .btn {
		justify-self: start;
	}
	.gf-src {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.gf-src span {
		display: inline-flex;
		gap: 6px;
		align-items: baseline;
		padding: 6px 10px;
		border-radius: 99px;
		background: var(--surface-2);
		font-size: 12.5px;
		color: var(--ink-2);
	}
	.gf-src b {
		color: var(--ink);
	}
	.gf-ai {
		display: grid;
		gap: 8px;
		padding: 14px;
		border-radius: 14px;
		background: var(--surface-2);
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
		box-shadow: inset 0 0 0 1px var(--line-strong);
		font-size: 12.5px;
	}
	.gf-steps ol {
		display: grid;
		gap: 8px;
		margin: 6px 0 0;
		padding-left: 18px;
		font-size: 13px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.gf-steps b {
		color: var(--ink);
	}
</style>
