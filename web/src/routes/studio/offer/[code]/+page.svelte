<script lang="ts">
	import { page } from '$app/state';
	import { byCode, studio } from '#lib/studio.svelte.ts';
	import { checkOffer, loadOffer, offers, sendOfferReply, type OfferCheck } from '#lib/offer.svelte.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { delivText, inr } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import QuoteDialog from '#lib/components/QuoteDialog.svelte';

	// Check the offer: what a brand's agreement asks for, what to push back on, and her reply.
	const c = $derived(studio.loaded ? byCode(page.params.code ?? '') : undefined);
	let loaded = $state('');
	let changing = $state(false);
	let text = $state('');
	let files = $state<File[]>([]);
	let reply = $state('');
	let quoteOpen = $state(false);
	let busy = $state(false);
	const check = $derived(c ? (offers.byCollab[c.id] ?? null) : null);
	$effect(() => {
		const id = c?.id;
		if (!id || loaded === id) return;
		loaded = id;
		loadOffer(id).then((k) => (reply = k?.result.reply ?? ''));
	});
	const r = $derived(check?.result ?? null);
	const asking = $derived(!check || changing);
	const ring = $derived(!r ? '' : r.score >= 85 ? 'var(--ok)' : r.score >= 60 ? 'var(--warn)' : 'var(--bad)');
	const latestQuote = $derived(c ? [...c.quotes].sort((a, b) => b.version - a.version)[0] : undefined);

	function pick(e: Event) {
		const list = [...((e.currentTarget as HTMLInputElement).files ?? [])];
		files = list.filter((f) => f.type === 'application/pdf').slice(0, 1).concat(list.filter((f) => f.type.startsWith('image/')).slice(0, 4));
		if (!files.length && list.length) toast('Add a PDF or photos of the pages.', 'alert');
	}
	async function run() {
		if (!c) return;
		const k: OfferCheck | null = await checkOffer(c, { text, files });
		if (k) {
			changing = false;
			reply = k.result.reply;
			files = [];
		}
	}
	async function sendAndQuote() {
		if (!c || !check || !reply.trim()) return;
		busy = true;
		try {
			await sendOfferReply(c, check, reply);
			toast(`Reply sent to ${c.brand.name}. Now update the quote.`, 'send');
			quoteOpen = true;
		} catch (e) {
			toast(e instanceof Error ? e.message : String(e), 'alert');
		} finally {
			busy = false;
		}
	}
	const sourceSub = (k: OfferCheck) =>
		[k.source.pages ? `${k.source.pages} page${k.source.pages === 1 ? '' : 's'}` : '', k.source.kind === 'brief' ? '' : 'plus their brief and messages', c?.code].filter(Boolean).join(' · ');
</script>

<svelte:head><title>Check the offer · {c?.brand.name ?? 'Collab'} · Miracle</title></svelte:head>

