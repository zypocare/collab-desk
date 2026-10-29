import { postingTimeInsights, POSTING_MEDIA_LIMIT } from './postingTime.ts';
// The Instagram sync: account numbers, posts and their insights, go-live detection with the disclosure
// check, and 7-day results reports for brands.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ig, IgError, type Insights } from './instagram.ts';
import { esc, todayIST } from './admin.ts';
import { sendTelegram, telegramConfigured } from './telegram.ts';
import { consumeContent, postKind, remainingContent, type PromisedContent } from './deliverableProgress.ts';
import { activeCreators } from './creators.ts';
import { saveHealth } from './health.ts';

const DAY = 864e5;
// A post's reach keeps growing for a couple of days while its views update at once, so averages leave
// out posts younger than this.
const SETTLE = 3 * DAY;
type Fmt = 'reels' | 'carousels' | 'photos' | 'stories' | 'other';
const fmtOf = (productType: string | undefined, mediaType: string): Fmt =>
  productType === 'STORY' ? 'stories' : productType === 'REELS' || mediaType === 'VIDEO' ? 'reels' : mediaType === 'CAROUSEL_ALBUM' ? 'carousels' : mediaType === 'IMAGE' ? 'photos' : 'other';
const istDate = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600e3).toISOString().slice(0, 10);
const short = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
const mentions = (caption: string, handle: string) => {
  const h = handle.trim().replace(/^@/, '').toLowerCase();
  if (!h) return false;
  // A full stop right after the handle ends the sentence; it isn't part of a longer handle.
  return new RegExp(`@${h.replace(/[.]/g, '\\.')}(?![a-z0-9_]|\\.[a-z0-9_])`, 'i').test(caption);
};
const adTagged = (caption: string) => /#(ad|collab|sponsored|paidpartnership|partner)(?![a-z])/i.test(caption.trim().split(/\r?\n/)[0]?.slice(0, 140) ?? '');

type MediaRow = {
  id: string; caption: string; media_type: string; product_type: string; permalink: string; posted_at: string; thumbnail_url: string;
  likes: number | null; comments: number | null; saves: number | null; shares: number | null; reach: number | null; views: number | null;
  interactions: number | null; insights_at: string | null; owner_id?: string; avg_watch_ms?: number | null; creator_id?: number;
};

export type SyncOptions = { reportFor?: string };

/** The active creators who have connected Instagram (the timed jobs run once for each). */
export async function connectedCreators(db: SupabaseClient): Promise<number[]> {
  const ids = (await activeCreators(db)).map((c) => c.id);
  if (!ids.length) return [];
  const { data } = await db.from('ig_token').select('id').in('id', ids).order('id');
  return (data ?? []).map((t) => Number(t.id));
}

