<script lang="ts">
	import { initials } from '../util';

	// Her Instagram photo inside the animated ring; her initials until it loads or if it fails.
	let { name, src = '', size }: { name: string; src?: string | null; size?: string } = $props();

	let failed = $state(false);
	let loaded = $state(false);
	$effect(() => {
		void src;
		failed = false;
		loaded = false;
	});
</script>

<span class="ring" style={size ? `--sz:${size}` : undefined}>
	<span>
		{#if src && !failed}
			<img {src} alt="" class="av-img" class:in={loaded} referrerpolicy="no-referrer" onload={() => (loaded = true)} onerror={() => (failed = true)} />
		{/if}
		{#if !src || failed || !loaded}<i class="av-txt">{initials(name)}</i>{/if}
	</span>
</span>
