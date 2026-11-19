<script lang="ts">
	import { supabase } from '../supabase';
	import { upiPaymentLink } from '../invoice';
	import { inviteLink } from '../invite';
	import { errMessage, inr } from '../util';
	import Icon from './Icon.svelte';
	import UpiQr from './UpiQr.svelte';

	type StoreLink = {
		id: string;
		title: string;
		url: string;
		kind?: 'link' | 'product' | 'call' | 'affiliate';
		subtitle?: string | null;
		price_inr?: number;
		badge?: string | null;
	};

	// Daily-use Creator Bio Storefront + Links + Fan Email List.
	// Paid items (Digital Drops & 1:1 Calls) open a direct 0%-fee UPI QR checkout drawer.
	let {
		links = [],
		fanList = null,
		first,
		upiId = null,
		whiteLabel = false
	}: {
		links?: StoreLink[];
		fanList?: { pitch: string | null } | null;
		first: string;
		upiId?: string | null;
		whiteLabel?: boolean;
	} = $props();

	const storefrontItems = $derived(links.filter((l) => (l.price_inr ?? 0) > 0 || l.kind === 'product' || l.kind === 'call'));
	const regularLinks = $derived(links.filter((l) => !((l.price_inr ?? 0) > 0 || l.kind === 'product' || l.kind === 'call')));

	const host = (u: string) => {
		try {
			return new URL(u).hostname.replace(/^www\./, '');
		} catch {
			return '';
		}
	};
	const kindLabel = (k?: string) => (k === 'call' ? '1:1 Call' : k === 'product' ? 'Digital Drop' : k === 'affiliate' ? 'Pick' : 'Link');
	const tap = (id: string) => void supabase.rpc('link_click', { p_id: id }).then(() => {});

	// ─── Direct 0%-Fee UPI Checkout Drawer State ───
	let activeItem = $state<StoreLink | null>(null);
	let buyerName = $state('');
	let buyerContact = $state('');
	let upiRef = $state('');
	let buyerNote = $state('');
	let orderBusy = $state(false);
	let orderErr = $state('');
	let orderDone = $state<{ delivery_url: string; title: string } | null>(null);

	const mobileUpiHref = $derived(
		activeItem && upiId && (activeItem.price_inr ?? 0) > 0
			? upiPaymentLink(upiId, first, activeItem.price_inr ?? 0, activeItem.title.slice(0, 40))
			: ''
	);

	function openCheckout(item: StoreLink) {
		tap(item.id);
		if ((item.price_inr ?? 0) <= 0 || !upiId) {
			window.open(item.url, '_blank', 'noopener,noreferrer');
			return;
		}
		activeItem = item;
		buyerName = '';
		buyerContact = '';
		upiRef = '';
		buyerNote = '';
		orderErr = '';
		orderDone = null;
	}

	async function submitOrder(e: SubmitEvent) {
		e.preventDefault();
		if (!activeItem) return;
		orderErr = '';
		if (!buyerName.trim()) return (orderErr = 'Enter your name.');
		if (!buyerContact.trim()) return (orderErr = 'Enter your email or WhatsApp number.');
		orderBusy = true;
		const { data, error: err } = await supabase.rpc('storefront_order_create', {
			p_link_id: activeItem.id,
			p_buyer_name: buyerName.trim(),
			p_buyer_contact: buyerContact.trim(),
			p_upi_ref: upiRef.trim(),
			p_note: buyerNote.trim()
		});
		orderBusy = false;
		if (err) return (orderErr = errMessage(err));
		orderDone = (data as { delivery_url: string; title: string }) ?? { delivery_url: activeItem.url, title: activeItem.title };
	}

	// ─── Fan Email List State ───
	let email = $state('');
	let name = $state('');
	let busy = $state(false);
	let error = $state('');
	let joined = $state(false);
	async function join(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return (error = 'Enter a valid email, like name@gmail.com.');
		busy = true;
		const { error: err } = await supabase.rpc('fan_join', { p_email: email.trim(), p_name: name.trim() });
		busy = false;
		if (err) return (error = errMessage(err).replace(/^LIMIT:[^:]+:/, ''));
		joined = true;
	}
