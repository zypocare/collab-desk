<script lang="ts">
	import { onMount } from 'svelte';
	import { call, type Shipment } from '#lib/business.svelte.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { CARRIERS, errMessage, firstName, fmt, localDay, todayIso, trackUrl } from '#lib/util.ts';
	import Select from '#lib/components/Select.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';

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
	<!-- Like the creator's money screens: one glowing card with the counts, then each parcel as a ticket. -->
	<section class="hero-card glow m-hero m-pipe" aria-label="Shipping">
		<div class="mesh" aria-hidden="true"></div>
		<div class="hc-in">
			<div class="hc-top">
				<span class="hc-eb">To send</span>
				{#if toSend > 1 && !several}<button class="glass-chip" onclick={() => ((several = true), (open = null))}><Icon name="box" />Ship several</button>{/if}
			</div>
			<div class="hc-val">{toSend}</div>
			<div class="hc-sub">{toSend ? `address${toSend === 1 ? '' : 'es'} ready to ship to` : 'Nothing waiting to be sent'}</div>
			<div class="hc-foot">
				<div><small><span class="dt" style="--hue:var(--g2)"></span>To send</small><b>{toSend}</b></div>
				<div><small><span class="dt" style="--hue:var(--warn,#e0a23a)"></span>On the way</small><b>{moving}</b></div>
				<div><small><span class="dt" style="--hue:var(--ok)"></span>Received</small><b>{got}</b></div>
			</div>
		</div>
	</section>

	{#if several}
		<form class="panel sh-many" onsubmit={(e) => (e.preventDefault(), mark(pickedList, numbers.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)))}>
			<b>{pickedList.length ? `${pickedList.length} picked: ${pickedList.map((x) => firstName(x.creator)).join(', ')}` : 'Tick the creators you are sending to'}</b>
			<Select size="sm" ariaLabel="Courier" bind:value={carrier} options={carriers} />
			<textarea class="inp" rows="3" aria-label="Tracking numbers" placeholder="Tracking numbers, one per line, in the same order" bind:value={numbers}></textarea>
			<div class="sh-row">
				<button class="btn primary" disabled={busy || !pickedList.length}>Mark {pickedList.length || ''} shipped</button>
				<button type="button" class="btn ghost" onclick={() => ((several = false), (picked = {}))}>Cancel</button>
			</div>
		</form>
	{/if}

	<div class="tks m-plist">
		{#each list as s, i (s.collab_id)}
			<div class="sh-one">
				<Ticket
					name={s.creator}
					sub={s.code}
					money={s.received_at ? fmt(localDay(s.received_at)) : s.shipped_at ? fmt(localDay(s.shipped_at)) : ''}
					moneySub={s.received_at ? 'received' : s.shipped_at ? 'sent' : ''}
					task={s.product || 'Product'}
					status={s.received_at ? 'Received' : s.shipped_at ? `On the way · ${s.carrier ?? ''}${s.tracking ? ` ${s.tracking}` : ''}` : s.address_ready ? `Ready · ${s.name ?? ''}, ${s.address ?? ''}` : 'Waiting for their address'}
					tone={s.received_at ? 'ok' : s.shipped_at ? 'warn' : s.address_ready ? 'hot' : 'calm'}
					{i}
				>
					{#if several && ready(s)}
						<label class="btn"><input type="checkbox" aria-label="Pick {s.creator}" bind:checked={picked[s.collab_id]} />Pick</label>
					{:else if ready(s)}
						<button class="btn primary" onclick={() => start(s)} aria-expanded={open === s.collab_id}>Shipped?</button>
					{:else if onWay(s) && s.tracking}
						<a class="btn" href={trackUrl(s.carrier ?? '', s.tracking)} target="_blank" rel="noopener">Track</a>
					{:else if !s.shipped_at && !s.address_ready}
						<button class="btn" onclick={() => askAgain(s)}>Ask again</button>
					{/if}
				</Ticket>
				{#if open === s.collab_id}
					<form class="panel sh-form" onsubmit={(e) => (e.preventDefault(), mark([s], [tracking.trim()]))}>
						<Select size="sm" ariaLabel="Courier" bind:value={carrier} options={carriers} />
						<input class="inp" placeholder="Tracking number" aria-label="Tracking number" bind:value={tracking} />
						<div class="sh-row">
							<button class="btn primary" disabled={busy}>Save</button>
							<button type="button" class="btn ghost" onclick={() => (open = null)}>Cancel</button>
						</div>
					</form>
				{/if}
			</div>
		{:else}
			<div class="clear hero-card glow m-none">
				<div class="mesh" aria-hidden="true"></div>
				<span class="clear-ic"><Icon name="box" /></span>
				<b>Nothing to ship</b>
				<small>Products you send for barter or paid + product collabs show here, with the address each creator shares.</small>
			</div>
		{/each}
	</div>
{/if}

<style>
	.sh-one {
		display: grid;
		gap: 10px;
	}
	.sh-form,
	.sh-many {
		display: grid;
		gap: 10px;
		padding: 16px;
		margin-bottom: 14px;
	}
	.sh-row {
		display: flex;
		gap: 10px;
	}
	label.btn input {
		margin: 0 6px 0 0;
	}
</style>
