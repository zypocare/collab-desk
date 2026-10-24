<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fileUrl, getTicket, loadTickets, refreshSupportUnread, replyTicket, solveTicket, STATUS, topicLabel, uploadSupportFiles, type SupportFile, type Ticket } from '../../support.svelte';
	import { toast } from '../../ui.svelte';
	import Icon from '../Icon.svelte';
	import Logo from '../Logo.svelte';

	// One ticket: the conversation with Miracle support, screenshots on both sides, a reply box, and
	// marking it solved (with a quick rating) or opening it again.
	let { id, base }: { id: string; base: string } = $props();
	let t = $state<Ticket | null>(null);
	let missing = $state(false);
	let urls = $state<Record<string, string>>({});
	async function load() {
		const x = await getTicket(id).catch(() => null);
		if (!x) return void (missing = true);
		t = x;
		refreshSupportUnread();
		for (const m of x.messages) for (const f of m.files) if (!urls[f.path]) fileUrl(f.path).then((u) => (urls[f.path] = u));
	}
	let timer: ReturnType<typeof setInterval> | null = null;
	onMount(() => {
		load();
		// A reply may come while it's open.
		timer = setInterval(() => document.visibilityState === 'visible' && t && t.status !== 'solved' && load(), 30_000);
	});
	onDestroy(() => timer && clearInterval(timer));

	let body = $state('');
	let files = $state<File[]>([]);
	let busy = $state(false);
	async function send() {
		if (!t || (!body.trim() && !files.length) || busy) return;
		busy = true;
		try {
			const up: SupportFile[] = files.length ? await uploadSupportFiles(files) : [];
			t = await replyTicket(t.id, body.trim(), up);
			body = '';
			files = [];
			for (const m of t.messages) for (const f of m.files) if (!urls[f.path]) fileUrl(f.path).then((u) => (urls[f.path] = u));
			loadTickets().catch(() => {});
		} catch (err) {
			toast(err instanceof Error ? err.message : String(err), 'alert');
		} finally {
			busy = false;
		}
	}
	let rating = $state(0);
	let note = $state('');
	let rated = $state(false);
	async function solve(r: number | null = null) {
		if (!t) return;
		try {
			t = await solveTicket(t.id, r, note);
			if (r) rated = true;
			loadTickets().catch(() => {});
		} catch (err) {
			toast(err instanceof Error ? err.message : String(err), 'alert');
		}
	}
	const at = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
	const isImg = (f: SupportFile) => f.type.startsWith('image/');
</script>

