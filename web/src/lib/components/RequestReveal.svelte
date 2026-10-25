<script lang="ts">
	import { onMount } from 'svelte';
	import { decisionOf, studio } from '../studio.svelte';
	import { VERDICT_LABEL } from '../decide';
	import { fmt, inr, plural } from '../util';
	import { haptic } from '../feel';
	import type { Collab } from '../types';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
	import ScoreRing from './ScoreRing.svelte';

	// A new brand request opens like a sealed card on a phone: tap to break the seal, the card turns to
	// show the offer and how well it fits, then swipe right to quote or left to pass (or use the buttons).
	let { c, onquote, ondecline, onclose }: { c: Collab; onquote: () => void; ondecline: () => void; onclose: () => void } = $props();

	const d = $derived(decisionOf(c));
	const what = $derived(c.deliverables.length ? c.deliverables.map((x) => `${x.qty} ${plural(x.kind, x.qty)}`).join(' + ') : c.brief.split(/\n|\. /)[0].slice(0, 60) || 'A collab');
	const offer = $derived(c.fee > 0 ? inr(c.fee) : c.product_value > 0 ? `${inr(c.product_value)} product` : 'Your quote');
	const from = $derived(c.source === 'brand_page' ? 'from your page' : c.source === 'email' ? 'by email' : 'added to your desk');
	const reasons = $derived((d?.factors ?? []).filter((f) => f.headline).slice(0, 3));

	let phase = $state<'sealed' | 'opening' | 'open' | 'gone'>('sealed');
	let dx = $state(0);
	let dragging = $state(false);
	let x0 = 0;
	let fly = $state(0);

	onMount(() => {
		haptic('soft');
		const esc = (e: KeyboardEvent) => e.key === 'Escape' && onclose();
		addEventListener('keydown', esc);
		return () => removeEventListener('keydown', esc);
	});

	function open() {
		if (phase !== 'sealed') return;
		haptic('tap');
		phase = 'opening';
		setTimeout(() => (phase = 'open'), 900);
	}
	function go(dir: 1 | -1) {
		if (phase !== 'open') return;
		haptic(dir > 0 ? 'success' : 'tap');
		fly = dir;
		dragging = false;
		dx = dir * 520;
		phase = 'gone';
		setTimeout(() => (dir > 0 ? onquote() : ondecline()), 380);
	}
	function down(e: PointerEvent) {
		if (phase !== 'open') return;
		x0 = e.clientX;
		dragging = true;
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (dragging) dx = e.clientX - x0;
	}
	function up() {
		if (!dragging) return;
		if (dx > 110) return go(1);
		if (dx < -110) return go(-1);
		dragging = false;
		dx = 0;
	}
</script>

