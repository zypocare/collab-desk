<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { copyText } from '#lib/ui.svelte.ts';

	let role = $state<'brand' | 'creator'>('brand');
	let fee = $state(15000);
	let views = $state(45000);
	let niche = $state<'lifestyle' | 'beauty' | 'food' | 'tech' | 'finance'>('lifestyle');

	const BENCHMARKS: Record<typeof niche, { label: string; low: number; high: number }> = {
		lifestyle: { label: 'Lifestyle & Fashion', low: 0.25, high: 0.55 },
		beauty: { label: 'Beauty & Skincare', low: 0.3, high: 0.65 },
		food: { label: 'Food, Cafes & Travel', low: 0.2, high: 0.45 },
		tech: { label: 'Tech & Gadgets', low: 0.45, high: 0.9 },
		finance: { label: 'Finance & SaaS', low: 0.6, high: 1.25 }
	};

	const bm = $derived(BENCHMARKS[niche]);
	const safeFee = $derived(Math.max(0, Number(fee) || 0));
	const safeViews = $derived(Math.max(1, Number(views) || 1));
	const cpv = $derived(safeFee / safeViews);
	const cpm = $derived(cpv * 1000);

	const rating = $derived.by(() => {
		if (cpv <= bm.low) return { label: 'High ROI / Great Value', color: 'var(--ok, #6fd08c)', note: 'Well below typical Indian D2C creator CPV for this niche.' };
		if (cpv <= bm.high) return { label: 'Fair Market Rate', color: 'var(--g1, #9c7bff)', note: 'Right inside the standard Indian Instagram Reel benchmark.' };
		return { label: 'Premium CPV', color: 'var(--warn, #efb35a)', note: 'Above average CPV — justified if usage rights, whitelisting, or high-intent niche conversion is included.' };
	});

	const fairLow = $derived(Math.round((safeViews * bm.low) / 500) * 500);
	const fairHigh = $derived(Math.round((safeViews * bm.high) / 500) * 500);

	function copyReport() {
		const txt = [
			`Miracle CPV Report (${bm.label})`,
			`Creator fee: ₹${safeFee.toLocaleString('en-IN')}`,
			`Expected views: ${safeViews.toLocaleString('en-IN')}`,
			`CPV: ₹${cpv.toFixed(2)} / view · CPM: ₹${Math.round(cpm).toLocaleString('en-IN')}`,
			`Benchmark: ${rating.label} (Fair range: ₹${fairLow.toLocaleString('en-IN')} – ₹${fairHigh.toLocaleString('en-IN')})`,
			`Calculated free at https://app.miracleapp.live/tools/cpv-calculator`
		].join('\n');
		void copyText(txt, 'CPV report copied');
	}
</script>

<svelte:head>
	<title>Free Instagram CPV Calculator (India) · Miracle</title>
	<meta name="description" content="Calculate Instagram Reel Cost Per View (CPV) and CPM in ₹ against Indian creator economy benchmarks. Free for brands and creators." />
</svelte:head>

