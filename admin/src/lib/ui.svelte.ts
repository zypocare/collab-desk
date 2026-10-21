// Toasts and the "Are you sure?" box, shared by every screen of the panel.
export type Ask = { title: string; body?: string; ok?: string; danger?: boolean };
type Toast = { id: number; msg: string; bad: boolean };

export const ui = $state<{ toasts: Toast[]; confirm: (Ask & { resolve: (yes: boolean) => void }) | null }>({ toasts: [], confirm: null });

let n = 0;
export function toast(msg: string, bad = false) {
	const id = ++n;
	ui.toasts = [...ui.toasts, { id, msg, bad }];
	setTimeout(() => (ui.toasts = ui.toasts.filter((t) => t.id !== id)), 4200);
}

export function ask(q: Ask): Promise<boolean> {
	ui.confirm?.resolve(false);
	return new Promise((resolve) => (ui.confirm = { ...q, resolve }));
}

export function answer(yes: boolean) {
	const q = ui.confirm;
	ui.confirm = null;
	q?.resolve(yes);
}
