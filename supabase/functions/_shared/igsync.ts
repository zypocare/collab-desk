// The Instagram sync: account numbers, posts and their insights, go-live detection with the disclosure
// check, and 7-day results reports for brands.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ig, IgError, type Insights } from './instagram.ts';
import { esc, todayIST } from './admin.ts';
import { sendTelegram, telegramConfigured } from './telegram.ts';

const DAY = 864e5;
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
  interactions: number | null; insights_at: string | null;
};

export type SyncOptions = { reportFor?: string };

export async function runSync(db: SupabaseClient, opts: SyncOptions = {}) {
  const summary: Record<string, unknown> = {};
  const { data: tokenRow } = await db.from('ig_token').select('*').eq('id', 1).maybeSingle();
  if (!tokenRow) {
    await db.from('ig_account').update({ connected: false }).eq('id', 1);
    return { skipped: 'Instagram is not connected' };
  }
  let token: string = tokenRow.access_token;

  try {
    // 1. Keep the 60-day token fresh.
    const expires = tokenRow.expires_at ? Date.parse(tokenRow.expires_at) : 0;
    if (expires - Date.now() < 10 * DAY && Date.now() - Date.parse(tokenRow.obtained_at) > DAY) {
      const r = await ig.refresh(token);
      token = r.token;
      await db.from('ig_token').update({ access_token: token, obtained_at: new Date().toISOString(), expires_at: new Date(Date.now() + r.expiresIn * 1000).toISOString() }).eq('id', 1);
      summary.refreshed = true;
    }

    // 2. Account.
    const p = await ig.profile(token);
    await db.from('ig_followers_history').upsert({ day: todayIST(), followers: p.followers_count });

    // 3. Posts.
    const list = await ig.media(token, 40);
    const { data: existing } = await db.from('ig_media').select('id, insights_at').in('id', list.map((m) => m.id));
    const lastInsights = new Map((existing ?? []).map((e) => [e.id, e.insights_at as string | null]));
    const { data: linkedRows } = await db.from('collab_posts').select('media_id');
    const linked = new Set((linkedRows ?? []).map((l) => l.media_id));

    const rows: MediaRow[] = [];
    for (const [i, m] of list.entries()) {
      // Detailed figures for the newest 12 posts (they make the averages), anything from the last
      // 45 days, and posts linked to a collab.
      const recent = i < 12 || Date.now() - Date.parse(m.timestamp) < 45 * DAY || linked.has(m.id) || opts.reportFor !== undefined;
      const stale = !lastInsights.get(m.id) || Date.now() - Date.parse(lastInsights.get(m.id)!) > 20 * 3600e3;
      let ins: Insights | null = null;
      if (recent && (stale || opts.reportFor)) ins = await ig.insights(token, m.id);
      const likes = ins?.likes ?? m.like_count ?? null;
      const comments = ins?.comments ?? m.comments_count ?? null;
      const row: MediaRow = {
        id: m.id, caption: m.caption ?? '', media_type: m.media_type, product_type: m.media_product_type ?? '', permalink: m.permalink,
        posted_at: m.timestamp, thumbnail_url: m.thumbnail_url || m.media_url || '', likes, comments,
        saves: ins?.saved ?? null, shares: ins?.shares ?? null, reach: ins?.reach ?? null, views: ins?.views ?? null,
        interactions: ins?.total_interactions ?? ((likes ?? 0) + (comments ?? 0) + (ins?.saved ?? 0) + (ins?.shares ?? 0)),
        insights_at: ins ? new Date().toISOString() : lastInsights.get(m.id) ?? null,
      };
      // Don't wipe stored insights when this run skipped them.
      if (!ins && lastInsights.get(m.id)) for (const k of ['saves', 'shares', 'reach', 'views', 'interactions'] as const) delete (row as Partial<MediaRow>)[k];
      rows.push(row);
    }
    if (rows.length) await db.from('ig_media').upsert(rows);
    summary.posts = rows.length;

    // 4. Account averages from the last 12 posts.
    const { data: last12 } = await db.from('ig_media').select('views, reach, interactions, likes, comments').neq('product_type', 'STORY').order('posted_at', { ascending: false }).limit(12);
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
    const { data: m90 } = await db.from('ig_media').select('media_type, product_type, views, reach, interactions, likes, comments')
      .gte('posted_at', new Date(Date.now() - 90 * DAY).toISOString());
    const fmtStats = (xs: { views: number | null; reach: number | null; interactions: number | null; likes: number | null; comments: number | null }[]) => {
      const inter = avg(xs.map((r) => r.interactions ?? (r.likes === null && r.comments === null ? null : (r.likes ?? 0) + (r.comments ?? 0))));
      const v = avg(xs.map((r) => r.views));
      const re = avg(xs.map((r) => r.reach));
      return {
        posts: xs.length, avg_views: v === null ? null : Math.round(v), avg_reach: re === null ? null : Math.round(re),
        avg_interactions: inter === null ? null : Math.round(inter),
        er: inter !== null && p.followers_count ? Math.round((inter / p.followers_count) * 10000) / 100 : null,
      };
    };
    const all90 = m90 ?? [];
    const isStory = (r: { product_type: string }) => r.product_type === 'STORY';
    const formats = {
      reels: fmtStats(all90.filter((r) => !isStory(r) && (r.product_type === 'REELS' || r.media_type === 'VIDEO'))),
      carousels: fmtStats(all90.filter((r) => !isStory(r) && r.media_type === 'CAROUSEL_ALBUM')),
      photos: fmtStats(all90.filter((r) => !isStory(r) && r.media_type === 'IMAGE')),
      stories: fmtStats(all90.filter(isStory)),
    };
    const followersOn = async (daysAgo: number) =>
      // The count on (or just before) that day; nothing if the history doesn't go back that far yet.
      (await db.from('ig_followers_history').select('followers').lte('day', new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10)).order('day', { ascending: false }).limit(1)).data?.[0]?.followers ?? null;
    const [f30, f90] = await Promise.all([followersOn(30), followersOn(90)]);
    const insights = {
      from: new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10),
      totals: cur, prev, formats,
      growth: { d30: f30 === null ? null : p.followers_count - f30, d90: f90 === null ? null : p.followers_count - f90 },
    };

    // 5. Audience, once a week.
    const { data: acct } = await db.from('ig_account').select('demographics, updated_at').eq('id', 1).single();
    const demographicsStale = !acct?.demographics || !acct.demographics.country || Date.now() - Date.parse(acct.updated_at) > 7 * DAY;
    const demographics = demographicsStale ? await ig.demographics(token) : acct.demographics;

    await db.from('ig_account').update({
      connected: true, ig_user_id: p.user_id, username: p.username, name: p.name ?? '', profile_picture_url: p.profile_picture_url ?? '',
      followers: p.followers_count, follows: p.follows_count, media_count: p.media_count,
      engagement_rate: engagement, avg_views: avgViews === null ? null : Math.round(avgViews), avg_reach: avgReach === null ? null : Math.round(avgReach),
      demographics, insights, last_sync_at: new Date().toISOString(), last_error: '', updated_at: new Date().toISOString(),
      token_expires_at: (await db.from('ig_token').select('expires_at').eq('id', 1).single()).data?.expires_at,
    }).eq('id', 1);
    // The brand page shows these.
    await db.from('creator_settings').update({ followers: short(p.followers_count), ...(engagement !== null ? { engagement: `${engagement}%` } : {}) }).eq('id', 1);

    // 6. Go-live detection and disclosure check.
    summary.detected = await detectPosts(db, rows);

    // 7. 7-day results reports.
    summary.reports = await makeReports(db, opts.reportFor);
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from('ig_account').update({ last_error: message.slice(0, 300), connected: !(e instanceof IgError && e.code === 190) }).eq('id', 1);
    throw e;
  }
}

