<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// A brand reviews the creator once the collab is done (the same review the email asks for). Four and five
	// stars show on her page; every review counts towards her standing on Explore.
	let { code, name }: { code: string; name: string } = $props();
	let done = $state<boolean | null>(null);
	let stars = $state(0);
	let body = $state('');
	let busy = $state(false);
	onMount(async () => {
		const { data } = await supabase.rpc('review_done', { p_code: code });
		done = !!data;
	});
	async function send() {
		if (!stars) return;
		busy = true;
		const { error } = await supabase.rpc('review_from_brand', { p_code: code, p_rating: stars, p_body: body });
		busy = false;
		if (error) return toast(errMessage(error), 'alert');
		done = true;
		toast(`Thank you. Your review of ${name} is saved.`, 'check');
	}
	const WORDS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Outstanding'];
</script>

{#if done === false}
	<section class="panel rv rc" aria-label="Review {name}">
		<div class="panel-h"><h2>How was working with {name}?</h2><small>helps other brands</small></div>
		<div class="rc-stars" role="radiogroup" aria-label="Stars">
			{#each [1, 2, 3, 4, 5] as n (n)}
				<button role="radio" aria-checked={stars === n} aria-label="{n} star{n === 1 ? '' : 's'}" class:on={stars >= n} onclick={() => (stars = n)}>★</button>
			{/each}
			{#if stars}<span class="rc-word">{WORDS[stars]}</span>{/if}
		</div>
		{#if stars}
			<label class="sr" for="rc-body">A line about it (optional)</label>
			<textarea id="rc-body" class="inp" rows="2" maxlength="300" placeholder="What stood out? (optional, shown on their page with 4 or 5 stars)" bind:value={body}></textarea>
			<button class="btn primary" disabled={busy} onclick={send}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Save review</button>
		{/if}
	</section>
{:else if done}
	<p class="rc-done"><Icon name="check" />You reviewed {name}. Thank you.</p>
{/if}

<style>
	.rc { display: grid; gap: 12px; }
	.rc-stars { display: flex; align-items: center; gap: 4px; }
	.rc-stars button { border: 0; background: none; padding: 2px 4px; font-size: 32px; line-height: 1; color: var(--line-strong); cursor: pointer; transition: transform .15s, color .15s; }
	.rc-stars button.on { color: #F2B544; }
	.rc-stars button:active { transform: scale(.9); }
	.rc-word { margin-left: 8px; font-weight: 700; color: var(--ink-2); }
	.rc :global(.btn) { justify-self: start; }
	.rc-done { display: flex; align-items: center; gap: 8px; color: var(--ok); font-weight: 600; margin: 8px 0 16px; }
	.rc-done :global(.ic) { width: 16px; height: 16px; }
</style>
