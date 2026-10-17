// The app's own "Are you sure?" dialog, in place of the browser's confirm() pop-up.
//   if (!(await ask({ title: 'Delete this package?', ok: 'Delete', danger: true }))) return;

export type Ask = { title: string; body?: string; ok?: string; cancel?: string; danger?: boolean; /** Show a text box (its label); the text is in asking.text. */ note?: string; placeholder?: string };

export const asking = $state<{ q: (Ask & { resolve: (yes: boolean) => void }) | null; text: string }>({ q: null, text: '' });

export function ask(q: Ask): Promise<boolean> {
	asking.q?.resolve(false);
	asking.text = '';
	return new Promise((resolve) => {
		asking.q = { ...q, resolve };
	});
}

/** ask() with a text box: the text (maybe '') when confirmed, null when cancelled. */
export async function askNote(q: Ask & { note: string }): Promise<string | null> {
	return (await ask(q)) ? asking.text.trim() : null;
}

export function answer(yes: boolean) {
	const q = asking.q;
	asking.q = null;
	q?.resolve(yes);
}
