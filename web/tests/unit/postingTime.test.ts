import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlot, nextSlots, postingEvidence, postingTimeInsights, slotLabel, type PostingMedia } from '../../../supabase/functions/_shared/postingTime.ts';
import { bestSlot as collabSlot, bestTime } from '../../src/lib/postTime.ts';
import { bestSlot as checkupSlot } from '../../../supabase/functions/_shared/growth.ts';

const NOW = Date.parse('2026-10-27T06:00:00Z');
const DAY = 864e5;
const IST = 330 * 60e3;
type Post = PostingMedia & { interactions: number };
const post = (date: string, time: string, views: number | null, reach = 100): Post => ({
  id: `${date}-${time}`, product_type: 'REELS', posted_at: new Date(Date.parse(`${date}T${time}:00Z`) - IST).toISOString(),
  views, reach, interactions: views === 100 ? 5000 : 10
});
const sample = () => [
  ...['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-05', '2026-10-06', '2026-10-07'].map((date) => post(date, '14:00', 100, 1000)),
  ...['2026-10-01', '2026-10-02', '2026-10-08', '2026-10-09'].map((date) => post(date, '19:30', 1000, 100))
];

test('Collabs and background check-ups use the identical shared engine', () => {
  assert.equal(collabSlot, bestSlot);
  assert.equal(bestTime, bestSlot);
  assert.equal(checkupSlot, bestSlot);
  const s = bestSlot(sample(), NOW)!;
  assert.equal(s.value, '19:30');
  assert.deepEqual(s.days, [4, 5]);
  assert.equal(slotLabel(s), 'Thursday and Friday at 7:30 PM IST');
  assert.equal(s.metric, 'views');
  assert.equal(s.lift, 900);
  assert.equal(s.posts, 4);
  assert.equal(s.totalPosts, 10);
  assert.match(postingEvidence(s), /6:00 PM–8:00 PM window had 900% higher typical views/);
  assert.doesNotMatch(postingEvidence(s), /reach|interactions/);
});

test('uses one metric for the whole comparison and labels reach fallback honestly', () => {
  const rows = sample();
  for (let i = 0; i < 6; i++) rows[i].views = null;
  rows.forEach((p, i) => { p.reach = i < 6 ? 100 : 1000; });
  const s = bestSlot(rows, NOW)!;
  assert.equal(s.metric, 'reach');
  assert.equal(s.value, '19:30');
  assert.match(postingEvidence(s), /typical reach/);
});

test('ignores Stories, unsettled posts, old posts and invalid timestamps', () => {
  const extra = [
    { ...post('2026-10-01', '10:00', 1e8), product_type: 'STORY' },
    post('2026-10-26', '10:00', 1e8),
    post('2026-06-01', '10:00', 1e8),
    { ...post('2026-10-01', '10:00', 1e8), posted_at: 'invalid' }
  ];
  assert.deepEqual(bestSlot([...extra, ...sample()], NOW), bestSlot(sample(), NOW));
});

test('withholds a personal best time for insufficient or flat data', () => {
  assert.equal(bestSlot(sample().slice(0, 5), NOW), null);
  assert.equal(bestSlot(sample().map((p) => ({ ...p, views: 100 })), NOW), null);
  assert.equal(bestSlot(sample().map((p) => ({ ...p, views: null, reach: null })), NOW), null);
});

test('a lone viral post does not create a winning time window', () => {
  const rows = sample().map((p) => ({ ...p, views: 100 }));
  rows[0].views = 1e8;
  assert.equal(bestSlot(rows, NOW), null);
});

test('keeps measured zeros in the comparison and avoids a zero-baseline percentage', () => {
  const rows = sample().map((p) => ({ ...p, views: 0 }));
  rows[0].views = 1000;
  const analysis = postingTimeInsights(rows, NOW);
  assert.equal(analysis.posts, 10);
  assert.equal(analysis.metric, 'views');
  assert.equal(analysis.recommendation, null);
});

test('requires three posts in a suggested window', () => {
  const rows = sample().slice(0, 8);
  assert.equal(bestSlot(rows, NOW), null);
});

