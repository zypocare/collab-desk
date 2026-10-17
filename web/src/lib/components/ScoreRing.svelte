<script lang="ts">
	import type { Verdict } from '../decide';

	// The 0-100 score as a ring that fills up when it appears.
	let { score, verdict, size = 64 }: { score: number; verdict: Verdict; size?: number } = $props();
	const R = 42;
	const C = 2 * Math.PI * R;
</script>

<span class="score-ring v-{verdict}" style="--sz:{size}px" role="img" aria-label="Score {score} out of 100">
	<svg viewBox="0 0 100 100" aria-hidden="true">
		<circle class="sr-bg" cx="50" cy="50" r={R} />
		<circle class="sr-fg" cx="50" cy="50" r={R} style="--len:{C};--off:{C * (1 - score / 100)}" />
	</svg>
	<b>{score}</b>
</span>
