<script lang="ts">
	import { livePrices, loadLivePrices } from '../../livePrices.svelte';
	loadLivePrices();
	import { goto } from '$app/navigation';
	import { ARTICLES, CATEGORIES, forSide } from '../../help/articles';
	import Icon from '../Icon.svelte';
	import { keepAsk } from './helpFlow';

	let { slug, side, base }: { slug: string; side: 'creator' | 'brand'; base: string } = $props();
	const a = $derived(ARTICLES.find((x) => x.slug === slug && (x.audience === 'all' || x.audience === side)));
	const cat = $derived(CATEGORIES.find((c) => c.id === a?.category));
	const more = $derived(a ? forSide(side).filter((x) => x.category === a.category && x.slug !== a.slug).slice(0, 4) : []);
	const links = $derived((a?.links ?? []).filter((l) => !l.side || l.side === side));
	const href = (h: string) => (side === 'brand' ? h.replace(/^\/studio\//, '/brand/') : h);

	let voted = $state<'' | 'yes' | 'no'>('');
	let checkedSteps = $state<Record<string, boolean>>({});

	$effect(() => {
		// Reset per-article interactive state when navigating between articles
		void slug;
		voted = '';
		checkedSteps = {};
	});

	const readMins = $derived.by(() => {
		if (!a) return '1 min read';
		const words = a.body
			.map((b) => ('p' in b ? b.p : 'tip' in b ? b.tip : 'steps' in b ? b.steps.join(' ') : b.list.join(' ')))
			.join(' ')
			.split(/\s+/).length;
		return `${Math.max(1, Math.round(words / 160))} min read`;
	});

	const totalSteps = $derived(
		a ? a.body.reduce((acc, b) => acc + ('steps' in b ? b.steps.length : 0), 0) : 0
	);
	const doneSteps = $derived(Object.values(checkedSteps).filter(Boolean).length);

	function toggleStep(key: string) {
		checkedSteps = { ...checkedSteps, [key]: !checkedSteps[key] };
	}

	/** Split "Lead title: explanation" inside list items for crisp visual hierarchy. */
	function splitLead(raw: string): { head: string; rest: string } {
		const txt = livePrices(raw);
		const idx = txt.indexOf(': ');
		if (idx > 2 && idx < 56) {
			return { head: txt.slice(0, idx), rest: txt.slice(idx + 2) };
		}
		return { head: '', rest: txt };
	}

	function contact() {
		keepAsk({ q: '', answer: '', sources: a ? [a.slug] : [], article: a?.title });
		goto(`${base}/new`);
	}
</script>

{#if !a}
	<div class="ha2-none">
		<b>That guide isn’t here</b>
		<a class="ha2-neo sm" href={base}><Icon name="back" /><span>All help</span></a>
	</div>
{:else}
	<article class="ha2 rv">
		<!-- Editorial Header Card -->
		<header class="ha2-head">
			<div class="ha2-meta">
				<a class="ha2-back" href={base}><Icon name="back" /><span>{cat?.label ?? 'Help'}</span></a>
				<div class="ha2-badges">
					<span class="ha2-badge">{readMins}</span>
					{#if totalSteps}
						<span class="ha2-badge step" class:done={doneSteps === totalSteps}>
							{doneSteps}/{totalSteps} done
						</span>
					{/if}
				</div>
			</div>

			<h1>{a.title}</h1>
			<p class="ha2-sum">{a.summary}</p>

			{#if links.length}
				<div class="ha2-jump">
					{#each links as l, idx (l.href)}
						<a class={idx === 0 ? 'ha2-neo sm' : 'ha2-ghost'} href={href(l.href)}>
							<span>{l.label}</span>
							<Icon name="arrow" />
						</a>
					{/each}
				</div>
			{/if}
		</header>

		<!-- Structured Playbook Body -->
		<div class="ha2-body">
			{#each a.body as b, i (i)}
				{#if 'p' in b}
					<p class="ha2-p">{livePrices(b.p)}</p>
				{:else if 'steps' in b}
					<section class="ha2-stepbox" aria-label="Step-by-step checklist">
						<div class="ha2-stepbox-h">
							<span>Step-by-step</span>
							<small>Tap any step to check it off</small>
						</div>
						<ol class="ha2-steps">
							{#each b.steps as s, j (j)}
								{@const k = `${i}-${j}`}
								{@const done = !!checkedSteps[k]}
								<li>
									<button type="button" class="ha2-step" class:done onclick={() => toggleStep(k)} aria-pressed={done}>
										<span class="ha2-num">
											{#if done}<Icon name="check" />{:else}{String(j + 1).padStart(2, '0')}{/if}
										</span>
										<span class="ha2-stxt">{livePrices(s)}</span>
									</button>
								</li>
							{/each}
						</ol>
					</section>
				{:else if 'list' in b}
					<ul class="ha2-list">
						{#each b.list as s, j (j)}
							{@const parts = splitLead(s)}
							<li>
								<span class="ha2-dot" aria-hidden="true"></span>
								<div>
									{#if parts.head}<b>{parts.head}</b>{/if}
									<p>{parts.rest}</p>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<aside class="ha2-tip">
						<div class="ha2-tip-h">
							<Icon name="spark" />
							<span>Pro tip</span>
						</div>
						<p>{livePrices(b.tip)}</p>
					</aside>
				{/if}
			{/each}
		</div>

		<!-- Feedback Bar -->
		<div class="ha2-vote" aria-live="polite">
			{#if !voted}
				<span>Was this guide helpful?</span>
				<div class="ha2-vbtns">
					<button type="button" class="ha2-neo sm" onclick={() => (voted = 'yes')}><Icon name="check" /><span>Yes</span></button>
					<button type="button" class="ha2-ghost" onclick={() => (voted = 'no')}><span>Not really</span></button>
				</div>
			{:else if voted === 'yes'}
				<span class="ha2-vok"><Icon name="check" />Glad that helped.</span>
			{:else}
				<div class="ha2-vno">
					<span>Sorry about that — tell us what you need and our team will jump in.</span>
					<button type="button" class="ha2-neo sm" onclick={contact}><Icon name="send" /><span>Contact support</span></button>
				</div>
			{/if}
		</div>
	</article>

	{#if more.length}
		<section class="ha2-more rv" style="--i:1">
			<header class="ha2-mh">
				<h2>Up next in {cat?.label ?? 'Help'}</h2>
				<a href={base}>All topics</a>
			</header>
			<div class="ha2-mgrid">
				{#each more as m (m.slug)}
					<a class="ha2-mcard" href="{base}/{m.slug}">
						<b>{m.title}</b>
						<small>{m.summary}</small>
						<span>Read guide <Icon name="chevR" /></span>
					</a>
				{/each}
			</div>
		</section>
	{/if}
{/if}

<style>
	.ha2 {
		display: grid;
		gap: 18px;
		max-width: 740px;
		padding-top: 6px;
	}
	.ha2-none {
		display: grid;
		justify-items: start;
		gap: 12px;
		padding: 24px;
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: var(--paper);
	}

	/* Editorial Header Card */
	.ha2-head {
		display: grid;
		gap: 12px;
		padding: 20px 18px;
		border-radius: 20px;
		border: 1px solid rgba(156, 123, 255, 0.24);
		background:
			radial-gradient(110% 80% at 8% 0%, rgba(156, 123, 255, 0.15), transparent 60%),
			radial-gradient(85% 75% at 95% 20%, rgba(242, 90, 144, 0.11), transparent 55%),
			var(--paper);
	}
	.ha2-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.ha2-back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 11px 5px 8px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(255, 255, 255, 0.04);
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-2);
		text-decoration: none;
	}
	.ha2-back :global(.ic) { width: 14px; height: 14px; }
	.ha2-badges { display: flex; align-items: center; gap: 6px; }
	.ha2-badge {
		font-family: var(--mono);
		font-size: 11px;
		color: var(--ink-3);
		padding: 4px 9px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.09);
		background: rgba(255, 255, 255, 0.03);
	}
	.ha2-badge.step { color: #c8b6ff; border-color: rgba(156, 123, 255, 0.28); background: rgba(156, 123, 255, 0.1); }
	.ha2-badge.step.done { color: #7ee8a5; border-color: rgba(74, 222, 128, 0.32); background: rgba(74, 222, 128, 0.12); }

	.ha2-head h1 {
		margin: 0;
		font: 400 34px/1.08 var(--f-serif, Georgia, serif);
		letter-spacing: -0.015em;
		color: var(--ink);
		text-wrap: balance;
	}
	.ha2-sum {
		margin: 0;
		font-size: 15.5px;
		line-height: 1.55;
		color: var(--ink-2);
	}
	.ha2-jump {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding-top: 4px;
	}

	/* Playbook Body */
	.ha2-body {
		display: grid;
		gap: 16px;
	}
	.ha2-p {
		margin: 0;
		font-size: 15.5px;
		line-height: 1.65;
		color: var(--ink);
		padding: 0 2px;
	}

	/* Interactive Connected Step Timeline */
	.ha2-stepbox {
		display: grid;
		gap: 12px;
		padding: 16px;
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.09);
		background: var(--paper);
	}
	.ha2-stepbox-h {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding-bottom: 8px;
		border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
	}
	.ha2-stepbox-h span {
		font-family: var(--mono);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #c8b6ff;
	}
	.ha2-stepbox-h small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.ha2-steps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 6px;
	}
	.ha2-steps li {
		position: relative;
	}
	.ha2-steps li:not(:last-child)::after {
		content: '';
		position: absolute;
		left: 25px;
		top: 44px;
		bottom: -6px;
		width: 1px;
		background: linear-gradient(180deg, rgba(156, 123, 255, 0.4), rgba(242, 90, 144, 0.15));
		pointer-events: none;
	}
	.ha2-step {
		width: 100%;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		align-items: start;
		padding: 10px 10px;
		text-align: left;
		border: 0;
		border-radius: 12px;
		background: transparent;
		color: var(--ink);
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.ha2-step:hover { background: rgba(255, 255, 255, 0.03); }
	.ha2-num {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 999px;
		border: 1px solid rgba(156, 123, 255, 0.45);
		background: rgba(156, 123, 255, 0.14);
		color: #d6c8ff;
		font-family: var(--mono);
		font-size: 11.5px;
		font-weight: 700;
	}
	.ha2-num :global(.ic) { width: 14px; height: 14px; }
	.ha2-step.done .ha2-num {
		border-color: rgba(74, 222, 128, 0.5);
		background: rgba(74, 222, 128, 0.18);
		color: #7ee8a5;
	}
	.ha2-stxt {
		font-size: 15px;
		line-height: 1.58;
		padding-top: 3px;
		color: var(--ink);
	}
	.ha2-step.done .ha2-stxt {
		color: var(--ink-3);
		text-decoration: line-through;
	}

	/* Structured Highlight List */
	.ha2-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.ha2-list li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		align-items: start;
		padding: 14px 16px;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--paper);
	}
	.ha2-dot {
		width: 8px;
		height: 8px;
		margin-top: 8px;
		border-radius: 999px;
		background: linear-gradient(135deg, var(--g1), var(--g2));
	}
	.ha2-list b {
		display: block;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
		margin-bottom: 3px;
	}
	.ha2-list p {
		margin: 0;
		font-size: 14.5px;
		line-height: 1.58;
		color: var(--ink-2);
	}

	/* Editorial Pro Tip Callout */
	.ha2-tip {
		display: grid;
		gap: 6px;
		padding: 15px 16px;
		border-radius: 16px;
		border: 1px solid rgba(242, 90, 144, 0.3);
		background: linear-gradient(145deg, rgba(242, 90, 144, 0.1), rgba(156, 123, 255, 0.07) 60%, var(--paper));
	}
	.ha2-tip-h {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: #f79fc0;
	}
	.ha2-tip-h :global(.ic) { width: 14px; height: 14px; }
	.ha2-tip p {
		margin: 0;
		font-size: 14.5px;
		line-height: 1.58;
		color: var(--ink);
	}

	/* Feedback Bar */
	.ha2-vote {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 15px 16px;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.09);
		background: var(--paper);
		font-size: 14px;
		color: var(--ink-2);
	}
	.ha2-vbtns { display: flex; gap: 8px; }
	.ha2-vok {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-weight: 600;
		color: #7ee8a5;
	}
	.ha2-vok :global(.ic) { width: 16px; height: 16px; }
	.ha2-vno { display: grid; gap: 10px; width: 100%; }

	/* Up Next Cards */
	.ha2-more {
		display: grid;
		gap: 12px;
		max-width: 740px;
		margin-top: 22px;
		padding-bottom: 24px;
	}
	.ha2-mh {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.ha2-mh h2 {
		margin: 0;
		font: 400 22px/1.15 var(--f-serif, Georgia, serif);
	}
	.ha2-mh a {
		font-size: 13px;
		font-weight: 600;
		color: #c8b6ff;
		text-decoration: none;
	}
	.ha2-mgrid {
		display: grid;
		gap: 10px;
	}
	@media (min-width: 680px) {
		.ha2-mgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
	.ha2-mcard {
		display: grid;
		gap: 6px;
		align-content: start;
		padding: 14px 16px;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--paper);
		color: var(--ink);
		text-decoration: none;
	}
	.ha2-mcard:hover { border-color: rgba(156, 123, 255, 0.34); }
	.ha2-mcard b { font-size: 15px; line-height: 1.3; }
	.ha2-mcard small { font-size: 13px; line-height: 1.45; color: var(--ink-2); }
	.ha2-mcard span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin-top: 2px;
		font-size: 12.5px;
		font-weight: 600;
		color: #c8b6ff;
	}
	.ha2-mcard span :global(.ic) { width: 13px; height: 13px; }

	/* Sharp NeoPOP & Ghost Buttons */
	.ha2-neo {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		height: 40px;
		padding: 0 15px;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		color: var(--bg);
		font: 700 13.5px/1 var(--f-sans, inherit);
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--g2);
		cursor: pointer;
		width: fit-content;
	}
	.ha2-neo.sm { height: 36px; padding: 0 13px; font-size: 13px; }
	.ha2-neo :global(.ic) { width: 14px; height: 14px; }
	.ha2-ghost {
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
		text-decoration: none;
		cursor: pointer;
	}
	.ha2-ghost :global(.ic) { width: 14px; height: 14px; }
</style>
