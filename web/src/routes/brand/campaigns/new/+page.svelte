<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { auth } from '#lib/auth.svelte.ts';
	import { brandHome, loadDashboard } from '#lib/brand.svelte.ts';
	import { campaignBoard, fitFor, loadPools, pools, saveCampaign, sendCampaign } from '#lib/campaigns.svelte.ts';
	import { LANGUAGES } from '#lib/languages.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { KINDS, USAGE, delivText, errMessage, fmt, inr, plural, rel, usageOption } from '#lib/util.ts';
	import type { BrandCreator, BriefDetails, CampaignBrief, CollabType } from '#lib/types.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import BriefEditor from '#lib/components/BriefEditor.svelte';
	import BriefFromLink from '#lib/components/BriefFromLink.svelte';
	import { fillBrief, type BriefDraft } from '#lib/brandAi.ts';
	import CompanyStep from '#lib/components/CompanyStep.svelte';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import Select from '#lib/components/Select.svelte';
	import { autopilots, shortlistFor, type Suggestion } from '#lib/autopilots.svelte.ts';
	import { supabase } from '#lib/supabase.ts';

	// A new campaign: 1 Scope & budget, 2 The brief, 3 Creators & launch ticket.
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const hasCompany = $derived(!!acc?.brand || !!acc?.companies?.length || !!acc?.brands?.length || !!acc?.profile);
	let step = $state<1 | 2 | 3>(1);
	let draftId = $state<string | null>(page.url.searchParams.get('id'));
	let name = $state('');
	let type = $state<CollabType>('paid');
	let qty = $state<Record<string, number>>({ Reel: 1 });
	let askQuote = $state(false);
	let fee = $state('');
	let budget = $state('');
	let product = $state('');
	let productValue = $state('');
	let barterKind = $state<'product' | 'experience'>('product');
	let preferred = $state('');
	let usage = $state('Organic only');
	let langs = $state<string[]>([]);
	let brief = $state('');
	let briefDetails = $state<BriefDetails>({});
	let poolId = $state(page.url.searchParams.get('pool') ?? '');
	let picked = $state<Record<string, boolean>>({});
	let busy = $state(false);
	let err = $state('');
	function fromLink(d: BriefDraft) {
		if (!name.trim() && d.product) name = d.product;
		if (!brief.trim()) brief = d.brief;
		if (type !== 'paid' && !product.trim()) product = d.product;
		if (type !== 'paid' && !productValue && d.price) productValue = String(d.price);
		briefDetails = fillBrief(briefDetails, d);
	}

	onMount(async () => {
		loadPools().catch(() => {});
		if (!autopilots.settings) supabase.rpc('autopilots_get').then(({ data }) => data && (autopilots.settings = data as never));
		if (!brandHome.dash) loadDashboard();
		if (draftId) {
			const b = await campaignBoard(draftId).catch(() => null);
			if (b?.campaign.status === 'sent') return goto(`/brand/campaigns/${draftId}`, { replaceState: true });
			if (b) {
				const p = b.campaign.brief;
				name = b.campaign.name;
				poolId = b.campaign.pool_id ?? poolId;
				type = (p.type as CollabType) ?? 'paid';
				qty = Object.fromEntries((p.deliverables ?? []).map((d) => [d.kind, d.qty]));
				fee = p.fee ? String(p.fee) : '';
				askQuote = !p.fee;
				budget = b.campaign.budget_total ? String(b.campaign.budget_total) : '';
				product = p.product ?? '';
				productValue = p.product_value ? String(p.product_value) : '';
				barterKind = p.barter_kind ?? 'product';
				preferred = p.preferred_live ?? '';
				usage = p.usage ?? 'Organic only';
				langs = p.content_language ?? [];
				brief = p.brief ?? '';
				briefDetails = p.brief_details ?? {};
			}
		}
	});

	const deliverables = $derived(KINDS.filter((k) => (qty[k] ?? 0) > 0).map((k) => ({ kind: k, qty: qty[k] })));
	const kinds = $derived(deliverables.map((d) => d.kind));
	const payload = $derived<CampaignBrief>({
		type,
		deliverables,
		fee: type === 'barter' || askQuote ? 0 : Number(fee) || 0,
		product: type === 'paid' ? '' : product.trim(),
		product_value: type === 'paid' ? 0 : Number(productValue) || 0,
		barter_kind: type === 'paid' ? 'product' : barterKind,
		content_language: langs,
		preferred_live: preferred || null,
		usage,
		brief: brief.trim(),
		brief_details: briefDetails
	});
	const feeNum = $derived(type === 'barter' || askQuote ? 0 : Number(fee) || 0);
	const budgetNum = $derived(Number(budget) || 0);
	const paySummary = $derived(type === 'barter' ? 'Barter' : askQuote ? 'Creator quotes' : feeNum > 0 ? `${inr(feeNum)} / creator` : 'Set budget');
	const budgetFitCount = $derived(budgetNum > 0 && feeNum > 0 ? Math.max(1, Math.floor(budgetNum / feeNum)) : 0);

	function wantProblem() {
		if (!name.trim()) return 'Give the campaign a name.';
		if (!deliverables.length) return 'Choose at least one piece of content.';
		if (type !== 'barter' && !askQuote && !(Number(fee) > 0)) return 'Pick a budget per creator, or ask each creator for a quote.';
		if (type !== 'paid' && !product.trim()) return barterKind === 'experience' ? 'Say what you are offering (the stay, meal or event).' : 'Say which product you will send.';
		return '';
	}
	function next() {
		err = wantProblem();
		if (!err) step = 2;
	}
	function nextBrief() {
		err = brief.trim() ? '' : 'Add a short brief: what the content is about.';
		if (!err) {
			step = 3;
			suggest();
		}
	}
	function jumpStep(target: 1 | 2 | 3) {
		err = '';
		if (target === 1) {
			step = 1;
			return;
		}
		const p1 = wantProblem();
		if (p1) {
			step = 1;
			err = p1;
			return;
		}
		if (target === 2) {
			step = 2;
			return;
		}
		if (!brief.trim()) {
			step = 2;
			err = 'Add a short brief: what the content is about.';
			return;
		}
		step = 3;
		suggest();
	}

	const TITLES = { 1: ['What do you', 'want?'], 2: ['The', 'brief'], 3: ['Who gets', 'it?'] } as const;
	const SUBS = { 1: 'Scope & Budget', 2: 'Creative Direction', 3: 'Roster & Launch' } as const;
	const addOne = (k: string) => (qty[k] = Math.min(10, (qty[k] ?? 0) + 1));
	const BUDGETS = [10000, 25000, 50000];
	let otherFee = $state(false);
	const pickFee = (v: number) => ((askQuote = false), (otherFee = false), (fee = String(v)));

	let sugs = $state<Suggestion[]>([]);
	async function suggest() {
		const st = autopilots.settings;
		if (st?.shortlist === 'off') return (sugs = []);
		sugs = await shortlistFor(null, payload, st?.shortlist_max ?? 8).catch(() => []);
	}

	const pool = $derived(pools.list.find((p) => p.id === poolId) ?? null);
	type Pick = { key: string; creator: BrandCreator | null; handle: string; from: string; score?: number; why?: string[] };
	const options = $derived.by<Pick[]>(() => {
		const out: Pick[] = [];
		const seen = new Set<number>();
		for (const m of pool?.members ?? []) {
			if (m.creator) seen.add(m.creator.id);
			out.push({ key: m.creator ? `c${m.creator.id}` : `h${m.handle}`, creator: m.creator, handle: m.handle, from: pool!.name });
		}
		for (const c of brandHome.dash?.creators ?? []) if (!seen.has(c.id)) out.push({ key: `c${c.id}`, creator: c, handle: '', from: 'Your creators' });
		for (const c of sugs) if (!out.some((o) => o.creator?.id === c.id)) out.push({ key: `c${c.id}`, creator: c, handle: '', from: 'Suggested', score: c.score, why: c.why });
		return out;
	});
	let tickedFor = '';
	$effect(() => {
		const k = poolId + ':' + options.length;
		if (tickedFor === k || !options.length) return;
		tickedFor = k;
		const nextPicked: Record<string, boolean> = {};
		for (const o of options)
			nextPicked[o.key] = o.from === 'Suggested' ? autopilots.settings?.shortlist === 'auto' : o.from !== 'Your creators' && (!o.creator || fitFor(o.creator, kinds).ok);
		picked = nextPicked;
	});
	const chosen = $derived(options.filter((o) => picked[o.key]));
	const toSend = $derived(chosen.filter((o) => o.creator && fitFor(o.creator, kinds).ok));
	const toInvite = $derived(chosen.filter((o) => !o.creator));

	async function send() {
		err = '';
		if (!toSend.length && !toInvite.length) return (err = 'Pick at least one creator.');
		busy = true;
		try {
			const id = await saveCampaign({ id: draftId, name: name.trim(), pool_id: poolId || null, brief: payload, budget_total: Number(budget) || 0 });
			draftId = id;
			const board = await sendCampaign(id, toSend.map((o) => o.creator!.id), toInvite.map((o) => o.handle));
			const failed = board.rows.filter((r) => r.status === 'failed');
			const sent = board.rows.filter((r) => r.status === 'sent').length;
			toast(failed.length ? `Sent to ${sent}. ${failed.length} couldn't be sent: see the board.` : `Sent to ${sent} creator${sent === 1 ? '' : 's'}`, failed.length ? 'alert' : 'check');
			goto(`/brand/campaigns/${id}`, { replaceState: true });
		} catch (e) {
			err = errMessage(e);
		} finally {
			busy = false;
		}
	}
	const TYPES: { value: CollabType; label: string; sub: string }[] = [
		{ value: 'paid', label: 'Paid', sub: 'Cash fee' },
		{ value: 'hybrid', label: 'Paid + product', sub: 'Fee & gift' },
		{ value: 'barter', label: 'Barter', sub: 'Product / stay' }
	];
	const STEPS: { n: 1 | 2 | 3; num: string; label: string }[] = [
		{ n: 1, num: '01', label: 'Scope' },
		{ n: 2, num: '02', label: 'Brief' },
		{ n: 3, num: '03', label: 'Creators' }
	];
