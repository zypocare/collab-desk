// Golden Hour Launch Pulse: tracks newly posted Reels in their first 60 minutes,
// snapshots live velocity vs the creator's 90-day median, sends a push alert while
// momentum is hot (or needs rescue), and powers 1-tap comment replies & auto-DM rules.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed } from '../_shared/admin.ts';
import { activeCreators, creatorOfCaller } from '../_shared/creators.ts';
import { ig } from '../_shared/instagram.ts';
import { pushToCreator } from '../_shared/push.ts';

const GRAPH = 'https://graph.instagram.com';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Snapshot = {
  minute: number;
  views: number;
  shares: number;
  saves: number;
  likes: number;
  comments: number;
  ts: string;
};

type IgComment = {
  id: string;
  username: string;
  text: string;
  timestamp: string;
  replied: boolean;
  suggestedReply: string;
};

function median(nums: number[]): number {
  const arr = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function suggestStoryHook(caption: string): string {
  const clean = caption.replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
  const lead = clean.split(/[.!?\n]/)[0]?.trim() ?? '';
  if (lead.length >= 16) {
    const short = lead.length > 78 ? lead.slice(0, 75).trim() + '…' : lead;
    return `"${short} — full details in the new Reel (tap to watch)"`;
  }
  return '"Just dropped a new Reel — tap to watch and tell me your favourite part in the comments"';
}

function suggestCommentReply(text: string, keyword: string | null): string {
  const t = text.toLowerCase();
  if (/link|price|cost|where|location|pin|buy|shop/.test(t)) {
    return keyword
      ? `Comment ${keyword} and I'll DM you the exact details straight away!`
      : 'Just dropped the details — check your DMs or reply here if you need the exact link!';
  }
  if (/size|fit|shade|wear/.test(t)) {
    return 'True to size! Let me know if you want the exact shade/sizing details.';
  }
  if (/love|amazing|wow|pretty|nice|fire|best|obsessed|saving/.test(t)) {
    return 'Thank you so much! Which part was your favourite?';
  }
  return 'Thanks for watching! Let me know if you want a Part 2 on this.';
}

async function computeBaselines(db: SupabaseClient, creatorId: number) {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const { data: rows } = await db
    .from('ig_media')
    .select('views, reach, shares, saves, product_type, media_type')
    .eq('creator_id', creatorId)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(60);

  const reels = (rows ?? []).filter(
    (m) => m.product_type === 'REELS' || m.media_type === 'VIDEO' || (m.views ?? 0) > 0,
  );
  const viewsList = reels.map((m) => Number(m.views ?? m.reach ?? 0));
  const sharesPer1k = reels
    .map((m) => {
      const v = Number(m.views ?? m.reach ?? 0);
      return v >= 100 && m.shares != null ? (Number(m.shares) / v) * 1000 : 0;
    })
    .filter((x) => x > 0);
  const savesPer1k = reels
    .map((m) => {
      const v = Number(m.views ?? m.reach ?? 0);
      return v >= 100 && m.saves != null ? (Number(m.saves) / v) * 1000 : 0;
    })
    .filter((x) => x > 0);

  // Typical first-hour views ≈ 28% of a Reel's 90-day steady-state median views.
  const fullMedViews = median(viewsList) || 2000;
  const hour1MedViews = Math.max(250, Math.round(fullMedViews * 0.28));
  const medShares1k = Number((median(sharesPer1k) || 10).toFixed(2));
  const medSaves1k = Number((median(savesPer1k) || 12).toFixed(2));

  return { hour1MedViews, medShares1k, medSaves1k };
}

function scorePulse(
  minute: number,
  views: number,
  shares: number,
  saves: number,
  base: { hour1MedViews: number; medShares1k: number; medSaves1k: number },
) {
  // Expected share of Hour-1 views by minute m (front-loaded curve).
  const frac = Math.min(1, Math.max(0.12, Math.pow(Math.min(60, Math.max(5, minute)) / 60, 0.85)));
  const expectedViews = Math.max(50, base.hour1MedViews * frac);
  const viewRatio = views / expectedViews;

  const shares1k = views > 0 ? (shares / views) * 1000 : 0;
  const saves1k = views > 0 ? (saves / views) * 1000 : 0;
  const shareRatio = base.medShares1k > 0 ? shares1k / base.medShares1k : 1;
  const saveRatio = base.medSaves1k > 0 ? saves1k / base.medSaves1k : 1;

  // Weighted heavily toward shares (Explore trigger) + early views + saves.
  const composite = viewRatio * 0.45 + shareRatio * 0.35 + saveRatio * 0.2;
  const score = Math.max(15, Math.min(99, Math.round(52 + Math.log2(Math.max(0.25, composite)) * 22)));
  const status: 'hot' | 'steady' | 'slow' = score >= 76 ? 'hot' : score >= 52 ? 'steady' : 'slow';

  return { score, status, viewRatio };
}

async function fetchMediaComments(
  token: string,
  mediaId: string,
  perms: string,
  keyword: string | null,
): Promise<{ comments: IgComment[]; needsPerm: boolean }> {
  if (!perms.includes('instagram_business_manage_comments')) {
    return { comments: [], needsPerm: true };
  }
  try {
    const u = new URL(`${GRAPH}/${mediaId}/comments`);
    u.searchParams.set('fields', 'id,text,username,timestamp,replies{id}');
    u.searchParams.set('limit', '15');
    u.searchParams.set('access_token', token);
    const res = await fetch(u);
    const json = await res.json();
    if (!res.ok || json.error) return { comments: [], needsPerm: false };
    const rows = Array.isArray(json.data) ? json.data : [];
    const comments: IgComment[] = rows.map((c: Record<string, unknown>) => {
      const replies = (c.replies as { data?: unknown[] } | undefined)?.data ?? [];
      const text = String(c.text ?? '');
      return {
        id: String(c.id ?? ''),
        username: String(c.username ?? 'follower'),
        text,
        timestamp: String(c.timestamp ?? new Date().toISOString()),
        replied: replies.length > 0,
        suggestedReply: suggestCommentReply(text, keyword),
      };
    });
    return { comments, needsPerm: false };
  } catch {
    return { comments: [], needsPerm: false };
  }
}

async function syncCreatorPulse(db: SupabaseClient, creatorId: number, notify: boolean) {
  const { data: tokenRow } = await db
    .from('ig_token')
    .select('access_token, permissions')
    .eq('id', creatorId)
    .maybeSingle();
  if (!tokenRow?.access_token) return { skipped: 'Instagram not connected', pulse: null, comments: [], needsPerm: false };

  const token = String(tokenRow.access_token);
  const perms = String(tokenRow.permissions ?? '');

  // Fetch 5 newest posts from Instagram Graph API.
  const recent = await ig.media(token, 5);
  const candidate = recent.find((m) => m.media_product_type === 'REELS' || m.media_type === 'VIDEO') ?? recent[0];
  if (!candidate) return { skipped: 'No recent media', pulse: null, comments: [], needsPerm: false };

  const postedMs = Date.parse(candidate.timestamp);
  const ageMin = Math.max(1, Math.round((Date.now() - postedMs) / 60000));
  // During cron, only track posts within their first 90 minutes.
  if (notify && ageMin > 90) return { skipped: 'No Reel in Golden Hour', pulse: null, comments: [], needsPerm: false };

  const [ins, base, existingRes] = await Promise.all([
    ig.insights(token, candidate.id),
    computeBaselines(db, creatorId),
    db
      .from('ig_launch_pulses')
      .select('*')
      .eq('creator_id', creatorId)
      .eq('media_id', candidate.id)
      .maybeSingle(),
  ]);

  const views = Number(ins.views ?? ins.reach ?? 0);
  const shares = Number(ins.shares ?? 0);
  const saves = Number(ins.saved ?? 0);
  const likes = Number(ins.likes ?? candidate.like_count ?? 0);
  const commentsCount = Number(ins.comments ?? candidate.comments_count ?? 0);

  const { score, status, viewRatio } = scorePulse(Math.min(60, ageMin), views, shares, saves, base);
  const prev = existingRes.data as Record<string, unknown> | null;
  const prevSnaps = Array.isArray(prev?.snapshots) ? (prev!.snapshots as Snapshot[]) : [];
  const snapMin = Math.min(60, ageMin);
  const newSnap: Snapshot = {
    minute: snapMin,
    views,
    shares,
    saves,
    likes,
    comments: commentsCount,
    ts: new Date().toISOString(),
  };

  // Dedupe snapshots within 3 minutes of each other.
  const snapshots = [
    ...prevSnaps.filter((s) => Math.abs(s.minute - snapMin) >= 3),
    newSnap,
  ].sort((a, b) => a.minute - b.minute);

  const storyHook = String(prev?.story_hook || suggestStoryHook(candidate.caption ?? ''));
  const dmKeyword = (prev?.dm_keyword as string | null) ?? null;

  const row = {
    creator_id: creatorId,
    media_id: candidate.id,
    caption: candidate.caption ?? '',
    permalink: candidate.permalink ?? '',
    thumbnail_url: candidate.thumbnail_url || candidate.media_url || '',
    posted_at: candidate.timestamp,
    snapshots,
    latest_views: views,
    latest_shares: shares,
    latest_saves: saves,
    latest_likes: likes,
    latest_comments: commentsCount,
    median_views: base.hour1MedViews,
    median_shares_1k: base.medShares1k,
    median_saves_1k: base.medSaves1k,
    pulse_score: score,
    status,
    story_hook: storyHook,
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await db
    .from('ig_launch_pulses')
    .upsert(row, { onConflict: 'creator_id,media_id' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  // Send one push notification per Reel once it reaches minute 12–55.
  if (notify && !prev?.notified_at && ageMin >= 12 && ageMin <= 55) {
    const mult = `${Math.max(0.2, viewRatio).toFixed(1)}x`;
    const title =
      status === 'hot'
        ? `Golden Hour: Your Reel is ${mult} faster than usual`
        : status === 'steady'
          ? `Golden Hour check-in: ${mult} your usual pace`
          : 'Golden Hour rescue: give your new Reel a quick spark';
    const body =
      status === 'hot'
        ? `${views.toLocaleString('en-IN')} views & ${shares} shares in ${ageMin}m. Reply to early comments now to keep pushing to Explore.`
        : status === 'steady'
          ? `${views.toLocaleString('en-IN')} views at min ${ageMin}. Answer waiting comments or reshare to Stories to trigger a second wave.`
          : `${views.toLocaleString('en-IN')} views at min ${ageMin}. Tap for a Story hook & Comment-to-DM boost while Hour 1 is still open.`;

    await pushToCreator(db, creatorId, {
      title,
      body,
      url: '/studio/grow/pulse',
      tag: `golden-hour-${candidate.id}`,
      kind: 'golden_hour_pulse',
      actions: [{ action: 'open', title: 'Open Pulse', url: '/studio/grow/pulse' }],
    });

    await db
      .from('ig_launch_pulses')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', saved.id);
  }

  const { comments, needsPerm } = await fetchMediaComments(token, candidate.id, perms, dmKeyword);
  return { pulse: saved, comments, needsPerm };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  const db = admin();

  // 1. Scheduled cron sweep across active creators.
  if (cronAllowed(req)) {
    const creators = await activeCreators(db);
    const results = [];
    for (const c of creators) {
      try {
        const res = await syncCreatorPulse(db, c.id, true);
        results.push({ creator: c.id, status: res.pulse ? 'tracked' : res.skipped });
      } catch (e) {
        results.push({ creator: c.id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return reply({ results });
  }

  // 2. Interactive creator calls from /studio/grow/pulse.
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: ok } = await asUser.rpc('is_creator');
  const creatorId = ok === true ? await creatorOfCaller(req) : null;
  if (!creatorId) return reply({ error: 'Only the creator can use Golden Hour Pulse.' }, 403);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? 'refresh');

  try {
    if (action === 'refresh') {
      const out = await syncCreatorPulse(db, creatorId, false);
      return reply(out);
    }

    if (action === 'reply_comment') {
      const commentId = String(body.comment_id ?? '').trim();
      const message = String(body.message ?? '').trim();
      if (!commentId || !message) return reply({ error: 'Comment ID and reply message are required.' }, 400);

      const { data: tokenRow } = await db
        .from('ig_token')
        .select('access_token, permissions')
        .eq('id', creatorId)
        .maybeSingle();
      if (!tokenRow?.access_token) return reply({ error: 'Instagram is not connected.' }, 400);
      if (!String(tokenRow.permissions ?? '').includes('instagram_business_manage_comments')) {
        return reply({ error: 'Reconnect Instagram with comment permission to reply from Miracle.' }, 403);
      }

      const form = new URLSearchParams({ message: message.slice(0, 1000), access_token: tokenRow.access_token });
      const res = await fetch(`${GRAPH}/${commentId}/replies`, { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        return reply({ error: json.error?.message ?? 'Instagram did not accept the comment reply.' }, 400);
      }
      return reply({ ok: true, id: json.id ?? null });
    }

    if (action === 'activate_dm') {
      const keyword = String(body.keyword ?? '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      const pulseId = String(body.pulse_id ?? '').trim();
      const replyText = String(body.reply ?? '').trim() || 'Hi! Thanks for commenting — here is the link you asked for: {link}';
      if (keyword.length < 2 || keyword.length > 30) {
        return reply({ error: 'Keyword must be 2–30 letters or numbers.' }, 400);
      }

      // Upsert into dm_rules so existing instagram-webhook Comment-to-DM picks it up automatically.
      const { data: existing } = await db
        .from('dm_rules')
        .select('id')
        .eq('creator_id', creatorId)
        .ilike('keyword', keyword)
        .maybeSingle();

      if (existing) {
        await db.from('dm_rules').update({ active: true, reply: replyText }).eq('id', existing.id);
      } else {
        await db.from('dm_rules').insert({ creator_id: creatorId, keyword, reply: replyText, active: true });
      }

      if (pulseId) {
        await db.from('ig_launch_pulses').update({ dm_keyword: keyword }).eq('id', pulseId).eq('creator_id', creatorId);
      }
      return reply({ ok: true, keyword });
    }

    if (action === 'mark_story') {
      const pulseId = String(body.pulse_id ?? '').trim();
      if (pulseId) {
        await db.from('ig_launch_pulses').update({ story_done: true }).eq('id', pulseId).eq('creator_id', creatorId);
      }
      return reply({ ok: true });
    }

    return reply({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
