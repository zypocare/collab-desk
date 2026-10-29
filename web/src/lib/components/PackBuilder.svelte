<script lang="ts">
	import { KIND_NOTE, bundlePrice, buildParam, cleanTiers, type BundleQty } from '../bundle';
	import type { BundleTier } from '../types';
	import { inr, plural } from '../util';

	// Her rates, then a package the brand builds from them: how many of each piece, with the discount for the
	// package's size (her steps) and a nudge to the next step. "Request this package" opens the request form with it.
	let { rates, tiers, first, replyTime = '' }: { rates: [string, number][]; tiers: BundleTier[]; first: string; replyTime?: string } = $props();

	const steps = $derived(cleanTiers(tiers));
	const rateMap = $derived(Object.fromEntries(rates));
	// Start with one of her first piece (a Reel, usually), so the price and the next saving show at once.
	let qty = $state<BundleQty>({});
	let started = false;
	$effect(() => {
		if (!started && rates.length) {
			started = true;
			qty = { [rates[0][0]]: 1 };
		}
	});
	const set = (k: string, d: number) => (qty = { ...qty, [k]: Math.max(0, Math.min(20, (qty[k] || 0) + d)) });
	const price = $derived(bundlePrice(rateMap, qty, steps));
	const lines = $derived(rates.filter(([k]) => qty[k] > 0).map(([k, v]) => ({ k, q: qty[k], t: `${qty[k]} × ${k}`, v: qty[k] * v })));
	const summary = $derived(lines.map((l) => `${l.q} ${plural(l.k, l.q)}`).join(' + '));
	const top = $derived(steps.at(-1)?.min ?? 1);
	const nudge = $derived(
		!price.pieces
			? 'Start with any piece.'
			: price.next
				? `Add ${price.next.more} more piece${price.next.more === 1 ? '' : 's'} and save ${price.next.pct}% on the whole package.`
				: price.pct
					? `Best price: ${price.pct}% off the whole package.`
					: ''
	);
	const href = $derived(`/brand/new?build=${encodeURIComponent(buildParam(qty))}`);
</script>

