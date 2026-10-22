<script lang="ts">
	import Logo from './Logo.svelte';
	import { ago, igOf, ROOT, siteOf } from './format.ts';
	import type { Creator, Status } from './types.ts';
	import Icon from './Icon.svelte';

	let { creators, busyId, onset }: { creators: Creator[] | null; busyId: number | null; onset: (c: Creator, to: Status) => void } = $props();

	const waiting = $derived((creators ?? []).filter((c) => c.status === 'pending'));
</script>

{#if !creators}
	<div class="rq-load"><span class="spinner"></span></div>
{:else if !waiting.length}
	<div class="rq-empty">
		<Logo size={46} />
		<h2>All <em class="gt">caught up</em></h2>
		<p>New sign-ups land here (and in your email). Approving one sends them a welcome email with a link to their studio.</p>
	</div>
{:else}
	<div class="rq">
		{#each waiting as c (c.id)}
			<article class="tk">
				<header class="tk-band">
					<small>Asked {ago(c.requested_at)}</small>
					<h3>{c.name || 'No name'}</h3>
					<a href={igOf(c.handle)} target="_blank" rel="noopener">@{c.handle}</a>
				</header>
				<i class="tk-cut" aria-hidden="true"></i>
				<dl>
					<div><dt>Address</dt><dd>{#if c.slug}<a href={siteOf(c.slug)} target="_blank" rel="noopener">{c.slug}.{ROOT}</a>{:else}Picks a link after approval{/if}</dd></div>
					<div><dt>Work</dt><dd>{[c.niche, c.city].filter(Boolean).join(' · ') || '—'}</dd></div>
					{#if c.signup?.followers}<div><dt>Followers</dt><dd>{c.signup.followers}</dd></div>{/if}
					{#if c.signup?.collabs}<div><dt>Paid collabs</dt><dd>{c.signup.collabs}</dd></div>{/if}
					{#if c.languages?.length}<div><dt>Languages</dt><dd>{c.languages.join(', ')}</dd></div>{/if}
					<div><dt>Email</dt><dd><a href="mailto:{c.email}">{c.email}</a></dd></div>
					{#if c.whatsapp}<div><dt>WhatsApp</dt><dd>{c.whatsapp}</dd></div>{/if}
					{#if c.signup?.heard}<div><dt>Heard from</dt><dd>{c.signup.heard}</dd></div>{/if}
				</dl>
				{#if c.note}<blockquote>{c.note}</blockquote>{/if}
				<footer>
					<button class="neo grad" disabled={busyId === c.id} onclick={() => onset(c, 'active')}>{#if busyId === c.id}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Approve</button>
					<button class="neo dark" disabled={busyId === c.id} onclick={() => onset(c, 'declined')}><Icon name="x" />Decline</button>
				</footer>
			</article>
		{/each}
	</div>
{/if}

<style>
	.rq-load { min-height: 260px; display: grid; place-items: center; }
	.rq-empty { max-width: 520px; padding: 34px 30px; border: 1px solid var(--line); border-radius: 26px; background: var(--surface); display: grid; gap: 12px; }
	.rq-empty h2 { font-family: var(--f-serif); font-weight: 400; font-size: 36px; letter-spacing: -.01em; }
	.rq-empty p { color: var(--ink-2); }

	.rq { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; align-items: start; }
	/* A ticket: who, on a band in the app's gradient, a torn line, then the details and the two actions. */
	.tk { border: 1px solid var(--line-strong); background: var(--surface); display: grid; }
	.tk-band { padding: 18px 20px 16px; color: #fff; background: var(--grad); display: grid; gap: 2px; }
	.tk-band small { font-size: 10.5px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; opacity: .85; }
	.tk-band h3 { font-family: var(--f-serif); font-weight: 400; font-size: 30px; letter-spacing: -.01em; line-height: 1.1; }
	.tk-band a { justify-self: start; font-weight: 700; color: #fff; text-decoration-color: rgba(255, 255, 255, .5); text-underline-offset: 3px; }
	.tk-cut { display: block; position: relative; height: 0; margin: 0 14px; border-top: 2px dashed var(--line-strong); }
	dl { margin: 0; padding: 14px 20px 6px; display: grid; gap: 9px; }
	dl div { display: flex; justify-content: space-between; gap: 14px; font-size: 14.5px; }
	dt { color: var(--ink-3); flex: none; }
	dd { margin: 0; min-width: 0; font-weight: 600; text-align: right; overflow-wrap: anywhere; }
	dd a { text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
	blockquote { margin: 8px 20px 0; padding: 12px 14px; border-left: 3px solid var(--g2); background: var(--surface-2); color: var(--ink-2); font-size: 14.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
	footer { display: flex; gap: 14px; padding: 18px 20px 20px; }
	footer .neo { flex: 1; }
	@media (max-width: 420px) {
		.rq { grid-template-columns: 1fr; }
	}
</style>
