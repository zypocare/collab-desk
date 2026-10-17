// A chime and a spoken line when something important arrives while the app is open on her screen
// ("Hey Nivy! You might have a new collab. Check your collab app."). Phones only allow sound after
// a first tap, so the first touch in the app quietly unlocks it.
let ctx: AudioContext | null = null;
let unlocked = false;

/** Call once: the first tap anywhere unlocks sound and speech for the rest of the visit. */
export function watchVoiceUnlock() {
	if (typeof window === 'undefined' || unlocked) return;
	const unlock = () => {
		unlocked = true;
		try {
			ctx ??= new AudioContext();
			void ctx.resume();
			// iPhones need speech to start from a tap once; an empty line does it silently.
			if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(''));
		} catch {
			/* no sound on this device */
		}
		removeEventListener('pointerdown', unlock);
		removeEventListener('keydown', unlock);
	};
	addEventListener('pointerdown', unlock, { once: true });
	addEventListener('keydown', unlock, { once: true });
}

/** A soft two-note chime. */
function chime() {
	try {
		ctx ??= new AudioContext();
		const now = ctx.currentTime;
		for (const [i, f] of [880, 1318.5].entries()) {
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = 'sine';
			o.frequency.value = f;
			const t = now + i * 0.16;
			g.gain.setValueAtTime(0, t);
			g.gain.linearRampToValueAtTime(0.18, t + 0.02);
			g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
			o.connect(g).connect(ctx.destination);
			o.start(t);
			o.stop(t + 0.6);
		}
	} catch {
		/* no sound on this device */
	}
}

/** The friendliest available voice: Indian English first, then any English. */
function voice() {
	const all = speechSynthesis.getVoices();
	return all.find((v) => v.lang === 'en-IN') ?? all.find((v) => /en-GB|en-US/.test(v.lang) && /female|samantha|google/i.test(v.name)) ?? all.find((v) => v.lang.startsWith('en'));
}

function say(text: string) {
	if (!('speechSynthesis' in window)) return;
	const u = new SpeechSynthesisUtterance(text);
	const v = voice();
	if (v) u.voice = v;
	u.rate = 1;
	u.pitch = 1.05;
	// Only cancel when something is playing: on iPhone, cancel() straight before speak() can drop the line.
	if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
	speechSynthesis.speak(u);
}

/** The line she hears, with her name if she set one. */
export const voiceLine = (name: string, what: string) => `Hey ${name.trim() || 'there'}! ${what} Check your collab app.`;

/** Chime, then the line, but only while the app is on screen (and if she hasn't turned it off). */
export function voiceAlert(text: string, opts: { on: boolean; force?: boolean }) {
	if (typeof window === 'undefined' || (!opts.on && !opts.force)) return;
	if (!opts.force && document.visibilityState !== 'visible') return;
	// "Hear it" (a tap): speak at once, inside the tap, or iPhones block it.
	if (opts.force) {
		void ctx?.resume();
		say(text);
		chime();
		return;
	}
	chime();
	setTimeout(() => say(text), 650);
}
