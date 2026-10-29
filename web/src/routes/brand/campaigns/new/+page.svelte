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

	// A new campaign: 1 the brief, 2 the creators (from a pool, or ones you work with), 3 review and send.
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
	// Three short steps, like adding a collab from a DM: what you want, the brief, who gets it.
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
	const TITLES = { 1: ['What do you', 'want?'], 2: ['The', 'brief'], 3: ['Who gets', 'it?'] } as const;
	// Content as chips: a tap adds one (up to 10), the cross takes that kind off.
	const addOne = (k: string) => (qty[k] = Math.min(10, (qty[k] ?? 0) + 1));
	// Budget as chips; "Other" opens the box for any amount.
	const BUDGETS = [10000, 25000, 50000];
	let otherFee = $state(false);
	const pickFee = (v: number) => ((askQuote = false), (otherFee = false), (fee = String(v)));
	// The shortlist autopilot: creators who fit this brief (ticked for you on Auto).
	let sugs = $state<Suggestion[]>([]);
	async function suggest() {
		const st = autopilots.settings;
		if (st?.shortlist === 'off') return (sugs = []);
		sugs = await shortlistFor(null, payload, st?.shortlist_max ?? 8).catch(() => []);
	}

	// Step 2: the creators. From the chosen pool, plus everyone you already work with.
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
	// Everyone who can take it is ticked to start with (once per pool).
	let tickedFor = '';
	$effect(() => {
		const k = poolId + ':' + options.length;
		if (tickedFor === k || !options.length) return;
		tickedFor = k;
		const next: Record<string, boolean> = {};
		for (const o of options)
			next[o.key] = o.from === 'Suggested' ? autopilots.settings?.shortlist === 'auto' : o.from !== 'Your creators' && (!o.creator || fitFor(o.creator, kinds).ok);
		picked = next;
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
	const TYPES: { value: CollabType; label: string }[] = [
		{ value: 'paid', label: 'Paid' },
		{ value: 'hybrid', label: 'Paid + product' },
		{ value: 'barter', label: 'Barter' }
	];
</script>

<svelte:head><title>New campaign · Miracle</title></svelte:head>

<a class="back" href="/brand/campaigns">Campaigns</a>

{#if acc && !hasCompany}
	<header class="ph rv"><div><div class="eb">First</div><h1>About your <em>brand</em></h1><p>Campaigns are sent as your company.</p></div></header>
	<CompanyStep />
{:else}
	<header class="ph rv">
		<div>
			<div class="eb">New campaign</div>
			<h1>{name.trim() || 'Untitled'} <em>campaign</em></h1>
		</div>
	</header>
	<!-- A progress line and the step's question, as when adding a collab from a DM. -->
	<div class="nc-prog" role="progressbar" aria-valuemin="1" aria-valuemax="3" aria-valuenow={step} aria-label="Step {step} of 3">{#each [1, 2, 3] as n (n)}<i class:on={n <= step}></i>{/each}</div>
	<div class="nc-q"><span class="nc-eb">Step {step} of 3</span><h2>{TITLES[step][0]} <em>{TITLES[step][1]}</em></h2></div>

	{#if err}<div class="err-box" role="alert">{err}</div>{/if}

	{#if step === 1}
		<section class="nc-f nc-flat rv">
			<BriefFromLink category={acc?.brand?.category ?? ''} deal={type} deliverables={delivText(Object.entries(qty).filter(([, n]) => n > 0).map(([kind, n]) => ({ kind, qty: n })))} onfill={fromLink} />
			<div class="f"><label for="nc-name">Campaign name</label><input class="inp" id="nc-name" bind:value={name} maxlength="80" placeholder="e.g. Diwali glow edit" /></div>
			<div class="f"><span class="lbl">How you pay</span><div class="nc-seg">{#each TYPES as t (t.value)}<button class:on={type === t.value} onclick={() => (type = t.value)}>{t.label}</button>{/each}</div></div>
			<div class="f"><span class="lbl">From each creator</span>
				<div class="nc-chips">
					{#each KINDS as k (k)}
						{#if (qty[k] ?? 0) > 0}
							<span class="nc-chip on"><button class="nc-c-add" onclick={() => addOne(k)} aria-label="One more {k}">{k}<i>{qty[k]}</i></button><button class="nc-c-x" onclick={() => (qty[k] = 0)} aria-label="No {k}">×</button></span>
						{:else}
							<button class="nc-chip" onclick={() => addOne(k)}>+ {k}</button>
						{/if}
					{/each}
				</div>
				<p class="hint">Tap a kind again for one more.</p>
			</div>
			{#if type !== 'barter'}
				<div class="f"><span class="lbl">Budget per creator</span>
					<div class="nc-chips">
						{#each BUDGETS as v (v)}<button class="nc-chip" class:sel={!askQuote && !otherFee && Number(fee) === v} onclick={() => pickFee(v)}>{inr(v).replace(',000', 'k').replace(/,00,000$/, 'L')}</button>{/each}
						<button class="nc-chip" class:sel={!askQuote && (otherFee || (!!fee && !BUDGETS.includes(Number(fee))))} onclick={() => ((askQuote = false), (otherFee = true))}>Other</button>
						<button class="nc-chip" class:sel={askQuote} onclick={() => ((askQuote = true), (otherFee = false))}>Ask for a quote</button>
					</div>
					{#if !askQuote && (otherFee || (!!fee && !BUDGETS.includes(Number(fee))))}<input class="inp" id="nc-fee" inputmode="numeric" bind:value={fee} placeholder="Any amount, e.g. 18000" aria-label="Budget per creator (₹)" />{/if}
					{#if askQuote}<p class="hint">Each creator replies with their own price.</p>{/if}
				</div>
				<div class="f"><label for="nc-budget">Total budget (₹, optional)</label><input class="inp" id="nc-budget" inputmode="numeric" bind:value={budget} placeholder="e.g. 120000" /><p class="hint">Only you see it. The board shows how much of it is used.</p></div>
			{/if}
			{#if type !== 'paid'}
				<div class="f"><div class="nc-seg"><button class:on={barterKind === 'product'} onclick={() => (barterKind = 'product')}>A product</button><button class:on={barterKind === 'experience'} onclick={() => (barterKind = 'experience')}>An experience</button></div></div>
				<div class="nc-2">
					<div class="f"><label for="nc-prod">{barterKind === 'experience' ? 'What you offer' : 'Product you send'}</label><input class="inp" id="nc-prod" bind:value={product} placeholder={barterKind === 'experience' ? 'A stay, a meal, an event' : 'e.g. Diwali glow kit'} /></div>
					<div class="f"><label for="nc-pv">Its value (₹)</label><input class="inp" id="nc-pv" inputmode="numeric" bind:value={productValue} placeholder="e.g. 2400" /></div>
				</div>
			{/if}
			<div class="nc-go"><button class="nc-neo nc-grad" onclick={next}>Next: the brief</button></div>
		</section>
	{:else if step === 2}
		<section class="nc-f nc-flat rv">
			<div class="nc-2">
				<div class="f"><label for="nc-date">Go live by</label><DatePicker id="nc-date" min={rel(3)} bind:value={preferred} placeholder="No preference" /></div>
				<div class="f"><label for="nc-usage">Usage rights</label><Select id="nc-usage" bind:value={usage} options={USAGE.map((u) => ({ value: u, label: usageOption(u) }))} /></div>
			</div>
			<div class="f"><span class="lbl">Language (optional)</span><div class="nc-langs">{#each LANGUAGES as l (l)}<button class:on={langs.includes(l)} onclick={() => (langs = langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l])}>{l}</button>{/each}</div><p class="hint">Each creator gets only the languages they create in.</p></div>
			<div class="f"><label for="nc-brief">The brief</label><textarea id="nc-brief" rows="4" bind:value={brief} maxlength="2000" placeholder="What should the content show? What's launching?"></textarea></div>
			<BriefEditor bind:value={briefDetails} idp="nc" category={acc?.brand?.category ?? ''} />
			<div class="nc-go"><button class="nc-neo nc-ghost" onclick={() => (step = 1)}>Back</button><button class="nc-neo nc-grad" onclick={nextBrief}>Next: who gets it</button></div>
		</section>
	{:else}
		<section class="nc-f nc-flat rv">
			<div class="f"><label for="nc-pool">Pool</label><Select id="nc-pool" bind:value={poolId} options={[{ value: '', label: 'No pool: your creators only' }, ...pools.list.map((p) => ({ value: p.id, label: `${p.name} · ${p.members.length}` }))]} /><p class="hint">Make and fill pools in <a href="/brand/creators?tab=pools">Creators</a>.</p></div>
			{#if options.some((o) => o.from === 'Suggested')}
				<div class="nc-sug">
					<div class="nc-sug-h"><span class="nc-tag">Shortlist</span><b>Suggested for this brief</b><button class="nc-link" onclick={() => { for (const o of options) if (o.from === 'Suggested') picked[o.key] = true; }}>Tick all</button></div>
					{#each options.filter((o) => o.from === 'Suggested') as o (o.key)}
						<label class="nc-row">
							<input type="checkbox" bind:checked={picked[o.key]} />
							<Avatar name={o.creator!.name} src={o.creator!.photo} size="36px" />
							<span class="nc-who"><b>{o.creator!.name}</b><small>{[o.creator!.niche?.split(',')[0]?.trim(), o.creator!.city, ...(o.why ?? [])].filter(Boolean).join(' · ')}</small></span>
							<span class="nc-score" class:hi={(o.score ?? 0) >= 75}><b>{o.score}</b><small>fit</small></span>
						</label>
					{/each}
				</div>
			{/if}
			{#if !options.some((o) => o.from !== 'Suggested')}
				<p class="nc-none">No creators yet. Add some to a pool from Discover, or invite them by their Instagram handle.</p>
			{:else}
				<div class="nc-pick">
					{#each options.filter((o) => o.from !== 'Suggested') as o (o.key)}
						{@const fit = fitFor(o.creator, kinds)}
						<label class="nc-row" class:off={o.creator && !fit.ok}>
							<input type="checkbox" bind:checked={picked[o.key]} disabled={!!o.creator && !fit.ok} />
							{#if o.creator}<Avatar name={o.creator.name} src={o.creator.photo} size="36px" />{:else}<span class="nc-at" aria-hidden="true">@</span>{/if}
							<span class="nc-who"><b>{o.creator ? o.creator.name : `@${o.handle}`}</b><small>{o.from}</small></span>
							<small class="nc-fit" class:ok={fit.text === 'Ready'} class:warn={!o.creator || fit.text !== 'Ready'}>{o.creator ? fit.text : 'Not on Miracle: gets it when they join'}</small>
						</label>
					{/each}
				</div>
			{/if}
			<p class="hint">Each creator gets their own request and replies with their own quote. Nobody sees who else was asked or what others charge.</p>
		</section>
		<!-- What goes out, as one ticket before sending. -->
		<section class="nc-tk rv">
			<div class="nc-tk-h"><span class="nc-eb">{name.trim() || 'Your campaign'}</span><b>{toSend.length + toInvite.length} creator{toSend.length + toInvite.length === 1 ? '' : 's'}{type !== 'barter' && !askQuote && Number(fee) ? ` · ${inr(Number(fee) * (toSend.length + toInvite.length))}` : ''}</b></div>
			<i class="nc-tk-cut" aria-hidden="true"></i>
			<dl>
				<dt>Each creator</dt><dd>{delivText(deliverables)}{type !== 'barter' ? (askQuote ? ' · they quote' : ` · ${inr(Number(fee))}`) : ''}</dd>
				{#if type !== 'paid'}<dt>{barterKind === 'experience' ? 'Experience' : 'Product'}</dt><dd>{product}{Number(productValue) ? ` (${inr(Number(productValue))})` : ''}</dd>{/if}
				<dt>Go live</dt><dd>{preferred ? `By ${fmt(preferred)}` : 'No preference'}</dd>
				<dt>Usage</dt><dd>{usageOption(usage)}</dd>
				{#if langs.length}<dt>Language</dt><dd>{langs.join(' or ')}</dd>{/if}
			</dl>
			<button class="nc-link" onclick={() => (step = 2)}>Edit the brief</button>
		</section>
		<div class="nc-send">
			<span>{toSend.length} {plural('request', toSend.length)} now{toInvite.length ? ` · ${toInvite.length} when they join` : ''}</span>
			<div class="nc-go"><button class="nc-neo nc-ghost" onclick={() => (step = 2)}>Back</button><button class="nc-neo nc-grad nc-big" onclick={send} disabled={busy}>{busy ? 'Sending…' : `Send to ${toSend.length + toInvite.length} creator${toSend.length + toInvite.length === 1 ? '' : 's'}`}</button></div>
		</div>
	{/if}
{/if}

<style>
	/* Three short steps: the progress line, the step's question, chips for content and budget, the summary ticket. */
	.nc-prog { display: flex; gap: 4px; margin: 4px 0 14px; }
	.nc-prog i { flex: 1; height: 4px; border-radius: 4px; background: var(--line); transition: background .3s; }
	.nc-prog i.on { background: var(--grad); }
	.nc-q { display: grid; gap: 4px; margin-bottom: 14px; }
	.nc-q h2 { margin: 0; font: 400 32px/1.05 var(--f-serif, Georgia, serif); }
	.nc-q h2 em { font-style: italic; color: var(--g2); }
	.nc-flat { display: grid; gap: 16px; }
	.nc-chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.nc-chip { height: 38px; display: inline-flex; align-items: center; gap: 6px; padding: 0 13px; border: 1px dashed var(--line-strong); border-radius: 999px; background: none; color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; }
	.nc-chip.sel { border: 1px solid var(--ink); background: var(--ink); color: var(--bg); }
	.nc-chip.on { padding: 0; border: 1px solid var(--g2); background: color-mix(in oklab, var(--g2) 12%, transparent); }
	.nc-chip.on button { height: 100%; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
	.nc-c-add { display: inline-flex; align-items: center; gap: 8px; padding: 0 4px 0 13px; }
	.nc-c-add i { min-width: 20px; height: 20px; display: grid; place-items: center; border-radius: 999px; background: var(--g2); color: #fff; font-style: normal; font-size: 11.5px; font-weight: 800; }
	.nc-c-x { padding: 0 12px 0 6px; font-size: 16px !important; color: var(--ink-3) !important; }
	.nc-tk { display: flex; flex-direction: column; margin-top: 16px; border: 1px solid var(--line-strong); background: var(--surface); box-shadow: 4px 4px 0 var(--line-strong); }
	.nc-tk-h { display: grid; gap: 4px; padding: 14px 16px 10px; }
	.nc-tk-h b { font: 400 28px/1.1 var(--f-serif, Georgia, serif); }
	.nc-tk-cut { display: block; height: 0; margin: 0 16px; border-top: 2px dashed var(--line-strong); }
	.nc-tk dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; padding: 12px 16px 6px; font-size: 13px; }
	.nc-tk dt { color: var(--ink-3); }
	.nc-tk dd { margin: 0; text-align: right; font-weight: 600; }
	.nc-tk :global(.nc-link) { align-self: flex-start; margin: 0 16px 14px; }
	.nc-f {
		display: grid;
		gap: 18px;
		padding: 22px;
	}
	.nc-f input:not([type='checkbox']),
	.nc-f textarea {
		width: 100%;
	}
	.lbl {
		display: block;
		margin-bottom: 8px;
		font-size: 13px;
		font-weight: 600;
		color: var(--ink-2);
	}
	.nc-2 {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}
	.nc-seg,
	.nc-langs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.nc-seg button,
	.nc-langs button {
		height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 99px;
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink-2);
		font: 600 13.5px/1 var(--f-body);
		cursor: pointer;
	}
	.nc-seg button.on,
	.nc-langs button.on {
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		box-shadow: inset 0 0 0 1.5px var(--g2);
		color: var(--ink);
	}
	.nc-kinds {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
		gap: 10px;
	}
	.nc-k {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px 8px 14px;
		border-radius: 14px;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.nc-k.on {
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.nc-k span {
		flex: 1;
		font-weight: 600;
		font-size: 14px;
	}
	.nc-k b {
		min-width: 18px;
		text-align: center;
	}
	.nc-k button {
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: 10px;
		background: color-mix(in oklab, var(--ink) 6%, transparent);
		color: var(--ink);
		font-size: 18px;
		cursor: pointer;
	}
	.nc-chk {
		display: flex !important;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		font-size: 13.5px;
		color: var(--ink-2);
		font-weight: 500 !important;
	}
	.nc-go,
	.nc-send {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 14px;
	}
	.nc-send {
		margin-top: 18px;
	}
	.nc-send span {
		font-size: 14px;
		color: var(--ink-2);
	}
	.nc-neo {
		height: 50px;
		padding: 0 22px;
		border: 0;
		cursor: pointer;
		font: 700 12.5px/1 var(--f-body);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.nc-big {
		height: 54px;
		padding: 0 26px;
	}
	.nc-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 5px 5px 0 #6a4bc9;
	}
	.nc-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1.5px var(--ink-3),
			5px 5px 0 var(--line);
	}
	.nc-neo:hover:not(:disabled) {
		transform: translate(-2px, -2px);
	}
	.nc-neo:active:not(:disabled) {
		transform: translate(5px, 5px);
		box-shadow: none;
	}
	.nc-neo:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.nc-none {
		margin: 0;
		color: var(--ink-3);
		font-size: 14px;
	}
	.nc-sug {
		display: grid;
		gap: 8px;
		padding: 16px;
		border-radius: 18px;
		background: radial-gradient(120% 70% at 0% 0%, color-mix(in oklab, var(--g2) 12%, transparent), transparent 60%);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.nc-sug-h {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.nc-sug-h b {
		flex: 1;
	}
	.nc-tag {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		padding: 5px 10px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		color: var(--g2);
	}
	.nc-score {
		display: grid;
		justify-items: end;
		line-height: 1;
	}
	.nc-score b {
		font-family: var(--f-serif);
		font-weight: 400;
		font-size: 26px;
		color: var(--g3);
	}
	.nc-score.hi b {
		color: var(--ok);
	}
	.nc-score small {
		font-size: 11px;
		color: var(--ink-3);
	}
	.nc-pick {
		display: grid;
		gap: 8px;
	}
	.nc-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 12px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--ink) 4%, transparent);
		cursor: pointer;
	}
	.nc-row.off {
		opacity: 0.6;
		cursor: default;
	}
	.nc-row input {
		width: 18px;
		height: 18px;
		accent-color: var(--g2);
	}
	.nc-at {
		width: 36px;
		height: 36px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
		color: var(--ink-3);
	}
	.nc-who {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.nc-who b {
		font-weight: 600;
	}
	.nc-who small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.nc-fit {
		font-size: 12.5px;
		text-align: right;
	}
	.nc-fit.ok {
		color: var(--ok);
	}
	.nc-fit.warn,
	.nc-line small.warn {
		color: var(--g3);
	}
	.nc-rev {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 20px;
	}
	.nc-sum {
		display: grid;
		align-content: start;
		gap: 12px;
		padding: 22px;
	}
	.nc-sum dl {
		display: grid;
		grid-template-columns: 120px minmax(0, 1fr);
		gap: 8px 14px;
		margin: 0;
		font-size: 14.5px;
	}
	.nc-sum dt {
		color: var(--ink-3);
	}
	.nc-sum dd {
		margin: 0;
	}
	.nc-brief {
		margin: 0;
		padding-top: 10px;
		border-top: 1px solid var(--line);
		color: var(--ink-2);
		font-size: 14px;
		line-height: 1.5;
		white-space: pre-line;
	}
	.nc-line {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 0;
		border-top: 1px solid var(--line);
		font-size: 14px;
	}
	.nc-line small {
		color: var(--ink-3);
		font-size: 12.5px;
		text-align: right;
	}
	.nc-link {
		justify-self: start;
		border: 0;
		padding: 0;
		background: none;
		color: var(--ink-2);
		font: inherit;
		font-size: 13px;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	@media (max-width: 760px) {
		.nc-2,
		.nc-rev {
			grid-template-columns: minmax(0, 1fr);
		}
		.nc-neo {
			flex: 1 1 auto;
		}
		.nc-fit {
			display: none;
		}
	}
</style>
