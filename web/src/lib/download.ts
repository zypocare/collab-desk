// Saving a file the app made (PDFs, CSVs, zips, calendar files). A normal download link doesn't work
// in the iPhone/iPad Home Screen app, so there the share sheet opens instead ("Save to Files", Mail,
// WhatsApp…). The native app uses the phone's file saver; other browsers use a download link.
import { isIOS } from './back';
import { isNative, saveNativeFile } from './native';
import { toast } from './ui.svelte';

export async function saveBlob(blob: Blob, name: string) {
	if (isNative()) {
		const result = await saveNativeFile(blob, name);
		if (result === 'saved') toast('Saved to Downloads', 'download');
		return;
	}
	if (isIOS() && typeof navigator.share === 'function') {
		const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
		if (navigator.canShare?.({ files: [file] })) {
			try {
				await navigator.share({ files: [file], title: name });
				return;
			} catch (e) {
				// She closed the share sheet: nothing to do. Anything else: fall back to opening the file.
				if ((e as Error)?.name === 'AbortError') return;
			}
		}
		const url = URL.createObjectURL(blob);
		window.open(url, '_blank') ?? (location.href = url);
		setTimeout(() => URL.revokeObjectURL(url), 60000);
		return;
	}
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
