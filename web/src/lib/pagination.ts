/** Read every page before publishing a result. A failed page never becomes a partial report. */
export async function collectPages<T, Cursor>(
	read: (cursor: Cursor | null) => Promise<{ rows: T[]; next: Cursor | null }>
): Promise<T[]> {
	const rows: T[] = [];
	const seen = new Set<string>();
	let cursor: Cursor | null = null;
	do {
		const page = await read(cursor);
		rows.push(...page.rows);
		cursor = page.next;
		if (cursor !== null) {
			const key = JSON.stringify(cursor);
			if (!page.rows.length || seen.has(key)) throw new Error('Pagination stopped advancing. Please refresh.');
			seen.add(key);
		}
	} while (cursor !== null);
	return rows;
}

/** Offset queries use the actual returned length, including when an API caps page size. */
export async function collectRanges<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 100): Promise<T[]> {
	const rows: T[] = [];
	for (;;) {
		const { data, error } = await read(rows.length, rows.length + size - 1);
		if (error) throw error;
		if (!data?.length) return rows;
		rows.push(...data);
	}
}
