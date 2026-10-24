<script lang="ts">
	import { page } from '$app/state';
	import HelpArticle from '#lib/components/help/HelpArticle.svelte';
</script>

<svelte:head><title>Help · Miracle</title></svelte:head>

{#key page.params.slug}<HelpArticle slug={page.params.slug ?? ''} side="brand" base="/brand/help" />{/key}