{#if !studio.loaded}
	<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
{:else if !c}
	<div class="empty-card"><h2>Collab not found</h2><p>It may have been deleted.</p><a class="btn" href="/studio/collabs">All collabs</a></div>
{:else}
	<a class="back rv" href="/studio/c/{c.code}"><Icon name="back" />{c.brand.name}</a>
	<header class="ph rv">
		<div>
			<div class="eb">{c.brand.name} · {delivText(c.deliverables)}{c.fee ? ` · ${inr(c.fee)}` : ''}</div>
			<h1>Check the <em>offer</em></h1>
		</div>
	</header>

	<div class="of">
		{#if asking}
			<section class="panel of-in rv" aria-labelledby="of-in-t">
				<h2 id="of-in-t">What did {c.brand.name} send?</h2>
				<p class="hint">Add their agreement (a PDF or photos of its pages) or paste its text. Miracle reads it with their brief and your messages, against your rate card and usual terms.</p>
				<label class="of-drop">
					<input type="file" accept="application/pdf,image/*" multiple onchange={pick} />
					<Icon name="doc" />
					<span>{files.length ? files.map((f) => f.name).join(', ') : 'Choose the agreement (PDF, or up to 4 photos)'}</span>
				</label>
				<div class="f"><label for="of-text">Or paste the text <span class="hint">(optional)</span></label><textarea class="inp" id="of-text" rows="6" placeholder="Paste the agreement, or the terms from their email" bind:value={text}></textarea></div>
				{#if offers.error}<p class="err">{offers.error}</p>{/if}
				<div class="row">
					{#if check}<button class="btn ghost" onclick={() => (changing = false)}>Cancel</button>{/if}
					<button class="btn grad" onclick={run} disabled={offers.running}>{#if offers.running}<span class="spinner"></span>Reading the offer…{:else}<Icon name="spark" />Check it{/if}</button>
				</div>
				{#if !files.length && !text.trim()}<small class="hint">No agreement? Check it anyway: Miracle reads their brief and messages.</small>{/if}
			</section>
		{:else if check && r}
			<div class="of-src rv">
				<span class="of-ic" aria-hidden="true">{check.source.kind === 'pdf' ? 'PDF' : check.source.kind === 'photo' ? 'IMG' : 'TXT'}</span>
				<span class="of-st"><b>{c.brand.name} · {check.source.name}</b><small>{sourceSub(check)}</small></span>
				<button class="btn sm" onclick={() => (changing = true)}>Change</button>
			</div>

			<section class="of-score rv" style="--i:1">
				<span class="of-ring" style="--p:{r.score};--c:{ring}" role="img" aria-label="Fairness {r.score} out of 100"><span>{r.score}</span></span>
				<div><b>{r.headline}</b><small>Fairness, against your rate card and terms creators usually get</small></div>
			</section>

			<section class="panel of-list rv" style="--i:2" aria-label="What the offer says">
				{#each r.flags as f, i (i)}
					<div class="of-row">
						<span class="of-dot {f.level}">!</span>
						<span class="of-rt">
							<b>{f.title}</b>
							{#if f.quote}<small class="of-q">"…{f.quote}…"</small>{/if}
							{#if f.ask}<small class="of-ask">{f.ask}</small>{/if}
						</span>
					</div>
				{/each}
				{#each r.fine as f, i (i)}
					<div class="of-row">
						<span class="of-dot ok">✓</span>
						<span class="of-rt"><b>{f.title}</b>{#if f.sub}<small>{f.sub}</small>{/if}</span>
					</div>
				{/each}
			</section>

			{#if reply || r.reply}
				<section class="panel of-reply rv" style="--i:3">
					<label class="lbl-t" for="of-reply">Your reply to {c.brand.name}</label>
					<textarea class="inp" id="of-reply" rows="5" bind:value={reply}></textarea>
					{#if check.sent_at}<small class="hint"><Icon name="check" />Sent {new Date(check.sent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small>{/if}
				</section>
				<div class="of-acts rv" style="--i:4">
					<button class="btn primary" onclick={sendAndQuote} disabled={busy || !reply.trim()}>{#if busy}<span class="spinner"></span>{/if}Send and update the quote</button>
					<button class="btn" onclick={() => copyText(reply, 'Reply copied')}>Copy</button>
				</div>
			{/if}
			<small class="hint of-legal">Miracle reads the offer to help you spot problems. It isn't legal advice.</small>
		{/if}
	</div>

	{#if quoteOpen && r}
		<QuoteDialog {c} base={latestQuote} preset={r.terms} onclose={() => (quoteOpen = false)} />
	{/if}
{/if}

<style>
	.of {
		display: grid;
		gap: 14px;
		max-width: 680px;
	}
	.of-in {
		display: grid;
		gap: 12px;
		padding: 18px;
	}
	.of-in h2 {
		margin: 0;
	}
	.of-in p {
		margin: 0;
	}
	.of-drop {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		border: 1px dashed var(--line-strong);
		border-radius: 16px;
		cursor: pointer;
		font-weight: 600;
	}
	.of-drop input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}
	.of-drop:focus-within {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}
	.of-src {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 16px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.of-ic {
		width: 40px;
		height: 40px;
		flex: none;
		border-radius: 10px;
		background: var(--surface-2);
		display: grid;
		place-items: center;
		font-size: 11px;
		font-weight: 700;
	}
	.of-st {
		flex: 1;
		min-width: 0;
		display: grid;
	}
	.of-st small,
	.of-score small {
		color: var(--ink-3);
		font-size: 12px;
	}
	.of-score {
		display: grid;
		grid-template-columns: 96px minmax(0, 1fr);
		gap: 16px;
		align-items: center;
	}
	.of-score > div {
		display: grid;
		gap: 4px;
	}
	.of-score b {
		font-size: 17px;
	}
	.of-ring {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: conic-gradient(var(--c) 0 calc(var(--p) * 1%), var(--line) calc(var(--p) * 1%) 100%);
		display: grid;
		place-items: center;
	}
	.of-ring span {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: var(--bg);
		display: grid;
		place-items: center;
		font: 400 34px/1 var(--f-serif, Georgia, serif);
	}
	.of-list {
		display: grid;
		padding: 0;
	}
	.of-row {
		display: grid;
		grid-template-columns: 26px minmax(0, 1fr);
		gap: 10px;
		padding: 14px 16px;
	}
	.of-row + .of-row {
		border-top: 1px solid var(--line);
	}
	.of-dot {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-weight: 700;
		font-size: 13px;
	}
	.of-dot.red {
		background: color-mix(in oklab, var(--bad) 18%, transparent);
		color: var(--bad);
	}
	.of-dot.amber {
		background: color-mix(in oklab, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.of-dot.ok {
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		color: var(--ok);
	}
	.of-rt {
		display: grid;
		gap: 6px;
		min-width: 0;
	}
	.of-rt b {
		font-size: 14.5px;
	}
	.of-rt small {
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--ink-3);
	}
	.of-q {
		font-style: italic;
	}
	small.of-ask {
		color: var(--ink-2);
	}
	.of-reply {
		display: grid;
		gap: 8px;
		padding: 16px;
	}
	.of-acts {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 10px;
	}
	.of-legal {
		text-align: center;
	}
</style>
