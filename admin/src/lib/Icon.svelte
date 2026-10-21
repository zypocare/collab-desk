<script lang="ts">
	import { ICONS } from './icons.ts';

	let { name }: { name: string } = $props();
</script>

<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html ICONS[name] ?? ''}</svg>
