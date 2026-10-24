<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { askAi } from '../../ai';
	import { ARTICLES, CATEGORIES, forSide, search, type Article } from '../../help/articles';
	import { loadTickets, STATUS, support } from '../../support.svelte';
	import Icon from '../Icon.svelte';
	import { keepAsk } from './helpFlow';

	// Help: search the articles as you type, ask Miracle (AI, from the articles only), browse by topic,
	// see your tickets, and talk to a person when none of that solves it.
	let { side, base }: { side: 'creator' | 'brand'; base: string } = $props();
	onMount(() => {
		loadTickets().catch(() => {});
	});
	let q = $state('');
	let topic = $state('');
	let asking = $state(false);
	let answer = $state<{ q: string; answer: string; sources: string[]; confident: boolean } | null>(null);
	let askError = $state('');
	const found = $derived(q.trim().length >= 2 ? search(q, side, 5) : []);
	const cats = $derived(CATEGORIES.filter((c) => c.audience === 'all' || c.audience === side));
	const mine = $derived(forSide(side));
	const inTopic = $derived(topic ? mine.filter((a) => a.category === topic) : []);
	const popular = $derived(mine.filter((a) => a.audience === side).slice(0, 6));
	const bySlug = (s: string) => ARTICLES.find((a) => a.slug === s);
	const open = $derived(support.list.filter((t) => t.status !== 'solved'));

	async function ask(e?: Event) {
		e?.preventDefault();
		const question = q.trim();
		if (question.length < 4 || asking) return;
		asking = true;
		askError = '';
		answer = null;
		try {
			const r = await askAi<{ answer: string; sources: string[]; confident: boolean }>('helpask', { q: question, side });
			answer = { q: question, ...r };
		} catch (err) {
			askError = err instanceof Error ? err.message : String(err);
		} finally {
			asking = false;
		}
	}
	function contact() {
		keepAsk({ q: answer?.q ?? q.trim(), answer: answer?.answer ?? '', sources: answer?.sources ?? found.map((a) => a.slug) });
		goto(`${base}/new`);
	}
	const go = (a: Article) => goto(`${base}/${a.slug}`);
</script>

