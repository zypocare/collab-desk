<script lang="ts">
	import { studio } from '../studio.svelte';
	import { toast, ui } from '../ui.svelte';
	import { inr, inrS, today } from '../util';
	import Icon from './Icon.svelte';

	// Upgraded CRED-style money-in celebration: 3D embossed gold coin with triple shockwaves,
	// rotating god-ray halo, 80-particle metallic foil canvas burst, gentle harmonic chime,
	// live odometer amount roll-up, PAID IN FULL stamp, and surging monthly goal bar.
	const m = $derived(ui.moneyIn);
	let box = $state<HTMLElement>();
	let canvas = $state<HTMLCanvasElement>();
	let displayAmt = $state(0);
	let goalFillPct = $state(0);

	const monthKey = today().toISOString().slice(0, 7);
	const goal = $derived(studio.settings?.monthly_goal || 0);
	const month = $derived(
		studio.collabs
			.filter((c) => c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(monthKey))
			.reduce((a, c) => a + (c.pay_received || 0), 0)
	);
	const fyTotal = $derived(
		studio.collabs
			.filter((c) => c.pay_status === 'paid')
			.reduce((a, c) => a + (c.pay_received || 0), 0)
	);
	const prevPct = $derived(goal ? Math.min(100, Math.max(0, Math.round(((month - (m?.amount || 0)) / goal) * 100))) : 0);
	const nextPct = $derived(goal ? Math.min(100, Math.round((month / goal) * 100)) : 0);

	function playChime() {
		try {
			const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!AC) return;
			const ac = new AC();
			const now = ac.currentTime;
			[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
				const o = ac.createOscillator();
				const g = ac.createGain();
				o.type = 'triangle';
				o.frequency.setValueAtTime(freq, now + i * 0.065);
				g.gain.setValueAtTime(0.0001, now + i * 0.065);
				g.gain.exponentialRampToValueAtTime(0.08, now + i * 0.065 + 0.02);
				g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.065 + 0.42);
				o.connect(g);
				g.connect(ac.destination);
				o.start(now + i * 0.065);
				o.stop(now + i * 0.065 + 0.45);
			});
		} catch {
			// Ignore blocked audio contexts
		}
	}

	$effect(() => {
		if (!m) return;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const target = m.amount || 0;
		goalFillPct = reduced ? nextPct : prevPct;

		if (reduced) {
			displayAmt = target;
			return;
		}

		playChime();
		const goalTimer = setTimeout(() => {
			goalFillPct = nextPct;
		}, 320);

		let odoRaf = 0;
		const t0 = performance.now();
		const dur = 760;
		const step = (now: number) => {
			const p = Math.min(1, (now - t0) / dur);
			const ease = 1 - Math.pow(1 - p, 3);
			displayAmt = Math.round(target * ease);
			if (p < 1) odoRaf = requestAnimationFrame(step);
		};
		odoRaf = requestAnimationFrame(step);

		let partRaf = 0;
		const partTimer = setTimeout(() => {
			if (!canvas || !box) return;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			canvas.width = box.offsetWidth || window.innerWidth;
			canvas.height = box.offsetHeight || window.innerHeight;
			const cols = ['#ffd67a', '#f25a90', '#b29aff', '#6fd08c', '#ffae6b', '#ffffff'];
			const cx = canvas.width / 2;
			const cy = canvas.height * 0.3;
			const pts = Array.from({ length: 80 }, (_, i) => {
				const ang = Math.random() * Math.PI * 2;
				const spd = 2.6 + Math.random() * 9.5;
				return {
					x: cx,
					y: cy,
					vx: Math.cos(ang) * spd,
					vy: Math.sin(ang) * spd - 3.2,
					w: i % 3 === 0 ? 4.5 : 7 + Math.random() * 5,
					h: i % 3 === 0 ? 4.5 : 3 + Math.random() * 3,
					rot: Math.random() * 360,
					vr: (Math.random() - 0.5) * 14,
					col: cols[i % cols.length],
					life: 92 + Math.random() * 34,
					circle: i % 3 === 0
				};
			});
			const tick = () => {
				if (!canvas) return;
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				let alive = false;
				for (const p of pts) {
					if (p.life <= 0) continue;
					alive = true;
					p.x += p.vx;
					p.y += p.vy;
					p.vx *= 0.985;
					p.vy += 0.19;
					p.rot += p.vr;
					p.life--;
					ctx.save();
					ctx.globalAlpha = Math.min(1, p.life / 34);
					ctx.translate(p.x, p.y);
					ctx.rotate((p.rot * Math.PI) / 180);
					ctx.fillStyle = p.col;
					if (p.circle) {
						ctx.beginPath();
						ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
						ctx.fill();
					} else {
						ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
					}
					ctx.restore();
				}
				if (alive) partRaf = requestAnimationFrame(tick);
				else ctx.clearRect(0, 0, canvas.width, canvas.height);
			};
			partRaf = requestAnimationFrame(tick);
		}, 170);

		return () => {
			clearTimeout(goalTimer);
			clearTimeout(partTimer);
			cancelAnimationFrame(odoRaf);
			cancelAnimationFrame(partRaf);
		};
	});

	const close = () => (ui.moneyIn = null);

	async function copyThanks(e: MouseEvent) {
		e.stopPropagation();
		if (!m) return;
		const msg = `Hi ${m.brand || 'team'}! Confirming receipt of ${inr(m.amount)}. Thank you so much for the smooth collab!`;
		try {
			await navigator.clipboard?.writeText(msg);
		} catch {
			// Fallback ignored
		}
		toast(`Thank-you note copied for ${m.brand || 'brand'}`, 'check');
		close();
	}
