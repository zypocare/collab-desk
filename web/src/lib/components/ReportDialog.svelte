<script lang="ts">
	import { untrack } from 'svelte';
	import { portal } from '../portal';
	import { BRAND_REASONS, CREATOR_REASONS, report } from '../safety.svelte';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// Report a brand (as a creator) or a creator (as a brand), and block them too if you want.
	// They never learn who reported them. A dialog on a laptop, a sheet from the bottom on a phone.
	let {
		side,
		name,
		target,
		block: blockFirst = false,
		onclose,
		ondone
	}: {
		/** Who is reporting. */
		side: 'creator' | 'brand';
		name: string;
		target: { collab_id?: string; brand_id?: string; creator_id?: number };
		block?: boolean;
		onclose: () => void;
		ondone?: (blocked: boolean) => void;
	} = $props();
	const reasons = $derived(side === 'creator' ? BRAND_REASONS : CREATOR_REASONS);
	let reason = $state('');
	let details = $state('');
	let alsoBlock = $state(untrack(() => blockFirst || side === 'creator'));
	let busy = $state(false);
	async function send(e: SubmitEvent) {
		e.preventDefault();
		if (!reason) return toast("Pick what's wrong", 'alert');
		busy = true;
		try {
			const r = await report({ ...target, reason, details: details.trim(), block: alsoBlock });
			toast(r.blocked ? `Reported and blocked ${name}. We'll look within a day.` : `Thanks. We'll look at ${name} within a day.`, 'check');
			ondone?.(r.blocked);
			onclose();
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim rp-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog rp" role="dialog" aria-modal="true" aria-labelledby="rp-t"><form class="rp-f" onsubmit={send}>
		<i class="rp-grab" aria-hidden="true"></i>
		<header class="rp-h">
			<div><h2 id="rp-t">Report {name}</h2><small>They won't know who reported them.</small></div>
			<button class="icon-btn" type="button" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
		</header>
		<fieldset class="rp-why">
			<legend>What's wrong</legend>
			{#each reasons as r (r.id)}
				<label class:on={reason === r.id}><input type="radio" name="rp-why" value={r.id} bind:group={reason} />{r.label}</label>
			{/each}
		</fieldset>
		<label class="rp-more"><span>Anything to add (optional)</span><textarea rows="2" maxlength="1000" bind:value={details} placeholder={side === 'creator' ? 'The UPI ID they gave, or what happened' : 'What happened, and when'}></textarea></label>
		<label class="rp-block"><input type="checkbox" bind:checked={alsoBlock} /><span><b>Block them too</b><small>{side === 'creator' ? 'They can’t send you requests or messages. An open request moves to Declined.' : 'They drop out of Discover and your pools, and can’t message you.'}</small></span></label>
		<div class="rp-acts">
			<button class="btn primary" type="submit" disabled={busy}>{#if busy}<span class="spinner"></span>{/if}{alsoBlock ? 'Report and block' : 'Send report'}</button>
			<button class="btn" type="button" onclick={onclose}>Cancel</button>
		</div>
		<small class="rp-note">We look at every report within a day{side === 'brand' ? ' and may ask you for proof' : ''}. Unblock anyone later in Settings › Blocked.</small>
	</form></div>
</div>

<style>
	.rp {
		width: min(520px, 100%);
		padding: 26px;
		max-height: min(92dvh, 860px);
		overflow-y: auto;
	}
	.rp-f {
		display: grid;
		gap: 16px;
	}
	.rp-grab {
		display: none;
	}
	.rp-h {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.rp-h > div {
		flex: 1;
		display: grid;
		gap: 4px;
	}
	.rp-h h2 {
		margin: 0;
		font: 400 32px/1.1 var(--f-serif, Georgia, serif);
	}
	.rp-h small,
	.rp-note {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.rp-why {
		margin: 0;
		padding: 0;
		border: 0;
		display: grid;
		gap: 6px;
	}
	.rp-why legend,
	.rp-more span {
		padding: 0 0 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.rp-why label {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 46px;
		padding: 0 14px;
		border-radius: 12px;
		box-shadow: inset 0 0 0 1px var(--line);
		font-size: 14.5px;
		cursor: pointer;
	}
	.rp-why label.on {
		background: var(--surface-2, var(--surface));
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.rp input[type='radio'],
	.rp input[type='checkbox'] {
		accent-color: var(--accent);
	}
	.rp-more {
		display: grid;
	}
	.rp-more textarea {
		padding: 12px 14px;
		border: 1px solid var(--line-strong, var(--line));
		background: var(--bg);
		color: var(--ink);
		font: 400 14px/1.4 inherit;
		resize: none;
	}
	.rp-block {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		cursor: pointer;
	}
	.rp-block input {
		margin-top: 3px;
	}
	.rp-block span {
		display: grid;
		gap: 2px;
	}
	.rp-block small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.rp-acts {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 12px;
	}
	.rp-acts :global(.btn) {
		height: 50px;
		justify-content: center;
	}
	@media (max-width: 640px) {
		.rp-scrim {
			align-items: flex-end;
			padding: 0;
		}
		.rp {
			width: 100%;
			border-radius: 26px 26px 0 0;
			padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
		}
		.rp-grab {
			display: block;
			justify-self: center;
			width: 40px;
			height: 4px;
			border-radius: 99px;
			background: var(--line-strong, var(--line));
		}
		.rp-h .icon-btn {
			display: none;
		}
		.rp-h h2 {
			font-size: 28px;
		}
		.rp-acts {
			grid-template-columns: 1fr;
		}
		.rp-acts .btn:not(.primary) {
			display: none;
		}
		.rp-note {
			text-align: center;
		}
	}
</style>
