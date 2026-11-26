<script lang="ts">
	import { igImg } from '../igImg';
	import { portal } from '../portal';
	import Icon from './Icon.svelte';

	export type StoryStat = { label: string; value: string };
	export type StoryItem = { title: string; sub?: string; right?: string; href?: string };
	export type StoryMedia = {
		thumbnail?: string;
		permalink?: string;
		caption?: string;
		postedAt?: string;
		badge?: string;
	};
	export type StoryAnim = 'celebrate' | 'radar' | 'vault' | 'reel' | 'briefs';
	export type Story = {
		label: string;
		icon: string;
		color: string;
		title: string;
		body: string;
		action: string;
		href: string;
		/** Bespoke stage animation matched to the card's content */
		animation?: StoryAnim;
		stamp?: string;
		heroText?: string;
		heroNumeric?: number;
		heroFormat?: 'inr' | 'compact' | 'number' | 'pct';
		heroSub?: string;
		progress?: { label: string; valueText: string; pct: number };
		media?: StoryMedia;
		stats?: StoryStat[];
		badge?: number;
		items?: StoryItem[];
	};

	let { label, stories }: { label: string; stories: Story[] } = $props();
	let open = $state(false);
	let selected = $state(0);
	let animKey = $state(0);
	let displayNum = $state(0);
	let fillPct = $state(0);
	let thumbFailed = $state(false);
	let stageBox = $state<HTMLElement>();
	let canvas = $state<HTMLCanvasElement>();

	const story = $derived(stories[selected] ?? stories[0]);
	const mediaThumb = $derived(!thumbFailed && story?.media?.thumbnail ? igImg(story.media.thumbnail) : '');
	const animKind = $derived<StoryAnim>(
		story?.animation ??
			(story?.icon === 'chart'
				? 'radar'
				: story?.icon === 'wallet'
					? 'vault'
					: story?.icon === 'film'
						? 'reel'
						: story?.icon === 'inbox'
							? 'briefs'
							: 'celebrate')
	);

	export function openStory(index: number) {
		selected = index;
		thumbFailed = false;
		animKey += 1;
		open = true;
	}

	function closeStory() {
		open = false;
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
		void animKey;
		const mode = animKind;
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
			const dur = 740;
			const step = (now: number) => {
				const p = Math.min(1, (now - t0) / dur);
				const ease = 1 - Math.pow(1 - p, 3);
				displayNum = targetNum * ease;
				if (p < 1) odoRaf = requestAnimationFrame(step);
				else displayNum = targetNum;
			};
			odoRaf = requestAnimationFrame(step);
		}

		// Bespoke canvas animation per story type (no generic popper on every card)
		let partRaf = 0;
		const partTimer = setTimeout(() => {
			if (!canvas || !stageBox) return;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			const W = (canvas.width = stageBox.offsetWidth || window.innerWidth);
			const H = (canvas.height = stageBox.offsetHeight || window.innerHeight);
			const cx = W / 2;
			const cy = Math.min(200, H * 0.24);

			if (mode === 'celebrate') {
				// 1. WRAPPED: celebratory metallic foil burst
				const cols = ['#ffd67a', '#f25a90', '#b29aff', '#ffae6b', '#ffffff'];
				const pts = Array.from({ length: 56 }, (_, i) => {
					const ang = Math.random() * Math.PI * 2;
					const spd = 2.4 + Math.random() * 7.8;
					return {
						x: cx, y: cy,
						vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2.6,
						w: i % 3 === 0 ? 4 : 6.5 + Math.random() * 4,
						h: i % 3 === 0 ? 4 : 2.5 + Math.random() * 2.5,
						rot: Math.random() * 360, vr: (Math.random() - 0.5) * 13,
						col: cols[i % cols.length], life: 80 + Math.random() * 28, circle: i % 3 === 0
					};
				});
				const tick = () => {
					ctx.clearRect(0, 0, W, H);
					let alive = false;
					for (const p of pts) {
						if (p.life <= 0) continue;
						alive = true;
						p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.vy += 0.17; p.rot += p.vr; p.life--;
						ctx.save();
						ctx.globalAlpha = Math.min(0.9, p.life / 32);
						ctx.translate(p.x, p.y);
						ctx.rotate((p.rot * Math.PI) / 180);
						ctx.fillStyle = p.col;
						if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill(); }
						else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
						ctx.restore();
					}
					if (alive) partRaf = requestAnimationFrame(tick);
				};
				partRaf = requestAnimationFrame(tick);
			} else if (mode === 'radar') {
				// 2. AI TIPS: calm neural constellation nodes + pulsing signal lines around the radar
				const nodes = Array.from({ length: 18 }, (_, i) => {
					const ang = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
					const r = 68 + Math.random() * 92;
					return { ang, r, speed: (i % 2 === 0 ? 1 : -1) * (0.004 + Math.random() * 0.005), phase: Math.random() * Math.PI * 2 };
				});
				let f = 0;
				const tick = () => {
					f++;
					ctx.clearRect(0, 0, W, H);
					const pts = nodes.map((n) => {
						n.ang += n.speed;
						return { x: cx + Math.cos(n.ang) * n.r, y: cy + Math.sin(n.ang) * n.r, pulse: 0.4 + 0.6 * Math.sin(f * 0.06 + n.phase) };
					});
					ctx.strokeStyle = 'rgba(156, 123, 255, 0.16)';
					ctx.lineWidth = 1;
					for (let i = 0; i < pts.length; i++) {
						for (let j = i + 1; j < pts.length; j++) {
							const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
							if (d < 78) {
								ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
							}
						}
					}
					for (const p of pts) {
						ctx.fillStyle = `rgba(182, 156, 255, ${0.35 + p.pulse * 0.55})`;
						ctx.beginPath(); ctx.arc(p.x, p.y, 2 + p.pulse * 1.6, 0, Math.PI * 2); ctx.fill();
					}
					partRaf = requestAnimationFrame(tick);
				};
				partRaf = requestAnimationFrame(tick);
			} else if (mode === 'vault') {
				// 3. DUE SOON: warm golden embers & subtle ₹ coin sparks rising steadily upward
				const sparks = Array.from({ length: 22 }, () => ({
					x: cx + (Math.random() - 0.5) * 220,
					y: cy + 80 + Math.random() * 140,
					vy: -(0.6 + Math.random() * 1.1),
					vx: (Math.random() - 0.5) * 0.35,
					r: 1.8 + Math.random() * 2.4,
					alpha: 0.25 + Math.random() * 0.55
				}));
				const tick = () => {
					ctx.clearRect(0, 0, W, H);
					for (const s of sparks) {
						s.x += s.vx; s.y += s.vy;
						if (s.y < cy - 120) { s.y = cy + 130; s.x = cx + (Math.random() - 0.5) * 220; }
						const fade = Math.max(0, 1 - Math.abs(s.y - cy) / 150);
						ctx.fillStyle = `rgba(255, 190, 118, ${s.alpha * fade})`;
						ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
					}
					partRaf = requestAnimationFrame(tick);
				};
				partRaf = requestAnimationFrame(tick);
			} else if (mode === 'reel') {
				// 4. TOP REEL: viral reach soundwave/ripple arcs radiating outward smoothly
				let f = 0;
				const tick = () => {
					f++;
					ctx.clearRect(0, 0, W, H);
					for (let k = 0; k < 4; k++) {
						const p = ((f * 0.01 + k * 0.25) % 1);
						const radius = 54 + p * 125;
						ctx.strokeStyle = `rgba(111, 208, 140, ${(1 - p) * 0.42})`;
						ctx.lineWidth = 1.6;
						ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
					}
					partRaf = requestAnimationFrame(tick);
				};
				partRaf = requestAnimationFrame(tick);
			} else {
				// 5. BRIEFS: crisp floating opportunity cards drifting upward in sky-blue
				const cards = Array.from({ length: 10 }, (_, i) => ({
					x: cx + (Math.random() - 0.5) * 240,
					y: cy + 120 + i * 24,
					vy: -(0.55 + Math.random() * 0.65),
					w: 16 + Math.random() * 10,
					h: 11 + Math.random() * 6,
					rot: (Math.random() - 0.5) * 0.35
				}));
				const tick = () => {
					ctx.clearRect(0, 0, W, H);
					for (const c of cards) {
						c.y += c.vy;
						if (c.y < cy - 130) { c.y = cy + 140; c.x = cx + (Math.random() - 0.5) * 240; }
						const fade = Math.max(0, 1 - Math.abs(c.y - cy) / 155);
						ctx.save();
						ctx.translate(c.x, c.y);
						ctx.rotate(c.rot);
						ctx.strokeStyle = `rgba(117, 187, 239, ${0.42 * fade})`;
						ctx.fillStyle = `rgba(117, 187, 239, ${0.08 * fade})`;
						ctx.lineWidth = 1.1;
						ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
						ctx.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h);
						ctx.restore();
					}
					partRaf = requestAnimationFrame(tick);
				};
				partRaf = requestAnimationFrame(tick);
			}
		}, 100);

		return () => {
			clearTimeout(fillTimer);
			clearTimeout(partTimer);
			cancelAnimationFrame(odoRaf);
			cancelAnimationFrame(partRaf);
		};
	});
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && closeStory()} />

