<script lang="ts">
	// Diwali on Today's top card (festival.ts decides when): a string of lights that twinkle along the top, soft
	// firework bursts behind the greeting, a warm marigold glow, and a row of diyas with flickering flames at the
	// bottom. Decoration only: nothing here can be tapped, and it holds still for people who ask for less motion.

	// The light string: three scallops across the card; each bulb sits on the curve.
	const BULBS = Array.from({ length: 19 }, (_, i) => {
		const x = i / 18;
		const y = 3 + 13 * Math.sin(Math.PI * ((x * 3) % 1 || (i ? 1 : 0)));
		return { x: x * 100, y, c: ['#FFD166', '#FF9F1C', '#F25A90', '#FFE9A8'][i % 4], d: ((i * 0.37) % 1.6).toFixed(2) };
	});
	const wire = (() => {
		const pts: string[] = [];
		for (let k = 0; k <= 90; k++) {
			const x = k / 90;
			pts.push(`${(x * 360).toFixed(1)},${(3 + 13 * Math.sin(Math.PI * ((x * 3) % 1 || (k ? 1 : 0)))).toFixed(1)}`);
		}
		return pts.join(' ');
	})();
	// Firework bursts: where, how big, and when (each repeats).
	const BURSTS = [
		{ x: 76, y: 58, s: 54, c: '#FFD166', d: 0.2 },
		{ x: 91, y: 50, s: 40, c: '#F25A90', d: 1.6 },
		{ x: 66, y: 50, s: 36, c: '#FF9F1C', d: 3.0 }
	];
	const RAYS = Array.from({ length: 12 }, (_, i) => i * 30);
	const DIYAS = [0, 1, 2, 3, 4];
</script>

