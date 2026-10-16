<script lang="ts">
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// "Ask a question first": a quick question from her page, answered by email. No sign-in.
	let { creator }: { creator: string } = $props();
	let open = $state(false);
	let f = $state({ name: '', email: '', brand: '', body: '' });
	let busy = $state(false);
	let err = $state('');
	let sent = $state(false);

	async function send(e: SubmitEvent) {
		e.preventDefault();
		err = '';
		busy = true;
		const { error } = await supabase.rpc('ask_question', { p_name: f.name, p_email: f.email, p_brand: f.brand, p_body: f.body });
		busy = false;
		if (error) return (err = errMessage(error));
		sent = true;
		toast(`Sent. ${creator} will reply to ${f.email}`, 'send');
	}
</script>

<button class="btn sm" onclick={() => ((open = true), (sent = false))}><Icon name="mail" />Ask a question</button>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && (open = false)} />
{#if open}
	<div class="dialog-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (open = false)}>
		<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="aq-title">
			{#if sent}
				<h2 id="aq-title">Question sent</h2>
				<p>{creator} will reply to <b>{f.email}</b>. You don't need an account.</p>
				<div class="row"><button class="btn primary" onclick={() => ((open = false), (f.body = ''))}>Done</button></div>
			{:else}
				<form onsubmit={send}>
					<h2 id="aq-title">Ask {creator} a question</h2>
					<p>About rates, dates, content ideas or anything else, before you send a request. The reply comes by email.</p>
					<div class="f"><label for="aq-body">Your question</label><textarea class="inp" id="aq-body" rows="4" placeholder="e.g. Are you open to a Reel for our skincare launch in early December?" bind:value={f.body}></textarea></div>
					<div class="form-b" style="padding:0;margin-top:10px">
						<div class="f"><label for="aq-email">Your email</label><input class="inp" id="aq-email" type="email" autocomplete="email" bind:value={f.email} /></div>
						<div class="f"><label for="aq-name">Your name</label><input class="inp" id="aq-name" autocomplete="name" bind:value={f.name} /></div>
						<div class="f span2"><label for="aq-brand">Brand <span class="hint">(optional)</span></label><input class="inp" id="aq-brand" autocomplete="organization" bind:value={f.brand} /></div>
					</div>
					{#if err}<div class="err">{err}</div>{/if}
					<div class="row">
						<button type="button" class="btn ghost" onclick={() => (open = false)}>Cancel</button>
						<button type="submit" class="btn grad" disabled={busy || !f.body.trim() || !f.email.trim()}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}
