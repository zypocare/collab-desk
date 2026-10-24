// What someone already tried in Help (their question, the AI's answer, the guides it showed), carried to
// the ticket form so they don't type it twice and the Miracle team sees it.
export type Tried = { q: string; answer: string; sources: string[]; article?: string };
const KEY = 'miracle-help-tried';

export function keepAsk(t: Tried) {
	try {
		sessionStorage.setItem(KEY, JSON.stringify(t));
	} catch {
		/* private mode: the form just starts empty */
	}
}
export function takeAsk(): Tried | null {
	try {
		const v = sessionStorage.getItem(KEY);
		sessionStorage.removeItem(KEY);
		return v ? (JSON.parse(v) as Tried) : null;
	} catch {
		return null;
	}
}