<div class="rr" role="dialog" aria-modal="true" aria-label="New request from {c.brand.name}">
	<i class="rr-b1" aria-hidden="true"></i><i class="rr-b2" aria-hidden="true"></i>
	<header class="rr-h">
		<span class="rr-eb">New request · {from} · {fmt(c.received_on)}</span>
		<button class="rr-x" onclick={onclose} aria-label="Look closer at the full request">Look closer</button>
	</header>

	<div class="rr-stage">
		<div
			class="rr-mover"
			role="group"
			aria-label="Swipe the card right to quote or left to pass"
			style="transform: translateX({dx}px) rotate({dx / 22}deg); transition: {dragging ? 'none' : fly ? 'transform .38s cubic-bezier(.5,0,.75,0)' : 'transform .5s cubic-bezier(.2,1.4,.35,1)'}"
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
		>
			<div class="rr-bob">
				<div class="rr-card" class:flipped={phase === 'open' || phase === 'gone'}>
					<button class="rr-face rr-front" onclick={open} aria-label="Open the request" tabindex={phase === 'sealed' ? 0 : -1}>
						<span class="rr-in">
							<span class="rr-flap" aria-hidden="true"></span>
							<span class="rr-shine" aria-hidden="true"></span>
							<span class="rr-seal" class:crack={phase !== 'sealed'} aria-hidden="true"><em>m</em></span>
							<span class="rr-ft">
								<span class="rr-eb">A brand wants you</span>
								<b class="rr-title">{c.brand.name}<br /><em>sent you a request</em></b>
								<span class="rr-tap"><Icon name="spark" />Tap to open</span>
							</span>
						</span>
					</button>
					<div class="rr-face rr-back" aria-hidden={phase === 'sealed' || phase === 'opening'}>
						<div class="rr-in rr-bk">
							<span class="rr-shine" aria-hidden="true"></span>
							<div class="rr-who"><Mono name={c.brand.name} size="lg" /><span><b>{c.brand.name}</b><small>{c.brand.instagram ? `@${c.brand.instagram.replace(/^@/, '')}` : c.brand.website || 'New brand'}</small></span></div>
							<div class="rr-offer">
								<span>
									<span class="rr-eb">{what}</span>
									<b class="rr-amt">{offer}</b>
									{#if c.live_date}<small>Live by {fmt(c.live_date)}</small>{/if}
								</span>
								{#if d}<span class="rr-score"><ScoreRing score={d.score} verdict={d.verdict} size={84} /><small>{VERDICT_LABEL[d.verdict]}</small></span>{/if}
							</div>
							{#if reasons.length}
								<ul class="rr-why">
									{#each reasons as f, i (f.key)}
										<li class="t-{f.tone}" style="--i:{i}"><span><Icon name={f.tone === 'bad' ? 'alert' : 'check'} /></span>{f.headline}</li>
									{/each}
								</ul>
							{:else if c.brief}
								<p class="rr-brief">{c.brief.slice(0, 160)}{c.brief.length > 160 ? '…' : ''}</p>
							{/if}
						</div>
					</div>
				</div>
			</div>
			<span class="rr-stamp q" style="opacity:{Math.max(0, Math.min(1, dx / 110))}">QUOTE</span>
			<span class="rr-stamp p" style="opacity:{Math.max(0, Math.min(1, -dx / 110))}">PASS</span>
		</div>
	</div>

	{#if phase === 'open'}
		<div class="rr-acts">
			<button class="rr-btn ghost" onclick={() => go(-1)}>Not for me</button>
			<button class="rr-btn grad" onclick={() => go(1)}>Send a quote</button>
			<p>or swipe the card: right to quote, left to pass</p>
		</div>
	{/if}
</div>

<style>
	.rr { position: fixed; inset: 0; z-index: 70; overflow: hidden; display: flex; flex-direction: column; padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); background: var(--bg); color: var(--ink); animation: rr-in .3s ease both; }
	@keyframes rr-in { from { opacity: 0; } }
	.rr-b1, .rr-b2 { position: absolute; border-radius: 50%; filter: blur(70px); pointer-events: none; }
	.rr-b1 { width: 320px; height: 320px; left: -120px; top: 140px; background: #6b3fd4; opacity: .45; animation: rr-d1 13s ease-in-out infinite alternate; }
	.rr-b2 { width: 280px; height: 280px; right: -120px; top: 440px; background: #d4296a; opacity: .32; animation: rr-d2 16s ease-in-out infinite alternate; }
	@keyframes rr-d1 { to { transform: translate(70px, -40px) scale(1.2); } }
	@keyframes rr-d2 { to { transform: translate(-60px, 50px) scale(.9); } }
	.rr-h { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 16px 0 20px; }
	.rr-eb { font: 700 11px/1.3 var(--f-body, inherit); letter-spacing: .2em; text-transform: uppercase; color: var(--ink-3); }
	.rr-x { height: 40px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--surface); box-shadow: inset 0 0 0 1px var(--line-strong); color: var(--ink); font: 600 13.5px var(--f-body, inherit); }
	.rr-stage { position: relative; flex: 1; min-height: 0; margin: 18px 22px 0; perspective: 1400px; }
	.rr-mover { position: absolute; inset: 0 0 auto; height: min(500px, 100%); touch-action: none; animation: rr-arrive 1s cubic-bezier(.2, 1.3, .35, 1) both; }
	@keyframes rr-arrive { 0% { translate: 0 -120%; rotate: -8deg; opacity: 0; } 60% { opacity: 1; } 100% { translate: 0 0; rotate: 0deg; } }
	.rr-bob { position: absolute; inset: 0; animation: rr-bob 4.5s ease-in-out infinite; }
	@keyframes rr-bob { 50% { translate: 0 -8px; rotate: .6deg; } }
	.rr-card { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .8s cubic-bezier(.3, 1.2, .35, 1); }
	.rr-card.flipped { transform: rotateY(180deg); }
	.rr-face { position: absolute; inset: 0; display: block; padding: 1.5px; border: 0; border-radius: 30px; background: linear-gradient(140deg, var(--g1), var(--g2) 50%, var(--g3)); backface-visibility: hidden; -webkit-backface-visibility: hidden; box-shadow: 0 50px 90px -40px rgba(0, 0, 0, .95), 0 20px 60px -30px color-mix(in oklab, var(--g2) 55%, transparent); color: inherit; font: inherit; text-align: center; cursor: pointer; }
	.rr-back { transform: rotateY(180deg); cursor: grab; text-align: left; }
	.rr-in { position: relative; display: block; height: 100%; overflow: hidden; border-radius: 28.5px; background: var(--surface); }
	.rr-shine { position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, .13) 48%, transparent 62%); background-size: 260% 100%; animation: rr-sh 4.5s ease-in-out infinite; pointer-events: none; }
	@keyframes rr-sh { 0%, 50% { background-position: 140% 0; } 100% { background-position: -40% 0; } }
	.rr-flap { position: absolute; left: 0; right: 0; top: 0; height: 40%; background: linear-gradient(180deg, var(--surface-2), var(--surface)); clip-path: polygon(0 0, 100% 0, 50% 100%); }
	.rr-seal { position: absolute; left: 50%; top: calc(40% - 46px); width: 92px; height: 92px; margin-left: -46px; border-radius: 50%; display: grid; place-items: center; background: radial-gradient(circle at 35% 30%, #ff8fb1, #d4296a 60%, #8a1747); box-shadow: inset 0 -6px 0 rgba(0, 0, 0, .25), 0 14px 30px -10px rgba(212, 41, 106, .8); transition: transform .45s cubic-bezier(.2, 1.4, .35, 1), opacity .4s; }
	.rr-seal::after { content: ''; position: absolute; inset: 8px; border-radius: 50%; border: 1.5px dashed rgba(255, 255, 255, .35); }
	.rr-seal em { font: italic 400 46px/1 var(--f-serif, Georgia, serif); color: #ffe6ef; }
	.rr-seal.crack { transform: scale(1.6) rotate(25deg); opacity: 0; }
	.rr-ft { position: absolute; left: 24px; right: 24px; top: calc(40% + 70px); display: flex; flex-direction: column; align-items: center; gap: 14px; }
	.rr-title { font: 400 30px/1.05 var(--f-serif, Georgia, serif); color: var(--ink); }
	.rr-title em { font-style: italic; background: linear-gradient(115deg, var(--g1), var(--g2) 52%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; padding-right: .06em; }
	.rr-tap { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 999px; background: color-mix(in oklab, var(--ink) 8%, transparent); box-shadow: inset 0 0 0 1px var(--line-strong); font-size: 13.5px; font-weight: 600; animation: rr-tapp 1.8s ease-in-out infinite; }
	.rr-tap :global(.ic) { width: 16px; height: 16px; color: var(--g3); }
	@keyframes rr-tapp { 50% { box-shadow: inset 0 0 0 1px var(--g2), 0 0 24px -4px color-mix(in oklab, var(--g2) 70%, transparent); } }
	.rr-bk { padding: 22px 20px; }
	.rr-who { position: relative; display: flex; align-items: center; gap: 12px; }
	.rr-who b { display: block; font-size: 17px; }
	.rr-who small { font-size: 12.5px; color: var(--ink-3); }
	.rr-offer { position: relative; display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; margin-top: 22px; }
	.rr-amt { display: block; margin-top: 6px; font: 400 50px/.95 var(--f-serif, Georgia, serif); }
	.rr-offer small { display: block; margin-top: 8px; font-size: 12.5px; color: var(--ink-2); }
	.rr-score { display: grid; justify-items: center; gap: 6px; }
	.rr-score small { font-size: 11.5px; font-weight: 600; color: var(--ink-2); }
	.rr-why { position: relative; display: grid; gap: 8px; margin: 22px 0 0; padding: 0; list-style: none; }
	.rr-why li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--surface-2); font-size: 13px; line-height: 1.35; opacity: 0; animation: rr-chip .55s cubic-bezier(.2, 1.3, .35, 1) both; animation-delay: calc(.9s + var(--i) * .16s); }
	@keyframes rr-chip { from { opacity: 0; translate: 0 10px; } to { opacity: 1; translate: 0 0; } }
	.rr-why li > span { width: 20px; height: 20px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--ok); color: #10230f; }
	.rr-why li.t-ok > span { background: var(--g3); }
	.rr-why li.t-bad > span { background: var(--bad); color: #fff; }
	.rr-why li > span :global(.ic) { width: 12px; height: 12px; stroke-width: 3; }
	.rr-brief { position: relative; margin: 20px 0 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
	.rr-stamp { position: absolute; top: 26px; padding: 6px 12px; border: 3px solid; border-radius: 8px; font: 800 22px/1 var(--f-body, inherit); letter-spacing: .12em; pointer-events: none; }
	.rr-stamp.q { left: 22px; rotate: -14deg; color: var(--ok); }
	.rr-stamp.p { right: 22px; rotate: 14deg; color: var(--g2); }
	.rr-acts { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr); gap: 14px; padding: 16px 20px 24px; animation: rr-up .6s cubic-bezier(.2, 1.2, .35, 1) .1s both; }
	@keyframes rr-up { from { translate: 0 40px; opacity: 0; } }
	.rr-acts p { grid-column: 1 / -1; margin: 2px 0 0; text-align: center; font-size: 12.5px; color: var(--ink-3); }
	.rr-btn { height: 56px; border: 0; font: 700 12.5px/1 var(--f-body, inherit); letter-spacing: .14em; text-transform: uppercase; cursor: pointer; transition: transform .12s, box-shadow .12s; }
	.rr-btn.grad { background: linear-gradient(115deg, var(--g1), var(--g2) 52%, var(--g3)); color: #fff; box-shadow: 5px 5px 0 #6a4bc9; }
	.rr-btn.grad:active { transform: translate(5px, 5px); box-shadow: none; }
	.rr-btn.ghost { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--line-strong), 5px 5px 0 var(--line); }
	.rr-btn.ghost:active { transform: translate(5px, 5px); box-shadow: inset 0 0 0 1.5px var(--line-strong); }
	@media (prefers-reduced-motion: reduce) {
		.rr, .rr *, .rr-mover, .rr-bob { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
	}
</style>
