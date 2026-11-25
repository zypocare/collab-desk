// Creator Peer Benchmarks, Comment Question Miner & Weekly Trend Radar Push:
// - Resolves public Instagram handles via 3-tier lookup (works with Instagram Login without needing Facebook Login):
//   1) Miracle's own synced ig_account/ig_media if the peer is on Miracle
//   2) Instagram's public web_profile_info JSON + public profile OG metadata parser
//   3) Clean manual-entry fallback if Instagram rate-limits the server IP
// - Scans the creator's own recent Reels' comments for repeated audience questions.
// - Runs every Monday 10:00 AM IST via cron to send proactive Trend Radar push nudges.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed } from '../_shared/admin.ts';
import { activeCreators, creatorOfCaller } from '../_shared/creators.ts';
import { pushToCreator } from '../_shared/push.ts';

const GRAPH = 'https://graph.instagram.com';
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
  media_type: string;
  permalink: string;
  timestamp: string;
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
  synced_at: string;
};

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
    .select('id, caption, likes, comments, media_type, permalink, posted_at')
    .eq('creator_id', acct.id)
    .order('posted_at', { ascending: false })
    .limit(12);

  const posts: PeerPost[] = (media ?? []).map((m) => ({
    id: String(m.id),
    caption: String(m.caption ?? '').slice(0, 220),
    likes: Number(m.likes ?? 0),
    comments: Number(m.comments ?? 0),
    media_type: String(m.media_type ?? 'VIDEO'),
    permalink: String(m.permalink ?? ''),
    timestamp: String(m.posted_at ?? ''),
  }));

  const followers = Number(acct.followers ?? 0);
  const avgLikes = posts.length ? Math.round(posts.reduce((a, p) => a + p.likes, 0) / posts.length) : 0;
  const avgComments = posts.length ? Math.round(posts.reduce((a, p) => a + p.comments, 0) / posts.length) : 0;
  const er = Number(acct.engagement_rate ?? (followers > 0 ? (((avgLikes + avgComments) / followers) * 100).toFixed(2) : 0));

  let postsPerWeek = 0;
  if (posts.length >= 2) {
    const times = posts.map((p) => Date.parse(p.timestamp)).filter((t) => Number.isFinite(t)).sort((a, b) => b - a);
    if (times.length >= 2) {
      const spanDays = Math.max(1, (times[0] - times[times.length - 1]) / 864e5);
      postsPerWeek = Number(Math.min(28, (times.length / spanDays) * 7).toFixed(1));
    }
  }

  return {
    username: String(acct.username || handle),
    name: String(acct.name ?? ''),
    profile_picture_url: String(acct.profile_picture_url ?? ''),
    followers_count: followers,
    media_count: Number(acct.media_count ?? posts.length),
    avg_likes: avgLikes,
    avg_comments: avgComments,
    engagement_rate: er,
    posts_per_week: postsPerWeek,
    top_posts: [...posts].sort((a, b) => b.likes + b.comments * 4 - (a.likes + a.comments * 4)).slice(0, 3),
    synced_at: new Date().toISOString(),
  };
}

