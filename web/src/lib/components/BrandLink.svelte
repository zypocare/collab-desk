<script lang="ts">
	import { supabase } from '../supabase';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage, inr } from '../util';
	import Icon from './Icon.svelte';

	// For the brand: the promo code and link the creator is using, the taps it got, and a quick way
	// to report the orders from the code (so the results show real sales, not just views).
	let { code, creator }: { code: string; creator: string } = $props();
	type L = { id: string; slug: string; promo_code: string; has_target: boolean; target: string; short: string; clicks: number; week: number; days: { day: string; clicks: number }[]; sales: number | null; revenue: number | null; sales_by: string; sales_at: string | null };
	let l = $state<L | null>(null);
	let busy = $state(false);
	let editing = $state(false);
	let loaded = $state(false);
	// No link yet: the brand adds where it should go (and the code), and Miracle makes the tracked link.
	let target = $state('');
	let promo = $state('');
	async function addLink(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		const { data, error } = await supabase.rpc('brand_link_set', { p_code: code, p_target: target.trim(), p_promo: promo.trim() });
		busy = false;
		if (error) return toast(errMessage(error), 'alert');
		l = data as L;
		toast(`Tracked link made. ${creator} sees it on the collab.`, 'check');
	}
	const peak = $derived(Math.max(1, ...(l?.days ?? []).map((d) => d.clicks)));
	async function load() {
		const { data } = await supabase.rpc('brand_link', { p_code: code });
		l = (data as L | null) ?? null;
		loaded = true;
	}
	$effect(() => {
		void code;
		load();
	});
	async function report(e: SubmitEvent) {
		e.preventDefault();
		if (!l) return;
		const f = new FormData(e.currentTarget as HTMLFormElement);
		busy = true;
		const { error } = await supabase.rpc('report_sales', { p_link: l.id, p_sales: Number(f.get('sales')) || 0, p_revenue: Number(f.get('revenue')) || 0, p_note: String(f.get('note') ?? '') });
		busy = false;
		if (error) return toast(errMessage(error), 'alert');
		toast(`Thanks! ${creator} can see the sales now.`, 'check');
		editing = false;
		load();
	}
</script>

{#if l}
	<section class="panel rv brand-link" style="margin-top:18px">
		<div class="panel-h"><h2>Code &amp; link</h2><small>what {creator} is sharing</small></div>
		<div class="bl-row">
			{#if l.promo_code}<button class="bl-code" onclick={() => copyText(l!.promo_code, 'Code copied')}><small>Promo code</small><b>{l.promo_code}</b><Icon name="copy" /></button>{/if}
			<div class="bl-stat"><b>{l.clicks}</b><small>taps on the link{l.week ? ` · ${l.week} this week` : ''}</small></div>
			<div class="bl-stat"><b>{l.sales ?? '—'}</b><small>orders with the code</small></div>
			<div class="bl-stat"><b>{l.revenue !== null ? inr(l.revenue) : '—'}</b><small>sales</small></div>
		</div>
		{#if l.has_target && l.days?.some((d) => d.clicks)}
			<div class="bl-days" aria-label="Taps a day, last two weeks">{#each l.days as d (d.day)}<i style="height:{Math.max(3, (d.clicks / peak) * 36)}px" title="{d.day}: {d.clicks}"></i>{/each}</div>
		{/if}
		{#if l.short && l.has_target}<p class="hint bl-short">Tracked link: <button class="lnk" onclick={() => copyText(l!.short, 'Link copied')}>{l.short.replace(/^https?:\/\//, '')}</button> → {l.target.replace(/^https?:\/\//, '').slice(0, 60)}</p>{/if}
		{#if editing || l.sales === null}
			<form class="form-b bl-form" onsubmit={report}>
				<div class="f"><label for="bl-sales">Orders with the code</label><input class="inp num" id="bl-sales" name="sales" type="number" min="0" value={l.sales ?? ''} required /></div>
				<div class="f"><label for="bl-rev">Sales value (₹)</label><input class="inp num" id="bl-rev" name="revenue" type="number" min="0" value={l.revenue ?? ''} /></div>
				<div class="f span2"><label for="bl-note">Anything else <span class="hint">(optional)</span></label><input class="inp" id="bl-note" name="note" placeholder="e.g. sold out in 2 days" /></div>
				<div class="row-btns" style="border:0;padding:0"><button class="btn grad" type="submit" disabled={busy}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Report sales</button></div>
			</form>
		{:else}
			<p class="hint" style="margin:0;padding:0 20px 18px">Reported {l.sales_by === 'brand' ? 'by you' : `by ${creator}`}. <button class="lnk" onclick={() => (editing = true)}>Update</button></p>
		{/if}
	</section>
{:else if loaded}
	<section class="panel rv brand-link" style="margin-top:18px">
		<div class="panel-h"><h2>Track clicks &amp; orders</h2><small>a link and code for {creator}</small></div>
		<form class="form-b bl-form" onsubmit={addLink}>
			<div class="f span2"><label for="bl-target">Where the link should go</label><input class="inp" id="bl-target" type="url" placeholder="https://yourbrand.com/product" bind:value={target} /></div>
			<div class="f"><label for="bl-promo">Promo code <span class="hint">(optional)</span></label><input class="inp" id="bl-promo" maxlength="40" placeholder="e.g. NIVY15" bind:value={promo} /></div>
			<div class="row-btns" style="border:0;padding:0"><button class="btn grad" type="submit" disabled={busy || (!target.trim() && !promo.trim())}>{#if busy}<span class="spinner"></span>{:else}<Icon name="link" />{/if}Make a tracked link</button></div>
		</form>
		<p class="hint" style="margin:0;padding:0 20px 18px">Miracle makes a short link for {creator} to share. Every tap is counted here and in the results report. Briefs with a product link get one by themselves.</p>
	</section>
{/if}

<style>
	.bl-days {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 40px;
		padding: 0 20px 8px;
	}
	.bl-days i {
		flex: 1;
		max-width: 22px;
		border-radius: 3px 3px 0 0;
		background: linear-gradient(180deg, var(--g2), var(--g1));
	}
	.bl-short {
		margin: 0;
		padding: 0 20px 12px;
		font-size: 13px;
		overflow-wrap: anywhere;
	}
</style>
