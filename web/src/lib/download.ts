// Saving a file the app made (PDFs, CSVs, zips, calendar files). A normal download link doesn't work
// in the iPhone/iPad Home Screen app, so there the share sheet opens instead ("Save to Files", Mail,
// WhatsApp…). Everywhere else it's a plain download.
import { isIOS } from './back';

export async function saveBlob(blob: Blob, name: string) {
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
