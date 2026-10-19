<script lang="ts">
	import { studio } from '../studio.svelte';
	import { ui } from '../ui.svelte';
	import { inr, inrS, today } from '../util';

	// CRED's money-in moment (phone): a coin flips up, a burst in her colours, the amount and how
	// far that takes this month's goal. Tap anywhere to carry on.
	const m = $derived(ui.moneyIn);
	let box = $state<HTMLElement>();
	const monthKey = today().toISOString().slice(0, 7);
	const goal = $derived(studio.settings?.monthly_goal || 0);
	const month = $derived(studio.collabs.filter((c) => c.pay_status === 'paid' && (c.paid_on ?? '').startsWith(monthKey)).reduce((a, c) => a + (c.pay_received || 0), 0));

	$effect(() => {
		if (!m || !box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const cols = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--ok)', '#ffe3a1'];
		for (let k = 0; k < 34; k++) {
			const s = document.createElement('i');
			s.className = 'mi-spark';
			s.style.background = cols[k % cols.length];
			box.appendChild(s);
			const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 150;
			s.animate(
				[{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 90}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }],
				{ duration: 1300 + Math.random() * 500, easing: 'cubic-bezier(.2,.8,.2,1)', delay: 280 }
			).onfinish = () => s.remove();
		}
	});
	const close = () => (ui.moneyIn = null);
</script>

{#if m}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="mi" role="dialog" aria-modal="true" aria-label="Payment received" tabindex="-1" bind:this={box} onclick={close}>
		<div class="mi-in">
			<div class="mi-coin" aria-hidden="true">₹</div>
			<span class="mi-cap">Money in</span>
			<b class="mi-amt">{inr(m.amount)}</b>
			<p>{m.brand ? `from ${m.brand}. ` : ''}{goal ? `That's ${Math.round((month / goal) * 100)}% of this month's ${inrS(goal)} goal.` : 'Nicely done.'}</p>
			<button class="btn mi-ok" onclick={close}>Lovely</button>
		</div>
	</div>
{/if}

<style>
	.mi { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; background: radial-gradient(80% 60% at 50% 40%, color-mix(in oklab, var(--ok) 35%, transparent), rgba(20, 8, 18, .94) 70%); animation: mi-fade .3s ease; }
	.mi-in { display: grid; justify-items: center; gap: 10px; padding: 24px; text-align: center; color: #fbf2f6; }
	.mi-coin { width: 120px; height: 120px; border-radius: 50%; display: grid; place-items: center; font: 400 56px var(--f-serif); color: #3a1500; background: radial-gradient(circle at 35% 30%, #fff1cf, var(--g3) 55%, #a24a0a); box-shadow: 0 0 60px color-mix(in oklab, var(--g3) 70%, transparent), inset 0 -6px 12px rgba(0, 0, 0, .25); animation: mi-flip 1.1s cubic-bezier(.2, .9, .25, 1); }
	.mi-cap { margin-top: 6px; font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: rgba(251, 242, 246, .7); }
	.mi-amt { font: 400 50px/1 var(--f-serif); font-variant-numeric: tabular-nums; }
	.mi p { margin: 0; max-width: 28ch; font-size: 14.5px; color: rgba(251, 242, 246, .78); }
	:global([data-side]) .mi .mi-ok { margin-top: 8px; --edge: rgba(255, 255, 255, .35); background: #fff; color: #1e171c; border-color: transparent; }
	.mi :global(.mi-spark) { position: absolute; left: 50%; top: 42%; width: 8px; height: 8px; border-radius: 2px; pointer-events: none; }
	@keyframes mi-flip { 0% { transform: translateY(160px) rotateY(0) scale(.4); } 60% { transform: translateY(-14px) rotateY(540deg) scale(1.06); } 100% { transform: none; } }
	@keyframes mi-fade { from { opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .mi-coin, .mi { animation: none; } }
</style>
