<script lang="ts">
	import { page } from '$app/state';
	import { submitBrandApplication } from '#lib/brandOs.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	const brandSlug = $derived(page.params.brand ?? 'brand');
	const displayBrand = $derived(brandSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));

	let name = $state('');
	let handle = $state('');
	let city = $state('');
	let niche = $state('');
	let followers = $state('');
	let engagement = $state('');
	let reelRate = $state('');
	let pitch = $state('');
	let busy = $state(false);
	let submitted = $state(false);

	async function send(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim() || !handle.trim()) return toast('Enter your name and Instagram handle', 'alert');
		busy = true;
		try {
			await submitBrandApplication({
				brandSlug,
				name: name.trim(),
				handle: handle.trim(),
				city: city.trim(),
				niche: niche.trim(),
				followers: Number(followers) || 0,
				engagement: Number(engagement) || 0,
				reelRate: Number(reelRate) || 0,
				pitch: pitch.trim()
			});
			submitted = true;
			toast('Application sent!', 'check');
		} catch (err) {
			toast(errMessage(err), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Collab with {displayBrand} · Miracle</title></svelte:head>

<div class="af-page">
	<div class="af-wrap">
		<section class="af-vault">
			<span class="af-eb">Inbound Creator Application · Miracle</span>
			<h1>Collab with <em>{displayBrand}</em></h1>
			<p class="af-sub">Share your Instagram stats and Reel rate below. The {displayBrand} team reviews every creator directly on Miracle.</p>

			{#if submitted}
				<div class="af-done">
					<Icon name="check" />
					<b>Application received!</b>
					<small>{displayBrand} now has your handle, stats, and rate in their Miracle shortlist.</small>
				</div>
			{:else}
				<form class="af-form" onsubmit={send}>
					<div class="af-two">
						<label><span>Your name *</span><input class="af-inp" required placeholder="e.g. Ananya Rao" bind:value={name} /></label>
						<label><span>Instagram @handle *</span><input class="af-inp" required placeholder="@ananyarao" bind:value={handle} /></label>
					</div>
					<div class="af-two">
						<label><span>City</span><input class="af-inp" placeholder="Bengaluru" bind:value={city} /></label>
						<label><span>Niche</span><input class="af-inp" placeholder="Skincare, Lifestyle" bind:value={niche} /></label>
					</div>
					<div class="af-three">
						<label><span>Followers</span><input class="af-inp" type="number" min="0" placeholder="25000" bind:value={followers} /></label>
						<label><span>Engagement %</span><input class="af-inp" type="number" step="0.1" min="0" max="100" placeholder="4.5" bind:value={engagement} /></label>
						<label><span>1 Reel rate (₹)</span><input class="af-inp" type="number" min="0" placeholder="12000" bind:value={reelRate} /></label>
					</div>
					<label><span>Quick pitch / content idea</span><textarea class="af-ta" rows="3" placeholder="Tell the brand what kind of Reel you'd love to create…" bind:value={pitch}></textarea></label>
					<button type="submit" class="af-grad" disabled={busy}>
						{#if busy}<span class="spinner"></span>Sending…{:else}Submit application{/if}
					</button>
				</form>
			{/if}
		</section>
	</div>
</div>

<style>
	.af-page { min-height: 100vh; background: #0d0a0e; color: #faf7fc; padding: 28px 16px; }
	.af-wrap { max-width: 560px; margin: 0 auto; }
	.af-vault {
		border-radius: 24px; padding: 22px;
		background: linear-gradient(165deg, #211626 0%, #141017 100%);
		border: 1px solid rgba(242, 90, 144, 0.28);
		display: grid; gap: 14px;
	}
	.af-eb {
		display: inline-block; font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em; text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text; -webkit-text-fill-color: transparent;
	}
	h1 { margin: 0; font: 400 32px/1.08 var(--f-serif, Georgia, serif); }
	h1 em { font-style: italic; background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
	.af-sub { margin: 0; font-size: 13px; color: #cfc6d6; line-height: 1.5; }
	.af-form { display: grid; gap: 12px; }
	.af-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
	.af-three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
	@media (max-width: 520px) { .af-two, .af-three { grid-template-columns: 1fr; } }
	.af-form label { display: grid; gap: 5px; }
	.af-form span { font: 700 10px/1 var(--f-mono, ui-monospace, monospace); text-transform: uppercase; letter-spacing: 0.08em; color: #8f8499; }
	.af-inp, .af-ta {
		width: 100%; padding: 11px 13px; box-sizing: border-box; border-radius: 12px;
		background: rgba(12, 9, 14, 0.92); border: 1px solid rgba(255, 255, 255, 0.16);
		color: #faf7fc; font: 400 15px/1.35 var(--f-body, system-ui, sans-serif); outline: none;
	}
	.af-inp:focus, .af-ta:focus { border-color: #f25a90; }
	.af-grad {
		min-height: 48px; border: 0; border-radius: 0;
		background: linear-gradient(135deg, #9c7bff, #f25a90 52%, #ffae6b);
		color: #120b14; font: 800 12.5px/1 var(--f-body, system-ui, sans-serif);
		letter-spacing: 0.09em; text-transform: uppercase;
		box-shadow: 3.5px 3.5px 0 0 #5b3b99; cursor: pointer;
	}
	.af-done {
		padding: 18px; border-radius: 16px; background: rgba(60, 226, 155, 0.12);
		border: 1px solid rgba(60, 226, 155, 0.35); display: grid; gap: 6px; justify-items: start;
	}
	.af-done small { color: #cfc6d6; font-size: 13px; }
</style>
