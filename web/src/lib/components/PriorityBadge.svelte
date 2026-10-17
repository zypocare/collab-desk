<script lang="ts">
	import type { Priority } from '../priority';
	import { TIER_LABEL } from '../priority';
	import Icon from './Icon.svelte';

	let { p, compact = false }: { p: Priority; compact?: boolean } = $props();
</script>

<span class="prio prio-{p.tier}" title="Should you take it? {p.score}/100. {p.reasons.map((r) => r.text).join(' · ')}">
	{#if p.tier === 'top'}<Icon name="spark" />{/if}{TIER_LABEL[p.tier]}<b>{p.score}</b>
</span>
