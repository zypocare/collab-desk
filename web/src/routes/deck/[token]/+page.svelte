<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { confetti } from '#lib/ui.svelte.ts';
	import { compact, errMessage, inrS } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import ZeroLoginBrandBar from '#lib/components/ZeroLoginBrandBar.svelte';
	import BrandInvite from '#lib/components/BrandInvite.svelte';

	type DeckCreator = {
		name: string;
		handle: string;
		niche: string;
		city: string;
		photo: string | null;
		followers: number | null;
		engagement: number | null;
		avg_views: number | null;
		site_url: string;
		rates: Record<string, number> | null;
	};
	type DeckData = {
		id: string;
		token: string;
		agency_name: string;
		brand_name: string;
		brief_note: string;
		creators: DeckCreator[];
		views: number;
		created_at: string;
	};

	let deck = $state<DeckData | null>(null);
	let loaded = $state(false);
	let shortlisted = $state<Set<string>>(new Set());
	let modalOpen = $state(false);
	let brandName = $state('');
	let contact = $state('');
	let message = $state('');
	let busy = $state(false);
	let err = $state('');
	let sent = $state(false);

	onMount(async () => {
		const { data } = await supabase.rpc('roster_deck_view', { p_token: page.params.token ?? '' });
		deck = (data as DeckData) ?? null;
		if (deck) brandName = deck.brand_name;
		loaded = true;
	});

	function toggleShortlist(handle: string) {
		const n = new Set(shortlisted);
		if (n.has(handle)) n.delete(handle);
		else n.add(handle);
		shortlisted = n;
	}

	const startRate = (r: Record<string, number> | null) => {
		if (!r) return '';
		const vals = Object.values(r).map(Number).filter((v) => v > 0);
		return vals.length ? `From ${inrS(Math.min(...vals))}` : '';
	};

	async function submitInquiry(e: SubmitEvent) {
		e.preventDefault();
		if (!deck) return;
		err = '';
		busy = true;
		const { error } = await supabase.rpc('roster_deck_inquire', {
			p_token: deck.token,
			p_brand_name: brandName.trim(),
			p_contact: contact.trim(),
			p_selected_handles: [...shortlisted],
			p_message: message.trim()
		});
		busy = false;
		if (error) return (err = errMessage(error));
		sent = true;
		confetti();
	}
</script>

<svelte:head><title>{deck ? `Creator Roster for ${deck.brand_name}` : 'Creator Pitch Deck'}</title><meta name="robots" content="noindex" /></svelte:head>

