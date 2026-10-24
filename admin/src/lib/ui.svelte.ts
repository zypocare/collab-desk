// Toasts and the "Are you sure?" box, shared by every screen of the panel. The box can also ask for a
// line of text (a reason for the audit trail, a name for a saved view).
export type Ask = { title: string; body?: string; ok?: string; danger?: boolean; input?: { label: string; placeholder?: string; required?: boolean; value?: string } };
type Toast = { id: number; msg: string; bad: boolean };

export const ui = $state<{ toasts: Toast[]; confirm: (Ask & { text: string; resolve: (answer: string | null) => void }) | null }>({ toasts: [], confirm: null });

let n = 0;
export function toast(msg: string, bad = false) {
	const id = ++n;
	ui.toasts = [...ui.toasts, { id, msg, bad }];
	setTimeout(() => (ui.toasts = ui.toasts.filter((t) => t.id !== id)), 4200);
}

/** OK or Cancel. */
export async function ask(q: Ask): Promise<boolean> {
	return (await askText(q)) !== null;
}

/** OK with the typed text, or null for Cancel. */
export function askText(q: Ask): Promise<string | null> {
	ui.confirm?.resolve(null);
	return new Promise((resolve) => (ui.confirm = { ...q, text: q.input?.value ?? '', resolve }));
}

export function answer(yes: boolean) {
	const q = ui.confirm;
	if (yes && q?.input?.required && !q.text.trim()) return;
	ui.confirm = null;
	q?.resolve(yes ? q.text.trim() : null);
}
