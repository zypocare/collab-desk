// The app's own "Are you sure?" dialog, in place of the browser's confirm() pop-up.
//   if (!(await ask({ title: 'Delete this package?', ok: 'Delete', danger: true }))) return;

export type Ask = { title: string; body?: string; ok?: string; cancel?: string; danger?: boolean };

export const asking = $state<{ q: (Ask & { resolve: (yes: boolean) => void }) | null }>({ q: null });

export function ask(q: Ask): Promise<boolean> {
	asking.q?.resolve(false);
	return new Promise((resolve) => (asking.q = { ...q, resolve }));
}

export function answer(yes: boolean) {
	const q = asking.q;
	asking.q = null;
	q?.resolve(yes);
}
