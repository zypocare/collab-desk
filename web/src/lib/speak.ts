// Speak instead of typing. Uses the browser's own speech recognition where it has one (Chrome,
// Safari: free, nothing stored); otherwise records up to a minute and has it written out by the
// free AI (Whisper on Cloudflare). English, Hindi and Hinglish both ways.
import { askAi } from './ai';

type Rec = {
	lang: string;
	interimResults: boolean;
	continuous: boolean;
	onresult: (e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void;
	onend: () => void;
	onerror: (e: { error?: string }) => void;
	start: () => void;
	stop: () => void;
};
const SR = typeof window !== 'undefined' ? ((window as unknown as { SpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition) : undefined;

export const canSpeak = () => !!SR || (typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia);

export type Listening = { stop: () => void };
type Opts = {
	/** Live text while she speaks (built-in recognition only). */
	onText?: (text: string) => void;
	/** The final text (empty when nothing was heard). */
	onDone: (text: string) => void;
	onError: (msg: string) => void;
	/** Called when the fallback starts writing out the recording. */
	onWorking?: () => void;
};

export function listen(o: Opts): Listening {
	if (SR) {
		const rec = new SR();
		rec.lang = 'en-IN';
		rec.interimResults = true;
		rec.continuous = false;
		let text = '';
		rec.onresult = (e) => {
			text = Array.from(e.results)
				.map((r) => r[0].transcript)
				.join(' ')
				.replace(/\s+/g, ' ')
				.trim();
			o.onText?.(text);
		};
		rec.onend = () => o.onDone(text);
		rec.onerror = (e) => {
			if (e.error === 'not-allowed' || e.error === 'service-not-allowed') o.onError('Allow the microphone for this site to speak.');
			else if (e.error !== 'no-speech' && e.error !== 'aborted') o.onError("Couldn't hear that. Try again.");
		};
		rec.start();
		return { stop: () => rec.stop() };
	}
	// No built-in recognition: record, then write it out with the free AI.
	let rec: MediaRecorder | null = null;
	let stream: MediaStream | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const chunks: Blob[] = [];
	const finish = () => stream?.getTracks().forEach((t) => t.stop());
	navigator.mediaDevices
		.getUserMedia({ audio: true })
		.then((s) => {
			stream = s;
			rec = new MediaRecorder(s);
			rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
			rec.onstop = async () => {
				finish();
				clearTimeout(timer);
				const blob = new Blob(chunks, { type: rec?.mimeType || 'audio/webm' });
				if (blob.size < 2000) return o.onDone('');
				o.onWorking?.();
				try {
					const audio = await new Promise<string>((res, rej) => {
						const r = new FileReader();
						r.onload = () => res(String(r.result).split(',')[1] ?? '');
						r.onerror = () => rej(new Error("Couldn't read the recording."));
						r.readAsDataURL(blob);
					});
					const { text } = await askAi<{ text: string }>('voice', { audio });
					o.onDone(text);
				} catch (e) {
					o.onError((e as Error).message);
				}
			};
			rec.start();
			timer = setTimeout(() => rec?.state === 'recording' && rec.stop(), 60_000);
		})
		.catch(() => o.onError('Allow the microphone for this site to speak.'));
	return { stop: () => (rec?.state === 'recording' ? rec.stop() : finish()) };
}
