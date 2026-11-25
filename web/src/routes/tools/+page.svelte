<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
</script>

<svelte:head>
	<title>Free Creator &amp; Brand Tools · Miracle</title>
	<meta name="description" content="Free AI Instagram Profile Reviewer and CPV Calculator for Indian creators and D2C brands. No login required." />
</svelte:head>

<div class="ft-shell">
	<header class="ft-nav">
		<a class="ft-brand" href="/"><Logo /><span>Miracle</span></a>
		<a class="ft-cta" href="/signup">Start free</a>
	</header>

	<main class="ft-main">
		<div class="ft-head">
			<span class="ft-eb">Free forever · No login required</span>
			<h1>Tools built for India’s <em>creator economy</em></h1>
			<p>Audit your Instagram profile in 30 seconds or check fair Reel CPV rates before your next brand deal.</p>
		</div>

		<div class="ft-grid">
			<a class="ft-card" href="/tools/profile-review">
				<span class="ft-ic"><Icon name="spark" /></span>
				<span class="ft-pill">Creators</span>
				<h2>AI Profile Reviewer</h2>
				<p>Get a 100-point audit of your Instagram bio, content positioning, and brand readiness — plus a rewritten bio and rate range.</p>
				<span class="ft-go">Review my profile <Icon name="arrow" /></span>
			</a>

			<a class="ft-card" href="/tools/cpv-calculator">
				<span class="ft-ic"><Icon name="rupee" /></span>
				<span class="ft-pill">Brands &amp; Creators</span>
				<h2>CPV &amp; Rate Calculator</h2>
				<p>Calculate Cost Per View (`₹ ÷ Views`), CPM, and compare against Indian D2C creator benchmarks in real time.</p>
				<span class="ft-go">Calculate CPV <Icon name="arrow" /></span>
			</a>
		</div>
	</main>
</div>

<style>
	.ft-shell {
		min-height: 100dvh;
		background:
			radial-gradient(640px 360px at 50% -80px, rgba(156, 123, 255, 0.16), transparent 72%),
			var(--bg, #0d0a0e);
		color: var(--ink, #f4eef2);
		padding: 18px 18px 48px;
	}
	.ft-nav {
		max-width: 820px;
		margin: 0 auto 36px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.ft-brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: inherit;
		font-family: var(--f-serif, Georgia, serif);
		font-size: 24px;
	}
	.ft-cta {
		padding: 8px 14px;
		border-radius: 7px;
		background: #f4eef2;
		color: #110d11;
		font-size: 13px;
		font-weight: 700;
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--g2, #f25a90);
	}
	.ft-main {
		max-width: 820px;
		margin: 0 auto;
		display: grid;
		gap: 24px;
	}
	.ft-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--g1, #9c7bff);
	}
	.ft-head h1 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: clamp(34px, 6vw, 48px);
		line-height: 1.05;
		margin: 8px 0 10px;
	}
	.ft-head h1 em {
		font-style: italic;
		color: var(--g2, #f25a90);
	}
	.ft-head p {
		margin: 0;
		font-size: 15px;
		color: var(--ink-2, #c9bfc6);
		max-width: 540px;
		line-height: 1.5;
	}
	.ft-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 16px;
	}
	.ft-card {
		display: grid;
		gap: 10px;
		padding: 22px;
		border-radius: 20px;
		border: 1px solid var(--line-strong, #3e343e);
		background: var(--surface, #1a151a);
		text-decoration: none;
		color: inherit;
		transition: border-color 0.2s, transform 0.15s;
	}
	.ft-card:hover {
		border-color: var(--g1, #9c7bff);
		transform: translateY(-2px);
	}
	.ft-ic {
		width: 42px;
		height: 42px;
		border-radius: 12px;
		background: var(--surface-2, #231d23);
		border: 1px solid var(--line-strong, #3e343e);
		display: grid;
		place-items: center;
		color: var(--g2, #f25a90);
	}
	.ft-pill {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--g3, #ffae6b);
	}
	.ft-card h2 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 26px;
		margin: 0;
	}
	.ft-card p {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-2, #c9bfc6);
		line-height: 1.5;
	}
	.ft-go {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
		font-size: 13px;
		font-weight: 700;
		color: var(--ink, #f4eef2);
	}
</style>
