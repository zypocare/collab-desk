<script lang="ts">
	import type { LayoutProps } from './$types';
	import BusinessTabs from '#lib/components/BusinessTabs.svelte';

	let { children }: LayoutProps = $props();
</script>

<BusinessTabs />
{@render children()}
