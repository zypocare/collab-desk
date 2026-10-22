<script lang="ts">
	import { goto } from '$app/navigation';

	// Team & approvals lives in Settings now, with the rest of the brand's settings.
	$effect(() => {
		goto('/brand/settings?s=team', { replace: true });
	});
</script>
