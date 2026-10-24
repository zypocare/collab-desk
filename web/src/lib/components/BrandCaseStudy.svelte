<script lang="ts">
	import { answerCase, brandCase, type CaseStudy } from '../caseStudy';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// For the brand: the creator's case study about this collab, to approve (with a line of their own) or
	// send back with a note. Nothing goes on her page without this.
	let { code, creator, signer = '' }: { code: string; creator: string; signer?: string } = $props();
	let cs = $state<CaseStudy | null>(null);
	let quote = $state('');
	let by = $state('');
	let note = $state('');
	let changes = $state(false);
	let busy = $state(false);
	$effect(() => {
		void code;
		brandCase(code).then((x) => (cs = x)).catch(() => (cs = null));
	});
	$effect(() => {
		if (!by && signer) by = signer;
	});
	async function answer(ok: boolean) {
		busy = true;
		try {
			cs = await answerCase(code, ok, ok ? '' : note.trim(), quote.trim(), by.trim());
			toast(ok ? `Approved. It's on ${creator}'s page.` : `Sent back to ${creator} with your note.`, 'check');
			changes = false;
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

{#if cs}
	<section class="panel rv bcs" style="margin-top:18px">
		<div class="panel-h"><h2>Case study</h2><small>{cs.status === 'asked' ? `${creator} asks for your OK` : cs.status === 'published' ? `on ${creator}'s page` : 'you asked for changes'}</small></div>
		<div class="bcs-b">
			<b class="bcs-t">{cs.title}</b>
			<p class="bcs-s">{cs.summary}</p>
			{#if cs.highlights.length}<div class="bcs-hl">{#each cs.highlights as h (h.label)}<span><b>{h.value}</b>{h.label}</span>{/each}</div>{/if}
			<dl>
				{#if cs.goal}<dt>The goal</dt><dd>{cs.goal}</dd>{/if}
				{#if cs.made}<dt>What {creator} made</dt><dd>{cs.made}</dd>{/if}
				{#if cs.results}<dt>The results</dt><dd>{cs.results}</dd>{/if}
			</dl>
			{#if cs.status === 'asked'}
				{#if changes}
					<div class="f"><label for="bcs-note">What should change?</label><textarea class="inp" id="bcs-note" rows="2" maxlength="500" bind:value={note} placeholder="e.g. Please don't mention the price, and call it the Glow serum"></textarea></div>
					<div class="row-btns" style="border:0;padding:0">
						<button class="btn ghost" onclick={() => (changes = false)}>Back</button>
						<button class="btn primary" onclick={() => answer(false)} disabled={busy || note.trim().length < 3}>Send back to {creator}</button>
					</div>
				{:else}
					<div class="fields">
						<div class="f span2"><label for="bcs-q">A line from you <span class="hint">(optional, shown with it)</span></label><textarea class="inp" id="bcs-q" rows="2" maxlength="300" bind:value={quote} placeholder="e.g. Our best-performing creator collab this season."></textarea></div>
						<div class="f"><label for="bcs-by">From</label><input class="inp" id="bcs-by" maxlength="120" bind:value={by} placeholder="Name, role" /></div>
					</div>
					<div class="row-btns" style="border:0;padding:0">
						<button class="btn" onclick={() => (changes = true)} disabled={busy}>Ask for changes</button>
						<button class="btn grad" onclick={() => answer(true)} disabled={busy}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Approve and publish</button>
					</div>
				{/if}
			{:else if cs.status === 'published'}
				{#if cs.quote}<blockquote>“{cs.quote}”{#if cs.quote_by}<small>{cs.quote_by}</small>{/if}</blockquote>{/if}
				<p class="hint">Approved. If {creator} edits it, it comes back to you first.</p>
			{:else}
				<p class="hint">You asked for changes: “{cs.brand_note}”. {creator} will send it again.</p>
			{/if}
		</div>
	</section>
{/if}

<style>
	.bcs-b {
		display: grid;
		gap: 12px;
		padding: 0 20px 20px;
	}
	.bcs-t {
		font: 400 22px/1.2 var(--f-serif, Georgia, serif);
	}
	.bcs-s {
		margin: 0;
		color: var(--ink-2);
	}
	.bcs-hl {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.bcs-hl span {
		display: grid;
		gap: 2px;
		min-width: 90px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--surface-2);
		font-size: 12px;
		color: var(--ink-3);
	}
	.bcs-hl b {
		font: 400 22px/1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	dl {
		display: grid;
		gap: 4px 0;
		margin: 0;
	}
	dt {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	dd {
		margin: 0 0 8px;
		font-size: 14.5px;
		line-height: 1.55;
	}
	blockquote {
		margin: 0;
		padding-left: 12px;
		border-left: 3px solid var(--g2);
		font-style: italic;
	}
	blockquote small {
		display: block;
		font-style: normal;
		color: var(--ink-3);
	}
</style>