{#if deck}
	<ZeroLoginBrandBar creator={deck.agency_name || 'This talent manager'} from="roster_deck" context="creator pitch deck" />
{/if}

<div class="page">
	<div class="wrap dk-wrap">
		{#if !loaded}
			<div class="loader" style="min-height:45vh"><span class="ring"><span></span></span></div>
		{:else if !deck}
			<div class="empty-card" style="margin-top:40px">
				<h2>Pitch deck not found</h2>
				<p>Check the link sent by your talent manager.</p>
			</div>
		{:else}
			<header class="dk-head">
				<span class="eb">Curated Creator Roster · Prepared for {deck.brand_name}</span>
				<h1>{deck.creators.length} Creator{deck.creators.length === 1 ? '' : 's'} for <em>{deck.brand_name}</em></h1>
				{#if deck.brief_note}<p class="dk-brief">{deck.brief_note}</p>{/if}
				<p class="hint">Tap <b>Shortlist</b> on the creators you like to send a 1-tap inquiry—no sign-in needed.</p>
			</header>

			<section class="dk-grid">
				{#each deck.creators as c (c.handle || c.name)}
					{@const key = c.handle || c.name}
					{@const on = shortlisted.has(key)}
					<article class="panel dk-card" class:on>
						<div class="dk-top">
							{#if c.photo}
								<img class="dk-av" src={c.photo} alt={c.name} loading="lazy" />
							{:else}
								<div class="dk-av dk-av-ph">{c.name.slice(0, 2).toUpperCase()}</div>
							{/if}
							<div class="dk-id">
								<b>{c.name}</b>
								<small>{[c.handle ? `@${c.handle.replace(/^@/, '')}` : '', c.niche, c.city].filter(Boolean).join(' · ')}</small>
							</div>
						</div>

						<div class="dk-stats">
							<div><small>Followers</small><b>{c.followers ? compact(c.followers) : '—'}</b></div>
							<div><small>Engagement</small><b>{c.engagement ? `${c.engagement.toFixed(1)}%` : '—'}</b></div>
							<div><small>Avg views</small><b>{c.avg_views ? compact(c.avg_views) : '—'}</b></div>
						</div>

						<div class="dk-foot">
							<span class="dk-rate">{startRate(c.rates) || 'Custom quote'}</span>
							<div class="dk-acts">
								{#if c.site_url}
									<a class="btn sm" href={c.site_url} target="_blank" rel="noopener">Media kit</a>
								{/if}
								<button type="button" class="btn sm" class:grad={on} onclick={() => toggleShortlist(key)}>
									{#if on}<Icon name="check" />Shortlisted{:else}<Icon name="plus" />Shortlist{/if}
								</button>
							</div>
						</div>
					</article>
				{/each}
			</section>

			<BrandInvite creator={deck.agency_name || deck.creators[0]?.name || ''} from="roster_deck" />
		{/if}
	</div>
</div>

{#if deck && shortlisted.size > 0}
	<div class="dk-bar no-print">
		<div class="dk-bar-in">
			<span><b>{shortlisted.size}</b> creator{shortlisted.size === 1 ? '' : 's'} shortlisted</span>
			<button type="button" class="btn grad sm" onclick={() => { sent = false; modalOpen = true; }}>
				<Icon name="send" />Request shortlisted creators
			</button>
		</div>
	</div>
{/if}

{#if modalOpen && deck}
	<div class="dialog-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (modalOpen = false)}>
		<div class="dialog" role="dialog" aria-modal="true" style="width:min(440px,100%)">
			{#if sent}
				<h2>Shortlist sent!</h2>
				<p>{deck.agency_name || 'The talent manager'} received your shortlist for {shortlisted.size} creator{shortlisted.size === 1 ? '' : 's'} and will reach out shortly.</p>
				<button type="button" class="btn grad" onclick={() => (modalOpen = false)}>Done</button>
			{:else}
				<h2>Request {shortlisted.size} shortlisted creator{shortlisted.size === 1 ? '' : 's'}</h2>
				<p class="hint">Selected: {[...shortlisted].map((h) => (h.startsWith('@') ? h : `@${h}`)).join(', ')}</p>
				<form class="dk-form" onsubmit={submitInquiry}>
					<input class="inp" placeholder="Your brand / name *" bind:value={brandName} required />
					<input class="inp" placeholder="Email or WhatsApp number *" bind:value={contact} required />
					<textarea class="inp" rows="3" placeholder="Campaign timeline, deliverables, or budget note (optional)" bind:value={message}></textarea>
					{#if err}<div class="err">{err}</div>{/if}
					<div style="display:flex;gap:8px;justify-content:flex-end">
						<button type="button" class="btn" onclick={() => (modalOpen = false)}>Cancel</button>
						<button type="submit" class="btn grad" disabled={busy}>{busy ? 'Sending…' : 'Send shortlist'}</button>
					</div>
				</form>
			{/if}
		</div>
	</div>
{/if}

<style>
	.dk-wrap { max-width: 960px; padding-bottom: 92px; }
	.dk-head { padding: 28px 0 20px; display: grid; gap: 6px; }
	.dk-head h1 { margin: 0; font-family: var(--f-serif, Georgia, serif); font-weight: 400; font-size: clamp(32px, 4vw, 46px); line-height: 1.08; }
	.dk-head h1 em { font-style: italic; color: var(--g2); }
	.dk-brief { margin: 4px 0 0; font-size: 15px; color: var(--ink-2); max-width: 64ch; }
	.dk-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 24px; }
	.dk-card { padding: 16px; display: grid; gap: 14px; transition: border-color .18s; }
	.dk-card.on { border-color: var(--g1); box-shadow: 0 0 0 1px color-mix(in oklab, var(--g1) 45%, transparent); }
	.dk-top { display: flex; align-items: center; gap: 12px; }
	.dk-av { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; flex: none; border: 2px solid var(--g2); }
	.dk-av-ph { display: grid; place-items: center; background: var(--surface-2); font-weight: 700; color: var(--ink); }
	.dk-id { min-width: 0; display: grid; gap: 2px; }
	.dk-id b { font-size: 16px; color: var(--ink); }
	.dk-id small { font-size: 12.5px; color: var(--ink-3); }
	.dk-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--surface-2); }
	.dk-stats small { display: block; font-size: 11px; color: var(--ink-3); }
	.dk-stats b { font-family: var(--f-serif, Georgia, serif); font-size: 20px; font-weight: 400; color: var(--ink); }
	.dk-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
	.dk-rate { font-family: var(--f-serif, Georgia, serif); font-style: italic; font-size: 18px; color: var(--g3); }
	.dk-acts { display: flex; gap: 6px; }
	.dk-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; background: color-mix(in oklab, var(--surface) 92%, #000); border-top: 1px solid var(--line); backdrop-filter: blur(12px); }
	.dk-bar-in { max-width: 960px; margin: 0 auto; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.dk-form { display: grid; gap: 10px; margin-top: 12px; }
	@media (max-width: 720px) { .dk-grid { grid-template-columns: 1fr; } }
</style>