</script>

{#if links.length || fanList}
	<section class="pl-sec" aria-label="Storefront, links and updates from {first}">
		<div class="pl-wrap">
			{#if storefrontItems.length}
				<div class="pl-head-row">
					<span class="pl-eb">{first}'s Storefront</span>
					<span class="pl-zero">0% fee · Direct UPI</span>
				</div>
				<div class="pl-store">
					{#each storefrontItems as item (item.id)}
						{@const paid = (item.price_inr ?? 0) > 0}
						<button type="button" class="pl-card" onclick={() => openCheckout(item)}>
							<div class="pl-card-top">
								<span class="pl-kind" class:call={item.kind === 'call'}>{kindLabel(item.kind)}</span>
								{#if item.badge}<span class="pl-badge">{item.badge}</span>{/if}
							</div>
							<b class="pl-card-t">{item.title}</b>
							{#if item.subtitle}<p class="pl-card-sub">{item.subtitle}</p>{/if}
							<div class="pl-card-ft">
								<span class="pl-price">{paid ? inr(item.price_inr ?? 0) : 'Free'}</span>
								<span class="pl-go">{item.kind === 'call' ? 'Book 1:1' : paid ? 'Get now' : 'Open'} <Icon name="arrow" /></span>
							</div>
						</button>
					{/each}
				</div>
			{/if}

			{#if regularLinks.length}
				<span class="pl-eb" style={storefrontItems.length ? 'margin-top:26px' : ''}>Find {first} elsewhere</span>
				<ul class="pl-links">
					{#each regularLinks as l (l.id)}
						<li>
							<a href={l.url} target="_blank" rel="noopener nofollow" onclick={() => tap(l.id)}>
								<div class="pl-ltxt">
									<b>{l.title}{#if l.badge}<em class="pl-inline-b">{l.badge}</em>{/if}</b>
									<small>{l.subtitle || host(l.url)}</small>
								</div>
								<Icon name="arrow" />
							</a>
						</li>
					{/each}
				</ul>
			{/if}

			{#if fanList}
				<div class="pl-fan">
					{#if joined}
						<p class="pl-ok"><Icon name="check" /> You're on {first}'s list.</p>
					{:else}
						<b>{fanList.pitch || `Get updates from ${first}`}</b>
						<form class="pl-f" onsubmit={join}>
							<input type="email" placeholder="Your email" bind:value={email} required />
							<input type="text" placeholder="Your name (optional)" bind:value={name} />
							<button type="submit" disabled={busy}>{busy ? 'Joining…' : 'Join'}</button>
						</form>
						{#if error}<p class="pl-err">{error}</p>{/if}
					{/if}
				</div>
			{/if}

			{#if !whiteLabel}
				<div class="pl-viral">
					<a href={inviteLink('creator', 'bio_storefront')}>Are you a creator? Launch your own free Miracle bio storefront &rarr;</a>
				</div>
			{/if}
		</div>
	</section>
{/if}

{#if activeItem}
	<div class="pl-modal-bg" role="dialog" aria-modal="true" aria-label="Checkout {activeItem.title}">
		<div class="pl-modal">
			<div class="pl-mhead">
				<div>
					<span class="pl-kind" class:call={activeItem.kind === 'call'}>{kindLabel(activeItem.kind)}</span>
					<h3>{activeItem.title}</h3>
				</div>
				<button type="button" class="pl-mclose" aria-label="Close" onclick={() => (activeItem = null)}>✕</button>
			</div>

			{#if orderDone}
				<div class="pl-mdone">
					<div class="pl-ok"><Icon name="check" /> Order sent to {first}!</div>
					<p>Your payment reference has been shared with {first} directly (0% platform commission).</p>
					{#if orderDone.delivery_url}
						<a class="pl-unlock" href={orderDone.delivery_url} target="_blank" rel="noopener noreferrer">
							Open {activeItem.kind === 'call' ? 'booking link' : 'access link'} <Icon name="arrow" />
						</a>
					{/if}
				</div>
			{:else}
				<div class="pl-mprice">
					<span>Pay directly via UPI</span>
					<b>{inr(activeItem.price_inr ?? 0)}</b>
				</div>
				{#if upiId}
					<div class="pl-mqr">
						<UpiQr {upiId} name={first} amount={activeItem.price_inr ?? 0} note={activeItem.title} />
						{#if mobileUpiHref}
							<a class="pl-upi-btn" href={mobileUpiHref}>Pay {inr(activeItem.price_inr ?? 0)} in UPI app</a>
						{/if}
					</div>
				{/if}
				<form class="pl-mform" onsubmit={submitOrder}>
					<input type="text" placeholder="Your name *" bind:value={buyerName} required />
					<input type="text" placeholder="Email or WhatsApp number *" bind:value={buyerContact} required />
					<input type="text" placeholder="UPI Ref / UTR number (after paying)" bind:value={upiRef} />
					{#if activeItem.kind === 'call'}
						<input type="text" placeholder="Preferred day/time or topic (optional)" bind:value={buyerNote} />
					{/if}
					{#if orderErr}<p class="pl-err">{orderErr}</p>{/if}
					<button type="submit" class="pl-submit" disabled={orderBusy}>
						{orderBusy ? 'Confirming…' : `Confirm payment & unlock ${activeItem.kind === 'call' ? 'booking' : 'access'}`}
					</button>
				</form>
			{/if}
		</div>
	</div>
{/if}

<style>
	.pl-sec { padding: 36px 0 8px; }
	.pl-wrap { max-width: 720px; margin: 0 auto; padding: 0 20px; }
	.pl-head-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
	.pl-eb { display: block; font: 700 11px/1.2 var(--f-body); letter-spacing: .16em; text-transform: uppercase; color: rgba(255,255,255,.55); margin-bottom: 10px; }
	.pl-head-row .pl-eb { margin-bottom: 0; }
	.pl-zero { font-size: 11px; font-weight: 700; color: #86E6A1; background: rgba(111,208,140,.14); border: 1px solid rgba(111,208,140,.35); padding: 3px 9px; border-radius: 999px; }

	.pl-store { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
	.pl-card { appearance: none; text-align: left; font: inherit; color: #fff; cursor: pointer; padding: 15px; border-radius: 18px; border: 1px solid rgba(255,255,255,.14); background: linear-gradient(155deg, rgba(156,123,255,.16), rgba(242,90,144,.08) 60%, rgba(255,255,255,.04)); display: flex; flex-direction: column; gap: 6px; transition: transform .18s ease, border-color .18s ease; }
	.pl-card:hover { transform: translateY(-2px); border-color: rgba(156,123,255,.65); }
	.pl-card-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
	.pl-kind { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; padding: 2.5px 7px; border-radius: 999px; background: rgba(156,123,255,.22); color: #E4DAFF; }
	.pl-kind.call { background: rgba(255,174,107,.2); color: #FFD5B2; }
	.pl-badge { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: rgba(242,90,144,.22); color: #FFB3CD; }
	.pl-card-t { font-size: 15px; font-weight: 700; line-height: 1.25; }
	.pl-card-sub { margin: 0; font-size: 12.5px; line-height: 1.4; color: rgba(255,255,255,.72); }
	.pl-card-ft { margin-top: auto; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,.14); display: flex; align-items: center; justify-content: space-between; }
	.pl-price { font-family: var(--f-serif, Georgia, serif); font-style: italic; font-size: 20px; color: #FFD1A6; }
	.pl-go { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #fff; }
	.pl-go :global(.ic) { width: 14px; height: 14px; }

	.pl-links { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
	.pl-links a { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); color: #fff; text-decoration: none; transition: border-color .18s, background .18s; }
	.pl-links a:hover { border-color: rgba(255,255,255,.32); background: rgba(255,255,255,.08); }
	.pl-ltxt { display: grid; gap: 2px; min-width: 0; }
	.pl-ltxt b { font-size: 14.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 7px; flex-wrap: wrap; }
	.pl-ltxt small { font-size: 12px; color: rgba(255,255,255,.58); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.pl-inline-b { font-style: normal; font-size: 10px; font-weight: 700; padding: 1.5px 6px; border-radius: 6px; background: rgba(156,123,255,.22); color: #E4DAFF; }
	.pl-links a :global(.ic) { width: 16px; height: 16px; flex: none; opacity: .75; }

	.pl-fan { margin-top: 20px; padding: 18px; border-radius: 16px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); display: grid; gap: 10px; }
	.pl-fan b { font-size: 15px; color: #fff; }
	.pl-f { display: flex; flex-wrap: wrap; gap: 8px; }
	.pl-f input { flex: 1 1 160px; height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: rgba(0,0,0,.3); color: #fff; font: inherit; font-size: 13.5px; }
	.pl-f button { height: 40px; padding: 0 18px; border: 0; border-radius: 10px; background: linear-gradient(135deg, var(--g1), var(--g2), var(--g3)); color: #120b12; font: inherit; font-size: 13.5px; font-weight: 800; cursor: pointer; }
	.pl-ok { display: inline-flex; align-items: center; gap: 7px; color: #86E6A1; font-weight: 700; font-size: 14px; margin: 0; }
	.pl-err { color: #FCA5A5; font-size: 12.5px; margin: 0; }
	.pl-viral { margin-top: 16px; text-align: center; }
	.pl-viral a { font-size: 12px; font-weight: 600; color: rgba(255,255,255,.62); text-decoration: none; }
	.pl-viral a:hover { color: #fff; text-decoration: underline; }

	.pl-modal-bg { position: fixed; inset: 0; z-index: 90; background: rgba(9,7,10,.82); backdrop-filter: blur(12px); display: grid; place-items: center; padding: 16px; }
	.pl-modal { width: 100%; max-width: 400px; max-height: 92vh; overflow-y: auto; background: #1A141C; border: 1px solid rgba(255,255,255,.16); border-radius: 22px; padding: 18px; color: #fff; display: grid; gap: 14px; }
	.pl-mhead { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.pl-mhead h3 { margin: 5px 0 0; font-size: 18px; line-height: 1.25; }
	.pl-mclose { appearance: none; border: 0; background: rgba(255,255,255,.1); color: #fff; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; flex: none; }
	.pl-mprice { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,.05); font-size: 13px; color: rgba(255,255,255,.8); }
	.pl-mprice b { font-family: var(--f-serif, Georgia, serif); font-style: italic; font-size: 24px; color: #FFD1A6; }
	.pl-mqr { display: grid; justify-items: center; gap: 10px; }
	.pl-upi-btn { display: inline-flex; align-items: center; justify-content: center; width: 100%; height: 40px; border-radius: 10px; background: rgba(111,208,140,.18); border: 1px solid rgba(111,208,140,.45); color: #9BF0B4; font-size: 13px; font-weight: 700; text-decoration: none; }
	.pl-mform { display: grid; gap: 8px; }
	.pl-mform input { height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16); background: rgba(0,0,0,.3); color: #fff; font: inherit; font-size: 13.5px; }
	.pl-submit { height: 42px; border: 0; border-radius: 11px; background: linear-gradient(135deg, var(--g1), var(--g2), var(--g3)); color: #120b12; font: inherit; font-size: 13.5px; font-weight: 800; cursor: pointer; }
	.pl-mdone { display: grid; gap: 10px; padding: 8px 0; }
	.pl-mdone p { margin: 0; font-size: 13px; color: rgba(255,255,255,.75); }
	.pl-unlock { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 42px; border-radius: 11px; background: linear-gradient(135deg, var(--g1), var(--g2), var(--g3)); color: #120b12; font-weight: 800; font-size: 13.5px; text-decoration: none; }
	.pl-unlock :global(.ic) { width: 15px; height: 15px; }
	@media (max-width: 600px) { .pl-store { grid-template-columns: 1fr; } }
</style>
