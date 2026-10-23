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

	type Rights = { ad_how: string; ad_code: string; ad_code_at: string | null; territory: string; excl_scope: string; excl_days: number | null; live_date: string | null };
	let info = $state<Info | null>(null);
	let rights = $state<Rights | null>(null);
	let pick = $state(30);
	let busy = $state(false);
	let error = $state('');

	async function load() {
		const { data } = await supabase.rpc('usage_info', { p_code: code });
		info = (data as Info) ?? null;
		const { data: r } = await supabase.rpc('brand_rights', { p_code: code });
		rights = (r as Rights) ?? null;
	}
	const HOW: Record<string, string> = {
		partnership: "Partnership ads from the creator's post",
		access: "Ads run from the creator's handle",
		repost: 'Repost on your page only, no paid ads'
	};
	async function copyCode() {
		try {
			await navigator.clipboard.writeText(rights?.ad_code ?? '');
			toast('Ad code copied', 'copy');
		} catch {
			toast('Select the code and copy it', 'alert');
		}
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

{#if rights && (rights.ad_how || rights.excl_days)}
	<section class="panel rv" style="--i:3;margin-top:18px">
		<div class="panel-h"><h2>Ads and exclusivity</h2>{#if rights.territory}<small>{rights.territory}</small>{/if}</div>
		<div class="br-r">
			{#if rights.ad_how}<p style="margin:0"><b>{HOW[rights.ad_how] ?? rights.ad_how}</b></p>{/if}
			{#if rights.ad_how === 'partnership'}
				{#if rights.ad_code}
					<div class="br-code"><code>{rights.ad_code}</code><button class="btn sm" onclick={copyCode}><Icon name="copy" />Copy</button></div>
					<ol class="hint br-steps">
						<li>In Meta Ads Manager, start a campaign and open the ad.</li>
						<li>Under Identity, turn on <b>Partnership ad</b> and choose <b>Use partnership ad code</b>.</li>
						<li>Paste this code. The ad runs from {creator}'s post with both names on it.</li>
					</ol>
				{:else}
					<p class="hint" style="margin:0">{creator} will share the partnership ad code here once the post is live.</p>
				{/if}
			{/if}
			{#if rights.excl_days}<p class="hint" style="margin:0"><Icon name="shield" /> {creator} won't promote {rights.excl_scope || 'competing brands'} for {rights.excl_days} days{rights.live_date ? ` after ${fmt(rights.live_date)}` : ' after the post goes live'}.</p>{/if}
		</div>
	</section>
{/if}

<style>
	.br-r {
		display: grid;
		gap: 10px;
		padding: 0 20px 20px;
	}
	.br-code {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--surface-2);
	}
	.br-code code {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 13px;
	}
	.br-steps {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 4px;
	}
</style>
