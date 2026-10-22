<script lang="ts">
	import { onMount } from 'svelte';
	import { portal } from '../portal';
	import { studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { copyText, toast } from '../ui.svelte';
	import { errMessage, initials, waShare } from '../util';
	import { saveBlob } from '../download';
	import { DEFAULT_LOOK, drawQr, loadPhoto, look } from '../brandQr';
	import type { QrCode } from '../types';
	import Icon from './Icon.svelte';

	// My page: her QR code, ready to share. Just the code and the ways to send it; its look and
	// any extra codes are changed in Settings > QR codes.
	let { onclose }: { onclose: () => void } = $props();
	const s = $derived(studio.settings!);
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	const handle = $derived(studio.ig?.username || s.handle || '');
	const name = $derived(s.display_name || handle);
	let code = $state<QrCode | null>(null);
	let photo = $state<HTMLImageElement | null>(null);
	let canvas = $state<HTMLCanvasElement>();
	const url = $derived(code ? `${link}/q/${code.slug}` : '');
	const extras = () => ({ handle, initials: initials(name || 'N').slice(0, 2), photo });

	onMount(async () => {
		// Her first code (the brand-page one); made now if she has none yet.
		const { data, error } = await supabase.from('qr_codes').select('*').order('created_at', { ascending: true }).limit(1);
		if (error) return toast(`Couldn't load your QR code: ${errMessage(error)}`, 'alert');
		code = (data?.[0] as QrCode | undefined) ?? null;
		if (!code) {
			const r = await supabase.from('qr_codes').insert({ name: 'My brand page', style: DEFAULT_LOOK }).select('*').single();
			if (r.error) return toast(`Couldn't make your QR code: ${errMessage(r.error)}`, 'alert');
			code = r.data as QrCode;
		}
		photo = await loadPhoto(studio.ig?.profile_picture_url);
	});
	$effect(() => {
		if (!canvas || !code) return;
		const q = code;
		drawQr(canvas, url, look(q.style), extras());
		document.fonts?.ready.then(() => canvas && drawQr(canvas, url, look(q.style), extras()));
	});

	function png(): Promise<Blob | null> {
		if (!code) return Promise.resolve(null);
		const c = document.createElement('canvas');
		drawQr(c, url, look(code.style), extras(), 2000);
		return new Promise((res) => {
			try {
				c.toBlob((b) => res(b), 'image/png');
			} catch {
				res(null);
			}
		});
	}
	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
	async function share() {
		const b = await png();
		const file = b ? new File([b], 'my-qr-code.png', { type: 'image/png' }) : null;
		try {
			if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: `${name} · collaborations` });
			else await navigator.share({ url, title: `${name} · collaborations` });
		} catch {
			/* she closed the share sheet */
		}
	}
	async function save() {
		const b = await png();
		if (b) saveBlob(b, 'my-qr-code.png');
		else toast("Couldn't make the picture just now", 'alert');
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog qs" role="dialog" aria-modal="true" aria-labelledby="qs-title">
		<h2 id="qs-title">Your QR code</h2>
		<p>Brands scan it to see your page and send a request.</p>
		<div class="qs-code">{#if code}<canvas bind:this={canvas} aria-label="Your QR code"></canvas>{:else}<span class="spinner"></span>{/if}</div>
		<div class="qs-acts">
			{#if canShare}<button class="btn grad lg" onclick={share} disabled={!code}><Icon name="share" />Share QR code</button>{/if}
			<button class="btn" class:grad={!canShare} class:lg={!canShare} onclick={save} disabled={!code}><Icon name="download" />Save image</button>
			<button class="btn" onclick={() => copyText(url, 'Link copied')} disabled={!code}><Icon name="copy" />Copy link</button>
			<a class="btn wa" href={waShare('', `${name}: rates, packages and collab requests in one place. ${url}`)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp</a>
		</div>
	</div>
</div>

<style>
	.qs { width: min(440px, 100%); }
	.qs p { margin: 4px 0 14px; color: var(--ink-3); }
	.qs-code { display: grid; place-items: center; min-height: 280px; }
	.qs-code canvas { width: min(300px, 78vw); height: auto; border-radius: 22px; box-shadow: 0 18px 40px -22px rgba(0, 0, 0, .55); }
	.qs-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px; padding-right: 4px; }
	.qs-acts :global(.btn) { justify-content: center; }
	.qs-acts :global(.btn.lg) { grid-column: 1 / -1; }
</style>