</script>

{#if m}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="mi" role="dialog" aria-modal="true" aria-label="Payment received" tabindex="-1" bind:this={box} onclick={close}>
		<canvas class="mi-cv" bind:this={canvas} aria-hidden="true"></canvas>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="mi-in" onclick={(e) => e.stopPropagation()}>
			<div class="mi-stage" aria-hidden="true">
				<div class="mi-rays"></div>
				<span class="mi-ring r1"></span>
				<span class="mi-ring r2"></span>
				<span class="mi-ring r3"></span>
				<div class="mi-coin">₹</div>
				<span class="mi-badge"><Icon name="check" /></span>
			</div>

			<div class="mi-cap">
				<span>Money in</span>
				<span class="mi-stamp">✓ PAID IN FULL</span>
			</div>

			<b class="mi-amt">{inr(displayAmt)}</b>
			<p class="mi-who">{m.brand ? `from ${m.brand}` : 'Payment settled'}</p>

			<div class="mi-card">
				{#if goal}
					<div class="mi-goal-top">
						<span>Monthly goal ({inrS(goal)})</span>
						<b>{prevPct === nextPct ? `${nextPct}% reached` : `${prevPct}% → ${nextPct}% ↑`}</b>
					</div>
					<div class="mi-goal-bar"><div class="mi-goal-fill" style="width:{goalFillPct}%"></div></div>
				{/if}
				<div class="mi-stub">
					<div><small>This month</small><b>{inrS(month)}</b></div>
					<div><small>Total received</small><b>{inrS(fyTotal)}</b></div>
				</div>
			</div>

			<div class="mi-acts">
				<button type="button" class="btn wa mi-btn" onclick={copyThanks}>WhatsApp Thanks</button>
				<button type="button" class="btn primary mi-btn" onclick={close}>Lovely ✦</button>
			</div>
		</div>
	</div>
{/if}

<style>
	@property --mi-rim { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

	.mi {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: grid;
		place-items: center;
		padding: 20px;
		background:
			radial-gradient(65% 42% at 50% 30%, color-mix(in oklab, var(--ok) 28%, transparent), transparent 70%),
			radial-gradient(85% 55% at 50% 85%, color-mix(in oklab, var(--g2) 22%, transparent), transparent 70%),
			rgba(14, 8, 13, 0.95);
		-webkit-backdrop-filter: blur(20px);
		backdrop-filter: blur(20px);
		animation: mi-fade .28s ease;
		overflow: hidden;
	}
	.mi-cv { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
	.mi-in { position: relative; z-index: 2; width: min(100%, 352px); display: grid; justify-items: center; gap: 11px; text-align: center; color: #fbf2f6; }

	.mi-stage { position: relative; width: 136px; height: 136px; display: grid; place-items: center; perspective: 900px; }
	.mi-rays {
		position: absolute;
		inset: -24px;
		border-radius: 50%;
		pointer-events: none;
		background: conic-gradient(from var(--mi-rim), transparent 0deg, rgba(255, 210, 130, 0.24) 25deg, transparent 55deg, rgba(242, 90, 144, 0.22) 115deg, transparent 150deg, rgba(178, 154, 255, 0.22) 220deg, transparent 260deg, rgba(111, 208, 140, 0.22) 315deg, transparent 360deg);
		filter: blur(10px);
		animation: mi-spin 9s linear infinite;
	}
	.mi-ring { position: absolute; inset: 8px; border-radius: 50%; border: 2px solid rgba(255, 200, 120, 0.75); pointer-events: none; opacity: 0; }
	.mi-ring.r1 { animation: mi-shock 1.15s cubic-bezier(.16, 1, .3, 1) .16s forwards; }
	.mi-ring.r2 { border-color: rgba(242, 90, 144, 0.65); animation: mi-shock 1.3s cubic-bezier(.16, 1, .3, 1) .32s forwards; }
	.mi-ring.r3 { border-color: rgba(111, 208, 140, 0.6); animation: mi-shock 1.45s cubic-bezier(.16, 1, .3, 1) .48s forwards; }

	.mi-coin {
		position: relative;
		width: 112px;
		height: 112px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		overflow: hidden;
		font: 400 54px/1 var(--f-serif, Georgia, serif);
		color: #3d1902;
		background: radial-gradient(circle at 32% 28%, #fff6d6 0%, #ffd07d 38%, #f49348 72%, #9d440b 100%);
		box-shadow: 0 0 65px color-mix(in oklab, var(--g3) 70%, transparent), 0 0 26px rgba(242, 90, 144, 0.4), inset 0 2px 3px rgba(255, 255, 255, 0.75), inset 0 -7px 14px rgba(80, 26, 0, 0.45);
		border: 3px solid rgba(255, 240, 196, 0.65);
		animation: mi-flip 1.05s cubic-bezier(.2, .9, .22, 1) both;
	}
	.mi-coin::before { content: ''; position: absolute; inset: 7px; border-radius: 50%; border: 1.5px dashed rgba(94, 35, 0, 0.35); pointer-events: none; }
	.mi-coin::after { content: ''; position: absolute; inset: 0; width: 45%; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.72), transparent); animation: mi-sheen 2.4s ease-in-out infinite; pointer-events: none; }

	.mi-badge {
		position: absolute;
		right: 8px;
		bottom: 8px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: var(--ok);
		color: #092112;
		display: grid;
		place-items: center;
		border: 2.5px solid #140c14;
		box-shadow: 0 6px 16px rgba(111, 208, 140, 0.6);
		transform: scale(0);
		animation: mi-check .45s cubic-bezier(.34, 1.56, .64, 1) .72s forwards;
	}
	.mi-badge :global(svg) { width: 17px; height: 17px; }

	.mi-cap { display: inline-flex; align-items: center; gap: 8px; margin-top: 2px; font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--g3); }
	.mi-stamp { display: inline-block; padding: 3px 7px; border: 1.5px solid var(--ok); color: var(--ok); font: 800 9px/1 ui-monospace, Consolas, monospace; letter-spacing: .13em; background: rgba(111, 208, 140, 0.12); opacity: 0; animation: mi-stamp .42s cubic-bezier(.22, 1, .36, 1) .52s forwards; }

	.mi-amt { font: 400 50px/1 var(--f-serif, Georgia, serif); letter-spacing: -1.8px; font-variant-numeric: tabular-nums; text-shadow: 0 8px 30px rgba(255, 174, 107, 0.35); }
	.mi-who { margin: 0; max-width: 30ch; font-size: 14.5px; color: rgba(251, 242, 246, 0.84); }

	.mi-card {
		width: 100%;
		border-radius: 18px;
		border: 1px solid #48384a;
		background: linear-gradient(155deg, rgba(38, 27, 42, 0.92), rgba(20, 15, 21, 0.95));
		padding: 13px 14px;
		display: grid;
		gap: 10px;
		text-align: left;
		box-shadow: 0 18px 40px -20px #000c;
		animation: mi-card-in .48s cubic-bezier(.22, 1, .36, 1) .34s both;
	}
	.mi-goal-top { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; }
	.mi-goal-top span { color: var(--ink-3); }
	.mi-goal-top b { color: var(--ok); font: 700 11.5px/1 ui-monospace, Consolas, monospace; }
	.mi-goal-bar { height: 8px; border-radius: 999px; background: #2a202c; overflow: hidden; }
	.mi-goal-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3), var(--ok)); background-size: 200% 100%; transition: width .95s cubic-bezier(.22, 1, .36, 1); }
	.mi-stub { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding-top: 9px; border-top: 1px dashed #3e3140; }
	.mi-stub small { display: block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3); font-weight: 700; }
	.mi-stub b { color: #fbf2f6; font-size: 13.5px; }

	.mi-acts { display: flex; gap: 10px; width: 100%; margin-top: 4px; animation: mi-card-in .45s cubic-bezier(.22, 1, .36, 1) .48s both; }
	.mi-btn { flex: 1; justify-content: center; }

	@keyframes mi-spin { to { --mi-rim: 360deg; } }
	@keyframes mi-sheen { 0% { transform: translateX(-160%) skewX(-22deg); } 100% { transform: translateX(270%) skewX(-22deg); } }
	@keyframes mi-shock { 0% { transform: scale(.35); opacity: .85; } 100% { transform: scale(2.7); opacity: 0; } }
	@keyframes mi-stamp { 0% { transform: scale(2.2) rotate(-14deg); opacity: 0; } 65% { transform: scale(.92) rotate(-6deg); opacity: 1; } 100% { transform: scale(1) rotate(-6deg); opacity: 1; } }
	@keyframes mi-check { 0% { transform: scale(0) rotate(-30deg); } 70% { transform: scale(1.2) rotate(6deg); } 100% { transform: scale(1) rotate(0); } }
	@keyframes mi-card-in { 0% { transform: translateY(22px) scale(.96); opacity: 0; } 100% { transform: none; opacity: 1; } }
	@keyframes mi-flip { 0% { transform: translateY(160px) rotateY(0) scale(.35); opacity: 0; } 55% { transform: translateY(-16px) rotateY(540deg) scale(1.08); opacity: 1; } 78% { transform: translateY(5px) rotateY(720deg) scale(.96); } 100% { transform: translateY(0) rotateY(720deg) scale(1); } }
	@keyframes mi-fade { from { opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .mi-coin, .mi, .mi-rays, .mi-ring, .mi-badge, .mi-stamp, .mi-card, .mi-acts { animation: none; opacity: 1; transform: none; } }
</style>
