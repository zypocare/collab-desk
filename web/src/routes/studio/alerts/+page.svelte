<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { alertIcon, alerts, loadAlerts, markAlertsSeen } from '#lib/alerts.svelte.ts';
	import { relWord } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// Alerts: the event notifications her phones got, kept here for 90 days (a request, a message, an
	// accepted quote, an approved draft, a payment...). Tap one to open what it's about.
	onMount(async () => {
		await loadAlerts();
		await markAlertsSeen();
	});
	const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
	const groups = $derived.by(() => {
		const out: { key: string; label: string; items: typeof alerts.list }[] = [];
		const today = new Date();
		for (const a of alerts.list) {
			const k = dayKey(a.created_at);
			let g = out.find((x) => x.key === k);
			if (!g) {
				const days = Math.round((new Date(k).getTime() - new Date(today.toLocaleDateString('en-CA')).getTime()) / 864e5);
				const label = days >= -1 ? relWord(days).replace(/^./, (c) => c.toUpperCase()) : new Date(a.created_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
				g = { key: k, label, items: [] };
				out.push(g);
			}
			g.items.push(a);
		}
		return out;
	});
	const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
	const isNew = (iso: string) => !!alerts.seenBefore && iso > alerts.seenBefore;
	function open(url: string) {
		if (!url) return;
		if (/^https?:\/\//.test(url)) location.href = url;
		else goto(url);
	}
</script>

<svelte:head><title>Alerts · Miracle</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Last 90 days</div>
		<h1>Your <em>alerts</em></h1>
		<p>Every request, message, quote, draft and payment your phone was told about, kept here.</p>
	</div>
</header>

{#if !alerts.loaded}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else if !alerts.list.length}
	<div class="al-empty rv"><Icon name="bell" /><b>No alerts yet</b><small>When a brand sends a request, replies, accepts a quote or pays, it shows here too.</small></div>
{:else}
	{#each groups as g (g.key)}
		<section class="al-g rv" aria-label={g.label}>
			<h2 class="al-h">{g.label}</h2>
			<ul class="al-list">
				{#each g.items as a (a.id)}
					<li>
						<button class="al-it" class:new={isNew(a.created_at)} onclick={() => open(a.url)} disabled={!a.url}>
							<span class="al-ic"><Icon name={alertIcon(a.kind)} /></span>
							<span class="al-t"><b>{a.title}</b>{#if a.body}<small>{a.body}</small>{/if}</span>
							<span class="al-time">{time(a.created_at)}{#if isNew(a.created_at)}<i aria-label="new"></i>{/if}</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
{/if}

<style>
	.al-g {
		margin-bottom: 18px;
	}
	.al-h {
		margin: 0 0 8px;
		font: 700 11px/1 var(--f-body, system-ui);
		letter-spacing: 0.17em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.al-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.al-it {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 12px;
		align-items: start;
		width: 100%;
		padding: 14px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: transform 0.12s;
	}
	.al-it:active:not(:disabled) {
		transform: scale(0.985);
	}
	.al-it:disabled {
		cursor: default;
	}
	.al-it.new {
		border-color: color-mix(in oklab, var(--g2) 45%, var(--line));
		background: radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g2) 10%, transparent), transparent 60%), var(--surface);
	}
	.al-ic {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 12px;
		background: var(--surface-2);
	}
	.al-ic :global(.ic) {
		width: 19px;
		height: 19px;
	}
	.al-t {
		display: grid;
		gap: 3px;
		min-width: 0;
	}
	.al-t b {
		font-size: 15px;
		font-weight: 600;
		line-height: 1.35;
	}
	.al-t small {
		font-size: 13px;
		line-height: 1.45;
		color: var(--ink-3);
		white-space: pre-line;
		overflow-wrap: anywhere;
	}
	.al-time {
		display: grid;
		justify-items: end;
		gap: 6px;
		font-size: 12px;
		color: var(--ink-3);
		white-space: nowrap;
	}
	.al-time i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--g2);
	}
	.al-empty {
		display: grid;
		justify-items: center;
		gap: 8px;
		padding: 48px 20px;
		border: 1px dashed var(--line);
		border-radius: 20px;
		text-align: center;
		color: var(--ink-3);
	}
	.al-empty :global(.ic) {
		width: 28px;
		height: 28px;
	}
	.al-empty b {
		color: var(--ink);
	}
</style>