<div class="dw" aria-hidden="true">
	<div class="dw-glow"><i></i><i></i></div>

	<div class="dw-lights">
		<svg viewBox="0 0 360 20" preserveAspectRatio="none"><polyline points={wire} /></svg>
		{#each BULBS as b, i (i)}<span class="dw-bulb" style="left:{b.x}%;top:{b.y}px;--c:{b.c};--d:{b.d}s"></span>{/each}
	</div>

	{#each BURSTS as f, i (i)}
		<span class="dw-burst" style="left:{f.x}%;top:{f.y}%;--s:{f.s}px;--c:{f.c};--d:{f.d}s">
			{#each RAYS as r (r)}<i style="--r:{r}deg"></i>{/each}
		</span>
	{/each}

	<div class="dw-diyas">
		{#each DIYAS as k (k)}
			<svg class="dw-diya" viewBox="0 0 40 40" style="--d:{(k * 0.43).toFixed(2)}s">
				<defs>
					<radialGradient id="dwHalo{k}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFC95C" stop-opacity=".55" /><stop offset="1" stop-color="#FFC95C" stop-opacity="0" /></radialGradient>
					<linearGradient id="dwFlame{k}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#FF5E1A" /><stop offset=".45" stop-color="#FFB02E" /><stop offset="1" stop-color="#FFF6C2" /></linearGradient>
					<linearGradient id="dwBowl{k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2994A" /><stop offset="1" stop-color="#A8431A" /></linearGradient>
				</defs>
				<circle class="dw-halo" cx="20" cy="15" r="15" fill="url(#dwHalo{k})" />
				<path class="dw-flame" d="M20 4 C23.5 9 25 12.5 25 15.5 A5 5 0 0 1 15 15.5 C15 12.5 16.5 9 20 4 Z" fill="url(#dwFlame{k})" />
				<path d="M5 24 Q20 22 35 24 Q33 34 20 35 Q7 34 5 24 Z" fill="url(#dwBowl{k})" />
				<path d="M5 24 Q20 26.5 35 24" fill="none" stroke="#FFD9A0" stroke-width="1.4" stroke-linecap="round" opacity=".85" />
				<circle cx="13" cy="29" r="1.1" fill="#FFE2B0" opacity=".8" /><circle cx="20" cy="30.5" r="1.1" fill="#FFE2B0" opacity=".8" /><circle cx="27" cy="29" r="1.1" fill="#FFE2B0" opacity=".8" />
			</svg>
		{/each}
	</div>
</div>

<style>
	.dw { position: absolute; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }

	/* A warm marigold glow over the card's usual colours. */
	.dw-glow i { position: absolute; border-radius: 50%; filter: blur(48px); opacity: .42; animation: dw-pulse 6s ease-in-out infinite alternate; }
	.dw-glow i:nth-child(1) { width: 220px; height: 200px; left: -40px; top: 40px; background: #FF9F1C; }
	.dw-glow i:nth-child(2) { width: 180px; height: 160px; left: 38%; bottom: -40px; background: #FFC95C; opacity: .32; animation-delay: -3s; }
	@keyframes dw-pulse { to { transform: scale(1.12); opacity: .55; } }

	/* The string of lights. */
	.dw-lights { position: absolute; left: 0; right: 0; top: 0; height: 26px; }
	.dw-lights svg { position: absolute; inset: 0 0 auto; width: 100%; height: 20px; overflow: visible; }
	.dw-lights polyline { fill: none; stroke: color-mix(in oklab, #FFD166 45%, transparent); stroke-width: 1; vector-effect: non-scaling-stroke; }
	.dw-bulb { position: absolute; width: 7px; height: 9px; margin: 1px 0 0 -3.5px; border-radius: 50% 50% 45% 45%; background: var(--c); box-shadow: 0 0 8px 2px color-mix(in oklab, var(--c) 70%, transparent); animation: dw-twinkle 1.6s ease-in-out infinite; animation-delay: var(--d); }
	@keyframes dw-twinkle { 0%, 100% { opacity: 1; } 50% { opacity: .35; box-shadow: 0 0 3px 0 color-mix(in oklab, var(--c) 40%, transparent); } }

	/* Fireworks: twelve sparks fly out, fade, and the burst comes again a few seconds later. */
	.dw-burst { position: absolute; width: 0; height: 0; }
	.dw-burst i { position: absolute; left: 0; top: 0; width: 4px; height: 4px; margin: -2px; border-radius: 50%; background: var(--c); box-shadow: 0 0 6px var(--c); opacity: 0; transform: rotate(var(--r)) translateY(0); animation: dw-spark 4.2s cubic-bezier(.15, .7, .3, 1) infinite; animation-delay: var(--d); }
	@keyframes dw-spark {
		0% { opacity: 0; transform: rotate(var(--r)) translateY(0) scale(1); }
		6% { opacity: 1; }
		38% { opacity: .9; transform: rotate(var(--r)) translateY(calc(var(--s) * -.5)) scale(.9); }
		60%, 100% { opacity: 0; transform: rotate(var(--r)) translateY(calc(var(--s) * -.62)) scale(.4); }
	}

	/* Diyas along the bottom, their flames flickering out of step. */
	.dw-diyas { position: absolute; left: 16px; right: 16px; bottom: 6px; display: flex; justify-content: space-between; }
	.dw-diya { width: 38px; height: 38px; overflow: visible; }
	.dw-flame { transform-box: fill-box; transform-origin: 50% 100%; animation: dw-flicker 1.3s ease-in-out infinite alternate; animation-delay: var(--d); }
	.dw-halo { transform-box: fill-box; transform-origin: center; animation: dw-halo 1.3s ease-in-out infinite alternate; animation-delay: var(--d); }
	@keyframes dw-flicker {
		0% { transform: scale(1, 1) skewX(0deg); }
		30% { transform: scale(.94, 1.08) skewX(-3deg); }
		60% { transform: scale(1.04, .94) skewX(2deg); }
		100% { transform: scale(.97, 1.05) skewX(-1deg); }
	}
	@keyframes dw-halo { from { opacity: .7; transform: scale(.92); } to { opacity: 1; transform: scale(1.08); } }

	@media (prefers-reduced-motion: reduce) {
		.dw-glow i, .dw-bulb, .dw-flame, .dw-halo { animation: none; }
		.dw-burst { display: none; }
	}
</style>
