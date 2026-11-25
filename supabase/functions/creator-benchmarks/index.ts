// Creator Peer Benchmarks & Comment Question Miner:
// - Uses Instagram's official business_discovery Graph API to fetch public peer creator metrics & top posts.
// - Scans the creator's own recent Reels' comments to surface repeated audience questions for Trend Radar.
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

async function fetchPeer(token: string, igUserId: string, rawHandle: string) {
  const handle = rawHandle.replace(/^@/, '').trim().toLowerCase();
  if (!/^[a-z0-9._]{1,40}$/.test(handle)) {
    throw new Error('Enter a valid Instagram handle (letters, numbers, dots, or underscores).');
  }
  const fields = `business_discovery.username(${handle}){username,name,profile_picture_url,followers_count,media_count,media.limit(12){id,caption,like_count,comments_count,media_type,permalink,timestamp}}`;
  const u = new URL(`${GRAPH}/${igUserId || 'me'}`);
  u.searchParams.set('fields', fields);
  u.searchParams.set('access_token', token);

  const res = await fetch(u);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const msg = json.error?.message ?? 'Could not fetch this Instagram account.';
    if (/business_discovery|not found|invalid/i.test(msg)) {
      throw new Error(`@${handle} must be a public Instagram Business or Creator account.`);
    }
    throw new Error(msg);
  }
  const bd = json.business_discovery;
  if (!bd) throw new Error(`No public Creator/Business profile found for @${handle}.`);

  const followers = Number(bd.followers_count) || 0;
  const mediaCount = Number(bd.media_count) || 0;
  const rawMedia = Array.isArray(bd.media?.data) ? (bd.media.data as Record<string, unknown>[]) : [];

  const posts: PeerPost[] = rawMedia.map((m) => ({
    id: String(m.id ?? ''),
    caption: String(m.caption ?? '').slice(0, 220),
    likes: Number(m.like_count) || 0,
    comments: Number(m.comments_count) || 0,
    media_type: String(m.media_type ?? ''),
    permalink: String(m.permalink ?? ''),
    timestamp: String(m.timestamp ?? ''),
  }));

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

  const topPosts = [...posts]
    .sort((a, b) => b.likes + b.comments * 4 - (a.likes + a.comments * 4))
    .slice(0, 3);

  return {
    username: String(bd.username ?? handle),
    name: String(bd.name ?? ''),
    profile_picture_url: String(bd.profile_picture_url ?? ''),
    followers_count: followers,
    media_count: mediaCount,
    avg_likes: avgLikes,
    avg_comments: avgComments,
    engagement_rate: er,
    posts_per_week: postsPerWeek,
    top_posts: topPosts,
    synced_at: new Date().toISOString(),
  };
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
      /* continue to next post */
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
    const { token, perms, igUserId } = await getIgCreds(db, creatorId);
    if (!token && action !== 'remove') {
      return reply({ error: 'Connect Instagram first to fetch live peer benchmarks.' }, 400);
    }

    if (action === 'add') {
      const handle = String(body.username ?? '').trim();
      const { count } = await db
        .from('creator_benchmarks')
        .select('id', { count: 'exact', head: true })
        .eq('creator_id', creatorId);
      if ((count ?? 0) >= 8) {
        return reply({ error: 'You can track up to 8 peer creators at a time.' }, 400);
      }
      const peer = await fetchPeer(token, igUserId, handle);
      const { data, error } = await db
        .from('creator_benchmarks')
        .upsert({ creator_id: creatorId, ...peer }, { onConflict: 'creator_id,username' })
        .select('*')
        .single();
      if (error) {
        // Fallback if unique index is expression-based lower(btrim(username))
        const { data: existing } = await db
          .from('creator_benchmarks')
          .select('id')
          .eq('creator_id', creatorId)
          .ilike('username', peer.username)
          .maybeSingle();
        if (existing) {
          const upd = await db.from('creator_benchmarks').update(peer).eq('id', existing.id).select('*').single();
          if (upd.error) throw new Error(upd.error.message);
          return reply({ peer: upd.data });
        }
        const ins = await db.from('creator_benchmarks').insert({ creator_id: creatorId, ...peer }).select('*').single();
        if (ins.error) throw new Error(ins.error.message);
        return reply({ peer: ins.data });
      }
      return reply({ peer: data });
    }

    if (action === 'refresh') {
      const { data: rows } = await db
        .from('creator_benchmarks')
        .select('id, username')
        .eq('creator_id', creatorId);
      const updated = [];
      for (const r of rows ?? []) {
        try {
          const peer = await fetchPeer(token, igUserId, r.username);
          const { data } = await db.from('creator_benchmarks').update(peer).eq('id', r.id).select('*').single();
          if (data) updated.push(data);
        } catch {
          /* skip individual failed peer */
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
      const out = await mineAudienceQuestions(db, creatorId, token, perms);
      return reply(out);
    }

    return reply({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
