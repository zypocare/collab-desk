<script lang="ts">
	// Her birthday on Today's top card (the day before, and the day itself): a swaying bunting along the top, confetti
	// drifting down, balloons rising beside the followers circle, and a cake whose candles flicker. Decoration only:
	// nothing here can be tapped, and it holds still for people who ask for less motion.

	const FLAGS = Array.from({ length: 16 }, (_, i) => ({ x: (i + 0.5) * 6.25, c: ['#F25A90', '#FFD166', '#9C7BFF', '#4CCFC2'][i % 4], d: ((i * 0.23) % 1.4).toFixed(2) }));
	const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
		x: (i * 37) % 100,
		c: ['#F25A90', '#FFD166', '#9C7BFF', '#4CCFC2', '#FF9F1C'][i % 5],
		d: ((i * 0.61) % 6).toFixed(2),
		t: (5 + ((i * 7) % 5)).toFixed(1),
		w: i % 3 === 0 ? 4 : 6,
		r: (i * 47) % 360
	}));
	const BALLOONS = [
		{ x: 74, c: '#F25A90', d: 0, t: 9, s: 1 },
		{ x: 86, c: '#FFD166', d: 2.6, t: 10.5, s: 0.85 },
		{ x: 64, c: '#9C7BFF', d: 5.2, t: 11, s: 0.75 }
	];
</script>

