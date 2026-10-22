<script lang="ts">
	import { askAi } from '../ai';
	import { lintDisclosure, lintScore, videoSeconds } from '../asci';
	import type { Collab } from '../types';
	import Icon from './Icon.svelte';

	// Before the brand sees it: the disclosure rules (ASCI) right away, and on a tap, the AI reads her
	// caption and script against the brief's key message, must-says and don'ts.
	let { c, caption, file = null }: { c: Collab; caption: string; file?: File | null } = $props();
	let seconds = $state(0);
	$effect(() => {
		const f = file;
		seconds = 0;
		if (f) videoSeconds(f).then((s) => (seconds = s));
	});
	const story = $derived(c.deliverables.length > 0 && c.deliverables.every((d) => /story/i.test(d.kind)));
	const lint = $derived(
		lintDisclosure(caption, { type: c.type, format: story ? 'story' : c.deliverables.some((d) => /reel|video/i.test(d.kind)) ? 'reel' : 'post', seconds, category: c.brand.category })
	);
	const score = $derived(lintScore(lint));
	type Item = { label: string; ok: boolean | null; note: string };
	let ai = $state<{ items: Item[]; summary: string } | null>(null);
	let busy = $state(false);
	let err = $state('');
	const b = $derived(c.brief_details ?? {});
	const hasPoints = $derived(!!(c.brief?.trim() || b.message?.trim() || b.dos?.trim() || b.donts?.trim()));
	async function check() {
		busy = true;
		err = '';
		try {
			const brief = [c.brief, b.message && `Key message: ${b.message}`, b.dos && `Do: ${b.dos}`, b.donts && `Don't: ${b.donts}`].filter(Boolean).join('\n');
			const sc = c.script;
			const script = sc ? [sc.hook ?? sc.hooks?.[0] ?? '', ...sc.scenes.map((x) => [x.say, x.text].filter(Boolean).join(' / '))].filter(Boolean).join('\n') : '';
			ai = await askAi<{ items: Item[]; summary: string }>('precheck', { caption, script, brief });
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="pc" class:bad={score.bad > 0}>
	<div class="pc-h">
		<span class="pc-tag">Before you send</span>
		<b>{score.bad ? `${score.bad} disclosure problem${score.bad === 1 ? '' : 's'}` : score.warn ? 'Disclosure is fine, with a note' : 'Disclosure looks right'}</b>
	</div>
	<ul>
		{#each lint as l (l.key)}
			<li class={l.level}>
				<i aria-hidden="true">{#if l.level === 'ok'}<Icon name="check" />{:else if l.level === 'bad'}<Icon name="x" />{:else}!{/if}</i>
				<span><b>{l.title}</b>{#if l.fix}<small>{l.fix}</small>{/if}</span>
			</li>
		{/each}
	</ul>
	{#if hasPoints}
		{#if ai}
			<div class="pc-ai">
				<span class="lbl-t">Against the brief</span>
				<ul>
					{#each ai.items as it, i (i)}
						<li class={it.ok === null ? 'info' : it.ok ? 'ok' : 'bad'}>
							<i aria-hidden="true">{#if it.ok === null}–{:else if it.ok}<Icon name="check" />{:else}<Icon name="x" />{/if}</i>
							<span><b>{it.label}</b>{#if it.note}<small>{it.note}</small>{/if}</span>
						</li>
					{/each}
				</ul>
				{#if ai.summary}<small class="pc-sum">{ai.summary}</small>{/if}
			</div>
		{:else}
			<button type="button" class="btn sm" onclick={check} disabled={busy || !caption.trim()}>{#if busy}<span class="spinner"></span>Reading…{:else}<Icon name="spark" />Check it against the brief{/if}</button>
		{/if}
		{#if err}<p class="err">{err}</p>{/if}
	{/if}
</div>

<style>
	.pc {
		display: grid;
		gap: 10px;
		margin-top: 10px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.pc.bad {
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 45%, var(--line));
	}
	.pc-h {
		display: grid;
		gap: 2px;
	}
	.pc-tag {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.pc ul {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.pc li {
		display: grid;
		grid-template-columns: 20px minmax(0, 1fr);
		gap: 8px;
		font-size: 13px;
	}
	.pc li span {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.pc li small {
		color: var(--ink-3);
		line-height: 1.4;
	}
	.pc li i {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-style: normal;
		font-weight: 700;
		font-size: 12px;
	}
	.pc li i :global(svg) {
		width: 12px;
		height: 12px;
	}
	.pc li.ok i {
		background: color-mix(in oklab, var(--ok) 18%, transparent);
		color: var(--ok);
	}
	.pc li.bad i {
		background: color-mix(in oklab, var(--bad) 18%, transparent);
		color: var(--bad);
	}
	.pc li.warn i {
		background: color-mix(in oklab, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.pc li.info i {
		background: var(--surface);
		color: var(--ink-3);
	}
	.pc-ai {
		display: grid;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--line);
	}
	.pc-sum {
		color: var(--ink-2);
	}
</style>
