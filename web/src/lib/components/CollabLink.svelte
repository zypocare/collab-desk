<script lang="ts">
	import { reloadCollabs, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import type { Collab } from '../types';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage, inr } from '../util';
	import Icon from './Icon.svelte';

	// The brand's promo code and her own short link to the brand's page: clicks are counted, and the
	// sales from the code are reported by the brand (or typed in here).
	let { c }: { c: Collab } = $props();
	const l = $derived(c.links?.[0] ?? null);
	const site = $derived((studio.settings?.site_url || location.origin).replace(/\/$/, ''));
	const short = $derived(l ? `${site}/go/${l.slug}` : '');
	let busy = $state(false);

	async function save(patch: { promo_code?: string; target?: string }) {
		const target = patch.target?.trim();
		if (target && !/^https?:\/\//i.test(target)) return toast('Paste the full link, starting with https://', 'alert');
		busy = true;
		const { error } = l
			? await supabase.from('collab_links').update(patch).eq('id', l.id)
			: await supabase.from('collab_links').insert({ collab_id: c.id, ...patch });
		busy = false;
		if (error) return toast(`Couldn't save: ${errMessage(error)}`, 'alert');
		await reloadCollabs();
	}
	async function sales(e: SubmitEvent) {
		e.preventDefault();
		if (!l) return;
		const f = new FormData(e.currentTarget as HTMLFormElement);
		const { error } = await supabase.rpc('report_sales', { p_link: l.id, p_sales: Number(f.get('sales')) || 0, p_revenue: Number(f.get('revenue')) || 0, p_note: '' });
		if (error) return toast(errMessage(error), 'alert');
		toast('Sales saved', 'check');
		await reloadCollabs();
	}
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
</script>

<section class="sec" id="sec-link">
	<h3>Promo code &amp; link</h3>
	<div class="fields">
		<div class="f"><label for="ln-code">Promo code <span class="hint">(from the brand)</span></label><input class="inp" id="ln-code" placeholder="NIVI15" value={l?.promo_code ?? ''} onchange={(e) => save({ promo_code: val(e).trim().toUpperCase() })} /></div>
		<div class="f"><label for="ln-target">Brand's product or affiliate link</label><input class="inp" id="ln-target" type="url" placeholder="https://brand.com/product" value={l?.target ?? ''} onchange={(e) => save({ target: val(e).trim() })} /></div>
	</div>
	{#if l?.target}
		<div class="ln-short">
			<span class="ln-url"><Icon name="link" />{short.replace(/^https?:\/\//, '')}</span>
			<button class="btn sm" disabled={busy} onclick={() => copyText(short, 'Short link copied. Use it in your bio or Story link so clicks are counted.')}><Icon name="copy" />Copy</button>
		</div>
		<p class="hint" style="margin:6px 0 0">Use this link in your Story or bio instead of the brand's. Every tap is counted, then goes straight to the brand's page.</p>
	{/if}
	{#if l}
		<div class="ln-stats">
			<div><b>{l.clicks}</b><small>link taps</small></div>
			<div><b>{l.sales ?? '—'}</b><small>orders with the code</small></div>
			<div><b>{l.revenue !== null && l.revenue !== undefined ? inr(l.revenue) : '—'}</b><small>sales{l.sales_by === 'brand' ? ' (from the brand)' : ''}</small></div>
		</div>
		<form class="ln-sales" onsubmit={sales}>
			<input class="inp num" name="sales" type="number" min="0" placeholder="Orders" value={l.sales ?? ''} aria-label="Orders with the code" />
			<input class="inp num" name="revenue" type="number" min="0" placeholder="Sales ₹" value={l.revenue ?? ''} aria-label="Sales in rupees" />
			<button class="btn sm" type="submit"><Icon name="check" />Save sales</button>
		</form>
		<p class="hint" style="margin:6px 0 0">The brand can report the orders from the code on their request page too.</p>
	{/if}
</section>
