<script lang="ts">
	// What the AI is doing right now: a glowing orb, the step, and moving dots.
	let { label = 'Thinking' }: { label?: string } = $props();
</script>

<span class="ai-thinking" role="status"><span class="ai-orb" aria-hidden="true"></span><span class="ai-shine">{label}</span><span class="ai-dots" aria-hidden="true"><i></i><i></i><i></i></span></span>