<div class="hh">
	<section class="hero-card glow hh-hero rv" aria-labelledby="hh-t">
		<div class="mesh" aria-hidden="true"></div>
		<div class="hh-in">
			<span class="hh-eb">Help & support</span>
			<h1 id="hh-t">How can we <em>help?</em></h1>
			<form class="hh-search" onsubmit={ask} role="search">
				<Icon name="search" />
				<input bind:value={q} placeholder={side === 'brand' ? 'e.g. how do I pay a creator?' : 'e.g. a brand hasn’t paid my invoice'} aria-label="Search help, or ask a question" maxlength="300" />
				{#if q.trim().length >= 4}<button class="hh-ask" disabled={asking}>{#if asking}<span class="spinner"></span>{:else}<Icon name="spark" />{/if}Ask</button>{/if}
			</form>
			<small class="hh-note">Search the guides, or tap Ask and Miracle's AI answers from them.</small>
		</div>
	</section>

	{#if answer || asking || askError}
		<section class="hh-answer rv" aria-live="polite">
			<header><span class="hh-ai"><Icon name="spark" /></span><b>{asking ? 'Reading the guides…' : 'Miracle’s answer'}</b></header>
			{#if asking}
				<div class="hh-sk"><i></i><i></i><i></i></div>
			{:else if askError}
				<p class="hh-err">{askError}</p>
				<button class="btn primary" onclick={contact}><Icon name="send" />Ask a person instead</button>
			{:else if answer}
				{#if answer.answer}<p class="hh-text">{answer.answer}</p>{:else}<p class="hh-text">The guides don't cover that one. Someone from Miracle can look into it for you.</p>{/if}
				{#if answer.sources.length}
					<div class="hh-src">{#each answer.sources as s (s)}{@const a = bySlug(s)}{#if a}<a href="{base}/{a.slug}"><Icon name="doc" />{a.title}</a>{/if}{/each}</div>
				{/if}
				<div class="hh-did">
					<span>{answer.confident ? 'Did this sort it?' : 'This needs a person.'}</span>
					<div>
						{#if answer.confident}<button class="btn sm" onclick={() => ((answer = null), (q = ''))}><Icon name="check" />Yes, thanks</button>{/if}
						<button class="btn sm primary" onclick={contact}><Icon name="send" />{answer.confident ? 'No, contact support' : 'Contact support'}</button>
					</div>
				</div>
			{/if}
		</section>
	{/if}

	{#if q.trim().length >= 2 && !answer && !asking}
		<section class="hh-sec rv" aria-label="Matching guides">
			{#if found.length}
				<ul class="hh-list">
					{#each found as a (a.slug)}
						<li><a href="{base}/{a.slug}"><span class="hh-li"><Icon name="doc" /></span><span><b>{a.title}</b><small>{a.summary}</small></span><Icon name="chevR" /></a></li>
					{/each}
				</ul>
				<p class="hh-hint">Not it? Tap <b>Ask</b> to have Miracle answer your exact question.</p>
			{:else}
				<div class="hh-none"><b>No guide matches that yet</b><small>Tap Ask, or tell us about it and we'll help.</small><button class="btn sm primary" onclick={contact}><Icon name="send" />Contact support</button></div>
			{/if}
		</section>
	{/if}

	{#if support.list.length}
		<section class="hh-sec rv" style="--i:1">
			<header class="hh-sh"><h2>Your tickets</h2><a href="{base}/tickets">See all {support.list.length}</a></header>
			<ul class="hh-tk">
				{#each (open.length ? open : support.list).slice(0, 3) as t (t.id)}
					<li>
						<a href="{base}/tickets/{t.id}">
							<span class="hh-st {STATUS[t.status].tone}"><i></i>{STATUS[t.status].label}</span>
							<b>{t.subject}</b>
							<small>#{t.number}{t.last ? ` · ${t.last.from_team ? 'Miracle: ' : 'You: '}${t.last.body}` : ''}</small>
							{#if t.user_unread}<em class="hh-new">New reply</em>{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="hh-sec rv" style="--i:2">
		<header class="hh-sh"><h2>Browse by topic</h2></header>
		<div class="hh-topics">
			{#each cats as c (c.id)}
				<button class="hh-topic" class:on={topic === c.id} onclick={() => (topic = topic === c.id ? '' : c.id)} aria-pressed={topic === c.id}>
					<span class="hh-ti"><Icon name={c.icon} /></span>
					<b>{c.label}</b>
					<small>{mine.filter((a) => a.category === c.id).length} guides</small>
				</button>
			{/each}
		</div>
		{#if inTopic.length}
			<ul class="hh-list">
				{#each inTopic as a (a.slug)}
					<li><a href="{base}/{a.slug}"><span class="hh-li"><Icon name="doc" /></span><span><b>{a.title}</b><small>{a.summary}</small></span><Icon name="chevR" /></a></li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if !topic}
		<section class="hh-sec rv" style="--i:3">
			<header class="hh-sh"><h2>Most asked</h2></header>
			<ul class="hh-list">
				{#each popular as a (a.slug)}
					<li><button onclick={() => go(a)}><span class="hh-li"><Icon name="doc" /></span><span><b>{a.title}</b><small>{a.summary}</small></span><Icon name="chevR" /></button></li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="hh-talk rv" style="--i:4">
		<span class="hh-ti big"><Icon name="send" /></span>
		<div><b>Still stuck? Talk to a person.</b><small>Raise a ticket and the Miracle team replies here and by email, usually within a working day.</small></div>
		<a class="btn primary" href="{base}/new" onclick={(e) => (e.preventDefault(), contact())}><Icon name="send" />Contact support</a>
	</section>
</div>

<style>
	.hh {
		display: grid;
		gap: 22px;
		padding-bottom: 20px;
	}
	.hh-hero {
		min-height: 0;
	}
	.hh-in {
		position: relative;
		z-index: 1;
		display: grid;
		gap: 12px;
		padding: 22px 20px 18px;
	}
	.hh-eb {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.17em;
		text-transform: uppercase;
		opacity: 0.72;
	}
	.hh-in h1 {
		margin: 0;
		font: 400 40px/1.02 var(--f-serif, Georgia, serif);
		letter-spacing: -0.01em;
	}
	.hh-in h1 em {
		font-style: italic;
		background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 4px;
	}
	.hh-search {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 54px;
		padding: 0 8px 0 16px;
		background: rgba(255, 255, 255, 0.96);
		color: #1e171c;
		box-shadow: 4px 4px 0 var(--g2);
	}
	.hh-search > :global(.ic) {
		flex: none;
		width: 20px;
		height: 20px;
		opacity: 0.55;
	}
	.hh-search input {
		flex: 1;
		min-width: 0;
		height: 100%;
		border: 0;
		background: none;
		color: inherit;
		font: 500 16px var(--f-body, system-ui);
		outline: 0;
	}
	.hh-search input::placeholder {
		color: #8c8288;
	}
	.hh-ask {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 40px;
		padding: 0 14px;
		border: 0;
		background: #1e171c;
		color: #fff;
		font: 700 12px/1 var(--f-body, system-ui);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.hh-ask :global(.ic) {
		width: 15px;
		height: 15px;
	}
	.hh-note {
		font-size: 12.5px;
		opacity: 0.7;
	}
	/* The AI's answer */
	.hh-answer {
		display: grid;
		gap: 12px;
		padding: 18px;
		border-radius: 22px;
		background: radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--g1) 14%, transparent), transparent 60%), var(--surface);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g1) 40%, var(--line));
	}
	.hh-answer header {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.hh-answer header b {
		font: 400 21px/1.1 var(--f-serif, Georgia, serif);
	}
	.hh-ai {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		border-radius: 10px;
		background: linear-gradient(135deg, var(--g1), var(--g2));
		color: #fff;
	}
	.hh-ai :global(.ic) {
		width: 17px;
		height: 17px;
	}
	.hh-text {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		white-space: pre-line;
	}
	.hh-err {
		margin: 0;
		color: var(--bad);
	}
	.hh-sk {
		display: grid;
		gap: 8px;
	}
	.hh-sk i {
		height: 12px;
		border-radius: 6px;
		background: linear-gradient(100deg, var(--surface-2) 30%, color-mix(in oklab, var(--ink) 10%, var(--surface-2)) 50%, var(--surface-2) 70%);
		background-size: 300% 100%;
		animation: hh-sk 1.2s linear infinite;
	}
	.hh-sk i:last-child {
		width: 60%;
	}
	.hh-src {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.hh-src a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: 99px;
		box-shadow: inset 0 0 0 1px var(--line-strong, var(--line));
		color: var(--ink);
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
	}
	.hh-src :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.hh-did {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-top: 12px;
		border-top: 1px dashed var(--line-strong, var(--line));
		font-size: 14px;
		font-weight: 600;
	}
	.hh-did > div {
		display: flex;
		gap: 8px;
	}
	/* Sections */
	.hh-sec {
		display: grid;
		gap: 12px;
	}
	.hh-sh {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	.hh-sh h2 {
		margin: 0;
		font: 400 24px/1.1 var(--f-serif, Georgia, serif);
	}
	.hh-sh a {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-2);
	}
	.hh-list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.hh-list li + li {
		border-top: 1px solid var(--line);
	}
	.hh-list :is(a, button) {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		width: 100%;
		padding: 14px 16px;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}
	.hh-list b {
		display: block;
		font-size: 15px;
		font-weight: 600;
	}
	.hh-list small {
		display: block;
		margin-top: 2px;
		font-size: 13px;
		line-height: 1.4;
		color: var(--ink-3);
	}
	.hh-list :is(a, button) > :global(.ic:last-child) {
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}
	.hh-li {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 11px;
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.hh-li :global(.ic) {
		width: 18px;
		height: 18px;
	}
	.hh-hint {
		margin: 0;
		font-size: 13px;
		color: var(--ink-3);
	}
	.hh-none {
		display: grid;
		justify-items: start;
		gap: 6px;
		padding: 18px;
		border-radius: 20px;
		border: 1px dashed var(--line-strong, var(--line));
	}
	.hh-none small {
		color: var(--ink-3);
		margin-bottom: 6px;
	}
	/* Tickets */
	.hh-tk {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.hh-tk a {
		position: relative;
		display: grid;
		gap: 4px;
		padding: 14px 16px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		text-decoration: none;
	}
	.hh-tk b {
		font: 400 19px/1.2 var(--f-serif, Georgia, serif);
	}
	.hh-tk small {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 13px;
		color: var(--ink-3);
	}
	.hh-st {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.hh-st i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warn);
	}
	.hh-st.hot i {
		background: var(--g2);
	}
	.hh-st.ok i {
		background: var(--ok);
	}
	.hh-new {
		position: absolute;
		top: 12px;
		right: 14px;
		padding: 3px 8px;
		border-radius: 99px;
		background: var(--g2);
		color: #fff;
		font-size: 10.5px;
		font-style: normal;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	/* Topics */
	.hh-topics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	.hh-topic {
		display: grid;
		align-content: start;
		gap: 3px;
		padding: 14px;
		border: 0;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.hh-topic:active {
		transform: scale(0.97);
	}
	.hh-topic.on {
		box-shadow: inset 0 0 0 1.5px var(--ink);
	}
	.hh-topic b {
		font: 400 18px/1.15 var(--f-serif, Georgia, serif);
	}
	.hh-topic small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.hh-ti {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		margin-bottom: 8px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--g2) 14%, var(--surface-2));
		color: var(--g2);
	}
	.hh-ti :global(.ic) {
		width: 19px;
		height: 19px;
	}
	.hh-ti.big {
		width: 48px;
		height: 48px;
		margin: 0;
		background: linear-gradient(135deg, var(--g1), var(--g2));
		color: #fff;
	}
	/* Talk to a person */
	.hh-talk {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 14px;
		align-items: center;
		padding: 18px;
		border-radius: 22px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.hh-talk b {
		display: block;
		font: 400 20px/1.15 var(--f-serif, Georgia, serif);
	}
	.hh-talk small {
		display: block;
		margin-top: 4px;
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-3);
	}
	.hh-talk .btn {
		grid-column: 1 / -1;
	}
	@media (min-width: 761px) {
		.hh {
			padding-top: 64px;
		}
		.hh-topics {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.hh-talk {
			grid-template-columns: auto minmax(0, 1fr) auto;
		}
		.hh-talk .btn {
			grid-column: auto;
		}
		.hh-in {
			padding: 30px 30px 24px;
		}
		.hh-in h1 {
			font-size: 54px;
		}
		.hh-search {
			max-width: 680px;
		}
	}
	@keyframes hh-sk {
		to {
			background-position: -300% 0;
		}
	}
</style>