{#if missing}
	<div class="tt-none"><b>That ticket isn't here</b><a class="btn" href="{base}/tickets"><Icon name="back" />Your tickets</a></div>
{:else if !t}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<div class="tt">
		<header class="tt-h rv">
			<a class="tt-eb" href="{base}/tickets"><Icon name="back" />Ticket #{t.number} · {topicLabel(t.category)}</a>
			<h1>{t.subject}</h1>
			<span class="tt-st {STATUS[t.status].tone}"><i></i>{STATUS[t.status].label}</span>
		</header>

		<ol class="tt-msgs">
			{#each t.messages as m (m.id)}
				<li class:team={m.from_team}>
					{#if m.from_team}<span class="tt-av"><Logo size={20} /></span>{/if}
					<div class="tt-bub">
						<span class="tt-who">{m.from_team ? 'Miracle support' : 'You'} · {at(m.created_at)}</span>
						{#if m.body}<p>{m.body}</p>{/if}
						{#if m.files.length}
							<div class="tt-files">
								{#each m.files as f (f.path)}
									<a href={urls[f.path] || undefined} target="_blank" rel="noopener" class:img={isImg(f)}>
										{#if isImg(f) && urls[f.path]}<img src={urls[f.path]} alt={f.name} loading="lazy" />{:else}<Icon name="doc" /><small>{f.name}</small>{/if}
									</a>
								{/each}
							</div>
						{/if}
					</div>
				</li>
			{/each}
			{#if t.status === 'open'}
				<li class="team tt-wait"><span class="tt-av"><Logo size={20} /></span><div class="tt-bub"><p>Thanks, we've got it. Someone from Miracle will reply here, usually within a working day.</p></div></li>
			{/if}
		</ol>

		{#if t.status === 'solved'}
			<section class="tt-solved rv">
				<b><Icon name="check" />Solved</b>
				{#if !rated && !t.rating}
					<span>How did we do?</span>
					<div class="tt-stars" role="radiogroup" aria-label="Rate the help">
						{#each [1, 2, 3, 4, 5] as n (n)}<button role="radio" aria-checked={rating === n} class:on={rating >= n} onclick={() => (rating = n)} aria-label="{n} of 5">★</button>{/each}
					</div>
					{#if rating}
						<input class="tt-note" bind:value={note} maxlength="500" placeholder="Anything we could do better? (optional)" />
						<button class="btn sm primary" onclick={() => solve(rating)}>Send rating</button>
					{/if}
				{:else}
					<span>Thanks for rating us{t.rating ? ` ${t.rating} of 5` : ''}.</span>
				{/if}
				<small>Not sorted after all? Reply below and it opens again.</small>
			</section>
		{/if}

		<div class="tt-reply">
			{#if files.length}<div class="tt-chosen">{#each files as f, i (f.name + i)}<span>{f.name}<button onclick={() => (files = files.filter((_, j) => j !== i))} aria-label="Remove {f.name}"><Icon name="x" /></button></span>{/each}</div>{/if}
			<div class="tt-row">
				<label class="tt-attach" aria-label="Add a screenshot"><Icon name="clip" /><input type="file" accept="image/*,video/mp4,video/quicktime,application/pdf" multiple onchange={(e) => { const i = e.currentTarget as HTMLInputElement; files = [...files, ...Array.from(i.files ?? [])].slice(0, 4); i.value = ''; }} /></label>
				<textarea bind:value={body} rows="1" maxlength="5000" placeholder={t.status === 'solved' ? 'Reply to open it again…' : 'Write a reply…'} aria-label="Your reply" onkeydown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send()}></textarea>
				<button class="btn primary tt-send" onclick={send} disabled={busy || (!body.trim() && !files.length)} aria-label="Send">{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}</button>
			</div>
			{#if t.status !== 'solved'}<button class="lnk tt-done" onclick={() => solve()}>It's sorted: mark as solved</button>{/if}
		</div>
	</div>
{/if}

<style>
	.tt {
		display: grid;
		gap: 18px;
		max-width: 760px;
		padding-bottom: 16px;
	}
	.tt-h {
		display: grid;
		gap: 8px;
	}
	.tt-eb {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: fit-content;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
		text-decoration: none;
	}
	.tt-eb :global(.ic) {
		width: 15px;
		height: 15px;
	}
	.tt-h h1 {
		margin: 0;
		font: 400 30px/1.1 var(--f-serif, Georgia, serif);
		text-wrap: balance;
	}
	.tt-st {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: fit-content;
		padding: 6px 12px;
		border-radius: 99px;
		background: var(--surface-2);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.tt-st i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warn);
	}
	.tt-st.hot i {
		background: var(--g2);
	}
	.tt-st.ok i {
		background: var(--ok);
	}
	.tt-msgs {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 14px;
	}
	.tt-msgs li {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}
	.tt-msgs li.team {
		justify-content: flex-start;
	}
	.tt-av {
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: var(--surface-2);
	}
	.tt-bub {
		display: grid;
		gap: 6px;
		max-width: min(86%, 560px);
		padding: 12px 14px;
		border-radius: 18px 18px 4px 18px;
		background: var(--ink);
		color: var(--bg);
	}
	.team .tt-bub {
		border-radius: 18px 18px 18px 4px;
		background: var(--surface);
		color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.tt-wait .tt-bub {
		background: none;
		box-shadow: inset 0 0 0 1px var(--line);
		border-style: dashed;
		color: var(--ink-3);
	}
	.tt-who {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		opacity: 0.65;
	}
	.tt-bub p {
		margin: 0;
		font-size: 15px;
		line-height: 1.55;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.tt-files {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.tt-files a {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		border-radius: 10px;
		background: color-mix(in oklab, currentColor 10%, transparent);
		color: inherit;
		font-size: 12px;
		text-decoration: none;
	}
	.tt-files a.img {
		padding: 0;
		width: 110px;
		height: 150px;
		overflow: hidden;
	}
	.tt-files img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.tt-files :global(.ic) {
		width: 15px;
		height: 15px;
	}
	.tt-solved {
		display: grid;
		justify-items: start;
		gap: 8px;
		padding: 16px;
		border-radius: 18px;
		background: color-mix(in oklab, var(--ok) 10%, var(--surface));
	}
	.tt-solved b {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font: 400 20px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ok);
	}
	.tt-solved b :global(.ic) {
		width: 18px;
		height: 18px;
	}
	.tt-solved small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.tt-stars {
		display: flex;
		gap: 4px;
	}
	.tt-stars button {
		width: 40px;
		height: 40px;
		border: 0;
		background: none;
		font-size: 28px;
		line-height: 1;
		color: var(--line-strong, var(--ink-3));
		cursor: pointer;
	}
	.tt-stars button.on {
		color: var(--g3);
	}
	.tt-note {
		width: 100%;
		box-sizing: border-box;
		padding: 12px 14px;
		border: 0;
		border-radius: 12px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink);
		font: inherit;
	}
	.tt-reply {
		position: sticky;
		bottom: calc(var(--m-tabs, 0px) + env(safe-area-inset-bottom, 0px) + 8px);
		display: grid;
		gap: 8px;
		padding: 10px;
		border-radius: 20px;
		background: color-mix(in oklab, var(--surface) 92%, transparent);
		box-shadow: inset 0 0 0 1px var(--line-strong, var(--line)), 0 -12px 30px -20px rgba(0, 0, 0, 0.5);
		-webkit-backdrop-filter: blur(14px);
		backdrop-filter: blur(14px);
	}
	.tt-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 8px;
		align-items: end;
	}
	.tt-row textarea {
		min-height: 44px;
		max-height: 160px;
		padding: 11px 12px;
		border: 0;
		border-radius: 12px;
		background: var(--surface-2);
		color: var(--ink);
		font: 400 15.5px/1.4 var(--f-body, system-ui);
		resize: none;
		field-sizing: content;
	}
	.tt-row textarea:focus {
		outline: 0;
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.tt-attach {
		position: relative;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		color: var(--ink-2);
		cursor: pointer;
	}
	.tt-attach :global(.ic) {
		width: 20px;
		height: 20px;
	}
	.tt-attach input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.tt-send {
		width: 48px;
		min-width: 48px;
		height: 44px;
		padding: 0;
	}
	.tt-chosen {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.tt-chosen span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 4px 4px 10px;
		border-radius: 99px;
		background: var(--surface-2);
		font-size: 12px;
	}
	.tt-chosen button {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--ink-3);
		cursor: pointer;
	}
	.tt-chosen :global(.ic) {
		width: 13px;
		height: 13px;
	}
	.tt-done {
		justify-self: center;
		font-size: 13px;
		color: var(--ink-2);
	}
	.tt-none {
		display: grid;
		justify-items: start;
		gap: 12px;
		padding: 30px 0;
	}
</style>
