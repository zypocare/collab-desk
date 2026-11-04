<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '../auth.svelte';
	import { discover, loadDiscover } from '../brand.svelte';
	import { blockedCreators, blocks, loadBlocks } from '../safety.svelte';
	import { addressFor } from '../creatorHost';
	import { fit, NO_FILTERS, reelRate } from '../fit';
	import { igImg } from '../igImg';
	import { costPerK, miracleScore, proofLines, type MiracleScore } from '../miracleScore';
	import { phone } from '../phone.svelte';
	import { portal } from '../portal';
	import { pageSlug } from '../supabase';
	import { compact, inrS, initials } from '../util';
	import type { DiscoverCreator } from '../types';
	import AddToPool from './AddToPool.svelte';
	import Icon from './Icon.svelte';

	// Explore: the marketplace. Every creator open to brands, ranked by the Miracle Score (earned: on-time
	// posts, paid deals, replies, audience health, a complete profile), with ready-made collections,
	// filters, proof on every card and a side-by-side compare. Nothing here is paid placement.
	let { toPool = '' }: { toPool?: string } = $props();
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const category = $derived(acct?.brand?.category || acct?.profile?.category || '');
	const company = $derived(acct?.brand?.name || acct?.profile?.name || 'your brand');
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));
	onMount(() => {
		if (!discover.loaded) loadDiscover();
		if (!blocks.loaded) loadBlocks();
	});

	type Row = { c: DiscoverCreator; score: MiracleScore; fit: number; rate: number | null };
	const all = $derived.by<Row[]>(() => {
		const blocked = blockedCreators();
		return discover.list
			.filter((c) => (c.listed || c.with_me.collabs) && !blocked.has(c.id))
			.map((c) => ({ c, score: miracleScore(c), fit: fit(c, NO_FILTERS, category).total, rate: reelRate(c) }));
	});

	// ---- Collections: ready-made shelves, only the ones with at least two creators ----
	type Shelf = { id: string; title: string; sub: string; test: (r: Row) => boolean };
	const topCity = $derived.by(() => {
		const n = new Map<string, number>();
		for (const r of all) {
			const k = r.c.city?.trim();
			if (k) n.set(k, (n.get(k) ?? 0) + 1);
		}
		return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
	});
	const topLang = $derived.by(() => {
		const n = new Map<string, number>();
		for (const r of all) for (const l of r.c.languages ?? []) if (l !== 'English') n.set(l, (n.get(l) ?? 0) + 1);
		return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
	});
	const SHELVES = $derived<Shelf[]>(
		[
			{ id: 'top', title: 'Top rated', sub: 'Miracle Score 65 and up', test: (r: Row) => r.score.total >= 65 },
			{ id: 'fit', title: `Best fit for ${company}`, sub: category ? `Made for ${category.toLowerCase()}` : 'Niche and audience match', test: (r: Row) => r.fit >= 60 },
			{ id: 'ontime', title: 'Always on time', sub: '90%+ posts on time', test: (r: Row) => (r.c.trust?.posted ?? 0) >= 2 && (r.c.trust!.on_time / r.c.trust!.posted) >= 0.9 },
			{ id: 'proven', title: 'Proven on Miracle', sub: '2+ paid deals done', test: (r: Row) => (r.c.trust?.deals ?? 0) >= 2 },
			{ id: 'budget', title: 'Reels under ₹15K', sub: 'Shows their rates', test: (r: Row) => !!r.rate && r.rate <= 15000 },
			{ id: 'healthy', title: 'Healthy audiences', sub: 'Audience health 80+', test: (r: Row) => (r.c.health?.score ?? 0) >= 80 },
			...(topCity ? [{ id: 'city', title: `In ${topCity}`, sub: 'Creators based there', test: (r: Row) => r.c.city?.trim() === topCity }] : []),
			...(topLang ? [{ id: 'lang', title: `${topLang} creators`, sub: `Make content in ${topLang}`, test: (r: Row) => (r.c.languages ?? []).includes(topLang) }] : []),
			{ id: 'again', title: 'Worked with you', sub: 'Book them again', test: (r: Row) => r.c.with_me.collabs > 0 }
		].filter((s) => all.filter(s.test).length >= 2)
	);
	let shelf = $state('');
	const activeShelf = $derived(SHELVES.find((s) => s.id === shelf) ?? null);

	// ---- Search, filters, sort ----
	const NICHES = ['Beauty', 'Skincare', 'Fashion', 'Food', 'Travel', 'Fitness', 'Wellness', 'Lifestyle', 'Tech', 'Parenting'];
	const LANGS = ['English', 'Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'Malayalam'];
	let q = $state('');
	let niches = $state<string[]>([]);
	let langs = $state<string[]>([]);
	let city = $state('');
	let size = $state('0-0');
	let price = $state(0);
	let healthyOnly = $state(false);
	let openOnly = $state(true);
	let sort = $state<'score' | 'fit' | 'price' | 'reach'>('score');
	let sheet = $state(false);
	const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
	const filterN = $derived(langs.length + (city.trim() ? 1 : 0) + (size !== '0-0' ? 1 : 0) + (price ? 1 : 0) + (healthyOnly ? 1 : 0) + (openOnly ? 0 : 1));
	function clearAll() {
		niches = [];
		langs = [];
		city = '';
		size = '0-0';
		price = 0;
		healthyOnly = false;
		openOnly = true;
		shelf = '';
		q = '';
	}

	const shown = $derived.by(() => {
		const words = q.trim().toLowerCase();
		const [lo, hi] = size.split('-').map(Number);
		const want = city.trim().toLowerCase();
		return all
			.filter((r) => !activeShelf || activeShelf.test(r))
			.filter((r) => !words || [r.c.name, r.c.niche, r.c.city, r.c.handle].join(' ').toLowerCase().includes(words))
			.filter((r) => !niches.length || niches.some((n) => (r.c.niche ?? '').toLowerCase().includes(n.toLowerCase())))
			.filter((r) => !langs.length || langs.some((l) => (r.c.languages ?? []).includes(l)))
			.filter((r) => !want || (r.c.city ?? '').toLowerCase().includes(want) || (r.c.audience?.cities ?? []).some((x) => x.name.toLowerCase().includes(want)))
			.filter((r) => (!lo || (r.c.followers ?? 0) >= lo) && (!hi || (r.c.followers ?? 0) <= hi))
			.filter((r) => !price || (!!r.rate && r.rate <= price))
			.filter((r) => !healthyOnly || ((r.c.health?.score ?? 0) >= 65 && r.c.health?.safety?.level !== 'review'))
			.filter((r) => !openOnly || r.c.accepting !== false)
			.sort((a, b) =>
				sort === 'score' ? b.score.total - a.score.total || b.fit - a.fit
				: sort === 'fit' ? b.fit - a.fit || b.score.total - a.score.total
				: sort === 'price' ? (a.rate ?? 1e9) - (b.rate ?? 1e9)
				: (b.c.followers ?? 0) - (a.c.followers ?? 0)
			);
	});
	// Long lists show in pages of 24, so a phone stays quick.
	let limit = $state(24);
	$effect(() => {
		void q, niches, langs, city, size, price, healthyOnly, openOnly, sort, shelf;
		limit = 24;
	});

	// ---- Compare: up to three side by side ----
	let picked = $state<number[]>([]);
	let comparing = $state(false);
	function pick(id: number) {
		picked = picked.includes(id) ? picked.filter((x) => x !== id) : picked.length >= 3 ? [...picked.slice(1), id] : [...picked, id];
	}
	const pickedRows = $derived(picked.map((id) => all.find((r) => r.c.id === id)).filter((r): r is Row => !!r));
	const topAud = (c: DiscoverCreator) => {
		const a = c.audience;
		if (!a) return '—';
		const city0 = a.cities?.[0];
		return [a.women != null ? `${Math.round(a.women)}% women` : '', city0 ? `${city0.name} ${Math.round(city0.pct)}%` : ''].filter(Boolean).join(' · ') || '—';
	};
	let how = $state(false);
</script>

<header class="ex-h">
	<div class="ex-ht">
		<span class="eb">Creators open to brands</span>
		<h1>Hire on <em>proof</em>, not followers.</h1>
		<p>{all.length} creator{all.length === 1 ? '' : 's'} open to brands, ranked by their record on Miracle. <button class="ex-how" onclick={() => (how = true)}>How ranking works</button></p>
	</div>
	<label class="search ex-search"><Icon name="search" /><span class="sr">Search creators</span><input type="search" placeholder="Search by name, niche or city" bind:value={q} autocomplete="off" /></label>
</header>

{#if toPool}<div class="cr-banner">Adding to a pool. Tap <b>Pool</b> on the creators you want. <a href="/brand/creators?tab=pools&pool={toPool}">Done</a></div>{/if}

{#if SHELVES.length}
	<section class="ex-shelves" aria-label="Collections">
		{#each SHELVES as s, k (s.id)}
			{@const people = all.filter(s.test).sort((a, b) => b.score.total - a.score.total)}
			<button class="ex-shelf" class:on={shelf === s.id} style="--k:{k}" aria-pressed={shelf === s.id} onclick={() => (shelf = shelf === s.id ? '' : s.id)}>
				<span class="ex-faces" aria-hidden="true">{#each people.slice(0, 3) as r (r.c.id)}<i>{#if r.c.photo}<img src={igImg(r.c.photo)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}{initials(r.c.name).slice(0, 2)}{/if}</i>{/each}</span>
				<b>{s.title}</b>
				<small>{people.length} · {s.sub}</small>
			</button>
		{/each}
	</section>
{/if}

<div class="ex-bar">
	<div class="m-stages ex-niches" role="group" aria-label="Niche">
		<button class="ex-fbtn" class:on={filterN > 0} onclick={() => (sheet = true)}><Icon name="layers" />Filters{#if filterN}<span>{filterN}</span>{/if}</button>
		{#each NICHES as n, k (n)}<button class:on={niches.includes(n)} aria-pressed={niches.includes(n)} onclick={() => (niches = toggle(niches, n))}><i class="dt" style="--hue:var(--m{(k % 6) + 1})"></i>{n}</button>{/each}
	</div>
	<div class="ex-sort">
		<label for="ex-sort" class="sr">Sort</label>
		<select id="ex-sort" class="inp" bind:value={sort}>
			<option value="score">Miracle Score</option>
			<option value="fit">Best fit</option>
			<option value="price">Lowest price</option>
			<option value="reach">Most followers</option>
		</select>
	</div>
</div>

{#if activeShelf || niches.length || filterN || q.trim()}
	<p class="ex-now">{shown.length} match{shown.length === 1 ? '' : 'es'}{activeShelf ? ` in ${activeShelf.title}` : ''}. <button class="ex-how" onclick={clearAll}>Clear all</button></p>
{/if}

{#if discover.error}<div class="err-box">{discover.error}</div>{/if}
{#if !discover.loaded}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<section class="ex-grid" aria-label="Creators">
		{#each shown.slice(0, limit) as r, i (r.c.id)}
			{@const c = r.c}
			<article class="ex-card" style="--i:{Math.min(i, 8)}">
				<a class="ex-top" href="/brand/creator/{c.id}">
					<span class="ex-pic">{#if c.photo}<img src={igImg(c.photo)} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<b>{initials(c.name).slice(0, 2)}</b>{/if}</span>
					<span class="ex-who">
						<b>{c.name}</b>
						<small>{[c.niche?.split(',')[0]?.trim(), c.city].filter(Boolean).join(' · ') || 'Creator'}</small>
					</span>
					<span class="ex-score tone-{r.score.tone}" title="Miracle Score {r.score.total}: {r.score.parts.map((p) => `${p.label} ${p.got}/${p.max}`).join(', ')}"><b>{r.score.total}</b><small>{r.score.label}</small></span>
				</a>
				<div class="ex-stats">
					<span><b>{c.followers != null ? compact(c.followers) : '—'}</b><small>followers</small></span>
					<span><b>{c.engagement != null ? `${Number(c.engagement).toFixed(1)}%` : '—'}</b><small>engagement</small></span>
					<span><b>{r.rate ? inrS(r.rate) : '—'}</b><small>{r.rate ? 'a Reel' : 'rates on ask'}</small></span>
				</div>
				{#if proofLines(c).length || c.with_me.collabs}
					<div class="ex-proof">
						{#if c.with_me.collabs}<span class="tone-ok">Worked with you</span>{/if}
						{#each proofLines(c) as p (p.text)}<span class="tone-{p.tone}">{p.text}</span>{/each}
					</div>
				{/if}
				<div class="ex-acts">
					<AddToPool creator={c.id} name={c.name} pool={toPool} />
					<button class="btn ex-cmp" class:on={picked.includes(c.id)} aria-pressed={picked.includes(c.id)} onclick={() => pick(c.id)}><Icon name={picked.includes(c.id) ? 'check' : 'layers'} />Compare</button>
					{#if c.accepting !== false}<a class="btn primary" href={at(c.slug, '/brand/new')}>Request</a>{:else}<a class="btn" href="/brand/creator/{c.id}">View</a>{/if}
				</div>
			</article>
		{:else}
			<div class="clear hero-card glow m-none">
				<div class="mesh" aria-hidden="true"></div>
				<span class="clear-ic"><Icon name="search" /></span>
				<b>No creators match</b>
				<small>Loosen a filter or two. New creators join every week.</small>
				<div class="clear-acts"><button class="glass-chip" onclick={clearAll}><Icon name="x" />Clear all</button></div>
			</div>
		{/each}
	</section>
	{#if shown.length > limit}<button class="btn ex-more" onclick={() => (limit += 24)}>Show more ({shown.length - limit} left)</button>{/if}
{/if}

{#if picked.length}
	<div class="ex-tray" class:ex-tray-ph={phone.on} role="region" aria-label="Compare">
		<span class="ex-faces" aria-hidden="true">{#each pickedRows as r (r.c.id)}<i>{#if r.c.photo}<img src={igImg(r.c.photo)} alt="" referrerpolicy="no-referrer" />{:else}{initials(r.c.name).slice(0, 2)}{/if}</i>{/each}</span>
		<span class="ex-tray-t">{picked.length} of 3 to compare</span>
		<button class="btn ghost" onclick={() => (picked = [])}>Clear</button>
		<button class="btn primary" disabled={picked.length < 2} onclick={() => (comparing = true)}>Compare</button>
	</div>
{/if}

{#if sheet}
	<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (sheet = false)}>
		<div class="dialog ex-sheet" role="dialog" aria-modal="true" aria-labelledby="ex-f-t">
			<h2 id="ex-f-t">Filters</h2>
			<div class="ex-fg">
				<span class="lbl-t">Language they create in</span>
				<div class="m-stages ex-wrap">{#each LANGS as l (l)}<button class:on={langs.includes(l)} aria-pressed={langs.includes(l)} onclick={() => (langs = toggle(langs, l))}>{l}</button>{/each}</div>
			</div>
			<div class="ex-fg">
				<label class="lbl-t" for="ex-city">City (theirs or their audience's)</label>
				<input id="ex-city" class="inp" placeholder="e.g. Bengaluru" bind:value={city} />
			</div>
			<div class="ex-fg ex-two">
				<div>
					<label class="lbl-t" for="ex-size">Followers</label>
					<select id="ex-size" class="inp" bind:value={size}>
						<option value="0-0">Any size</option>
						<option value="1000-10000">1K to 10K</option>
						<option value="10000-50000">10K to 50K</option>
						<option value="50000-200000">50K to 200K</option>
						<option value="200000-0">200K and up</option>
					</select>
				</div>
				<div>
					<label class="lbl-t" for="ex-price">A Reel up to</label>
					<select id="ex-price" class="inp" bind:value={price}>
						<option value={0}>Any price</option>
						<option value={10000}>₹10K</option>
						<option value={25000}>₹25K</option>
						<option value={50000}>₹50K</option>
						<option value={100000}>₹1L</option>
					</select>
				</div>
			</div>
			<label class="ex-tg"><input type="checkbox" class="tgl" bind:checked={healthyOnly} /><span>Healthy audiences only<small>Audience health 65+, nothing serious in brand safety</small></span></label>
			<label class="ex-tg"><input type="checkbox" class="tgl" bind:checked={openOnly} /><span>Open for collabs now<small>Hide creators who paused new requests</small></span></label>
			<div class="ex-fa">
				<button class="btn ghost" onclick={clearAll}>Clear all</button>
				<button class="btn primary" onclick={() => (sheet = false)}>Show {shown.length} creator{shown.length === 1 ? '' : 's'}</button>
			</div>
		</div>
	</div>
{/if}

{#if comparing}
	<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (comparing = false)}>
		<div class="dialog ex-cmpd" role="dialog" aria-modal="true" aria-labelledby="ex-c-t">
			<div class="ex-cmph"><h2 id="ex-c-t">Side by side</h2><button class="btn ghost" onclick={() => (comparing = false)}><Icon name="x" />Close</button></div>
			<div class="ex-tbl-wrap">
				<table class="ex-tbl" style="--n:{pickedRows.length}">
					<thead>
						<tr><th scope="col"><span class="sr">What</span></th>{#each pickedRows as r (r.c.id)}<th scope="col"><a href="/brand/creator/{r.c.id}">{r.c.name}</a><small>{r.c.niche?.split(',')[0] ?? ''}</small></th>{/each}</tr>
					</thead>
					<tbody>
						<tr><th scope="row">Miracle Score</th>{#each pickedRows as r (r.c.id)}<td><b class="tone-{r.score.tone}">{r.score.total}</b> {r.score.label}</td>{/each}</tr>
						<tr><th scope="row">Followers</th>{#each pickedRows as r (r.c.id)}<td>{r.c.followers != null ? compact(r.c.followers) : '—'}</td>{/each}</tr>
						<tr><th scope="row">Engagement</th>{#each pickedRows as r (r.c.id)}<td>{r.c.engagement != null ? `${Number(r.c.engagement).toFixed(2)}%` : '—'}</td>{/each}</tr>
						<tr><th scope="row">Average views</th>{#each pickedRows as r (r.c.id)}<td>{r.c.avg_views ? compact(r.c.avg_views) : '—'}</td>{/each}</tr>
						<tr><th scope="row">A Reel</th>{#each pickedRows as r (r.c.id)}<td>{r.rate ? inrS(r.rate) : 'On ask'}</td>{/each}</tr>
						<tr><th scope="row">Per 1,000 views</th>{#each pickedRows as r (r.c.id)}<td>{costPerK(r.c) != null ? inrS(costPerK(r.c)!) : '—'}</td>{/each}</tr>
						<tr><th scope="row">Audience health</th>{#each pickedRows as r (r.c.id)}<td>{r.c.health?.score ?? '—'}</td>{/each}</tr>
						<tr><th scope="row">Their audience</th>{#each pickedRows as r (r.c.id)}<td>{topAud(r.c)}</td>{/each}</tr>
						<tr><th scope="row">On time</th>{#each pickedRows as r (r.c.id)}<td>{r.c.trust?.posted ? `${r.c.trust.on_time} of ${r.c.trust.posted}` : 'No record yet'}</td>{/each}</tr>
						<tr><th scope="row">Paid deals</th>{#each pickedRows as r (r.c.id)}<td>{r.c.trust?.deals ?? 0}</td>{/each}</tr>
						<tr><th scope="row">Replies</th>{#each pickedRows as r (r.c.id)}<td>{r.c.trust?.reply_hours != null ? `~${Math.max(1, Math.round(r.c.trust.reply_hours))}h` : '—'}</td>{/each}</tr>
						<tr><th scope="row">Languages</th>{#each pickedRows as r (r.c.id)}<td>{(r.c.languages ?? []).join(', ') || '—'}</td>{/each}</tr>
						<tr><th scope="row">Worked with you</th>{#each pickedRows as r (r.c.id)}<td>{r.c.with_me.collabs ? `${r.c.with_me.collabs} collab${r.c.with_me.collabs === 1 ? '' : 's'}` : 'Not yet'}</td>{/each}</tr>
						<tr><th scope="row"><span class="sr">Next</span></th>{#each pickedRows as r (r.c.id)}<td>{#if r.c.accepting !== false}<a class="btn primary sm" href={at(r.c.slug, '/brand/new')}>Request</a>{:else}<span class="ex-paused">Paused</span>{/if}</td>{/each}</tr>
					</tbody>
				</table>
			</div>
		</div>
	</div>
{/if}

{#if how}
	<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (how = false)}>
		<div class="dialog ex-howd" role="dialog" aria-modal="true" aria-labelledby="ex-h-t">
			<h2 id="ex-h-t">How Explore ranks creators</h2>
			<p>The Miracle Score (out of 100) is earned, never bought. It comes from each creator's record on Miracle:</p>
			<ul>
				<li><b>Delivers on time</b> <span>35</span> Posts that went live on the agreed date.</li>
				<li><b>Healthy audience</b> <span>20</span> Audience health from their Instagram; serious brand-safety notes count against it.</li>
				<li><b>Paid deals done</b> <span>20</span> Deals done and paid through Miracle.</li>
				<li><b>Replies fast</b> <span>15</span> How quickly they usually answer brands.</li>
				<li><b>Complete profile</b> <span>10</span> Photo, niche, city, languages, rates and Instagram.</li>
			</ul>
			<p class="ex-note">New creators start in the middle for the parts they have no record for yet, so they get a fair chance.</p>
			<button class="btn primary" onclick={() => (how = false)}>Got it</button>
		</div>
	</div>
{/if}

<style>
	.ex-h { display: grid; gap: 14px; margin-bottom: 18px; }
	.ex-ht h1 { margin: 6px 0 6px; font-size: clamp(28px, 6vw, 40px); }
	.ex-ht h1 em { font-family: var(--f-serif); font-weight: 400; font-style: italic; background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 4px; }
	.ex-ht p { margin: 0; color: var(--ink-2); }
	.ex-how { border: 0; background: none; padding: 0; color: var(--accent); font: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
	.ex-search { max-width: 560px; }
	.ex-shelves { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(180px, 220px); gap: 10px; overflow-x: auto; padding: 2px 2px 12px; margin-bottom: 8px; scroll-snap-type: x mandatory; scrollbar-width: none; }
	.ex-shelf { scroll-snap-align: start; display: grid; gap: 4px; text-align: left; padding: 14px; border-radius: 18px; border: 1px solid var(--line); background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--m1) 18%, transparent), transparent 60%), var(--surface); color: var(--ink); font: inherit; cursor: pointer; transition: border-color .2s, transform .2s; }
	.ex-shelf:nth-child(3n + 2) { background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--m2) 18%, transparent), transparent 60%), var(--surface); }
	.ex-shelf:nth-child(3n) { background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--m3) 18%, transparent), transparent 60%), var(--surface); }
	.ex-shelf.on { border-color: var(--ink); box-shadow: 0 0 0 1px var(--ink); }
	.ex-shelf b { font-size: 15px; line-height: 1.25; }
	.ex-shelf small { color: var(--ink-3); font-size: 12.5px; }
	.ex-faces { display: flex; margin-bottom: 6px; }
	.ex-faces i { width: 30px; height: 30px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; margin-left: -8px; border: 2px solid var(--surface); background: var(--surface-2); font: 700 11px/1 var(--f-body); font-style: normal; color: var(--ink-2); }
	.ex-faces i:first-child { margin-left: 0; }
	.ex-faces img { width: 100%; height: 100%; object-fit: cover; }
	.ex-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; min-width: 0; }
	.ex-niches { flex: 1 1 320px; min-width: 0; overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; }
	.ex-fbtn span { margin-left: 4px; min-width: 18px; height: 18px; border-radius: 9px; display: inline-grid; place-items: center; background: var(--g2); color: #fff; font-size: 11px; }
	.ex-sort { margin-left: auto; }
	.ex-sort select { height: 38px; min-width: 150px; }
	.ex-now { margin: -4px 0 12px; color: var(--ink-2); font-size: 14px; }
	.ex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 12px; }
	.ex-card { display: grid; gap: 12px; padding: 14px; border-radius: 20px; border: 1px solid var(--line); background: var(--surface); animation: rise .45s cubic-bezier(.2, .9, .25, 1) both; animation-delay: calc(var(--i) * 30ms); min-width: 0; }
	.ex-top { display: grid; grid-template-columns: 54px minmax(0, 1fr) auto; gap: 12px; align-items: center; color: inherit; text-decoration: none; }
	.ex-pic { width: 54px; height: 54px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: linear-gradient(135deg, var(--g1), var(--g2) 60%, var(--g3)); padding: 2px; }
	.ex-pic img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 2px solid var(--surface); }
	.ex-pic b { color: #fff; font: 700 18px/1 var(--f-body); }
	.ex-who { display: grid; gap: 2px; min-width: 0; }
	.ex-who b { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ex-who small { color: var(--ink-3); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ex-score { display: grid; justify-items: center; gap: 2px; min-width: 56px; padding: 6px 8px; border-radius: 14px; background: var(--surface-2); }
	.ex-score b { font: 400 24px/1 var(--f-serif); }
	.ex-score small { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
	.ex-score.tone-ok b { color: var(--ok); }
	.ex-score.tone-info b { color: var(--g1); }
	.ex-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
	.ex-stats span { display: grid; gap: 1px; padding: 8px 10px; border-radius: 12px; background: var(--surface-2); min-width: 0; }
	.ex-stats b { font-size: 15px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ex-stats small { font-size: 11.5px; color: var(--ink-3); }
	.ex-proof { display: flex; flex-wrap: wrap; gap: 6px; }
	.ex-proof span { padding: 4px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; background: color-mix(in oklab, var(--ink) 7%, transparent); color: var(--ink-2); }
	.ex-proof .tone-ok { background: color-mix(in oklab, var(--ok) 14%, transparent); color: var(--ok); }
	.ex-proof .tone-warn { background: color-mix(in oklab, var(--warn) 14%, transparent); color: var(--warn); }
	.ex-proof .tone-info { background: color-mix(in oklab, var(--g1) 12%, transparent); color: var(--g1); }
	.ex-acts { display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: 8px; align-items: center; }
	.ex-acts :global(.btn) { justify-content: center; }
	.ex-cmp.on { border-color: var(--g2); color: var(--g2); }
	.ex-more { display: flex; margin: 16px auto 0; }
	.ex-tray { position: fixed; z-index: 45; left: 50%; transform: translateX(-50%); bottom: calc(20px + env(safe-area-inset-bottom, 0px)); display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 14px; border-radius: 18px; border: 1px solid var(--line-strong); background: var(--surface); box-shadow: 0 20px 40px -18px rgba(0, 0, 0, .55); max-width: calc(100% - 24px); }
	.ex-tray.ex-tray-ph { bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }
	.ex-tray .ex-faces { margin: 0; }
	.ex-tray-t { font-size: 14px; font-weight: 600; white-space: nowrap; }
	.ex-sheet { width: min(480px, 100%); display: grid; gap: 16px; }
	.ex-sheet h2, .ex-howd h2 { margin: 0; }
	.ex-fg { display: grid; gap: 8px; }
	.ex-two { grid-template-columns: 1fr 1fr; }
	.ex-two > div { display: grid; gap: 8px; }
	.ex-wrap { flex-wrap: wrap; }
	.ex-tg { display: flex; gap: 12px; align-items: flex-start; }
	.ex-tg span { display: grid; gap: 2px; font-weight: 600; }
	.ex-tg small { font-weight: 400; color: var(--ink-3); }
	.ex-fa { display: flex; justify-content: space-between; gap: 10px; }
	.ex-cmpd { width: min(860px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; }
	.ex-cmph { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 12px; }
	.ex-cmph h2 { margin: 0; }
	.ex-tbl-wrap { overflow-x: auto; }
	.ex-tbl { width: 100%; border-collapse: collapse; font-size: 14px; min-width: calc(120px + var(--n) * 130px); }
	.ex-tbl th, .ex-tbl td { padding: 10px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
	.ex-tbl thead th { font-size: 15px; }
	.ex-tbl thead th a { color: var(--ink); font-weight: 700; }
	.ex-tbl thead small { display: block; color: var(--ink-3); font-weight: 500; font-size: 12.5px; }
	.ex-tbl tbody th { color: var(--ink-3); font-weight: 600; font-size: 13px; width: 120px; }
	.ex-tbl td { font-variant-numeric: tabular-nums; }
	.ex-tbl b.tone-ok { color: var(--ok); }
	.ex-paused { color: var(--ink-3); }
	.ex-howd { width: min(480px, 100%); display: grid; gap: 12px; }
	.ex-howd p { margin: 0; color: var(--ink-2); }
	.ex-howd ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
	.ex-howd li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; color: var(--ink-3); font-size: 13.5px; }
	.ex-howd li b { color: var(--ink); font-size: 14.5px; }
	.ex-howd li span { grid-row: 1; grid-column: 2; font: 400 20px/1 var(--f-serif); color: var(--g2); }
	.ex-note { font-size: 13.5px; }
	@media (min-width: 761px) { .ex-h { grid-template-columns: minmax(0, 1fr) minmax(280px, 420px); align-items: end; } }
	@media (prefers-reduced-motion: reduce) { .ex-card { animation: none; } }
</style>
