<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage, inr } from '../util';
	import Icon from './Icon.svelte';

	// Creator Bio Storefront & Links manager: add external links, affiliate picks, digital drops,
	// or 1:1 bookings (paid directly via UPI QR with 0% Miracle fee) and manage incoming orders.
	type Kind = 'link' | 'product' | 'call' | 'affiliate';
	type Link = {
		id: string;
		title: string;
		url: string;
		kind: Kind;
		subtitle: string;
		price_inr: number;
		badge: string;
		position: number;
		active: boolean;
		clicks: number;
	};
	type Order = {
		id: string;
		item_title: string;
		item_kind: string;
		amount_inr: number;
		buyer_name: string;
		buyer_contact: string;
		upi_ref: string;
		note: string;
		status: 'pending' | 'confirmed' | 'fulfilled';
		created_at: string;
	};

	const MAX = 20;
	let links = $state<Link[]>([]);
	let orders = $state<Order[]>([]);
	let loaded = $state(false);
	let kind = $state<Kind>('product');
	let title = $state('');
	let subtitle = $state('');
	let url = $state('');
	let price = $state('');
	let badge = $state('');
	let busy = $state(false);

	async function load() {
		const [lRes, oRes] = await Promise.all([
			supabase
				.from('page_links')
				.select('id, title, url, kind, subtitle, price_inr, badge, position, active, clicks')
				.order('position')
				.order('created_at'),
			supabase
				.from('storefront_orders')
				.select('id, item_title, item_kind, amount_inr, buyer_name, buyer_contact, upi_ref, note, status, created_at')
				.order('created_at', { ascending: false })
				.limit(20)
		]);
		if (lRes.error) toast(errMessage(lRes.error), 'alert');
		else links = (lRes.data as Link[]) ?? [];
		if (!oRes.error) orders = (oRes.data as Order[]) ?? [];
		loaded = true;
	}
	onMount(load);

	function fullUrl(v: string) {
		const t = v.trim();
		const u = /^https?:\/\//i.test(t) ? t : `https://${t}`;
		try {
			const p = new URL(u);
			return p.hostname.includes('.') && !/\s/.test(u) ? u : '';
		} catch {
			return '';
		}
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		const u = fullUrl(url);
		if (!title.trim()) return toast('Give this item a name, like "1:1 IG Audit" or "My YouTube".', 'alert');
		if (!u) return toast("Enter a valid link (e.g. Google Drive, Topmate/Cal, YouTube, or shop URL).", 'alert');
		if (links.length >= MAX) return toast(`Up to ${MAX} storefront items & links.`, 'alert');
		const pVal = Math.max(0, Math.round(Number(price) || 0));
		busy = true;
		const { error } = await supabase.from('page_links').insert({
			title: title.trim().slice(0, 60),
			subtitle: subtitle.trim().slice(0, 120),
			url: u,
			kind,
			price_inr: pVal,
			badge: badge.trim().slice(0, 24),
			position: (links.at(-1)?.position ?? -1) + 1
		});
		busy = false;
		if (error) return toast(errMessage(error), 'alert');
		title = '';
		subtitle = '';
		url = '';
		price = '';
		badge = '';
		toast('Added to your bio storefront');
		await load();
	}

	async function toggle(l: Link) {
		const { error } = await supabase.from('page_links').update({ active: !l.active }).eq('id', l.id);
		if (error) return toast(errMessage(error), 'alert');
		l.active = !l.active;
	}

	async function remove(id: string) {
		const { error } = await supabase.from('page_links').delete().eq('id', id);
		if (error) return toast(errMessage(error), 'alert');
		links = links.filter((x) => x.id !== id);
		toast('Removed');
	}

	async function setOrderStatus(o: Order, next: 'confirmed' | 'fulfilled') {
		const { error } = await supabase.from('storefront_orders').update({ status: next }).eq('id', o.id);
		if (error) return toast(errMessage(error), 'alert');
		o.status = next;
		toast(`Order marked ${next}`);
	}
</script>

