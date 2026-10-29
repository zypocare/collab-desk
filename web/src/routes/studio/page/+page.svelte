<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { downloadMediaKit } from '#lib/mediaKitPdf.ts';
	import type { PublicPage } from '#lib/types.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { PHONE_Q } from '#lib/phone.svelte.ts';
	import { waShare } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import GetFound from '#lib/components/GetFound.svelte';
	import Segmented from '#lib/components/Segmented.svelte';

	// Her brand page (the public page brands see): the link and ways to share it, what is on it
	// with a shortcut to change each part, and a live preview as a laptop or a phone shows it.
	onMount(() => {
		if (matchMedia(PHONE_Q).matches) goto('/studio/profile', { replaceState: true });
	});
	const s = $derived(studio.settings!);
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	let device = $state<'laptop' | 'phone'>('laptop');
	let frameKey = $state(0);

	let kitBusy = $state(false);
	async function kit() {
		kitBusy = true;
		const { data, error } = await supabase.rpc('public_page');
		if (error || !data) toast(`Couldn't make the media kit: ${error?.message ?? 'no data'}`, 'alert');
		else await downloadMediaKit(data as PublicPage, link).catch((e) => toast(`Couldn't make the media kit: ${e}`, 'alert'));
		kitBusy = false;
	}

	const rates = $derived(Object.values(s.rates ?? {}).filter((v) => Number(v) > 0).length);
	const parts = $derived([
		{ icon: 'edit', label: 'Profile & Instagram', sub: studio.ig?.connected ? `@${s.handle} · live numbers from Instagram` : 'Name, niche, city and numbers', on: true, href: '/studio/settings?s=profile' },
		{ icon: 'rupee', label: 'Rates & packages', sub: rates ? `${rates} content type${rates === 1 ? '' : 's'} priced` : 'No prices shown yet', on: rates > 0, href: '/studio/settings?s=rates' },
		{ icon: 'cal', label: 'Open weeks', sub: s.show_availability ? 'Brands see which weeks are free' : 'Hidden from brands', on: s.show_availability, href: '/studio/settings?s=bookings' },
		{ icon: 'gift', label: 'Pricing & offers', sub: [s.rebook_offer ? 'Book again on' : '', s.instant_booking ? 'instant booking on' : '', s.demand_pricing ? 'demand pricing on' : ''].filter(Boolean).join(' · ') || 'No offers switched on', on: s.rebook_offer || s.instant_booking || s.demand_pricing, href: '/studio/settings?s=offers' },
		{ icon: 'spark', label: 'Results & reviews', sub: s.show_results ? 'Past results and brand reviews shown' : 'Results hidden', on: s.show_results, href: '/studio/settings?s=reviews' },
		{ icon: 'chart', label: 'Insights link', sub: s.show_insights ? 'A full insights page for brands who ask' : 'Off', on: s.show_insights, href: '/studio/settings?s=profile' }
	]);
</script>