test('half-hour rounding stays inside the supported window, including midnight', () => {
  for (const time of ['19:55', '23:55']) {
    const rows = sample().map((p, i) => i < 6 ? p : post(p.id!.slice(0, 10), time, 1000));
    const s = bestSlot(rows, NOW)!;
    assert.equal(s.value, time === '19:55' ? '19:30' : '23:30');
    assert.ok(s.minute === 0 || s.minute === 30);
    assert.ok(s.hour < 24);
  }
});

test('input order and timestamp UTC representation do not alter the recommendation', () => {
  const rows = sample();
  const local = rows.map((p) => ({ ...p, posted_at: `${new Date(Date.parse(p.posted_at) + IST).toISOString().slice(0, 19)}+05:30` }));
  assert.deepEqual(bestSlot(rows.toReversed(), NOW), bestSlot(rows, NOW));
  assert.deepEqual(bestSlot(local, NOW), bestSlot(rows, NOW));
});

test('planning uses the same minute and supported weekdays without inventing another day', () => {
  const slots = nextSlots(sample(), 8, NOW);
  assert.equal(slots.length, 8);
  for (const at of slots) {
    const local = new Date(at.getTime() + IST);
    assert.ok([4, 5].includes(local.getUTCDay()));
    assert.equal(local.getUTCHours(), 19);
    assert.equal(local.getUTCMinutes(), 30);
    assert.ok(at.getTime() > NOW);
  }
  assert.deepEqual(slots, nextSlots(sample().toReversed(), 8, NOW));
});

test('does not attach a successful weekday from another time window to the suggestion', () => {
  const rows = sample();
  // Monday's good afternoon results must not be described as evidence for Monday evening.
  rows.push(post('2026-10-12', '14:00', 900), post('2026-10-19', '14:00', 900));
  const s = bestSlot(rows, NOW)!;
  assert.equal(s.value, '19:30');
  assert.deepEqual(s.days, [4, 5]);
});

test('time-only evidence does not invent best weekdays', () => {
  const rows = sample().slice(0, 6);
  rows.push(post('2026-10-01', '19:30', 1000), post('2026-10-02', '19:30', 1000), post('2026-10-03', '19:30', 1000));
  const s = bestSlot(rows, NOW)!;
  assert.deepEqual(s.days, []);
  assert.equal(slotLabel(s), '7:30 PM IST');
  assert.ok(nextSlots(rows, 3, NOW).every((d) => new Date(d.getTime() + IST).getUTCHours() === s.hour));
});

test('a supported time today remains available, and already passed times are skipped', () => {
  const thursdayMorning = Date.parse('2026-10-29T06:00:00Z');
  assert.equal(nextSlots(sample(), 1, thursdayMorning)[0].toISOString(), '2026-10-29T14:00:00.000Z');
  assert.equal(nextSlots(sample(), 1, thursdayMorning + DAY)[0].toISOString(), '2026-10-30T14:00:00.000Z');
  assert.equal(nextSlots(sample(), 1, Date.parse('2026-10-29T15:00:00Z'))[0].toISOString(), '2026-10-30T14:00:00.000Z');
});

test('starter scheduling stays usable without claiming a personalized recommendation', () => {
  assert.equal(bestSlot([], NOW), null);
  const slots = nextSlots([], 3, NOW);
  assert.equal(slots.length, 3);
  assert.ok(slots.every((d) => new Date(d.getTime() + IST).getUTCHours() === 19));
});