<div class="pb">
	<div class="pb-rates">
		{#each rates as [k, v] (k)}
			<div class="pb-rate">
				<span class="pb-rk">{k}</span>
				<b>{inr(v)}</b>
				<span class="pb-rn">{KIND_NOTE[k] ?? ''}</span>
				<button type="button" class="pb-add" onclick={() => set(k, 1)}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{qty[k] ? `Add another · ${qty[k]} in` : 'Add to package'}
				</button>
			</div>
		{/each}
	</div>

	<div class="pb-build">
		<section class="pb-list" aria-labelledby="pb-t">
			<span class="pb-eb">Build your package</span>
			<h3 id="pb-t">What do you need?</h3>
			<div class="pb-rows">
				{#each rates as [k, v] (k)}
					<div class="pb-row">
						<div class="pb-rt">
							<span class="pb-rk">{k}<b>{inr(v)}</b></span>
							<small class="pb-each">{inr(v)} each</small>
							<small class="pb-note">{KIND_NOTE[k] ?? ''}</small>
						</div>
						<button type="button" class="pb-step" onclick={() => set(k, -1)} disabled={!qty[k]} aria-label="One less {k}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></button>
						<b class="pb-q" aria-live="polite">{qty[k] || 0}</b>
						<button type="button" class="pb-step" class:on={!!qty[k]} onclick={() => set(k, 1)} aria-label="One more {k}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
					</div>
				{/each}
			</div>
		</section>

		<aside class="pb-sum" aria-label="Your package">
			<div class="pb-sh"><span class="pb-eb">Your package</span><small>{price.pieces === 1 ? '1 piece' : `${price.pieces} pieces`}</small></div>
			{#if !price.pieces}
				<p class="pb-empty">Add pieces, or tap Add on a rate.{#if steps[0]} {steps[0].min} or more get a package discount.{/if}</p>
			{/if}
			<div class="pb-lines">
				{#each lines as l (l.k)}<div class="pb-ln"><span>{l.t}</span><b>{inr(l.v)}</b></div>{/each}
				{#if price.pct}
					<div class="pb-ln"><span>One by one</span><s>{inr(price.full)}</s></div>
					<div class="pb-ln pb-off"><span>Package discount, {price.pct}% off</span><b>−{inr(price.save)}</b></div>
				{/if}
				<i class="pb-cut" aria-hidden="true"></i>
			</div>
			<p class="pb-mini">{summary || 'Your package is empty'}</p>
			<div class="pb-tot">
				<span>Total</span>
				<b>{inr(price.total)}</b>
				{#if price.pct}<s class="pb-was">{inr(price.full)}</s><em class="pb-chip">{price.pct}% off · save {inr(price.save)}</em>{/if}
			</div>
			{#if steps.length}
				<div class="pb-bar" aria-hidden="true"><i style="width:{Math.min(100, (price.pieces / top) * 100)}%"></i></div>
				<div class="pb-tiers" aria-hidden="true">{#each steps as t (t.min)}<span class:on={price.pieces >= t.min}>{t.min}+ · {t.pct}% off</span>{/each}</div>
			{/if}
			{#if nudge}<p class="pb-nudge">{nudge}</p>{/if}
			{#if price.pieces}
				<a class="pb-go" {href}><span class="pb-shine" aria-hidden="true"></span>Request this package</a>
			{:else}
				<span class="pb-go off" aria-disabled="true">Request this package</span>
			{/if}
			<p class="pb-fine">Goes to {first} as a request. {first} replies with a confirmed quote{replyTime ? `, usually within ${replyTime}` : ''}.</p>
		</aside>
	</div>
</div>

<style>
	.pb { display: flex; flex-direction: column; gap: 44px; }
	.pb svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
	.pb-eb { font: 700 11px/1 var(--f-body); letter-spacing: 0.24em; text-transform: uppercase; color: var(--ink-2); }

	/* Her rates, one card each. */
	.pb-rates { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; }
	.pb-rate { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 22px; border-radius: 20px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); }
	.pb-rate .pb-rk { font: 600 15px/1.2 var(--f-body); }
	.pb-rate > b { font: 400 clamp(32px, 2.8vw, 40px)/1 var(--f-display); letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
	.pb-rn { flex: 1; font-size: 13.5px; line-height: 1.45; color: var(--ink-3); }
	.pb-add { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 38px; margin-top: 4px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--ink); font: 600 13px var(--f-body); cursor: pointer; transition: box-shadow 0.2s; }
	.pb-add:hover { box-shadow: inset 0 0 0 1px var(--ink-3); }

	/* The builder: steppers on the left, the package on the right. */
	.pb-build { display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-start; }
	.pb-list { flex: 999 1 480px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
	.pb-list h3 { margin: 0 0 12px; font: 400 clamp(30px, 3vw, 40px) / 1.05 var(--f-display); }
	.pb-rows { display: flex; flex-direction: column; border-bottom: 1px solid var(--line); }
	.pb-row { display: flex; align-items: center; gap: 12px; min-height: 66px; padding: 8px 0; border-top: 1px solid var(--line); }
	.pb-rt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
	.pb-row .pb-rk { display: flex; align-items: baseline; gap: 8px; font: 600 15.5px/1.2 var(--f-body); }
	.pb-row .pb-rk b { display: none; font: 400 21px/1 var(--f-display); }
	.pb-each { font-size: 13px; color: var(--ink-3); }
	.pb-note { display: none; font-size: 12.5px; line-height: 1.35; color: var(--ink-3); }
	.pb-step { flex: none; width: 40px; height: 40px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--ink); cursor: pointer; transition: background 0.2s, color 0.2s; }
	.pb-step:disabled { opacity: 0.3; cursor: default; }
	.pb-step.on { background: var(--ink); color: var(--bg); box-shadow: none; }
	.pb-q { width: 26px; text-align: center; font: 600 18px var(--f-body); font-variant-numeric: tabular-nums; }

	.pb-sum { flex: 1 1 340px; min-width: 0; position: sticky; top: 96px; display: flex; flex-direction: column; gap: 14px; padding: 26px; border-radius: 24px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line-strong); }
	.pb-sh { display: flex; justify-content: space-between; align-items: baseline; }
	.pb-sh .pb-eb { color: var(--ink); }
	.pb-sh small { font-size: 13px; color: var(--ink-3); }
	.pb-empty { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
	.pb-lines { display: flex; flex-direction: column; gap: 10px; }
	.pb-ln { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--ink-2); }
	.pb-ln b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
	.pb-ln.pb-off, .pb-ln.pb-off b { color: var(--ok); }
	.pb-cut { display: block; height: 0; margin-top: 4px; border-top: 2px dashed var(--line-strong); }
	.pb-mini { display: none; margin: 0; font-size: 12.5px; color: var(--ink-2); }
	.pb-tot { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; }
	.pb-tot > span { flex: 1; font-size: 14px; font-weight: 700; }
	.pb-tot > b { font: 400 48px/1 var(--f-display); font-variant-numeric: tabular-nums; }
	.pb-was, .pb-chip { display: none; }
	.pb-bar { position: relative; height: 6px; border-radius: 6px; background: var(--line); overflow: hidden; }
	.pb-bar i { position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: var(--grad); transition: width 0.35s var(--ease); }
	.pb-tiers { display: flex; justify-content: space-between; gap: 8px; margin-top: -6px; font-size: 12px; color: var(--ink-3); white-space: nowrap; }
	.pb-tiers .on { color: var(--ink); font-weight: 700; }
	.pb-nudge { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--g3); }
	.pb-go { position: relative; display: flex; align-items: center; justify-content: center; height: 56px; margin-top: 4px; background: var(--grad); color: #fff; font: 700 13px/1 var(--f-body); letter-spacing: 0.14em; text-transform: uppercase; text-decoration: none; box-shadow: 5px 5px 0 color-mix(in oklab, var(--g1) 72%, #000); transition: transform 0.12s var(--ease), box-shadow 0.12s var(--ease); }
	.pb-go:hover { transform: translate(-2px, -2px); }
	.pb-go:active { transform: translate(5px, 5px); box-shadow: none; }
	.pb-go.off { opacity: 0.4; box-shadow: none; }
	.pb-shine { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
	.pb-shine::after { content: ''; position: absolute; top: 0; bottom: 0; left: -50%; width: 35%; background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.38), transparent); transform: skewX(-18deg); animation: pb-sweep 5s ease-in-out infinite; }
	@keyframes pb-sweep { 0%, 70% { left: -50%; } 100% { left: 130%; } }
	.pb-fine { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--ink-3); text-align: center; }

	/* Phone: one list (the rate, its note and the steppers), then a total bar that stays at the bottom. */
	@media (max-width: 760px) {
		.pb { gap: 0; }
		.pb-rates, .pb-each, .pb-lines, .pb-tiers, .pb-fine, .pb-sh, .pb-empty { display: none; }
		.pb-row .pb-rk b, .pb-note, .pb-mini { display: block; }
		.pb-row .pb-rk b { display: inline; }
		.pb-row { align-items: center; gap: 10px; }
		.pb-step { width: 36px; height: 36px; }
		.pb-q { width: 20px; font-size: 16px; }
		.pb-build { gap: 18px; }
		.pb-sum { flex-basis: 100%; position: sticky; top: auto; bottom: 0; z-index: 5; gap: 10px; margin-inline: -16px; padding: 14px 16px calc(18px + env(safe-area-inset-bottom, 0px)); border-radius: 20px 20px 0 0; background: color-mix(in oklab, var(--surface) 94%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
		.pb-tot > span { display: none; }
		.pb-tot > b { font-size: 34px; }
		.pb-was { display: inline; font-size: 13px; color: var(--ink-3); }
		.pb-chip { display: inline-flex; margin-left: auto; padding: 5px 10px; border-radius: 999px; background: color-mix(in oklab, var(--ok) 16%, transparent); color: var(--ok); font: normal 700 12.5px var(--f-body); }
		.pb-bar { height: 5px; }
		.pb-nudge { font-size: 12.5px; }
		.pb-go { height: 52px; margin-top: 2px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.pb-shine::after, .pb-bar i { animation: none; transition: none; }
	}
</style>