<div class="bd" aria-hidden="true">
	<div class="bd-glow"><i></i><i></i></div>

	<div class="bd-bunting">
		<svg viewBox="0 0 360 18" preserveAspectRatio="none"><path d="M0 2 Q90 16 180 4 T360 2" /></svg>
		{#each FLAGS as f, i (i)}<span class="bd-flag" style="left:{f.x}%;top:{3 + 9 * Math.sin(Math.PI * ((f.x / 50) % 1))}px;--c:{f.c};--d:{f.d}s"></span>{/each}
	</div>

	{#each CONFETTI as p, i (i)}<span class="bd-bit" style="left:{p.x}%;--c:{p.c};--d:{p.d}s;--t:{p.t}s;--w:{p.w}px;--r:{p.r}deg"></span>{/each}

	{#each BALLOONS as b, i (i)}
		<span class="bd-balloon" style="left:{b.x}%;--c:{b.c};--d:{b.d}s;--t:{b.t}s;--s:{b.s}"><i></i></span>
	{/each}

	<svg class="bd-cake" viewBox="0 0 64 56">
		<defs>
			<linearGradient id="bdCream" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1F6" /><stop offset="1" stop-color="#FFD3E4" /></linearGradient>
			<linearGradient id="bdSponge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F25A90" /><stop offset="1" stop-color="#B4306A" /></linearGradient>
			<linearGradient id="bdFlame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF7A1A" /><stop offset=".5" stop-color="#FFC23D" /><stop offset="1" stop-color="#FFF6C2" /></linearGradient>
		</defs>
		{#each [20, 32, 44] as x, k (x)}
			<rect x={x - 1.6} y="12" width="3.2" height="11" rx="1.2" fill={['#9C7BFF', '#4CCFC2', '#FFD166'][k]} />
			<circle class="bd-halo" cx={x} cy="8" r="6" fill="#FFC95C" style="--d:{k * 0.4}s" />
			<path class="bd-flame" d="M{x} 2 C{x + 2.6} 5.5 {x + 3} 7.6 {x + 3} 9 A3 3 0 0 1 {x - 3} 9 C{x - 3} 7.6 {x - 2.6} 5.5 {x} 2 Z" fill="url(#bdFlame)" style="--d:{k * 0.4}s" />
		{/each}
		<rect x="8" y="23" width="48" height="27" rx="5" fill="url(#bdSponge)" />
		<path d="M8 28 Q8 23 13 23 H51 Q56 23 56 28 V30 Q51 35 46 30 Q41 35 36 30 Q31 35 26 30 Q21 35 16 30 Q11 35 8 30 Z" fill="url(#bdCream)" />
		<rect x="3" y="49" width="58" height="4" rx="2" fill="#FFD9A0" opacity=".9" />
	</svg>
</div>

<style>
	.bd { position: absolute; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }

	.bd-glow i { position: absolute; border-radius: 50%; filter: blur(48px); opacity: .4; animation: bd-pulse 6s ease-in-out infinite alternate; }
	.bd-glow i:nth-child(1) { width: 220px; height: 200px; left: -40px; top: 30px; background: #F25A90; }
	.bd-glow i:nth-child(2) { width: 190px; height: 170px; right: -30px; bottom: -40px; background: #9C7BFF; opacity: .34; animation-delay: -3s; }
	@keyframes bd-pulse { to { transform: scale(1.12); opacity: .52; } }

	/* Bunting: little flags on a string, swinging out of step. */
	.bd-bunting { position: absolute; left: 0; right: 0; top: 0; height: 30px; }
	.bd-bunting svg { position: absolute; inset: 0 0 auto; width: 100%; height: 18px; overflow: visible; }
	.bd-bunting path { fill: none; stroke: color-mix(in oklab, #FFD166 45%, transparent); stroke-width: 1; vector-effect: non-scaling-stroke; }
	.bd-flag { position: absolute; width: 0; height: 0; margin-left: -6px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 13px solid var(--c); transform-origin: 50% 0; animation: bd-swing 2.4s ease-in-out infinite alternate; animation-delay: var(--d); filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .25)); }
	@keyframes bd-swing { from { transform: rotate(-7deg); } to { transform: rotate(7deg); } }

	/* Confetti drifting down across the card. */
	.bd-bit { position: absolute; top: -12px; width: var(--w); height: calc(var(--w) * 1.6); border-radius: 1px; background: var(--c); opacity: 0; animation: bd-fall var(--t) linear infinite; animation-delay: var(--d); }
	@keyframes bd-fall {
		0% { opacity: 0; transform: translate(0, 0) rotate(var(--r)); }
		8% { opacity: .9; }
		50% { transform: translate(14px, 160px) rotate(calc(var(--r) + 220deg)); }
		85% { opacity: .8; }
		100% { opacity: 0; transform: translate(-8px, 330px) rotate(calc(var(--r) + 460deg)); }
	}

	/* Balloons rising slowly, swaying a little, by the followers circle. */
	.bd-balloon { position: absolute; bottom: -70px; width: calc(30px * var(--s)); height: calc(38px * var(--s)); border-radius: 50% 50% 48% 48%; background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, .7), transparent 32%), var(--c); box-shadow: inset -4px -6px 10px rgba(0, 0, 0, .18); opacity: .92; animation: bd-rise var(--t) ease-in-out infinite; animation-delay: var(--d); }
	.bd-balloon i { position: absolute; left: 50%; top: 100%; width: 1px; height: calc(34px * var(--s)); background: color-mix(in oklab, #FFF 45%, transparent); }
	.bd-balloon::after { content: ''; position: absolute; left: 50%; top: 100%; margin-left: -3px; border-left: 3px solid transparent; border-right: 3px solid transparent; border-bottom: 4px solid var(--c); transform: rotate(180deg); }
	@keyframes bd-rise {
		0% { transform: translate(0, 0); opacity: 0; }
		10% { opacity: .92; }
		50% { transform: translate(-10px, -170px); }
		90% { opacity: .9; }
		100% { transform: translate(6px, -340px); opacity: 0; }
	}

	/* The cake, bottom left, its candles flickering. */
	.bd-cake { position: absolute; left: 14px; bottom: 6px; width: 58px; height: 50px; overflow: visible; }
	.bd-flame { transform-box: fill-box; transform-origin: 50% 100%; animation: bd-flicker 1.2s ease-in-out infinite alternate; animation-delay: var(--d); }
	.bd-halo { opacity: .45; transform-box: fill-box; transform-origin: center; animation: bd-halo 1.2s ease-in-out infinite alternate; animation-delay: var(--d); }
	@keyframes bd-flicker { 0% { transform: scale(1, 1) skewX(0); } 40% { transform: scale(.92, 1.1) skewX(-4deg); } 100% { transform: scale(1.04, .94) skewX(3deg); } }
	@keyframes bd-halo { from { opacity: .3; transform: scale(.9); } to { opacity: .6; transform: scale(1.15); } }

	@media (prefers-reduced-motion: reduce) {
		.bd-glow i, .bd-flag, .bd-flame, .bd-halo { animation: none; }
		.bd-bit, .bd-balloon { display: none; }
	}
</style>