/** Tier 2: Fetch public profile via Instagram web_profile_info or public OG metadata. */
async function lookupPublicInstagram(handle: string): Promise<PeerData | null> {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  try {
    const res = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, {
      headers: {
        'user-agent': ua,
        'x-ig-app-id': '936619743392459',
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(7000),
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
          return {
            id: String(n.id ?? sc),
            caption: cap.slice(0, 220),
            likes: Number((n.edge_liked_by as { count?: number })?.count ?? (n.edge_media_preview_like as { count?: number })?.count ?? 0),
            comments: Number((n.edge_media_to_comment as { count?: number })?.count ?? 0),
            media_type: n.is_video ? 'VIDEO' : 'IMAGE',
            permalink: sc ? `https://www.instagram.com/p/${sc}/` : `https://www.instagram.com/${handle}/`,
            timestamp: n.taken_at_timestamp ? new Date(Number(n.taken_at_timestamp) * 1000).toISOString() : '',
          };
        });
        const avgLikes = posts.length ? Math.round(posts.reduce((a, p) => a + p.likes, 0) / posts.length) : 0;
        const avgComments = posts.length ? Math.round(posts.reduce((a, p) => a + p.comments, 0) / posts.length) : 0;
        const er = followers > 0 ? Number((((avgLikes + avgComments) / followers) * 100).toFixed(2)) : 0;
        let postsPerWeek = 0;
        if (posts.length >= 2) {
          const times = posts.map((p) => Date.parse(p.timestamp)).filter((t) => Number.isFinite(t)).sort((a, b) => b - a);
          if (times.length >= 2) {
            const spanDays = Math.max(1, (times[0] - times[times.length - 1]) / 864e5);
            postsPerWeek = Number(Math.min(28, (times.length / spanDays) * 7).toFixed(1));
          }
        }
        return {
          username: String(u.username),
          name: String(u.full_name ?? ''),
          profile_picture_url: String(u.profile_pic_url_hd || u.profile_pic_url || ''),
          followers_count: followers,
          media_count: mediaCount,
          avg_likes: avgLikes,
          avg_comments: avgComments,
          engagement_rate: er,
          posts_per_week: postsPerWeek,
          top_posts: [...posts].sort((a, b) => b.likes + b.comments * 4 - (a.likes + a.comments * 4)).slice(0, 3),
          synced_at: new Date().toISOString(),
        };
      }
    }
  } catch {
    /* fall through to HTML OG meta parser */
  }

  // Fallback: public profile HTML meta tags (<meta property="og:description" content="42K Followers, 512 Following, 184 Posts - ...">)
  try {
    const res = await fetch(`https://www.instagram.com/${encodeURIComponent(handle)}/`, {
      headers: { 'user-agent': ua, accept: 'text/html' },
      signal: AbortSignal.timeout(7000),
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
      synced_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
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

      const peer = (await lookupInMiracle(db, handle)) ?? (await lookupPublicInstagram(handle));
      if (!peer) {
        // Return clean manual fallback trigger instead of a dead-end error!
        return reply({ manual: true, username: handle });
      }
      const saved = await upsertPeer(db, creatorId, peer);
      return reply({ peer: saved });
    }

    if (action === 'add_manual') {
      const handle = String(body.username ?? '').replace(/^@/, '').trim().toLowerCase();
      if (!/^[a-z0-9._]{1,40}$/.test(handle)) {
        return reply({ error: 'Enter a valid Instagram handle.' }, 400);
      }
      const followers = Math.max(0, Math.round(Number(body.followers_count) || 0));
      const avgLikes = Math.max(0, Math.round(Number(body.avg_likes) || 0));
      const avgComments = Math.max(0, Math.round(Number(body.avg_comments) || 0));
      const ppw = Math.max(0, Math.min(28, Number(Number(body.posts_per_week || 0).toFixed(1))));
      const er = followers > 0 ? Number((((avgLikes + avgComments) / followers) * 100).toFixed(2)) : 0;
      const topTopic = String(body.top_topic ?? '').trim();
      const topPosts: PeerPost[] = topTopic
        ? [{ id: 'manual-1', caption: topTopic.slice(0, 220), likes: avgLikes, comments: avgComments, media_type: 'VIDEO', permalink: `https://www.instagram.com/${handle}/`, timestamp: new Date().toISOString() }]
        : [];
      const saved = await upsertPeer(db, creatorId, {
        username: handle,
        name: String(body.name ?? '').trim(),
        profile_picture_url: '',
        followers_count: followers,
        media_count: 0,
        avg_likes: avgLikes,
        avg_comments: avgComments,
        engagement_rate: er,
        posts_per_week: ppw,
        top_posts: topPosts,
        synced_at: new Date().toISOString(),
      });
      return reply({ peer: saved });
    }

    if (action === 'refresh') {
      const { data: rows } = await db
        .from('creator_benchmarks')
        .select('*')
        .eq('creator_id', creatorId);
      const updated = [];
      for (const r of rows ?? []) {
        const fresh = (await lookupInMiracle(db, r.username)) ?? (await lookupPublicInstagram(r.username));
        if (fresh) {
          const { data } = await db.from('creator_benchmarks').update(fresh).eq('id', r.id).select('*').single();
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