/**
 * Stories: saves their numbers while Instagram still has them (24 hours). Runs every 2 hours.
 * A Story whose text tags a brand is linked like a post; on a collab's go-live day, a Story is
 * also linked to the one collab that day with a Story deliverable.
 */
export async function runStorySync(db: SupabaseClient) {
  const { data: tokenRow } = await db.from('ig_token').select('access_token').eq('id', 1).maybeSingle();
  if (!tokenRow) return { skipped: 'Instagram is not connected' };
  const token: string = tokenRow.access_token;

  const stories = await ig.stories(token);
  if (!stories.length) return { stories: 0 };

  const rows: MediaRow[] = [];
  for (const m of stories) {
    const ins = await ig.storyInsights(token, m.id);
    rows.push({
      id: m.id, caption: m.caption ?? '', media_type: m.media_type, product_type: 'STORY', permalink: m.permalink,
      posted_at: m.timestamp, thumbnail_url: m.thumbnail_url || m.media_url || '', likes: null, comments: ins.replies ?? null,
      saves: null, shares: ins.shares ?? null, reach: ins.reach ?? null, views: ins.views ?? null,
      interactions: ins.total_interactions ?? null, insights_at: new Date().toISOString(),
    });
  }
  await db.from('ig_media').upsert(rows);

  // Tagged in the Story text: same handling as posts (links it, moves the collab to Live, tells her).
  const detected = await detectPosts(db, rows);

  // Go-live day match: one collab, a Story deliverable, live today.
  const { data: links } = await db.from('collab_posts').select('media_id');
  const taken = new Set((links ?? []).map((l) => l.media_id));
  const { data: collabs } = await db
    .from('collabs')
    .select('id, code, stage, live_date, brand:brands(name), deliverables(kind)')
    .in('stage', ['confirmed', 'creating', 'live']);
  type C = { id: string; code: string; stage: string; live_date: string | null; brand: { name: string }; deliverables: { kind: string }[] };
  let linked = 0;
  for (const r of rows) {
    if (taken.has(r.id)) continue;
    const day = istDate(r.posted_at);
    const match = ((collabs ?? []) as unknown as C[]).filter((c) => c.live_date === day && c.deliverables.some((d) => /story/i.test(d.kind)));
    if (match.length !== 1) continue;
    const c = match[0];
    await db.from('collab_posts').insert({ collab_id: c.id, media_id: r.id, matched_by: 'date' });
    await db.from('collab_events').insert({ collab_id: c.id, kind: 'post', text: 'Story saved from Instagram (its numbers are kept after it disappears)', visible_to_brand: true });
    taken.add(r.id);
    linked++;
  }
  return { stories: rows.length, detected, linked };
}

