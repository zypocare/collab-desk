<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { campaignBoard, inviteText, respondQuotes, sendCampaign } from '#lib/campaigns.svelte.ts';
	import { askNote } from '#lib/confirm.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { compact, delivText, errMessage, firstName, fmt, inr } from '#lib/util.ts';
	import type { CampaignBoard, CampaignRow } from '#lib/types.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import { shortlistFor, type Suggestion } from '#lib/autopilots.svelte.ts';
	import { auth } from '#lib/auth.svelte.ts';

	// One campaign: where each creator's request stands (Board), the quotes side by side, and the brief.
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	let board = $state<CampaignBoard | null>(null);
	let missing = $state(false);
	const id = $derived(page.params.id ?? '');
	const tab = $derived(({ quotes: 'quotes', brief: 'brief' } as const)[page.url.searchParams.get('tab') ?? ''] ?? 'board');
	const setTab = (t: string) => goto(t === 'board' ? '?' : `?tab=${t}`, { replaceState: true });
	async function load() {
		try {
			board = await campaignBoard(id);
			missing = !board;
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	onMount(load);
	// The shortlist autopilot's suggestions (from "See them"): more creators who fit, to send to as well.
	let sugs = $state<Suggestion[]>([]);
	let sugPick = $state<Record<number, boolean>>({});
	const showSug = $derived(page.url.searchParams.get('suggest') === '1');
	$effect(() => {
		if (!showSug || !id) return;
		shortlistFor(id, null, 8).then((s) => (sugs = s)).catch(() => (sugs = []));
	});
	async function sendMore() {
		const ids = sugs.filter((s) => sugPick[s.id]).map((s) => s.id);
		if (!ids.length) return toast('Tick the creators first.', 'alert');
		try {
			board = await sendCampaign(id, ids, []);
			sugs = sugs.filter((s) => !ids.includes(s.id));
			toast(`Sent to ${ids.length} more`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}

	const c = $derived(board?.campaign);
	const rows = $derived(board?.rows ?? []);
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));
	const AGREED = ['confirmed', 'creating', 'live', 'wrapped'];
	// The five steps of a request: sent, quoted, agreed, live, paid.
	const steps = (r: CampaignRow) => {
		if (r.status !== 'sent' || !r.stage) return [] as string[];
		const quoted = !!r.quote || AGREED.includes(r.stage);
		const agreed = AGREED.includes(r.stage);
		const live = r.stage === 'live' || r.stage === 'wrapped';
		const paid = r.pay_status === 'paid';
		const turn = r.quote?.status === 'sent' || r.draft_pending;
		return [
			'done',
			quoted ? (r.quote?.status === 'sent' ? 'turn' : 'done') : '',
			agreed ? (r.draft_pending ? 'turn' : 'done') : turn && !quoted ? 'turn' : '',
			live ? 'done' : '',
			paid ? 'done' : ''
		];
	};
	const where = (r: CampaignRow): { text: string; tone: '' | 'turn' | 'bad' | 'ok' } => {
		if (r.status === 'failed') return { text: r.note || "Couldn't be sent", tone: 'bad' };
		if (r.status === 'invited') return r.joined ? { text: 'Joined Miracle: send the request', tone: 'turn' } : { text: 'Invited · not on Miracle yet', tone: '' };
		if (r.quote?.status === 'sent') return { text: 'Quote waiting on you', tone: 'turn' };
		if (r.draft_pending) return { text: 'Draft to approve', tone: 'turn' };
		switch (r.stage) {
			case 'request': return { text: 'Sent · waiting for their quote', tone: '' };
			case 'negotiating': return { text: r.quote?.status === 'changes' ? 'You asked for changes' : 'Talking', tone: '' };
			case 'confirmed': return { text: `Agreed${r.draft_date ? ` · draft due ${fmt(r.draft_date)}` : ''}`, tone: 'ok' };
			case 'creating': return { text: `Creating${r.live_date ? ` · live ${fmt(r.live_date)}` : ''}`, tone: 'ok' };
			case 'live': return { text: r.pay_status === 'paid' ? 'Live · paid' : 'Live · to pay', tone: 'ok' };
			case 'wrapped': return { text: 'Done', tone: 'ok' };
			case 'declined': return { text: 'Declined', tone: 'bad' };
			default: return { text: r.stage_label ?? '', tone: '' };
		}
	};
	const price = (r: CampaignRow) => (r.quote ? Number(r.quote.total) : Number(r.fee) || 0);
	const used = $derived(rows.filter((r) => r.stage && AGREED.includes(r.stage)).reduce((a, r) => a + price(r), 0));
	const quoted = $derived(rows.filter((r) => r.quote?.status === 'sent').reduce((a, r) => a + Number(r.quote!.total), 0));
	const waitingQuotes = $derived(rows.filter((r) => r.quote?.status === 'sent'));
	const notReplied = $derived(rows.filter((r) => r.status === 'sent' && r.stage === 'request' && !r.quote).length);
	const who = (r: CampaignRow) => (r.creator ? r.creator.name : `@${r.handle}`);

	async function sendJoined(r: CampaignRow) {
		if (!r.creator) return;
		try {
			board = await sendCampaign(id, [r.creator.id], []);
			toast(`Sent to ${firstName(r.creator.name)}`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	function invite(r: CampaignRow) {
		copyText(inviteText(c?.company ?? '', r.handle, c?.name ?? ''), 'Invite copied. Send it to them on Instagram or WhatsApp.');
	}

	// Quotes side by side: views it should reach, and the cost per 1,000 of them.
	const reels = (r: CampaignRow) => (r.quote?.items ?? []).filter((i) => i.kind === 'Reel').reduce((a, i) => a + i.qty, 0) || (c?.brief.deliverables ?? []).filter((d) => d.kind === 'Reel').reduce((a, d) => a + d.qty, 0);
	const cpk = (r: CampaignRow) => {
		const views = (Number(r.creator?.avg_views) || 0) * Math.max(1, reels(r));
		return views ? (price(r) / views) * 1000 : null;
	};
	const compared = $derived(
		rows.filter((r) => r.quote && r.quote.status !== 'changes').sort((a, b) => (cpk(a) ?? Infinity) - (cpk(b) ?? Infinity))
	);
	const best = $derived(compared.find((r) => r.quote?.status === 'sent' && cpk(r) != null)?.id ?? '');
	const capEach = $derived(Number(c?.brief.fee) || 0);
	let pick = $state<Record<string, boolean>>({});
	const picks = $derived(waitingQuotes.filter((r) => pick[r.id]));
	const pickedTotal = $derived(picks.reduce((a, r) => a + price(r), 0));
	let busy = $state(false);
	async function answer(accept: boolean) {
		if (!picks.length) return toast('Tick the quotes first.', 'alert');
		let note = '';
		let signer = acc?.full_name?.trim() ?? '';
		// Accepting signs each agreement: with their name on file, or the one they type now.
		if (accept && !signer) {
			const n = await askNote({ title: `Accept ${picks.length} quote${picks.length === 1 ? '' : 's'}`, body: 'Accepting signs the agreement for each one.', note: 'Your full name', ok: 'Accept' });
			if (!n) return;
			signer = n;
		}
		if (!accept) {
			const n = await askNote({ title: `Ask ${picks.length === 1 ? firstName(who(picks[0])) : `${picks.length} creators`} for changes`, note: 'What would you like changed?', ok: 'Send' });
			if (!n) return;
			note = n;
		}
		busy = true;
		try {
			const r = await respondQuotes(picks.map((p) => p.quote!.id), accept, note, signer);
			toast(r.failed.length ? `${r.done} done. ${r.failed.length} need answering on their own page.` : accept ? `Accepted ${r.done} quote${r.done === 1 ? '' : 's'}` : 'Asked for changes', r.failed.length ? 'alert' : 'check');
			pick = {};
			await load();
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{c?.name ?? 'Campaign'} · Miracle</title></svelte:head>

<a class="back" href="/brand/campaigns">Campaigns</a>

{#if missing}
	<div class="empty-card"><h2>Campaign not found</h2><p>It may have been deleted, or it belongs to another login.</p><a class="btn" href="/brand/campaigns">All campaigns</a></div>
{:else if !c}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<header class="ph rv">
		<div>
			<div class="eb">Campaign{c.brief.preferred_live ? ` · go live by ${fmt(c.brief.preferred_live)}` : ''}</div>
			<h1>{c.name}</h1>
		</div>
	</header>
	<div class="m-stages" role="tablist" aria-label="Campaign">
		<button role="tab" aria-selected={tab === 'board'} class:on={tab === 'board'} onclick={() => setTab('board')}><i class="dt" style="--hue:var(--accent)"></i>Board</button>
		<button role="tab" aria-selected={tab === 'quotes'} class:on={tab === 'quotes'} onclick={() => setTab('quotes')}><i class="dt" style="--hue:var(--bad)"></i>Quotes{#if waitingQuotes.length}<span>{waitingQuotes.length}</span>{/if}</button>
		<button role="tab" aria-selected={tab === 'brief'} class:on={tab === 'brief'} onclick={() => setTab('brief')}><i class="dt" style="--hue:var(--ok)"></i>Brief</button>
	</div>

	{#if tab === 'board'}
		<div class="cb-stats rv" style="--i:1">
			<div class="cb-s"><span>Creators</span><b>{rows.length}</b><small>{rows.filter((r) => r.status === 'sent').length} asked · {rows.filter((r) => r.status === 'invited').length} invited</small></div>
			<div class="cb-s" class:hot={waitingQuotes.length > 0}><span>Your turn</span><b>{waitingQuotes.length} quote{waitingQuotes.length === 1 ? '' : 's'}</b><small>{waitingQuotes.length ? 'compare them side by side' : 'nothing to answer'}</small></div>
			<div class="cb-s"><span>Budget used</span><b>{inr(used)}</b><small>{c.budget_total ? `of ${inr(c.budget_total)}` : 'agreed so far'}{quoted ? ` · ${inr(quoted)} quoted` : ''}</small></div>
			<div class="cb-s"><span>Not replied</span><b>{notReplied}</b><small>{notReplied ? 'waiting for their quote' : 'everyone has answered'}</small></div>
		</div>
		{#if showSug && sugs.length}
			<section class="cb-sug rv">
				<div class="cb-sug-h"><span class="cb-tag">Shortlist</span><b>Suggested for this brief</b><button class="cb-neo cb-light" onclick={sendMore}>Send to {Object.values(sugPick).filter(Boolean).length || ''} more</button></div>
				{#each sugs as s (s.id)}
					<label class="cb-sr">
						<input type="checkbox" bind:checked={sugPick[s.id]} />
						<Avatar name={s.name} src={s.photo} size="36px" />
						<span><b>{s.name}</b><small>{[s.niche?.split(',')[0]?.trim(), s.city, ...s.why].filter(Boolean).join(' · ')}</small></span>
						<em>{s.score}</em>
					</label>
				{/each}
			</section>
		{/if}
		{#if waitingQuotes.length && phone.on}<button class="cb-neo cb-light cb-wide" onclick={() => setTab('quotes')}>Compare {waitingQuotes.length} quote{waitingQuotes.length === 1 ? '' : 's'}</button>{/if}

		<div class="cb-rows" class:cb-tix={phone.on}>
			{#if !phone.on}<div class="cb-r cb-th"><span>Creator</span><span>Where it stands</span><span>Price</span><span></span></div>{/if}
			{#each rows as r (r.id)}
				{@const w = where(r)}
				<div class="cb-r" class:hot={w.tone === 'turn'}>
					<span class="cb-who">
						{#if r.creator}<Avatar name={r.creator.name} src={r.creator.photo} size="40px" />{:else}<span class="cb-at" aria-hidden="true">@</span>{/if}
						<b>{who(r)}</b>
						{#if phone.on && price(r)}<strong>{inr(price(r))}</strong>{/if}
					</span>
					<span class="cb-st">
						{#if steps(r).length}<span class="cb-bar" aria-hidden="true">{#each steps(r) as s, i (i)}<i class={s}></i>{/each}</span>{/if}
						<span class="cb-w {w.tone}">{w.text}</span>
					</span>
					{#if !phone.on}<span class="cb-p">{price(r) ? inr(price(r)) : '—'}</span>{/if}
					<span class="cb-a">
						{#if r.status === 'invited' && r.joined}
							<button class="cb-neo cb-light" onclick={() => sendJoined(r)}>Send request</button>
						{:else if r.status === 'invited'}
							<button class="cb-link" onclick={() => invite(r)}>Copy invite again</button>
						{:else if r.code && r.creator}
							{#if w.tone === 'turn'}<a class="cb-neo cb-light" href={r.quote?.status === 'sent' ? '?tab=quotes' : at(r.creator.slug, `/brand/r/${r.code}`)}>Review</a>{:else}<a class="cb-link" href={at(r.creator.slug, `/brand/r/${r.code}`)}>Open</a>{/if}
						{/if}
					</span>
				</div>
			{/each}
		</div>
	{:else if tab === 'quotes'}
		{#if !compared.length}
			<div class="empty-card"><h2>No quotes yet</h2><p>Creators' quotes show up here as they reply, side by side.</p></div>
		{:else}
			<div class="cq-wrap rv">
				<div class="cq" style="--n:{compared.length}">
					<div class="cq-col cq-lab">
						<span class="cq-top"></span><span>Price</span><span>Content</span><span>Followers</span><span>Average Reel views</span><span>Cost per 1K views</span><span>Engagement</span><span>Note</span>
					</div>
					{#each compared as r (r.id)}
						{@const k = cpk(r)}
						<div class="cq-col" class:best={r.id === best}>
							<label class="cq-top">
								{#if r.quote?.status === 'sent'}<input type="checkbox" bind:checked={pick[r.id]} aria-label="Pick {who(r)}" />{/if}
								<Avatar name={who(r)} src={r.creator?.photo} size="40px" />
								<span><b>{r.creator ? firstName(r.creator.name) : who(r)}</b>{#if r.id === best}<small class="ok">Best value</small>{/if}</span>
							</label>
							<span class="cq-price">{inr(price(r))}</span>
							<span>{r.quote?.items?.length ? delivText(r.quote.items) : delivText(c.brief.deliverables ?? [])}</span>
							<span>{r.creator?.followers != null ? compact(r.creator.followers) : '—'}</span>
							<span>{r.creator?.avg_views ? compact(r.creator.avg_views) : '—'}</span>
							<span class:ok={r.id === best}>{k != null ? inr(k) : '—'}</span>
							<span>{r.creator?.engagement != null ? `${Number(r.creator.engagement).toFixed(1)}%` : '—'}</span>
							<span class="cq-note" class:warn={capEach > 0 && price(r) > capEach && r.quote?.status === 'sent'}>
								{r.quote?.status === 'accepted' ? 'Already agreed' : capEach > 0 && price(r) > capEach ? `Over your ${inr(capEach)} cap` : r.live_date ? `Can go live ${fmt(r.live_date)}` : ''}
							</span>
						</div>
					{/each}
				</div>
			</div>
			<div class="cq-go">
				<span>{picks.length ? `${picks.length} picked · ${inr(pickedTotal)}${c.budget_total ? ` · ${inr(used + pickedTotal)} of ${inr(c.budget_total)} budget` : ''}` : 'Tick the quotes to answer'}</span>
				<button class="cb-neo cb-ghost" disabled={busy || !picks.length} onclick={() => answer(false)}>Ask for changes</button>
				<button class="cb-neo cb-grad" disabled={busy || !picks.length} onclick={() => answer(true)}>Accept {picks.length || ''} quote{picks.length === 1 ? '' : 's'}</button>
			</div>
		{/if}
	{:else}
		<section class="panel cb-brief rv">
			<dl>
				<dt>Sent as</dt><dd>{c.company ?? '—'}</dd>
				<dt>Each creator</dt><dd>{delivText(c.brief.deliverables ?? [])}</dd>
				<dt>Budget</dt><dd>{c.brief.fee ? `Up to ${inr(c.brief.fee)} each` : c.brief.type === 'barter' ? 'Barter' : 'Each creator quotes'}{c.budget_total ? ` · ${inr(c.budget_total)} total` : ''}</dd>
				{#if c.brief.product}<dt>{c.brief.barter_kind === 'experience' ? 'Experience' : 'Product'}</dt><dd>{c.brief.product}{c.brief.product_value ? ` (${inr(c.brief.product_value)})` : ''}</dd>{/if}
				<dt>Go live</dt><dd>{c.brief.preferred_live ? `By ${fmt(c.brief.preferred_live)}` : 'No preference'}</dd>
				<dt>Usage</dt><dd>{c.brief.usage ?? 'Organic only'}</dd>
				{#if c.brief.content_language?.length}<dt>Language</dt><dd>{c.brief.content_language.join(' or ')}</dd>{/if}
			</dl>
			<p>{c.brief.brief}</p>
			{#if rows.some((r) => r.status === 'failed')}
				<h2>Couldn't be sent</h2>
				{#each rows.filter((r) => r.status === 'failed') as r (r.id)}<div class="cb-fail"><b>{who(r)}</b><small>{r.note}</small></div>{/each}
			{/if}
		</section>
	{/if}
{/if}

<style>
	.cb-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 18px;
	}
	.cb-s {
		display: grid;
		gap: 4px;
		padding: 16px 18px;
		border-radius: 16px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.cb-s.hot {
		background:
			radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g3) 16%, transparent), transparent 60%),
			var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cb-s span {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.cb-s.hot span {
		color: var(--g3);
		font-weight: 600;
	}
	.cb-s b {
		font-family: var(--f-serif);
		font-weight: 400;
		font-size: 32px;
		line-height: 1;
		white-space: nowrap;
	}
	.cb-s small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.cb-sug {
		display: grid;
		gap: 8px;
		margin-bottom: 18px;
		padding: 16px;
		border-radius: 18px;
		background: radial-gradient(120% 70% at 0% 0%, color-mix(in oklab, var(--g2) 12%, transparent), transparent 60%), var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cb-sug-h {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.cb-sug-h b {
		flex: 1;
	}
	.cb-tag {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		padding: 5px 10px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		color: var(--g2);
	}
	.cb-sr {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 56px;
		padding: 8px 12px;
		border-radius: 12px;
		background: color-mix(in oklab, var(--ink) 4%, transparent);
		cursor: pointer;
	}
	.cb-sr input {
		width: 18px;
		height: 18px;
		accent-color: var(--g2);
	}
	.cb-sr > span {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.cb-sr small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.cb-sr em {
		font-style: normal;
		font-family: var(--f-serif);
		font-size: 24px;
		color: var(--ok);
	}
	.cb-rows {
		display: grid;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.cb-r {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1.2fr);
		gap: 14px;
		align-items: center;
		padding: 14px 18px;
	}
	.cb-r + .cb-r {
		border-top: 1px solid var(--line);
	}
	.cb-th {
		padding: 12px 18px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.cb-who {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}
	.cb-who b {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cb-at {
		width: 40px;
		height: 40px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1.5px var(--line-strong);
		color: var(--ink-3);
	}
	.cb-st {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.cb-bar {
		display: flex;
		gap: 4px;
		flex: none;
	}
	.cb-bar i {
		width: 22px;
		height: 6px;
		border-radius: 3px;
		background: var(--line-strong);
	}
	.cb-bar i.done {
		background: var(--ok);
	}
	.cb-bar i.turn {
		background: var(--g3);
	}
	.cb-w {
		font-size: 13px;
		color: var(--ink-2);
	}
	.cb-w.turn {
		color: var(--g3);
		font-weight: 600;
	}
	.cb-w.bad {
		color: var(--bad);
	}
	.cb-p {
		font-weight: 600;
	}
	.cb-a {
		justify-self: end;
	}
	.cb-neo {
		height: 42px;
		display: inline-grid;
		place-items: center;
		padding: 0 14px;
		border: 0;
		cursor: pointer;
		text-decoration: none;
		font: 700 12px/1 var(--f-body);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.cb-light {
		background: var(--ink);
		color: var(--bg);
		box-shadow: 3px 3px 0 var(--g2);
	}
	.cb-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 5px 5px 0 #6a4bc9;
		height: 50px;
		padding: 0 20px;
	}
	.cb-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1.5px var(--ink-3),
			5px 5px 0 var(--line);
		height: 50px;
		padding: 0 20px;
	}
	.cb-neo:hover:not(:disabled) {
		transform: translate(-2px, -2px);
	}
	.cb-neo:active:not(:disabled) {
		transform: translate(4px, 4px);
		box-shadow: none;
	}
	.cb-neo:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.cb-wide {
		width: 100%;
		height: 48px;
		margin-bottom: 14px;
	}
	.cb-link {
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
	/* Phones: each creator a ticket. */
	.cb-tix {
		background: none;
		box-shadow: none;
		gap: 12px;
		overflow: visible;
	}
	.cb-tix .cb-r {
		grid-template-columns: minmax(0, 1fr);
		gap: 8px;
		padding: 14px 16px 12px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cb-tix .cb-r + .cb-r {
		border-top: 0;
	}
	.cb-tix .cb-r.hot {
		background:
			radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--g3) 16%, transparent), transparent 60%),
			var(--surface);
	}
	.cb-tix .cb-who b {
		flex: 1;
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 22px;
	}
	.cb-tix .cb-st {
		flex-direction: column-reverse;
		align-items: stretch;
		gap: 10px;
		padding-top: 10px;
		border-top: 1.5px dashed var(--line-strong);
	}
	.cb-tix .cb-bar i {
		flex: 1;
		width: auto;
	}
	.cb-tix .cb-a {
		justify-self: stretch;
	}
	.cb-tix .cb-a .cb-neo {
		width: 100%;
	}
	/* Quotes side by side */
	.cq-wrap {
		overflow-x: auto;
		border-radius: 20px;
		box-shadow: inset 0 0 0 1px var(--line);
		background: var(--surface);
	}
	.cq {
		display: grid;
		grid-template-columns: 190px repeat(var(--n), minmax(200px, 1fr));
	}
	.cq-col {
		display: grid;
		grid-template-rows: 92px repeat(7, 52px);
	}
	.cq-col + .cq-col {
		box-shadow: inset 1px 0 0 var(--line);
	}
	.cq-col.best {
		background: radial-gradient(120% 50% at 50% 0%, color-mix(in oklab, var(--ok) 12%, transparent), transparent 60%);
	}
	.cq-col > span,
	.cq-col > label {
		display: flex;
		align-items: center;
		padding: 0 18px;
		font-size: 14px;
	}
	.cq-col > span:not(.cq-top) {
		border-top: 1px solid var(--line);
	}
	.cq-lab > span {
		font-size: 13px;
		color: var(--ink-3);
	}
	.cq-top {
		gap: 12px;
		cursor: pointer;
	}
	.cq-top input {
		width: 20px;
		height: 20px;
		accent-color: var(--g2);
	}
	.cq-top > span:last-child {
		display: grid;
	}
	.cq-top b {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 22px;
	}
	.cq-top small.ok,
	.cq-col .ok {
		color: var(--ok);
		font-weight: 700;
	}
	.cq-top small {
		font-size: 11.5px;
	}
	.cq-price {
		font-weight: 700;
		font-size: 17px !important;
	}
	.cq-note {
		font-size: 13px !important;
		color: var(--ink-2);
	}
	.cq-note.warn {
		color: var(--g3);
	}
	.cq-go {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 14px;
		margin-top: 18px;
	}
	.cq-go > span {
		font-size: 14px;
		color: var(--ink-2);
	}
	.cb-brief {
		display: grid;
		gap: 14px;
		padding: 22px;
	}
	.cb-brief dl {
		display: grid;
		grid-template-columns: 130px minmax(0, 1fr);
		gap: 8px 14px;
		margin: 0;
		font-size: 14.5px;
	}
	.cb-brief dt {
		color: var(--ink-3);
	}
	.cb-brief dd {
		margin: 0;
	}
	.cb-brief p {
		margin: 0;
		color: var(--ink-2);
		line-height: 1.55;
		white-space: pre-line;
	}
	.cb-brief h2 {
		margin: 8px 0 0;
		font-size: 15px;
	}
	.cb-fail {
		display: grid;
		gap: 2px;
		padding: 8px 0;
		border-top: 1px solid var(--line);
		font-size: 14px;
	}
	.cb-fail small {
		color: var(--bad);
	}
	@media (max-width: 900px) {
		.cb-stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.cb-s b {
			font-size: 26px;
		}
		.cq-go button {
			flex: 1 1 auto;
		}
	}
</style>
