<script lang="ts">
	import { qrMatrix, qrSvgPath, upiPaymentLink } from '../invoice';
	import { saveBlob } from '../download';
	import { toast } from '../ui.svelte';
	import Icon from './Icon.svelte';
	let { upiId, name, amount, note = '' }: { upiId: string; name: string; amount: number; note?: string } = $props();
	const link = $derived(upiPaymentLink(upiId, name, amount, note));
	const qr = $derived(link ? qrSvgPath(link) : null);
	let busy = $state(false);
	async function download() {
		if (!link || busy) return;
		busy = true;
		try {
			const matrix = qrMatrix(link);
			const scale = 10, border = 4;
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = (matrix.length + border * 2) * scale;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('Could not prepare the QR image.');
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = '#000';
			matrix.forEach((row, y) => row.forEach((dark, x) => {
				if (dark) ctx.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
			}));
			const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not save the QR image.')), 'image/png'));
			await saveBlob(blob, `upi-payment-${amount.toFixed(2)}.png`);
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not download the QR image.', 'alert');
		} finally { busy = false; }
	}
</script>

{#if qr}
	<figure class="upi-qr">
		<svg viewBox="-4 -4 {qr.size + 8} {qr.size + 8}" role="img" aria-label="UPI QR code for INR {amount.toFixed(2)} payable to {upiId.trim()}" shape-rendering="crispEdges">
			<rect x="-4" y="-4" width={qr.size + 8} height={qr.size + 8} fill="#fff" /><path d={qr.d} fill="#000" />
		</svg>
		<figcaption><span>Scan with any UPI app</span><button type="button" class="btn sm" disabled={busy} onclick={download}><Icon name="download" />Download UPI QR</button></figcaption>
	</figure>
{/if}

<style>
	.upi-qr { display: grid; justify-items: center; gap: 10px; margin: 0; max-width: 100%; }
	svg { display: block; width: 200px; height: 200px; max-width: 100%; border-radius: 8px; background: #fff; }
	figcaption { display: grid; justify-items: center; gap: 10px; font-size: 12px; text-align: center; }
</style>
