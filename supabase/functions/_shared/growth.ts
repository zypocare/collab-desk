import { postingTimeInsights, slotLabel } from './postingTime.ts';
export { bestSlot, slotLabel } from './postingTime.ts';

// The growth check-up's numbers: why a creator isn't growing and what to change, from her own reels,
// follower history and audience. Pure functions (no database, no AI): the growth-checkup function
// gathers the data and the AI's reading of her captions, and stores what this returns.

export type Media = {
  id: string;
  caption: string | null;
  media_type: string | null;
  product_type: string | null;
  permalink: string | null;
  posted_at: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  saves: number | null;
  shares: number | null;
  avg_watch_ms: number | null;
};
export type Day = { day: string; followers: number };
export type Ideal = { gender: 'women' | 'men' | 'everyone'; age_from: number; age_to: number; city: string };
export type Ai = { topics: { name: string; ids: string[] }[]; ideal: Ideal; bio: string; repeat: string };
export type Topic = { name: string; n: number; views: number; shares1k: number; ids: string[] };
export type Finding = { key: 'audience' | 'shares' | 'mix' | 'watch'; title: string; text: string; big?: boolean };
export type Action = { key: string; title: string; sub: string; kind: 'copy' | 'moments' | 'weekly' | 'check' | 'boost' | 'autopilot' | 'tick'; text?: string };
export type Moment = { name: string; date: string };
export type Checkup = {
  reels: number;
  typical: number;
  followers: number | null;
  week: number | null;
  women: number | null;
  foreign: number | null;
  teens: number | null;
  home: number | null;
  rate: number;
  shares1k: number;
  saves1k: number;
  mix: { stories: number; reels: number; perWeek: number; maxGap: number };
  watch: { cut: number; ratio: number } | null;
  caption: { sentence: number; tags: number } | null;
  days: { best: string; worst: string | null } | null;
  topics: Topic[];
  ideal: Ideal;
  bio: string;
  repeat: string;
  best: { id: string; caption: string; views: number; permalink: string } | null;
  moments: Moment[];
  findings: Finding[];
  verdict: string;
  actions: Action[];
};

