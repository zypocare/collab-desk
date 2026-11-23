<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { InsightsData } from '../insights';
	import { headerDrift } from '../homeMotion';
	import { igImg } from '../igImg';
	import { compact } from '../util';
	import DiwaliLayer from './DiwaliLayer.svelte';
	import BirthdayLayer from './BirthdayLayer.svelte';
	import ProfileEngagement from './ProfileEngagement.svelte';
	let { date, name, greet, note, birthday = false, festival, picture, followers, insights, metricLabel, metrics, chips, actions }: {
		date: Date; name: string; greet: string; note: string; birthday?: boolean; festival: boolean;
		picture?: string | null; followers: number; insights?: InsightsData | null; metricLabel: string;
		metrics: Snippet<[number]>; chips: Snippet; actions: Snippet;
	} = $props();
	let orbMode = $state(0);
	function cycleOrbMode() { orbMode = (orbMode + 1) % 3; }
</script>

<section class="ht" class:dw-on={festival && !birthday} class:bd-on={birthday} use:headerDrift>
	<div class="ht-glow" aria-hidden="true"><i></i><i></i><i></i></div>
	{#if birthday}<BirthdayLayer />{:else if festival}<DiwaliLayer />{/if}
	{#if note}
		<div class="fest-pill-wrap">
			<span class="fest-banner">{birthday ? '🎂' : '🪔'} {note}</span>
		</div>
	{/if}
	<div class="ht-top-row">
		<div class="ht-copy">
			<p class="ht-date">{date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
			<h1 class="ht-hi"><span>{greet},</span><em style:--name-length={Math.max(1, Array.from(name).length)}>{name}</em></h1>
		</div>
		<button type="button" class="ht-orb" onclick={cycleOrbMode} aria-label={metricLabel}>
			<span class="orb-ring" aria-hidden="true"></span>
			<span class="orb-ring-2" aria-hidden="true"></span>
			<span class="orb-in">
				{#if orbMode === 0 && picture}
					<img class="orb-pic" src={igImg(picture)} alt="" />
				{:else}
					{@render metrics(orbMode)}
				{/if}
			</span>
			{#if orbMode === 0 && picture}
				<span class="orb-badge"><b>{compact(followers)}</b><span>followers</span></span>
			{/if}
			<span class="orb-mode-dots" aria-hidden="true">
				<i class:on={orbMode === 0}></i><i class:on={orbMode === 1}></i><i class:on={orbMode === 2}></i>
			</span>
			<span class="orb-spark s1" aria-hidden="true"></span><span class="orb-spark s2" aria-hidden="true"></span><span class="orb-spark s3" aria-hidden="true"></span>
		</button>
	</div>

	<ProfileEngagement {insights} />

	<div class="ht-chips">{@render chips()}</div>
	<div class="qa-strip">{@render actions()}</div>
</section>