<svelte:head><title>Brand page · {s.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Share with brands</div>
		<h1>Brand <em>page</em></h1>
		<p>The page brands see when they open your link: who you are, your prices and how to book you.</p>
	</div>
</header>

<section class="bp-hero rv" style="--i:1">
	<div class="mesh" aria-hidden="true"></div>
	<div class="bp-main">
		<span class="bx-eb">Your link</span>
		<b class="bp-url">{link.replace(/^https?:\/\//, '')}</b>
		<p>Put it in your Instagram bio and send it in DMs. Brands sign in with their work email to send and track requests.</p>
		<div class="bp-acts">
			<button class="btn grad lg" onclick={() => copyText(link, 'Link copied')}><Icon name="copy" />Copy link</button>
			<a class="btn wa" href={waShare('', `My rates, packages and collab requests: ${link}`)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp my rate card</a>
			<a class="btn" href="/?preview=1" target="_blank" rel="noopener"><Icon name="eye" />Open your page</a>
			<a class="btn" href="/studio/qr"><Icon name="qr" />QR codes</a>
			<button class="btn" onclick={kit} disabled={kitBusy}>{#if kitBusy}<span class="spinner"></span>{:else}<Icon name="film" />{/if}Media kit PDF</button>
			{#if s.show_insights && studio.ig?.connected}<button class="btn" onclick={() => copyText(`${link}/insights`, 'Insights link copied. Send it when brands ask for insights')}><Icon name="chart" />Insights link</button><a class="btn wa" href={waShare('', `My live Instagram numbers (updated every day): ${link}/insights`)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp my media kit</a>{/if}
		</div>
	</div>
	<div class="bp-status">
		<span class="bx-pill" class:off={!s.accepting}><span class="dt"></span>{s.accepting ? 'Open for collaborations' : 'Not taking requests'}</span>
		<span class="bp-reply">Replies in about {s.reply_time || '1 day'}</span>
	</div>
</section>

<GetFound {link} />

<div class="bp-grid">
	<section class="panel bp-parts rv" style="--i:2">
		<div class="panel-h"><h2>What brands see</h2><a class="bp-all" href="/studio/settings">All settings<Icon name="arrow" /></a></div>
		{#each parts as p (p.label)}
			<a class="bp-part" href={p.href}>
				<span class="bp-ic"><Icon name={p.icon} /></span>
				<span class="bp-t"><b>{p.label}</b><small>{p.sub}</small></span>
				<span class="bp-on" class:off={!p.on}>{p.on ? 'Shown' : 'Off'}</span>
				<Icon name="chevR" />
			</a>
		{/each}
	</section>

	<section class="panel bp-prev rv" style="--i:3">
		<div class="panel-h">
			<h2>Live preview</h2>
			<div class="bp-tools">
				<Segmented label="Device" bind:value={device} options={[{ value: 'laptop', label: 'Laptop' }, { value: 'phone', label: 'Phone' }]} />
				<button class="icon-btn" onclick={() => frameKey++} aria-label="Reload preview" title="Reload"><Icon name="refresh" /></button>
			</div>
		</div>
		<div class="bp-stage" class:phone={device === 'phone'}>
			{#key frameKey + device}
				<div class="bp-device">
					<iframe src="/?preview=1" title="Your brand page" loading="lazy"></iframe>
				</div>
			{/key}
		</div>
	</section>
</div>

<style>
	.bp-hero { position: relative; overflow: hidden; isolation: isolate; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; padding: 30px 32px; margin-bottom: 18px; border-radius: 28px; background: var(--hero); color: var(--hero-ink); box-shadow: var(--shadow-lg); border: 1px solid color-mix(in oklab, var(--hero-ink) 8%, transparent); }
	.bp-hero > :global(.mesh) { opacity: .55; filter: blur(36px); z-index: -1; }
	.bp-main { flex: 1 1 520px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
	.bp-url { font: 600 clamp(26px, 2.6vw, 36px) var(--f-mono, monospace); letter-spacing: -.03em; color: var(--hero-ink); overflow-wrap: anywhere; }
	.bp-main p { margin: 0; max-width: 620px; font-size: 15.5px; color: color-mix(in oklab, var(--hero-ink) 70%, transparent); }
	.bp-acts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
	:global([data-desk]) .bp-acts .btn:not(.grad) { background: color-mix(in oklab, var(--hero-ink) 9%, transparent); color: var(--hero-ink); border-color: color-mix(in oklab, var(--hero-ink) 16%, transparent); }
	:global([data-desk]) .bp-acts .btn:not(.grad):hover { background: color-mix(in oklab, var(--hero-ink) 15%, transparent); }
	.bp-status { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
	.bp-reply { font-size: 14px; color: color-mix(in oklab, var(--hero-ink) 66%, transparent); }

	.bp-grid { display: grid; grid-template-columns: minmax(320px, 400px) minmax(0, 1fr); gap: 16px; align-items: start; }
	.bp-parts { padding-bottom: 10px; }
	.bp-all { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 600; color: var(--accent); text-decoration: none; }
	.bp-all :global(.ic) { width: 15px; height: 15px; }
	.bp-part { display: flex; align-items: center; gap: 12px; margin: 0 10px; padding: 12px 10px; border-radius: 14px; color: inherit; text-decoration: none; transition: background .15s; }
	.bp-part:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
	.bp-part > :global(.ic) { width: 16px; height: 16px; color: var(--ink-3); flex: none; }
	.bp-ic { width: 38px; height: 38px; flex: none; border-radius: 12px; display: grid; place-items: center; color: color-mix(in oklab, var(--g1) 70%, var(--ink)); background: color-mix(in oklab, var(--g1) 16%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--g1) 32%, transparent);}
	.bp-ic :global(.ic) { width: 18px; height: 18px; }
	.bp-t { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.bp-t b { font-size: 15px; font-weight: 600; }
	.bp-t small { font-size: 13px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.bp-on { flex: none; font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; color: var(--ok); background: color-mix(in oklab, var(--ok) 14%, transparent); }
	.bp-on.off { color: var(--ink-3); background: color-mix(in oklab, var(--ink) 7%, transparent); }
	.bp-tools { display: flex; align-items: center; gap: 8px; }
	.bp-stage { padding: 0 20px 22px; display: flex; justify-content: center; }
	.bp-device { position: relative; width: 100%; height: 640px; overflow: hidden; border-radius: 16px; border: 1px solid color-mix(in oklab, var(--ink) 12%, transparent); background: var(--bg); }
	.bp-device iframe { position: absolute; top: 0; left: 0; width: 200%; height: 200%; border: 0; transform: scale(.5); transform-origin: 0 0; }
	.bp-stage.phone .bp-device { width: 390px; height: 720px; border-radius: 44px; border: 10px solid #111; box-shadow: 0 30px 60px -30px rgba(0, 0, 0, .6); }
	.bp-stage.phone .bp-device iframe { width: 100%; height: 100%; transform: none; }
	@media (max-width: 1180px) { .bp-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