test('weekday performance always includes Monday to Sunday, including empty days', () => {
  const empty = postingTimeInsights([], NOW);
  assert.deepEqual(empty.weekdays.map((d) => d.name), ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  assert.ok(empty.weekdays.every((d) => d.posts === 0 && d.typical === null && d.bestTime === null));
  const r = postingTimeInsights(sample(), NOW);
  assert.equal(r.weekdays.find((d) => d.day === 1)?.posts, 2);
  assert.equal(r.weekdays.find((d) => d.day === 0)?.posts, 0);
});

test('each weekday chooses its own observed time, even on a weaker weekday', () => {
  const mondays = ['2026-09-28', '2026-10-05', '2026-10-12'];
  const rows = [
    ...mondays.map((d) => post(d, '14:00', 30)),
    ...mondays.map((d) => post(d, '19:30', 80)),
    ...['2026-10-01', '2026-10-08', '2026-10-15'].map((d) => post(d, '18:30', 2000))
  ];
  const r = postingTimeInsights(rows, NOW);
  const monday = r.weekdays.find((d) => d.day === 1)!;
  const thursday = r.weekdays.find((d) => d.day === 4)!;
  assert.equal(r.recommendation?.value, '18:30');
  assert.equal(monday.typical, 55);
  assert.equal(monday.bestTime?.value, '19:30');
  assert.equal(monday.bestTime?.posts, 3);
  assert.equal(monday.bestTime?.typical, 80);
  assert.ok(monday.lift! < 0);
  assert.equal(thursday.bestTime?.value, '18:30');
  assert.equal(monday.windows.length, 2);
});

test('daily recommendations cannot borrow samples from other weekdays', () => {
  const r = postingTimeInsights(sample(), NOW);
  // The overall evening window has four posts, but only two each on Thursday and Friday.
  assert.ok(r.recommendation);
  assert.equal(r.weekdays.find((d) => d.day === 4)?.bestTime, null);
  assert.equal(r.weekdays.find((d) => d.day === 5)?.bestTime, null);
});

test('small samples show descriptive weekday results without inventing a time', () => {
  const rows = ['2026-09-28', '2026-10-05', '2026-10-12'].map((d) => post(d, '19:30', 100));
  const r = postingTimeInsights(rows, NOW);
  assert.equal(r.posts, 3);
  assert.equal(r.metric, 'views');
  assert.equal(r.weekdays[0].posts, 3);
  assert.equal(r.weekdays[0].typical, 100);
  assert.equal(r.weekdays[0].bestTime, null);
  assert.equal(r.recommendation, null);
});

test('daily medians include measured zeros and do not suggest an all-zero window', () => {
  const rows = sample().map((p) => ({ ...p, views: 0 }));
  const r = postingTimeInsights(rows, NOW);
  assert.equal(r.weekdays[0].typical, 0);
  assert.equal(r.weekdays[0].lift, null);
  assert.ok(r.weekdays.every((d) => d.bestTime === null));
});

test('weekday boundaries and midnight rounding use India time', () => {
  const rows = [
    ...['2026-09-28', '2026-10-05', '2026-10-12'].map((d) => post(d, '00:10', 1000)),
    ...['2026-09-29', '2026-10-06', '2026-10-13'].map((d) => post(d, '23:55', 100))
  ];
  const r = postingTimeInsights(rows, NOW);
  assert.equal(r.weekdays.find((d) => d.day === 1)?.bestTime?.value, '00:00');
  assert.equal(r.weekdays.find((d) => d.day === 2)?.bestTime?.value, '23:30');
  assert.equal(r.weekdays.find((d) => d.day === 0)?.posts, 0);
  assert.equal(r.weekdays.find((d) => d.day === 1)?.bestTime?.label, '12:00 AM');
});

test('weekday performance uses the same metric fallback as the overall engine', () => {
  const rows = [
    ...['2026-09-28', '2026-10-05', '2026-10-12'].map((d) => post(d, '19:30', null, 1000)),
    ...['2026-09-29', '2026-10-06', '2026-10-13'].map((d) => post(d, '10:00', null, 100))
  ];
  const r = postingTimeInsights(rows, NOW);
  assert.equal(r.metric, 'reach');
  assert.equal(r.weekdays[0].typical, 1000);
  assert.equal(r.weekdays[0].bestTime?.value, '19:30');
  assert.equal(r.weekdays[1].bestTime?.value, '10:00');
  assert.deepEqual(r.weekdays, postingTimeInsights(rows.toReversed(), NOW).weekdays);
});
