<script lang="ts">
	// Miracle's mark (the same as the main app's): the looped Scorpio sign as two lines of light,
	// one in the text colour and one in the theme gradient, slanted like italic type.
	let { size = 34 }: { size?: number } = $props();
	const id = $props.id();
	const D =
		'M64 128C92 104 132 112 144 156C154 220 158 330 156 392C155 420 182 420 182 392C182 300 176 200 196 160C220 104 290 104 300 160C310 220 312 330 310 392C309 420 336 420 336 392C336 300 330 200 350 160C374 104 444 104 452 160C460 230 456 330 452 392C450 440 500 440 540 360M499 384L540 360L545 408';
</script>

<svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" class="mk"
	><defs
		><linearGradient id="lg-{id}" gradientUnits="userSpaceOnUse" x1="60" y1="100" x2="560" y2="440"
			><stop offset="0" style="stop-color:var(--g1)" /><stop offset=".52" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g3)" /></linearGradient
		></defs
	><g transform="translate(256 256) scale(1.04) translate(-256 -256)"
		><g transform="translate(256 256) scale(.79) skewX(-13) translate(-304.5 -266)" fill="none" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"
			><path transform="translate(-13 -10)" stroke="currentColor" d={D} /><path transform="translate(13 10)" stroke="url(#lg-{id})" d={D} /></g
		></g
	></svg
>

<style>
	.mk { flex: none; display: block; }
</style>
