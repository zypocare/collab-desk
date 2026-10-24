<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { auth } from '../../auth.svelte';
	import { ARTICLES, search } from '../../help/articles';
	import { supportDevice } from '../../problems';
	import { createTicket, loadTickets, TOPICS, uploadSupportFiles } from '../../support.svelte';
	import { toast } from '../../ui.svelte';
	import Icon from '../Icon.svelte';
	import { takeAsk, type Tried } from './helpFlow';

	// Contact support: what it's about, in their words, with screenshots. Guides that might answer it show
	// as they type; what they tried in Help (and their phone and app version) goes with the ticket.
	let { side, base, name = '' }: { side: 'creator' | 'brand'; base: string; name?: string } = $props();
	const topics = $derived(TOPICS.filter((t) => !t.side || t.side === side));
	let topic = $state('');
	let subject = $state('');
	let body = $state('');
	let files = $state<File[]>([]);
	let previews = $state<string[]>([]);
	let busy = $state(false);
	let error = $state('');
	let tried = $state<Tried | null>(null);
	onMount(() => {
		tried = takeAsk();
		if (tried?.q) {
			subject = tried.q.length <= 80 ? tried.q : tried.q.slice(0, 77) + '…';
			body = tried.q.length > 80 ? tried.q : '';
		}
		if (tried?.article && !subject) subject = `About “${tried.article}”`;
	});
	const device = supportDevice();
	const deviceText = [device.device, device.app ? `app ${device.app}` : ''].filter(Boolean).join(' · ');
	const suggest = $derived((subject + ' ' + body).trim().length >= 8 && !tried?.sources?.length ? search(subject + ' ' + body, side, 3) : []);

	function pick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const add = Array.from(input.files ?? []);
		input.value = '';
		const next = [...files, ...add].slice(0, 4);
		if (next.some((f) => f.size > 10 * 1024 * 1024)) return toast('Each file can be up to 10 MB.', 'alert');
		previews.forEach((u) => URL.revokeObjectURL(u));
		files = next;
		previews = next.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : ''));
	}
	function drop(i: number) {
		files = files.filter((_, j) => j !== i);
		previews = previews.filter((_, j) => j !== i);
	}
	async function send(e: Event) {
		e.preventDefault();
		error = '';
		if (!topic) return (error = 'Pick what it’s about.');
		if (subject.trim().length < 3) return (error = 'Say in a few words what it’s about.');
		if (body.trim().length < 10) return (error = 'Tell us a little more, so we can help the first time.');
		busy = true;
		try {
			const up = files.length ? await uploadSupportFiles(files) : [];
			const t = await createTicket({
				category: topic,
				subject: subject.trim(),
				body: body.trim(),
				name: name || (auth.account?.role === 'brand' ? auth.account.full_name : '') || '',
				files: up,
				tried: tried ? { question: tried.q, ai: tried.answer, guides: tried.sources, article: tried.article ?? '' } : {}
			});
			await loadTickets().catch(() => {});
			toast(`Ticket #${t.number} sent. We'll reply here and by email.`, 'check');
			goto(`${base}/tickets/${t.id}`, { replaceState: true });
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}
	const bySlug = (s: string) => ARTICLES.find((a) => a.slug === s);
</script>

<form class="nt rv" onsubmit={send}>
	<header class="nt-h">
		<span class="nt-eb">Contact support</span>
		<h1>Tell us what's <em>wrong</em></h1>
		<p>A person from Miracle reads every ticket and replies here and by email, usually within a working day.</p>
	</header>

	{#if tried && (tried.answer || tried.sources.length)}
		<div class="nt-tried">
			<Icon name="spark" />
			<span><b>We'll show the team what you already tried</b><small>{tried.answer ? 'Your question, Miracle’s answer' : 'The guide you read'}{tried.sources.length ? ` and ${tried.sources.map((s) => bySlug(s)?.title).filter(Boolean).join(', ')}` : ''}.</small></span>
		</div>
	{/if}

	<fieldset class="nt-f">
		<legend>What's it about?</legend>
		<div class="nt-topics">
			{#each topics as t (t.id)}
				<button type="button" class="nt-topic" class:on={topic === t.id} aria-pressed={topic === t.id} onclick={() => (topic = t.id)}><Icon name={t.icon} />{t.label}</button>
			{/each}
		</div>
	</fieldset>

	<label class="nt-f">
		<span>In a few words</span>
		<input class="nt-in" bind:value={subject} maxlength="140" placeholder={side === 'brand' ? 'e.g. Can’t accept a quote' : 'e.g. Invoice shows the wrong GST'} />
	</label>

	<label class="nt-f">
		<span>What happened</span>
		<textarea class="nt-in" bind:value={body} rows="6" maxlength="5000" placeholder="What you were doing, what you expected, and what happened instead. Which brand or collab, if it's about one."></textarea>
	</label>

	{#if suggest.length}
		<div class="nt-sug">
			<small>These guides might answer it</small>
			{#each suggest as a (a.slug)}<a href="{base}/{a.slug}" target="_blank" rel="noopener"><Icon name="doc" />{a.title}</a>{/each}
		</div>
	{/if}

	<div class="nt-f">
		<span>Screenshots <em>(up to 4, optional)</em></span>
		<div class="nt-files">
			{#each files as f, i (f.name + i)}
				<div class="nt-file">
					{#if previews[i]}<img src={previews[i]} alt="" />{:else}<Icon name="doc" />{/if}
					<small>{f.name}</small>
					<button type="button" onclick={() => drop(i)} aria-label="Remove {f.name}"><Icon name="x" /></button>
				</div>
			{/each}
			{#if files.length < 4}
				<label class="nt-add"><Icon name="image" /><span>Add</span><input type="file" accept="image/*,video/mp4,video/quicktime,application/pdf" multiple onchange={pick} /></label>
			{/if}
		</div>
	</div>

	<p class="nt-dev"><Icon name="info" />We'll also include: {deviceText || 'your browser'}, and the last few screens you used. Never your messages, rates or bank details.</p>

	{#if error}<p class="nt-err" role="alert">{error}</p>{/if}
	<button class="btn primary nt-send" disabled={busy}>{#if busy}<span class="spinner"></span>Sending…{:else}<Icon name="send" />Send to Miracle support{/if}</button>
</form>

<style>
	.nt {
		display: grid;
		gap: 18px;
		max-width: 680px;
		padding-bottom: 20px;
	}
	.nt-h {
		display: grid;
		gap: 8px;
	}
	.nt-eb,
	.nt-f > span,
	.nt-f legend {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.nt-h h1 {
		margin: 0;
		font: 400 36px/1.05 var(--f-serif, Georgia, serif);
	}
	.nt-h h1 em {
		font-style: italic;
		background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3));
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		padding-right: 4px;
	}
	.nt-h p {
		margin: 0;
		font-size: 14.5px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.nt-tried {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 12px;
		padding: 14px 16px;
		border-radius: 16px;
		background: color-mix(in oklab, var(--g1) 12%, var(--surface));
	}
	.nt-tried :global(.ic) {
		width: 18px;
		height: 18px;
		margin-top: 2px;
		color: var(--g1);
	}
	.nt-tried b {
		display: block;
		font-size: 14px;
	}
	.nt-tried small {
		font-size: 13px;
		color: var(--ink-2);
	}
	.nt-f {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.nt-f legend {
		margin-bottom: 8px;
	}
	.nt-f em {
		font-style: normal;
		letter-spacing: 0.04em;
		text-transform: none;
		font-weight: 500;
	}
	.nt-topics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.nt-topic {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 10px 12px;
		border: 0;
		border-radius: 14px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		font: 600 14px/1.2 var(--f-body, system-ui);
		text-align: left;
		cursor: pointer;
	}
	.nt-topic :global(.ic) {
		flex: none;
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}
	.nt-topic.on {
		background: var(--ink);
		color: var(--bg);
		box-shadow: none;
	}
	.nt-topic.on :global(.ic) {
		color: var(--bg);
	}
	.nt-in {
		width: 100%;
		box-sizing: border-box;
		padding: 14px 16px;
		border: 0;
		border-radius: 14px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong, var(--line));
		color: var(--ink);
		font: 400 16px/1.5 var(--f-body, system-ui);
		resize: vertical;
	}
	.nt-in:focus {
		outline: 0;
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.nt-sug {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.nt-sug small {
		width: 100%;
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.nt-sug a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: 99px;
		box-shadow: inset 0 0 0 1px var(--line-strong, var(--line));
		color: var(--ink);
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
	}
	.nt-sug :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.nt-files {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.nt-file,
	.nt-add {
		position: relative;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 4px;
		width: 92px;
		height: 120px;
		border-radius: 14px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
	}
	.nt-file img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.nt-file small {
		position: relative;
		max-width: 84px;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 11px;
		color: var(--ink-3);
	}
	.nt-file:has(img) small {
		display: none;
	}
	.nt-file button {
		position: absolute;
		top: 4px;
		right: 4px;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: 0;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		cursor: pointer;
	}
	.nt-file button :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.nt-add {
		border: 1.5px dashed var(--line-strong, var(--line));
		box-shadow: none;
		background: none;
		color: var(--ink-2);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}
	.nt-add :global(.ic) {
		width: 22px;
		height: 22px;
	}
	.nt-add input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.nt-dev {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 8px;
		margin: 0;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--ink-3);
	}
	.nt-dev :global(.ic) {
		width: 15px;
		height: 15px;
		margin-top: 2px;
	}
	.nt-err {
		margin: 0;
		color: var(--bad);
		font-weight: 600;
	}
	.nt-send {
		width: 100%;
	}
	@media (min-width: 761px) {
		.nt-topics {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
		.nt-send {
			width: auto;
			justify-self: start;
		}
	}
</style>