</script>

<svelte:head><title>New campaign · Miracle</title></svelte:head>

<a class="back" href="/brand/campaigns">Campaigns</a>

{#if acc && !hasCompany}
	<header class="ph rv"><div><div class="eb">First</div><h1>About your <em>brand</em></h1><p>Campaigns are sent as your company.</p></div></header>
	<CompanyStep />
{:else}
	<div class="nc-shell">
		<header class="ph rv">
			<div>
				<div class="eb">New campaign</div>
				<h1>{name.trim() || 'Untitled'} <em>campaign</em></h1>
			</div>
		</header>

		<!-- Interactive 3-Step Cockpit Stepper -->
		<nav class="nc-stepper" aria-label="Campaign steps">
			{#each STEPS as s (s.n)}
				<button type="button" class="nc-st" class:on={step === s.n} class:done={s.n < step} onclick={() => jumpStep(s.n)}>
					<span class="nc-st-bar"><i></i></span>
					<span class="nc-st-meta"><span>{s.num}</span><span>{s.label}</span></span>
				</button>
			{/each}
		</nav>

		<!-- Live Summary Strip -->
		<div class="nc-live-strip" aria-live="polite">
			<span class="nc-ls accent"><b>{TYPES.find((t) => t.value === type)?.label}</b></span>
			<span class="nc-ls"><b>{delivText(deliverables) || 'Pick content'}</b></span>
			<span class="nc-ls"><b>{paySummary}</b></span>
		</div>

		<div class="nc-q">
			<span class="nc-eb">Step {step} of 3 · {SUBS[step]}</span>
			<h2>{TITLES[step][0]} <em>{TITLES[step][1]}</em></h2>
		</div>

		{#if err}<div class="err-box" role="alert">{err}</div>{/if}

		{#if step === 1}
			<section class="nc-stack rv">
				<BriefFromLink category={acc?.brand?.category ?? ''} deal={type} deliverables={delivText(deliverables)} onfill={fromLink} />

				<div class="nc-card">
					<div class="nc-card-h">
						<label class="nc-lbl" for="nc-name">Campaign name</label>
						<small class="nc-sub">{name.length}/80</small>
					</div>
					<input class="inp nc-inp" id="nc-name" bind:value={name} maxlength="80" placeholder="e.g. Diwali glow edit" />
				</div>

				<div class="nc-card">
					<div class="nc-card-h">
						<span class="nc-lbl">How you pay</span>
						<small class="nc-sub">Deal model</small>
					</div>
					<div class="nc-pay-grid">
						{#each TYPES as t (t.value)}
							<button type="button" class="nc-pay-opt" class:on={type === t.value} onclick={() => (type = t.value)}>
								<b>{t.label}</b>
								<small>{t.sub}</small>
							</button>
						{/each}
					</div>
				</div>

				{#if type !== 'paid'}
					<div class="nc-card">
						<div class="nc-card-h">
							<span class="nc-lbl">What you offer</span>
							<small class="nc-sub">Included for each creator</small>
						</div>
						<div class="nc-pay-grid nc-pay-2">
							<button type="button" class="nc-pay-opt" class:on={barterKind === 'product'} onclick={() => (barterKind = 'product')}>
								<b>A product</b>
								<small>Shipped item</small>
							</button>
							<button type="button" class="nc-pay-opt" class:on={barterKind === 'experience'} onclick={() => (barterKind = 'experience')}>
								<b>An experience</b>
								<small>Stay, meal, event</small>
							</button>
						</div>
						<div class="nc-2">
							<div class="nc-field">
								<label class="nc-lbl" for="nc-prod">{barterKind === 'experience' ? 'What you offer' : 'Product you send'}</label>
								<input class="inp nc-inp" id="nc-prod" bind:value={product} placeholder={barterKind === 'experience' ? 'A stay, a meal, an event' : 'e.g. Diwali glow kit'} />
							</div>
							<div class="nc-field">
								<label class="nc-lbl" for="nc-pv">Its value (₹)</label>
								<input class="inp nc-inp" id="nc-pv" inputmode="numeric" bind:value={productValue} placeholder="e.g. 2400" />
							</div>
						</div>
					</div>
				{/if}

				<div class="nc-card">
					<div class="nc-card-h">
						<span class="nc-lbl">From each creator</span>
						<small class="nc-sub">Tap again to add +1</small>
					</div>
					<div class="nc-chips">
						{#each KINDS as k (k)}
							{#if (qty[k] ?? 0) > 0}
								<span class="nc-chip on"><button type="button" class="nc-c-add" onclick={() => addOne(k)} aria-label="One more {k}">{k}<i>{qty[k]}</i></button><button type="button" class="nc-c-x" onclick={() => (qty[k] = 0)} aria-label="No {k}">×</button></span>
							{:else}
								<button type="button" class="nc-chip" onclick={() => addOne(k)}>+ {k}</button>
							{/if}
						{/each}
					</div>
				</div>

				{#if type !== 'barter'}
					<div class="nc-card">
						<div class="nc-card-h">
							<span class="nc-lbl">Budget per creator</span>
							<small class="nc-sub">Select or ask</small>
						</div>
						<div class="nc-chips">
							{#each BUDGETS as v (v)}<button type="button" class="nc-chip" class:sel={!askQuote && !otherFee && Number(fee) === v} onclick={() => pickFee(v)}>{inr(v).replace(',000', 'k').replace(/,00,000$/, 'L')}</button>{/each}
							<button type="button" class="nc-chip" class:sel={!askQuote && (otherFee || (!!fee && !BUDGETS.includes(Number(fee))))} onclick={() => ((askQuote = false), (otherFee = true))}>Other</button>
							<button type="button" class="nc-chip" class:sel={askQuote} onclick={() => ((askQuote = true), (otherFee = false))}>Ask for a quote</button>
						</div>
						{#if !askQuote && (otherFee || (!!fee && !BUDGETS.includes(Number(fee))))}
							<input class="inp nc-inp" id="nc-fee" inputmode="numeric" bind:value={fee} placeholder="Any amount, e.g. 18000" aria-label="Budget per creator (₹)" />
						{/if}
						{#if askQuote}<p class="nc-hint">Each creator replies with their own price.</p>{/if}

						<div class="nc-sep-field">
							<label class="nc-lbl" for="nc-budget">Total budget (₹, optional)</label>
							<input class="inp nc-inp" id="nc-budget" inputmode="numeric" bind:value={budget} placeholder="e.g. 120000" />
							<p class="nc-hint">
								{#if budgetFitCount > 0}
									Fits <b class="ok">~{budgetFitCount} creator{budgetFitCount === 1 ? '' : 's'}</b> at {inr(feeNum)} each. Only you see this.
								{:else}
									Only you see it. The board shows how much of it is used.
								{/if}
							</p>
						</div>
					</div>
				{/if}

				<div class="nc-dock">
					<div class="nc-dock-meta"><span>Step 1 of 3 · Scope</span><b>{paySummary}</b></div>
					<div class="nc-go"><button type="button" class="nc-neo nc-grad" onclick={next}>Next: the brief →</button></div>
				</div>
			</section>
		{:else if step === 2}
			<section class="nc-stack rv">
				<div class="nc-card">
					<div class="nc-2">
						<div class="nc-field">
							<label class="nc-lbl" for="nc-date">Go live by</label>
							<DatePicker id="nc-date" min={rel(3)} bind:value={preferred} placeholder="No preference" />
						</div>
						<div class="nc-field">
							<label class="nc-lbl" for="nc-usage">Usage rights</label>
							<Select id="nc-usage" bind:value={usage} options={USAGE.map((u) => ({ value: u, label: usageOption(u) }))} />
						</div>
					</div>
				</div>

				<div class="nc-card">
					<div class="nc-card-h">
						<span class="nc-lbl">Language (optional)</span>
						<small class="nc-sub">Auto-matched to creators</small>
					</div>
					<div class="nc-chips">
						{#each LANGUAGES as l (l)}
							<button type="button" class="nc-chip" class:sel={langs.includes(l)} onclick={() => (langs = langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l])}>{l}</button>
						{/each}
					</div>
					<p class="nc-hint">Each creator gets only the languages they create in.</p>
				</div>

				<div class="nc-card">
					<div class="nc-card-h">
						<label class="nc-lbl" for="nc-brief">The brief</label>
						<small class="nc-sub">{brief.length}/2000</small>
					</div>
					<textarea class="inp nc-ta" id="nc-brief" rows="4" bind:value={brief} maxlength="2000" placeholder="What should the content show? What's launching?"></textarea>
				</div>

				<div class="nc-card">
					<BriefEditor bind:value={briefDetails} idp="nc" category={acc?.brand?.category ?? ''} />
				</div>

				<div class="nc-dock">
					<div class="nc-dock-meta"><span>Step 2 of 3 · Brief</span><b>{usageOption(usage)}</b></div>
					<div class="nc-go">
						<button type="button" class="nc-neo nc-ghost" onclick={() => (step = 1)}>Back</button>
						<button type="button" class="nc-neo nc-grad" onclick={nextBrief}>Next: who gets it →</button>
					</div>
				</div>
			</section>
		{:else}
			<section class="nc-stack rv">
				<div class="nc-card">
					<div class="nc-card-h">
						<label class="nc-lbl" for="nc-pool">Creator pool</label>
						<small class="nc-sub">Pre-selects ready creators</small>
					</div>
					<Select id="nc-pool" bind:value={poolId} options={[{ value: '', label: 'No pool: your creators only' }, ...pools.list.map((p) => ({ value: p.id, label: `${p.name} · ${p.members.length}` }))]} />
					<p class="nc-hint">Make and fill pools in <a href="/brand/creators?tab=pools">Creators</a>.</p>
				</div>

				{#if options.some((o) => o.from === 'Suggested')}
					<div class="nc-sug">
						<div class="nc-sug-h">
							<span class="nc-tag">✦ Shortlist</span>
							<b>Suggested for this brief</b>
							<button type="button" class="nc-link" onclick={() => { for (const o of options) if (o.from === 'Suggested') picked[o.key] = true; }}>Tick all</button>
						</div>
						{#each options.filter((o) => o.from === 'Suggested') as o (o.key)}
							<label class="nc-row" class:checked={!!picked[o.key]}>
								<input type="checkbox" bind:checked={picked[o.key]} />
								<Avatar name={o.creator!.name} src={o.creator!.photo} size="36px" />
								<span class="nc-who"><b>{o.creator!.name}</b><small>{[o.creator!.niche?.split(',')[0]?.trim(), o.creator!.city, ...(o.why ?? [])].filter(Boolean).join(' · ')}</small></span>
								<span class="nc-score" class:hi={(o.score ?? 0) >= 75}><b>{o.score}</b><small>fit</small></span>
							</label>
						{/each}
					</div>
				{/if}

				<div class="nc-card">
					<div class="nc-card-h">
						<span class="nc-lbl">Your roster &amp; pool</span>
						<small class="nc-sub">Private 1-on-1 requests</small>
					</div>
					{#if !options.some((o) => o.from !== 'Suggested')}
						<p class="nc-none">No creators yet. Add some to a pool from Discover, or invite them by their Instagram handle.</p>
					{:else}
						<div class="nc-pick">
							{#each options.filter((o) => o.from !== 'Suggested') as o (o.key)}
								{@const fit = fitFor(o.creator, kinds)}
								<label class="nc-row" class:checked={!!picked[o.key]} class:off={o.creator && !fit.ok}>
									<input type="checkbox" bind:checked={picked[o.key]} disabled={!!o.creator && !fit.ok} />
									{#if o.creator}<Avatar name={o.creator.name} src={o.creator.photo} size="36px" />{:else}<span class="nc-at" aria-hidden="true">@</span>{/if}
									<span class="nc-who"><b>{o.creator ? o.creator.name : `@${o.handle}`}</b><small>{o.from}</small></span>
									<small class="nc-fit" class:ok={fit.text === 'Ready'} class:warn={!o.creator || fit.text !== 'Ready'}>{o.creator ? fit.text : 'Invite'}</small>
								</label>
							{/each}
						</div>
					{/if}
					<p class="nc-hint">Each creator gets their own request and replies with their own quote. Nobody sees who else was asked or what others charge.</p>
				</div>

				<!-- Perforated NeoPOP Launch Ticket -->
				<section class="nc-tk rv" aria-label="Campaign launch summary">
					<div class="nc-tk-h">
						<span class="nc-eb">{name.trim() || 'Your campaign'}</span>
						<b>{toSend.length + toInvite.length} creator{toSend.length + toInvite.length === 1 ? '' : 's'}{type !== 'barter' && !askQuote && feeNum ? ` · ${inr(feeNum * (toSend.length + toInvite.length))}` : ''}</b>
					</div>
					<i class="nc-tk-cut" aria-hidden="true"></i>
					<dl>
						<dt>Each creator</dt><dd>{delivText(deliverables)}{type !== 'barter' ? (askQuote ? ' · they quote' : ` · ${inr(feeNum)}`) : ' · barter'}</dd>
						{#if type !== 'paid'}<dt>{barterKind === 'experience' ? 'Experience' : 'Product'}</dt><dd>{product}{Number(productValue) ? ` (${inr(Number(productValue))})` : ''}</dd>{/if}
						<dt>Go live</dt><dd>{preferred ? `By ${fmt(preferred)}` : 'No preference'}</dd>
						<dt>Usage</dt><dd>{usageOption(usage)}</dd>
						{#if langs.length}<dt>Language</dt><dd>{langs.join(' or ')}</dd>{/if}
					</dl>
					<button type="button" class="nc-link nc-tk-edit" onclick={() => (step = 2)}>Edit the brief</button>
				</section>

				<div class="nc-dock">
					<div class="nc-dock-meta">
						<span>{toSend.length} {plural('request', toSend.length)} now{toInvite.length ? ` · ${toInvite.length} when they join` : ''}</span>
						<b>{feeNum * (toSend.length + toInvite.length) ? inr(feeNum * (toSend.length + toInvite.length)) : paySummary}</b>
					</div>
					<div class="nc-go">
						<button type="button" class="nc-neo nc-ghost" onclick={() => (step = 2)}>Back</button>
						<button type="button" class="nc-neo nc-grad nc-big" onclick={send} disabled={busy}>{busy ? 'Sending…' : `✦ Send to ${toSend.length + toInvite.length} creator${toSend.length + toInvite.length === 1 ? '' : 's'}`}</button>
					</div>
				</div>
			</section>
		{/if}
	</div>
{/if}

<style>
	.nc-shell { display: flex; flex-direction: column; gap: 12px; padding-bottom: 24px; }

	/* Interactive 3-step cockpit stepper */
	.nc-stepper { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; margin: 2px 0 0; }
	.nc-st { border: 0; background: none; padding: 0; display: flex; flex-direction: column; gap: 5px; text-align: left; cursor: pointer; }
	.nc-st-bar { height: 4px; border-radius: 99px; background: var(--line); overflow: hidden; }
	.nc-st-bar i { display: block; height: 100%; width: 0; border-radius: 99px; background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3)); transition: width .3s ease; }
	.nc-st.on .nc-st-bar i, .nc-st.done .nc-st-bar i { width: 100%; }
	.nc-st-meta { display: flex; align-items: center; gap: 5px; font: 700 10px/1 var(--f-mono, ui-monospace, monospace); letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); }
	.nc-st.on .nc-st-meta { color: var(--ink); }
	.nc-st.done .nc-st-meta { color: var(--ok); }

	/* Live summary strip */
	.nc-live-strip { display: flex; align-items: center; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
	.nc-live-strip::-webkit-scrollbar { display: none; }
	.nc-ls { flex: none; display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 99px; background: var(--surface); border: 1px solid var(--line); font: 600 11px/1.1 var(--f-body, inherit); color: var(--ink-2); }
	.nc-ls b { color: var(--ink); font-weight: 700; }
	.nc-ls.accent { border-color: color-mix(in oklab, var(--g2) 45%, transparent); background: color-mix(in oklab, var(--g2) 13%, var(--surface)); }

	.nc-q { display: grid; gap: 3px; margin: 2px 0 2px; }
	.nc-eb { font: 700 10px/1 var(--f-mono, ui-monospace, monospace); letter-spacing: .14em; text-transform: uppercase; color: var(--g3); }
	.nc-q h2 { margin: 0; font: 400 34px/1.03 var(--f-serif, Georgia, serif); letter-spacing: -.015em; }
	.nc-q h2 em { font-style: italic; background: linear-gradient(100deg, var(--g1), var(--g2) 55%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: 3px; }

	.nc-stack { display: flex; flex-direction: column; gap: 13px; }

	/* Modular Form Cards */
	.nc-card { display: flex; flex-direction: column; gap: 10px; padding: 15px; border-radius: 20px; border: 1px solid var(--line); background: var(--surface); }
	.nc-card-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
	.nc-lbl { display: block; font: 800 10.5px/1 var(--f-mono, ui-monospace, monospace); letter-spacing: .13em; text-transform: uppercase; color: var(--ink-3); }
	.nc-sub { font-size: 11px; color: var(--ink-3); }
	.nc-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
	.nc-sep-field { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px dashed var(--line); }
	.nc-inp { width: 100%; height: 42px !important; padding: 0 12px !important; border-radius: 12px !important; border: 1px solid var(--line-strong) !important; background: var(--bg) !important; color: var(--ink); font-size: 14px; }
	.nc-ta { width: 100%; min-height: 104px; padding: 10px 12px !important; border-radius: 12px !important; border: 1px solid var(--line-strong) !important; background: var(--bg) !important; color: var(--ink); font-size: 14px; line-height: 1.45; }
	.nc-hint { margin: 0; font-size: 11.5px; line-height: 1.4; color: var(--ink-3); }
	.nc-hint .ok { color: var(--ok); }
	.nc-hint a { color: var(--g2); }
	.nc-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }

	/* 3-Column NeoPOP Payment Switcher */
	.nc-pay-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
	.nc-pay-grid.nc-pay-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.nc-pay-opt { padding: 10px 6px; border-radius: 0; border: 1px solid var(--line-strong); background: var(--bg); color: var(--ink-2); display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; cursor: pointer; transition: all .14s; }
	.nc-pay-opt b { font-size: 11.5px; font-weight: 700; color: inherit; }
	.nc-pay-opt small { font-size: 9.5px; color: var(--ink-3); }
	.nc-pay-opt.on { background: var(--ink); color: var(--bg); border-color: var(--ink); box-shadow: 2.5px 2.5px 0 var(--g2); }
	.nc-pay-opt.on small { color: color-mix(in oklab, var(--bg) 65%, transparent); }

	/* Deliverable, Budget & Language Chips */
	.nc-chips { display: flex; flex-wrap: wrap; gap: 7px; }
	.nc-chip { height: 36px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border: 1px dashed var(--line-strong); border-radius: 999px; background: var(--bg); color: var(--ink-2); font: 600 12.5px/1 var(--f-body, inherit); cursor: pointer; transition: all .14s; }
	.nc-chip.sel { border: 1px solid var(--ink); border-radius: 0; background: var(--ink); color: var(--bg); box-shadow: 2px 2px 0 var(--g2); }
	.nc-chip.on { padding: 0; border: 1.5px solid var(--g2); background: color-mix(in oklab, var(--g2) 14%, var(--bg)); color: var(--ink); }
	.nc-chip.on button { height: 100%; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
	.nc-c-add { display: inline-flex; align-items: center; gap: 7px; padding: 0 4px 0 12px; font-weight: 700; }
	.nc-c-add i { min-width: 20px; height: 20px; display: grid; place-items: center; border-radius: 999px; background: linear-gradient(135deg, var(--g2), var(--g3)); color: #160a12; font-style: normal; font: 800 11px/1 var(--f-mono, ui-monospace, monospace); }
	.nc-c-x { padding: 0 11px 0 5px; font-size: 15px !important; color: var(--ink-3) !important; }

	/* Step 3: Shortlist Vault & Creator Rows */
	.nc-sug { display: grid; gap: 8px; padding: 14px; border-radius: 20px; border: 1px solid color-mix(in oklab, var(--g1) 42%, var(--line)); background: radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--g1) 15%, transparent), transparent 60%), var(--surface); }
	.nc-sug-h { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	.nc-sug-h b { flex: 1; font-size: 13.5px; }
	.nc-tag { padding: 3px 8px; border-radius: 99px; background: color-mix(in oklab, var(--g2) 18%, transparent); color: #ff9ec0; font: 800 9.5px/1 var(--f-mono, ui-monospace, monospace); letter-spacing: .1em; text-transform: uppercase; }
	.nc-pick { display: grid; gap: 7px; }
	.nc-row { display: flex; align-items: center; gap: 10px; min-height: 54px; padding: 9px 10px; border-radius: 14px; border: 1px solid var(--line); background: var(--bg); cursor: pointer; transition: border-color .14s, background .14s; }
	.nc-row.checked { border-color: color-mix(in oklab, var(--g2) 55%, transparent); background: color-mix(in oklab, var(--g2) 8%, var(--bg)); }
	.nc-row.off { opacity: 0.55; cursor: default; }
	.nc-row input { width: 18px; height: 18px; accent-color: var(--g2); flex: none; }
	.nc-at { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 50%; border: 1px solid var(--line-strong); color: var(--ink-3); }
	.nc-who { flex: 1; min-width: 0; display: grid; gap: 2px; }
	.nc-who b { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.nc-who small { font-size: 11px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.nc-score { display: grid; justify-items: end; line-height: 1; flex: none; }
	.nc-score b { font: 400 23px/1 var(--f-serif, Georgia, serif); color: var(--g3); }
	.nc-score.hi b { color: var(--ok); }
	.nc-score small { font: 700 8.5px/1 var(--f-mono, ui-monospace, monospace); text-transform: uppercase; color: var(--ink-3); }
	.nc-fit { padding: 3px 8px; border-radius: 99px; font: 700 10px/1 var(--f-mono, ui-monospace, monospace); flex: none; }
	.nc-fit.ok { background: color-mix(in oklab, var(--ok) 14%, transparent); color: var(--ok); }
	.nc-fit.warn { background: color-mix(in oklab, var(--g3) 14%, transparent); color: var(--g3); }
	.nc-none { margin: 0; color: var(--ink-3); font-size: 13px; }
	.nc-link { border: 0; padding: 0; background: none; color: var(--g3); font: 700 11.5px/1 var(--f-body, inherit); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }

	/* Perforated NeoPOP Launch Ticket */
	.nc-tk { position: relative; display: flex; flex-direction: column; overflow: hidden; border-radius: 20px; border: 1px solid var(--line-strong); background: var(--surface); box-shadow: 4px 4px 0 var(--line); }
	.nc-tk-h { display: grid; gap: 3px; padding: 14px 16px 12px; background: linear-gradient(135deg, rgba(156, 123, 255, 0.2), rgba(242, 90, 144, 0.16) 60%, rgba(255, 174, 107, 0.1)); }
	.nc-tk-h b { font: 400 27px/1.08 var(--f-serif, Georgia, serif); color: var(--ink); }
	.nc-tk-cut { position: relative; display: block; height: 0; margin: 0 14px; border-top: 2px dashed var(--line-strong); }
	.nc-tk-cut::before, .nc-tk-cut::after { content: ''; position: absolute; top: -9px; width: 16px; height: 16px; border-radius: 50%; background: var(--bg); border: 1px solid var(--line-strong); }
	.nc-tk-cut::before { left: -23px; }
	.nc-tk-cut::after { right: -23px; }
	.nc-tk dl { display: grid; grid-template-columns: auto 1fr; gap: 7px 14px; margin: 0; padding: 12px 16px 8px; font-size: 12.5px; }
	.nc-tk dt { color: var(--ink-3); }
	.nc-tk dd { margin: 0; text-align: right; font-weight: 600; color: var(--ink); }
	.nc-tk-edit { align-self: flex-start; margin: 4px 16px 14px; color: var(--g2); }

	/* Bottom Action Dock */
	.nc-dock { display: flex; flex-direction: column; gap: 9px; padding: 12px 14px; border-radius: 18px; border: 1px solid var(--line); background: var(--surface); }
	.nc-dock-meta { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: var(--ink-2); }
	.nc-dock-meta b { color: var(--g3); font-family: var(--f-mono, ui-monospace, monospace); }
	.nc-go { display: flex; gap: 9px; }
	.nc-neo { height: 48px; padding: 0 20px; border: 0; border-radius: 0; cursor: pointer; font: 800 12px/1 var(--f-body, inherit); letter-spacing: .12em; text-transform: uppercase; transition: transform .1s, box-shadow .1s; flex: 1; }
	.nc-big { height: 50px; }
	.nc-grad { background: var(--grad); color: #fff; box-shadow: 4px 4px 0 #5b3b99; }
	.nc-ghost { flex: 0 0 96px; background: var(--bg); color: var(--ink); border: 1px solid var(--line-strong); box-shadow: 3px 3px 0 var(--line); }
	.nc-neo:active:not(:disabled) { transform: translate(3px, 3px); box-shadow: none; }
	.nc-neo:disabled { opacity: 0.55; cursor: default; }

	@media (max-width: 760px) {
		.nc-2 { grid-template-columns: minmax(0, 1fr); }
	}
</style>
