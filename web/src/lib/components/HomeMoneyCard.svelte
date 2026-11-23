<script lang="ts">
	import type { Snippet } from 'svelte';
	import { homeCount, homeChange, moneySwipe } from '../homeMotion';
	import { inr } from '../util';
	const gradientId = $props.id();
	let { moneyView, moneyLabels, moneyValue, moneyCaption, pct, pctN, ringLabel, href, openLabel, showMoney, action, context, tiles }: {
		moneyView: number; moneyLabels: string[]; moneyValue: number; moneyCaption: string;
		pct: number; pctN: number; ringLabel: string; href: string; openLabel: string; showMoney: (index: number) => void;
		action: Snippet; context: Snippet; tiles: Snippet;
	} = $props();
</script>

<section class="hero-card glow m-hero" id="sec-money" aria-label="Money this month" use:moneySwipe={(direction) => showMoney(moneyView + direction)}>
	<div class="mesh" aria-hidden="true"></div>
	<a class="hc-go" {href} aria-label={openLabel} draggable="false"></a>
	<div class="hc-in">
		<div class="hc-top"><span class="hc-eb">{moneyLabels[moneyView]}</span>{@render action()}</div>
		<div class="hc-main">
			<div use:homeChange={moneyView}>
				<div class="hc-val" use:homeCount={{ value: moneyValue, money: true }}>{inr(moneyValue)}</div>
				<div class="hc-sub" aria-live="polite">{moneyCaption}</div>
			</div>
			<div class="goal" style="--p:{pct}">
				<svg viewBox="0 0 120 120" aria-hidden="true"
					><defs
						><linearGradient id="{gradientId}" x1="0" y1="0" x2="1" y2="1"
							><stop offset="0" style="stop-color:var(--g3)" /><stop offset=".5" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g1)" /></linearGradient
						></defs
					><circle class="g-track" cx="60" cy="60" r="50" /><circle class="g-prog" cx="60" cy="60" r="50" pathLength="100" style:stroke={`url(#${gradientId})`} use:homeCount={{ value: pct, ring: true }} /></svg
				>
				<div class="g-txt"><b use:homeCount={{ value: pctN, suffix: '%' }}>{pctN}%</b><small>{ringLabel}</small></div>
			</div>
		</div>
		<div class="hc-ctx">{@render context()}</div>
		<div class="hc-foot">{@render tiles()}</div>
		<div class="home-money-nav"><span>Tap a tile or swipe to inspect</span><div class="home-money-dots" role="group" aria-label="Money views">{#each moneyLabels as label, i (i)}<button aria-label={label} aria-pressed={moneyView === i} onclick={() => showMoney(i)}></button>{/each}</div></div>
	</div>
</section>
