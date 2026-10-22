<script lang="ts">
	import { onMount } from 'svelte';
	import { call, type Shipment } from '#lib/business.svelte.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { CARRIERS, errMessage, firstName, fmt, localDay, todayIso, trackUrl } from '#lib/util.ts';
	import Select from '#lib/components/Select.svelte';

	// Shipping: every product going out to creators, across creators, with addresses they shared.
	let list = $state<Shipment[] | null>(null);
	async function load() {
		try {
			list = await call<Shipment[]>('brand_shipping');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	onMount(load);
	const ready = (s: Shipment) => !s.shipped_at && s.address_ready;
	const onWay = (s: Shipment) => !!s.shipped_at && !s.received_at;
	const month = todayIso().slice(0, 7);
	const toSend = $derived((list ?? []).filter(ready).length);
	const moving = $derived((list ?? []).filter(onWay).length);
	const got = $derived((list ?? []).filter((s) => s.received_at && localDay(s.received_at).startsWith(month)).length);

	// One shipment's form, or several at once.
	let open = $state<string | null>(null);
	let carrier = $state('Delhivery');
	let tracking = $state('');
	let several = $state(false);
	let picked = $state<Record<string, boolean>>({});
	let numbers = $state('');
	let busy = $state(false);
	const pickedList = $derived((list ?? []).filter((s) => ready(s) && picked[s.collab_id]));
	function start(s: Shipment) {
		open = open === s.collab_id ? null : s.collab_id;
		tracking = '';
	}
	async function mark(items: Shipment[], codes: string[]) {
		busy = true;
		let done = 0;
		try {
			for (const [i, s] of items.entries()) {
				await call('ship_mark', { p_collab: s.collab_id, p_carrier: carrier, p_tracking: codes[i] ?? '' });
				done++;
			}
			toast(done === 1 ? `Marked shipped. ${firstName(items[0].creator)} gets the tracking` : `Marked ${done} shipped`, 'check');
			open = null;
			several = false;
			picked = {};
			numbers = '';
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
			load();
		}
	}
	async function askAgain(s: Shipment) {
		try {
			await call('brand_ask', { p_collab: s.collab_id, p_what: 'address' });
			toast(`Asked ${firstName(s.creator)} for the address in your chat`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	const carriers = CARRIERS.map((c) => ({ value: c, label: c }));
</script>

<svelte:head><title>Shipping · Miracle</title></svelte:head>

{#if !list}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<div class="sh-tiles">
		<div class="sh-t hot"><span>To send</span><b>{toSend}</b><small>address{toSend === 1 ? '' : 'es'} ready</small></div>
		<div class="sh-t"><span>On the way</span><b>{moving}</b><small>waiting for the creator to confirm</small></div>
		<div class="sh-t"><span>Received</span><b>{got}</b><small>this month</small></div>
	</div>

	{#if !list.length}
		<p class="sh-none">Products you send for barter or paid + product collabs show here, with the address each creator shares.</p>
	{:else}
		<div class="sh-tbl">
			<div class="sh-r sh-hd" aria-hidden="true"><span>Creator</span><span>Product</span><span>Ship to</span><span>Status</span><span></span></div>
			{#each list as s (s.collab_id)}
				<div class="sh-r">
					<b class="sh-who">
						{#if several && ready(s)}<input type="checkbox" aria-label="Pick {s.creator}" bind:checked={picked[s.collab_id]} />{/if}
						{firstName(s.creator)}
					</b>
					<span class="sh-p">{s.product || 'Product'}</span>
					<span class="sh-to">
						{#if s.shipped_at}{s.carrier}{s.tracking ? ` · ${s.tracking}` : ''}
						{:else if s.address_ready}<b>{s.name}</b>{s.address}{s.phone ? ` · ${s.phone}` : ''}
						{:else}<em>Waiting for their address</em>{/if}
					</span>
					<span class="sh-st" class:hot={ready(s)} class:dim={!s.shipped_at && !s.address_ready}>
						{s.received_at ? `Received ${fmt(localDay(s.received_at))}` : s.shipped_at ? `On the way · sent ${fmt(localDay(s.shipped_at))}` : s.address_ready ? 'Ready to send' : 'Not yet'}
					</span>
					<span class="sh-a">
						{#if ready(s) && !several}
							<button class="sh-neo sh-light" onclick={() => start(s)} aria-expanded={open === s.collab_id}>Mark shipped</button>
						{:else if onWay(s) && s.tracking}
							<a class="sh-link" href={trackUrl(s.carrier ?? '', s.tracking)} target="_blank" rel="noopener">Track</a>
						{:else if !s.shipped_at && !s.address_ready}
							<button class="sh-neo sh-ghost" onclick={() => askAgain(s)}>Ask again</button>
						{/if}
					</span>
				</div>
				{#if open === s.collab_id}
					<form class="sh-form" onsubmit={(e) => (e.preventDefault(), mark([s], [tracking.trim()]))}>
						<Select size="sm" ariaLabel="Courier" bind:value={carrier} options={carriers} />
						<input class="sh-in" placeholder="Tracking number" aria-label="Tracking number" bind:value={tracking} />
						<button class="sh-neo sh-light" disabled={busy}>Save</button>
						<button type="button" class="sh-link" onclick={() => (open = null)}>Cancel</button>
					</form>
				{/if}
			{/each}
		</div>

		{#if several}
			<form class="sh-many" onsubmit={(e) => (e.preventDefault(), mark(pickedList, numbers.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)))}>
				<span class="sh-mt">{pickedList.length ? `${pickedList.length} picked: ${pickedList.map((s) => firstName(s.creator)).join(', ')}` : 'Tick the creators you are sending to'}</span>
				<Select size="sm" ariaLabel="Courier" bind:value={carrier} options={carriers} />
				<textarea class="sh-in" rows="3" aria-label="Tracking numbers" placeholder="Tracking numbers, one per line, in the same order" bind:value={numbers}></textarea>
				<div class="sh-mb">
					<button class="sh-neo sh-light" disabled={busy || !pickedList.length}>Mark {pickedList.length || ''} shipped</button>
					<button type="button" class="sh-link" onclick={() => ((several = false), (picked = {}))}>Cancel</button>
				</div>
			</form>
		{:else if toSend > 1}
			<div class="sh-bulk">
				<span>Sending several at once? Mark them all shipped with one courier and paste the tracking numbers.</span>
				<button class="sh-neo sh-ghost sh-big" onclick={() => ((several = true), (open = null))}>Ship several</button>
			</div>
		{/if}
	{/if}
{/if}

<style>
	.sh-tiles {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		margin-bottom: 18px;
	}
	.sh-t {
		padding: 16px 18px;
		border-radius: 16px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.sh-t.hot {
		background: radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g3) 16%, transparent), transparent 60%), var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.sh-t span {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.sh-t.hot span {
		color: var(--g3);
		font-weight: 600;
	}
	.sh-t b {
		display: block;
		font-family: var(--f-serif);
		font-weight: 400;
		font-size: 34px;
	}
	.sh-t small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.sh-none {
		margin: 0;
		padding: 18px;
		border-radius: 18px;
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink-3);
		font-size: 14px;
	}
	.sh-tbl {
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.sh-r {
		display: grid;
		grid-template-columns: 1.3fr 1.6fr 2.2fr 1.3fr 1.3fr;
		gap: 12px;
		align-items: center;
		padding: 14px 18px;
		border-bottom: 1px solid var(--line);
	}
	.sh-tbl > :last-child {
		border-bottom: 0;
	}
	.sh-hd {
		padding: 12px 18px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.sh-who {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
	}
	.sh-who input {
		width: 18px;
		height: 18px;
		accent-color: var(--g2);
	}
	.sh-to {
		font-size: 13px;
		color: var(--ink-2);
		line-height: 1.4;
	}
	.sh-to b {
		display: block;
		font-weight: 600;
		color: var(--ink);
	}
	.sh-to em {
		font-style: normal;
		color: var(--ink-3);
	}
	.sh-st {
		font-size: 13px;
	}
	.sh-st.hot {
		color: var(--g3);
		font-weight: 600;
	}
	.sh-st.dim {
		color: var(--ink-3);
	}
	.sh-a {
		display: flex;
		justify-content: flex-end;
	}
	.sh-neo {
		height: 38px;
		padding: 0 14px;
		border: 0;
		cursor: pointer;
		font: 700 11px/1 var(--f-body);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.sh-neo:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.sh-light {
		background: var(--ink);
		color: var(--bg);
		box-shadow: 3px 3px 0 var(--g2);
	}
	.sh-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--ink-3);
	}
	.sh-big {
		height: 44px;
		padding: 0 16px;
		font-size: 12px;
		letter-spacing: 0.12em;
		box-shadow: inset 0 0 0 1.5px var(--ink-3), 4px 4px 0 var(--line);
	}
	.sh-link {
		border: 0;
		background: none;
		padding: 8px 4px;
		color: var(--ink-3);
		font: 600 13px/1 var(--f-body);
		cursor: pointer;
	}
	.sh-form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		padding: 12px 18px 16px;
		border-bottom: 1px solid var(--line);
		background: color-mix(in oklab, var(--ink) 3%, transparent);
	}
	.sh-in {
		min-width: 0;
		flex: 1 1 200px;
		padding: 10px 12px;
		border: 0;
		border-radius: 10px;
		background: var(--bg);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		font: 400 14px/1.4 var(--f-body);
		resize: vertical;
	}
	.sh-bulk,
	.sh-many {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin-top: 18px;
		padding: 14px 18px;
		border-radius: 16px;
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.sh-bulk span {
		flex: 1 1 260px;
		font-size: 14px;
		color: var(--ink-2);
	}
	.sh-mt {
		flex: 1 1 100%;
		font-size: 14px;
		font-weight: 600;
	}
	.sh-many .sh-in {
		flex-basis: 100%;
	}
	.sh-mb {
		display: flex;
		gap: 10px;
		align-items: center;
	}
	@media (max-width: 760px) {
		.sh-tiles {
			gap: 8px;
		}
		.sh-t {
			padding: 12px;
		}
		.sh-t b {
			font-size: 28px;
		}
		.sh-t small {
			display: none;
		}
		.sh-hd {
			display: none;
		}
		.sh-r {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 4px 12px;
		}
		.sh-p,
		.sh-to {
			grid-column: 1 / -1;
		}
		.sh-who {
			grid-row: 1;
		}
		.sh-st {
			grid-row: 1;
			grid-column: 2;
		}
		.sh-a {
			grid-column: 1 / -1;
			justify-content: flex-start;
			margin-top: 6px;
		}
	}
</style>
