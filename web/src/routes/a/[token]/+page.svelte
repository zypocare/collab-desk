<script lang="ts">
	import { page } from '$app/state';
	import { supabase } from '#lib/supabase.ts';
	import { confetti } from '#lib/ui.svelte.ts';
	import { errMessage, firstName, fmtLong, inr, payTerms, plural } from '#lib/util.ts';
	import type { QuoteItem } from '#lib/types.ts';
	import Icon from '#lib/components/Icon.svelte';

	// One-tap page from an email: accept a quote / approve a draft, or ask for changes. No sign-in.
	type Info = {
		state: 'open' | 'used' | 'expired' | 'closed' | 'missing';
		kind: 'quote' | 'draft';
		code: string;
		brand: string;
		contact: string;
		creator: string;
		quote: {
			version: number;
			items: QuoteItem[];
			usage: string;
			usage_fee: number;
			discount: number;
			total: number;
			advance_pct: number;
			pay_days: number;
			revision_rounds: number;
			exclusivity_days: number;
			valid_until: string | null;
			notes: string;
		} | null;
		draft: { round: number; link: string; caption: string; note: string } | null;
	};

	let info = $state<Info | null>(null);
	let mode = $state<'' | 'yes' | 'changes'>('');
	let name = $state('');
	let note = $state('');
	let busy = $state(false);
	let error = $state('');
	let done = $state<'' | 'yes' | 'changes'>('');

	$effect(() => {
		const token = page.params.token;
		supabase.rpc('action_info', { p_token: token }).then(({ data, error: err }) => {
			info = err ? ({ state: 'missing' } as Info) : (data as Info);
			name = info?.contact ?? '';
			const want = page.url.searchParams.get('do');
			if (info?.state === 'open' && (want === 'accept' || want === 'approve')) mode = 'yes';
			if (info?.state === 'open' && want === 'changes') mode = 'changes';
		});
	});

	const creator = $derived(firstName(info?.creator ?? ''));

	async function run(yes: boolean) {
		error = '';
		if (!yes && !note.trim()) return (error = 'Tell us what you would like changed.');
		if (yes && info?.kind === 'quote' && !name.trim()) return (error = 'Type your full name to accept.');
		busy = true;
		const { error: err } = await supabase.rpc('action_run', { p_token: page.params.token, p_yes: yes, p_name: name, p_note: note });
		busy = false;
		if (err) return (error = errMessage(err));
		done = yes ? 'yes' : 'changes';
		if (yes) confetti();
	}
</script>

<svelte:head><title>{info?.kind === 'draft' ? 'Review draft' : 'Your quote'}</title></svelte:head>

<header class="topbar">
	<a class="brandmark" href="/"><span class="ring"><span></span></span><b>{info?.creator ? `Collaborate with ${creator}` : ''}</b></a>
</header>

