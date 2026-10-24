<script lang="ts">
	import { goto } from '$app/navigation';
	import { ARTICLES, CATEGORIES, forSide } from '../../help/articles';
	import Icon from '../Icon.svelte';
	import { keepAsk } from './helpFlow';

	// One help guide: steps, notes and tips, links into the app, "did this help?", and more on the topic.
	let { slug, side, base }: { slug: string; side: 'creator' | 'brand'; base: string } = $props();
	const a = $derived(ARTICLES.find((x) => x.slug === slug && (x.audience === 'all' || x.audience === side)));
	const cat = $derived(CATEGORIES.find((c) => c.id === a?.category));
	const more = $derived(a ? forSide(side).filter((x) => x.category === a.category && x.slug !== a.slug).slice(0, 4) : []);
	// Links are written for creators (/studio/...); on the brand side they point at the brand app.
	const href = (h: string) => (side === 'brand' ? h.replace(/^\/studio\//, '/brand/') : h);
	let voted = $state<'' | 'yes' | 'no'>('');
	function no() {
		voted = 'no';
	}
	function contact() {
		keepAsk({ q: '', answer: '', sources: a ? [a.slug] : [], article: a?.title });
		goto(`${base}/new`);
	}
</script>

{#if !a}
	<div class="ha-none"><b>That guide isn't here</b><a class="btn" href={base}><Icon name="back" />All help</a></div>
{:else}
	<article class="ha rv">
		<a class="ha-eb" href={base}><Icon name="back" />{cat?.label ?? 'Help'}</a>
		<h1>{a.title}</h1>
		<p class="ha-sum">{a.summary}</p>
		<div class="ha-body">
			{#each a.body as b, i (i)}
				{#if 'p' in b}<p>{b.p}</p>
				{:else if 'steps' in b}
					<ol class="ha-steps">{#each b.steps as s, j (j)}<li><span>{j + 1}</span><p>{s}</p></li>{/each}</ol>
				{:else if 'list' in b}
					<ul class="ha-list">{#each b.list as s, j (j)}<li>{s}</li>{/each}</ul>
				{:else}
					<div class="ha-tip"><Icon name="spark" /><p>{b.tip}</p></div>
				{/if}
			{/each}
		</div>
		{#if a.links?.length}
			<div class="ha-links">{#each a.links as l (l.href)}<a class="btn" href={href(l.href)}>{l.label}<Icon name="arrow" /></a>{/each}</div>
		{/if}

		<div class="ha-vote" aria-live="polite">
			{#if !voted}
				<span>Did this help?</span>
				<div><button class="btn sm" onclick={() => (voted = 'yes')}>Yes</button><button class="btn sm" onclick={no}>Not really</button></div>
			{:else if voted === 'yes'}
				<span><Icon name="check" />Glad it helped.</span>
			{:else}
				<span>Sorry about that. Tell us what you need, and a person will help.</span>
				<button class="btn sm primary" onclick={contact}><Icon name="send" />Contact support</button>
			{/if}
		</div>
	</article>

	{#if more.length}
		<section class="ha-more rv" style="--i:1">
			<h2>More on {cat?.label.toLowerCase() ?? 'this'}</h2>
			<ul>{#each more as m (m.slug)}<li><a href="{base}/{m.slug}"><b>{m.title}</b><small>{m.summary}</small><Icon name="chevR" /></a></li>{/each}</ul>
		</section>
	{/if}
{/if}

<style>
	.ha {
		display: grid;
		gap: 14px;
		max-width: 720px;
	}
	.ha-eb {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: fit-content;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
		text-decoration: none;
	}
	.ha-eb :global(.ic) {
		width: 15px;
		height: 15px;
	}
	.ha h1 {
		margin: 0;
		font: 400 36px/1.05 var(--f-serif, Georgia, serif);
		letter-spacing: -0.01em;
		text-wrap: balance;
	}
	.ha-sum {
		margin: 0;
		font-size: 16px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.ha-body {
		display: grid;
		gap: 14px;
		padding-top: 6px;
		border-top: 1px dashed var(--line-strong, var(--line));
	}
	.ha-body > p,
	.ha-list li,
	.ha-steps p,
	.ha-tip p {
		margin: 0;
		font-size: 15.5px;
		line-height: 1.6;
	}
	.ha-steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.ha-steps li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		align-items: start;
		padding: 14px;
		border-radius: 16px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.ha-steps span {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		background: var(--ink);
		color: var(--bg);
		font: 400 17px/1 var(--f-serif, Georgia, serif);
	}
	.ha-list {
		margin: 0;
		padding-left: 20px;
		display: grid;
		gap: 8px;
	}
	.ha-tip {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px;
		padding: 14px 16px;
		border-radius: 16px;
		background: color-mix(in oklab, var(--g3) 12%, var(--surface));
	}
	.ha-tip :global(.ic) {
		width: 18px;
		height: 18px;
		margin-top: 3px;
		color: var(--g3);
	}
	.ha-links {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.ha-vote {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 8px;
		padding: 16px;
		border-radius: 18px;
		background: var(--surface-2);
		font-size: 14.5px;
		font-weight: 600;
	}
	.ha-vote > div {
		display: flex;
		gap: 8px;
	}
	.ha-vote span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.ha-vote :global(.ic) {
		width: 16px;
		height: 16px;
	}
	.ha-more {
		display: grid;
		gap: 10px;
		max-width: 720px;
		margin-top: 22px;
	}
	.ha-more h2 {
		margin: 0;
		font: 400 22px/1.1 var(--f-serif, Georgia, serif);
	}
	.ha-more ul {
		list-style: none;
		margin: 0;
		padding: 0;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.ha-more li + li {
		border-top: 1px solid var(--line);
	}
	.ha-more a {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		column-gap: 10px;
		padding: 13px 16px;
		color: var(--ink);
		text-decoration: none;
	}
	.ha-more b {
		font-size: 15px;
	}
	.ha-more small {
		grid-column: 1;
		font-size: 13px;
		color: var(--ink-3);
	}
	.ha-more :global(.ic) {
		grid-row: 1 / 3;
		grid-column: 2;
		align-self: center;
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}
	.ha-none {
		display: grid;
		justify-items: start;
		gap: 12px;
		padding: 30px 0;
	}
</style>
