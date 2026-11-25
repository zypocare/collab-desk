<script lang="ts">
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import { copyText, toast } from '#lib/ui.svelte.ts';

	type AuditPillar = { name: string; score: number; note: string };
	type AuditResult = {
		score: number;
		verdict: string;
		pillars: AuditPillar[];
		fixes: string[];
		bio_rewrite: string;
		rate_range: string;
	};

	let handle = $state('');
	let niche = $state('');
	let bio = $state('');
	let followers = $state('');
	let avgViews = $state('');
	let postsPerWeek = $state('3');
	let busy = $state(false);
	let res = $state<AuditResult | null>(null);

	function localAudit(): AuditResult {
		const f = Math.max(0, Number(followers) || 0);
		const v = Math.max(0, Number(avgViews) || 0);
		const ppw = Math.max(0, Number(postsPerWeek) || 0);
		const hasNiche = niche.trim().length >= 3;
		const hasEmail = /@|dm|collab|mail|link|bio/i.test(bio);
		const hasCity = /bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|kolkata|india|goa|jaipur/i.test(bio);

		const bioScore = Math.min(25, (bio.trim().length > 25 ? 12 : 6) + (hasNiche ? 7 : 2) + (hasCity ? 6 : 2));
		const hookScore = Math.min(25, v > 0 && f > 0 ? (v / f >= 0.4 ? 22 : v / f >= 0.15 ? 17 : 12) : 16);
		const engScore = Math.min(25, ppw >= 3 ? 21 : ppw >= 2 ? 17 : 12);
		const brandScore = Math.min(25, (hasEmail ? 16 : 8) + (f >= 5000 ? 7 : 4));
		const total = Math.max(20, Math.min(98, bioScore + hookScore + engScore + brandScore));

		const estBase = Math.max(1500, Math.round((v > 0 ? v * 0.25 : f * 0.2) / 500) * 500);
		const estHigh = Math.round((estBase * 1.6) / 500) * 500;

		return {
			score: total,
			verdict: total >= 78 ? 'Strong brand-ready foundation' : total >= 58 ? 'Good base — fix 3 quick leaks' : 'Needs clearer positioning to win brands',
			pillars: [
				{ name: 'Bio & Positioning', score: bioScore, note: hasCity ? 'Clear niche and location signal.' : 'Add your city and 1-line audience promise in line 1 of your bio.' },
				{ name: 'Reach & Hook Pull', score: hookScore, note: v > 0 ? `Averaging ${v.toLocaleString('en-IN')} views per Reel.` : 'Add average Reel views to benchmark non-follower reach.' },
				{ name: 'Posting Consistency', score: engScore, note: ppw >= 3 ? `${ppw} Reels/week keeps Instagram testing your content.` : 'Aim for 3 discovery Reels/week with a repeatable series.' },
				{ name: 'Brand Readiness', score: brandScore, note: hasEmail ? 'Clear collab CTA in bio.' : 'Add a direct collab link or email so brands can pitch in 1 tap.' }
			],
			fixes: [
				hasCity ? 'Pin 3 highest-share Reels at the top of your grid (1 intro + 2 breakout formats).' : 'Add your city & niche in line 1 of your bio so local & D2C brands find you in search.',
				'Add a Comment-to-DM keyword CTA on your next 3 Reels to spike first-hour comment velocity.',
				hasEmail ? 'Replace generic links with a live media kit showing verified reach and past brand work.' : 'Put a clear "Collabs / Rates" link in bio so agencies do not have to chase you in DMs.'
			],
			bio_rewrite: `${niche.trim() || 'Lifestyle & Reels Creator'} · Helping you discover the best finds\nNew series every week\nCollabs & media kit ↓`,
			rate_range: `₹${estBase.toLocaleString('en-IN')} – ₹${estHigh.toLocaleString('en-IN')} per Reel`
		};
	}

	async function runReview(e: SubmitEvent) {
		e.preventDefault();
		if (!handle.trim() && !bio.trim()) {
			toast('Enter your Instagram handle or bio first', 'alert');
			return;
		}
		busy = true;
		try {
			const r = await fetch('/api/public/profile-review', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					handle: handle.replace(/^@/, '').trim(),
					niche: niche.trim(),
					bio: bio.trim(),
					followers: Number(followers) || 0,
					avg_views: Number(avgViews) || 0,
					posts_per_week: Number(postsPerWeek) || 0
				})
			});
			const j = (await r.json().catch(() => null)) as AuditResult | null;
			if (r.ok && j && typeof j.score === 'number') {
				res = j;
			} else {
				res = localAudit();
			}
		} catch {
			res = localAudit();
		} finally {
			busy = false;
		}
	}

	const ringOffset = $derived(res ? Number((263.89 * (1 - res.score / 100)).toFixed(1)) : 263.89);
