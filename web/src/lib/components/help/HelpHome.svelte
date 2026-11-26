<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { askAi } from '../../ai';
	import { ARTICLES, CATEGORIES, forSide, search, type Article } from '../../help/articles';
	import { loadTickets, STATUS, support } from '../../support.svelte';
	import Icon from '../Icon.svelte';
	import { keepAsk } from './helpFlow';

	let { side, base }: { side: 'creator' | 'brand'; base: string } = $props();
	onMount(() => {
		loadTickets().catch(() => {});
	});

	let q = $state('');
	let topic = $state('');
	let asking = $state(false);
	let answer = $state<{ q: string; answer: string; sources: string[]; confident: boolean } | null>(null);
	let askError = $state('');

	const found = $derived(q.trim().length >= 2 ? search(q, side, 6) : []);
	const cats = $derived(CATEGORIES.filter((c) => c.audience === 'all' || c.audience === side));
	const mine = $derived(forSide(side));
	const inTopic = $derived(topic ? mine.filter((a) => a.category === topic) : []);
	const activeCat = $derived(cats.find((c) => c.id === topic) ?? null);
	const popular = $derived(mine.filter((a) => a.audience === side).slice(0, 6));
	const open = $derived(support.list.filter((t) => t.status !== 'solved'));

	const NEW_SLUGS = $derived(
		side === 'brand'
			? ['brand-growth-os', 'smart-contracts-asci', 'brand-drafts', 'brand-pay']
			: ['pitches', 'peer-benchmarks', 'creator-os-suite', 'drafts']
	);
	const spotlight = $derived(
		NEW_SLUGS.map((s) => mine.find((a) => a.slug === s)).filter((a): a is Article => !!a)
	);
	const quickChips = $derived(
		side === 'brand'
			? ['Bulk NEFT CSV', 'Smart contracts', 'Review drafts', 'Explore creators']
			: ['Engagement rate', 'WhatsApp drafts', 'Pitch brands', 'Auto-DM']
	);

	const TONE: Record<string, string> = {
		start: 'vio',
		collabs: 'rose',
		plan: 'peach',
		money: 'ok',
		grow: 'cyan',
		'brand-setup': 'vio',
		'brand-start': 'rose',
		'brand-campaigns': 'peach',
		'brand-money': 'ok',
		account: 'amber'
	};

	const bySlug = (s: string) => ARTICLES.find((a) => a.slug === s);
	const catLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Guide';

	function readMins(a: Article): string {
		const words = a.body
			.map((b) => ('p' in b ? b.p : 'tip' in b ? b.tip : 'steps' in b ? b.steps.join(' ') : b.list.join(' ')))
			.join(' ')
			.split(/\s+/).length;
		return `${Math.max(1, Math.round(words / 160))} min`;
	}

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

	function pickChip(chip: string) {
		q = chip;
		answer = null;
		askError = '';
	}

	function contact() {
		keepAsk({ q: answer?.q ?? q.trim(), answer: answer?.answer ?? '', sources: answer?.sources ?? found.map((a) => a.slug) });
		goto(`${base}/new`);
	}

	const go = (a: Article) => goto(`${base}/${a.slug}`);
</script>

