<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';

	// Whether other creators on Miracle can invite her to a collab reel (Grow).
	const on = $derived(studio.settings?.collab_invites !== false);
</script>

<section class="panel rv" style="--i:5">
	<div class="panel-h"><h2>Collab reels</h2><small>from other creators on Miracle</small></div>
	<div class="switch-row" style="border-top:0">
		<div><b>Let other creators invite me</b><small>They see you in Grow when you're listed and in their niche. You say yes or no to each invite.</small></div>
		<input type="checkbox" class="tgl" checked={on} aria-label="Let other creators invite me to collab reels" onchange={(e) => saveSettings({ collab_invites: (e.currentTarget as HTMLInputElement).checked })} />
	</div>
</section>
