<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import { alertGroup, alertIcon, alerts, clearAlerts, GROUP_LABEL, hideAlerts, loadAlerts, markAlertsSeen, type Alert, type AlertGroup } from '#lib/alerts.svelte.ts';
	import { relWord } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import { phone } from '#lib/phone.svelte.ts';

	// Alerts: the event notifications her phones got (a request, a message, an accepted quote, an approved
	// draft, a payment...), kept here for 90 days. Tap one to open what it's about; swipe it away (or the
	// bin) to delete it, with a moment to undo; or clear them all. Deleting only clears this login's list.
	onMount(async () => {
		await loadAlerts();
		await markAlertsSeen();
	});

	const HUE: Record<AlertGroup, string> = { requests: 'var(--g2)', money: 'var(--ok)', content: 'var(--g3)', messages: 'var(--g1)', other: 'var(--ink-3)' };
	const FILTERS: (AlertGroup | 'all')[] = ['all', 'requests', 'money', 'content', 'messages', 'other'];
	let filter = $state<AlertGroup | 'all'>('all');

	// Deleted ones leave at once; the server is told after the undo window (or on leaving the page).
	let gone = $state<number[]>([]);
	let undo = $state<{ ids: number[]; text: string } | null>(null);
	let undoTimer: ReturnType<typeof setTimeout> | null = null;
	function flush() {
		if (undoTimer) clearTimeout(undoTimer);
		undoTimer = null;
		if (undo) hideAlerts(undo.ids);
		undo = null;
	}
	function remove(a: Alert) {
		flush();
		gone = [...gone, a.id];
		undo = { ids: [a.id], text: 'Alert deleted' };
		undoTimer = setTimeout(flush, 5000);
	}
	function putBack() {
		if (undoTimer) clearTimeout(undoTimer);
		undoTimer = null;
		if (undo) gone = gone.filter((id) => !undo!.ids.includes(id));
		undo = null;
	}
	onDestroy(flush);

	const visible = $derived(alerts.list.filter((a) => !gone.includes(a.id)));
	const counts = $derived.by(() => {
		const c: Record<string, number> = { all: visible.length };
		for (const a of visible) c[alertGroup(a.kind)] = (c[alertGroup(a.kind)] ?? 0) + 1;
		return c;
	});
	const shown = $derived(filter === 'all' ? visible : visible.filter((a) => alertGroup(a.kind) === filter));
	const isNew = (iso: string) => !!alerts.seenBefore && iso > alerts.seenBefore;
	const fresh = $derived(visible.filter((a) => isNew(a.created_at)).length);

	const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
	const groups = $derived.by(() => {
		const out: { key: string; label: string; items: Alert[] }[] = [];
		const today = new Date(new Date().toLocaleDateString('en-CA')).getTime();
		for (const a of shown) {
			const k = dayKey(a.created_at);
			let g = out.find((x) => x.key === k);
			if (!g) {
				const days = Math.round((new Date(k).getTime() - today) / 864e5);
				const label = days >= -1 ? relWord(days).replace(/^./, (c) => c.toUpperCase()) : new Date(a.created_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
				g = { key: k, label, items: [] };
				out.push(g);
			}
			g.items.push(a);
		}
		return out;
	});
	const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
	/** Each line of the alert, with its rupee amounts picked out. */
	const lines = (body: string) => body.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/(₹\s?[\d,]+(?:\.\d+)?)/));

	function open(a: Alert) {
		if (!a.url) return;
		if (/^https?:\/\//.test(a.url)) location.href = a.url;
		else goto(a.url);
	}

	// Clear all, with a second tap to be sure.
	let confirmClear = $state(false);
	async function clearAll() {
		flush();
		confirmClear = false;
		gone = [];
		await clearAlerts();
	}

	// Swipe left to delete (phones): the card follows the finger, and past a third of its width it goes.
	function swipe(node: HTMLElement, a: Alert) {
		let x0 = 0, y0 = 0, dx = 0, on = false, locked = false, id = -1;
		const card = node.querySelector<HTMLElement>('.al-card')!;
		const down = (e: PointerEvent) => {
			if (e.pointerType === 'mouse') return;
			x0 = e.clientX; y0 = e.clientY; dx = 0; on = true; locked = false; id = e.pointerId;
		};
		const move = (e: PointerEvent) => {
			if (!on || e.pointerId !== id) return;
			const mx = e.clientX - x0, my = e.clientY - y0;
			if (!locked) {
				if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) return void (on = false);
				if (Math.abs(mx) < 10) return;
				locked = true;
				node.setPointerCapture(id);
			}
			dx = Math.min(0, mx);
			card.style.transition = 'none';
			card.style.transform = `translateX(${dx}px)`;
			node.classList.add('drag');
			node.classList.toggle('arm', dx < -node.offsetWidth / 3);
		};
		const up = () => {
			if (!on) return;
			on = false;
			card.style.transition = '';
			if (locked && dx < -node.offsetWidth / 3) {
				card.style.transform = 'translateX(-110%)';
				navigator.vibrate?.(12);
				setTimeout(() => a && remove(a), 160);
			} else {
				card.style.transform = '';
				setTimeout(() => node.classList.remove('drag'), 220);
			}
			node.classList.remove('arm');
			if (locked) node.addEventListener('click', (e) => (e.stopPropagation(), e.preventDefault()), { capture: true, once: true });
		};
		node.addEventListener('pointerdown', down);
		node.addEventListener('pointermove', move);
		node.addEventListener('pointerup', up);
		node.addEventListener('pointercancel', up);
		return {
			update(next: Alert) {
				a = next;
			},
			destroy() {
				node.removeEventListener('pointerdown', down);
				node.removeEventListener('pointermove', move);
				node.removeEventListener('pointerup', up);
				node.removeEventListener('pointercancel', up);
			}
		};
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
{:else}
	<section class="hero-card glow m-hero al-hero rv" aria-label="Alerts">
		<div class="mesh" aria-hidden="true"></div>
		<div class="hc-in">
			<div class="hc-top">
				<span class="hc-eb">{fresh ? 'New since you last looked' : 'In your alerts'}</span>
				{#if visible.length && !confirmClear}<button class="glass-chip" onclick={() => (confirmClear = true)}><Icon name="trash" />Clear all</button>{/if}
			</div>
			<div class="hc-val">{fresh || visible.length}<small>{fresh ? (fresh === 1 ? 'new alert' : 'new alerts') : visible.length === 1 ? 'alert' : 'alerts'}</small></div>
			{#if confirmClear}
				<div class="al-confirm" role="alertdialog" aria-label="Clear all alerts">
					<span>Clear all {visible.length} from your list? Your team keeps theirs.</span>
					<div class="clear-acts"><button class="glass-chip" onclick={() => (confirmClear = false)}>Keep them</button><button class="glass-chip" onclick={clearAll}>Clear all</button></div>
				</div>
			{:else}
				<div class="hc-sub">{visible.length ? (phone.on ? 'Swipe an alert left to delete it, or tap it to open.' : 'Click an alert to open it, or the bin to delete it.') : 'Requests, replies, quotes and payments show here as they happen.'}</div>
			{/if}
		</div>
	</section>

	{#if visible.length}
		<div class="m-stages" role="tablist" aria-label="Filter alerts">
			{#each FILTERS.filter((k) => k === 'all' || counts[k]) as k (k)}
				<button role="tab" aria-selected={filter === k} class:on={filter === k} onclick={() => (filter = k)}><i class="dt" style="--hue:{k === 'all' ? 'var(--accent)' : HUE[k]}"></i>{k === 'all' ? 'All' : GROUP_LABEL[k]}<span>{counts[k] ?? 0}</span></button>
			{/each}
		</div>
	{/if}

	{#if !shown.length}
		<div class="al-empty rv">
			<span class="al-empty-ic"><Icon name="bell" /></span>
			<b>{visible.length ? `No ${GROUP_LABEL[filter as AlertGroup].toLowerCase()} alerts` : "You're all caught up"}</b>
			<small>{visible.length ? 'Pick another filter to see the rest.' : 'When a brand sends a request, replies, accepts a quote or pays, it shows here too.'}</small>
		</div>
	{:else}
		{#each groups as g (g.key)}
			<section class="al-day rv" aria-label={g.label}>
				<h2 class="al-dh"><span>{g.label}</span><i></i><small>{g.items.length}</small></h2>
				<ul class="al-list">
					{#each g.items as a, i (a.id)}
						{@const grp = alertGroup(a.kind)}
						<li class="al-row" use:swipe={a} style="--hue:{HUE[grp]};--i:{Math.min(i, 8)}">
							<span class="al-bin" aria-hidden="true"><Icon name="trash" />Delete</span>
							<div class="al-card" class:new={isNew(a.created_at)}>
								<button class="al-main" onclick={() => open(a)} disabled={!a.url}>
									<span class="al-ic"><Icon name={alertIcon(a.kind)} /></span>
									<span class="al-t">
										<span class="al-meta"><em>{GROUP_LABEL[grp]}</em><span>{time(a.created_at)}</span>{#if isNew(a.created_at)}<i class="al-new">New</i>{/if}</span>
										<b>{a.title}</b>
										{#if a.body}
											{@const ls = lines(a.body)}
											{#if ls.length > 1}
												<span class="al-lines">{#each ls as parts, j (j)}<span>{#each parts as p, k (k)}{#if k % 2}<strong>{p}</strong>{:else}{p}{/if}{/each}</span>{/each}</span>
											{:else}
												<small>{#each ls[0] as p, k (k)}{#if k % 2}<strong>{p}</strong>{:else}{p}{/if}{/each}</small>
											{/if}
										{/if}
										{#if a.url}<span class="al-go">Open<Icon name="chevR" /></span>{/if}
									</span>
								</button>
								<button class="al-del" onclick={() => remove(a)} aria-label="Delete this alert"><Icon name="trash" /></button>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
{/if}

{#if undo}
	<div class="al-undo" role="status">
		<span>{undo.text}</span>
		<button onclick={putBack}>Undo</button>
	</div>
{/if}

<style>
	.al-hero {
		min-height: 0;
	}
	.al-hero .hc-in {
		gap: 12px;
	}
	.al-hero .hc-val {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.al-hero .hc-val small {
		font: 600 14px/1 var(--f-body, system-ui);
		letter-spacing: 0;
		opacity: 0.72;
	}
	.al-hero .glass-chip :global(.ic) {
		width: 15px;
		height: 15px;
	}
	.al-confirm {
		display: grid;
		gap: 12px;
		margin-top: 4px;
		font-size: 14px;
		color: rgba(255, 255, 255, 0.86);
	}
	.al-confirm .clear-acts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.al-day {
		margin: 18px 0 6px;
	}
	.al-dh {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0 0 10px;
		font: 700 11px/1 var(--f-body, system-ui);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.al-dh i {
		flex: 1;
		height: 1px;
		background: var(--line);
	}
	.al-dh small {
		font-size: 11px;
		letter-spacing: 0.08em;
	}
	.al-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.al-row {
		position: relative;
		border-radius: 20px;
		touch-action: pan-y;
		animation: al-in 0.42s cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: calc(var(--i) * 40ms);
	}
	.al-bin {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding-right: 22px;
		border-radius: inherit;
		background: color-mix(in oklab, var(--bad) 70%, #000);
		color: #fff;
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0;
		transition: opacity 0.15s, background 0.15s;
	}
	.al-row:global(.drag) .al-bin {
		opacity: 1;
	}
	.al-row:global(.arm) .al-bin {
		background: var(--bad);
	}
	.al-bin :global(.ic) {
		width: 18px;
		height: 18px;
	}
	.al-card {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		border-radius: inherit;
		background: radial-gradient(130% 90% at 0% 0%, color-mix(in oklab, var(--hue) 9%, transparent), transparent 55%), var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
		overflow: hidden;
		transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.al-card::before {
		content: '';
		position: absolute;
		left: 0;
		top: 14px;
		bottom: 14px;
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: var(--hue);
		opacity: 0.85;
	}
	.al-card.new {
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--hue) 55%, var(--line)), 0 18px 40px -28px var(--hue);
	}
	.al-main {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 14px;
		align-items: start;
		padding: 16px 4px 16px 18px;
		border: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
		min-width: 0;
	}
	.al-main:disabled {
		cursor: default;
	}
	.al-main:active:not(:disabled) {
		transform: scale(0.99);
	}
	.al-ic {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--hue) 16%, var(--surface-2));
		color: var(--hue);
	}
	.al-ic :global(.ic) {
		width: 20px;
		height: 20px;
	}
	.al-t {
		display: grid;
		gap: 5px;
		min-width: 0;
	}
	.al-meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.al-meta em {
		font-style: normal;
		color: var(--hue);
	}
	.al-meta span::before {
		content: '·';
		margin-right: 8px;
	}
	.al-new {
		margin-left: auto;
		padding: 3px 8px;
		border-radius: 99px;
		background: var(--hue);
		color: #fff;
		font-style: normal;
		font-size: 10px;
		letter-spacing: 0.12em;
	}
	.al-t b {
		font: 400 21px/1.2 var(--f-serif, Georgia, serif);
		letter-spacing: -0.005em;
		overflow-wrap: anywhere;
	}
	.al-t small {
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	.al-lines {
		display: grid;
		margin-top: 4px;
		border-top: 1px dashed var(--line-strong, var(--line));
	}
	.al-lines > span {
		padding: 8px 0;
		border-bottom: 1px dashed var(--line);
		font-size: 14px;
		line-height: 1.45;
		color: var(--ink-2);
		overflow-wrap: anywhere;
	}
	.al-lines > span:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}
	.al-t strong {
		font-weight: 700;
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.al-go {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		margin-top: 4px;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.al-go :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.al-del {
		align-self: start;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		margin: 8px 8px 0 0;
		border: 0;
		border-radius: 12px;
		background: none;
		color: var(--ink-3);
		cursor: pointer;
	}
	.al-del:hover {
		background: color-mix(in oklab, var(--bad) 12%, transparent);
		color: var(--bad);
	}
	.al-del :global(.ic) {
		width: 18px;
		height: 18px;
	}
	.al-empty {
		display: grid;
		justify-items: center;
		gap: 8px;
		margin-top: 18px;
		padding: 44px 20px;
		border: 1px dashed var(--line-strong, var(--line));
		border-radius: 22px;
		text-align: center;
		color: var(--ink-3);
	}
	.al-empty-ic {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		margin-bottom: 6px;
		border-radius: 18px;
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.al-empty-ic :global(.ic) {
		width: 26px;
		height: 26px;
	}
	.al-empty b {
		font: 400 24px/1.2 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.al-empty small {
		max-width: 34ch;
		font-size: 14px;
		line-height: 1.5;
	}
	.al-undo {
		position: fixed;
		left: 50%;
		bottom: calc(var(--m-tabs, 0px) + env(safe-area-inset-bottom, 0px) + 18px);
		z-index: 60;
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 12px 12px 12px 18px;
		transform: translateX(-50%);
		background: var(--ink);
		color: var(--bg);
		box-shadow: 4px 4px 0 var(--g2);
		font-size: 14px;
		font-weight: 600;
		animation: al-up 0.25s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	.al-undo button {
		height: 34px;
		padding: 0 14px;
		border: 0;
		background: var(--g2);
		color: #fff;
		font: 700 12px/1 var(--f-body, system-ui);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
	}
	@keyframes al-in {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
	}
	@keyframes al-up {
		from {
			opacity: 0;
			transform: translate(-50%, 12px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.al-row,
		.al-undo {
			animation: none;
		}
	}
	@media (min-width: 761px) {
		.al-undo {
			bottom: 28px;
		}
	}
</style>
