// Creator Peer Benchmarks, Comment Question Miner & Weekly Trend Radar Push:
// - 100% automated 4-tier peer lookup + rich competitor intelligence:
//   1) Miracle's own synced ig_account/ig_media if the peer is on Miracle
//   2) Official Meta Graph business_discovery (META_BUSINESS_TOKEN + META_IG_BUSINESS_ID)
//   2b) Apify Instagram Profile Scraper (APIFY_API_TOKEN) — extracts Reel views, thumbnails, bio, format mix, collabs
//   3) Instagram's public web_profile_info JSON + public profile OG metadata parser
//   4) Automated Gemini + Google Search grounding via Miracle's Cloudflare Worker (/api/ai/peerlookup)
// - Computes actionable peer insights: format mix, avg Reel views, median likes, comment-magnet lift,
//   collab/sponsored post ratio & brand mentions, peak posting day/window (IST), and breakout multipliers.
// - Runs every Monday 10:00 AM IST via cron to send proactive Trend Radar push nudges.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed } from '../_shared/admin.ts';
import { activeCreators, creatorOfCaller } from '../_shared/creators.ts';
import { pushToCreator } from '../_shared/push.ts';

const GRAPH = 'https://graph.instagram.com';
const FB_GRAPH = 'https://graph.facebook.com/v21.0';
const DEFAULT_AI_SITE = 'https://app.miracleapp.live';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PeerPost = {
  id: string;
  caption: string;
  likes: number;
  comments: number;
  views?: number;
  thumbnail_url?: string;
  media_type: string;
  permalink: string;
  timestamp: string;
  multiplier?: number;
  has_dm_cta?: boolean;
};

type PeerInsights = {
  bio?: string;
  category?: string;
  avg_views?: number;
  median_likes?: number;
  reels_pct?: number;
  carousel_pct?: number;
  photo_pct?: number;
  comment_magnet_posts?: number;
  comment_magnet_lift?: number;
  collab_posts?: number;
  collab_brands?: string[];
  best_day?: string;
  best_time?: string;
  top_hashtags?: string[];
  sample_size?: number;
};

type PeerData = {
  username: string;
  name: string;
  profile_picture_url: string;
  followers_count: number;
  media_count: number;
  avg_likes: number;
  avg_comments: number;
  engagement_rate: number;
  posts_per_week: number;
  top_posts: PeerPost[];
  insights: PeerInsights;
  synced_at: string;
};

type ResolveOutcome =
  | { ok: true; peer: PeerData; source: string }
  | { ok: false; suggested_handle?: string; error: string };

