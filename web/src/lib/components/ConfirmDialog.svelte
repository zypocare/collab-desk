<script lang="ts">
	import { portal } from '../portal';
	import { answer, asking } from '../confirm.svelte';
	import Icon from './Icon.svelte';

	// Shown by ask() from anywhere in the app. Enter confirms, Escape or a tap outside cancels.
	let okBtn = $state<HTMLButtonElement>();
	$effect(() => {
		if (asking.q) queueMicrotask(() => okBtn?.focus());
	});
</script>

<svelte:window onkeydown={(e) => asking.q && e.key === 'Escape' && (e.stopPropagation(), answer(false))} />

{#if asking.q}
	{@const q = asking.q}
	<div class="dialog-scrim confirm-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && answer(false)}>
		<div class="dialog confirm-dlg" role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby={q.body ? 'cf-body' : undefined}>
			<span class="cf-ic" class:danger={q.danger}><Icon name={q.danger ? 'alert' : 'check'} /></span>
			<h2 id="cf-title">{q.title}</h2>
			{#if q.body}<p id="cf-body">{q.body}</p>{/if}
			{#if q.note}<div class="f cf-note"><label for="cf-note">{q.note}</label><textarea class="inp" id="cf-note" rows="3" maxlength="600" placeholder={q.placeholder ?? ''} bind:value={asking.text}></textarea></div>{/if}
			<div class="row">
				<button class="btn ghost" onclick={() => answer(false)}>{q.cancel ?? 'Cancel'}</button>
				<button class="btn {q.danger ? 'danger-solid' : 'primary'}" bind:this={okBtn} onclick={() => answer(true)}>{q.ok ?? 'Yes'}</button>
			</div>
		</div>
	</div>
{/if}