<div class="pl-ed">
	<div class="pl-ed-head">
		<div>
			<h3>Bio Storefront &amp; Links</h3>
			<p class="hint">Sell digital drops or 1:1 calls directly via your UPI ID (0% fee) or add affiliate &amp; social links to your public page.</p>
		</div>
	</div>

	<form class="pl-form" onsubmit={add}>
		<div class="pl-kinds" role="radiogroup" aria-label="Item type">
			{#each [['product', 'Digital Drop'], ['call', '1:1 Call'], ['affiliate', 'Affiliate Pick'], ['link', 'Social Link']] as [k, lbl] (k)}
				<button type="button" class="pl-kbtn" class:on={kind === k} onclick={() => (kind = k as Kind)}>{lbl}</button>
			{/each}
		</div>

		<div class="pl-grid">
			<input class="inp" placeholder={kind === 'call' ? 'Title (e.g. 30-min Brand Pitch Audit)' : kind === 'product' ? 'Title (e.g. My Reel Presets Pack)' : 'Link title (e.g. My YouTube)'} bind:value={title} maxlength={60} required />
			<input class="inp" placeholder={kind === 'call' ? 'Booking / Calendar URL (unlocked after pay)' : 'Destination / Download URL'} bind:value={url} required />
			<input class="inp" placeholder="Short subtitle (optional)" bind:value={subtitle} maxlength={120} />
			<div class="pl-pair">
				<input class="inp" type="number" min="0" max="500000" placeholder="Price ₹ (0 = free)" bind:value={price} />
				<input class="inp" placeholder="Badge (e.g. Popular)" bind:value={badge} maxlength={24} />
			</div>
		</div>

		<button type="submit" class="btn grad sm" disabled={busy}>
			{#if busy}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add to Bio Storefront
		</button>
	</form>

	{#if loaded}
		<div class="pl-list">
			{#each links as l (l.id)}
				<div class="pl-row" class:off={!l.active}>
					<div class="pl-info">
						<div class="pl-top">
							<span class="pl-tag">{l.kind}</span>
							<b>{l.title}</b>
							{#if l.price_inr > 0}<span class="pl-p">{inr(l.price_inr)}</span>{/if}
						</div>
						<small>{l.subtitle || l.url} · {l.clicks} tap{l.clicks === 1 ? '' : 's'}</small>
					</div>
					<div class="pl-acts">
						<button type="button" class="btn sm" onclick={() => toggle(l)}>{l.active ? 'Hide' : 'Show'}</button>
						<button type="button" class="btn sm" onclick={() => remove(l.id)} aria-label="Delete"><Icon name="trash" /></button>
					</div>
				</div>
			{:else}
				<p class="hint">No bio storefront items yet. Add your first digital drop, 1:1 call, or link above.</p>
			{/each}
		</div>

		{#if orders.length}
			<div class="pl-orders">
				<h4>Recent Storefront UPI Orders ({orders.length})</h4>
				{#each orders as o (o.id)}
					<div class="pl-orow">
						<div class="pl-info">
							<b>{o.buyer_name} · {o.item_title} ({inr(o.amount_inr)})</b>
							<small>{o.buyer_contact}{#if o.upi_ref} · UTR: {o.upi_ref}{/if}{#if o.note} · "{o.note}"{/if}</small>
						</div>
						<div class="pl-acts">
							{#if o.status === 'pending'}
								<button type="button" class="btn sm grad" onclick={() => setOrderStatus(o, 'confirmed')}>Confirm paid</button>
							{:else if o.status === 'confirmed'}
								<button type="button" class="btn sm" onclick={() => setOrderStatus(o, 'fulfilled')}>Mark delivered</button>
							{:else}
								<span class="pl-done">✓ Fulfilled</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.pl-ed { display: grid; gap: 16px; }
	.pl-ed h3 { margin: 0 0 4px; font-size: 16px; }
	.pl-ed h4 { margin: 8px 0 6px; font-size: 13.5px; color: var(--ink-2); }
	.pl-form { display: grid; gap: 10px; padding: 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); }
	.pl-kinds { display: flex; flex-wrap: wrap; gap: 6px; }
	.pl-kbtn { appearance: none; border: 1px solid var(--line); background: transparent; color: var(--ink-2); padding: 5px 11px; border-radius: 999px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
	.pl-kbtn.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
	.pl-grid { display: grid; gap: 8px; }
	.pl-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
	.pl-list, .pl-orders { display: grid; gap: 8px; }
	.pl-row, .pl-orow { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); }
	.pl-row.off { opacity: 0.55; }
	.pl-info { min-width: 0; display: grid; gap: 2px; }
	.pl-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
	.pl-tag { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; padding: 2px 6px; border-radius: 6px; background: color-mix(in oklab, var(--g1) 18%, var(--surface)); color: var(--g1); }
	.pl-p { font-size: 12px; font-weight: 700; color: var(--g3); }
	.pl-info small { color: var(--ink-3); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.pl-acts { display: flex; align-items: center; gap: 6px; flex: none; }
	.pl-done { font-size: 12px; font-weight: 700; color: var(--h-live); }
</style>
