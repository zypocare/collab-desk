import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPages, collectRanges } from '../../src/lib/pagination.ts';

test('reads more than 1,000 records through bounded cursor pages', async () => {
	const records = Array.from({ length: 1_205 }, (_, id) => ({ id }));
	const rows = await collectPages<{ id: number }, number>(async (cursor) => {
		const offset = cursor ?? 0;
		const page = records.slice(offset, offset + 100);
		return { rows: page, next: offset + page.length < records.length ? offset + page.length : null };
	});
	assert.deepEqual(rows, records);
});

test('does not stop early when an API caps ranges below the requested size', async () => {
	const records = Array.from({ length: 1_007 }, (_, id) => id);
	const rows = await collectRanges(async (from) => ({ data: records.slice(from, from + 37), error: null }));
	assert.deepEqual(rows, records);
});

test('rejects a failed later page instead of returning partial reporting data', async () => {
	await assert.rejects(collectPages<number, number>(async (cursor) => {
		if (cursor !== null) throw new Error('connection lost');
		return { rows: [1, 2], next: 2 };
	}), /connection lost/);
	await assert.rejects(collectRanges(async (from) => from ? { data: null, error: new Error('denied') } : { data: [1], error: null }), /denied/);
});

test('rejects repeated cursors and empty pages with a next cursor', async () => {
	await assert.rejects(collectPages<number, number>(async () => ({ rows: [1], next: 1 })), /stopped advancing/);
	await assert.rejects(collectPages<number, number>(async () => ({ rows: [], next: 1 })), /stopped advancing/);
});

test('empty datasets and exact full pages terminate correctly', async () => {
	assert.deepEqual(await collectPages(async () => ({ rows: [], next: null })), []);
	const source = [1, 2, 3, 4];
	let calls = 0;
	assert.deepEqual(await collectRanges(async (from, to) => { calls++; return { data: source.slice(from, to + 1), error: null }; }, 2), source);
	assert.equal(calls, 3);
});