<div class="hh2">
	<!-- Editorial Obsidian-Violet Hero -->
	<section class="hh2-hero rv" aria-labelledby="hh2-t">
		<div class="hh2-htop">
			<span class="hh2-eb">Help &amp; Playbooks</span>
			<span class="hh2-cnt">{mine.length} guides</span>
		</div>
		<h1 id="hh2-t">How can we <em>help?</em></h1>
		<p class="hh2-sub">Search step-by-step guides or ask Miracle AI for an instant answer.</p>

		<form class="hh2-search" onsubmit={ask} role="search">
			<Icon name="search" />
			<input
				bind:value={q}
				placeholder={side === 'brand' ? 'Search or ask: how do I export Bulk NEFT?' : 'Search or ask: how do I log a WhatsApp draft?'}
				aria-label="Search help, or ask a question"
				maxlength="300"
			/>
			{#if q.trim()}
				<button type="button" class="hh2-clr" aria-label="Clear search" onclick={() => ((q = ''), (answer = null), (askError = ''))}>
					<Icon name="x" />
				</button>
			{/if}
			{#if q.trim().length >= 4}
				<button type="submit" class="hh2-ask" disabled={asking}>
					{#if asking}<span class="spinner"></span>{:else}<Icon name="spark" />{/if}
					<span>Ask</span>
				</button>
			{/if}
		</form>

		<div class="hh2-chips" aria-label="Quick topics">
			{#each quickChips as chip (chip)}
				<button type="button" class="hh2-chip" onclick={() => pickChip(chip)}>{chip}</button>
			{/each}
		</div>
	</section>

	<!-- AI Instant Answer Card -->
	{#if answer || asking || askError}
		<section class="hh2-ans rv" aria-live="polite">
			<header class="hh2-ans-h">
				<span class="hh2-ai"><Icon name="spark" /></span>
				<b>{asking ? 'Reading the guides…' : 'Miracle AI answer'}</b>
			</header>
			{#if asking}
				<div class="hh2-sk"><i></i><i></i><i></i></div>
			{:else if askError}
				<p class="hh2-err">{askError}</p>
				<button type="button" class="hh2-neo sm" onclick={contact}><Icon name="send" /><span>Ask a person instead</span></button>
			{:else if answer}
				<p class="hh2-anstext">{answer.answer || "The guides don't cover that one yet. Someone from Miracle can look into it for you."}</p>
				{#if answer.sources.length}
					<div class="hh2-src">
						{#each answer.sources as s (s)}
							{@const a = bySlug(s)}
							{#if a}<a href="{base}/{a.slug}"><Icon name="doc" /><span>{a.title}</span></a>{/if}
						{/each}
					</div>
				{/if}
				<div class="hh2-did">
					<span>{answer.confident ? 'Did this sort it?' : 'This needs a person.'}</span>
					<div class="hh2-did-b">
						{#if answer.confident}
							<button type="button" class="hh2-ghost" onclick={() => ((answer = null), (q = ''))}><Icon name="check" /><span>Yes, thanks</span></button>
						{/if}
						<button type="button" class="hh2-neo sm" onclick={contact}><Icon name="send" /><span>{answer.confident ? 'Contact support' : 'Talk to support'}</span></button>
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Live Search Results -->
	{#if q.trim().length >= 2 && !answer && !asking}
		<section class="hh2-sec rv" aria-label="Matching guides">
			<header class="hh2-sh">
				<h2>Matching guides</h2>
				<small>{found.length} found</small>
			</header>
			{#if found.length}
				<div class="hh2-cards">
					{#each found as a (a.slug)}
						<a class="hh2-gcard" href="{base}/{a.slug}">
							<div class="hh2-gtop">
								<span class="hh2-cat {TONE[a.category] ?? 'vio'}">{catLabel(a.category)}</span>
								<span class="hh2-min">{readMins(a)}</span>
							</div>
							<b>{a.title}</b>
							<p>{a.summary}</p>
							<span class="hh2-go">Read guide <Icon name="chevR" /></span>
						</a>
					{/each}
				</div>
				<p class="hh2-hint">Not what you meant? Tap <b>Ask</b> above and Miracle AI will answer your exact question.</p>
			{:else}
				<div class="hh2-none">
					<b>No guide matches “{q.trim()}”</b>
					<small>Tap Ask above for an AI answer, or message our team directly.</small>
					<button type="button" class="hh2-neo sm" onclick={contact}><Icon name="send" /><span>Contact support</span></button>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Active Support Tickets -->
	{#if support.list.length}
		<section class="hh2-sec rv" style="--i:1">
			<header class="hh2-sh">
				<h2>Your tickets</h2>
				<a href="{base}/tickets">See all {support.list.length}</a>
			</header>
			<div class="hh2-tks">
				{#each (open.length ? open : support.list).slice(0, 3) as t (t.id)}
					<a class="hh2-tk" href="{base}/tickets/{t.id}">
						<div class="hh2-tk-top">
							<span class="hh2-st {STATUS[t.status].tone}"><i></i>{STATUS[t.status].label}</span>
							{#if t.user_unread}<em class="hh2-new">New reply</em>{/if}
						</div>
						<b>{t.subject}</b>
						<small>#{t.number}{t.last ? ` · ${t.last.from_team ? 'Miracle: ' : 'You: '}${t.last.body}` : ''}</small>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- New & Updated Spotlight Strip -->
	{#if !q.trim() && !topic && spotlight.length}
		<section class="hh2-sec rv" style="--i:1">
			<header class="hh2-sh">
				<h2>New &amp; upgraded</h2>
				<small>Fresh guides</small>
			</header>
			<div class="hh2-rail">
				{#each spotlight as a (a.slug)}
					<button type="button" class="hh2-spot" onclick={() => go(a)}>
						<div class="hh2-gtop">
							<span class="hh2-cat {TONE[a.category] ?? 'vio'}">{catLabel(a.category)}</span>
							<span class="hh2-min">{readMins(a)}</span>
						</div>
						<b>{a.title}</b>
						<p>{a.summary}</p>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Topic Bento Grid -->
	<section class="hh2-sec rv" style="--i:2">
		<header class="hh2-sh">
			<h2>Browse by topic</h2>
			{#if topic}
				<button type="button" class="hh2-clear" onclick={() => (topic = '')}>Show all</button>
			{/if}
		</header>
		<div class="hh2-topics">
			{#each cats as c (c.id)}
				{@const tone = TONE[c.id] ?? 'vio'}
				{@const cnt = mine.filter((a) => a.category === c.id).length}
				<button
					type="button"
					class="hh2-topic {tone}"
					class:on={topic === c.id}
					onclick={() => (topic = topic === c.id ? '' : c.id)}
					aria-pressed={topic === c.id}
				>
					<span class="hh2-ti"><Icon name={c.icon} /></span>
					<b>{c.label}</b>
					<small>{cnt} guide{cnt === 1 ? '' : 's'}</small>
				</button>
			{/each}
		</div>

		{#if inTopic.length && activeCat}
			<div class="hh2-topic-head">
				<span>{activeCat.label}</span>
				<small>{inTopic.length} guide{inTopic.length === 1 ? '' : 's'}</small>
			</div>
			<div class="hh2-cards">
				{#each inTopic as a (a.slug)}
					<a class="hh2-gcard" href="{base}/{a.slug}">
						<div class="hh2-gtop">
							<span class="hh2-cat {TONE[a.category] ?? 'vio'}">{activeCat.label}</span>
							<span class="hh2-min">{readMins(a)}</span>
						</div>
						<b>{a.title}</b>
						<p>{a.summary}</p>
						<span class="hh2-go">Read guide <Icon name="chevR" /></span>
					</a>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Popular Guides -->
	{#if !topic && !q.trim()}
		<section class="hh2-sec rv" style="--i:3">
			<header class="hh2-sh">
				<h2>Popular guides</h2>
				<small>Quick reads</small>
			</header>
			<div class="hh2-cards">
				{#each popular as a (a.slug)}
					<button type="button" class="hh2-gcard" onclick={() => go(a)}>
						<div class="hh2-gtop">
							<span class="hh2-cat {TONE[a.category] ?? 'vio'}">{catLabel(a.category)}</span>
							<span class="hh2-min">{readMins(a)}</span>
						</div>
						<b>{a.title}</b>
						<p>{a.summary}</p>
						<span class="hh2-go">Read guide <Icon name="chevR" /></span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Human Support Footer Card -->
	<section class="hh2-talk rv" style="--i:4">
		<div class="hh2-talk-in">
			<span class="hh2-talk-ic"><Icon name="send" /></span>
			<div>
				<b>Still stuck? Talk to a person.</b>
				<small>Raise a ticket and our team replies in the app and by email, usually within a working day.</small>
			</div>
		</div>
		<a class="hh2-neo" href="{base}/new" onclick={(e) => (e.preventDefault(), contact())}>
			<Icon name="send" /><span>Contact support</span>
		</a>
	</section>
</div>

<style>
	.hh2 {
		display: grid;
		gap: 22px;
		padding: 8px 0 28px;
	}
	/* Editorial Obsidian-Violet Hero */
	.hh2-hero {
		position: relative;
		display: grid;
		gap: 10px;
		padding: 20px 18px 18px;
		border-radius: 20px;
		border: 1px solid rgba(156, 123, 255, 0.24);
		background:
			radial-gradient(120% 90% at 12% 0%, rgba(156, 123, 255, 0.16), transparent 62%),
			radial-gradient(90% 80% at 96% 18%, rgba(242, 90, 144, 0.13), transparent 58%),
			var(--paper);
	}
	.hh2-htop {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.hh2-eb {
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.hh2-cnt {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 600;
		color: #c8b6ff;
		padding: 3px 9px;
		border-radius: 999px;
		border: 1px solid rgba(156, 123, 255, 0.28);
		background: rgba(156, 123, 255, 0.1);
	}
	.hh2-hero h1 {
		margin: 0;
		font: 400 36px/1.05 var(--f-serif, Georgia, serif);
		letter-spacing: -0.015em;
		color: var(--ink);
	}
	.hh2-hero h1 em {
		font-style: italic;
		background: linear-gradient(95deg, var(--g1), var(--g2) 55%, var(--g3));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 4px;
	}
	.hh2-sub {
		margin: 0;
		font-size: 14px;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.hh2-search {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 50px;
		padding: 6px 6px 6px 14px;
		margin-top: 4px;
		border-radius: 14px;
		background: rgba(13, 10, 14, 0.82);
		border: 1px solid rgba(255, 255, 255, 0.14);
		transition: border-color 0.18s ease, box-shadow 0.18s ease;
	}
	.hh2-search:focus-within {
		border-color: rgba(156, 123, 255, 0.58);
		box-shadow: 0 0 0 3px rgba(156, 123, 255, 0.15);
	}
	.hh2-search > :global(.ic) {
		flex: none;
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}
	.hh2-search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 400 14.5px/1.3 var(--f-sans, inherit);
		outline: none;
	}
	.hh2-search input::placeholder {
		color: var(--ink-3);
	}
	.hh2-clr {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border: 0;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		color: var(--ink-2);
		cursor: pointer;
	}
	.hh2-clr :global(.ic) { width: 14px; height: 14px; }
	.hh2-ask {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 14px;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		color: var(--bg);
		font: 700 13px/1 var(--f-sans, inherit);
		box-shadow: 3px 3px 0 var(--g2);
		cursor: pointer;
	}
	.hh2-ask :global(.ic) { width: 15px; height: 15px; }
	.hh2-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 2px;
	}
	.hh2-chip {
		padding: 6px 11px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: var(--ink-2);
		font-size: 12.5px;
		font-weight: 500;
		cursor: pointer;
	}
	.hh2-chip:hover {
		border-color: rgba(156, 123, 255, 0.4);
		color: var(--ink);
	}

	/* AI Answer Card */
	.hh2-ans {
		display: grid;
		gap: 12px;
		padding: 16px;
		border-radius: 18px;
		border: 1px solid rgba(242, 90, 144, 0.32);
		background: linear-gradient(150deg, rgba(156, 123, 255, 0.1), rgba(242, 90, 144, 0.06) 50%, var(--paper));
	}
	.hh2-ans-h {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 14px;
	}
	.hh2-ai {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 8px;
		background: rgba(242, 90, 144, 0.16);
		color: #f79fc0;
	}
	.hh2-ai :global(.ic) { width: 15px; height: 15px; }
	.hh2-anstext {
		margin: 0;
		font-size: 15px;
		line-height: 1.6;
		color: var(--ink);
		white-space: pre-line;
	}
	.hh2-err { margin: 0; font-size: 14px; color: var(--err, #ff8f8f); }
	.hh2-sk { display: grid; gap: 8px; }
	.hh2-sk i {
		display: block;
		height: 12px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.08);
	}
	.hh2-sk i:last-child { width: 62%; }
	.hh2-src { display: flex; flex-wrap: wrap; gap: 6px; }
	.hh2-src a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: #c8b6ff;
		font-size: 12.5px;
		text-decoration: none;
	}
	.hh2-src a :global(.ic) { width: 13px; height: 13px; }
	.hh2-did {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-top: 10px;
		border-top: 1px dashed rgba(255, 255, 255, 0.1);
		font-size: 13px;
		color: var(--ink-2);
	}
	.hh2-did-b { display: flex; flex-wrap: wrap; gap: 8px; }

	/* Sections */
	.hh2-sec { display: grid; gap: 12px; }
	.hh2-sh {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.hh2-sh h2 {
		margin: 0;
		font: 400 24px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.hh2-sh small {
		font-family: var(--mono);
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--ink-3);
	}
	.hh2-sh a, .hh2-clear {
		border: 0;
		background: transparent;
		padding: 0;
		font-size: 13px;
		font-weight: 600;
		color: #c8b6ff;
		text-decoration: none;
		cursor: pointer;
	}

	/* Spotlight Horizontal Rail */
	.hh2-rail {
		display: flex;
		gap: 10px;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		padding-bottom: 4px;
		scrollbar-width: none;
	}
	.hh2-rail::-webkit-scrollbar { display: none; }
	.hh2-spot {
		flex: 0 0 248px;
		scroll-snap-align: start;
		display: grid;
		gap: 8px;
		align-content: start;
		padding: 15px;
		text-align: left;
		border-radius: 16px;
		border: 1px solid rgba(156, 123, 255, 0.22);
		background: linear-gradient(155deg, rgba(156, 123, 255, 0.08), var(--paper) 65%);
		color: var(--ink);
		cursor: pointer;
	}
	.hh2-spot b { font-size: 15px; line-height: 1.3; font-weight: 600; }
	.hh2-spot p {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-2);
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Color-Coded Topic Bento Grid */
	.hh2-topics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}
	@media (min-width: 720px) {
		.hh2-topics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	}
	.hh2-topic {
		display: grid;
		gap: 8px;
		align-content: start;
		padding: 14px;
		text-align: left;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--paper);
		color: var(--ink);
		cursor: pointer;
		transition: border-color 0.16s ease, transform 0.16s ease, background 0.16s ease;
	}
	.hh2-topic.on {
		border-color: var(--ink);
		background: linear-gradient(155deg, rgba(156, 123, 255, 0.14), var(--paper) 75%);
		box-shadow: inset 0 -3px 0 var(--g2);
	}
	.hh2-ti {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 11px;
		border: 1px solid transparent;
	}
	.hh2-ti :global(.ic) { width: 18px; height: 18px; }
	.hh2-topic.vio .hh2-ti { background: rgba(156, 123, 255, 0.14); border-color: rgba(156, 123, 255, 0.28); color: #c8b6ff; }
	.hh2-topic.rose .hh2-ti { background: rgba(242, 90, 144, 0.14); border-color: rgba(242, 90, 144, 0.28); color: #f79fc0; }
	.hh2-topic.peach .hh2-ti { background: rgba(255, 174, 107, 0.14); border-color: rgba(255, 174, 107, 0.28); color: #ffc896; }
	.hh2-topic.ok .hh2-ti { background: rgba(74, 222, 128, 0.12); border-color: rgba(74, 222, 128, 0.26); color: #7ee8a5; }
	.hh2-topic.cyan .hh2-ti { background: rgba(56, 189, 248, 0.12); border-color: rgba(56, 189, 248, 0.26); color: #7dd3fc; }
	.hh2-topic.amber .hh2-ti { background: rgba(251, 191, 36, 0.12); border-color: rgba(251, 191, 36, 0.26); color: #fcd34d; }
	.hh2-topic b {
		font: 400 19px/1.15 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.hh2-topic small {
		font-family: var(--mono);
		font-size: 11.5px;
		color: var(--ink-3);
	}

	.hh2-topic-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 2px 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-2);
	}
	.hh2-topic-head small { font-family: var(--mono); font-size: 11px; color: var(--ink-3); }

	/* Scannable Editorial Guide Cards */
	.hh2-cards {
		display: grid;
		gap: 10px;
	}
	@media (min-width: 720px) {
		.hh2-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	.hh2-gcard {
		display: grid;
		gap: 7px;
		align-content: start;
		padding: 15px 16px;
		text-align: left;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--paper);
		color: var(--ink);
		text-decoration: none;
		cursor: pointer;
		transition: border-color 0.16s ease;
	}
	.hh2-gcard:hover { border-color: rgba(156, 123, 255, 0.34); }
	.hh2-gtop {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.hh2-cat {
		font-family: var(--mono);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 999px;
	}
	.hh2-cat.vio { background: rgba(156, 123, 255, 0.14); color: #c8b6ff; }
	.hh2-cat.rose { background: rgba(242, 90, 144, 0.14); color: #f79fc0; }
	.hh2-cat.peach { background: rgba(255, 174, 107, 0.14); color: #ffc896; }
	.hh2-cat.ok { background: rgba(74, 222, 128, 0.12); color: #7ee8a5; }
	.hh2-cat.cyan { background: rgba(56, 189, 248, 0.12); color: #7dd3fc; }
	.hh2-cat.amber { background: rgba(251, 191, 36, 0.12); color: #fcd34d; }
	.hh2-min {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--ink-3);
	}
	.hh2-gcard b {
		font-size: 16px;
		line-height: 1.3;
		font-weight: 600;
		color: var(--ink);
	}
	.hh2-gcard p {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.hh2-go {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 2px;
		font-size: 12.5px;
		font-weight: 600;
		color: #c8b6ff;
	}
	.hh2-go :global(.ic) { width: 14px; height: 14px; }

	.hh2-hint {
		margin: 0;
		font-size: 13px;
		color: var(--ink-3);
	}
	.hh2-none {
		display: grid;
		justify-items: start;
		gap: 8px;
		padding: 18px;
		border-radius: 16px;
		border: 1px dashed rgba(255, 255, 255, 0.14);
		background: var(--paper);
	}
	.hh2-none small { font-size: 13.5px; color: var(--ink-2); }

	/* Tickets */
	.hh2-tks { display: grid; gap: 8px; }
	.hh2-tk {
		display: grid;
		gap: 5px;
		padding: 14px 16px;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--paper);
		color: var(--ink);
		text-decoration: none;
	}
	.hh2-tk-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.hh2-tk b { font-size: 15px; font-weight: 600; }
	.hh2-tk small { font-size: 13px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.hh2-st {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--mono);
		font-size: 11px;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.hh2-st i { width: 7px; height: 7px; border-radius: 999px; background: currentColor; }
	.hh2-st.ok { color: #7ee8a5; }
	.hh2-st.warn { color: #ffc896; }
	.hh2-new {
		font-style: normal;
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		color: #f79fc0;
		background: rgba(242, 90, 144, 0.14);
		padding: 2px 8px;
		border-radius: 999px;
	}

	/* Human Support Card */
	.hh2-talk {
		display: grid;
		gap: 14px;
		padding: 18px;
		border-radius: 18px;
		border: 1px solid rgba(156, 123, 255, 0.22);
		background: linear-gradient(155deg, rgba(156, 123, 255, 0.1), var(--paper) 70%);
	}
	.hh2-talk-in {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.hh2-talk-ic {
		flex: none;
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 12px;
		background: rgba(156, 123, 255, 0.16);
		color: #c8b6ff;
	}
	.hh2-talk-ic :global(.ic) { width: 18px; height: 18px; }
	.hh2-talk b { display: block; font-size: 16px; margin-bottom: 3px; }
	.hh2-talk small { display: block; font-size: 13.5px; line-height: 1.45; color: var(--ink-2); }

	/* Sharp NeoPOP & Ghost Buttons */
	.hh2-neo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		height: 44px;
		padding: 0 18px;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		color: var(--bg);
		font: 700 14px/1 var(--f-sans, inherit);
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--g2);
		cursor: pointer;
		width: fit-content;
	}
	.hh2-neo.sm { height: 36px; padding: 0 14px; font-size: 13px; }
	.hh2-neo :global(.ic) { width: 15px; height: 15px; }
	.hh2-ghost {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: var(--ink);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.hh2-ghost :global(.ic) { width: 14px; height: 14px; }
</style>
