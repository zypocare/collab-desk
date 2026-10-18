<script lang="ts">
	import { onMount } from 'svelte';
	import { askAi, collabFacts } from '../ai';
	import type { Nudge } from '../nudges';
	import { portal } from '../portal';
	import { reloadOne, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage, inr } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';
	import { styleSamples } from '../desk';

	// A nudge for a brand that went quiet: the free AI writes it (firmer each time), she edits it and
	// sends it into the collab's chat (the brand gets it by email), or copies it for WhatsApp/Instagram.
	let { n, onclose }: { n: Nudge; onclose: () => void } = $props();

	let text = $state('');
	let busy = $state(false);
	let sending = $state(false);
	const link = $derived(n.invoice && studio.settings ? `${studio.settings.site_url.replace(/\/$/, '')}/invoice/${n.invoice.token}` : '');

	async function write() {
		busy = true;
		try {
			const r = await askAi<{ text: string }>('nudge', {
				kind: n.kind,
				why: n.why,
				tries: n.tries,
				facts: {
					...collabFacts(n.c, studio.settings),
					...(n.invoice ? { invoice: n.invoice.number, amount_due: inr(n.invoice.payable), invoice_link: link } : {}),
					days_waiting: n.days
				},
				thread: (n.c.messages ?? []).slice(-6).map((m) => ({ from: m.sender, text: m.body })),
				style: styleSamples()
			});
			text = r.text;
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		busy = false;
	}
	onMount(write);

	async function log(note: string, kind = 'nudge') {
		await supabase.from('collab_events').insert({ collab_id: n.c.id, kind, text: note, visible_to_brand: false });
	}
	async function send() {
		if (!text.trim() || sending) return;
		sending = true;
		const { error } = await supabase.from('collab_messages').insert({ collab_id: n.c.id, sender: 'creator', body: text.trim() });
		if (error) {
			sending = false;
			return toast(`Couldn't send: ${errMessage(error)}`, 'alert');
		}
		await log(`Nudge sent: ${n.why}`);
		await reloadOne(n.c.id);
		sending = false;
		toast(`Sent to ${n.c.brand.name}. They get it by email.`, 'send');
		onclose();
	}
	async function copied() {
		copyText(text, 'Copied. Paste it in WhatsApp or Instagram.');
		await log(`Nudge copied: ${n.why}`);
		await reloadOne(n.c.id);
	}
	async function snooze() {
		await log('Nudge snoozed for 3 days', 'nudge_snooze');
		await reloadOne(n.c.id);
		toast('Snoozed for 3 days', 'clock');
		onclose();
	}
	const TRY = ['First nudge: friendly', 'Second nudge: a little firmer', 'Firm nudge'];
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog ng" role="dialog" aria-modal="true" aria-labelledby="nd-title">
		<header class="ng-h">
			<div>
				<span class="eb">Nudge <span class="ai-tag"><Icon name="spark" />AI</span></span>
				<h2 id="nd-title">{n.c.brand.name}</h2>
				<small>{n.why} · {TRY[Math.min(2, n.tries)]}</small>
			</div>
			<button class="icon-btn" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
		</header>
		{#if busy}
			<div class="ng-busy"><AiThinking label="Writing a nudge" /></div>
		{:else}
			<textarea class="inp ng-text" rows="6" aria-label="Message" bind:value={text}></textarea>
			<div class="ng-acts">
				{#if n.c.contact_email}<button class="btn grad" disabled={!text.trim() || sending} onclick={send}>{#if sending}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send to {n.c.brand.name}</button>{/if}
				<button class="btn" disabled={!text.trim()} onclick={copied}><Icon name="copy" />Copy</button>
				<button class="btn ghost" onclick={write}><Icon name="refresh" />Write again</button>
			</div>
			<p class="ng-tip">{n.c.contact_email ? 'Sent in the collab chat: the brand gets it by email and replies on their request page.' : 'No brand email on this collab, so copy it into WhatsApp or Instagram.'} <button class="lnk" onclick={snooze}>Not now (snooze 3 days)</button></p>
		{/if}
	</div>
</div>
