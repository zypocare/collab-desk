<script lang="ts">
	import { ICONS } from '../icons';

	let { name, class: cls = '' }: { name: string; class?: string } = $props();
</script>

<svg
	class="ic {cls}"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true">{@html ICONS[name] ?? ''}</svg
>
