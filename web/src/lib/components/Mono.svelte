<script lang="ts">
	import { hueOf, initials } from '../util';

	let { name, size = '' }: { name: string; size?: '' | 'sm' | 'lg' } = $props();
</script>

<span class="mono tint {size}" style="--hue:var(--m{hueOf(name)})" aria-hidden="true">{initials(name)}</span>
