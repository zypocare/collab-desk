<script lang="ts">
	import { phone } from '#lib/phone.svelte.ts';
	import { studio } from '#lib/studio.svelte.ts';
	import PhoneToday from '#lib/components/PhoneToday.svelte';
	import LaptopToday from '#lib/components/LaptopToday.svelte';
</script>

<svelte:head><title>Today · {studio.settings?.app_name}</title></svelte:head>

{#if phone.on}
	<PhoneToday />
{:else}
	<LaptopToday />
{/if}
