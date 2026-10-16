<script lang="ts">
	import { portal } from '../portal';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { auth } from '../auth.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// "Ask a question first": a quick question from her page, answered by email. Needs a sign-in (a code
	// to their email), so the reply always goes to an address they've confirmed.
	let { creator }: { creator: string } = $props();
	let open = $state(false);
	let f = $state({ name: '', brand: '', body: '' });
	let busy = $state(false);
	let err = $state('');
	let sent = $state(false);
	const email = $derived(auth.session?.user.email ?? '');

	function start() {
		if (!auth.session) {
			// Back to this page after signing in, with the question box open.
			const back = `${page.url.pathname}?ask=1`;
			return goto(`/login?next=${encodeURIComponent(back)}`);
		}
		const a = auth.account;
		if (a?.role === 'brand') {
			f.name ||= a.full_name ?? '';
			f.brand ||= a.brand?.name ?? '';
		}
		sent = false;
		err = '';
		open = true;
	}
	onMount(() => {
		if (page.url.searchParams.get('ask') === '1') {
			// Came back from signing in: tidy the address and open the box.
			const u = new URL(page.url);
			u.searchParams.delete('ask');
			history.replaceState(history.state, '', u.pathname + u.search);
			if (auth.session) start();
		}
	});

	async function send(e: SubmitEvent) {
		e.preventDefault();
		err = '';
		busy = true;
		const { error } = await supabase.rpc('ask_question', { p_name: f.name, p_email: email, p_brand: f.brand, p_body: f.body });
		busy = false;
		if (error) return (err = errMessage(error));
		sent = true;
		toast(`Sent. ${creator} will reply to ${email}`, 'send');
	}
</script>

<button class="btn sm" onclick={start}><Icon name="mail" />Ask a question</button>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && (open = false)} />
{#if open}
	<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (open = false)}>
		<div class="dialog ask-dialog" role="dialog" aria-modal="true" aria-labelledby="aq-title">
			{#if sent}
				<h2 id="aq-title">Question sent</h2>
				<p>{creator} will reply to <b>{email}</b>.</p>
				<div class="row"><button class="btn primary" onclick={() => ((open = false), (f.body = ''))}>Done</button></div>
			{:else}
				<form onsubmit={send}>
					<h2 id="aq-title">Ask {creator} a question</h2>
					<p>About rates, dates, content ideas or anything else, before you send a request.</p>
					<div class="ask-fields">
						<div class="f"><label for="aq-body">Your question</label><textarea class="inp" id="aq-body" rows="5" placeholder="e.g. Are you open to a Reel for our skincare launch in early December?" bind:value={f.body}></textarea></div>
						<div class="ask-reply"><Icon name="mail" /><span>The reply comes to <b>{email}</b></span></div>
						<div class="ask-two">
							<div class="f"><label for="aq-name">Your name</label><input class="inp" id="aq-name" autocomplete="name" placeholder="Priya Shah" bind:value={f.name} /></div>
							<div class="f"><label for="aq-brand">Brand <span class="hint">(optional)</span></label><input class="inp" id="aq-brand" autocomplete="organization" placeholder="Glowberry Cosmetics" bind:value={f.brand} /></div>
						</div>
					</div>
					{#if err}<div class="err">{err}</div>{/if}
					<div class="row">
						<button type="button" class="btn ghost" onclick={() => (open = false)}>Cancel</button>
						<button type="submit" class="btn grad" disabled={busy || f.body.trim().length < 3}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}
