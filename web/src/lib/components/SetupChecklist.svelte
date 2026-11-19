<script module lang="ts">
	let settledOnce = false;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { confetti, copyText, toast, ui } from '#lib/ui.svelte.ts';
	import { errMessage, firstName } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import StorySheet from '#lib/components/StorySheet.svelte';

	// 60-Second Progressive Onboarding ("Lite Mode") inside Miracle's existing .ob card design.
	// Replaces bouncing new creators across 7 settings screens with 3 rapid inline steps:
	// (1) Identity & 1-tap rate preset -> (2) UPI + Bio Storefront -> (3) Copy link & Share Story.
	let { phone = false }: { phone?: boolean } = $props();

	const START_RATES: Record<string, number> = { Reel: 25000, Story: 6000, 'Static post': 12000, Carousel: 16000, 'UGC video': 15000 };
	const PRESETS = [
		{ id: 'nano', label: 'Nano (1k–10k)', sub: 'Reel ₹2k · Story ₹500', rates: { Reel: 2000, Story: 500, 'Static post': 1200, Carousel: 1500, 'UGC video': 1500 } },
		{ id: 'micro', label: 'Micro (10k–50k)', sub: 'Reel ₹8k · Story ₹2k', rates: { Reel: 8000, Story: 2000, 'Static post': 4500, Carousel: 6000, 'UGC video': 5000 } },
		{ id: 'mid', label: 'Mid (50k+)', sub: 'Reel ₹25k · Story ₹6k', rates: { Reel: 25000, Story: 6000, 'Static post': 12000, Carousel: 16000, 'UGC video': 15000 } }
	];

	const s = $derived(studio.settings);
	const key = (k: string) => `cd-setup-${k}-${s?.id ?? ''}`;
	let bio = $state(false);
	let hidden = $state(true);
	let settled = $state(settledOnce);
	let storyOpen = $state(false);

	// Inline quick-start form state
	let niche = $state('');
	let city = $state('');
	let presetId = $state('micro');
	let upiId = $state('');
	let firstLinkTitle = $state('');
	let firstLinkUrl = $state('');
	let saving = $state(false);
	let step = $state<1 | 2 | 3>(1);
	let initDone = $state(false);

	onMount(() => {
		if (settled) return;
		const t = setTimeout(() => (settled = settledOnce = true), Math.max(0, 1500 - performance.now()));
		return () => clearTimeout(t);
	});

	$effect(() => {
		if (!s) return;
		try {
			bio = localStorage.getItem(key('bio')) === '1';
			hidden = localStorage.getItem(key('hide')) === '1';
		} catch {
			hidden = false;
		}
		if (!initDone) {
			niche = s.niche || '';
			city = s.city || '';
			upiId = s.upi_id || '';
			// Automatically jump to the first incomplete step
			if (!step1Done) step = 1;
			else if (!step2Done) step = 2;
			else step = 3;
			initDone = true;
		}
	});

	function remember(k: string) {
		try {
			localStorage.setItem(key(k), '1');
		} catch {
			/* storage blocked */
		}
	}

	const ratesSet = $derived(
		!!s &&
			(studio.packages.some((p) => p.active) ||
				Object.keys({ ...START_RATES, ...s.rates }).some((k) => Number(s.rates?.[k] ?? 0) !== (START_RATES[k] ?? 0)))
	);
	const link = $derived((s?.site_url ?? '').replace(/\/$/, ''));
	const bare = $derived(link.replace(/^https?:\/\//, ''));

	const step1Done = $derived(!!(s?.niche?.trim() && s?.city?.trim()) && ratesSet);
	const step2Done = $derived(!!(s?.upi_id?.trim() || s?.bank_details?.trim()));
	const step3Done = $derived(bio || studio.collabs.some((c) => c.source === 'brand_page') || studio.collabs.length > 0);

	const doneCount = $derived((step1Done ? 1 : 0) + (step2Done ? 1 : 0) + (step3Done ? 1 : 0));
	const owner = $derived(studio.me?.team_role === 'owner');
	const show = $derived((settled || studio.extras) && studio.loaded && owner && !hidden && doneCount < 3);

	async function saveStep1(e: SubmitEvent) {
		e.preventDefault();
		if (!s) return;
		if (!niche.trim() || !city.trim()) return toast('Add your niche and city to continue.', 'alert');
		const picked = PRESETS.find((p) => p.id === presetId) ?? PRESETS[1];
		saving = true;
		const { error } = await supabase
			.from('creator_settings')
			.update({ niche: niche.trim(), city: city.trim(), rates: picked.rates })
			.eq('id', s.id);
		saving = false;
		if (error) return toast(errMessage(error), 'alert');
		s.niche = niche.trim();
		s.city = city.trim();
		s.rates = { ...picked.rates };
		toast('Profile & rates saved');
		step = 2;
	}

	async function saveStep2(e: SubmitEvent) {
		e.preventDefault();
		if (!s) return;
		if (!upiId.trim()) return toast('Enter your UPI ID (e.g. name@okaxis) for 0%-fee payments.', 'alert');
		saving = true;
		const { error } = await supabase.from('creator_settings').update({ upi_id: upiId.trim() }).eq('id', s.id);
		if (error) {
			saving = false;
			return toast(errMessage(error), 'alert');
		}
		s.upi_id = upiId.trim();

		// Optional first storefront link if entered
		const rawUrl = firstLinkUrl.trim();
		if (firstLinkTitle.trim() && rawUrl) {
			const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
			await supabase.from('page_links').insert({
				title: firstLinkTitle.trim().slice(0, 60),
				url: normalized,
				kind: 'link',
				position: 0
			});
		}
		saving = false;
		toast('UPI & Bio Storefront ready');
		step = 3;
	}

	function copyBio() {
		copyText(link, 'Bio link copied! Paste it in your Instagram bio.');
		bio = true;
		remember('bio');
		confetti();
	}

	function hide() {
		hidden = true;
		remember('hide');
	}
</script>

{#if show && s}
	<section class="ob ob-quick" class:ob-ph={phone} aria-label="60-second quick start">
		<header class="ob-h">
			<div class="ob-t">
				<span class="ob-eb">60-Second Quick Start · {doneCount} of 3 done</span>
				<h2>Launch your page, <em>{firstName(s.display_name) || 'you'}</em></h2>
			</div>
			<button class="ob-x" onclick={hide} aria-label="Hide quick start"><Icon name="x" /></button>
		</header>

		<div class="ob-bar" style="--n:3" aria-hidden="true">
			<i class:on={step1Done || step > 1}></i>
			<i class:on={step2Done || step > 2}></i>
			<i class:on={step3Done}></i>
		</div>

		<div class="ob-tabs" role="tablist" aria-label="Quick start steps">
			<button type="button" role="tab" aria-selected={step === 1} class:on={step === 1} class:done={step1Done} onclick={() => (step = 1)}>
				<span>{step1Done ? '✓' : '1'}</span> Niche &amp; Rates
			</button>
			<button type="button" role="tab" aria-selected={step === 2} class:on={step === 2} class:done={step2Done} onclick={() => (step = 2)}>
				<span>{step2Done ? '✓' : '2'}</span> UPI &amp; Store
			</button>
			<button type="button" role="tab" aria-selected={step === 3} class:on={step === 3} class:done={step3Done} onclick={() => (step = 3)}>
				<span>{step3Done ? '✓' : '3'}</span> Share Live
			</button>
		</div>

		{#if step === 1}
			<form class="ob-pane" onsubmit={saveStep1}>
				<div class="ob-row2">
					<input class="inp" placeholder="Your niche (e.g. Food &amp; Lifestyle)" bind:value={niche} required />
					<input class="inp" placeholder="Your city (e.g. Bengaluru)" bind:value={city} required />
				</div>
				<div class="ob-presets" role="radiogroup" aria-label="Starter rate card">
					{#each PRESETS as p (p.id)}
						<button type="button" class="ob-pre" class:on={presetId === p.id} onclick={() => (presetId = p.id)}>
							<b>{p.label}</b>
							<small>{p.sub}</small>
						</button>
					{/each}
				</div>
				<div class="ob-foot">
					<button type="submit" class="ob-neo" disabled={saving}>{saving ? 'Saving…' : 'Save & next'}<Icon name="chevR" /></button>
					<a class="ob-skip" href="/studio/settings?s=profile">Connect Instagram &rarr;</a>
				</div>
			</form>
		{:else if step === 2}
			<form class="ob-pane" onsubmit={saveStep2}>
				<input class="inp" placeholder="Your UPI ID (e.g. name@okaxis) — 0% fee" bind:value={upiId} required />
				<div class="ob-row2">
					<input class="inp" placeholder="First bio link title (optional)" bind:value={firstLinkTitle} />
					<input class="inp" placeholder="https://youtube.com/@you" bind:value={firstLinkUrl} />
				</div>
				<div class="ob-foot">
					<button type="submit" class="ob-neo" disabled={saving}>{saving ? 'Saving…' : 'Enable UPI & next'}<Icon name="chevR" /></button>
					<button type="button" class="ob-skip" onclick={() => (step = 3)}>Skip for now</button>
				</div>
			</form>
		{:else}
			<div class="ob-pane">
				<div class="ob-link-box">
					<div>
						<small>Your live Media Kit &amp; Bio Storefront</small>
						<b>{bare || 'miracleapp.live'}</b>
					</div>
					<button type="button" class="ob-neo" onclick={copyBio}><Icon name="copy" />Copy link</button>
				</div>
				<div class="ob-share-row">
					<button type="button" class="btn sm grad" onclick={() => (storyOpen = true)}><Icon name="insta" />Share to IG Story</button>
					<button type="button" class="btn sm" onclick={() => (ui.newCollab = true)}><Icon name="plus" />Add first collab</button>
				</div>
			</div>
		{/if}
	</section>
{/if}

{#if storyOpen}<StorySheet onclose={() => (storyOpen = false)} />{/if}

<style>
	.ob-tabs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 6px;
		margin: 12px 0;
	}
	.ob-tabs button {
		appearance: none;
		border: 1px solid var(--line);
		background: color-mix(in oklab, var(--surface) 80%, transparent);
		color: var(--ink-3);
		font: 700 11.5px/1.2 var(--f-body);
		padding: 8px 6px;
		border-radius: 10px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		transition: border-color .18s, color .18s, background .18s;
	}
	.ob-tabs button span {
		width: 17px;
		height: 17px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 10px;
		background: rgba(255, 255, 255, .08);
	}
	.ob-tabs button.on {
		border-color: var(--g1);
		color: var(--ink);
		background: color-mix(in oklab, var(--g1) 16%, var(--surface));
	}
	.ob-tabs button.done span {
		background: var(--h-live);
		color: #0e1610;
	}
	.ob-pane {
		display: grid;
		gap: 10px;
	}
	.ob-row2 {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.ob-presets {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 7px;
	}
	.ob-pre {
		appearance: none;
		text-align: left;
		border: 1px solid var(--line);
		background: var(--surface);
		color: var(--ink);
		padding: 9px 10px;
		border-radius: 12px;
		cursor: pointer;
		display: grid;
		gap: 2px;
		font: inherit;
		transition: border-color .18s, background .18s;
	}
	.ob-pre b { font-size: 11.5px; font-weight: 700; }
	.ob-pre small { font-size: 10.5px; color: var(--ink-3); }
	.ob-pre.on {
		border-color: var(--g2);
		background: color-mix(in oklab, var(--g2) 14%, var(--surface));
	}
	.ob-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 2px;
	}
	.ob-skip {
		appearance: none;
		border: 0;
		background: none;
		color: var(--ink-3);
		font: 600 12px/1.2 var(--f-body);
		text-decoration: none;
		cursor: pointer;
	}
	.ob-skip:hover { color: var(--ink); }
	.ob-link-box {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--surface);
	}
	.ob-link-box small { display: block; font-size: 11px; color: var(--ink-3); }
	.ob-link-box b { font-size: 13px; color: var(--ink); word-break: break-all; }
	.ob-share-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	@media (max-width: 560px) {
		.ob-row2, .ob-presets { grid-template-columns: 1fr; }
	}
</style>
