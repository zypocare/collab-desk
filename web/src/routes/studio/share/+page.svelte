<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { ui } from '#lib/ui.svelte.ts';

	// Android "Share → Miracle": the shared message or screenshot opens in Add collab, already read.
	onMount(async () => {
		const q = page.url.searchParams;
		if (q.has('shared')) {
			// Kept by the app's service worker for this moment (a screenshot can't travel in the address).
			try {
				const c = await caches.open('shared');
				const [text, shot, audio] = await Promise.all([c.match('/__shared/text'), c.match('/__shared/shot'), c.match('/__shared/audio')]);
				ui.pasteText = text ? await text.text() : '';
				if (shot) {
					const blob = await shot.blob();
					ui.pasteImage = new File([blob], 'shared-screenshot', { type: blob.type || 'image/jpeg' });
				}
				if (audio) {
					const blob = await audio.blob();
					ui.pasteAudio = new File([blob], 'shared-voice-note.ogg', { type: blob.type || 'audio/ogg' });
				}
				await caches.delete('shared');
			} catch {
				/* opens empty */
			}
		} else if (q.has('nativeAudio')) {
			try {
				const bridge = (window as unknown as { MiracleShare?: { consumeSharedAudio?: () => string } }).MiracleShare;
				const raw = bridge?.consumeSharedAudio?.() ?? '';
				if (raw) {
					const payload = JSON.parse(raw) as { name?: string; mime?: string; data?: string };
					if (payload.data) {
						const bin = atob(payload.data);
						const bytes = new Uint8Array(bin.length);
						for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
						const mime = payload.mime || 'audio/ogg';
						ui.pasteAudio = new File([bytes], payload.name || 'shared-voice-note.ogg', { type: mime });
					}
				}
			} catch {
				/* opens empty */
			}
		} else ui.pasteText = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n').trim();
		ui.newCollab = true;
		goto('/studio/collabs', { replaceState: true });
	});
</script>

<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
