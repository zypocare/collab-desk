<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '../auth.svelte';
	import { isNative } from '../native';

	// The phone app's welcome. Each time the app opens: the Miracle "m" draws itself in light, the name
	// and a line rise in, and it fades into the app. The very first time (signed out): three short
	// slides of what Miracle does, then sign-in. Browsers never see this.
	let show = $state(false);
	let phase = $state<'logo' | 'slides' | 'out'>('logo');
	let i = $state(0);
	const SLIDES = [
		{ img: '/intro/screen-offer.webp', eb: 'Close better deals', t: 'Know what to', em: 'say yes to.', p: 'Every request scored. Every agreement checked before you sign.' },
		{ img: '/intro/screen-paid.webp', eb: 'Get paid on time', t: 'No more chasing', em: 'brands.', p: 'GST invoices with UPI, reminders that go by themselves, and a formal demand when needed.' },
		{ img: '/intro/screen-grow.webp', eb: 'Your AI desk', t: 'It works', em: 'while you create.', p: 'Know what to post next. Turn on autopilots: they ask you first, or just do it.' }
	];
	const read = (k: string, store: Storage) => {
		try {
			return store.getItem(k);
		} catch {
			return '1';
		}
	};
	const write = (k: string, store: Storage) => {
		try {
			store.setItem(k, '1');
		} catch {
			/* storage blocked */
		}
	};
	onMount(() => {
		if (!isNative() || read('mc-intro', sessionStorage)) return;
		write('mc-intro', sessionStorage);
		show = true;
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		setTimeout(
			() => {
				const first = !read('mc-welcomed', localStorage) && !auth.session;
				if (first) phase = 'slides';
				else close();
			},
			reduce ? 400 : 2300
		);
	});
	function close() {
		write('mc-welcomed', localStorage);
		phase = 'out';
		setTimeout(() => (show = false), 600);
	}
	function next() {
		if (i < SLIDES.length - 1) i++;
		else close();
	}
	// Swipe between slides.
	let x0 = 0;
	const down = (e: PointerEvent) => (x0 = e.clientX);
	const up = (e: PointerEvent) => {
		const dx = e.clientX - x0;
		if (dx < -40) next();
		else if (dx > 40 && i > 0) i--;
	};
</script>

