// One posting-time engine for the studio, Instagram insights and background growth planning.
// Compare settled feed posts using one metric, so views, reach and interactions never get mixed.
export type PostingMedia = {
  id?: string;
  posted_at: string;
  product_type?: string | null;
  views?: number | null;
  reach?: number | null;
};
export type TimeBucket = { k: string; posts: number; typical: number };
export type WeekdayPerformance = {
  day: number;
  name: string;
  short: string;
  posts: number;
  typical: number | null;
  lift: number | null;
  windows: (TimeBucket & { from: number })[];
  bestTime: { value: string; label: string; window: string; posts: number; typical: number } | null;
};
export type PostingSlot = {
  days: number[];
  hour: number;
  minute: number;
  value: string;
  window: string;
  metric: 'views' | 'reach';
  lift: number;
  posts: number;
  totalPosts: number;
};
export type PostingInsights = {
  version: 1;
  metric: 'views' | 'reach' | null;
  posts: number;
  bands: TimeBucket[];
  days: TimeBucket[];
  best_band: string | null;
  best_day: string | null;
  recommendation: PostingSlot | null;
  weekdays: WeekdayPerformance[];
};

const DAY = 864e5;
const IST = 330 * 60e3;
export const POSTING_MEDIA_LIMIT = 200;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const measured = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const clock = (minutes: number) => {
  const hour = Math.floor(minutes / 60) % 24;
  return `${(hour + 11) % 12 + 1}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};
const windowLabel = (hour: number) => `${clock(hour * 60)}–${clock((hour + 2) * 60)}`;
const emptyWeekdays = (): WeekdayPerformance[] => [1, 2, 3, 4, 5, 6, 0].map((day) => ({
  day, name: WEEKDAYS[day], short: SHORT_DAYS[day], posts: 0, typical: null, lift: null, windows: [], bestTime: null
}));

/** Last 90 days, excluding Stories and the newest 3 days while their results are still growing.
 * At least 6 comparable posts and 3 per candidate window; medians reduce one viral post's influence.
 * The half-hour is a practical time observed inside the winning window, not a prediction for that minute.
 */
export function postingTimeInsights(media: PostingMedia[], now = Date.now()): PostingInsights {
  const recent = [...media].sort((a, b) => b.posted_at.localeCompare(a.posted_at) || (a.id ?? '').localeCompare(b.id ?? ''))
    .slice(0, POSTING_MEDIA_LIMIT)
    .filter((m) => m.product_type !== 'STORY' && Number.isFinite(Date.parse(m.posted_at)) &&
      Date.parse(m.posted_at) >= now - 90 * DAY && Date.parse(m.posted_at) <= now - 3 * DAY);
  const metrics = ['views', 'reach'] as const;
  const metric = metrics.find((key) => recent.filter((m) => measured(m[key])).length >= 6) ??
    metrics.find((key) => recent.some((m) => measured(m[key]))) ?? null;
  const result: PostingInsights = { version: 1, metric, posts: 0, bands: [], days: [], best_band: null, best_day: null, recommendation: null, weekdays: emptyWeekdays() };
  if (!metric) return result;
  const posts = recent.filter((m) => measured(m[metric])).map((m) => {
    const d = new Date(Date.parse(m.posted_at) + IST);
    return { value: m[metric]!, day: d.getUTCDay(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  });
  result.posts = posts.length;
  const baseline = median(posts.map((p) => p.value));
  const buckets = (kind: 'day' | 'hour', list = posts) => {
    const groups = new Map<number, number[]>();
    for (const p of list) {
      const key = kind === 'day' ? p.day : Math.floor(p.hour / 2) * 2;
      groups.set(key, [...(groups.get(key) ?? []), p.value]);
    }
    return [...groups].map(([key, xs]) => ({ key, posts: xs.length, typical: median(xs) })).sort((a, b) => a.key - b.key);
  };
  const days = buckets('day');
  const hours = buckets('hour');
  const ranked = (xs: typeof days) => xs.filter((x) => x.posts >= 2)
    .sort((a, b) => b.typical - a.typical || b.posts - a.posts || a.key - b.key);
  // Both overall and per-weekday times use the same supported windows and rounding.
  const observedTime = (list: typeof posts, hour: number) => {
    const times = new Map<number, number>();
    for (const p of list.filter((p) => Math.floor(p.hour / 2) * 2 === hour)) {
      const minutes = Math.min(hour * 60 + 90, Math.round((p.hour * 60 + p.minute) / 30) * 30);
      times.set(minutes, (times.get(minutes) ?? 0) + 1);
    }
    const common = [...times].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    return { hour: Math.floor(common / 60), minute: common % 60,
      value: `${String(Math.floor(common / 60)).padStart(2, '0')}:${String(common % 60).padStart(2, '0')}`, label: clock(common) };
  };
  result.days = days.map((d) => ({ k: SHORT_DAYS[d.key], posts: d.posts, typical: d.typical }));
  result.bands = hours.map((h) => ({ k: windowLabel(h.key), posts: h.posts, typical: h.typical }));
  result.weekdays = result.weekdays.map((day) => {
    const list = posts.filter((p) => p.day === day.day);
    if (!list.length) return day;
    const typical = median(list.map((p) => p.value));
    const windows = buckets('hour', list);
    const winner = ranked(windows.filter((w) => w.posts >= 3 && w.typical > 0))[0];
    return {
      ...day, posts: list.length, typical,
      lift: list.length >= 3 && baseline > 0 ? Math.round((typical / baseline - 1) * 100) : null,
      windows: windows.map((w) => ({ k: windowLabel(w.key), from: w.key, posts: w.posts, typical: w.typical })),
      bestTime: posts.length >= 6 && winner ? {
        ...observedTime(list, winner.key), window: windowLabel(winner.key), posts: winner.posts, typical: winner.typical
      } : null
    };
  });
  // Small samples can show descriptive performance, but cannot produce personal timing advice.
  if (posts.length < 6) return result;
  const winner = ranked(hours.filter((h) => h.posts >= 3))[0];
  // No percentage or personal recommendation when the baseline is zero or there is no clear lift.
  if (!winner || baseline <= 0 || winner.typical / baseline < 1.1) return result;
  // Recommend a weekday with this time only when that combination has actually performed well.
  const inWindow = posts.filter((p) => Math.floor(p.hour / 2) * 2 === winner.key);
  const bestDays = ranked(buckets('day', inWindow)).filter((d) => d.typical > baseline).slice(0, 2).map((d) => d.key);
  const time = observedTime(inWindow, winner.key);
  result.best_band = windowLabel(winner.key);
  result.best_day = bestDays.length ? SHORT_DAYS[bestDays[0]] : null;
  result.recommendation = {
    days: bestDays, hour: time.hour, minute: time.minute, value: time.value,
    window: result.best_band, metric, lift: Math.round((winner.typical / baseline - 1) * 100),
    posts: winner.posts, totalPosts: posts.length
  };
  return result;
}

export const bestSlot = (media: PostingMedia[], now = Date.now()) => postingTimeInsights(media, now).recommendation;
export const slotLabel = (s: PostingSlot) => `${s.days.length ? `${s.days.map((d) => WEEKDAYS[d]).join(' and ')} at ` : ''}${clock(s.hour * 60 + s.minute)} IST`;
export const postingEvidence = (s: PostingSlot) =>
  `Posts in the ${s.window} window had ${s.lift}% higher typical ${s.metric} than your usual post (${s.posts} of ${s.totalPosts} posts, last 90 days).`;

// A starter schedule is available for planning, but is never presented as a measured best time.
const STARTER_SLOT = { days: [4, 0, 6], hour: 19, minute: 30 };
export const schedulingSlot = (media: PostingMedia[], now = Date.now()) => bestSlot(media, now) ?? STARTER_SLOT;

/** Upcoming slots use only supported days when known; time-only evidence can use any day. */
export function nextSlots(media: PostingMedia[], n = 3, now = Date.now()): Date[] {
  const s = schedulingSlot(media, now);
  const today = new Date(now + IST);
  const out: Date[] = [];
  for (let i = 0; out.length < n; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
    if (s.days.length && !s.days.includes(d.getUTCDay())) continue;
    const at = d.getTime() + s.hour * 3600e3 + s.minute * 60e3 - IST;
    if (at > now) out.push(new Date(at));
  }
  return out;
}
