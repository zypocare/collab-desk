<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';
	import NewTicket from '#lib/components/help/NewTicket.svelte';
</script>

<svelte:head><title>Contact support · Miracle</title></svelte:head>

<NewTicket side="creator" base="/studio/help" name={studio.settings?.display_name ?? ''} />
