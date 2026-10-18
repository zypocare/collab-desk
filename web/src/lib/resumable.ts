// Uploads that survive a bad network: the file goes up in 6 MB pieces (Supabase's resumable
// uploads), retries on its own, and carries on from the last piece if the signal drops, or even
// after the app is closed and opened again with the same file.
import * as tus from 'tus-js-client';
import { supabase } from './supabase';

export async function uploadResumable(bucket: string, path: string, file: Blob, opts: { type?: string; onProgress?: (pct: number) => void; signal?: AbortSignal } = {}) {
	const { data } = await supabase.auth.getSession();
	const token = data.session?.access_token;
	if (!token) throw new Error('Sign in again to upload.');
	const url = import.meta.env.VITE_SUPABASE_URL as string;
	return new Promise<void>((resolve, reject) => {
		const up = new tus.Upload(file, {
			endpoint: `${url.replace(/\/$/, '')}/storage/v1/upload/resumable`,
			retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
			headers: { authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, 'x-upsert': 'false' },
			uploadDataDuringCreation: true,
			removeFingerprintOnSuccess: true,
			metadata: { bucketName: bucket, objectName: path, contentType: opts.type || (file as File).type || 'application/octet-stream', cacheControl: '3600' },
			// Supabase needs exactly 6 MB pieces.
			chunkSize: 6 * 1024 * 1024,
			onProgress: (sent, total) => opts.onProgress?.(total ? Math.round((sent / total) * 100) : 0),
			onError: (e) => reject(new Error(/413|too large|maximum/i.test(String(e)) ? 'That file is too big to upload.' : "The upload stopped. Check the connection and try again: it carries on where it left off.")),
			onSuccess: () => resolve()
		});
		opts.signal?.addEventListener('abort', () => {
			up.abort(true).catch(() => {});
			reject(new DOMException('Cancelled', 'AbortError'));
		});
		// Same file again after a drop or a restart: pick up where it stopped.
		up.findPreviousUploads().then((prev) => {
			if (prev.length) up.resumeFromPreviousUpload(prev[0]);
			up.start();
		});
	});
}
