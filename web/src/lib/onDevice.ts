// Reading a DM with the AI built into Chrome (Gemini Nano), on the phone or laptop itself: free,
// works offline, and the message never leaves the device. Used only when the model is already
// downloaded; everywhere else the cloud reader runs as before.
import type { DmFields } from './ai';

type Session = { prompt: (text: string, o?: { responseConstraint?: unknown; signal?: AbortSignal }) => Promise<string>; destroy: () => void };
type LM = {
	availability: (o?: unknown) => Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
	create: (o?: unknown) => Promise<Session>;
};
const model = () => (typeof globalThis !== 'undefined' ? (globalThis as unknown as { LanguageModel?: LM }).LanguageModel : undefined);
const LANGS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

let ready: Promise<boolean> | null = null;
/** Is the built-in model on this device, ready to use now (no download)? Checked once. */
export function onDeviceReady() {
	ready ??= (async () => {
		try {
			return (await model()?.availability(LANGS)) === 'available';
		} catch {
			return false;
		}
	})();
	return ready;
}

const KINDS = ['Reel', 'Story', 'Static post', 'Carousel', 'UGC video', 'Shoot'];
const SCHEMA = {
	type: 'object',
	properties: {
		brand: { type: 'string' },
		instagram: { type: 'string' },
		contact: { type: 'string' },
		email: { type: 'string' },
		phone: { type: 'string' },
		type: { type: 'string', enum: ['paid', 'barter', 'hybrid', ''] },
		fee: { type: 'number' },
		product: { type: 'string' },
		product_value: { type: 'number' },
		deliverables: { type: 'array', items: { type: 'object', properties: { kind: { type: 'string', enum: KINDS }, qty: { type: 'number' } }, required: ['kind', 'qty'] } },
		preferred_live: { type: 'string' },
		usage: { type: 'string' }
	},
	required: ['brand', 'fee', 'deliverables']
};

/** The DM's details, or null when the built-in model isn't there or couldn't answer. */
export async function readDmOnDevice(text: string, handle: string): Promise<DmFields | null> {
	if (!(await onDeviceReady())) return null;
	let s: Session | null = null;
	try {
		const today = new Date().toISOString().slice(0, 10);
		s = await model()!.create({
			...LANGS,
			initialPrompts: [
				{
					role: 'system',
					content: `You read messages that brands send an Indian Instagram creator (@${handle}) and pull out the collab details. Messages may be in English, Hindi written in English letters (Hinglish), or a mix. Today is ${today}.
Rules: fee is the money offered in rupees as a number (30k = 30000, 1.5 lakh = 150000, "20 hazaar" = 20000), 0 if none. type: "paid" for money only, "barter" for products/gifts only, "hybrid" for both, "" if unclear. deliverables: kinds from ${KINDS.join(', ')}; Hinglish counts ek=1, do=2, teen=3, char=4, paanch=5; a video for Instagram is a Reel. preferred_live: the go-live date as YYYY-MM-DD ("25 tak" = the 25th of this month, or next month if it has passed), "" if none. brand: the company name, not a person. Leave anything not in the message as "" or 0. Never invent details.`
				}
			]
		});
		const out = await s.prompt(text.slice(0, 4000), { responseConstraint: SCHEMA, signal: AbortSignal.timeout(25_000) });
		const f = JSON.parse(out) as DmFields;
		return f && typeof f === 'object' ? f : null;
	} catch {
		return null;
	} finally {
		s?.destroy();
	}
}