{#if show}
	<div class="ai" class:out={phase === 'out'} role="dialog" aria-modal="true" aria-label="Welcome to Miracle">
		<div class="ai-glow" aria-hidden="true"><i></i><i></i><i></i></div>
		{#if phase === 'logo' || phase === 'out'}
			<div class="ai-logo" class:leave={phase === 'out'}>
				<svg viewBox="0 0 512 512" aria-hidden="true">
					<defs>
						<linearGradient id="ai-g" gradientUnits="userSpaceOnUse" x1="60" y1="100" x2="560" y2="440"><stop offset="0" stop-color="#9C7BFF" /><stop offset=".52" stop-color="#F25A90" /><stop offset="1" stop-color="#FFAE6B" /></linearGradient>
					</defs>
					<g transform="translate(256 256) scale(.79) skewX(-13) translate(-304.5 -266)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="26">
						<path class="d1" transform="translate(-10 -8)" stroke="#F4EEF2" pathLength="1" d="M64 128C92 104 132 112 144 156C154 220 158 330 156 392C155 420 182 420 182 392C182 300 176 200 196 160C220 104 290 104 300 160C310 220 312 330 310 392C309 420 336 420 336 392C336 300 330 200 350 160C374 104 444 104 452 160C460 230 456 330 452 392C450 440 500 440 540 360M499 384L540 360L545 408" />
						<path class="d2" transform="translate(11 9)" stroke="url(#ai-g)" pathLength="1" d="M64 128C92 104 132 112 144 156C154 220 158 330 156 392C155 420 182 420 182 392C182 300 176 200 196 160C220 104 290 104 300 160C310 220 312 330 310 392C309 420 336 420 336 392C336 300 330 200 350 160C374 104 444 104 452 160C460 230 456 330 452 392C450 440 500 440 540 360M499 384L540 360L545 408" />
					</g>
				</svg>
				<b class="ai-name">Miracle</b>
				<span class="ai-line">Brand deals, done properly.</span>
			</div>
		{:else}
			<div class="ai-slides" onpointerdown={down} onpointerup={up} role="group" aria-roledescription="carousel" aria-label="What Miracle does">
				{#key i}
					<div class="ai-slide">
						<div class="ai-phone"><img src={SLIDES[i].img} alt="" width="390" height="844" /></div>
						<span class="ai-eb">{SLIDES[i].eb}</span>
						<h2>{SLIDES[i].t} <em>{SLIDES[i].em}</em></h2>
						<p>{SLIDES[i].p}</p>
					</div>
				{/key}
				<div class="ai-foot">
					<span class="ai-dots" aria-hidden="true">{#each SLIDES as _, k (k)}<i class:on={k === i}></i>{/each}</span>
					<button type="button" class="ai-skip" onclick={close}>Skip</button>
					<button type="button" class="ai-next" onclick={next}>{i < SLIDES.length - 1 ? 'Next' : 'Get started'}</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.ai {
		position: fixed;
		inset: 0;
		z-index: 10001;
		display: grid;
		place-items: center;
		overflow: hidden;
		background: #110d11;
		color: #f4eef2;
		padding: env(safe-area-inset-top, 0px) 20px env(safe-area-inset-bottom, 0px);
		transition: opacity 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.ai.out {
		opacity: 0;
		pointer-events: none;
	}
	.ai-glow {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.ai-glow i {
		position: absolute;
		width: 70vmax;
		height: 70vmax;
		border-radius: 50%;
		filter: blur(60px);
		opacity: 0.38;
		animation: aig 9s ease-in-out infinite alternate;
	}
	.ai-glow i:nth-child(1) {
		left: -30vmax;
		top: -30vmax;
		background: #6b3fd4;
	}
	.ai-glow i:nth-child(2) {
		right: -32vmax;
		top: 10vmax;
		background: #d4296a;
		animation-delay: -3s;
	}
	.ai-glow i:nth-child(3) {
		left: -10vmax;
		bottom: -40vmax;
		background: #f2994a;
		opacity: 0.22;
		animation-delay: -6s;
	}
	@keyframes aig {
		to {
			transform: translate(6vmax, 4vmax) scale(1.1);
		}
	}
	.ai-logo {
		position: relative;
		display: grid;
		justify-items: center;
		gap: 10px;
		transition: transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1);
	}
	.ai-logo.leave {
		transform: scale(1.12);
	}
	.ai-logo svg {
		width: 132px;
		height: 132px;
		overflow: visible;
		filter: drop-shadow(0 0 18px rgba(242, 90, 144, 0.45));
	}
	.d1,
	.d2 {
		stroke-dasharray: 1 1.2;
		stroke-dashoffset: 1;
		animation: draw 1.35s cubic-bezier(0.65, 0, 0.35, 1) forwards;
	}
	.d2 {
		animation-delay: 0.22s;
	}
	@keyframes draw {
		to {
			stroke-dashoffset: 0;
		}
	}
	.ai-name {
		font: italic 400 46px/1 'Instrument Serif', Georgia, serif;
		background: linear-gradient(115deg, #f4eef2 30%, #f25a90 70%, #ffae6b);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		animation: rise 0.8s 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	.ai-line {
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: #a39aa1;
		animation: rise 0.8s 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(14px);
			filter: blur(4px);
		}
	}
	.ai-slides {
		position: relative;
		width: min(420px, 100%);
		height: 100%;
		display: grid;
		grid-template-rows: 1fr auto;
		padding-block: 28px 24px;
		touch-action: pan-y;
	}
	.ai-slide {
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 12px;
		text-align: center;
		animation: slide 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}
	@keyframes slide {
		from {
			opacity: 0;
			transform: translateX(40px);
		}
	}
	.ai-phone {
		width: min(200px, 46vw);
		aspect-ratio: 390 / 844;
		border-radius: 32px;
		padding: 7px;
		margin-bottom: 18px;
		background: linear-gradient(150deg, #4a3d46, #0b080b 40%, #3a2f37);
		box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.14), 0 40px 80px -30px rgba(0, 0, 0, 0.9), 0 20px 60px -20px rgba(242, 90, 144, 0.35);
		transform: rotate(-4deg);
		animation: phone 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both, bob 5s 0.8s ease-in-out infinite;
	}
	.ai-phone img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: top;
		border-radius: 26px;
		display: block;
		background: #0c090c;
	}
	@keyframes phone {
		from {
			opacity: 0;
			transform: translateY(40px) rotate(4deg) scale(0.9);
		}
	}
	@keyframes bob {
		50% {
			translate: 0 -8px;
		}
	}
	.ai-eb {
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: #f25a90;
	}
	.ai-slide h2 {
		margin: 0;
		font: 400 38px/1.02 'Instrument Serif', Georgia, serif;
		text-wrap: balance;
	}
	.ai-slide h2 em {
		background: linear-gradient(115deg, #9c7bff, #f25a90 52%, #ffae6b);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.ai-slide p {
		margin: 0;
		max-width: 30ch;
		font-size: 15.5px;
		line-height: 1.55;
		color: #c9bfc6;
	}
	.ai-foot {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: 10px;
	}
	.ai-dots {
		display: flex;
		gap: 6px;
	}
	.ai-dots i {
		width: 7px;
		height: 7px;
		border-radius: 99px;
		background: rgba(244, 238, 242, 0.28);
		transition: width 0.35s, background 0.35s;
	}
	.ai-dots i.on {
		width: 22px;
		background: #f25a90;
	}
	.ai-skip {
		height: 48px;
		padding: 0 14px;
		border: 0;
		background: none;
		color: #a39aa1;
		font: 600 14px var(--f-body, system-ui);
	}
	.ai-next {
		height: 52px;
		padding: 0 24px;
		border: 0;
		background: linear-gradient(115deg, #9c7bff, #f25a90 52%, #ffae6b);
		color: #fff;
		font: 700 13.5px var(--f-body, system-ui);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		box-shadow: 4px 4px 0 #6a4bc9;
	}
	.ai-next:active {
		transform: translate(4px, 4px);
		box-shadow: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.d1,
		.d2,
		.ai-name,
		.ai-line,
		.ai-slide,
		.ai-phone,
		.ai-glow i {
			animation: none;
			stroke-dashoffset: 0;
		}
	}
</style>
