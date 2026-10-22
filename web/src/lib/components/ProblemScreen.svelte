<script lang="ts">
	import { noteProblem } from '../problems';
	import { copyText } from '../ui.svelte';
	import Icon from './Icon.svelte';

	// When something breaks: we've been told (with a reference), what they were doing (optional), and a way on.
	let { ref = '', home = '/', homeLabel = 'Go to the home page', full = false }: { ref?: string; home?: string; homeLabel?: string; full?: boolean } = $props();
	let note = $state('');
	async function leave(to: 'again' | 'home') {
		await noteProblem(ref, note).catch(() => {});
		if (to === 'again') location.reload();
		else location.href = home;
	}
</script>

<div class="pb" class:full>
	{#if full}<header class="pb-top"><span class="pb-m">m.</span><b>Miracle</b></header>{/if}
	<div class="pb-in">
		<span class="pb-ring" aria-hidden="true"><Icon name="alert" /></span>
		<h1>Something broke <em>on our side</em></h1>
		<p>We've been told and we're looking at it. Anything you'd already saved is safe.</p>
		{#if ref}
			<div class="pb-ref">
				<small>Reference <b>{ref}</b></small>
				<button class="btn sm" type="button" onclick={() => copyText(ref, 'Reference copied')}>Copy</button>
			</div>
			<label class="pb-note">
				<span>What were you doing? (optional)</span>
				<textarea rows="3" bind:value={note} maxlength="600" placeholder="I tapped Send quote on a request…"></textarea>
			</label>
		{/if}
		<div class="pb-acts">
			<button class="btn primary" type="button" onclick={() => leave('again')}>Try again</button>
			<button class="btn" type="button" onclick={() => leave('home')}>{homeLabel}</button>
		</div>
	</div>
</div>

<style>
	.pb {
		display: flex;
		flex-direction: column;
		width: min(520px, 100%);
		margin: 0 auto;
		padding: 40px 0;
	}
	.pb.full {
		min-height: 100dvh;
		width: 100%;
		padding: 0 max(24px, env(safe-area-inset-left, 0px)) 24px;
		background: radial-gradient(80% 50% at 50% 20%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%);
	}
	.pb-top {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 56px;
	}
	.pb-top b {
		font: italic 400 25px/1 var(--f-serif, Georgia, serif);
	}
	.pb-m {
		font: italic 400 28px/1 var(--f-serif, Georgia, serif);
		color: var(--accent);
	}
	.pb-in {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 18px;
		width: min(520px, 100%);
		margin: 0 auto;
	}
	.pb-ring {
		width: 96px;
		height: 96px;
		border-radius: 50%;
		border: 2.5px solid var(--ink);
		display: grid;
		place-items: center;
	}
	.pb-ring :global(.ic) {
		width: 44px;
		height: 44px;
		stroke-width: 1.4;
	}
	h1 {
		margin: 0;
		font: 400 44px/1.02 var(--f-serif, Georgia, serif);
		letter-spacing: -0.01em;
	}
	h1 em {
		font-style: italic;
	}
	p {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.pb-ref {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border-radius: 12px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.pb-ref small {
		flex: 1;
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.pb-ref b {
		font-family: var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.06em;
		color: var(--ink);
	}
	.pb-note {
		display: grid;
		gap: 6px;
	}
	.pb-note span {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.pb-note textarea {
		padding: 12px 14px;
		border: 1px solid var(--line-strong, var(--line));
		background: var(--surface);
		color: var(--ink);
		font: 400 14.5px/1.4 inherit;
		resize: none;
	}
	.pb-acts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		padding-top: 4px;
	}
	.pb-acts :global(.btn) {
		height: 50px;
		justify-content: center;
	}
</style>
