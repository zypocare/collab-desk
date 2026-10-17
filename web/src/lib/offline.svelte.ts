// Working without a connection: the last data the app loaded is kept on this device (IndexedDB),
// shown straight away when the app opens, and refreshed as soon as the network answers.
export const net = $state({ online: typeof navigator === 'undefined' ? true : navigator.onLine, savedAt: '' });

if (typeof window !== 'undefined') {
	addEventListener('online', () => (net.online = true));
	addEventListener('offline', () => (net.online = false));
}

const DB = 'collab-desk';
const STORE = 'kv';
function db(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function save(key: string, value: unknown) {
	try {
		const d = await db();
		await new Promise<void>((resolve, reject) => {
			const tx = d.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put($state.snapshot(value), key);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	} catch {
		/* private mode or storage full: the app still works online */
	}
}

export async function load<T>(key: string): Promise<T | null> {
	try {
		const d = await db();
		return await new Promise<T | null>((resolve, reject) => {
			const req = d.transaction(STORE).objectStore(STORE).get(key);
			req.onsuccess = () => resolve((req.result as T) ?? null);
			req.onerror = () => reject(req.error);
		});
	} catch {
		return null;
	}
}

/** Signing out forgets everything saved on this device. */
export async function forgetAll() {
	try {
		const d = await db();
		d.transaction(STORE, 'readwrite').objectStore(STORE).clear();
	} catch {
		/* nothing saved */
	}
	try {
		localStorage.removeItem('cd-account');
	} catch {
		/* storage blocked */
	}
}

/** A network failure (as opposed to the server saying no). */
export const isNetworkError = (e: unknown) => !navigator.onLine || /fetch|network|load failed/i.test(String((e as { message?: string })?.message ?? e));
