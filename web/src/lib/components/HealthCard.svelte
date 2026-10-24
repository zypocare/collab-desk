<script lang="ts">
	import { GRADE, gradeTone, isHealth, safetyGroups, safetyText, type Health } from '../health';
	import Gauge from './charts/Gauge.svelte';
	import Icon from './Icon.svelte';

	// Audience health and brand safety: a score from her own Instagram numbers, four checks with what each
	// means, and anything in recent captions a brand would want to know. `mine`: the creator's own view.
	let { health, name = '', mine = false, connected = true, stack = false }: { health: Health | Record<string, unknown> | null | undefined; name?: string; mine?: boolean; connected?: boolean; stack?: boolean } = $props();
	const h = $derived(isHealth(health) ? health : null);
	let why = $state(false);
	const toneColor = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', na: 'var(--ink-3)' };
	const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
	const who = $derived(mine ? 'your' : name ? `${name}'s` : 'their');
</script>

<section class="md-card hc rv" class:stack aria-labelledby="hc-t">
	<header class="md-h">
		<div><span class="bx-eb">Audience health & brand safety</span><h2 id="hc-t">{h?.grade ? `${GRADE[h.grade]} audience` : h ? 'Not enough to score yet' : 'Not checked'}</h2></div>
		<button class="lnk hint" onclick={() => (why = !why)} aria-expanded={why}>How it works</button>
	</header>

	{#if why}
		<p class="hint hc-why">Miracle works this out every night from {who} own Instagram numbers: how many followers a post really reaches, engagement for an account this size, sudden follower jumps that no viral post explains, and how much of the audience is in India. An AI also reads the last 40 captions for things a brand should know first. Nobody can edit it{mine ? ', and brands see exactly what you see here' : ''}.</p>
	{/if}

	{#if !h}
		<p class="md-note">{connected ? (mine ? 'Your first check runs with the next Instagram sync (every night).' : 'The first check runs with their next Instagram sync.') : mine ? 'Connect Instagram to get checked. Brands trust creators with a strong score more.' : "Instagram isn't connected, so their audience can't be checked."}</p>
	{:else}
		<div class="hc-top">
			<Gauge value={h.score === null ? null : h.score / 100} gradient={false} color={toneColor[gradeTone(h.grade)]} center={h.score === null ? '—' : String(h.score)} sub="of 100" size={118} />
			<ul class="hc-list">
				{#each h.checks as c (c.key)}
					<li>
						<i class="hc-dot {c.tone}" aria-hidden="true"></i>
						<div><b>{c.label}</b><small>{c.note}</small></div>
						<span class="hc-v {c.tone}">{c.value}</span>
					</li>
				{/each}
			</ul>
		</div>

		<div class="hc-safe {h.safety?.level ?? 'unchecked'}">
			<div class="hc-sh"><Icon name={h.safety?.level === 'clear' ? 'shield' : h.safety?.level === 'unchecked' ? 'clock' : 'flag'} /><b>Brand safety: {safetyText(h.safety)}</b>{#if h.safety?.posts}<small>{h.safety.posts} recent captions read</small>{/if}</div>
			{#if h.safety?.flags?.length}
				<ul>
					{#each safetyGroups(h.safety) as g (g.kind)}
						<li>
							<span class="hc-sev {g.severity}">{g.severity === 'high' ? 'Serious' : g.severity === 'medium' ? 'Check' : 'Minor'}</span>
							<div>
								<b>{g.label}{g.posts.length > 1 ? ` · ${g.posts.length} posts` : ''}</b>
								{#if g.why}<small>{g.posts.length > 1 ? 'e.g. ' : ''}{g.why}</small>{/if}
								<span class="hc-posts">{#each g.posts.slice(0, 3) as p, i (p.id)}{#if p.permalink}<a href={p.permalink} target="_blank" rel="noopener">{g.posts.length > 1 ? `Post ${i + 1}` : 'The post'}<Icon name="arrow" /></a>{/if}{/each}</span>
							</div>
						</li>
					{/each}
				</ul>
				<small class="hint">{mine ? 'Read by AI, so it can be wrong. Brands see these with a link to the post; editing or archiving the post clears it at the next check.' : 'Read by AI from the captions, so it can be wrong: open the post to judge for yourself.'}</small>
			{/if}
		</div>
		<small class="hint">Checked {when(h.at)} from Instagram · {h.posts} recent posts</small>
	{/if}
</section>

<style>
	.hc-why {
		margin: 0;
	}
	.hc .md-h .lnk {
		flex: none;
		white-space: nowrap;
	}
	.hc-top {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 22px;
		align-items: center;
	}
	.hc-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 12px;
		min-width: 0;
	}
	.hc-list li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 10px;
		align-items: start;
	}
	.hc-safe li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px;
		align-items: start;
	}
	.hc-list b,
	.hc-safe li b {
		display: block;
		font-size: 14.5px;
		font-weight: 600;
	}
	.hc-list small,
	.hc-safe li small {
		display: block;
		font-size: 12.5px;
		line-height: 1.45;
		color: var(--ink-3);
	}
	.hc-dot {
		width: 9px;
		height: 9px;
		margin-top: 6px;
		border-radius: 50%;
		background: var(--ink-3);
	}
	.hc-dot.ok,
	.hc-v.ok {
		--c: var(--ok);
	}
	.hc-dot.warn,
	.hc-v.warn {
		--c: var(--warn);
	}
	.hc-dot.bad,
	.hc-v.bad {
		--c: var(--bad);
	}
	.hc-dot.na {
		--c: var(--ink-3);
		opacity: 0.5;
	}
	.hc-dot {
		background: var(--c, var(--ink-3));
	}
	.hc-v {
		font-size: 13px;
		font-weight: 600;
		color: var(--c, var(--ink-3));
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.hc-safe {
		display: grid;
		gap: 12px;
		padding: 14px 16px;
		border-radius: 16px;
		background: var(--surface-2);
	}
	.hc-safe.review {
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 45%, transparent);
	}
	.hc-safe.note {
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--warn) 45%, transparent);
	}
	.hc-sh {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.hc-sh :global(.ic) {
		width: 18px;
		height: 18px;
	}
	.hc-safe.clear .hc-sh :global(.ic) {
		color: var(--ok);
	}
	.hc-safe.review .hc-sh :global(.ic) {
		color: var(--bad);
	}
	.hc-safe.note .hc-sh :global(.ic) {
		color: var(--warn);
	}
	.hc-sh small {
		color: var(--ink-3);
		font-size: 12.5px;
	}
	.hc-safe ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.hc-sev {
		padding: 3px 8px;
		border-radius: 99px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.04em;
		background: color-mix(in oklab, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.hc-sev.high {
		background: color-mix(in oklab, var(--bad) 18%, transparent);
		color: var(--bad);
	}
	.hc-sev.low {
		background: color-mix(in oklab, var(--ink) 8%, transparent);
		color: var(--ink-2);
	}
	.hc-posts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		margin-top: 4px;
	}
	.hc-safe a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		color: var(--ink);
	}
	.hc-safe a :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.stack .hc-top {
		grid-template-columns: minmax(0, 1fr);
		justify-items: center;
	}
	.stack .hc-list {
		justify-self: stretch;
	}
	@media (max-width: 560px) {
		.hc-top {
			grid-template-columns: minmax(0, 1fr);
			justify-items: center;
		}
		.hc-list {
			justify-self: stretch;
		}
	}
</style>
