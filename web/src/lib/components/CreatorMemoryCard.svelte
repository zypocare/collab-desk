<script lang="ts">
	import { onMount } from 'svelte';
	import { getCreatorMemory, saveCreatorMemory } from '../brandOs';
	import { toast } from '../ui.svelte';
	import { errMessage, inr } from '../util';
	import Icon from './Icon.svelte';

	let { creatorId, creatorName }: { creatorId: number; creatorName: string } = $props();

	let loaded = $state(false);
	let busy = $state(false);
	let editing = $state(false);
	let lastQuoted = $state(0);
	let lastSettled = $state(0);
	let preferredFormat = $state('1 Reel + 2 Stories');
	let privateNotes = $state('');

	onMount(async () => {
		try {
			const m = await getCreatorMemory(creatorId);
			if (m) {
				lastQuoted = Number(m.last_quoted || 0);
				lastSettled = Number(m.last_settled || 0);
				preferredFormat = m.preferred_format || '1 Reel + 2 Stories';
				privateNotes = m.private_notes || '';
			}
		} catch {
			// Migration may not be applied yet.
		} finally {
			loaded = true;
		}
	});

	const savings = $derived(lastQuoted > lastSettled && lastSettled > 0 ? lastQuoted - lastSettled : 0);

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		try {
			await saveCreatorMemory({
				creator_id: creatorId,
				last_quoted: Number(lastQuoted) || 0,
				last_settled: Number(lastSettled) || 0,
				preferred_format: preferredFormat.trim(),
				private_notes: privateNotes.trim()
			});
			editing = false;
			toast('Negotiation memory saved (team only)', 'check');
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

{#if loaded}
	<section class="cm-card" aria-label="Creator negotiation memory">
		<header class="cm-head">
			<div>
				<span class="cm-eb">Creator CRM · Team Only</span>
				<h3>Rate-card &amp; negotiation memory</h3>
			</div>
			<button type="button" class="cm-btn" onclick={() => (editing = !editing)}>
				<Icon name="edit" />{editing ? 'Cancel' : 'Edit'}
			</button>
		</header>

		{#if editing}
			<form class="cm-form" onsubmit={save}>
				<div class="cm-two">
					<label><span>Last quoted (₹)</span><input class="cm-inp" type="number" min="0" bind:value={lastQuoted} /></label>
					<label><span>Last settled (₹)</span><input class="cm-inp" type="number" min="0" bind:value={lastSettled} /></label>
				</div>
				<label><span>Best working format</span><input class="cm-inp" type="text" placeholder="e.g. 1 Reel + 2 Stories" bind:value={preferredFormat} /></label>
				<label><span>Private team notes for {creatorName}</span><textarea class="cm-ta" rows="3" placeholder="e.g. Delivers 1 day early, responds fast on WhatsApp, best for skincare demos" bind:value={privateNotes}></textarea></label>
				<button type="submit" class="cm-save" disabled={busy}>{#if busy}<span class="spinner"></span>Saving…{:else}Save memory{/if}</button>
			</form>
		{:else}
			<div class="cm-stats">
				<div><small>Last quoted</small><b>{lastQuoted ? inr(lastQuoted) : '—'}</b></div>
				<div><small>Last settled</small><b>{lastSettled ? inr(lastSettled) : '—'}</b></div>
				<div><small>Negotiated savings</small><b class:ok={savings > 0}>{savings ? inr(savings) : '—'}</b></div>
			</div>
			<div class="cm-meta">
				<span><b>Format:</b> {preferredFormat || 'Not set'}</span>
				<p>{privateNotes || `No private notes saved for ${creatorName} yet. Tap Edit to record rate history and delivery notes.`}</p>
			</div>
		{/if}
	</section>
{/if}

<style>
	.cm-card {
		display: grid;
		gap: 12px;
		padding: 16px;
		margin: 14px 0;
		border-radius: 20px;
		background: linear-gradient(180deg, rgba(31, 24, 34, 0.94) 0%, rgba(21, 16, 23, 0.98) 100%);
		border: 1px solid rgba(255, 255, 255, 0.09);
		color: #faf7fc;
	}
	.cm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.cm-eb {
		display: inline-block;
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text; background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.cm-head h3 { margin: 3px 0 0; font: 400 22px/1.1 var(--f-serif, Georgia, serif); color: #faf7fc; }
	.cm-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 7px 11px;
		border-radius: 9px;
		background: #241c27;
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: #faf7fc;
		font: 700 11.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
	}
	.cm-btn :global(.ic) { width: 13px; height: 13px; }
	.cm-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.cm-stats > div { padding: 10px; border-radius: 13px; background: rgba(13, 10, 14, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); }
	.cm-stats small { display: block; font-size: 10.5px; color: #8f8499; margin-bottom: 3px; }
	.cm-stats b { font: 700 15px/1.1 var(--f-mono, ui-monospace, monospace); color: #faf7fc; }
	.cm-stats b.ok { color: #3ce29b; }
	.cm-meta { display: grid; gap: 5px; font-size: 12.5px; color: #cfc6d6; }
	.cm-meta p { margin: 0; color: #8f8499; line-height: 1.45; }
	.cm-form { display: grid; gap: 10px; }
	.cm-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
	.cm-form label { display: grid; gap: 5px; }
	.cm-form span { font: 700 10px/1 var(--f-mono, ui-monospace, monospace); text-transform: uppercase; letter-spacing: 0.08em; color: #8f8499; }
	.cm-inp, .cm-ta {
		width: 100%;
		padding: 10px 12px;
		box-sizing: border-box;
		border-radius: 11px;
		background: rgba(12, 9, 14, 0.9);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: #faf7fc;
		font: 400 14px/1.35 var(--f-body, system-ui, sans-serif);
		outline: none;
	}
	.cm-inp:focus, .cm-ta:focus { border-color: #f25a90; }
	.cm-save {
		justify-self: start;
		padding: 10px 16px;
		border: 0;
		border-radius: 10px;
		background: #faf7fc;
		color: #140e16;
		font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		box-shadow: 0 3px 0 0 #f25a90;
		cursor: pointer;
	}
</style>
