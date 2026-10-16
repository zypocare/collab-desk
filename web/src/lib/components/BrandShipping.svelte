<script lang="ts">
	import { supabase } from '../supabase';
	import { copyText, toast } from '../ui.svelte';
	import { CARRIERS, errMessage, fmt, trackUrl } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	type Info = {
		needs_product: boolean;
		can_ship: boolean;
		address_ready: boolean;
		name: string | null;
		address: string | null;
		phone: string | null;
		product: string;
		carrier: string;
		tracking: string;
		shipped_at: string | null;
		received_at: string | null;
	};

	let { code, creator, onchange }: { code: string; creator: string; onchange?: () => void } = $props();

	let info = $state<Info | null>(null);
	let carrier = $state('');
	let tracking = $state('');
	let busy = $state(false);
	let error = $state('');
	let editing = $state(false);

	async function load() {
		const { data } = await supabase.rpc('ship_info', { p_code: code });
		info = (data as Info) ?? null;
		if (info) {
			carrier = info.carrier;
			tracking = info.tracking;
		}
	}
	$effect(() => {
		void code;
		load();
	});

	async function ship(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!carrier) return (error = 'Choose the courier.');
		busy = true;
		const { error: err } = await supabase.rpc('brand_mark_shipped', { p_code: code, p_carrier: carrier, p_tracking: tracking });
		busy = false;
		if (err) return (error = errMessage(err));
		toast(`Thanks! ${creator} has been told it's on the way.`, 'box');
		editing = false;
		await load();
		onchange?.();
	}

	const label = $derived(info ? [info.name, info.address, info.phone ? `Phone: ${info.phone}` : ''].filter(Boolean).join('\n') : '');
	const when = (iso: string | null) => (iso ? fmt(iso.slice(0, 10)) : '');
</script>

{#if info?.needs_product && (info.can_ship || info.shipped_at || info.received_at)}
	<section class="panel rv action-panel" style="--i:2;margin-top:18px">
		<div class="panel-h">
			<h2>{info.received_at ? 'Product received' : info.shipped_at ? 'Product on its way' : 'Send the product'}</h2>
			{#if info.received_at}<span class="pill tint k-pay"><Icon name="check" />Received {when(info.received_at)}</span>
			{:else if info.shipped_at}<span class="pill tint k-product"><Icon name="box" />Shipped {when(info.shipped_at)}</span>
			{:else}<span class="pill tint k-new"><span class="dt pulse"></span>Your turn</span>{/if}
		</div>
		<div style="padding:0 20px 20px">
			{#if info.received_at}
				<p class="hint" style="margin:0">{creator} has your product{info.product ? ` (${info.product})` : ''}. The draft comes next.</p>
			{:else}
				{#if info.address}
					<div class="ship-addr">
						<div><span class="lbl-t">Ship to</span><p>{label}</p></div>
						<button class="btn sm" onclick={() => copyText(label, 'Address copied')}><Icon name="copy" />Copy</button>
					</div>
				{:else if !info.address_ready}
					<p class="hint" style="margin:0 0 12px">{creator} will share the shipping address here shortly. You can also ask in Messages.</p>
				{/if}
				{#if info.shipped_at && !editing}
					<div class="ship-track">
						<Icon name="box" />
						<span>Shipped via <b>{info.carrier}</b>{info.tracking ? ` · ${info.tracking}` : ''}</span>
						{#if trackUrl(info.carrier, info.tracking)}<a class="btn sm" href={trackUrl(info.carrier, info.tracking)} target="_blank" rel="noopener">Track</a>{/if}
						<button class="lnk" onclick={() => (editing = true)}>Edit</button>
					</div>
				{:else if info.can_ship}
					<form class="ship-form" onsubmit={ship} novalidate>
						<div class="f"><label for="bs-car">Courier</label><Select id="bs-car" bind:value={carrier} placeholder="Choose" options={CARRIERS.map((x) => ({ value: x, label: x }))} /></div>
						<div class="f"><label for="bs-trk">Tracking number <span class="hint">(optional)</span></label><input class="inp" id="bs-trk" bind:value={tracking} placeholder="AWB / tracking ID" /></div>
						<button class="btn grad" type="submit" disabled={busy}>{#if busy}<span class="spinner"></span>Saving…{:else}<Icon name="send" />{info.shipped_at ? 'Update' : "It's shipped"}{/if}</button>
					</form>
					{#if error}<div class="err" style="margin-top:10px">{error}</div>{/if}
				{/if}
			{/if}
		</div>
	</section>
{/if}