async function notifyCreator(db: SupabaseClient, kind: string, payload: Record<string, unknown>, telegram: string) {
  const { data: s } = await db.from('creator_settings').select('creator_email, telegram_chat_id').eq('id', 1).single();
  if (!s) return;
  await db.from('outbox').insert({ kind, to_email: s.creator_email, payload });
  if (telegramConfigured && s.telegram_chat_id) await sendTelegram(s.telegram_chat_id, telegram).catch(() => {});
}

async function detectPosts(db: SupabaseClient, media: MediaRow[]) {
  const { data: links } = await db.from('collab_posts').select('media_id');
  const taken = new Set((links ?? []).map((l) => l.media_id));
  const { data: collabs } = await db
    .from('collabs')
    .select('id, code, stage, received_on, live_date, checklist, contact_name, brief_details, brand:brands(name, instagram), posts:collab_posts(media_id)')
    .in('stage', ['confirmed', 'creating', 'live']);
  type C = { id: string; code: string; stage: string; received_on: string; live_date: string | null; checklist: Record<string, boolean>; brief_details: { hashtags?: string[]; mentions?: string[] } | null; brand: { name: string; instagram: string }; posts: { media_id: string }[] };
  const candidates = ((collabs ?? []) as unknown as C[]).filter((c) => c.brand?.instagram && (c.stage !== 'live' || !c.posts.length));

  let found = 0;
  for (const m of [...media].sort((a, b) => a.posted_at.localeCompare(b.posted_at))) {
    if (taken.has(m.id)) continue;
    const day = istDate(m.posted_at);
    const c = candidates
      .filter((x) => mentions(m.caption, x.brand.instagram) && day >= x.received_on)
      .sort((a, b) => (a.stage === 'live' ? 1 : 0) - (b.stage === 'live' ? 1 : 0))[0];
    if (!c) continue;

    taken.add(m.id);
    found++;
    const hasAd = adTagged(m.caption);
    // Hashtags and @mentions the brief asked for that the caption doesn't have.
    const capLower = m.caption.toLowerCase();
    const missingItems = [...(c.brief_details?.mentions ?? []), ...(c.brief_details?.hashtags ?? [])].filter((t) => !capLower.includes(t.toLowerCase()));
    await db.from('collab_posts').insert({ collab_id: c.id, media_id: m.id, matched_by: 'auto' });
    await db.from('collab_events').insert({ collab_id: c.id, kind: 'post', text: `Post spotted on Instagram: ${m.permalink}`, visible_to_brand: true });
    const checklist = { ...c.checklist, brand_tag: true, ad_tag: hasAd || !!c.checklist?.ad_tag };
    if (c.stage !== 'live') {
      // Moving to Live emails the brand ("Live on Instagram") through the normal stage trigger.
      await db.from('collabs').update({ stage: 'live', live_date: day, checklist }).eq('id', c.id);
      await db.from('deliverables').update({ done: true }).eq('collab_id', c.id);
    } else {
      await db.from('collabs').update({ checklist }).eq('id', c.id);
    }
    await notifyCreator(
      db, 'post_detected',
      { code: c.code, brand: c.brand.name, permalink: m.permalink, missing_ad: !hasAd, missing_items: missingItems },
      `📸 Your post for <b>${esc(c.brand.name)}</b> is live and moved to Live.${hasAd ? '' : '\n⚠️ The caption has no #ad or #collab in the first line. Add it to follow ASCI rules.'}${missingItems.length ? `\n⚠️ The brief asked for: ${esc(missingItems.join(' '))}` : ''}`,
    );
    candidates.splice(candidates.indexOf(c), 1);
  }
  return found;
}

async function makeReports(db: SupabaseClient, reportFor?: string) {
  const { data: s } = await db.from('creator_settings').select('report_mode, display_name, handle').eq('id', 1).single();
  if (!s || (s.report_mode === 'off' && !reportFor)) return 0;
  const { data: acct } = await db.from('ig_account').select('followers, username').eq('id', 1).single();

  let q = db
    .from('collabs')
    .select('id, code, contact_name, brand:brands(name, instagram), deliverables(kind, qty), posts:collab_posts(media:ig_media(*)), reports:brand_reports(id)')
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
    const data = {
      brand: c.brand.name, brand_handle: c.brand.instagram, code: c.code,
      creator: { name: s.display_name, handle: acct?.username || s.handle, followers: acct?.followers ?? null },
      deliverables: c.deliverables.map((d) => `${d.qty} ${d.kind}`).join(', '),
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
      await notifyCreator(db, 'report_ready', { code: c.code, brand: c.brand.name, views: totals.views, reach: totals.reach },
        `📊 The results report for <b>${esc(c.brand.name)}</b> is ready. Check it and send it from the collab panel.`);
    }
    made++;
  }
  return made;
}