<div class="page"><div class="wrap act-wrap">
	{#if !info}
		<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
	{:else if done}
		<div class="empty-card act-done">
			<div class="big-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></div>
			<h2>{done === 'changes' ? `Sent to ${creator}` : info.kind === 'quote' ? 'Quote accepted' : 'Draft approved'}</h2>
			<p>{done === 'changes' ? `${creator} will get back to you with an update.` : info.kind === 'quote' ? `Thank you! ${creator} has been told and the collaboration is confirmed. You'll get the agreement by email.` : `Thank you! ${creator} will go ahead and post it.`}</p>
			<a class="btn" href="/brand/r/{info.code}">See your request</a>
		</div>
	{:else if info.state !== 'open'}
		<div class="empty-card">
			<h2>{info.state === 'used' ? 'Already done' : info.state === 'closed' ? 'Already answered' : info.state === 'expired' ? 'This link has expired' : 'This link is not valid'}</h2>
			<p>{info.state === 'missing' ? 'Check that you copied the whole link from the email.' : 'You can see everything about this request on your request page.'}</p>
			{#if info.code}<a class="btn" href="/brand/r/{info.code}">Open your request</a>{/if}
		</div>
	{:else}
		<header class="ph rv">
			<div>
				<div class="eb">{info.brand} · <span class="id">{info.code}</span></div>
				<h1>{info.kind === 'quote' ? 'Quote' : `Draft ${info.draft?.round}`} from <em>{creator}</em></h1>
				<p>{info.kind === 'quote' ? 'Accept it, or tell us what you would like changed.' : 'Approve it, or tell us what you would like changed.'}</p>
			</div>
		</header>

		<section class="panel rv" style="--i:1;padding:22px">
			{#if info.quote}
				{@const q = info.quote}
				<table class="doc-table">
					<thead><tr><th>Deliverable</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
					<tbody>
						{#each q.items as it, i (i)}<tr><td>{plural(it.kind, it.qty)}</td><td>{it.qty}</td><td>{inr(it.rate)}</td><td>{inr(it.qty * it.rate)}</td></tr>{/each}
						{#if q.usage_fee}<tr><td>Usage: {q.usage}</td><td></td><td></td><td>{inr(q.usage_fee)}</td></tr>{/if}
						{#if q.discount}<tr><td>Discount</td><td></td><td></td><td>− {inr(q.discount)}</td></tr>{/if}
					</tbody>
					<tfoot><tr><td colspan="3">Total</td><td>{inr(q.total)}</td></tr></tfoot>
				</table>
				<ul class="act-terms">
					<li><Icon name="wallet" />{payTerms(q)}</li>
					<li><Icon name="eye" />{q.usage}</li>
					<li><Icon name="refresh" />{q.revision_rounds ? `${q.revision_rounds} revision round${q.revision_rounds > 1 ? 's' : ''} included` : 'No revisions included'}</li>
					{#if q.exclusivity_days}<li><Icon name="alert" />{q.exclusivity_days} days category exclusivity</li>{/if}
					{#if q.valid_until}<li><Icon name="clock" />Valid until {fmtLong(q.valid_until)}</li>{/if}
				</ul>
				{#if q.notes}<p class="hint" style="white-space:pre-wrap;margin-top:10px">{q.notes}</p>{/if}
			{:else if info.draft}
				{@const d = info.draft}
				{#if d.link}<a class="btn" href={d.link} target="_blank" rel="noopener"><Icon name="eye" />Open the draft</a>{/if}
				{#if d.caption}<div class="f" style="margin-top:14px"><span class="lbl-t">Caption</span><p class="draft-cap">{d.caption}</p></div>{/if}
				{#if d.note}<blockquote class="note" style="margin-top:14px"><span>Note from {creator}</span><p>{d.note}</p></blockquote>{/if}
			{/if}
		</section>

		<section class="panel rv act-box" style="--i:2">
			{#if mode === 'changes'}
				<div class="f"><label for="a-note">What would you like changed?</label><textarea class="inp" id="a-note" rows="4" bind:value={note}></textarea></div>
				{#if error}<div class="err">{error}</div>{/if}
				<div class="row">
					<button class="btn ghost" onclick={() => ((mode = ''), (error = ''))}>Back</button>
					<button class="btn primary" disabled={busy} onclick={() => run(false)}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send to {creator}</button>
				</div>
			{:else}
				{#if info.kind === 'quote'}
					<div class="f"><label for="a-name">Your full name <span class="hint">(this is your acceptance)</span></label><input class="inp" id="a-name" autocomplete="name" bind:value={name} /></div>
				{/if}
				{#if error}<div class="err">{error}</div>{/if}
				<div class="row">
					<button class="btn" onclick={() => (mode = 'changes')}><Icon name="edit" />Ask for changes</button>
					<button class="btn grad lg" disabled={busy} onclick={() => run(true)}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}{info.kind === 'quote' ? `Accept ${inr(info.quote?.total ?? 0)}` : 'Approve draft'}</button>
				</div>
				<p class="hint" style="margin:10px 0 0">{info.kind === 'quote' ? `By accepting, you agree to the terms above with ${info.creator}.` : `${creator} will post it once you approve.`}</p>
			{/if}
		</section>
	{/if}
</div></div>