</script>

<svelte:head>
	<title>Free AI Instagram Profile Reviewer · Miracle</title>
	<meta name="description" content="Get a free 100-point AI audit of your Instagram creator profile, bio rewrite, and brand deal rate range. No Instagram password required." />
</svelte:head>

<div class="pr-shell">
	<header class="pr-nav">
		<a class="pr-brand" href="/tools"><Logo /><span>Miracle</span></a>
		<div class="pr-links">
			<a href="/tools/cpv-calculator">CPV Calculator</a>
			<a class="pr-cta" href="/signup">Start free</a>
		</div>
	</header>

	<main class="pr-main">
		<header class="pr-head">
			<span class="pr-eb">Free AI tool · No Instagram password</span>
			<h1>AI Instagram <em>Profile Reviewer</em></h1>
			<p>Get a 100-point brand-readiness score, 3 priority growth fixes, a rewritten bio, and a realistic Indian Reel rate range.</p>
		</header>

		<form class="pr-card pr-form" onsubmit={runReview}>
			<div class="pr-row2">
				<div class="pr-f">
					<label for="pr-handle">Instagram handle</label>
					<input id="pr-handle" type="text" bind:value={handle} placeholder="@yourhandle" required />
				</div>
				<div class="pr-f">
					<label for="pr-niche">Primary niche</label>
					<input id="pr-niche" type="text" bind:value={niche} placeholder="e.g. Bengaluru Food & Lifestyle" />
				</div>
			</div>

			<div class="pr-f">
				<label for="pr-bio">Current Instagram bio</label>
				<textarea id="pr-bio" rows="3" bind:value={bio} placeholder="Paste your exact Instagram bio lines here..."></textarea>
			</div>

			<div class="pr-row3">
				<div class="pr-f">
					<label for="pr-fol">Followers</label>
					<input id="pr-fol" type="number" min="0" bind:value={followers} placeholder="e.g. 20000" />
				</div>
				<div class="pr-f">
					<label for="pr-views">Avg Reel views</label>
					<input id="pr-views" type="number" min="0" bind:value={avgViews} placeholder="e.g. 12000" />
				</div>
				<div class="pr-f">
					<label for="pr-ppw">Reels / week</label>
					<input id="pr-ppw" type="number" min="0" max="21" bind:value={postsPerWeek} placeholder="3" />
				</div>
			</div>

			<button class="pr-neopop" type="submit" disabled={busy}>
				<Icon name="spark" />
				<span>{busy ? 'Auditing profile…' : 'Review my profile (Free)'}</span>
			</button>
		</form>

		{#if res}
			<section class="pr-res">
				<div class="pr-hero">
					<div class="pr-ring-wrap">
						<svg viewBox="0 0 100 100" aria-hidden="true">
							<circle class="t" cx="50" cy="50" r="42" />
							<circle class="p" cx="50" cy="50" r="42" stroke-dasharray="263.89" stroke-dashoffset={ringOffset} />
						</svg>
						<div>
							<b>{res.score}</b>
							<small>/ 100</small>
						</div>
					</div>
					<div class="pr-hcopy">
						<span class="pr-eb">@{handle.replace(/^@/, '') || 'creator'} audit</span>
						<h2>{res.verdict}</h2>
						<p>Estimated fair rate: <b>{res.rate_range}</b></p>
					</div>
				</div>

				<div class="pr-pillars">
					{#each res.pillars as p (p.name)}
						<div class="pr-pil">
							<div class="pr-ptop">
								<b>{p.name}</b>
								<span>{p.score}/25</span>
							</div>
							<div class="pr-bar"><i style="width:{(p.score / 25) * 100}%"></i></div>
							<small>{p.note}</small>
						</div>
					{/each}
				</div>

				<div class="pr-card">
					<h3>Top 3 fixes to grow faster</h3>
					<ol class="pr-fixes">
						{#each res.fixes as f, i (i)}
							<li>{f}</li>
						{/each}
					</ol>
				</div>

				<div class="pr-card">
					<div class="pr-bh">
						<h3>Suggested bio rewrite</h3>
						<button class="pr-soft" type="button" onclick={() => copyText(res?.bio_rewrite ?? '', 'Bio copied')}><Icon name="copy" />Copy bio</button>
					</div>
					<pre class="pr-bio-out">{res.bio_rewrite}</pre>
				</div>

				<div class="pr-upsell">
					<div>
						<b>Want live Reel tracking, free Auto-DM &amp; GST invoices?</b>
						<small>Connect Instagram in Miracle to unlock Golden Hour Pulse, Script Studio, and your verified media kit.</small>
					</div>
					<a class="pr-neopop" href="/signup">Create free creator account <Icon name="arrow" /></a>
				</div>
			</section>
		{/if}
	</main>
</div>

<style>
	.pr-shell {
		min-height: 100dvh;
		background:
			radial-gradient(640px 360px at 50% -80px, rgba(156, 123, 255, 0.16), transparent 72%),
			var(--bg, #0d0a0e);
		color: var(--ink, #f4eef2);
		padding: 18px 16px 56px;
	}
	.pr-nav {
		max-width: 720px;
		margin: 0 auto 28px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.pr-brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: inherit;
		font-family: var(--f-serif, Georgia, serif);
		font-size: 24px;
	}
	.pr-links {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.pr-links > a:first-child {
		color: var(--ink-2, #c9bfc6);
		text-decoration: none;
		font-size: 13px;
		font-weight: 600;
	}
	.pr-cta {
		padding: 7px 13px;
		border-radius: 7px;
		background: #f4eef2;
		color: #110d11;
		font-size: 12.5px;
		font-weight: 700;
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--g2, #f25a90);
	}
	.pr-main {
		max-width: 720px;
		margin: 0 auto;
		display: grid;
		gap: 16px;
	}
	.pr-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--g1, #9c7bff);
	}
	.pr-head h1 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: clamp(32px, 6vw, 44px);
		line-height: 1.06;
		margin: 6px 0 8px;
	}
	.pr-head h1 em {
		font-style: italic;
		color: var(--g2, #f25a90);
	}
	.pr-head p {
		margin: 0;
		font-size: 14.5px;
		color: var(--ink-2, #c9bfc6);
		line-height: 1.5;
	}
	.pr-card {
		background: var(--surface, #1a151a);
		border: 1px solid var(--line, #2e262e);
		border-radius: 18px;
		padding: 18px;
		display: grid;
		gap: 12px;
	}
	.pr-row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.pr-row3 {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}
	@media (max-width: 580px) {
		.pr-row2,
		.pr-row3 {
			grid-template-columns: 1fr;
		}
	}
	.pr-f {
		display: grid;
		gap: 5px;
	}
	.pr-f label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3, #a39aa1);
	}
	.pr-f input,
	.pr-f textarea {
		width: 100%;
		padding: 10px 12px;
		border-radius: 11px;
		border: 1px solid var(--line-strong, #3e343e);
		background: var(--surface-2, #231d23);
		color: var(--ink, #f4eef2);
		font-family: inherit;
		font-size: 14px;
	}
	.pr-neopop {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 11px 16px;
		border-radius: 7px;
		border: 0;
		background: #f4eef2;
		color: #110d11;
		font-size: 13.5px;
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		box-shadow: 3px 3px 0 var(--g2, #f25a90);
	}
	.pr-neopop:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.pr-soft {
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
	.pr-res {
		display: grid;
		gap: 14px;
	}
	.pr-hero {
		display: grid;
		grid-template-columns: 104px 1fr;
		align-items: center;
		gap: 16px;
		padding: 18px;
		border-radius: 20px;
		border: 1px solid var(--line-strong, #3e343e);
		background: linear-gradient(145deg, #211826, #151018);
	}
	.pr-ring-wrap {
		position: relative;
		width: 104px;
		height: 104px;
		display: grid;
		place-items: center;
	}
	.pr-ring-wrap svg {
		width: 104px;
		height: 104px;
		transform: rotate(-90deg);
	}
	.pr-ring-wrap .t {
		fill: none;
		stroke: rgba(255, 255, 255, 0.08);
		stroke-width: 6;
	}
	.pr-ring-wrap .p {
		fill: none;
		stroke: var(--ok, #6fd08c);
		stroke-width: 6;
		stroke-linecap: round;
	}
	.pr-ring-wrap div {
		position: absolute;
		text-align: center;
	}
	.pr-ring-wrap b {
		display: block;
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 36px;
		line-height: 0.95;
	}
	.pr-ring-wrap small {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10px;
		color: var(--ink-3, #a39aa1);
	}
	.pr-hcopy h2 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 26px;
		margin: 4px 0 6px;
	}
	.pr-hcopy p {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-2, #c9bfc6);
	}
	.pr-pillars {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 10px;
	}
	@media (max-width: 580px) {
		.pr-pillars {
			grid-template-columns: 1fr;
		}
	}
	.pr-pil {
		background: var(--surface, #1a151a);
		border: 1px solid var(--line, #2e262e);
		border-radius: 14px;
		padding: 13px;
		display: grid;
		gap: 6px;
	}
	.pr-ptop {
		display: flex;
		justify-content: space-between;
		font-size: 13px;
	}
	.pr-ptop span {
		font-family: var(--f-mono, ui-monospace, monospace);
		color: var(--g1, #9c7bff);
		font-weight: 700;
	}
	.pr-bar {
		height: 4px;
		border-radius: 99px;
		background: var(--line, #2e262e);
		overflow: hidden;
	}
	.pr-bar i {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, var(--g1, #9c7bff), var(--g2, #f25a90), var(--g3, #ffae6b));
	}
	.pr-pil small {
		font-size: 12px;
		color: var(--ink-2, #c9bfc6);
		line-height: 1.4;
	}
	.pr-card h3 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 21px;
		margin: 0;
	}
	.pr-fixes {
		margin: 0;
		padding-left: 18px;
		display: grid;
		gap: 8px;
		font-size: 13.5px;
		color: var(--ink-2, #c9bfc6);
		line-height: 1.45;
	}
	.pr-bh {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.pr-bio-out {
		margin: 0;
		padding: 12px;
		border-radius: 12px;
		background: var(--surface-2, #231d23);
		border: 1px solid var(--line-strong, #3e343e);
		font-family: inherit;
		font-size: 13.5px;
		line-height: 1.5;
		white-space: pre-wrap;
		color: var(--ink, #f4eef2);
	}
	.pr-upsell {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		flex-wrap: wrap;
		padding: 16px 18px;
		border-radius: 18px;
		border: 1px solid color-mix(in oklab, var(--g2, #f25a90) 40%, var(--line, #2e262e));
		background: linear-gradient(125deg, rgba(156, 123, 255, 0.12), rgba(242, 90, 144, 0.1));
	}
	.pr-upsell b {
		display: block;
		font-size: 15px;
		margin-bottom: 3px;
	}
	.pr-upsell small {
		display: block;
		font-size: 12.5px;
		color: var(--ink-2, #c9bfc6);
	}
</style>
