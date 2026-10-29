// A brand's own Instagram, the way a creator's is synced: the account, its recent posts with their figures,
// the last 30 days against the 30 before, averages per format, the best time to post, follower history and
// (once a week) the audience. Kept on brand_ig for the brand's profile, Insights and Grow pages.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { postingTimeInsights } from './postingTime.ts';
import { ig, IgError, type Insights } from './instagram.ts';
import { todayIST } from './admin.ts';

const DAY = 864e5;
// A post's reach keeps growing for a couple of days, so averages leave out posts younger than this.
const SETTLE = 3 * DAY;

type Post = {
  id: string; caption: string; media_type: string; product_type: string; permalink: string; posted_at: string; thumbnail_url: string;
  likes: number | null; comments: number | null; saves: number | null; shares: number | null; reach: number | null; views: number | null; interactions: number | null;
};

/** Brand teams with an Instagram token (the nightly run). */
export async function connectedBrands(db: SupabaseClient): Promise<string[]> {
  const { data } = await db.from('brand_ig_token').select('owner');
  return (data ?? []).map((r) => r.owner as string);
}

export async function runBrandSync(db: SupabaseClient, owner: string) {
  const { data: tok } = await db.from('brand_ig_token').select('access_token, expires_at').eq('owner', owner).maybeSingle();
  if (!tok) return { skipped: 'Instagram is not connected' };
  let token: string = tok.access_token;
  try {
    // 1. Keep the 60-day token fresh.
    const expires = tok.expires_at ? Date.parse(tok.expires_at) : 0;
    if (expires - Date.now() < 10 * DAY) {
      const r = await ig.refresh(token);
      token = r.token;
      await db.from('brand_ig_token').update({ access_token: token, expires_at: new Date(Date.now() + r.expiresIn * 1000).toISOString() }).eq('owner', owner);
    }

    // 2. The account, and the follower count for today (a different account starts its history again).
    const p = await ig.profile(token);
    const { data: before } = await db.from('brand_ig').select('ig_user_id, history, demographics, demographics_at, media').eq('owner', owner).maybeSingle();
    const switched = !!before?.ig_user_id && before.ig_user_id !== p.user_id;
    const day = todayIST();
    const history = ((switched ? [] : (before?.history as { day: string; followers: number }[] | null) ?? []).filter((h) => h.day !== day))
      .concat([{ day, followers: p.followers_count }]).sort((a, b) => a.day.localeCompare(b.day)).slice(-200);

    // 3. Posts: figures for the newest 24 (and any from the last 45 days); older ones keep what was stored.
    const kept = new Map(((switched ? [] : (before?.media as Post[] | null)) ?? []).map((m) => [m.id, m]));
    const list = await ig.media(token, 40);
    const posts: Post[] = [];
    for (const [i, m] of list.entries()) {
      const recent = i < 24 || Date.now() - Date.parse(m.timestamp) < 45 * DAY;
      let ins: Insights | null = recent ? await ig.insights(token, m.id).catch(() => null) : null;
      if (ins && !Object.keys(ins).length) ins = null;
      const old = kept.get(m.id);
      const likes = ins?.likes ?? m.like_count ?? old?.likes ?? null;
      const comments = ins?.comments ?? m.comments_count ?? old?.comments ?? null;
      posts.push({
        id: m.id, caption: (m.caption ?? '').slice(0, 400), media_type: m.media_type, product_type: m.media_product_type ?? '', permalink: m.permalink,
        posted_at: m.timestamp, thumbnail_url: m.thumbnail_url || m.media_url || '', likes, comments,
        saves: ins?.saved ?? old?.saves ?? null, shares: ins?.shares ?? old?.shares ?? null, reach: ins?.reach ?? old?.reach ?? null, views: ins?.views ?? old?.views ?? null,
        interactions: ins?.total_interactions ?? old?.interactions ?? ((likes ?? 0) + (comments ?? 0)),
      });
    }

    // 4. Averages per format, over the newest 12 settled posts of each.
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => typeof x === 'number');
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const round = (n: number | null, dp = 0) => (n === null ? null : Math.round(n * 10 ** dp) / 10 ** dp);
    const settled = posts.filter((r) => Date.now() - Date.parse(r.posted_at) > SETTLE);
    const stats = (xs: Post[]) => {
      const inter = avg(xs.map((r) => r.interactions));
      return {
        posts: xs.length, avg_views: round(avg(xs.map((r) => r.views))), avg_reach: round(avg(xs.map((r) => r.reach))), avg_interactions: round(inter),
        er: inter !== null && p.followers_count ? Math.round((inter / p.followers_count) * 10000) / 100 : null,
      };
    };
    const isReel = (r: Post) => r.product_type === 'REELS' || r.media_type === 'VIDEO';
    const formats = {
      reels: stats(settled.filter(isReel).slice(0, 12)),
      carousels: stats(settled.filter((r) => r.media_type === 'CAROUSEL_ALBUM').slice(0, 12)),
      photos: stats(settled.filter((r) => r.media_type === 'IMAGE').slice(0, 12)),
    };
    const all = stats(settled.slice(0, 12));

    // 5. The last 30 days against the 30 before, and follower growth.
    const now = new Date();
    const [cur, prev] = await Promise.all([
      ig.accountTotals(token, new Date(Date.now() - 30 * DAY), now).catch(() => ({})),
      ig.accountTotals(token, new Date(Date.now() - 60 * DAY), new Date(Date.now() - 30 * DAY)).catch(() => ({})),
    ]);
    const on = (daysAgo: number) => {
      const d = new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
      return [...history].reverse().find((h) => h.day <= d)?.followers ?? null;
    };
    const f30 = on(30);
    const insights = {
      from: new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10), to: now.toISOString().slice(0, 10),
      totals: cur, prev, formats, er: all.er, best_time: postingTimeInsights(posts, now.getTime()),
      growth: { d30: f30 === null ? null : p.followers_count - f30 },
    };

    // 6. The audience, once a week.
    const stale = switched || !before?.demographics_at || Date.now() - Date.parse(before.demographics_at) > 7 * DAY;
    let demographics = (switched ? {} : before?.demographics) ?? {};
    if (stale) {
      const fresh = await ig.demographics(token).catch(() => ({}));
      if (Object.keys(fresh).length) demographics = fresh;
    }

    const { error } = await db.from('brand_ig').update({
      ig_user_id: p.user_id, username: p.username, name: p.name ?? '', picture: p.profile_picture_url ?? '', followers: p.followers_count, media_count: p.media_count,
      media: posts, history, insights, demographics, ...(stale ? { demographics_at: now.toISOString() } : {}), engagement_rate: formats.reels.er ?? all.er,
      synced_at: now.toISOString(), last_error: '',
    }).eq('owner', owner);
    if (error) throw new Error(error.message);
    return { posts: posts.length, followers: p.followers_count };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from('brand_ig').update({ last_error: message.slice(0, 300) }).eq('owner', owner);
    if (e instanceof IgError) return { error: message };
    throw e;
  }
}
