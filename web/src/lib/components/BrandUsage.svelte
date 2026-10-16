<script lang="ts">
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { diff, errMessage, fmt, inr, usageLabel } from '../util';
	import Icon from './Icon.svelte';

	type Info = {
		usage: string;
		ends: string;
		ext_status: '' | 'requested' | 'approved' | 'declined';
		ext_days: number;
		ext_price: number;
		options: { days: number; price: number }[];
	};
	let { code, creator, onchange }: { code: string; creator: string; onchange?: () => void } = $props();

	let info = $state<Info | null>(null);
	let pick = $state(30);
	let busy = $state(false);
	let error = $state('');

	async function load() {
		const { data } = await supabase.rpc('usage_info', { p_code: code });
		info = (data as Info) ?? null;
	}
	$effect(() => {
		void code;
		load();
	});

	const left = $derived(info ? diff(info.ends) : 0);
	const offer = $derived(!!info && left <= 30 && info.ext_status !== 'requested');

	async function request() {
		error = '';
		busy = true;
		const { error: err } = await supabase.rpc('request_usage_extension', { p_code: code, p_days: pick });
		busy = false;
		if (err) return (error = errMessage(err));
		toast(`Sent to ${creator}`, 'send');
		await load();
		onchange?.();
	}
</script>

{#if info}
	<section class="panel rv" style="--i:3;margin-top:18px">
		<div class="panel-h">
			<h2>Usage rights</h2>
			{#if info.ext_status === 'requested'}<span class="pill tint k-nego">Extension requested</span>
			{:else if left < 0}<span class="pill tint k-bad">Ended</span>
			{:else if left <= 7}<span class="pill tint k-follow">Ending soon</span>{/if}
		</div>
		<div style="padding:0 20px 20px">
			<p style="margin:0 0 4px"><b>{usageLabel(info.usage)}</b> · {left < 0 ? `ended ${fmt(info.ends)}` : `until ${fmt(info.ends)}`}</p>
			<p class="hint" style="margin:0">{left < 0 ? 'Please stop running this content as ads, or extend below.' : `You can run this content as ads until then${left <= 30 && info.ext_status !== 'requested' ? '. Want longer? Extend below.' : '.'}`}</p>
			{#if info.ext_status === 'requested'}
				<p class="hint" style="margin-top:10px">You asked for {info.ext_days} more days ({inr(info.ext_price)}). {creator} will confirm shortly.</p>
			{:else if offer}
				<div class="usage-opts" role="radiogroup" aria-label="Extend by">
					{#each info.options as o (o.days)}
						<label class="usage-opt"><input type="radio" name="ext" value={o.days} bind:group={pick} /><b>{o.days} days</b><span>{inr(o.price)}</span></label>
					{/each}
				</div>
				<button class="btn grad" disabled={busy} onclick={request}>{#if busy}<span class="spinner"></span>Sending…{:else}<Icon name="send" />Request extension{/if}</button>
				{#if error}<div class="err" style="margin-top:8px">{error}</div>{/if}
			{/if}
		</div>
	</section>
{/if}
