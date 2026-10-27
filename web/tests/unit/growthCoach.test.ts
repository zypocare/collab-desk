import assert from 'node:assert/strict';
import test from 'node:test';
import { growthFocus, isReel, type CoachMedia } from '../../../supabase/functions/_shared/growth.ts';
import { bestSlot } from '../../../supabase/functions/_shared/postingTime.ts';

const NOW = Date.parse('2026-10-27T06:00:00Z');
const DAY = 864e5;
const reel = (days: number, views = 100, extra: Partial<CoachMedia> = {}): CoachMedia => ({
  id: `reel-${days}`, posted_at: new Date(NOW - days * DAY).toISOString(), product_type: 'REELS', media_type: 'VIDEO',
  caption: 'A useful local guide', views, reach: views, shares: 1, saves: 1, avg_watch_ms: null,
  permalink: `https://www.instagram.com/reel/reel-${days}/`, ...extra
});

test('an empty account gets an honest learning state and a useful first experiment', () => {
  const r = growthFocus([], [], NOW);
  assert.equal(r.reels, 0);
  assert.equal(r.change, null);
  assert.equal(r.followerChange, null);
  assert.equal(r.slot, null);
  assert.equal(r.nextPost, null);
  assert.equal(r.reach.kind, 'experiment');
  assert.match(r.reach.test, /Change the first sentence/);
});

test('video Stories never count as reels', () => {
  const story = reel(8, 10000, { product_type: 'STORY' });
  assert.equal(isReel(story), false);
  assert.equal(growthFocus([story], [], NOW).reels, 0);
});

test('progress uses separate settled cohorts and a median rather than a viral average', () => {
  const rows = [reel(6, 200), reel(8, 300), reel(10, 1e6), reel(40), reel(45), reel(50)];
  const r = growthFocus(rows, [], NOW);
  assert.deepEqual(r.recent, { posts: 3, typicalViews: 300 });
  assert.deepEqual(r.previous, { posts: 3, typicalViews: 100 });
  assert.equal(r.change, 200);
  assert.equal(growthFocus(rows.slice(1), [], NOW).change, null);
});

test('zero views count as measured performance while missing and invalid values do not', () => {
  const rows = [reel(6, 0), reel(8, 0), reel(10, 100), reel(40), reel(45), reel(50), reel(7, NaN), reel(9, 100, { views: null })];
  const r = growthFocus(rows, [], NOW);
  assert.equal(r.recent.posts, 3);
  assert.equal(r.recent.typicalViews, 0);
  assert.equal(r.change, -100);
});

test('unsettled, expired, future and invalid posts cannot drive a growth action', () => {
  const rows = [reel(1, 1e8), reel(91, 1e8), reel(-1, 1e8), reel(8, 1e8, { posted_at: 'bad date' })];
  assert.equal(growthFocus(rows, [], NOW).reels, 0);
});

test('repeat suggestions use measured shares and saves per view with a real example', () => {
  const rows = Array.from({ length: 6 }, (_, i) => reel(6 + i, 1000));
  rows.push(reel(15, 1000, { shares: 20, saves: 10 }));
  const r = growthFocus(rows, [], NOW);
  assert.equal(r.reach.kind, 'repeat');
  assert.equal(r.reach.example?.id, 'reel-15');
  assert.match(r.reach.evidence, /30.0 shares \+ saves per 1,000 views/);
  assert.match(r.reach.evidence, /typical reel had 2.0/);
  assert.match(r.reach.test, /two reels.*third/);
});

test('missing share/save data is not invented as zero and tiny view samples do not win', () => {
  const rows = Array.from({ length: 6 }, (_, i) => reel(6 + i, 1000, { shares: null, saves: null }));
  rows.push(reel(15, 1, { shares: 10, saves: 10 }));
  const r = growthFocus(rows, [], NOW);
  assert.equal(r.reach.kind, 'experiment');
  assert.equal(r.reach.example, null);
});

test('a watch-time comparison creates a specific test without promising results', () => {
  const rows = Array.from({ length: 6 }, (_, i) => reel(6 + i, i < 3 ? 100 : 1000, { avg_watch_ms: i < 3 ? 3000 : 12000, shares: null, saves: null }));
  const r = growthFocus(rows, [], NOW);
  assert.equal(r.reach.kind, 'watch');
  assert.match(r.reach.evidence, /10.0× the typical views/);
  assert.match(r.reach.test, /Show the result first/);
});

test('follower changes use bounded account history regardless of input order', () => {
  const hist = [{ day: '2026-10-27', followers: 160 }, { day: '2026-09-29', followers: 100 }, { day: '2026-10-10', followers: 130 }];
  const a = growthFocus([], hist, NOW);
  const b = growthFocus([], hist.toReversed(), NOW);
  assert.equal(a.followerChange, 60);
  assert.equal(a.followerDays, 28);
  assert.equal(a.followerChange, b.followerChange);
  assert.equal(growthFocus([], hist.slice(0, 1), NOW).followerChange, null);
  assert.equal(growthFocus([], [{ day: '2026-09-20', followers: 100 }, hist[0]], NOW).followerChange, null);
  assert.equal(growthFocus([], [hist[1], { day: '2026-10-20', followers: 150 }], NOW).followerChange, null);
});

test('follower dates follow India time across the UTC midnight boundary', () => {
  const now = Date.parse('2026-10-26T20:00:00Z'); // Already 27 October in India.
  const r = growthFocus([], [{ day: '2026-09-29', followers: 100 }, { day: '2026-10-27', followers: 140 }], now);
  assert.equal(r.followerChange, 40);
  assert.equal(r.followerDays, 28);
});

test('example links cannot navigate to a non-Instagram host or execute script', () => {
  for (const url of ['javascript:alert(1)', 'https://instagram.com.evil.test/reel/x', 'https://example.test']) {
    const rows = Array.from({ length: 6 }, (_, i) => reel(6 + i, 1000));
    rows.push(reel(15, 1000, { shares: 50, saves: 50, permalink: url }));
    assert.equal(growthFocus(rows, [], NOW).reach.example?.url, '');
  }
});

test('the coach uses the existing posting engine rather than generating another time', () => {
  const rows = [
    ...['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-05', '2026-10-06', '2026-10-07'].map((d, i) => reel(6 + i, 100, { posted_at: `${d}T08:30:00Z` })),
    ...['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09'].map((d, i) => reel(16 + i, 1000, { posted_at: `${d}T14:00:00Z` }))
  ];
  const r = growthFocus(rows, [], NOW);
  assert.deepEqual(r.slot, bestSlot(rows, NOW));
  assert.equal(r.slot?.value, '19:30');
  assert.equal(r.nextPost, '2026-10-29T14:00:00.000Z');
});