/** One creator's sync. Her token and account rows have her creator id as their id; every other row is tagged with creator_id. */
export async function runSync(db: SupabaseClient, creator: number, opts: SyncOptions = {}) {
  const summary: Record<string, unknown> = {};
  const { data: tokenRow } = await db.from('ig_token').select('*').eq('id', creator).maybeSingle();
  if (!tokenRow) {
    await db.from('ig_account').update({ connected: false }).eq('id', creator);
    return { skipped: 'Instagram is not connected' };
  }
  let token: string = tokenRow.access_token;

  try {
    // 1. Keep the 60-day token fresh.
    const expires = tokenRow.expires_at ? Date.parse(tokenRow.expires_at) : 0;
    if (expires - Date.now() < 10 * DAY && Date.now() - Date.parse(tokenRow.obtained_at) > DAY) {
      const r = await ig.refresh(token);
      token = r.token;
      await db.from('ig_token').update({ access_token: token, obtained_at: new Date().toISOString(), expires_at: new Date(Date.now() + r.expiresIn * 1000).toISOString() }).eq('id', creator);
      summary.refreshed = true;
    }

    // 2. Account.
    const p = await ig.profile(token);
    // A different account was connected: the old one's follower history means nothing for this one.
    const { data: before } = await db.from('ig_account').select('ig_user_id').eq('id', creator).maybeSingle();
    // An Instagram account belongs to one creator only.
    const { data: owner } = await db.from('ig_account').select('id').eq('ig_user_id', p.user_id).neq('id', creator).limit(1);
    if (owner?.length) throw new IgError(`@${p.username} is already connected to another creator on Miracle.`);
    const switched = !!before?.ig_user_id && before.ig_user_id !== p.user_id;
    if (switched) await db.from('ig_followers_history').delete().eq('creator_id', creator);
    await db.from('ig_followers_history').upsert({ creator_id: creator, day: todayIST(), followers: p.followers_count }, { onConflict: 'creator_id,day' });

    // 3. Posts.
    const list = await ig.media(token, 60);
    const { data: existing } = await db.from('ig_media').select('id, insights_at, views, reach, avg_watch_ms').eq('creator_id', creator).in('id', list.map((m) => m.id));
    const hasWatch = new Set((existing ?? []).filter((e) => e.avg_watch_ms !== null).map((e) => e.id));
    // A post whose figures came back empty counts as never fetched, so it is tried again.
    const lastInsights = new Map((existing ?? []).map((e) => [e.id, (e.views === null && e.reach === null ? null : e.insights_at) as string | null]));
    const { data: linkedRows } = await db.from('collab_posts').select('media_id').eq('creator_id', creator);
    const linked = new Set((linkedRows ?? []).map((l) => l.media_id));

    // The posts that make the averages: per format, the 12 newest that are at least 3 days old.
    const forAverages = new Set<string>();
    const perFmt: Partial<Record<Fmt, number>> = {};
    for (const m of list) {
      if (Date.now() - Date.parse(m.timestamp) < SETTLE) continue;
      const f = fmtOf(m.media_product_type, m.media_type);
      perFmt[f] = (perFmt[f] ?? 0) + 1;
      if (perFmt[f]! <= 12) forAverages.add(m.id);
    }

    const rows: MediaRow[] = [];
    for (const [i, m] of list.entries()) {
      // Detailed figures for the newest 12 posts, the posts that make the averages, anything from the
      // last 45 days, and posts linked to a collab.
      const recent = i < 12 || forAverages.has(m.id) || Date.now() - Date.parse(m.timestamp) < 45 * DAY || linked.has(m.id) || opts.reportFor !== undefined;
      const stale = !lastInsights.get(m.id) || Date.now() - Date.parse(lastInsights.get(m.id)!) > 20 * 3600e3;
      let ins: Insights | null = null;
      if (recent && (stale || opts.reportFor)) ins = await ig.insights(token, m.id);
      if (ins && !Object.keys(ins).length) ins = null; // nothing came back: keep what we had, retry next time
      const likes = ins?.likes ?? m.like_count ?? null;
      const comments = ins?.comments ?? m.comments_count ?? null;
      const row: MediaRow = {
        id: m.id, caption: m.caption ?? '', media_type: m.media_type, product_type: m.media_product_type ?? '', permalink: m.permalink,
        posted_at: m.timestamp, thumbnail_url: m.thumbnail_url || m.media_url || '', likes, comments,
        saves: ins?.saved ?? null, shares: ins?.shares ?? null, reach: ins?.reach ?? null, views: ins?.views ?? null,
        interactions: ins?.total_interactions ?? ((likes ?? 0) + (comments ?? 0) + (ins?.saved ?? 0) + (ins?.shares ?? 0)),
        insights_at: ins ? new Date().toISOString() : lastInsights.get(m.id) ?? null, owner_id: p.user_id, creator_id: creator,
      };
      // Don't wipe stored insights when this run skipped them.
      if (!ins && lastInsights.get(m.id)) for (const k of ['saves', 'shares', 'reach', 'views', 'interactions'] as const) delete (row as Partial<MediaRow>)[k];
      // Reels: average watch time per view, with the other figures (or once, for Reels stored before it existed).
      if (recent && fmtOf(m.media_product_type, m.media_type) === 'reels' && (ins || !hasWatch.has(m.id))) {
        const w = await ig.watchTime(token, m.id);
        if (w !== null || ins) row.avg_watch_ms = w;
      }
      rows.push(row);
    }
    // Save posts in groups with the same fields: in one mixed batch the database fills fields a post
    // doesn't carry with blanks, wiping what was stored.
    const groups = new Map<string, MediaRow[]>();
    for (const r of rows) {
      const key = Object.keys(r).sort().join(',');
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    for (const g of groups.values()) await db.from('ig_media').upsert(g);
    summary.posts = rows.length;
    // Posts from another account (one connected before) don't count towards her numbers.
    let others = db.from('ig_media').delete({ count: 'exact' }).eq('creator_id', creator).or(`owner_id.is.null,owner_id.neq.${p.user_id}`);
    if (linked.size) others = others.not('id', 'in', `(${[...linked].map((x) => `"${x}"`).join(',')})`);
    const { count: removed } = await others;
    if (removed) summary.removed_other_account = removed;

    // 4. Account averages from the last 12 posts that are at least 3 days old.
    const settledBefore = new Date(Date.now() - SETTLE).toISOString();
    const { data: last12 } = await db.from('ig_media').select('views, reach, interactions, likes, comments').eq('creator_id', creator).neq('product_type', 'STORY').lt('posted_at', settledBefore).order('posted_at', { ascending: false }).limit(12);
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => typeof x === 'number');
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    // Posts without detailed figures still count with their likes and comments.
    const avgInteractions = avg((last12 ?? []).map((r) => r.interactions ?? (r.likes === null && r.comments === null ? null : (r.likes ?? 0) + (r.comments ?? 0))));
    const engagement = avgInteractions !== null && p.followers_count ? Math.round((avgInteractions / p.followers_count) * 10000) / 100 : null;
    const avgViews = avg((last12 ?? []).map((r) => r.views));
    const avgReach = avg((last12 ?? []).map((r) => r.reach));

    // 4b. What brands ask for: the last 30 days (and the 30 before, for the change), averages per
    // format over 90 days, and follower growth.
    const now = new Date();
    const [cur, prev] = await Promise.all([
      ig.accountTotals(token, new Date(Date.now() - 30 * DAY), now).catch(() => ({})),
      ig.accountTotals(token, new Date(Date.now() - 60 * DAY), new Date(Date.now() - 30 * DAY)).catch(() => ({})),
    ]);
    // Her most recent posts of each kind (whatever their dates: she may not have posted lately).
    const { data: m90 } = await db.from('ig_media').select('id, caption, media_type, product_type, posted_at, views, reach, interactions, likes, comments, saves, shares, avg_watch_ms')
      .eq('creator_id', creator).order('posted_at', { ascending: false }).limit(POSTING_MEDIA_LIMIT);
    type Post = NonNullable<typeof m90>[number];
    const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => typeof x === 'number');
    const median = (xs: (number | null | undefined)[]) => {
      const v = nums(xs).sort((a, b) => a - b);
      if (!v.length) return null;
      const h = Math.floor(v.length / 2);
      return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
    };
    const round = (n: number | null, dp = 0) => (n === null ? null : Math.round(n * 10 ** dp) / 10 ** dp);
    const interOf = (r: Post) => r.interactions ?? (r.likes === null && r.comments === null ? null : (r.likes ?? 0) + (r.comments ?? 0));
    const fmtStats = (xs: Post[]) => {
      const inter = avg(xs.map(interOf));
      // Saves and shares per 100 accounts reached: the strongest signs people found it worth keeping.
      const withReach = xs.filter((r) => r.reach);
      return {
        // posts: how many were looked at; measured: how many had Instagram's views/reach (the averages' basis).
        posts: xs.length, measured: xs.filter((r) => r.views !== null || r.reach !== null).length,
        avg_views: round(avg(xs.map((r) => r.views))), avg_reach: round(avg(xs.map((r) => r.reach))),
        // "Typical": the middle post, so one viral post doesn't pull it up.
        med_views: round(median(xs.map((r) => r.views))), med_reach: round(median(xs.map((r) => r.reach))),
        avg_interactions: round(inter),
        avg_watch_ms: round(avg(xs.map((r) => r.avg_watch_ms))),
        save_rate: round(avg(withReach.filter((r) => r.saves !== null).map((r) => (r.saves! / r.reach!) * 100)), 2),
        share_rate: round(avg(withReach.filter((r) => r.shares !== null).map((r) => (r.shares! / r.reach!) * 100)), 2),
        er: inter !== null && p.followers_count ? Math.round((inter / p.followers_count) * 10000) / 100 : null,
      };
    };
    // Feed posts younger than 3 days are left out (their reach is still growing). Stories keep the figures
    // saved within their 24 hours, so they all count.
    const all90 = (m90 ?? []).filter((r) => r.product_type === 'STORY' || Date.parse(r.posted_at) < Date.now() - SETTLE);
    const isStory = (r: { product_type: string }) => r.product_type === 'STORY';
    const recent12 = <T,>(xs: T[]) => xs.slice(0, 12);
    const formats = {
      reels: fmtStats(recent12(all90.filter((r) => !isStory(r) && (r.product_type === 'REELS' || r.media_type === 'VIDEO')))),
      carousels: fmtStats(recent12(all90.filter((r) => !isStory(r) && r.media_type === 'CAROUSEL_ALBUM'))),
      photos: fmtStats(recent12(all90.filter((r) => !isStory(r) && r.media_type === 'IMAGE'))),
      stories: fmtStats(recent12(all90.filter(isStory))),
    };

    // Settled feed posts with Instagram's figures: the basis for the comparisons below.
    const feed = all90.filter((r) => !isStory(r) && (r.views !== null || r.reach !== null));

    // Sponsored (linked to a collab, or tagged #ad/#collab/...) against regular posts.
    const isSponsored = (r: Post) => linked.has(r.id) || adTagged(r.caption ?? '');
    const sp = recent12(feed.filter(isSponsored)), reg = recent12(feed.filter((r) => !isSponsored(r)));
    const sponsored = sp.length >= 2 && reg.length >= 2 ? { sponsored: fmtStats(sp), regular: fmtStats(reg) } : null;

    // Topics from captions and hashtags: which kinds of content get the most views.
    const TOPICS: [string, RegExp][] = [
      ['Fashion', /#?(ootd|fashion|outfit|style|styleinspo|saree|lehenga|kurta|dress|wear|lookbook|grwm)\b/i],
      ['Travel', /#?(travel|trip|wanderlust|travelgram|beach|mountains?|explore|vacation|holiday|hotel|staycation|resort|itinerary)\b/i],
      ['Yoga & fitness', /#?(yoga|fitness|workout|gym|asana|pilates|running|fit|stretch)\b/i],
      ['Beauty', /#?(makeup|skincare|skin|beauty|lipstick|serum|hair|nails|glow)\b/i],
      ['Food', /#?(food|foodie|cafe|restaurant|recipe|brunch|dessert|coffee|eats)\b/i],
      ['Wellness', /#?(wellness|mindful|mindfulness|meditation|selfcare|self-care|healthy|health)\b/i],
      ['Lifestyle', /#?(lifestyle|dayinmylife|vlog|home|decor|routine)\b/i],
      ['Tech', /#?(tech|gadget|phone|unboxing|laptop|camera)\b/i],
    ];
    const topics = TOPICS.map(([k, re]) => {
      const xs = feed.filter((r) => re.test(r.caption ?? '')).slice(0, 20);
      const st = fmtStats(xs);
      return { k, posts: xs.length, med_views: st.med_views, avg_views: st.avg_views, med_reach: st.med_reach };
    }).filter((x) => x.posts >= 2 && x.med_views !== null).sort((a, b) => b.med_views! - a.med_views!).slice(0, 6);

    // Store the same recommendation and evidence used by Grow and collab scheduling.
    const best_time = postingTimeInsights(m90 ?? [], now.getTime());

    const followersOn = async (daysAgo: number) =>
      // The count on (or just before) that day; nothing if the history doesn't go back that far yet.
      (await db.from('ig_followers_history').select('followers').eq('creator_id', creator).lte('day', new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10)).order('day', { ascending: false }).limit(1)).data?.[0]?.followers ?? null;
    const [f30, f90] = await Promise.all([followersOn(30), followersOn(90)]);
    const insights = {
      from: new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10),
      totals: cur, prev, formats, sponsored, topics, best_time,
      growth: { d30: f30 === null ? null : p.followers_count - f30, d90: f90 === null ? null : p.followers_count - f90 },
    };

    // Monthly snapshot (this month, updated each sync), and last month from the 30 days before if missing.
    const monthOf = (d: Date) => `${istDate(d.toISOString()).slice(0, 7)}-01`;
    const t30 = cur as Record<string, number>, p30 = prev as Record<string, number>;
    await db.from('ig_monthly').upsert({
      creator_id: creator, month: monthOf(now), followers: p.followers_count, reach: t30.reach ?? null, views: t30.views ?? null, engaged: t30.accounts_engaged ?? null,
      interactions: t30.total_interactions ?? null, er: engagement, reels_er: formats.reels.er, updated_at: now.toISOString(),
    }, { onConflict: 'creator_id,month' });
    if (p30.reach || p30.views) {
      await db.from('ig_monthly').upsert({
        creator_id: creator, month: monthOf(new Date(Date.now() - 30 * DAY)), followers: f30, reach: p30.reach ?? null, views: p30.views ?? null,
        engaged: p30.accounts_engaged ?? null, interactions: p30.total_interactions ?? null, er: null, reels_er: null,
      }, { onConflict: 'creator_id,month', ignoreDuplicates: true });
    }

    // 5. Audience, once a week.
    const { data: acct } = await db.from('ig_account').select('demographics, demographics_at').eq('id', creator).maybeSingle();
    const demographicsStale = switched || !acct?.demographics_at || !acct.demographics?.country || Date.now() - Date.parse(acct.demographics_at) > 7 * DAY;
    let demographics = acct?.demographics ?? {};
    if (demographicsStale) {
      const fresh = await ig.demographics(token).catch(() => ({}));
      // Keep last week's audience if Instagram sent nothing, unless it may belong to another account.
      if (Object.keys(fresh).length) demographics = fresh;
      else if (switched || !acct?.demographics_at) demographics = {};
    }

    // An upsert: a creator who has just connected may not have an account row yet.
    const { error: saveError } = await db.from('ig_account').upsert({
      id: creator, connected: true, ig_user_id: p.user_id, username: p.username, name: p.name ?? '', profile_picture_url: p.profile_picture_url ?? '',
      followers: p.followers_count, follows: p.follows_count, media_count: p.media_count,
      engagement_rate: engagement, avg_views: avgViews === null ? null : Math.round(avgViews), avg_reach: avgReach === null ? null : Math.round(avgReach),
      demographics, ...(demographicsStale ? { demographics_at: new Date().toISOString() } : {}), insights, last_sync_at: new Date().toISOString(), last_error: '', updated_at: new Date().toISOString(),
      token_expires_at: (await db.from('ig_token').select('expires_at').eq('id', creator).single()).data?.expires_at,
    });
    if (saveError) throw new Error(saveError.message);
    // The brand page shows these. Engagement is her Reels engagement when there is one (what Insights leads with),
    // else across all posts, in full (4.34%).
    const shownEr = formats.reels.er || engagement;
    await db.from('creator_settings').update({ followers: short(p.followers_count), ...(shownEr ? { engagement: `${+Number(shownEr).toFixed(2)}%` } : {}) }).eq('id', creator);

    // 5b. Audience health and brand safety (brands see it before booking). Never stops the sync.
    summary.health = await saveHealth(db, creator, p.followers_count, demographics).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));

    // 6. Go-live detection and disclosure check.
    summary.detected = await detectPosts(db, creator, rows);

    // 7. 7-day results reports.
    summary.reports = await makeReports(db, creator, opts.reportFor);
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from('ig_account').update({ last_error: message.slice(0, 300), connected: !(e instanceof IgError && e.code === 190) }).eq('id', creator);
    throw e;
  }
}

/**
 * Stories: saves their numbers while Instagram still has them (24 hours). Runs every 2 hours.
 * A Story whose text tags a brand is linked like a post; on a collab's go-live day, a Story is
 * also linked to the one collab that day with a Story deliverable.
 */
export async function runStorySync(db: SupabaseClient, creator: number) {
  const { data: tokenRow } = await db.from('ig_token').select('access_token').eq('id', creator).maybeSingle();
  if (!tokenRow) return { skipped: 'Instagram is not connected' };
  const token: string = tokenRow.access_token;

  const stories = await ig.stories(token);
  if (!stories.length) return { stories: 0 };
  const { data: acct } = await db.from('ig_account').select('ig_user_id').eq('id', creator).maybeSingle();

  const rows: MediaRow[] = [];
  for (const m of stories) {
    const ins = await ig.storyInsights(token, m.id);
    rows.push({
      id: m.id, caption: m.caption ?? '', media_type: m.media_type, product_type: 'STORY', permalink: m.permalink,
      posted_at: m.timestamp, thumbnail_url: m.thumbnail_url || m.media_url || '', likes: null, comments: ins.replies ?? null,
      saves: null, shares: ins.shares ?? null, reach: ins.reach ?? null, views: ins.views ?? null,
      interactions: ins.total_interactions ?? null, insights_at: new Date().toISOString(), owner_id: acct?.ig_user_id ?? undefined, creator_id: creator,
    });
  }
  await db.from('ig_media').upsert(rows);

  // Tagged in the Story text: same handling as posts (links it, moves the collab to Live, tells her).
  const detected = await detectPosts(db, creator, rows);

  // Go-live day match: one collab, a Story deliverable, live today.
  const { data: links } = await db.from('collab_posts').select('media_id').eq('creator_id', creator);
  const taken = new Set((links ?? []).map((l) => l.media_id));
  const { data: collabs } = await db
    .from('collabs')
    .select('id, code, stage, live_date, brand:brands(name), deliverables(kind, qty, done, items:deliverable_items(status))')
    .eq('creator_id', creator)
    .in('stage', ['confirmed', 'creating', 'live']);
  type C = { id: string; code: string; stage: string; live_date: string | null; brand: { name: string }; deliverables: PromisedContent[] };
  let linked = 0;
  for (const r of rows) {
    if (taken.has(r.id)) continue;
    const day = istDate(r.posted_at);
    const match = ((collabs ?? []) as unknown as C[]).filter((c) => c.live_date === day && remainingContent(c.deliverables, 'Story') > 0);
    if (match.length !== 1) continue;
    const c = match[0];
    const { error } = await db.from('collab_posts').insert({ collab_id: c.id, media_id: r.id, matched_by: 'date' });
    if (error) continue;
    consumeContent(c.deliverables, 'Story');
    await db.from('collab_events').insert({ collab_id: c.id, kind: 'post', text: 'Story saved from Instagram (its numbers are kept after it disappears)', visible_to_brand: true });
    taken.add(r.id);
    linked++;
  }
  return { stories: rows.length, detected, linked };
}

async function notifyCreator(db: SupabaseClient, creator: number, kind: string, payload: Record<string, unknown>, telegram: string) {
  const { data: s } = await db.from('creator_settings').select('creator_email, telegram_chat_id').eq('id', creator).single();
  if (!s) return;
  await db.from('outbox').insert({ creator_id: creator, kind, to_email: s.creator_email, payload });
  if (telegramConfigured && s.telegram_chat_id) await sendTelegram(s.telegram_chat_id, telegram).catch(() => {});
}

async function detectPosts(db: SupabaseClient, creator: number, media: MediaRow[]) {
  const { data: links } = await db.from('collab_posts').select('media_id').eq('creator_id', creator);
  const taken = new Set((links ?? []).map((l) => l.media_id));
  const { data: collabs } = await db
    .from('collabs')
    .select('id, code, stage, received_on, live_date, checklist, contact_name, brief_details, brand:brands(name, instagram), posts:collab_posts(media_id), deliverables(kind, qty, done, items:deliverable_items(status))')
    .eq('creator_id', creator)
    .in('stage', ['confirmed', 'creating', 'live']);
  type C = { id: string; code: string; stage: string; received_on: string; live_date: string | null; checklist: Record<string, boolean>; brief_details: { hashtags?: string[]; mentions?: string[] } | null; brand: { name: string; instagram: string }; posts: { media_id: string }[]; deliverables: PromisedContent[] };
  const candidates = ((collabs ?? []) as unknown as C[]).filter((c) => c.brand?.instagram);

  let found = 0;
  for (const m of [...media].sort((a, b) => a.posted_at.localeCompare(b.posted_at))) {
    if (taken.has(m.id)) continue;
    const day = istDate(m.posted_at);
    const kind = postKind(m.product_type, m.media_type);
    const c = candidates
      .filter((x) => mentions(m.caption, x.brand.instagram) && day >= x.received_on && remainingContent(x.deliverables, kind) > 0)
      .sort((a, b) => (a.stage === 'live' ? 1 : 0) - (b.stage === 'live' ? 1 : 0))[0];
    if (!c) continue;

    const hasAd = adTagged(m.caption);
    // Hashtags and @mentions the brief asked for that the caption doesn't have.
    const capLower = m.caption.toLowerCase();
    const missingItems = [...(c.brief_details?.mentions ?? []), ...(c.brief_details?.hashtags ?? [])].filter((t) => !capLower.includes(t.toLowerCase()));
    const { error } = await db.from('collab_posts').insert({ collab_id: c.id, media_id: m.id, matched_by: 'auto' });
    if (error) continue;
    taken.add(m.id);
    found++;
    consumeContent(c.deliverables, kind);
    await db.from('collab_events').insert({ collab_id: c.id, kind: 'post', text: `Post spotted on Instagram: ${m.permalink}`, visible_to_brand: true });
    const checklist = { ...c.checklist, brand_tag: true, ad_tag: hasAd || !!c.checklist?.ad_tag };
    if (c.stage !== 'live') {
      // Moving to Live emails the brand ("Live on Instagram") through the normal stage trigger.
      await db.from('collabs').update({ stage: 'live', live_date: day, checklist }).eq('id', c.id);
    } else {
      await db.from('collabs').update({ checklist }).eq('id', c.id);
    }
    await notifyCreator(
      db, creator, 'post_detected',
      { code: c.code, brand: c.brand.name, permalink: m.permalink, missing_ad: !hasAd, missing_items: missingItems },
      `📸 Your post for <b>${esc(c.brand.name)}</b> is live and moved to Live.${hasAd ? '' : '\n⚠️ The caption has no #ad or #collab in the first line. Add it to follow ASCI rules.'}${missingItems.length ? `\n⚠️ The brief asked for: ${esc(missingItems.join(' '))}` : ''}`,
    );
    c.stage = 'live';
    c.checklist = checklist;
  }
  return found;
}

async function makeReports(db: SupabaseClient, creator: number, reportFor?: string) {
  const { data: s } = await db.from('creator_settings').select('report_mode, display_name, handle').eq('id', creator).single();
  if (!s || (s.report_mode === 'off' && !reportFor)) return 0;
  const { data: acct } = await db.from('ig_account').select('followers, username').eq('id', creator).maybeSingle();

  let q = db
    .from('collabs')
    .select('id, code, contact_name, brand:brands(name, instagram), deliverables(kind, qty), posts:collab_posts(media:ig_media(*)), reports:brand_reports(id)')
    .eq('creator_id', creator)
    .in('stage', ['live', 'wrapped']);
  if (reportFor) q = q.eq('id', reportFor);
  const { data } = await q;
  type C = { id: string; code: string; contact_name: string; brand: { name: string; instagram: string }; deliverables: { kind: string; qty: number }[]; posts: { media: MediaRow }[]; reports: { id: string }[] };

  let made = 0;
  for (const c of (data ?? []) as unknown as C[]) {
    const posts = c.posts.map((p) => p.media).filter(Boolean);
    if (!posts.length) continue;
    const lastPosted = Math.max(...posts.map((p) => Date.parse(p.posted_at)));
    if (!reportFor && (c.reports.length || Date.now() - lastPosted < 7 * DAY)) continue;

    const sum = (k: keyof MediaRow) => posts.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const has = (k: keyof MediaRow) => posts.some((p) => typeof p[k] === 'number');
    const totals = {
      views: has('views') ? sum('views') : null, reach: has('reach') ? sum('reach') : null, likes: sum('likes'), comments: sum('comments'),
      saves: has('saves') ? sum('saves') : null, shares: has('shares') ? sum('shares') : null, interactions: sum('interactions'),
    };
    // The tracked link's taps and the orders from the code, as they stand today.
    const { data: link } = await db.from('collab_links').select('clicks, promo_code, sales, revenue').eq('collab_id', c.id).maybeSingle();
    const data = {
      brand: c.brand.name, brand_handle: c.brand.instagram, code: c.code,
      ...(link ? { link: { clicks: link.clicks, promo_code: link.promo_code, sales: link.sales, revenue: link.revenue } } : {}),
      creator: { name: s.display_name, handle: acct?.username || s.handle, followers: acct?.followers ?? null },
      deliverables: c.deliverables.map((d) => `${d.qty} ${d.qty > 1 ? (d.kind === 'Story' ? 'Stories' : `${d.kind}s`) : d.kind}`).join(', '),
      days_after: Math.max(1, Math.round((Date.now() - Math.min(...posts.map((p) => Date.parse(p.posted_at)))) / DAY)),
      posts: posts.sort((a, b) => a.posted_at.localeCompare(b.posted_at)).map((p) => ({
        permalink: p.permalink, type: p.product_type === 'REELS' ? 'Reel' : p.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post',
        posted_at: p.posted_at, thumbnail: p.thumbnail_url, views: p.views, reach: p.reach, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares, interactions: p.interactions,
      })),
      totals,
      engagement_rate: totals.reach ? Math.round((totals.interactions / totals.reach) * 10000) / 100 : null,
      generated_at: new Date().toISOString(),
    };
    const status = s.report_mode === 'auto' && !reportFor ? 'sent' : 'ready';
    await db.from('brand_reports').insert({ collab_id: c.id, data, status });
    if (status === 'ready' && !reportFor) {
      await notifyCreator(db, creator, 'report_ready', { code: c.code, brand: c.brand.name, views: totals.views, reach: totals.reach },
        `📊 The results report for <b>${esc(c.brand.name)}</b> is ready. Check it and send it from the collab panel.`);
    }
    made++;
  }
  return made;
}