<nav class="creator-stories" aria-label={label}>
	{#each stories as item, i (item.label)}
		<button type="button" aria-haspopup="dialog" style:--story-color={item.color} style:--story-index={i} onclick={() => openStory(i)}>
			<span class="story-ring" class:has-badge={!!item.badge && item.badge > 0}>
				<span><Icon name={item.icon} /></span>
				{#if item.badge && item.badge > 0}
					<em class="story-badge" aria-label="{item.badge} pending">{item.badge > 9 ? '9+' : item.badge}</em>
				{/if}
			</span>
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
			{#key animKey}
				<div class="hs-body">
					<!-- Bespoke Animated Hero Medallion per card -->
					<div class="hs-medal-stage anim-{animKind}" aria-hidden="true">
						<div class="hs-rays"></div>
						{#if animKind === 'celebrate'}
							<span class="hs-shock r1"></span>
							<span class="hs-shock r2"></span>
							<span class="hs-shock r3"></span>
						{:else if animKind === 'radar'}
							<div class="hs-sweep"></div>
						{:else if animKind === 'vault'}
							<span class="hs-pulse-ring"></span>
						{:else if animKind === 'reel'}
							<span class="hs-aperture"></span>
						{:else}
							<span class="hs-orbit-dot"></span>
						{/if}
						<div class="hs-medal" class:has-img={!!mediaThumb}>
							{#if mediaThumb}
								<img
									class="hs-medal-img"
									src={mediaThumb}
									alt=""
									referrerpolicy="no-referrer"
									onerror={() => (thumbFailed = true)}
								/>
							{:else}
								<Icon name={story.icon} />
							{/if}
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

					{#if story.body}
						<p class="hs-desc">{story.body}</p>
					{/if}

					<!-- Rich Animated Frosted Vault Card -->
					{#if story.media || story.progress || story.stats?.length || story.items?.length}
						<div class="hs-card">
							{#if story.media}
								{#if story.media.permalink}
									<a class="hs-post" href={story.media.permalink} target="_blank" rel="noopener">
										{#if mediaThumb}
											<img
												class="hs-post-thumb"
												src={mediaThumb}
												alt=""
												referrerpolicy="no-referrer"
												onerror={() => (thumbFailed = true)}
											/>
										{:else}
											<span class="hs-post-ph"><Icon name="film" /></span>
										{/if}
										<div class="hs-post-meta">
											<div class="hs-post-top">
												<span class="hs-post-badge">{story.media.badge || 'Instagram Reel'}</span>
												{#if story.media.postedAt}<small>{story.media.postedAt}</small>{/if}
											</div>
											{#if story.media.caption}
												<p class="hs-post-cap">{story.media.caption}</p>
											{/if}
											<span class="hs-post-open"><Icon name="insta" /><span>Open post on Instagram</span></span>
										</div>
										<span class="hs-post-go" aria-hidden="true"><Icon name="chevR" /></span>
									</a>
								{:else}
									<div class="hs-post">
										{#if mediaThumb}
											<img
												class="hs-post-thumb"
												src={mediaThumb}
												alt=""
												referrerpolicy="no-referrer"
												onerror={() => (thumbFailed = true)}
											/>
										{:else}
											<span class="hs-post-ph"><Icon name="film" /></span>
										{/if}
										<div class="hs-post-meta">
											<div class="hs-post-top">
												<span class="hs-post-badge">{story.media.badge || 'Instagram Reel'}</span>
												{#if story.media.postedAt}<small>{story.media.postedAt}</small>{/if}
											</div>
											{#if story.media.caption}
												<p class="hs-post-cap">{story.media.caption}</p>
											{/if}
										</div>
									</div>
								{/if}
							{/if}

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
										{#if it.href}
											<a class="hs-item hs-item-link" href={it.href} style:--i={idx} onclick={closeStory}>
												<div>
													<b>{it.title}</b>
													{#if it.sub}<small>{it.sub}</small>{/if}
												</div>
												{#if it.right}<span class="hs-item-r">{it.right}</span>{/if}
											</a>
										{:else}
											<div class="hs-item" style:--i={idx}>
												<div>
													<b>{it.title}</b>
													{#if it.sub}<small>{it.sub}</small>{/if}
												</div>
												{#if it.right}<span class="hs-item-r">{it.right}</span>{/if}
											</div>
										{/if}
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

	/* ---- CRED-style Full-Screen Animated Stage (clean, no top bar clutter) ---- */
	.hs-stage {
		position: fixed;
		inset: 0;
		z-index: 210;
		display: grid;
		place-items: center;
		padding: calc(env(safe-area-inset-top, 0px) + 20px) 18px calc(env(safe-area-inset-bottom, 0px) + 24px);
		background:
			radial-gradient(70% 42% at 50% 24%, color-mix(in oklab, var(--story-color) 30%, transparent), transparent 72%),
			radial-gradient(85% 52% at 50% 88%, color-mix(in oklab, var(--g2, #f25a90) 16%, transparent), transparent 72%),
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
		width: min(100%, 368px);
		color: #faf7fc;
	}
	.hs-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 11px;
		text-align: center;
	}

	/* ---- Bespoke Medallion Animations ---- */
	.hs-medal-stage {
		position: relative;
		width: 128px;
		height: 128px;
		display: grid;
		place-items: center;
		perspective: 900px;
		margin-bottom: 4px;
	}
	.hs-rays {
		position: absolute;
		inset: -22px;
		border-radius: 50%;
		pointer-events: none;
		background: conic-gradient(from var(--hs-rim), transparent 0deg, color-mix(in oklab, var(--story-color) 32%, transparent) 30deg, transparent 75deg, color-mix(in oklab, var(--story-color) 20%, transparent) 180deg, transparent 230deg, color-mix(in oklab, var(--story-color) 26%, transparent) 320deg, transparent 360deg);
		filter: blur(11px);
		animation: hs-spin 8.5s linear infinite;
	}
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
		box-shadow: 0 0 54px color-mix(in oklab, var(--story-color) 52%, transparent), inset 0 2px 4px rgba(255, 255, 255, 0.28);
	}
	.hs-medal::before {
		content: '';
		position: absolute;
		inset: 6px;
		border-radius: 50%;
		border: 1px dashed color-mix(in oklab, var(--story-color) 40%, transparent);
	}
	.hs-medal.has-img::before { display: none; }
	.hs-medal::after {
		content: '';
		position: absolute;
		inset: 0;
		width: 48%;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.42), transparent);
		animation: hs-sheen 2.5s ease-in-out infinite;
		pointer-events: none;
	}
	.hs-medal-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.hs-medal :global(.ic) { width: 34px; height: 34px; stroke-width: 1.7; }

	/* 1. WRAPPED (celebrate): 3D coin flip + triple shockwaves */
	.anim-celebrate .hs-medal { animation: hs-flip .88s cubic-bezier(.2, .9, .22, 1) both; }
	.hs-shock { position: absolute; inset: 10px; border-radius: 50%; border: 1.8px solid color-mix(in oklab, var(--story-color) 75%, #fff); opacity: 0; pointer-events: none; }
	.hs-shock.r1 { animation: hs-shock 1.05s cubic-bezier(.16, 1, .3, 1) .12s forwards; }
	.hs-shock.r2 { animation: hs-shock 1.25s cubic-bezier(.16, 1, .3, 1) .28s forwards; border-color: rgba(242, 90, 144, 0.55); }
	.hs-shock.r3 { animation: hs-shock 1.4s cubic-bezier(.16, 1, .3, 1) .44s forwards; border-color: rgba(156, 123, 255, 0.5); }

	/* 2. AI TIPS (radar): rotating radar sweep beam + gentle levitation */
	.anim-radar .hs-medal { animation: hs-float 3s ease-in-out infinite; }
	.hs-sweep {
		position: absolute;
		inset: -4px;
		border-radius: 50%;
		background: conic-gradient(from var(--hs-rim), rgba(156, 123, 255, 0.55) 0deg, transparent 78deg, transparent 360deg);
		-webkit-mask: radial-gradient(farthest-side, transparent 62%, #000 64%);
		mask: radial-gradient(farthest-side, transparent 62%, #000 64%);
		animation: hs-spin 2.4s linear infinite;
	}

	/* 3. DUE SOON (vault): warm heartbeat pulse ring + calm scale-in */
	.anim-vault .hs-medal { animation: hs-vault-in .6s cubic-bezier(.22, 1, .36, 1) both; }
	.hs-pulse-ring {
		position: absolute;
		inset: 4px;
		border-radius: 50%;
		border: 2px solid color-mix(in oklab, var(--story-color) 75%, #fff);
		animation: hs-heartbeat 1.8s ease-out infinite;
	}

	/* 4. TOP REEL (reel): cinema aperture ring spin + pop-in */
	.anim-reel .hs-medal { animation: hs-pop .65s cubic-bezier(.34, 1.56, .64, 1) both; }
	.hs-aperture {
		position: absolute;
		inset: -2px;
		border-radius: 50%;
		border: 2px dashed color-mix(in oklab, var(--story-color) 70%, #fff);
		animation: hs-spin 10s linear infinite;
	}

	/* 5. BRIEFS (briefs): orbiting opportunity satellite dot + smooth glide-up */
	.anim-briefs .hs-medal { animation: hs-glide .6s cubic-bezier(.22, 1, .36, 1) both; }
	.hs-orbit-dot {
		position: absolute;
		inset: -2px;
		border-radius: 50%;
		border: 1px solid rgba(117, 187, 239, 0.35);
		animation: hs-spin 4.2s linear infinite;
	}
	.hs-orbit-dot::after {
		content: '';
		position: absolute;
		top: -4px;
		left: 50%;
		width: 8px;
		height: 8px;
		margin-left: -4px;
		border-radius: 50%;
		background: #75bbef;
		box-shadow: 0 0 12px #75bbef;
	}

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
		animation: hs-stamp .42s cubic-bezier(.22, 1, .36, 1) .36s forwards;
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
		animation: hs-card-in .46s cubic-bezier(.22, 1, .36, 1) .24s both;
	}

	/* Featured Post Preview Row (shows which Reel/Post won + opens on Instagram) */
	.hs-post {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px;
		margin: -4px -4px 0;
		border-radius: 13px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		text-decoration: none;
		color: inherit;
		transition: background 0.16s, border-color 0.16s;
	}
	a.hs-post:hover,
	a.hs-post:active {
		background: color-mix(in oklab, var(--story-color) 10%, rgba(255, 255, 255, 0.04));
		border-color: color-mix(in oklab, var(--story-color) 42%, rgba(255, 255, 255, 0.12));
	}
	.hs-post-thumb,
	.hs-post-ph {
		width: 48px;
		height: 64px;
		border-radius: 9px;
		flex: none;
		object-fit: cover;
		border: 1px solid rgba(255, 255, 255, 0.12);
	}
	.hs-post-ph {
		display: grid;
		place-items: center;
		background: linear-gradient(155deg, color-mix(in oklab, var(--story-color) 22%, #241928), #140f17);
		color: var(--story-color);
	}
	.hs-post-ph :global(.ic) { width: 20px; height: 20px; }
	.hs-post-meta {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 4px;
	}
	.hs-post-top {
		display: flex;
		align-items: center;
		gap: 7px;
		flex-wrap: wrap;
	}
	.hs-post-badge {
		font: 700 9.5px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--story-color);
	}
	.hs-post-top small {
		font-size: 11px;
		color: #9b8fa8;
	}
	.hs-post-cap {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.38;
		color: #efe8f4;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.hs-post-open {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font: 600 11px/1 var(--f-body, system-ui, sans-serif);
		color: var(--story-color);
	}
	.hs-post-open :global(.ic) { width: 12px; height: 12px; }
	.hs-post-go {
		flex: none;
		color: #9b8fa8;
		display: grid;
		place-items: center;
	}
	.hs-post-go :global(.ic) { width: 16px; height: 16px; }
	.hs-post + .hs-stats { padding-top: 10px; border-top: 1px dashed #3e3140; }

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
		animation: hs-card-in .38s cubic-bezier(.22, 1, .36, 1) calc(.32s + var(--i) * .07s) both;
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
		animation: hs-card-in .44s cubic-bezier(.22, 1, .36, 1) .38s both;
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
	@keyframes hs-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
	@keyframes hs-heartbeat { 0% { transform: scale(.92); opacity: .8; } 70% { transform: scale(1.38); opacity: 0; } 100% { transform: scale(1.38); opacity: 0; } }
	@keyframes hs-vault-in { 0% { transform: scale(.7); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
	@keyframes hs-pop { 0% { transform: scale(.45) rotate(-18deg); opacity: 0; } 100% { transform: scale(1) rotate(0); opacity: 1; } }
	@keyframes hs-glide { 0% { transform: translateY(28px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
	@keyframes hs-stamp { 0% { transform: scale(2.1) rotate(-12deg); opacity: 0; } 65% { transform: scale(.94) rotate(-4deg); opacity: 1; } 100% { transform: scale(1) rotate(-4deg); opacity: 1; } }
	@keyframes hs-card-in { 0% { transform: translateY(18px) scale(.97); opacity: 0; } 100% { transform: none; opacity: 1; } }
	@keyframes hs-flip { 0% { transform: translateY(110px) rotateY(0) scale(.4); opacity: 0; } 58% { transform: translateY(-10px) rotateY(540deg) scale(1.06); opacity: 1; } 100% { transform: translateY(0) rotateY(720deg) scale(1); } }
	@keyframes hs-fade { from { opacity: 0; } }
	@media (prefers-reduced-motion: reduce) {
		.hs-medal, .hs-stage, .hs-rays, .hs-shock, .hs-sweep, .hs-pulse-ring, .hs-aperture, .hs-orbit-dot, .hs-stamp, .hs-card, .hs-item, .hs-acts { animation: none; opacity: 1; transform: none; }
	}

	.story-ring.has-badge {
		box-shadow: 0 0 0 2px rgba(242, 90, 144, 0.28), 0 0 14px rgba(242, 90, 144, 0.35);
	}
	.story-badge {
		position: absolute;
		top: -3px;
		right: -3px;
		z-index: 3;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		border-radius: 999px;
		background: #f25a90;
		color: #fff;
		border: 2px solid var(--bg, #110d11);
		font-style: normal;
		font-family: var(--mono, ui-monospace, monospace);
		font-size: 10px;
		font-weight: 800;
		line-height: 14px;
		display: grid;
		place-items: center;
		box-shadow: 0 2px 8px rgba(242, 90, 144, 0.5);
	}
	.hs-item-link {
		color: inherit;
		text-decoration: none;
		border-radius: 10px;
		padding: 6px 8px;
		margin: -6px -8px;
		transition: background 0.15s ease;
	}
	.hs-item-link:hover {
		background: rgba(255, 255, 255, 0.06);
	}
</style>