<div class="cp-shell">
	<header class="cp-nav">
		<a class="cp-brand" href="/tools"><Logo /><span>Miracle</span></a>
		<div class="cp-links">
			<a href="/tools/profile-review">AI Profile Reviewer</a>
			<a class="cp-cta" href="/signup">Start free</a>
		</div>
	</header>

	<main class="cp-main">
		<header class="cp-head">
			<span class="cp-eb">Free calculator · Indian creator benchmarks</span>
			<h1>Instagram <em>CPV</em> Calculator</h1>
			<p>Know what a view is actually worth (`₹ ÷ Views`) before you quote a brand or approve an influencer budget.</p>
		</header>

		<div class="cp-role" role="tablist" aria-label="Calculator perspective">
			<button type="button" class:on={role === 'brand'} onclick={() => (role = 'brand')}>I’m a Brand</button>
			<button type="button" class:on={role === 'creator'} onclick={() => (role = 'creator')}>I’m a Creator</button>
		</div>

		<section class="cp-card">
			<div class="cp-row2">
				<div class="cp-f">
					<label for="cp-fee">{role === 'brand' ? 'Creator fee / budget (₹)' : 'Your quoted fee (₹)'}</label>
					<input id="cp-fee" type="number" min="0" step="500" bind:value={fee} />
				</div>
				<div class="cp-f">
					<label for="cp-views">Average Reel views</label>
					<input id="cp-views" type="number" min="100" step="1000" bind:value={views} />
				</div>
			</div>

			<div class="cp-f">
				<span class="cp-lbl">Niche benchmark</span>
				<div class="cp-chips">
					{#each Object.entries(BENCHMARKS) as [k, v] (k)}
						<button type="button" class:on={niche === k} onclick={() => (niche = k as typeof niche)}>{v.label}</button>
					{/each}
				</div>
			</div>
		</section>

		<section class="cp-hero" style="--cp-c:{rating.color}">
			<div class="cp-top">
				<span class="cp-badge">{rating.label}</span>
				<button class="cp-soft" type="button" onclick={copyReport}><Icon name="copy" />Copy report</button>
			</div>

			<div class="cp-metrics">
				<div>
					<small>Cost per view (CPV)</small>
					<b>₹{cpv.toFixed(2)}</b>
				</div>
				<div>
					<small>Cost per 1,000 views (CPM)</small>
					<b>₹{Math.round(cpm).toLocaleString('en-IN')}</b>
				</div>
			</div>

			<p class="cp-note">{rating.note}</p>

			<div class="cp-fair">
				<span>Suggested fair range for {safeViews.toLocaleString('en-IN')} views in {bm.label}:</span>
				<b>₹{fairLow.toLocaleString('en-IN')} – ₹{fairHigh.toLocaleString('en-IN')}</b>
			</div>
		</section>

		<section class="cp-upsell">
			<div>
				<b>{role === 'brand' ? 'Manage briefs, creators & payouts without spreadsheets' : 'Send polished quotes, GST invoices & run free Auto-DM'}</b>
				<small>{role === 'brand' ? 'Miracle tracks every Reel, deliverable, and real verified CPV automatically.' : 'Create your free Miracle creator workspace in under 2 minutes.'}</small>
			</div>
			<a class="cp-neopop" href="/signup">Start free on Miracle <Icon name="arrow" /></a>
		</section>
	</main>
</div>

<style>
	.cp-shell {
		min-height: 100dvh;
		background:
			radial-gradient(640px 360px at 50% -80px, rgba(242, 90, 144, 0.14), transparent 72%),
			var(--bg, #0d0a0e);
		color: var(--ink, #f4eef2);
		padding: 18px 16px 56px;
	}
	.cp-nav {
		max-width: 720px;
		margin: 0 auto 28px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.cp-brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: inherit;
		font-family: var(--f-serif, Georgia, serif);
		font-size: 24px;
	}
	.cp-links {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.cp-links > a:first-child {
		color: var(--ink-2, #c9bfc6);
		text-decoration: none;
		font-size: 13px;
		font-weight: 600;
	}
	.cp-cta {
		padding: 7px 13px;
		border-radius: 7px;
		background: #f4eef2;
		color: #110d11;
		font-size: 12.5px;
		font-weight: 700;
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--g2, #f25a90);
	}
	.cp-main {
		max-width: 720px;
		margin: 0 auto;
		display: grid;
		gap: 16px;
	}
	.cp-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--g3, #ffae6b);
	}
	.cp-head h1 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: clamp(32px, 6vw, 44px);
		line-height: 1.06;
		margin: 6px 0 8px;
	}
	.cp-head h1 em {
		font-style: italic;
		color: var(--g2, #f25a90);
	}
	.cp-head p {
		margin: 0;
		font-size: 14.5px;
		color: var(--ink-2, #c9bfc6);
		line-height: 1.5;
	}
	.cp-role {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		padding: 4px;
		border-radius: 12px;
		background: var(--surface, #1a151a);
		border: 1px solid var(--line, #2e262e);
	}
	.cp-role button {
		padding: 9px;
		border-radius: 9px;
		border: 0;
		background: transparent;
		color: var(--ink-3, #a39aa1);
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}
	.cp-role button.on {
		background: var(--surface-2, #231d23);
		color: var(--ink, #f4eef2);
		box-shadow: inset 0 0 0 1px var(--line-strong, #3e343e);
	}
	.cp-card {
		background: var(--surface, #1a151a);
		border: 1px solid var(--line, #2e262e);
		border-radius: 18px;
		padding: 18px;
		display: grid;
		gap: 14px;
	}
	.cp-row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	@media (max-width: 560px) {
		.cp-row2 {
			grid-template-columns: 1fr;
		}
	}
	.cp-f {
		display: grid;
		gap: 6px;
	}
	.cp-f label,
	.cp-lbl {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3, #a39aa1);
	}
	.cp-f input {
		width: 100%;
		padding: 11px 13px;
		border-radius: 11px;
		border: 1px solid var(--line-strong, #3e343e);
		background: var(--surface-2, #231d23);
		color: var(--ink, #f4eef2);
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 16px;
		font-weight: 600;
	}
	.cp-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 7px;
	}
	.cp-chips button {
		padding: 7px 11px;
		border-radius: 99px;
		border: 1px solid var(--line-strong, #3e343e);
		background: var(--surface-2, #231d23);
		color: var(--ink-2, #c9bfc6);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.cp-chips button.on {
		border-color: var(--g1, #9c7bff);
		color: var(--ink, #f4eef2);
		background: color-mix(in oklab, var(--g1, #9c7bff) 18%, var(--surface-2, #231d23));
	}
	.cp-hero {
		border-radius: 20px;
		border: 1px solid color-mix(in oklab, var(--cp-c) 45%, var(--line, #2e262e));
		background:
			radial-gradient(260px 160px at 80% 0%, color-mix(in oklab, var(--cp-c) 18%, transparent), transparent 72%),
			linear-gradient(180deg, #1d1620, #151018);
		padding: 18px;
		display: grid;
		gap: 14px;
	}
	.cp-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.cp-badge {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		padding: 5px 10px;
		border-radius: 99px;
		color: var(--cp-c);
		background: color-mix(in oklab, var(--cp-c) 14%, transparent);
		border: 1px solid color-mix(in oklab, var(--cp-c) 40%, transparent);
	}
	.cp-soft {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 11px;
		border-radius: 8px;
		border: 1px solid var(--line-strong, #3e343e);
		background: var(--surface-2, #231d23);
		color: var(--ink-2, #c9bfc6);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.cp-metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.cp-metrics small {
		display: block;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--ink-3, #a39aa1);
	}
	.cp-metrics b {
		display: block;
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 42px;
		line-height: 1.05;
		margin-top: 2px;
	}
	.cp-note {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-2, #c9bfc6);
		line-height: 1.45;
	}
	.cp-fair {
		padding-top: 12px;
		border-top: 1px dashed var(--line-strong, #3e343e);
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 13px;
		color: var(--ink-2, #c9bfc6);
	}
	.cp-fair b {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 14px;
		color: var(--ink, #f4eef2);
	}
	.cp-upsell {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		flex-wrap: wrap;
		padding: 16px 18px;
		border-radius: 18px;
		border: 1px solid color-mix(in oklab, var(--g1, #9c7bff) 40%, var(--line, #2e262e));
		background: linear-gradient(125deg, rgba(156, 123, 255, 0.12), rgba(242, 90, 144, 0.1));
	}
	.cp-upsell b {
		display: block;
		font-size: 15px;
		margin-bottom: 3px;
	}
	.cp-upsell small {
		display: block;
		font-size: 12.5px;
		color: var(--ink-2, #c9bfc6);
	}
	.cp-neopop {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 10px 15px;
		border-radius: 7px;
		background: #f4eef2;
		color: #110d11;
		font-size: 13px;
		font-weight: 700;
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--g2, #f25a90);
	}
</style>
