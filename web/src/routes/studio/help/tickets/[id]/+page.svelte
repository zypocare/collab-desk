<script lang="ts">
	import { page } from '$app/state';
	import TicketThread from '#lib/components/help/TicketThread.svelte';
</script>

<svelte:head><title>Ticket · Miracle</title></svelte:head>

{#key page.params.id}<TicketThread id={page.params.id ?? ''} base="/studio/help" />{/key}
