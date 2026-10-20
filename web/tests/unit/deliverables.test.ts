import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeContent, postKind, remainingContent, type PromisedContent } from '../../../supabase/functions/_shared/deliverableProgress.ts';

test('successive posts complete only their matching promised pieces', () => {
	const groups: PromisedContent[] = [
		{ kind: 'Reel', qty: 2, done: false, items: [{ status: 'approved' }, { status: 'creating' }] },
		{ kind: 'Story', qty: 3, done: false, items: [{ status: 'planned' }, { status: 'published' }, { status: 'approved' }] }
	];
	assert.equal(consumeContent(groups, postKind('REELS', 'VIDEO')), true);
	assert.equal(remainingContent(groups, 'Reel'), 1);
	assert.equal(remainingContent(groups, 'Story'), 2);
	assert.equal(consumeContent(groups, 'Reel'), true);
	assert.equal(consumeContent(groups, 'Reel'), false);
	assert.equal(groups[0].done, true);
	assert.equal(groups[1].done, false);
});

test('Story matching stops at the promised quantity and keeps existing completed work', () => {
	const groups: PromisedContent[] = [{ kind: 'Story', qty: 3, done: false, items: [{ status: 'delivered' }, { status: 'planned' }, { status: 'planned' }] }];
	assert.equal(consumeContent(groups, postKind('STORY', 'VIDEO')), true);
	assert.equal(consumeContent(groups, 'Story'), true);
	assert.equal(consumeContent(groups, 'Story'), false);
	assert.equal(groups[0].items![0].status, 'delivered');
	assert.equal(remainingContent(groups, 'Story'), 0);
});
