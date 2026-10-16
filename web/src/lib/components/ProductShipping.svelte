<script lang="ts">
	import type { Collab } from '../types';
	import { markReceived, studio, updateCollab } from '../studio.svelte';
	import { CARRIERS, fmt, inTransit, stageIndex, trackUrl } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	let { c }: { c: Collab } = $props();
	const s = $derived(studio.settings!);
	const confirmed = $derived(stageIndex(c.stage) >= 2 && c.stage !== 'declined');
	const link = $derived(trackUrl(c.ship_carrier, c.ship_tracking));
	const when = (iso: string | null) => (iso ? fmt(iso.slice(0, 10)) : '');
	let busy = $state(false);
	let editing = $state(false);

	async function received() {
		busy = true;
		await markReceived(c);
		busy = false;
	}
</script>

<section class="sec">
	<h3>Product{#if c.product}<small class="sec-sub">{c.product}</small>{/if}</h3>

	{#if !s.ship_address}
		<div class="ship-note">
			<Icon name="alert" />
			<span>Add your shipping address so brands can send products once a collab is confirmed. <a class="lnk" href="/studio/settings?s=account">Add it in My page</a></span>
		</div>
	{/if}

	<ol class="ship-steps">
		<li class:on={confirmed}><span class="vd">{#if confirmed}<Icon name="check" />{/if}</span><div><b>Collab confirmed</b><small>{confirmed ? 'The brand can now see your address' : 'Your address is shared only after you confirm'}</small></div></li>
		<li class:on={!!c.shipped_at}>
			<span class="vd">{#if c.shipped_at}<Icon name="check" />{/if}</span>
			<div>
				<b>Shipped{c.ship_carrier ? ` via ${c.ship_carrier}` : ''}</b>
				<small>
					{#if c.shipped_at}{when(c.shipped_at)}{c.ship_tracking ? ` · ${c.ship_tracking}` : ''}{#if link}{' · '}<a class="lnk" href={link} target="_blank" rel="noopener">Track</a>{/if}
					{:else}Waiting for the brand{/if}
				</small>
			</div>
		</li>
		<li class:on={!!c.product_received_at}>
			<span class="vd">{#if c.product_received_at}<Icon name="check" />{/if}</span>
			<div>
				<b>Received</b>
				<small>{c.product_received_at ? `${when(c.product_received_at)}${c.draft_date ? ` · draft due ${fmt(c.draft_date)}` : ''}` : `Draft due ${s.draft_days_after_product} days after it arrives`}</small>
			</div>
		</li>
	</ol>

	<div class="row-btns" style="padding:12px 0 0;border:0">
		{#if !c.product_received_at && (inTransit(c) || confirmed)}
			<button class="btn sm {inTransit(c) ? 'primary' : ''}" disabled={busy} onclick={received}><Icon name="box" />Mark received</button>
		{/if}
		{#if !c.product_received_at}
			<button class="btn sm ghost" onclick={() => (editing = !editing)}>{editing ? 'Done' : 'Enter tracking myself'}</button>
		{/if}
	</div>
	{#if editing}
		<div class="fields" style="margin-top:10px">
			<div class="f"><label for="sh-car">Courier</label><Select id="sh-car" value={c.ship_carrier} placeholder="Choose" options={CARRIERS.map((x) => ({ value: x, label: x }))} onchange={(v) => updateCollab(c.id, { ship_carrier: v, shipped_at: c.shipped_at ?? new Date().toISOString() })} /></div>
			<div class="f"><label for="sh-trk">Tracking number</label><input class="inp" id="sh-trk" value={c.ship_tracking} onchange={(e) => updateCollab(c.id, { ship_tracking: (e.currentTarget as HTMLInputElement).value.trim() })} /></div>
		</div>
	{/if}
</section>
