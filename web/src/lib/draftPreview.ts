// The brand's copy of a draft, made on her phone: a light 720p version with "DRAFT · for <brand>"
// across the picture, so it opens fast on mobile data and can't be posted before it's paid for.
// Videos are re-recorded as they play (a 40-second reel takes about 40 seconds); photos are instant.
// Nothing leaves the device until it's done, and no paid video service is involved.

const MAX_SECONDS = 180;

function watermark(x: CanvasRenderingContext2D, w: number, h: number, brand: string) {
	const label = `DRAFT · FOR ${brand.toUpperCase()}`;
	const size = Math.max(14, Math.round(Math.min(w, h) * 0.05));
	x.save();
	x.translate(w / 2, h / 2);
	x.rotate(-0.49);
	x.font = `600 ${size}px Geist, system-ui, sans-serif`;
	x.textAlign = 'center';
	x.textBaseline = 'middle';
	x.lineWidth = Math.max(1, size / 14);
	x.strokeStyle = 'rgba(0, 0, 0, 0.22)';
	x.fillStyle = 'rgba(255, 255, 255, 0.34)';
	const step = size * 4.2, span = Math.hypot(w, h);
	for (let y = -span / 2; y <= span / 2; y += step) {
		const off = (Math.round(y / step) % 2) * size * 3;
		for (let xx = -span / 2 - off; xx <= span / 2; xx += x.measureText(label).width + size * 3) {
			x.strokeText(label, xx, y);
			x.fillText(label, xx, y);
		}
	}
	x.restore();
}

function fit(w: number, h: number, short: number, long: number) {
	const k = Math.min(1, short / Math.min(w, h), long / Math.max(w, h));
	// Even sizes keep video encoders happy.
	return { w: Math.round((w * k) / 2) * 2, h: Math.round((h * k) / 2) * 2 };
}

async function photo(file: File, brand: string): Promise<File> {
	const img = await createImageBitmap(file);
	const { w, h } = fit(img.width, img.height, 1080, 1600);
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const x = c.getContext('2d')!;
	x.drawImage(img, 0, 0, w, h);
	watermark(x, w, h, brand);
	const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.84));
	if (!blob) throw new Error("Couldn't make the preview.");
	return new File([blob], 'preview.jpg', { type: 'image/jpeg' });
}

/** A video format this browser can record and the brand's browser can play (MP4 first). */
function recordType() {
	for (const t of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
		if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
	return '';
}

async function video(file: File, brand: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<File | null> {
	const type = recordType();
	const canvasStream = 'captureStream' in HTMLCanvasElement.prototype;
	if (!type || !canvasStream) return null;
	const src = URL.createObjectURL(file);
	const v = document.createElement('video');
	v.src = src;
	v.playsInline = true;
	v.preload = 'auto';
	v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
	document.body.appendChild(v);
	const ac = new AudioContext();
	const cleanup = () => {
		v.pause();
		v.remove();
		URL.revokeObjectURL(src);
		ac.close().catch(() => {});
	};
	try {
		await new Promise<void>((res, rej) => {
			v.onloadedmetadata = () => res();
			v.onerror = () => rej(new Error("This video can't be opened here."));
		});
		if (!isFinite(v.duration) || v.duration > MAX_SECONDS) {
			cleanup();
			return null;
		}
		const { w, h } = fit(v.videoWidth, v.videoHeight, 720, 1280);
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const x = c.getContext('2d')!;
		const stream = (c as HTMLCanvasElement & { captureStream: (fps: number) => MediaStream }).captureStream(30);
		// The sound goes into the recording only (not out of the speakers).
		try {
			const dest = ac.createMediaStreamDestination();
			ac.createMediaElementSource(v).connect(dest);
			for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
		} catch {
			/* silent preview */
		}
		const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_200_000, audioBitsPerSecond: 96_000 });
		const parts: Blob[] = [];
		rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
		const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
		let live = true;
		const draw = () => {
			if (!live) return;
			x.drawImage(v, 0, 0, w, h);
			watermark(x, w, h, brand);
			onProgress?.(v.currentTime, v.duration);
			const rv = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => void };
			if (rv.requestVideoFrameCallback) rv.requestVideoFrameCallback(draw);
			else requestAnimationFrame(draw);
		};
		signal?.addEventListener('abort', () => {
			live = false;
			if (rec.state !== 'inactive') rec.stop();
		});
		await ac.resume().catch(() => {});
		rec.start(1000);
		await v.play();
		draw();
		await new Promise<void>((r) => {
			v.onended = () => r();
			signal?.addEventListener('abort', () => r());
		});
		live = false;
		if (rec.state !== 'inactive') rec.stop();
		await stopped;
		cleanup();
		if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
		const blob = new Blob(parts, { type: type.split(';')[0] });
		const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
		return new File([blob], `preview.${ext}`, { type: type.split(';')[0] });
	} catch (e) {
		cleanup();
		throw e;
	}
}

/**
 * The watermarked preview for the brand, or null when this browser can't make one (or the video is
 * longer than 3 minutes): then the brand gets the original, as before.
 */
export async function makePreview(file: File, brand: string, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<File | null> {
	if (file.type.startsWith('image/')) return photo(file, brand);
	if (file.type.startsWith('video/')) return video(file, brand, onProgress, signal);
	return null;
}
