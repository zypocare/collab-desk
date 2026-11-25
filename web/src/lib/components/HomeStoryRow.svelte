<script lang="ts">
	import { portal } from '../portal';
	import Icon from './Icon.svelte';

	export type StoryStat = { label: string; value: string };
	export type StoryItem = { title: string; sub?: string; right?: string };
	export type Story = {
		label: string;
		icon: string;
		color: string;
		title: string;
		body: string;
		action: string;
		href: string;
		/** Optional rich CRED-stage fields */
		stamp?: string;
		heroText?: string;
		heroNumeric?: number;
		heroFormat?: 'inr' | 'compact' | 'number' | 'pct';
		heroSub?: string;
		progress?: { label: string; valueText: string; pct: number };
		stats?: StoryStat[];
		items?: StoryItem[];
	};

	let { label, stories }: { label: string; stories: Story[] } = $props();
	let open = $state(false);
	let selected = $state(0);
	let animKey = $state(0);
	let displayNum = $state(0);
	let fillPct = $state(0);
	let stageBox = $state<HTMLElement>();
	let canvas = $state<HTMLCanvasElement>();

	const story = $derived(stories[selected] ?? stories[0]);

	function openStory(index: number) {
		selected = index;
		animKey += 1;
		open = true;
	}

	function closeStory() {
		open = false;
	}

	function goStep(delta: number) {
		if (!stories.length) return;
		selected = (selected + delta + stories.length) % stories.length;
		animKey += 1;
	}

	function formatNum(n: number, mode?: Story['heroFormat']): string {
		if (mode === 'inr') return '₹' + Math.round(n).toLocaleString('en-IN');
		if (mode === 'pct') return `${Math.round(n)}%`;
		if (mode === 'compact') {
			if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
			if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
			return String(Math.round(n));
		}
		return Math.round(n).toLocaleString('en-IN');
	}

	const heroDisplay = $derived.by(() => {
		if (!story) return '';
		if (typeof story.heroNumeric === 'number' && story.heroNumeric > 0) {
			return formatNum(displayNum, story.heroFormat);
		}
		return story.heroText ?? '';
	});

	$effect(() => {
		if (!open || !story) return;
		// Depend on animKey so switching stories replays odometer, progress bar, and particles.
		void animKey;
		const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
		const targetNum = typeof story.heroNumeric === 'number' ? story.heroNumeric : 0;
		const targetPct = Math.max(0, Math.min(100, story.progress?.pct ?? 0));

		if (reduced) {
			displayNum = targetNum;
			fillPct = targetPct;
			return;
		}

		displayNum = 0;
		fillPct = 0;

		const fillTimer = setTimeout(() => {
			fillPct = targetPct;
		}, 240);

		let odoRaf = 0;
		if (targetNum > 0) {
			const t0 = performance.now();
			const dur = 720;
			const step = (now: number) => {
				const p = Math.min(1, (now - t0) / dur);
				const ease = 1 - Math.pow(1 - p, 3);
				displayNum = targetNum * ease;
				if (p < 1) odoRaf = requestAnimationFrame(step);
				else displayNum = targetNum;
			};
			odoRaf = requestAnimationFrame(step);
		}

		// Subtle CRED-style metallic foil particle burst from behind the medallion
		let partRaf = 0;
		const partTimer = setTimeout(() => {
			if (!canvas || !stageBox) return;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			canvas.width = stageBox.offsetWidth || window.innerWidth;
			canvas.height = stageBox.offsetHeight || window.innerHeight;
			const cols = ['#9c7bff', '#f25a90', '#ffae6b', '#6fd08c', '#ffffff'];
			const cx = canvas.width / 2;
			const cy = Math.min(210, canvas.height * 0.25);
			const pts = Array.from({ length: 48 }, (_, i) => {
				const ang = Math.random() * Math.PI * 2;
				const spd = 2.2 + Math.random() * 7.5;
				return {
					x: cx,
					y: cy,
					vx: Math.cos(ang) * spd,
					vy: Math.sin(ang) * spd - 2.4,
					w: i % 3 === 0 ? 4 : 6 + Math.random() * 4,
					h: i % 3 === 0 ? 4 : 2.5 + Math.random() * 2.5,
					rot: Math.random() * 360,
					vr: (Math.random() - 0.5) * 12,
					col: cols[i % cols.length],
					life: 72 + Math.random() * 28,
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
					p.vy += 0.16;
					p.rot += p.vr;
					p.life--;
					ctx.save();
					ctx.globalAlpha = Math.min(0.85, p.life / 32);
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
		}, 140);

		return () => {
			clearTimeout(fillTimer);
			clearTimeout(partTimer);
			cancelAnimationFrame(odoRaf);
			cancelAnimationFrame(partRaf);
		};
	});

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') closeStory();
		else if (e.key === 'ArrowRight') goStep(1);
		else if (e.key === 'ArrowLeft') goStep(-1);
	}
</script>

<svelte:window onkeydown={onKey} />

<nav class="creator-stories" aria-label={label}>
	{#each stories as item, i (item.label)}
		<button type="button" aria-haspopup="dialog" style:--story-color={item.color} style:--story-index={i} onclick={() => openStory(i)}>
			<span class="story-ring"><span><Icon name={item.icon} /></span></span>
			<small>{item.label}</small>
		</button>
	{/each}
</nav>

{#if open && story}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="hs-stage"
		role="dialog"
		aria-modal="true"
		aria-labelledby="hs-title"
		tabindex="-1"
		style:--story-color={story.color}
		use:portal
		bind:this={stageBox}
		onclick={closeStory}
	>
		<canvas class="hs-cv" bind:this={canvas} aria-hidden="true"></canvas>

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="hs-shell" onclick={(e) => e.stopPropagation()}>
			<!-- Top Story Progress Bars & Header -->
			<div class="hs-top">
				<div class="hs-bars" aria-label="Story progress">
					{#each stories as s, idx (s.label)}
						<button
							type="button"
							class="hs-bar"
							class:done={idx < selected}
							class:on={idx === selected}
							aria-label={`View ${s.label}`}
							onclick={() => openStory(idx)}
						><span></span></button>
					{/each}
				</div>
				<div class="hs-head">
					<span class="hs-tag"><Icon name={story.icon} />{story.label}</span>
					<div class="hs-nav-btns">
						<button type="button" class="hs-icbtn" aria-label="Previous story" onclick={() => goStep(-1)}><Icon name="chevL" /></button>
						<button type="button" class="hs-icbtn" aria-label="Next story" onclick={() => goStep(1)}><Icon name="chevR" /></button>
						<button type="button" class="hs-icbtn" aria-label="Close" onclick={closeStory}><Icon name="x" /></button>
					</div>
				</div>
			</div>

			{#key animKey}
				<div class="hs-body">
					<!-- CRED-style animated medallion stage -->
					<div class="hs-medal-stage" aria-hidden="true">
						<div class="hs-rays"></div>
						<span class="hs-shock r1"></span>
						<span class="hs-shock r2"></span>
						<span class="hs-shock r3"></span>
						<div class="hs-medal">
							<Icon name={story.icon} />
						</div>
					</div>

					<!-- Eyebrow + Slammed Stamp -->
					<div class="hs-cap">
						<span>{story.label}</span>
						{#if story.stamp}<span class="hs-stamp">{story.stamp}</span>{/if}
					</div>

					<!-- Hero Value or Headline -->
					{#if heroDisplay}
						<b class="hs-hero-val">{heroDisplay}</b>
						<h2 id="hs-title" class="hs-hero-sub">{story.heroSub || story.title}</h2>
					{:else}
						<h2 id="hs-title" class="hs-title-big">{story.title}</h2>
					{/if}

					<p class="hs-desc">{story.body}</p>

					<!-- Rich Animated Frosted Vault Card -->
					{#if story.progress || story.stats?.length || story.items?.length}
						<div class="hs-card">
							{#if story.progress}
								<div class="hs-prog">
									<div class="hs-prog-top">
										<span>{story.progress.label}</span>
										<b>{story.progress.valueText}</b>
									</div>
									<div class="hs-prog-bar"><div class="hs-prog-fill" style="width:{fillPct}%"></div></div>
								</div>
							{/if}

							{#if story.stats?.length}
								<div class="hs-stats" style:--cols={Math.min(3, story.stats.length)}>
									{#each story.stats as st (st.label)}
										<div>
											<small>{st.label}</small>
											<b>{st.value}</b>
										</div>
									{/each}
								</div>
							{/if}

							{#if story.items?.length}
								<div class="hs-items">
									{#each story.items as it, idx (idx)}
										<div class="hs-item" style:--i={idx}>
											<div>
												<b>{it.title}</b>
												{#if it.sub}<small>{it.sub}</small>{/if}
											</div>
											{#if it.right}<span class="hs-item-r">{it.right}</span>{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}

					<!-- NeoPOP Bottom Actions -->
					<div class="hs-acts">
						<button type="button" class="hs-btn-ghost" onclick={closeStory}>Got it</button>
						<a class="hs-btn-pri" href={story.href} onclick={closeStory}>
							<span>{story.action}</span>
							<Icon name="arrow" />
						</a>
					</div>
				</div>
			{/key}
		</div>
	</div>
{/if}

<style>
	@property --hs-rim { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

	/* ---- Story highlight ring strip on Home ---- */
	.creator-stories { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin: 14px 0; }
	.creator-stories button { display: grid; justify-items: center; gap: 5px; min-width: 0; padding: 2px 0; border: 0; background: transparent; color: var(--ink-2); cursor: pointer; }
	.story-ring { position: relative; display: grid; width: min(52px, 100%); aspect-ratio: 1; padding: 2px; box-sizing: border-box; border-radius: 50%; background: var(--story-color); }
	.story-ring::before {
		content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
		background: conic-gradient(from -45deg, var(--story-color), var(--line) 25% 62%, var(--story-color) 85%, #fff 96%, var(--story-color));
	}
	.story-ring > span { position: relative; display: grid; place-items: center; border-radius: inherit; background: radial-gradient(at 30% 25%, var(--surface-2), var(--bg)); color: var(--story-color); }
	.creator-stories small { font-size: 10px; font-weight: 650; }
	@media (prefers-reduced-motion: no-preference) {
		.story-ring::before { animation: story-orbit 3.6s linear infinite; animation-delay: calc(var(--story-index) * -.65s); }
		.story-ring > span :global(svg) { animation: story-lift 3.6s ease-in-out infinite; animation-delay: calc(var(--story-index) * -.65s); }
		.creator-stories button:active .story-ring { transform: scale(.94); }
	}
	@keyframes story-orbit { to { transform: rotate(1turn); } }
	@keyframes story-lift { 50% { transform: translateY(-2px); } }

	/* ---- CRED-style Full-Screen Animated Stage ---- */
	.hs-stage {
		position: fixed;
		inset: 0;
		z-index: 210;
		display: grid;
		place-items: center;
		padding: calc(env(safe-area-inset-top, 0px) + 14px) 18px calc(env(safe-area-inset-bottom, 0px) + 20px);
		background:
			radial-gradient(70% 42% at 50% 24%, color-mix(in oklab, var(--story-color) 30%, transparent), transparent 72%),
			radial-gradient(85% 52% at 50% 88%, color-mix(in oklab, var(--g2, #f25a90) 18%, transparent), transparent 72%),
			rgba(12, 8, 14, 0.96);
		-webkit-backdrop-filter: blur(22px);
		backdrop-filter: blur(22px);
		overflow-y: auto;
		animation: hs-fade .26s ease;
	}
	.hs-cv { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 1; }
	.hs-shell {
		position: relative;
		z-index: 2;
		width: min(100%, 380px);
		min-height: min(640px, calc(100dvh - 36px));
		display: flex;
		flex-direction: column;
		gap: 14px;
		color: #faf7fc;
	}

	/* Top Story Progress Bars & Header */
	.hs-top { display: grid; gap: 12px; }
	.hs-bars { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
	.hs-bar {
		height: 3px;
		padding: 0;
		border: 0;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.16);
		overflow: hidden;
		cursor: pointer;
	}
	.hs-bar span { display: block; height: 100%; width: 0%; background: var(--story-color); border-radius: inherit; }
	.hs-bar.done span { width: 100%; opacity: 0.6; }
	.hs-bar.on span { width: 100%; animation: hs-bar-in .55s cubic-bezier(.22, 1, .36, 1) both; }
	.hs-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
	.hs-tag {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font: 700 11px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--story-color);
	}
	.hs-tag :global(.ic) { width: 15px; height: 15px; }
	.hs-nav-btns { display: inline-flex; gap: 6px; }
	.hs-icbtn {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: #faf7fc;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.hs-icbtn :global(.ic) { width: 16px; height: 16px; }

	/* Body */
	.hs-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 11px;
		text-align: center;
		padding: 6px 0;
	}

	/* Animated Medallion Stage */
	.hs-medal-stage {
		position: relative;
		width: 124px;
		height: 124px;
		display: grid;
		place-items: center;
		perspective: 900px;
		margin-bottom: 2px;
	}
	.hs-rays {
		position: absolute;
		inset: -24px;
		border-radius: 50%;
		pointer-events: none;
		background: conic-gradient(from var(--hs-rim), transparent 0deg, color-mix(in oklab, var(--story-color) 32%, transparent) 30deg, transparent 70deg, rgba(242, 90, 144, 0.2) 140deg, transparent 180deg, rgba(156, 123, 255, 0.22) 250deg, transparent 300deg, color-mix(in oklab, var(--story-color) 25%, transparent) 335deg, transparent 360deg);
		filter: blur(11px);
		animation: hs-spin 8.5s linear infinite;
	}
	.hs-shock {
		position: absolute;
		inset: 10px;
		border-radius: 50%;
		border: 1.8px solid color-mix(in oklab, var(--story-color) 75%, #fff);
		opacity: 0;
		pointer-events: none;
	}
	.hs-shock.r1 { animation: hs-shock 1.05s cubic-bezier(.16, 1, .3, 1) .12s forwards; }
	.hs-shock.r2 { animation: hs-shock 1.25s cubic-bezier(.16, 1, .3, 1) .28s forwards; border-color: rgba(242, 90, 144, 0.55); }
	.hs-shock.r3 { animation: hs-shock 1.4s cubic-bezier(.16, 1, .3, 1) .44s forwards; border-color: rgba(156, 123, 255, 0.5); }

	.hs-medal {
		position: relative;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		overflow: hidden;
		color: var(--story-color);
		background: radial-gradient(circle at 30% 25%, color-mix(in oklab, var(--story-color) 28%, #261b2a), #140e17 78%);
		border: 2.5px solid color-mix(in oklab, var(--story-color) 70%, #fff);
		box-shadow: 0 0 54px color-mix(in oklab, var(--story-color) 55%, transparent), inset 0 2px 4px rgba(255, 255, 255, 0.28);
		animation: hs-flip .88s cubic-bezier(.2, .9, .22, 1) both;
	}
	.hs-medal::before {
		content: '';
		position: absolute;
		inset: 6px;
		border-radius: 50%;
		border: 1px dashed color-mix(in oklab, var(--story-color) 40%, transparent);
	}
	.hs-medal::after {
		content: '';
		position: absolute;
		inset: 0;
		width: 48%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.45), transparent);
		animation: hs-sheen 2.5s ease-in-out infinite;
	}
	.hs-medal :global(.ic) { width: 34px; height: 34px; stroke-width: 1.7; }

	/* Caption + Stamp */
	.hs-cap {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font: 700 10.5px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--story-color);
	}
	.hs-stamp {
		display: inline-block;
		padding: 3px 7px;
		border: 1.5px solid var(--story-color);
		color: var(--story-color);
		font: 800 9px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		background: color-mix(in oklab, var(--story-color) 14%, transparent);
		opacity: 0;
		animation: hs-stamp .42s cubic-bezier(.22, 1, .36, 1) .42s forwards;
	}

	/* Hero Metric & Titles */
	.hs-hero-val {
		font: 400 48px/1 var(--f-serif, Georgia, serif);
		letter-spacing: -1.4px;
		font-variant-numeric: tabular-nums;
		color: #faf7fc;
		text-shadow: 0 8px 30px color-mix(in oklab, var(--story-color) 35%, transparent);
	}
	.hs-hero-sub {
		margin: 0;
		font: 400 22px/1.15 var(--f-serif, Georgia, serif);
		color: #f4ecf7;
	}
	.hs-title-big {
		margin: 0;
		font: 400 32px/1.1 var(--f-serif, Georgia, serif);
		color: #faf7fc;
		max-width: 16ch;
	}
	.hs-desc {
		margin: 0;
		max-width: 34ch;
		font-size: 13.5px;
		line-height: 1.5;
		color: #cfc6d6;
	}

	/* Frosted Vault Data Card */
	.hs-card {
		width: 100%;
		margin-top: 6px;
		border-radius: 18px;
		border: 1px solid color-mix(in oklab, var(--story-color) 35%, #3d3040);
		background: linear-gradient(155deg, rgba(36, 26, 40, 0.92), rgba(18, 13, 21, 0.96));
		padding: 14px 15px;
		display: grid;
		gap: 12px;
		text-align: left;
		box-shadow: 0 20px 44px -22px #000d;
		animation: hs-card-in .46s cubic-bezier(.22, 1, .36, 1) .26s both;
	}
	.hs-prog { display: grid; gap: 6px; }
	.hs-prog-top { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px; }
	.hs-prog-top span { color: #9b8fa8; }
	.hs-prog-top b { color: var(--story-color); font: 700 11.5px/1 var(--f-mono, ui-monospace, monospace); }
	.hs-prog-bar { height: 7px; border-radius: 999px; background: #2a202c; overflow: hidden; }
	.hs-prog-fill {
		height: 100%;
		border-radius: 999px;
		background: linear-gradient(90deg, var(--g1, #9c7bff), var(--story-color), var(--g3, #ffae6b));
		transition: width .9s cubic-bezier(.22, 1, .36, 1);
	}

	.hs-stats {
		display: grid;
		grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
		gap: 8px;
	}
	.hs-prog + .hs-stats { padding-top: 10px; border-top: 1px dashed #3e3140; }
	.hs-stats small {
		display: block;
		font: 700 9.5px/1.2 var(--f-mono, ui-monospace, monospace);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #9b8fa8;
	}
	.hs-stats b { display: block; margin-top: 3px; font-size: 14px; font-weight: 700; color: #faf7fc; }

	.hs-items {
		display: grid;
		gap: 8px;
		padding-top: 10px;
		border-top: 1px dashed #3e3140;
	}
	.hs-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		animation: hs-card-in .38s cubic-bezier(.22, 1, .36, 1) calc(.34s + var(--i) * .07s) both;
	}
	.hs-item > div { min-width: 0; display: grid; gap: 1px; }
	.hs-item b { font-size: 13px; font-weight: 600; color: #faf7fc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hs-item small { font-size: 11px; color: #9b8fa8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hs-item-r {
		flex-shrink: 0;
		font: 700 12px/1 var(--f-mono, ui-monospace, monospace);
		color: var(--story-color);
	}

	/* NeoPOP Actions */
	.hs-acts {
		display: flex;
		gap: 10px;
		width: 100%;
		margin-top: 8px;
		animation: hs-card-in .44s cubic-bezier(.22, 1, .36, 1) .4s both;
	}
	.hs-btn-ghost,
	.hs-btn-pri {
		flex: 1;
		min-height: 46px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border-radius: 0;
		font: 700 13.5px/1 var(--f-body, system-ui, sans-serif);
		cursor: pointer;
		text-decoration: none;
	}
	.hs-btn-ghost {
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(255, 255, 255, 0.03);
		color: #faf7fc;
	}
	.hs-btn-pri {
		border: 0;
		background: #ffffff;
		color: #120b14;
		box-shadow: 3.5px 3.5px 0 0 var(--story-color);
	}
	.hs-btn-pri :global(.ic) { width: 15px; height: 15px; }

	@keyframes hs-spin { to { --hs-rim: 360deg; } }
	@keyframes hs-sheen { 0% { transform: translateX(-160%) skewX(-22deg); } 100% { transform: translateX(270%) skewX(-22deg); } }
	@keyframes hs-shock { 0% { transform: scale(.35); opacity: .82; } 100% { transform: scale(2.4); opacity: 0; } }
	@keyframes hs-stamp { 0% { transform: scale(2.1) rotate(-12deg); opacity: 0; } 65% { transform: scale(.94) rotate(-4deg); opacity: 1; } 100% { transform: scale(1) rotate(-4deg); opacity: 1; } }
	@keyframes hs-card-in { 0% { transform: translateY(18px) scale(.97); opacity: 0; } 100% { transform: none; opacity: 1; } }
	@keyframes hs-flip { 0% { transform: translateY(110px) rotateY(0) scale(.4); opacity: 0; } 58% { transform: translateY(-10px) rotateY(540deg) scale(1.06); opacity: 1; } 100% { transform: translateY(0) rotateY(720deg) scale(1); } }
	@keyframes hs-fade { from { opacity: 0; } }
	@keyframes hs-bar-in { from { width: 0%; } to { width: 100%; } }
	@media (prefers-reduced-motion: reduce) {
		.hs-medal, .hs-stage, .hs-rays, .hs-shock, .hs-stamp, .hs-card, .hs-item, .hs-acts { animation: none; opacity: 1; transform: none; }
	}
</style>