const DAY = 864e5;
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const isReel = (m: Media) => m.product_type === 'REELS' || (m.media_type === 'VIDEO' && m.product_type !== 'STORY');
const isStory = (m: Media) => m.product_type === 'STORY';
const per1k = (n: number | null | undefined, v: number) => (v > 0 ? ((n ?? 0) / v) * 1000 : 0);
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pct = (x: number) => Math.round(x * 100);
const fmt = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}K` : n.toLocaleString('en-IN'));
const KARNATAKA = /bengaluru|bangalore|mysuru|mysore|mangaluru|mangalore|hubli|hubballi|belagavi|belgaum|udupi|karnataka/i;
const sameCity = (a: string, b: string) => {
  const n = (s: string) => s.toLowerCase().replace(/bangalore/, 'bengaluru').replace(/bombay/, 'mumbai').split(',')[0].trim();
  return !!a && !!b && n(a) === n(b);
};
const reach = (m: Media) => m.views || m.reach || 0;

export const boostBudget = (followers: number | null) => ((followers ?? 0) >= 100000 ? 500 : (followers ?? 0) >= 20000 ? 300 : 200);

// Days her audience celebrates (dates are fixed or known for this year). Regional ones need her region.
const MOMENTS: (Moment & { kannada?: boolean })[] = [
  { name: 'Kannada Rajyotsava', date: '2026-11-01', kannada: true },
  { name: 'Deepavali', date: '2026-11-08' },
  { name: "Children's Day", date: '2026-11-14' },
  { name: 'Christmas', date: '2026-12-25' },
  { name: "New Year's Eve", date: '2026-12-31' },
  { name: 'Makar Sankranti', date: '2027-01-14' },
  { name: 'Republic Day', date: '2027-01-26' },
  { name: "Valentine's Day", date: '2027-02-14' },
  { name: "Women's Day", date: '2027-03-08' },
];
export function upcomingMoments(city: string, languages: string[], days = 45): Moment[] {
  const kn = KARNATAKA.test(city) || languages.some((l) => /kannada/i.test(l));
  const today = new Date(Date.now() + 330 * 60e3).toISOString().slice(0, 10);
  const until = new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
  return MOMENTS.filter((m) => m.date > today && m.date <= until && (!m.kannada || kn)).slice(0, 2).map(({ name, date }) => ({ name, date }));
}

export type Input = {
  media: Media[];
  hist: Day[];
  ai: Ai;
  city: string;
  languages: string[];
  followers: number | null;
  demographics: Record<string, Record<string, number>>;
};

export function analyse({ media, hist, ai, city, languages, followers, demographics: d }: Input): Checkup {
  const reels = media.filter(isReel).filter((m) => (m.views ?? 0) > 0);
  const v = (m: Media) => m.views ?? 0;
  const typical = Math.round(median(reels.map(v)));
  const now = followers ?? hist[hist.length - 1]?.followers ?? null;
  const weekAgo = hist.find((h) => Date.parse(h.day) >= Date.now() - 8 * DAY)?.followers ?? null;
  // Who follows her.
  const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
  const g = d.gender ?? {};
  const known = (g.F ?? 0) + (g.M ?? 0);
  const women = known > 0 ? (g.F ?? 0) / known : null;
  const foreign = sum(d.country) > 0 ? 1 - (d.country?.IN ?? 0) / sum(d.country) : null;
  const teens = sum(d.age) > 0 ? (d.age?.['13-17'] ?? 0) / sum(d.age) : null;
  const homeCity = ai.ideal.city || city || '';
  const home = sum(d.city) > 0 && homeCity ? Object.entries(d.city ?? {}).filter(([c]) => sameCity(c, homeCity)).reduce((a, [, n]) => a + n, 0) / sum(d.city) : null;
  // Saves and shares.
  const shares1k = median(reels.map((m) => per1k(m.shares, v(m))));
  const saves1k = median(reels.map((m) => per1k(m.saves, v(m))));
  // Reels against stories, and how often.
  const last30 = media.filter((m) => Date.parse(m.posted_at) > Date.now() - 30 * DAY);
  const recent = media.filter(isReel).filter((m) => Date.parse(m.posted_at) > Date.now() - 56 * DAY).map((m) => Date.parse(m.posted_at)).sort((a, b) => b - a);
  const gaps = recent.slice(1).map((t, i) => Math.round((recent[i] - t) / DAY));
  const mix = { stories: last30.filter(isStory).length, reels: last30.filter(isReel).length, perWeek: Math.round((recent.length / 8) * 10) / 10, maxGap: gaps.length ? Math.max(...gaps) : 0 };
  // Watch time.
  const w = reels.filter((m) => (m.avg_watch_ms ?? 0) > 0).sort((a, b) => (a.avg_watch_ms ?? 0) - (b.avg_watch_ms ?? 0));
  let watch: Checkup['watch'] = null;
  if (w.length >= 6) {
    const half = Math.floor(w.length / 2);
    const lo = median(w.slice(0, half).map(v)), hi = median(w.slice(half).map(v));
    const cut = Math.round((w[half].avg_watch_ms ?? 0) / 1000);
    if (lo > 0 && hi / lo >= 1.3) watch = { cut, ratio: Math.round((hi / lo) * 10) / 10 };
  }
  // Captions that start with a sentence vs with hashtags.
  const tagLed = reels.filter((m) => /^\s*(#\w+\s*){1,}/.test(m.caption ?? '') || ((m.caption ?? '').slice(0, 90).match(/#\w+/g)?.length ?? 0) >= 3);
  const sentence = reels.filter((m) => !tagLed.includes(m));
  const caption = tagLed.length >= 2 && sentence.length >= 2 ? { sentence: Math.round(median(sentence.map(v))), tags: Math.round(median(tagLed.map(v))) } : null;
  // Use the same timing evidence as the studio and the scheduled growth plans.
  const timing = postingTimeInsights(media);
  const slot = timing.recommendation;
  const rankedDays = timing.days.filter((d) => d.posts >= 2).sort((a, b) => b.typical - a.typical);
  const worst = rankedDays.length >= 3 ? WEEKDAYS[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(rankedDays[rankedDays.length - 1].k)] : null;
  const days = slot ? { best: slotLabel(slot), worst } : null;
  // Topics (the AI grouped the captions; the numbers are hers).
  const byId = new Map(reels.map((m) => [m.id, m]));
  const topics: Topic[] = ai.topics
    .map((t) => {
      const list = t.ids.map((id) => byId.get(id)).filter((m): m is Media => !!m);
      return { name: t.name, n: list.length, views: Math.round(median(list.map(v))), shares1k: Math.round(median(list.map((m) => per1k(m.shares, v(m)))) * 10) / 10, ids: t.ids };
    })
    .filter((t) => t.n)
    .sort((a, b) => (a.name === 'Everything else' ? 1 : b.name === 'Everything else' ? -1 : b.views - a.views));
  const bestReel = [...reels].sort((a, b) => v(b) - v(a))[0];
  const moments = upcomingMoments(city, languages);

  // What's holding her back, biggest first.
  const findings: Finding[] = [];
  const parts: string[] = [];
  if (women !== null && ai.ideal.gender === 'women' && women < 0.5) parts.push(`only ${pct(women)}% women`);
  if (women !== null && ai.ideal.gender === 'men' && women > 0.5) parts.push(`${pct(women)}% women`);
  if (foreign !== null && foreign > 0.15) parts.push(`${pct(foreign)}% outside India`);
  if (teens !== null && teens > 0.08) parts.push(`${pct(teens)}% aged 13–17`);
  if (home !== null && ai.ideal.city && home < 0.4) parts.push(`${ai.ideal.city} about ${pct(home)}%`);
  if (parts.length >= 2 || (women !== null && ai.ideal.gender === 'women' && women < 0.3))
    findings.push({ key: 'audience', big: true, title: "Followers who don't match your content", text: `Your content is for ${ai.ideal.gender === 'everyone' ? 'people' : ai.ideal.gender} ${ai.ideal.age_from}–${ai.ideal.age_to}${ai.ideal.city ? ` in ${ai.ideal.city}` : ''}, but your followers are ${parts.join(', ')}. Instagram tries each reel on your followers first; when they don't watch, it stops showing it to new people.` });
  if (shares1k + saves1k < 4)
    findings.push({ key: 'shares', title: 'Few saves and shares', text: `${(Math.round(shares1k * 10) / 10).toLocaleString('en-IN')} shares and ${(Math.round(saves1k * 10) / 10).toLocaleString('en-IN')} saves per 1,000 views. Saves and sends are what take a reel to new people.` });
  if (mix.stories > mix.reels || mix.perWeek < 2)
    findings.push({ key: 'mix', title: mix.stories > mix.reels ? 'More stories than reels' : 'Not enough reels', text: `Last 30 days: ${mix.stories} stories, ${mix.reels} reels. About ${mix.perWeek} reels a week lately${mix.maxGap >= 7 ? `, with gaps up to ${mix.maxGap} days` : ''}. Stories only reach people who already follow you.` });
  if (w.length >= 6 && median(w.map((m) => (m.avg_watch_ms ?? 0) / 1000)) < 8)
    findings.push({ key: 'watch', title: 'People leave early', text: `People watch your reels for about ${Math.round(median(w.map((m) => (m.avg_watch_ms ?? 0) / 1000)))} seconds. Show the payoff in the first second and cut the slow parts.` });
  if (!findings.some((f) => f.big) && findings[0]) findings[0].big = true;

  const VERDICT: Record<string, string> = {
    audience: "Your reels reach people, but most of your followers aren't the people your content is for.",
    shares: "People watch your reels, but don't save or send them, so they don't travel to new people.",
    mix: 'Your best work is in reels, but most of what you post is stories that only your followers see.',
    watch: 'People leave your reels before the payoff, so Instagram stops showing them.',
  };
  const verdict = findings[0] ? VERDICT[findings[0].key] : 'Nothing big is holding you back. Do more of what works, a little more often.';

  // What to change, in order.
  const top = topics.filter((t) => t.name !== 'Everything else');
  const shareTop = [...top].sort((a, b) => b.shares1k - a.shares1k)[0];
  const actions: Action[] = [];
  if (ai.bio) actions.push({ key: 'bio', kind: 'copy', title: `Make your page about ${top.slice(0, 2).map((t) => t.name.toLowerCase()).join(', ') || 'one thing'}`, sub: `Bio: “${ai.bio}”`, text: ai.bio });
  if (moments.length) actions.push({ key: `moments-${moments[0].date}`, kind: 'moments', title: moments.map((m) => `${m.name}, ${new Date(m.date + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`).join(' · '), sub: shareTop && shareTop.shares1k >= 5 ? `Your ${shareTop.name.toLowerCase()} reels get ${shareTop.shares1k} shares per 1,000` : 'Post 2–3 days before, so it travels in time' });
  if (top[0]) actions.push({ key: 'weekly', kind: 'weekly', title: `One ${top[0].name.toLowerCase()} reel a week`, sub: ai.repeat || `Your best topic: ${fmt(top[0].views)} views typical` });
  actions.push({ key: 'saves', kind: 'check', title: 'Give people a reason to save and send', sub: 'Places, prices and steps on screen; “Save this” or “Send this to…” at the end' });
  if (findings.some((f) => f.key === 'audience'))
    actions.push({ key: 'boost', kind: 'boost', title: `Show your best reel to ${ai.ideal.gender === 'everyone' ? 'people' : ai.ideal.gender} ${ai.ideal.city ? `in ${ai.ideal.city}` : 'like your audience'}`, sub: `${ai.ideal.gender === 'everyone' ? 'Everyone' : ai.ideal.gender[0].toUpperCase() + ai.ideal.gender.slice(1)} ${ai.ideal.age_from}–${ai.ideal.age_to} · ₹${boostBudget(now)} a day for 3 days` });
  actions.push({ key: 'collab', kind: 'tick', title: 'Make brand and venue posts collab posts', sub: "So the brand's followers see them too" });
  actions.push({ key: 'cadence', kind: 'autopilot', title: `3 reels a week${days ? `, ${days.best}` : ''}`, sub: 'Growth autopilot plans them for you' });
  actions.push({ key: 'status', kind: 'tick', title: 'Check Account status in Instagram', sub: 'Settings › Account status: nothing should be "not eligible for recommendations"' });

  return {
    reels: reels.length,
    typical,
    followers: now,
    week: now !== null && weekAgo !== null ? now - weekAgo : null,
    women,
    foreign,
    teens,
    home,
    rate: Math.round((shares1k + saves1k) * 10) / 10,
    shares1k: Math.round(shares1k * 10) / 10,
    saves1k: Math.round(saves1k * 10) / 10,
    mix,
    watch,
    caption,
    days,
    topics,
    ideal: ai.ideal,
    bio: ai.bio,
    repeat: ai.repeat,
    best: bestReel ? { id: bestReel.id, caption: (bestReel.caption ?? '').split('\n')[0].slice(0, 80), views: v(bestReel), permalink: bestReel.permalink ?? '' } : null,
    moments,
    findings,
    verdict,
    actions,
  };
}
