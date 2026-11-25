<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { askAi } from '#lib/ai.ts';
	import { nextSlots } from '#lib/grow.svelte.ts';
	import { loadInstagram, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	type HookOption = { angle: string; onscreen: string; spoken: string };
	type Beat = { time: string; shot: string; onscreen: string; spoken: string };
	type Blueprint = {
		series: { name: string; episode: string; reason_to_follow: string };
		hooks: HookOption[];
		beats: Beat[];
		caption: string;
		pin_comment: string;
		dm_magnet: { keyword: string; reply: string };
	};

	let topic = $state('');
	let seriesName = $state('');
	let goal = $state<'followers' | 'shares' | 'saves'>('followers');
	let busy = $state<'' | 'gen' | 'plan' | 'dm'>('');
	let bp = $state<Blueprint | null>(null);
	let pickedHook = $state(0);
	let dmSaved = $state(false);

	// Rank the creator's own Reels by Shares per 1k views + Saves per 1k views (true non-follower growth signals).
	const topWinners = $derived.by(() => {
		return studio.media
			.filter((m) => (m.views ?? m.reach ?? 0) >= 200)
			.map((m) => {
				const v = Number(m.views ?? m.reach ?? 1);
				const shares1k = ((Number(m.shares ?? 0) / v) * 1000);
				const saves1k = ((Number(m.saves ?? 0) / v) * 1000);
				const score = shares1k * 1.4 + saves1k;
				const clean = (m.caption || 'Reel').replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
				const label = clean.length > 48 ? clean.slice(0, 46).trim() + '…' : clean || 'Top Reel';
				return { id: m.id, label, views: v, shares1k: Number(shares1k.toFixed(1)), saves1k: Number(saves1k.toFixed(1)), score };
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, 3);
	});

	const nextSlot = $derived(nextSlots(studio.media, 1)[0] ?? null);
	const slotLabel = $derived(
		nextSlot
			? nextSlot.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
			: ''
	);

	const activeHook = $derived(bp?.hooks[pickedHook] ?? bp?.hooks[0] ?? null);

	async function generate(seedTopic?: string) {
		const t = (seedTopic ?? topic).trim();
		if (!t) {
			toast('Enter a Reel topic or tap one of your winning Reels', 'alert');
			return;
		}
		if (seedTopic) topic = seedTopic;
		busy = 'gen';
		dmSaved = false;
		try {
			const r = await askAi<Blueprint>('viralstudio', {
				topic: t,
				goal,
				series_name: seriesName.trim(),
				niche: studio.settings?.niche ?? '',
				creator: studio.settings?.display_name ?? '',
				top_reels: topWinners.map((w) => ({
					caption: w.label,
					views: w.views,
					shares_per_1k: w.shares1k,
					saves_per_1k: w.saves1k
				}))
			});
			bp = r;
			pickedHook = 0;
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}

	async function copyFullScript() {
		if (!bp) return;
		const h = activeHook;
		const lines = [
			`SERIES: ${bp.series.name} (${bp.series.episode})`,
			h ? `\n0–2s HOOK (${h.angle})\nOn-screen: ${h.onscreen}\nSay: "${h.spoken}"` : '',
			'\nSHOT SHEET:',
			...bp.beats.map((b) => `${b.time} · ${b.shot}\n  Text: ${b.onscreen}\n  Say: "${b.spoken}"`),
			`\nCAPTION:\n${bp.caption}`,
			`\nPINNED FIRST COMMENT:\n${bp.pin_comment}`,
			bp.dm_magnet?.keyword ? `\nCOMMENT-TO-DM KEYWORD: ${bp.dm_magnet.keyword}` : ''
		];
		await copyText(lines.filter(Boolean).join('\n'), 'Shoot script copied');
	}

	async function activateMagnet() {
		if (!bp?.dm_magnet?.keyword || busy) return;
		const kw = bp.dm_magnet.keyword.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
		if (kw.length < 2) return;
		busy = 'dm';
		try {
			const { data: existing } = await supabase.from('dm_rules').select('id').ilike('keyword', kw).maybeSingle();
			if (existing) {
				const { error } = await supabase.from('dm_rules').update({ active: true, reply: bp.dm_magnet.reply }).eq('id', existing.id);
				if (error) throw error;
			} else {
				const { error } = await supabase.from('dm_rules').insert({ keyword: kw, reply: bp.dm_magnet.reply, active: true });
				if (error) throw error;
			}
			dmSaved = true;
			toast(`Comment-to-DM active for "${kw}"`);
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}

	async function saveToCalendar() {
		if (!bp || !nextSlot || busy) return;
		busy = 'plan';
		try {
			const title = `${bp.series.name}: ${activeHook?.onscreen || topic}`.slice(0, 120);
			const why = `${bp.series.episode} · ${bp.series.reason_to_follow}`.slice(0, 180);
			const { error } = await supabase.from('content_plans').insert({
				title,
				why,
				post_at: nextSlot.toISOString(),
				status: 'planned',
				source: 'studio'
			});
			if (error) throw error;
			toast(`Added to Calendar for ${slotLabel}`, 'cal');
			goto('/studio/calendar');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}

	onMount(() => {
		if (!studio.media.length) void loadInstagram();
		const q = page.url.searchParams.get('topic');
		if (q && !topic) topic = q;
	});
</script>

<svelte:head><title>Viral Script Studio · Miracle</title></svelte:head>

<div class="vs">
	<header class="vs-head">
		<span class="vs-eb">Before you film</span>
		<h1>Viral Script &amp; <em>Series</em> Studio</h1>
		<p>Build a shoot-ready 20–30s Reel around scroll-stop hooks, repeatable episodes, and a Comment-to-DM magnet.</p>
	</header>

	{#if topWinners.length}
		<section class="vs-card">
			<div class="vs-ch">
				<h2>Remix your highest-share Reels</h2>
				<small>Ranked by Shares &amp; Saves per 1k views</small>
			</div>
			<div class="vs-wins">
				{#each topWinners as w (w.id)}
					<button class="vs-win" onclick={() => generate(`Part 2 of: ${w.label}`)} disabled={busy === 'gen'}>
						<span class="vs-wl">
							<b>{w.label}</b>
							<small>{w.shares1k} shares/1k · {w.saves1k} saves/1k</small>
						</span>
						<span class="vs-wtag">Make Part 2</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<section class="vs-card">
		<div class="vs-field">
			<label for="vs-topic">What is this Reel about?</label>
			<textarea
				id="vs-topic"
				rows="2"
				bind:value={topic}
				placeholder="e.g. Hidden rooftop cafe in Indiranagar under ₹800, or 3 monsoon outfits for Bengaluru"
			></textarea>
		</div>

		<div class="vs-row2">
			<div class="vs-field">
				<label for="vs-series">Series name (optional)</label>
				<input id="vs-series" type="text" bind:value={seriesName} placeholder="e.g. Bengaluru Hidden Spots" />
			</div>
			<div class="vs-field">
				<span class="vs-lbl">Primary growth goal</span>
				<div class="vs-goals" role="radiogroup" aria-label="Growth goal">
					<button class:on={goal === 'followers'} onclick={() => (goal = 'followers')}>Followers</button>
					<button class:on={goal === 'shares'} onclick={() => (goal = 'shares')}>Shares</button>
					<button class:on={goal === 'saves'} onclick={() => (goal = 'saves')}>Saves</button>
				</div>
			</div>
		</div>

		<button class="vs-neopop" onclick={() => generate()} disabled={busy === 'gen'}>
			<Icon name="spark" />
			<span>{busy === 'gen' ? 'Writing viral blueprint…' : 'Generate shoot-ready blueprint'}</span>
		</button>
	</section>

	{#if bp}
		<!-- Series & Follow Trigger -->
		<section class="vs-hero">
			<span class="vs-pill"><Icon name="layers" /><span>{bp.series.episode}</span></span>
			<h2>{bp.series.name}</h2>
			<p><b>Why non-followers hit Follow:</b> {bp.series.reason_to_follow}</p>
		</section>

		<!-- 3 Competing 0-2s Hooks -->
		<section class="vs-card">
			<div class="vs-ch">
				<h3>Pick your 0–2s scroll-stop hook</h3>
				<small>Tap one to lock it into your script</small>
			</div>
			<div class="vs-hooks">
				{#each bp.hooks as h, idx (idx)}
					<button class="vs-hook" class:picked={pickedHook === idx} onclick={() => (pickedHook = idx)}>
						<span class="vs-hang">{h.angle}</span>
						<b>{h.onscreen}</b>
						<small>“{h.spoken}”</small>
					</button>
				{/each}
			</div>
		</section>

		<!-- Second-by-Second Shot & Beat Sheet -->
		<section class="vs-card">
			<div class="vs-ch">
				<h3>Second-by-second shot sheet</h3>
				<small>Keep cuts under 3 seconds</small>
			</div>
			<div class="vs-beats">
				{#each bp.beats as b, idx (idx)}
					<div class="vs-beat">
						<span class="vs-btime">{b.time}</span>
						<div class="vs-bbody">
							<b>{b.shot}</b>
							<span class="vs-btext">On-screen: {idx === 0 && activeHook ? activeHook.onscreen : b.onscreen}</span>
							<p>“{idx === 0 && activeHook ? activeHook.spoken : b.spoken}”</p>
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Caption, Pinned Comment & Comment-to-DM Magnet -->
		<section class="vs-card">
			<div class="vs-ch">
				<h3>Caption, pinned comment &amp; DM magnet</h3>
				<small>Built to spike Hour-1 comments</small>
			</div>

			<div class="vs-box">
				<small>Caption</small>
				<p>{bp.caption}</p>
				<button class="vs-soft" onclick={() => copyText(bp?.caption ?? '', 'Caption copied')}><Icon name="copy" />Copy caption</button>
			</div>

			<div class="vs-box">
				<small>Pin this as your first comment</small>
				<p>{bp.pin_comment}</p>
				<button class="vs-soft" onclick={() => copyText(bp?.pin_comment ?? '', 'Pinned comment copied')}><Icon name="copy" />Copy comment</button>
			</div>

			{#if bp.dm_magnet?.keyword}
				<div class="vs-box mag">
					<small>Comment-to-DM Follower Magnet · Keyword: {bp.dm_magnet.keyword}</small>
					<p>{bp.dm_magnet.reply}</p>
					<button class="vs-neopop" onclick={activateMagnet} disabled={busy === 'dm' || dmSaved}>
						<Icon name={dmSaved ? 'check' : 'send'} />
						<span>{dmSaved ? `Active for "${bp.dm_magnet.keyword}"` : `Activate "${bp.dm_magnet.keyword}" auto-DM`}</span>
					</button>
				</div>
			{/if}

			<div class="vs-foot">
				<button class="vs-soft" onclick={copyFullScript}><Icon name="copy" />Copy full shoot script</button>
				{#if nextSlot}
					<button class="vs-neopop" onclick={saveToCalendar} disabled={busy === 'plan'}>
						<Icon name="cal" />
						<span>{busy === 'plan' ? 'Saving…' : `Schedule for ${slotLabel}`}</span>
					</button>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.vs {
		max-width: 680px;
		margin: 0 auto;
		display: grid;
		gap: 14px;
		padding-bottom: 32px;
	}
	.vs-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.vs-head h1 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 32px;
		line-height: 1.08;
		margin: 4px 0 6px;
	}
	.vs-head h1 em {
		font-style: italic;
		color: var(--g2);
	}
	.vs-head p {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink-2);
		line-height: 1.45;
	}
	.vs-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 15px;
		display: grid;
		gap: 12px;
	}
	.vs-ch {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.vs-ch h2,
	.vs-ch h3 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 21px;
		margin: 0;
	}
	.vs-ch small {
		font-size: 11.5px;
		color: var(--ink-3);
	}
	.vs-wins {
		display: grid;
		gap: 8px;
	}
	.vs-win {
		width: 100%;
		text-align: left;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--ink);
		cursor: pointer;
	}
	.vs-win:hover {
		border-color: var(--g1);
	}
	.vs-wl {
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.vs-wl b {
		font-size: 13px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.vs-wl small {
		font-size: 11.5px;
		color: var(--ok);
		font-family: var(--f-mono, ui-monospace, monospace);
	}
	.vs-wtag {
		font-size: 11px;
		font-weight: 700;
		padding: 5px 9px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--g1) 16%, var(--surface));
		color: var(--g1);
		white-space: nowrap;
	}
	.vs-field {
		display: grid;
		gap: 6px;
	}
	.vs-field label,
	.vs-lbl {
		font-size: 11.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.vs-field textarea,
	.vs-field input {
		width: 100%;
		padding: 10px 12px;
		border-radius: 11px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--ink);
		font-family: inherit;
		font-size: 14px;
	}
	.vs-row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	@media (max-width: 600px) {
		.vs-row2 {
			grid-template-columns: 1fr;
		}
	}
	.vs-goals {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 5px;
		padding: 3px;
		border-radius: 11px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
	}
	.vs-goals button {
		padding: 7px 6px;
		border-radius: 8px;
		border: 0;
		background: transparent;
		color: var(--ink-3);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.vs-goals button.on {
		background: var(--surface);
		color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.vs-neopop {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 10px 15px;
		border-radius: 7px;
		border: 0;
		background: #f4eef2;
		color: #110d11;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 3px 3px 0 var(--g2);
	}
	.vs-neopop:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.vs-soft {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: 8px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink-2);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		width: fit-content;
	}
	.vs-hero {
		border-radius: 20px;
		border: 1px solid color-mix(in oklab, var(--g1) 45%, var(--line));
		background:
			radial-gradient(240px 160px at 80% 0%, color-mix(in oklab, var(--g2) 20%, transparent), transparent 70%),
			linear-gradient(180deg, #1e1722 0%, #151018 100%);
		padding: 16px;
		display: grid;
		gap: 6px;
	}
	.vs-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		width: fit-content;
		padding: 4px 10px;
		border-radius: 99px;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--g1);
		background: color-mix(in oklab, var(--g1) 14%, transparent);
	}
	.vs-hero h2 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 27px;
		margin: 2px 0;
	}
	.vs-hero p {
		margin: 0;
		font-size: 13px;
		color: var(--ink-2);
		line-height: 1.45;
	}
	.vs-hooks {
		display: grid;
		gap: 8px;
	}
	.vs-hook {
		text-align: left;
		padding: 12px;
		border-radius: 13px;
		border: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--ink);
		display: grid;
		gap: 4px;
		cursor: pointer;
	}
	.vs-hook.picked {
		border-color: var(--g2);
		background: linear-gradient(120deg, color-mix(in oklab, var(--g2) 12%, var(--surface-2)), var(--surface-2));
	}
	.vs-hang {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--g3);
	}
	.vs-hook b {
		font-size: 14.5px;
		font-weight: 700;
	}
	.vs-hook small {
		font-size: 12.5px;
		color: var(--ink-2);
		line-height: 1.4;
	}
	.vs-beats {
		display: grid;
		gap: 9px;
	}
	.vs-beat {
		display: grid;
		grid-template-columns: 62px 1fr;
		gap: 10px;
		padding: 11px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
	}
	.vs-btime {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11.5px;
		font-weight: 700;
		color: var(--g1);
		padding-top: 2px;
	}
	.vs-bbody {
		display: grid;
		gap: 4px;
	}
	.vs-bbody b {
		font-size: 13.5px;
	}
	.vs-btext {
		font-size: 12px;
		font-weight: 600;
		color: var(--g3);
	}
	.vs-bbody p {
		margin: 0;
		font-size: 12.5px;
		color: var(--ink-2);
		line-height: 1.4;
	}
	.vs-box {
		padding: 12px;
		border-radius: 13px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		display: grid;
		gap: 7px;
	}
	.vs-box.mag {
		border-color: color-mix(in oklab, var(--g2) 38%, var(--line));
		background: linear-gradient(130deg, color-mix(in oklab, var(--g1) 10%, var(--surface-2)), var(--surface-2));
	}
	.vs-box small {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.vs-box p {
		margin: 0;
		font-size: 13px;
		color: var(--ink);
		line-height: 1.45;
		white-space: pre-line;
	}
	.vs-foot {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		padding-top: 4px;
	}
</style>
