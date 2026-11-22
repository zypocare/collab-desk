<!-- Behind the sign-in and sign-up cards: drifting glows, the Miracle "m" drawing itself in light, again
     and again, and a few sparks. Always the dark look. -->
<div class="ab" aria-hidden="true">
	<div class="lg-glow" aria-hidden="true"><i></i><i></i><i></i></div>
	<svg class="lg-mark" viewBox="0 0 512 512" aria-hidden="true">
		<defs><linearGradient id="lg-mg" gradientUnits="userSpaceOnUse" x1="60" y1="100" x2="560" y2="440"><stop offset="0" stop-color="#9C7BFF" /><stop offset=".52" stop-color="#F25A90" /><stop offset="1" stop-color="#FFAE6B" /></linearGradient></defs>
		<g transform="translate(256 256) scale(.79) skewX(-13) translate(-304.5 -266)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="22">
			<path class="lg-m1" stroke="url(#lg-mg)" pathLength="1" d="M64 128C92 104 132 112 144 156C154 220 158 330 156 392C155 420 182 420 182 392C182 300 176 200 196 160C220 104 290 104 300 160C310 220 312 330 310 392C309 420 336 420 336 392C336 300 330 200 350 160C374 104 444 104 452 160C460 230 456 330 452 392C450 440 500 440 540 360M499 384L540 360L545 408" />
		</g>
	</svg>
	<div class="lg-sparks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
</div>

<style>
	.ab { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
	.lg-glow { position: absolute; inset: 0; overflow: hidden; }
	.lg-glow i { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.5; animation: lg-drift 18s ease-in-out infinite alternate; }
	.lg-glow i:nth-child(1) { width: 520px; height: 520px; left: -120px; top: -100px; background: #9c7bff; }
	.lg-glow i:nth-child(2) { width: 460px; height: 460px; left: 22%; top: 30%; background: #f25a90; opacity: 0.35; animation-delay: -6s; }
	.lg-glow i:nth-child(3) { width: 320px; height: 320px; left: 8%; bottom: -120px; background: #ffae6b; opacity: 0.22; animation-delay: -11s; }
	@keyframes lg-drift { to { transform: translate(60px, 40px) scale(1.08); } }
	.lg-mark { position: absolute; left: 50%; top: 50%; width: min(150vmin, 980px); height: min(150vmin, 980px); transform: translate(-50%, -50%) rotate(-6deg); opacity: 0.34; filter: blur(0.5px) drop-shadow(0 0 30px rgba(242, 90, 144, 0.5)); }
	.lg-m1 { stroke-dasharray: 0.45 1.6; stroke-dashoffset: 1.6; animation: lg-trace 7s linear infinite; }
	@keyframes lg-trace { to { stroke-dashoffset: -0.45; } }
	.lg-sparks { position: absolute; inset: 0; }
	.lg-sparks i { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #fff; box-shadow: 0 0 10px 2px rgba(255, 174, 107, 0.7); opacity: 0; animation: lg-twinkle 5s ease-in-out infinite; }
	.lg-sparks i:nth-child(1) { left: 12%; top: 18%; animation-delay: -0.4s; }
	.lg-sparks i:nth-child(2) { left: 82%; top: 12%; animation-delay: -1.6s; }
	.lg-sparks i:nth-child(3) { left: 68%; top: 34%; animation-delay: -2.8s; }
	.lg-sparks i:nth-child(4) { left: 24%; top: 62%; animation-delay: -3.4s; }
	.lg-sparks i:nth-child(5) { left: 90%; top: 70%; animation-delay: -0.9s; }
	.lg-sparks i:nth-child(6) { left: 46%; top: 86%; animation-delay: -2.1s; }
	.lg-sparks i:nth-child(7) { left: 6%; top: 82%; animation-delay: -4.2s; }
	.lg-sparks i:nth-child(8) { left: 56%; top: 6%; animation-delay: -1.1s; }
	.lg-sparks i:nth-child(9) { left: 34%; top: 40%; animation-delay: -3.9s; }
	.lg-sparks i:nth-child(10) { left: 74%; top: 92%; animation-delay: -2.4s; }
	@keyframes lg-twinkle { 0%, 100% { opacity: 0; transform: translateY(0) scale(0.6); } 40% { opacity: 0.9; transform: translateY(-14px) scale(1); } 70% { opacity: 0; transform: translateY(-26px) scale(0.6); } }
	@media (max-width: 900px) {
		.lg-glow i:nth-child(1) { width: 380px; height: 380px; left: -140px; top: -60px; }
		.lg-glow i:nth-child(2) { width: 360px; height: 360px; left: 30%; top: 40%; opacity: 0.42; }
		.lg-glow i:nth-child(3) { width: 300px; height: 300px; left: -40px; bottom: -80px; opacity: 0.3; }
	}
	@media (prefers-reduced-motion: reduce) { .lg-glow i, .lg-m1, .lg-sparks i { animation: none; } .lg-m1 { stroke-dasharray: none; } }
</style>