const DM_CTA_RE = /\b(comment\s+(?:["'“”]?[a-z0-9]+["'“”]?\s+)?(?:for|to\s+get|below)|dm\s+(?:me|for)|drop\s+a?\s*comment|link\s+in\s+(?:dm|bio)|type\s+["'“”]?[a-z0-9]+["'“”]?)\b/i;
const COLLAB_RE = /(#(ad|collab|sponsored|paidpartnership|brandpartner|gifted|pr)\b|\bpaid\s+partnership\b|\bin\s+collaboration\s+with\b|\buse\s+(?:my\s+)?code\b|\bshop\s+@)/i;

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Analyze a peer's recent posts into concrete, actionable strategy signals. */
function analyzePeerPosts(
  posts: PeerPost[],
  followers: number,
  extra: { bio?: string; category?: string } = {}
): {
  avgLikes: number;
  avgComments: number;
  er: number;
  postsPerWeek: number;
  topPosts: PeerPost[];
  insights: PeerInsights;
} {
  const recent10 = posts.slice(0, 10);
  const n = recent10.length;
  const avgLikes = n ? Math.round(recent10.reduce((a, p) => a + p.likes, 0) / n) : 0;
  const avgComments = n ? Math.round(recent10.reduce((a, p) => a + p.comments, 0) / n) : 0;
  const avgEng10 = n ? recent10.reduce((a, p) => a + p.likes + p.comments, 0) / n : 0;
  const er = followers > 0 && n ? Math.round((avgEng10 / followers) * 10000) / 100 : 0;

  let postsPerWeek = 0;
  if (n >= 2) {
    const times = posts.map((p) => Date.parse(p.timestamp)).filter((t) => Number.isFinite(t)).sort((a, b) => b - a);
    if (times.length >= 2) {
      const spanDays = Math.max(1, (times[0] - times[times.length - 1]) / 864e5);
      postsPerWeek = Number(Math.min(28, (times.length / spanDays) * 7).toFixed(1));
    }
  }

  // Avg views across video/Reel posts that expose views
  const viewed = posts.map((p) => p.views ?? 0).filter((v) => v > 0);
  const avgViews = viewed.length ? Math.round(viewed.reduce((a, b) => a + b, 0) / viewed.length) : 0;

  // Format mix
  let reels = 0;
  let carousels = 0;
  let photos = 0;
  for (const p of posts) {
    const t = p.media_type.toUpperCase();
    if (t.includes('VIDEO') || t.includes('REEL')) reels++;
    else if (t.includes('CAROUSEL') || t.includes('SIDECAR')) carousels++;
    else photos++;
  }

  // Comment-to-DM magnet detection & comment lift
  const dmPosts = posts.filter((p) => DM_CTA_RE.test(p.caption));
  const nonDmPosts = posts.filter((p) => !DM_CTA_RE.test(p.caption));
  const dmAvgCom = dmPosts.length ? dmPosts.reduce((a, p) => a + p.comments, 0) / dmPosts.length : 0;
  const baseCom = nonDmPosts.length ? nonDmPosts.reduce((a, p) => a + p.comments, 0) / nonDmPosts.length : avgComments;
  const dmLift = dmPosts.length && baseCom > 0 ? Number((dmAvgCom / baseCom).toFixed(1)) : 0;

  // Collab / brand partnership detection
  const collabPosts = posts.filter((p) => COLLAB_RE.test(p.caption));
  const brandSet = new Set<string>();
  for (const p of collabPosts) {
    for (const m of p.caption.matchAll(/@([a-z0-9._]{2,30})/gi)) {
      brandSet.add(m[1].toLowerCase());
    }
  }

  // Peak posting day & IST time window
  const dayCounts = new Map<string, { n: number; eng: number }>();
  const bandCounts = new Map<string, { n: number; eng: number }>();
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const p of posts) {
    const ms = Date.parse(p.timestamp);
    if (!Number.isFinite(ms)) continue;
    // Shift UTC -> IST (+5:30)
    const ist = new Date(ms + 330 * 60_000);
    const day = DAYS[ist.getUTCDay()];
    const hr = ist.getUTCHours();
    const band =
      hr < 11 ? 'Morning (8–11 AM IST)' : hr < 15 ? 'Midday (11 AM–3 PM IST)' : hr < 18 ? 'Afternoon (3–6 PM IST)' : hr < 21 ? 'Evening (6–9 PM IST)' : 'Night (9 PM–12 AM IST)';
    const score = p.likes + p.comments * 4;
    const dCur = dayCounts.get(day) ?? { n: 0, eng: 0 };
    dayCounts.set(day, { n: dCur.n + 1, eng: dCur.eng + score });
    const bCur = bandCounts.get(band) ?? { n: 0, eng: 0 };
    bandCounts.set(band, { n: bCur.n + 1, eng: bCur.eng + score });
  }
  const bestDay = [...dayCounts.entries()].sort((a, b) => b[1].eng / b[1].n - a[1].eng / a[1].n)[0]?.[0];
  const bestTime = [...bandCounts.entries()].sort((a, b) => b[1].n - a[1].n || b[1].eng - a[1].eng)[0]?.[0];

  // Top recurring hashtags
  const tagCounts = new Map<string, number>();
  for (const p of posts) {
    for (const m of p.caption.matchAll(/#([a-z0-9_]{2,30})/gi)) {
      const tag = m[1].toLowerCase();
      if (['reels', 'reel', 'instagram', 'viral', 'trending', 'explore', 'explorepage', 'fyp', 'instagood', 'reelsinstagram'].includes(tag)) continue;
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topHashtags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => `#${t}`);

  // Score & annotate top 3 breakout posts with multiplier vs baseline
  const avgScore = n ? posts.reduce((a, p) => a + p.likes + p.comments * 4, 0) / n : 1;
  const topPosts = [...posts]
    .map((p) => {
      const score = p.likes + p.comments * 4;
      const mult = avgScore > 0 ? Number((score / avgScore).toFixed(1)) : 1;
      return {
        ...p,
        multiplier: mult >= 1.2 ? mult : undefined,
        has_dm_cta: DM_CTA_RE.test(p.caption),
      };
    })
    .sort((a, b) => b.likes + b.comments * 4 - (a.likes + a.comments * 4))
    .slice(0, 3);

  const insights: PeerInsights = {
    bio: extra.bio?.trim().slice(0, 180) || undefined,
    category: extra.category?.trim().slice(0, 60) || undefined,
    avg_views: avgViews || undefined,
    median_likes: n ? median(posts.map((p) => p.likes)) : undefined,
    reels_pct: n ? Math.round((reels / n) * 100) : undefined,
    carousel_pct: n ? Math.round((carousels / n) * 100) : undefined,
    photo_pct: n ? Math.round((photos / n) * 100) : undefined,
    comment_magnet_posts: dmPosts.length || undefined,
    comment_magnet_lift: dmLift >= 1.3 ? dmLift : undefined,
    collab_posts: collabPosts.length || undefined,
    collab_brands: [...brandSet].slice(0, 4),
    best_day: bestDay,
    best_time: bestTime,
    top_hashtags: topHashtags.length ? topHashtags : undefined,
    sample_size: n || undefined,
  };

  return { avgLikes, avgComments, er, postsPerWeek, topPosts, insights };
}

async function getIgCreds(db: SupabaseClient, creatorId: number) {
  const [tokRes, acctRes] = await Promise.all([
    db.from('ig_token').select('access_token, permissions').eq('id', creatorId).maybeSingle(),
    db.from('ig_account').select('ig_user_id').eq('id', creatorId).maybeSingle(),
  ]);
  return {
    token: String(tokRes.data?.access_token ?? ''),
    perms: String(tokRes.data?.permissions ?? ''),
    igUserId: String(acctRes.data?.ig_user_id ?? ''),
  };
}

function parseCompactCount(raw: string): number {
  const s = raw.replace(/,/g, '').trim().toUpperCase();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([KMB])?$/);
  if (!m) return 0;
  const n = Number(m[1]) || 0;
  const mult = m[2] === 'M' ? 1e6 : m[2] === 'K' ? 1e3 : m[2] === 'B' ? 1e9 : 1;
  return Math.round(n * mult);
}

/** Tier 1: Check if this handle is already synced on Miracle. */
async function lookupInMiracle(db: SupabaseClient, handle: string): Promise<PeerData | null> {
  const { data: acct } = await db
    .from('ig_account')
    .select('id, username, name, profile_picture_url, followers, media_count, engagement_rate')
    .ilike('username', handle)
    .eq('connected', true)
    .maybeSingle();
  if (!acct) return null;

  const { data: media } = await db
    .from('ig_media')
    .select('id, caption, likes, comments, views, thumbnail_url, media_type, product_type, permalink, posted_at')
    .eq('creator_id', acct.id)
    .neq('media_type', 'STORY')
    .order('posted_at', { ascending: false })
    .limit(12);

  const posts: PeerPost[] = (media ?? []).map((m) => ({
    id: String(m.id),
    caption: String(m.caption ?? '').slice(0, 260),
    likes: Number(m.likes ?? 0),
    comments: Number(m.comments ?? 0),
    views: Number(m.views ?? 0) || undefined,
    thumbnail_url: String(m.thumbnail_url ?? '') || undefined,
    media_type: String(m.product_type || m.media_type || 'VIDEO'),
    permalink: String(m.permalink ?? ''),
    timestamp: String(m.posted_at ?? ''),
  }));

  const followers = Number(acct.followers ?? 0);
  const a = analyzePeerPosts(posts, followers);
  return {
    username: String(acct.username || handle),
    name: String(acct.name ?? ''),
    profile_picture_url: String(acct.profile_picture_url ?? ''),
    followers_count: followers,
    media_count: Number(acct.media_count ?? posts.length),
    avg_likes: a.avgLikes,
    avg_comments: a.avgComments,
    engagement_rate: a.er,
    posts_per_week: a.postsPerWeek,
    top_posts: a.topPosts,
    insights: a.insights,
    synced_at: new Date().toISOString(),
  };
}

/** Tier 2: Official Meta Graph business_discovery (when META_BUSINESS_TOKEN & META_IG_BUSINESS_ID are configured). */
async function lookupMetaBusinessDiscovery(handle: string): Promise<PeerData | null> {
  const token = (Deno.env.get('META_BUSINESS_TOKEN') ?? '').trim();
  const igBizId = (Deno.env.get('META_IG_BUSINESS_ID') ?? '').trim();
  if (!token || !igBizId) return null;
  try {
    const fields = `business_discovery.username(${handle}){username,name,biography,profile_picture_url,followers_count,media_count,media.limit(12){id,caption,like_count,comments_count,media_type,media_url,thumbnail_url,permalink,timestamp}}`;
    const u = new URL(`${FB_GRAPH}/${igBizId}`);
    u.searchParams.set('fields', fields);
    u.searchParams.set('access_token', token);
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const bd = json?.business_discovery;
    if (!bd?.username) return null;
    const rawMedia = Array.isArray(bd.media?.data) ? (bd.media.data as Record<string, unknown>[]) : [];
    const posts: PeerPost[] = rawMedia.map((m) => ({
      id: String(m.id ?? ''),
      caption: String(m.caption ?? '').slice(0, 260),
      likes: Number(m.like_count ?? 0),
      comments: Number(m.comments_count ?? 0),
      thumbnail_url: String(m.thumbnail_url || m.media_url || '') || undefined,
      media_type: String(m.media_type ?? 'VIDEO'),
      permalink: String(m.permalink ?? `https://www.instagram.com/${handle}/`),
      timestamp: String(m.timestamp ?? ''),
    }));
    const followers = Number(bd.followers_count ?? 0);
    const a = analyzePeerPosts(posts, followers, { bio: String(bd.biography ?? '') });
    return {
      username: String(bd.username),
      name: String(bd.name ?? ''),
      profile_picture_url: String(bd.profile_picture_url ?? ''),
      followers_count: followers,
      media_count: Number(bd.media_count ?? posts.length),
      avg_likes: a.avgLikes,
      avg_comments: a.avgComments,
      engagement_rate: a.er,
      posts_per_week: a.postsPerWeek,
      top_posts: a.topPosts,
      insights: a.insights,
      synced_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Tier 2b: Apify Instagram Profile Scraper (extracts Reel views, thumbnails, bio, category, format mix & collabs). */
async function lookupViaApify(handle: string): Promise<PeerData | null> {
  const token = (Deno.env.get('APIFY_API_TOKEN') ?? '').trim();
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usernames: [handle] }),
        signal: AbortSignal.timeout(25_000),
      }
    );
    if (!res.ok) return null;
    const arr = (await res.json().catch(() => null)) as Record<string, unknown>[] | null;
    const u = Array.isArray(arr) ? arr[0] : null;
    if (!u || !u.username) return null;
    const followers = Number(u.followersCount ?? 0);
    const mediaCount = Number(u.postsCount ?? 0);
    const latest = Array.isArray(u.latestPosts) ? (u.latestPosts as Record<string, unknown>[]) : [];
    const posts: PeerPost[] = latest.slice(0, 12).map((p, idx) => {
      const views = Number(p.videoPlayCount ?? p.videoViewCount ?? 0);
      const rawType = String(p.type ?? (views > 0 ? 'Video' : 'Image'));
      return {
        id: String(p.id ?? p.shortCode ?? `apify-${idx}`),
        caption: String(p.caption ?? '').slice(0, 260),
        likes: Number(p.likesCount ?? 0),
        comments: Number(p.commentsCount ?? 0),
        views: views > 0 ? views : undefined,
        thumbnail_url: String(p.displayUrl ?? '') || undefined,
        media_type: rawType.toUpperCase().includes('VIDEO') ? 'VIDEO' : rawType.toUpperCase().includes('SIDECAR') ? 'CAROUSEL' : 'IMAGE',
        permalink: String(p.url ?? (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : `https://www.instagram.com/${handle}/`)),
        timestamp: String(p.timestamp ?? ''),
      };
    });
    const a = analyzePeerPosts(posts, followers, {
      bio: String(u.biography ?? ''),
      category: String(u.businessCategoryName ?? ''),
    });
    return {
      username: String(u.username),
      name: String(u.fullName ?? ''),
      profile_picture_url: String(u.profilePicUrlHD || u.profilePicUrl || ''),
      followers_count: followers,
      media_count: mediaCount,
      avg_likes: a.avgLikes,
      avg_comments: a.avgComments,
      engagement_rate: a.er,
      posts_per_week: a.postsPerWeek,
      top_posts: a.topPosts,
      insights: a.insights,
      synced_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Tier 3: Fetch public profile via Instagram web_profile_info or public OG metadata. */
async function lookupPublicInstagram(handle: string): Promise<PeerData | null> {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, {
      headers: {
        'user-agent': ua,
        'x-ig-app-id': '936619743392459',
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const json = await res.json().catch(() => null);
      const u = json?.data?.user;
      if (u && u.username) {
        const followers = Number(u.edge_followed_by?.count ?? 0);
        const mediaCount = Number(u.edge_owner_to_timeline_media?.count ?? 0);
        const edges = Array.isArray(u.edge_owner_to_timeline_media?.edges) ? u.edge_owner_to_timeline_media.edges : [];
        const posts: PeerPost[] = edges.slice(0, 12).map((e: Record<string, unknown>) => {
          const n = (e.node ?? {}) as Record<string, unknown>;
          const capEdges = ((n.edge_media_to_caption as { edges?: { node?: { text?: string } }[] })?.edges ?? []);
          const cap = String(capEdges[0]?.node?.text ?? '');
          const sc = String(n.shortcode ?? '');
          const views = Number(n.video_view_count ?? 0);
          return {
            id: String(n.id ?? sc),
            caption: cap.slice(0, 260),
            likes: Number((n.edge_liked_by as { count?: number })?.count ?? (n.edge_media_preview_like as { count?: number })?.count ?? 0),
            comments: Number((n.edge_media_to_comment as { count?: number })?.count ?? 0),
            views: views > 0 ? views : undefined,
            thumbnail_url: String(n.thumbnail_src || n.display_url || '') || undefined,
            media_type: n.is_video ? 'VIDEO' : String(n.__typename ?? '').includes('Sidecar') ? 'CAROUSEL' : 'IMAGE',
            permalink: sc ? `https://www.instagram.com/p/${sc}/` : `https://www.instagram.com/${handle}/`,
            timestamp: n.taken_at_timestamp ? new Date(Number(n.taken_at_timestamp) * 1000).toISOString() : '',
          };
        });
        const a = analyzePeerPosts(posts, followers, {
          bio: String(u.biography ?? ''),
          category: String(u.category_name ?? ''),
        });
        return {
          username: String(u.username),
          name: String(u.full_name ?? ''),
          profile_picture_url: String(u.profile_pic_url_hd || u.profile_pic_url || ''),
          followers_count: followers,
          media_count: mediaCount,
          avg_likes: a.avgLikes,
          avg_comments: a.avgComments,
          engagement_rate: a.er,
          posts_per_week: a.postsPerWeek,
          top_posts: a.topPosts,
          insights: a.insights,
          synced_at: new Date().toISOString(),
        };
      }
    }
  } catch {
    /* fall through */
  }

  try {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
      headers: { 'user-agent': ua, accept: 'text/html' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const descMatch = html.match(/property="og:description"\s+content="([^"]+)"/i) || html.match(/name="description"\s+content="([^"]+)"/i);
    if (!descMatch) return null;
    const desc = descMatch[1];
    const statsMatch = desc.match(/([\d.,]+[KMB]?)\s+Followers,\s*([\d.,]+[KMB]?)\s+Following,\s*([\d.,]+[KMB]?)\s+Posts/i);
    if (!statsMatch) return null;
    const followers = parseCompactCount(statsMatch[1]);
    const mediaCount = parseCompactCount(statsMatch[3]);
    const imgMatch = html.match(/property="og:image"\s+content="([^"]+)"/i);
    const titleMatch = html.match(/property="og:title"\s+content="([^"(]+)/i);
    return {
      username: handle,
      name: titleMatch ? titleMatch[1].trim() : '',
      profile_picture_url: imgMatch ? imgMatch[1].replace(/&amp;/g, '&') : '',
      followers_count: followers,
      media_count: mediaCount,
      avg_likes: 0,
      avg_comments: 0,
      engagement_rate: 0,
      posts_per_week: 0,
      top_posts: [],
      insights: {},
      synced_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Tier 4: Automated Google Search Grounding via Miracle's Cloudflare Worker (/api/ai/peerlookup). */
async function lookupViaSearchWorker(db: SupabaseClient, creatorId: number, handle: string, site: string): Promise<ResolveOutcome> {
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  const { error: tErr } = await db.from('ai_tickets').insert({ creator_id: creatorId, token: ticket, kind: 'peerlookup' });
  if (tErr) {
    return { ok: false, error: `Could not start automated lookup for @${handle} (${tErr.message}).` };
  }
  try {
    const res = await fetch(`${site.replace(/\/$/, '')}/api/ai/peerlookup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ai-ticket': ticket,
        apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      },
      body: JSON.stringify({ username: handle }),
      signal: AbortSignal.timeout(25_000),
    });
    const j = (await res.json().catch(() => null)) as {
      found?: boolean;
      suggested_handle?: string;
      peer?: PeerData;
      error?: string;
    } | null;
    if (res.ok && j?.found && j.peer) {
      return { ok: true, peer: { ...j.peer, insights: j.peer.insights ?? {} }, source: 'search' };
    }
    const suggested = String(j?.suggested_handle ?? '').trim().toLowerCase();
    if (suggested && suggested !== handle) {
      return {
        ok: false,
        suggested_handle: suggested,
        error: `Couldn't find public Instagram profile @${handle}. Did you mean @${suggested}?`,
      };
    }
    return {
      ok: false,
      error: `Instagram blocked automated lookup for @${handle} and Google has not indexed this handle yet. Add APIFY_API_TOKEN (or META_BUSINESS_TOKEN + META_IG_BUSINESS_ID) in Supabase secrets to fetch any public handle automatically.`,
    };
  } catch {
    return { ok: false, error: `Lookup timed out for @${handle}. Please try again in a moment.` };
  }
}

async function resolvePeerAutomated(db: SupabaseClient, creatorId: number, handle: string, site: string): Promise<ResolveOutcome> {
  const fromMiracle = await lookupInMiracle(db, handle);
  if (fromMiracle) return { ok: true, peer: fromMiracle, source: 'miracle' };

  const fromMeta = await lookupMetaBusinessDiscovery(handle);
  if (fromMeta) return { ok: true, peer: fromMeta, source: 'meta' };

  const fromApify = await lookupViaApify(handle);
  if (fromApify) return { ok: true, peer: fromApify, source: 'apify' };

  const fromPublic = await lookupPublicInstagram(handle);
  if (fromPublic && fromPublic.followers_count > 0) {
    if (fromPublic.engagement_rate === 0 && fromPublic.top_posts.length === 0) {
      const enriched = await lookupViaSearchWorker(db, creatorId, handle, site);
      if (enriched.ok) {
        return {
          ok: true,
          source: 'public+search',
          peer: {
            ...enriched.peer,
            profile_picture_url: fromPublic.profile_picture_url || enriched.peer.profile_picture_url,
            followers_count: fromPublic.followers_count || enriched.peer.followers_count,
            media_count: fromPublic.media_count || enriched.peer.media_count,
            name: fromPublic.name || enriched.peer.name,
          },
        };
      }
    }
    return { ok: true, peer: fromPublic, source: 'public' };
  }

  return await lookupViaSearchWorker(db, creatorId, handle, site);
}

async function upsertPeer(db: SupabaseClient, creatorId: number, peer: PeerData) {
  const { data: existing } = await db
    .from('creator_benchmarks')
    .select('id')
    .eq('creator_id', creatorId)
    .ilike('username', peer.username)
    .maybeSingle();

  if (existing) {
    const upd = await db.from('creator_benchmarks').update(peer).eq('id', existing.id).select('*').single();
    if (upd.error) throw new Error(upd.error.message);
    return upd.data;
  }
  const ins = await db.from('creator_benchmarks').insert({ creator_id: creatorId, ...peer }).select('*').single();
  if (ins.error) throw new Error(ins.error.message);
  return ins.data;
}

async function mineAudienceQuestions(db: SupabaseClient, creatorId: number, token: string, perms: string) {
  if (!perms.includes('instagram_business_manage_comments')) {
    return { questions: [], needsPerm: true };
  }
  const { data: recent } = await db
    .from('ig_media')
    .select('id, caption, permalink')
    .eq('creator_id', creatorId)
    .order('posted_at', { ascending: false })
    .limit(8);

  const questions: { id: string; username: string; text: string; mediaCaption: string; permalink: string; timestamp: string }[] = [];
  for (const m of recent ?? []) {
    try {
      const u = new URL(`${GRAPH}/${m.id}/comments`);
      u.searchParams.set('fields', 'id,text,username,timestamp');
      u.searchParams.set('limit', '20');
      u.searchParams.set('access_token', token);
      const res = await fetch(u);
      const json = await res.json().catch(() => ({}));
      const rows = Array.isArray(json.data) ? (json.data as Record<string, unknown>[]) : [];
      for (const c of rows) {
        const text = String(c.text ?? '').trim();
        if (
          text.length >= 8 &&
          (/\?/.test(text) || /\b(where|how|which|price|cost|link|location|name|from|brand|size|shade|recipe|part\s*2|tutorial)\b/i.test(text))
        ) {
          questions.push({
            id: String(c.id ?? ''),
            username: String(c.username ?? 'follower'),
            text: text.slice(0, 220),
            mediaCaption: String(m.caption ?? '').replace(/#\S+/g, '').trim().slice(0, 70),
            permalink: String(m.permalink ?? ''),
            timestamp: String(c.timestamp ?? ''),
          });
        }
      }
    } catch {
      /* continue */
    }
  }
  return { questions: questions.slice(0, 20), needsPerm: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  const db = admin();
  const reqUrl = new URL(req.url);
  const aiSite = (reqUrl.searchParams.get('site') || Deno.env.get('AI_SITE_URL') || DEFAULT_AI_SITE).replace(/\/$/, '');

  // Weekly Monday 10:00 AM IST proactive Trend Radar & Comment Question push nudge.
  if (cronAllowed(req)) {
    const creators = await activeCreators(db);
    const results = [];
    for (const c of creators) {
      try {
        const { token, perms } = await getIgCreds(db, c.id);
        if (!token) {
          results.push({ creator: c.id, skipped: 'not connected' });
          continue;
        }
        const { questions } = await mineAudienceQuestions(db, c.id, token, perms);
        const qCount = questions.length;
        const title = qCount > 0
          ? `Monday Trend Radar: ${qCount} follower question${qCount === 1 ? '' : 's'} to film`
          : 'Monday Trend Radar: fresh Reel formats for this week';
        const body = qCount > 0
          ? `Viewers asked "${questions[0].text.slice(0, 70)}" and more in your comments. Tap to turn them into Reels.`
          : 'Check rising formats in your niche and peer breakout Reels before you plan this week’s shoots.';
        await pushToCreator(db, c.id, {
          title,
          body,
          url: '/studio/grow/trends',
          tag: 'weekly-trend-radar',
          kind: 'trend_radar',
          actions: [{ action: 'open', title: 'Open Trend Radar', url: '/studio/grow/trends' }],
        });
        results.push({ creator: c.id, sent: true, questions: qCount });
      } catch (e) {
        results.push({ creator: c.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return reply({ results });
  }

  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: ok } = await asUser.rpc('is_creator');
  const creatorId = ok === true ? await creatorOfCaller(req) : null;
  if (!creatorId) return reply({ error: 'Only the creator can use benchmarks.' }, 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? 'refresh');

  try {
    if (action === 'add') {
      const handle = String(body.username ?? '').replace(/^@/, '').trim().toLowerCase();
      if (!/^[a-z0-9._]{1,40}$/.test(handle)) {
        return reply({ error: 'Enter a valid Instagram handle (letters, numbers, dots, or underscores).' }, 400);
      }
      const { count } = await db
        .from('creator_benchmarks')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', creatorId);
      if ((count ?? 0) >= 8) {
        return reply({ error: 'You can track up to 8 peer creators at a time.' }, 400);
      }

      const resolved = await resolvePeerAutomated(db, creatorId, handle, aiSite);
      if (!resolved.ok) {
        return reply({ not_found: true, suggested_handle: resolved.suggested_handle ?? '', error: resolved.error });
      }
      const saved = await upsertPeer(db, creatorId, resolved.peer);
      return reply({ peer: saved, source: resolved.source });
    }

    if (action === 'refresh') {
      const { data: rows } = await db
        .from('creator_benchmarks')
        .select('*')
        .eq('creator_id', creatorId);
      const updated = [];
      for (const r of rows ?? []) {
        const resolved = await resolvePeerAutomated(db, creatorId, r.username, aiSite);
        if (resolved.ok) {
          const { data } = await db.from('creator_benchmarks').update(resolved.peer).eq('id', r.id).select('*').single();
          updated.push(data ?? r);
        } else {
          updated.push(r);
        }
      }
      return reply({ peers: updated });
    }

    if (action === 'remove') {
      const id = String(body.id ?? '').trim();
      if (!id) return reply({ error: 'Benchmark id is required.' }, 400);
      await db.from('creator_benchmarks').delete().eq('id', id).eq('creator_id', creatorId);
      return reply({ ok: true });
    }

    if (action === 'mine_comments') {
      const { token, perms } = await getIgCreds(db, creatorId);
      if (!token) return reply({ questions: [], needsPerm: false });
      const out = await mineAudienceQuestions(db, creatorId, token, perms);
      return reply(out);
    }

    return reply({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
