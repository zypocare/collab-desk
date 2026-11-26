<script lang="ts">
	import type { Collab, Stage } from '../types';
	import {
		CHECKLIST,
		fmt,
		inr,
		isPaid,
		outstanding,
		ships,
		stageIndex,
		stageName,
		STAGES,
		usageLabel
	} from '../util';
	import { rightsRows } from '../rights';
	import { portal } from '../portal';
	import Icon from './Icon.svelte';

	// Exact implementation of the Collab Details workspace concept (collab-details-options.html):
	// Progress card -> NeoPOP 3-tab switcher (Work | Money | Brand) -> Accent Hero card with stacked art ->
	// Grouped tools list -> Activity row -> Native search & group sub-sheet, opening real CollabDrawer sheets.
	let {
		c,
		next = null,
		canCancel = false,
		onstage,
		oncancel,
		onresume,
		onrunnext,
		onopen
	}: {
		c: Collab;
		next: { key: string; label: string; hint: string; icon: string } | null;
		canCancel?: boolean;
		onstage: (st: Stage) => void;
		oncancel?: () => void;
		onresume?: () => void;
		onrunnext: (key: string) => void;
		onopen: (secId: string) => void;
	} = $props();

	type TabKey = 'Work' | 'Money' | 'Brand';
	type ToolMeta = { id: string; secId: string; title: string; sub: string; tab: string; aliases?: string };
	type GroupDef = { title: string; note: string; ic: string; ids: string[] };

	let selected = $state<TabKey>('Work');
	let sheet = $state<
		| null
		| { kind: 'group'; title: string; ids: string[] }
		| { kind: 'find'; title: string }
		| { kind: 'stage'; title: string }
	>(null);
	let query = $state('');

	const si = $derived(stageIndex(c.stage));
	const stageLabel = $derived(stageName(c, c.stage));
	const delivTotal = $derived((c.deliverables ?? []).reduce((a, d) => a + (Number(d.qty) || 1), 0));
	const delivDone = $derived((c.deliverables ?? []).filter((d) => d.done).reduce((a, d) => a + (Number(d.qty) || 1), 0));
	const dealVal = $derived(c.type === 'barter' ? Number(c.product_value) || 0 : Number(c.fee) || 0);
	const paid = $derived(isPaid(c));
	const owes = $derived(outstanding(c));
	const usageTxt = $derived(usageLabel(c.usage) || 'Organic only');
	const msgCount = $derived(c.messages?.length ?? 0);
	const postCount = $derived(c.posts?.length ?? 0);
	const draftCount = $derived(c.drafts?.length ?? 0);
	const eventCount = $derived(c.events?.length ?? 0);
	const checkDone = $derived(CHECKLIST.filter((k) => Boolean(c.checklist?.[k.key])).length);
	const costsTotal = $derived((c.expenses ?? []).reduce((a, x) => a + (Number(x.amount) || 0), 0));
	const datesSub = $derived(
		[c.draft_date ? `Draft ${fmt(c.draft_date)}` : '', c.live_date ? `Live ${fmt(c.live_date)}` : ''].filter(Boolean).join(' · ') || 'No dates set'
	);
	const travelSub = $derived(
		c.shoot_mode === 'location'
			? [c.venue_address || c.venue_name || 'On-location', c.travel_km ? `${c.travel_km} km` : ''].filter(Boolean).join(' · ')
			: 'At home · tap for on-location'
	);

	const toolMap = $derived<Record<string, ToolMeta>>({
		pieces: {
			id: 'pieces',
			secId: 'sec-deliv',
			title: 'Pieces',
			sub: delivTotal ? `${delivDone} of ${delivTotal} delivered` : 'Add deliverables',
			tab: 'Work',
			aliases: 'deliverable content reels stories'
		},
		dates: { id: 'dates', secId: 'sec-dates', title: 'Dates', sub: datesSub, tab: 'Work', aliases: 'schedule shoot live calendar' },
		travel: { id: 'travel', secId: 'sec-travel', title: 'Shoot location & travel', sub: travelSub, tab: 'Work', aliases: 'location venue distance map drive commute on-location home' },
		files: {
			id: 'files',
			secId: 'sec-files',
			title: 'Files',
			sub: c.files?.length ? `${c.files.length} campaign file${c.files.length === 1 ? '' : 's'}` : 'Campaign assets',
			tab: 'Work',
			aliases: 'assets attachments uploads'
		},
		shipping: { id: 'shipping', secId: 'sec-shipping', title: 'Product shipping', sub: 'Delivery & tracking', tab: 'Work', aliases: 'package courier delivery' },
		drafts: {
			id: 'drafts',
			secId: 'sec-drafts',
			title: 'Drafts for approval',
			sub: draftCount ? `${draftCount} draft${draftCount === 1 ? '' : 's'} shared` : 'None sent yet',
			tab: 'Work',
			aliases: 'review approval cut video'
		},
		checklist: {
			id: 'checklist',
			secId: 'sec-check',
			title: 'Posting checklist',
			sub: `${checkDone} of ${CHECKLIST.length} complete`,
			tab: 'Work',
			aliases: 'asci disclosure tags'
		},
		posts: {
			id: 'posts',
			secId: 'sec-posts',
			title: 'Instagram posts',
			sub: postCount ? `${postCount} linked` : 'Link live posts',
			tab: 'Work',
			aliases: 'reel story views reach'
		},
		promo: {
			id: 'promo',
			secId: 'sec-promo',
			title: 'Promo code & link',
			sub: c.links?.length ? `${c.links.length} tracking link${c.links.length === 1 ? '' : 's'}` : 'Campaign attribution',
			tab: 'Work',
			aliases: 'discount coupon attribution'
		},
		deal: {
			id: 'deal',
			secId: 'sec-deal',
			title: 'Deal',
			sub: `${dealVal ? inr(dealVal) : 'No fee set'} · ${usageTxt}`,
			tab: 'Money',
			aliases: 'fee barter terms'
		},
		quote: {
			id: 'quote',
			secId: 'sec-quote',
			title: 'Quote & agreement',
			sub: c.quotes?.length ? `${c.quotes.length} quote${c.quotes.length === 1 ? '' : 's'}` : 'Send quote',
			tab: 'Money',
			aliases: 'contract agreement offer'
		},
		rights: { id: 'rights', secId: 'sec-usage', title: 'Usage rights', sub: usageTxt, tab: 'Money', aliases: 'licensing paid usage' },
		ads: { id: 'ads', secId: 'sec-rights', title: 'Ads & exclusivity', sub: 'Campaign permissions', tab: 'Money', aliases: 'whitelisting exclusivity' },
		payment: {
			id: 'payment',
			secId: 'sec-pay',
			title: 'Payment',
			sub: paid ? 'Paid in full' : owes > 0 ? `${inr(owes)} due` : 'No invoice yet',
			tab: 'Money',
			aliases: 'invoice billing upi tds'
		},
		costs: {
			id: 'costs',
			secId: 'sec-costs',
			title: 'Costs & profit',
			sub: costsTotal ? `${inr(costsTotal)} recorded` : 'No costs recorded',
			tab: 'Money',
			aliases: 'expenses margin'
		},
		messages: {
			id: 'messages',
			secId: 'sec-msg',
			title: 'Messages',
			sub: msgCount ? `${msgCount} message${msgCount === 1 ? '' : 's'}` : 'No messages yet',
			tab: 'Brand',
			aliases: 'chat conversation inbox'
		},
		brief: { id: 'brief', secId: 'sec-brief', title: 'Brief', sub: 'Campaign requirements', tab: 'Brand', aliases: 'script guidelines notes' },
		brand: { id: 'brand', secId: 'sec-brand', title: 'Brand details', sub: 'Profile & sharing', tab: 'Brand', aliases: 'company instagram' },
		contact: {
			id: 'contact',
			secId: 'sec-contact',
			title: 'Brand contact',
			sub: c.contact_name || c.contact_email || 'Campaign point of contact',
			tab: 'Brand',
			aliases: 'person email phone whatsapp'
		},
		follow: { id: 'follow', secId: 'sec-follow', title: 'Follow-up reminder', sub: c.follow_date ? `Set for ${fmt(c.follow_date)}` : 'No reminder set', tab: 'Brand', aliases: 'nudge alert' },
		rebook: { id: 'rebook', secId: 'sec-rebook', title: 'Book again', sub: 'Pitch a repeat collab', tab: 'Brand', aliases: 'repeat retainer' },
		rating: { id: 'rating', secId: 'sec-rating', title: 'Brand rating', sub: 'Rate this brand privately', tab: 'Brand', aliases: 'review feedback' },
		caseStudy: { id: 'caseStudy', secId: 'sec-case', title: 'Case study', sub: 'Add to your portfolio', tab: 'Brand', aliases: 'portfolio results' },
		activity: {
			id: 'activity',
			secId: 'sec-activity',
			title: 'Activity',
			sub: `${eventCount} update${eventCount === 1 ? '' : 's'}`,
			tab: 'Collaboration',
			aliases: 'history log timeline'
		}
	});

	const tabConfig = $derived.by(() => {
		const workSched = ['dates'];
		if (['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage) || c.files?.length) workSched.push('files');
		if (ships(c)) workSched.push('shipping');

		const workReview = ['drafts'];
		if (['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage)) workReview.push('checklist');

		const workPub = ['posts'];
		if (c.type !== 'barter' || c.links?.length) workPub.push('promo');

		const moneyAgree = ['quote'];
		if (c.usage_ends) moneyAgree.push('rights');
		if (rightsRows([c]).length) moneyAgree.push('ads');

		const moneyGroups: GroupDef[] = [
			{ title: 'Agreement & rights', note: 'Quote, usage and permissions', ic: 'doc', ids: moneyAgree },
			{ title: 'Payment', note: toolMap.payment.sub, ic: 'wallet', ids: ['payment'] }
		];
		if (['confirmed', 'creating', 'live', 'wrapped'].includes(c.stage) || c.expenses?.length) {
			moneyGroups.push({ title: 'Costs & profit', note: toolMap.costs.sub, ic: 'chart', ids: ['costs'] });
		}

		const brandGroups: GroupDef[] = [
			{ title: 'Campaign brief', note: 'Requirements and deliverables', ic: 'doc', ids: ['brief'] },
			{ title: 'People & access', note: 'Brand details and contact', ic: 'users', ids: ['brand', 'contact'] },
			{ title: 'Follow-up', note: toolMap.follow.sub, ic: 'bell', ids: ['follow'] }
		];
		if (c.stage === 'live' || c.stage === 'wrapped') {
			const afterIds = c.stage === 'wrapped' ? ['rebook', 'rating', 'caseStudy'] : ['rating', 'caseStudy'];
			brandGroups.push({ title: 'After the campaign', note: 'Feedback and portfolio', ic: 'heart', ids: afterIds });
		}

		return {
			Work: {
				heroId: 'pieces',
				label: 'Deliverables',
				bigMain: delivTotal ? `${delivDone}` : '0',
				bigSub: delivTotal ? `/ ${delivTotal}` : '',
				sub: delivTotal ? 'pieces delivered' : 'Add pieces to track',
				action: 'View pieces',
				art: 'film',
				groups: [
					{ title: 'Shoot location & travel', note: travelSub, ic: 'pin', ids: ['travel'] },
					{ title: 'Schedule & files', note: 'Dates and campaign assets', ic: 'cal', ids: workSched },
					{ title: 'Review & approval', note: 'Drafts and posting checklist', ic: 'check', ids: workReview },
					{ title: 'Publishing', note: 'Instagram posts and promo links', ic: 'insta', ids: workPub }
				] as GroupDef[]
			},
			Money: {
				heroId: 'deal',
				label: c.type === 'barter' ? 'Barter value' : 'Deal value',
				bigMain: dealVal ? inr(dealVal) : '₹0',
				bigSub: '',
				sub: usageTxt,
				action: 'View deal',
				art: 'rupee',
				groups: moneyGroups
			},
			Brand: {
				heroId: 'messages',
				label: 'Conversation',
				bigMain: msgCount ? `${msgCount}` : 'Messages',
				bigSub: msgCount ? (msgCount === 1 ? 'note' : 'notes') : '',
				sub: msgCount ? 'Tap to view thread' : 'No messages yet',
				action: 'View conversation',
				art: 'mail',
				groups: brandGroups
			}
		};
	});

	const curTab = $derived(tabConfig[selected]);

	const searchResults = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const all = Object.values(toolMap);
		if (!q) return ['pieces', 'travel', 'quote', 'payment', 'messages', 'brief'].map((id) => toolMap[id]).filter(Boolean);
		return all.filter((t) => `${t.title} ${t.sub} ${t.tab} ${t.aliases ?? ''}`.toLowerCase().includes(q));
	});

	function openTool(id: string) {
		const t = toolMap[id];
		if (!t) return;
		sheet = null;
		onopen(t.secId);
	}

	function openGroup(g: GroupDef) {
		if (g.ids.length === 1) {
			openTool(g.ids[0]);
			return;
		}
		sheet = { kind: 'group', title: g.title, ids: g.ids };
	}

	function pickStage(st: Stage) {
		sheet = null;
		onstage(st);
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && sheet && (sheet = null)} />

<div class="cdv">
	<!-- Topline: Collab details + Global Search button -->
	<div class="cdv-topline">
		<h1>Collab details</h1>
		<button type="button" class="cdv-icbtn" aria-label="Find a tool across all categories" onclick={() => { query = ''; sheet = { kind: 'find', title: 'Find a tool' }; }}>
			<Icon name="search" />
		</button>
	</div>

	<!-- Progress Card (Stage + 6-bar track + Next step + Primary CTA) -->
	<section class="cdv-progress" aria-label="Collaboration progress">
		<button type="button" class="cdv-stage-btn" onclick={() => (sheet = { kind: 'stage', title: 'Collaboration stage' })}>
			<strong><i aria-hidden="true"></i>{stageLabel}</strong>
			<small>
				{#if ['declined', 'paused', 'cancelled'].includes(c.stage)}
					{stageLabel}
				{:else}
					Stage {Math.min(si + 1, STAGES.length)} of {STAGES.length}
				{/if}
				<Icon name="chevR" />
			</small>
		</button>

		{#if !['declined', 'paused', 'cancelled'].includes(c.stage)}
			<div class="cdv-track" aria-hidden="true">
				{#each STAGES as st, i (st.id)}
					<i class:done={i < si} class:current={i === si}></i>
				{/each}
			</div>
		{/if}

		{#if c.stage === 'cancelled' || c.stage === 'paused'}
			<div class="cdv-held">
				<b>{c.stage === 'cancelled' ? 'Cancelled collaboration' : 'Paused collaboration'}</b>
				{#if c.lifecycle_reason}<p>{c.lifecycle_reason}</p>{/if}
				{#if onresume}
					<button type="button" class="btn sm cdv-reopen" onclick={onresume}>
						{c.stage === 'cancelled' ? 'Reopen collaboration' : 'Resume collaboration'}
					</button>
				{/if}
			</div>
		{:else if next}
			<div class="cdv-next">
				<span class="cdv-eb">Next step</span>
				<p>{next.hint}</p>
			</div>
			<button type="button" class="btn grad cdv-cta" onclick={() => onrunnext(next.key)}>
				<span class="cdv-cta-ic"><Icon name={next.icon} /></span>
				<span>{next.label}</span>
				<span class="cdv-cta-arr"><Icon name="arrow" /></span>
			</button>
		{/if}
	</section>

	<!-- NeoPOP 3-Tab Switcher (Work | Money | Brand) -->
	<div class="cdv-tabs" role="tablist" aria-label="Collaboration tools">
		{#each (['Work', 'Money', 'Brand'] as const) as name (name)}
			<button
				type="button"
				role="tab"
				aria-selected={selected === name}
				onclick={() => (selected = name)}
			>{name}</button>
		{/each}
	</div>

	<!-- Active Tab Panel -->
	<section class="cdv-panel" data-tab={selected} role="tabpanel">
		<!-- Accent Hero Card with Stacked Art -->
		<button type="button" class="cdv-hero" onclick={() => openTool(curTab.heroId)}>
			<span class="cdv-eb">{curTab.label}</span>
			<strong class="cdv-hero-val">{curTab.bigMain}{#if curTab.bigSub} <em>{curTab.bigSub}</em>{/if}</strong>
			<span class="cdv-hero-sub">{curTab.sub}</span>
			<span class="cdv-art" aria-hidden="true">
				<i></i><i></i><i><Icon name={curTab.art} /></i>
			</span>
			<span class="cdv-hero-foot">
				<span>{curTab.action}</span>
				<Icon name="arrow" />
			</span>
		</button>

		<h2 class="cdv-sec-lbl">{selected} tools</h2>
		<div class="cdv-groups">
			{#each curTab.groups as g (g.title)}
				<button type="button" class="cdv-group" onclick={() => openGroup(g)}>
					<span class="cdv-gic"><Icon name={g.ic} /></span>
					<span class="cdv-gcopy">
						<b>{g.title}</b>
						<small>{g.note}</small>
					</span>
					<Icon name="chevR" />
				</button>
			{/each}
		</div>

		<!-- More -> Activity Row -->
		<div class="cdv-act-row">
			<h3>More</h3>
			<button type="button" onclick={() => openTool('activity')}>
				<span class="cdv-clock"><Icon name="clock" /></span>
				<b>Activity</b>
				<small>{eventCount} update{eventCount === 1 ? '' : 's'}</small>
				<Icon name="chevR" />
			</button>
		</div>
	</section>
</div>

<!-- Native Bottom Sheet for Group Selection / Tool Search / Stage Picker -->
{#if sheet}
	<div class="cdv-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (sheet = null)}>
		<div class="cdv-sheet" role="dialog" aria-modal="true" aria-labelledby="cdv-sh-t">
			<div class="cdv-handle" aria-hidden="true"></div>
			<header class="cdv-sh-head">
				<h2 id="cdv-sh-t">{sheet.title}</h2>
				<button type="button" class="cdv-icbtn" aria-label="Close" onclick={() => (sheet = null)}><Icon name="x" /></button>
			</header>

			{#if sheet.kind === 'find'}
				<label class="cdv-findbox">
					<Icon name="search" />
					<input type="search" placeholder="Try invoice, draft or brief" bind:value={query} />
				</label>
				<div class="cdv-results">
					{#each searchResults as t (t.id)}
						<button type="button" onclick={() => openTool(t.id)}>
							<span><b>{t.title}</b><small>{t.tab} · {t.sub}</small></span>
							<Icon name="chevR" />
						</button>
					{:else}
						<p class="cdv-empty">No matching tools. Try another word.</p>
					{/each}
				</div>
			{:else if sheet.kind === 'group'}
				<div class="cdv-results">
					{#each sheet.ids as id (id)}
						{@const t = toolMap[id]}
						{#if t}
							<button type="button" onclick={() => openTool(t.id)}>
								<span><b>{t.title}</b><small>{t.sub}</small></span>
								<Icon name="chevR" />
							</button>
						{/if}
					{/each}
				</div>
			{:else if sheet.kind === 'stage'}
				<div class="cdv-results">
					{#each STAGES as st, i (st.id)}
						<button type="button" onclick={() => pickStage(st.id)}>
							<span>
								<b>{i + 1} · {stageName(c, st.id)}</b>
								<small>{i < si ? 'Complete' : i === si ? 'Current stage' : 'Upcoming'}</small>
							</span>
							{#if i === si}<Icon name="check" />{:else}<Icon name="chevR" />{/if}
						</button>
					{/each}
					{#if canCancel && oncancel}
						<button type="button" class="cdv-cancel-row" onclick={() => { sheet = null; oncancel(); }}>
							<span>
								<b>Cancel collaboration</b>
								<small>Didn't work out · moves to Cancelled tab</small>
							</span>
							<Icon name="x" />
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.cdv {
		--cdv-panel: #1c171c;
		--cdv-line: #3b303a;
		--cdv-ink: #f4eef2;
		--cdv-muted: #b2a6af;
		--cdv-pink: #f25a90;
		--cdv-violet: #b29aff;
		--cdv-peach: #ffae6b;
		color: var(--cdv-ink);
		padding: 4px 0 18px;
	}
	.cdv-topline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 18px;
	}
	.cdv-topline h1 {
		margin: 0;
		font: 400 38px/1 var(--f-serif, Georgia, serif);
		letter-spacing: -1.8px;
		color: var(--cdv-ink);
	}
	.cdv-icbtn {
		appearance: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		flex: none;
		border: 1px solid var(--cdv-line);
		border-radius: 50%;
		background: var(--cdv-panel);
		color: var(--cdv-ink);
		cursor: pointer;
	}
	.cdv-eb {
		display: block;
		font: 600 10px/1.4 ui-monospace, Consolas, monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cdv-muted);
	}

	/* Progress Card */
	.cdv-progress {
		padding: 0 15px 14px;
		margin-bottom: 16px;
		border: 1px solid #503949;
		border-radius: 16px;
		background: linear-gradient(125deg, #261c27, var(--cdv-panel) 70%);
	}
	.cdv-stage-btn {
		appearance: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		width: 100%;
		min-height: 46px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--cdv-ink);
		text-align: left;
		cursor: pointer;
	}
	.cdv-stage-btn strong,
	.cdv-stage-btn small {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.cdv-stage-btn strong { font-size: 15px; }
	.cdv-stage-btn small { color: var(--cdv-muted); font-size: 12px; }
	.cdv-stage-btn small :global(.ic) { width: 14px; height: 14px; }
	.cdv-stage-btn i {
		width: 7px;
		height: 7px;
		background: var(--cdv-pink);
		border-radius: 50%;
	}
	.cdv-track {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 4px;
	}
	.cdv-track i {
		display: block;
		height: 4px;
		border-radius: 4px;
		background: var(--cdv-line);
	}
	.cdv-track i.done { background: var(--cdv-violet); }
	.cdv-track i.current { background: linear-gradient(90deg, var(--cdv-violet), var(--cdv-pink), var(--cdv-peach)); }
	.cdv-next { margin: 14px 0 10px; }
	.cdv-next p {
		margin: 3px 0 0;
		font: 500 20px/1.25 var(--f-serif, Georgia, serif);
		color: var(--cdv-ink);
	}
	.cdv-cta { width: 100%; min-width: 0; min-height: 44px; justify-content: flex-start; text-align: left; white-space: normal; }
	@media (width > 760px) {
		.cdv-cta {
			appearance: none;
			display: flex;
			align-items: center;
			gap: 9px;
			padding: 9px 13px;
			border: 0;
			border-radius: 10px;
			background: linear-gradient(105deg, var(--cdv-violet), #f28cb3 58%, var(--cdv-peach));
			color: #231323;
			font: 700 14px/1.2 var(--f-body);
			cursor: pointer;
		}
	}
	.cdv-cta-ic { display: flex; }
	.cdv-cta-arr { margin-left: auto; display: flex; }
	.cdv-cta :global(.ic) { width: 17px; height: 17px; }

	/* NeoPOP 3-Tab Switcher */
	.cdv-tabs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border: 1px solid #3e343e;
		margin: 6px 0 0;
	}
	.cdv-tabs button {
		appearance: none;
		height: 44px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: #a39aa1;
		font: 700 11px/1 var(--f-body);
		letter-spacing: 0.13em;
		text-transform: uppercase;
		cursor: pointer;
		transition: background-color 0.2s, color 0.2s, transform 0.12s, box-shadow 0.12s;
	}
	.cdv-tabs button + button { border-left: 1px solid #2e262e; }
	.cdv-tabs button[aria-selected='true'] {
		position: relative;
		z-index: 1;
		background: var(--cdv-ink);
		color: #110d11;
		box-shadow: 3px 3px 0 var(--cdv-pink);
	}
	.cdv-tabs button:active { transform: translate(2px, 2px); box-shadow: none; }

	/* Tab Panel Accent Tokens */
	.cdv-panel { --accent: var(--cdv-violet); --tint: #46314f; }
	.cdv-panel[data-tab='Money'] { --accent: var(--cdv-peach); --tint: #4e332c; }
	.cdv-panel[data-tab='Brand'] { --accent: #ff9aba; --tint: #512d40; }

	/* Accent Hero Card + Stacked Art */
	.cdv-hero {
		appearance: none;
		position: relative;
		width: 100%;
		display: block;
		isolation: isolate;
		overflow: hidden;
		text-align: left;
		margin: 16px 0 21px;
		border: 1px solid color-mix(in srgb, var(--accent) 38%, #30242c);
		border-radius: 18px;
		background: linear-gradient(114deg, #231b25, var(--tint));
		color: var(--cdv-ink);
		padding: 17px 16px 0;
		cursor: pointer;
	}
	.cdv-hero .cdv-eb { color: var(--accent); }
	.cdv-hero-val {
		display: block;
		font: 400 clamp(38px, 11vw, 48px)/1.1 var(--f-serif, Georgia, serif);
		letter-spacing: -1.6px;
		margin: 8px 0 3px;
	}
	.cdv-hero-val em {
		font: italic 400 0.64em var(--f-serif, Georgia, serif);
		color: var(--accent);
	}
	.cdv-hero-sub {
		display: block;
		color: #dfd4dd;
		font-size: 12px;
		max-width: 59%;
		min-height: 21px;
		margin-bottom: 16px;
	}
	.cdv-hero-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-top: 1px solid rgba(255, 255, 255, 0.15);
		padding: 9px 0 10px;
		font-size: 12px;
		font-weight: 700;
	}
	.cdv-hero-foot :global(.ic) { width: 17px; height: 17px; }
	.cdv-art {
		position: absolute;
		right: 4%;
		top: 21px;
		width: 31%;
		height: 77px;
		z-index: -1;
		transform: rotate(-11deg);
		color: var(--accent);
	}
	.cdv-art i {
		position: absolute;
		display: grid;
		place-items: center;
		width: 66%;
		height: 72%;
		top: 10%;
		left: 9%;
		border: 1px solid currentColor;
		border-radius: 8px;
		background: linear-gradient(130deg, color-mix(in srgb, var(--accent) 35%, #2f2235), #39283c);
		box-shadow: 2px 3px 0 rgba(27, 19, 29, 0.35);
	}
	.cdv-art i:nth-child(1) { transform: translate(30%, -13%) rotate(12deg); opacity: 0.55; }
	.cdv-art i:nth-child(2) { transform: translate(15%, -6%) rotate(5deg); opacity: 0.85; }
	.cdv-art i:last-child::after {
		content: '';
		position: absolute;
		inset: 5px;
		border: 1px dashed rgba(255, 255, 255, 0.65);
		border-radius: 4px;
		opacity: 0.33;
	}
	.cdv-art i:last-child :global(.ic) { width: 24px; height: 24px; }

	/* Groups List */
	.cdv-sec-lbl {
		font: 700 16px/1.2 var(--f-body);
		letter-spacing: -0.4px;
		margin: 0 0 9px;
		color: var(--cdv-ink);
	}
	.cdv-groups {
		border: 1px solid var(--cdv-line);
		background: var(--cdv-panel);
		border-radius: 16px;
		overflow: hidden;
	}
	.cdv-group {
		appearance: none;
		display: flex;
		align-items: center;
		gap: 12px;
		text-align: left;
		width: 100%;
		padding: 13px 12px;
		border: 0;
		background: transparent;
		color: var(--cdv-ink);
		min-height: 65px;
		cursor: pointer;
	}
	.cdv-group + .cdv-group { border-top: 1px solid #332a32; }
	.cdv-gic {
		display: grid;
		place-items: center;
		width: 35px;
		height: 37px;
		flex: none;
		border-radius: 10px;
		background: color-mix(in srgb, var(--accent) 11%, var(--cdv-panel));
		color: var(--accent);
	}
	.cdv-gcopy { min-width: 0; flex: 1; display: grid; gap: 2px; }
	.cdv-gcopy b { font-size: 14px; letter-spacing: -0.2px; }
	.cdv-gcopy small { color: var(--cdv-muted); font-size: 12px; line-height: 1.45; }
	.cdv-group > :global(.ic) { width: 15px; height: 15px; color: #a394a0; flex: none; }

	/* More -> Activity Row */
	.cdv-act-row { margin-top: 20px; }
	.cdv-act-row h3 {
		margin: 0 0 8px 3px;
		color: var(--cdv-muted);
		font: 700 11px/1.3 var(--f-body);
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.cdv-act-row button {
		appearance: none;
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 54px;
		padding: 8px 12px;
		border: 1px solid var(--cdv-line);
		border-radius: 16px;
		background: var(--cdv-panel);
		color: var(--cdv-ink);
		text-align: left;
		cursor: pointer;
	}
	.cdv-clock {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 11px;
		background: rgba(167, 156, 176, 0.18);
		color: #a79cb0;
	}
	.cdv-clock :global(.ic) { width: 17px; height: 17px; }
	.cdv-act-row small { margin-left: auto; color: var(--cdv-muted); font-size: 13px; }
	.cdv-act-row button > :global(.ic) { width: 15px; height: 15px; color: var(--cdv-muted); }

	/* Bottom Sheet Dialog */
	.cdv-scrim {
		position: fixed;
		inset: 0;
		z-index: 95;
		background: rgba(13, 8, 13, 0.82);
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.cdv-sheet {
		width: min(420px, 100%);
		max-height: 82svh;
		overflow-y: auto;
		background: #1c171c;
		color: #f4eef2;
		border-top: 1px solid #594954;
		border-radius: 23px 23px 0 0;
		padding: 10px 17px calc(22px + env(safe-area-inset-bottom, 0px));
	}
	.cdv-handle {
		width: 34px;
		height: 4px;
		border-radius: 6px;
		background: #695962;
		margin: 0 auto 10px;
	}
	.cdv-sh-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 14px;
	}
	.cdv-sh-head h2 {
		margin: 0;
		font: 400 28px/1.12 var(--f-serif, Georgia, serif);
		letter-spacing: -0.8px;
	}
	.cdv-findbox {
		display: flex;
		align-items: center;
		gap: 8px;
		background: #110d11;
		border: 1px solid #3b303a;
		border-radius: 11px;
		margin-bottom: 12px;
		padding: 0 10px;
	}
	.cdv-findbox input {
		min-width: 0;
		flex: 1;
		width: 100%;
		border: 0;
		background: transparent;
		color: #f4eef2;
		font-size: 16px;
		padding: 12px 0;
	}
	.cdv-results button {
		appearance: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		min-height: 52px;
		text-align: left;
		padding: 9px 0;
		background: none;
		border: 0;
		border-top: 1px solid #3b303a;
		color: #f4eef2;
		cursor: pointer;
	}
	.cdv-results b,
	.cdv-results small { display: block; }
	.cdv-results b { font-size: 14px; }
	.cdv-results small,
	.cdv-empty { color: #b2a6af; font-size: 12px; }
	.cdv-empty { padding: 14px 0; margin: 0; }

	.cdv-held {
		margin-top: 12px;
		padding: 12px 14px;
		border-radius: 12px;
		border: 1px solid rgba(244, 63, 94, 0.32);
		background: rgba(244, 63, 94, 0.08);
		display: grid;
		gap: 6px;
	}
	.cdv-held b { font-size: 13.5px; color: #fda4af; }
	.cdv-held p { margin: 0; font-size: 12.5px; color: var(--cdv-muted); line-height: 1.45; }
	.cdv-reopen { justify-self: start; margin-top: 4px; }
	.cdv-cancel-row {
		margin-top: 6px;
		border-top: 1px solid rgba(244, 63, 94, 0.25) !important;
		color: #fda4af !important;
	}
	.cdv-cancel-row b { color: #fda4af !important; }
</style>
