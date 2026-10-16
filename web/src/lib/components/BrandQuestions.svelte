<script lang="ts">
	import { onMount } from 'svelte';
	import { ask } from '../confirm.svelte';
	import { supabase } from '../supabase';
	import { toast, ui } from '../ui.svelte';
	import { errMessage, fmt } from '../util';
	import Icon from './Icon.svelte';

	// Questions brands asked from her page: reply by email, turn into a request, or close.
	type Q = { id: string; name: string; email: string; brand: string; body: string; created_at: string };
	let qs = $state<Q[]>([]);
	let replying = $state<string | null>(null);
	let answer = $state('');
	let busy = $state(false);

	async function load() {
		const { data } = await supabase.from('brand_questions').select('*').eq('closed', false).order('created_at', { ascending: false });
		qs = (data as Q[]) ?? [];
	}
	onMount(load);

	async function reply(q: Q) {
		busy = true;
		const { error } = await supabase.rpc('answer_question', { p_id: q.id, p_answer: answer });
		busy = false;
		if (error) return toast(errMessage(error), 'alert');
		toast(`Reply sent to ${q.email}`, 'send');
		replying = null;
		answer = '';
		load();
	}
	async function toRequest(q: Q) {
		await supabase.from('brand_questions').update({ closed: true }).eq('id', q.id);
		ui.pasteText = [q.brand && `From ${q.brand}`, q.name && `I'm ${q.name}`, q.email, q.body].filter(Boolean).join('\n');
		ui.newCollab = true;
		load();
	}
	async function close(q: Q) {
		if (!(await ask({ title: 'Close this question without replying?', ok: 'Close' }))) return;
		await supabase.from('brand_questions').update({ closed: true }).eq('id', q.id);
		load();
	}
</script>

{#if qs.length}
	<section class="panel rv bq-panel" style="--i:2">
		<div class="panel-h"><h2>Questions from brands</h2><small>{qs.length} waiting</small></div>
		{#each qs as q (q.id)}
			<div class="bq">
				<div class="bq-h"><b>{q.brand || q.name || q.email}</b><small>{q.name && q.brand ? `${q.name} · ` : ''}{q.email} · {fmt(q.created_at.slice(0, 10))}</small></div>
				<p>{q.body}</p>
				{#if replying === q.id}
					<textarea class="inp" rows="3" placeholder="Your reply (goes to {q.email})" bind:value={answer}></textarea>
					<div class="row-btns" style="border:0;padding:8px 0 0">
						<button class="btn sm ghost" onclick={() => (replying = null)}>Cancel</button>
						<button class="btn sm primary" disabled={busy || answer.trim().length < 2} onclick={() => reply(q)}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send reply</button>
					</div>
				{:else}
					<div class="row-btns" style="border:0;padding:6px 0 0">
						<button class="btn sm primary" onclick={() => ((replying = q.id), (answer = ''))}><Icon name="mail" />Reply</button>
						<button class="btn sm" onclick={() => toRequest(q)}><Icon name="plus" />Make it a request</button>
						<button class="btn sm ghost" onclick={() => close(q)}>Close</button>
					</div>
				{/if}
			</div>
		{/each}
	</section>
{/if}
