<script lang="ts">
	import CommentDmSettings from '#lib/components/CommentDmSettings.svelte';
</script>

<svelte:head><title>Instagram Automations · Miracle</title></svelte:head>

<div class="au">
	<header class="au-head">
		<h1>Instagram Automations</h1>
		<p>Auto-reply publicly to comments, send instant DMs on keywords, and respond to Story replies automatically — free for creators.</p>
	</header>

	<CommentDmSettings />
</div>

<style>
	.au {
		max-width: 680px;
		margin: 0 auto;
		display: grid;
		gap: 14px;
		padding-bottom: 32px;
	}
	.au-head h1 {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 30px;
		line-height: 1.08;
		margin: 0;
	}
	.au-head p {
		margin: 5px 0 0;
		font-size: 13.5px;
		color: var(--ink-2);
		line-height: 1.45;
	}
</style>
