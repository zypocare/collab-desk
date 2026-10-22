// Instagram DMs arrive here (Meta webhook, "messages" field). Meta sends every DM; only possible
// brand collaborations are kept. Each new message is checked first (plain rules, then the free AI)
// and anything else is dropped straight away: not saved, no alert. Once a chat is a possible collab
// (or linked to one), its messages and her replies are kept, with an alert for each brand message.
// Meta checks the address once with a verify token (secret IG_VERIFY_TOKEN); every delivery is
// signed with the app secret, which is checked here. Meta posts here for every connected account; each
// message goes to the creator whose Instagram account it arrived for (ig_account.ig_user_id).
import { admin } from '../_shared/admin.ts';
import { parseDm } from '../_shared/parseDm.ts';

const GRAPH = 'https://graph.instagram.com';
const SECRET = Deno.env.get('INSTAGRAM_APP_SECRET') ?? '';
const VERIFY = Deno.env.get('IG_VERIFY_TOKEN') ?? '';

import { decide, ruleCheck, transcript, worthChecking, type Ai } from '../_shared/collabCheck.ts';
import { fillReply, matchRule, privateReply } from '../_shared/instagram.ts';

/** A one-line summary from the message itself (used when the AI doesn't give one). */
function ruleHint(text: string, username: string) {
  const p = parseDm(text, '');
  const parts = [p.type === 'barter' ? 'Barter' : p.type === 'hybrid' ? 'Paid + product' : p.fee ? 'Paid' : '', p.deliverables.map((d) => `${d.qty} ${d.kind}`).join(' + '), p.fee ? `budget ₹${p.fee.toLocaleString('en-IN')}` : '', p.product ? `for ${p.product}` : ''].filter(Boolean);
  return `${p.brand || '@' + username}: ${parts.join(', ') || 'asking about a collab'}`.slice(0, 120);
}

/** The last few messages of the chat, from Instagram (read for the check only, never saved). */
async function recent(token: string, igsid: string, me: string): Promise<{ fromMe: boolean; text: string }[]> {
  if (!token) return [];
  const r = await fetch(`${GRAPH}/me/conversations?platform=instagram&user_id=${igsid}&fields=messages.limit(8){message,from}&access_token=${token}`).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { data?: { messages?: { data?: { message?: string; from?: { id?: string } }[] } }[] } | null;
  return (j?.data?.[0]?.messages?.data ?? []).reverse().map((m) => ({ fromMe: String(m.from?.id ?? '') === me, text: String(m.message ?? '') }));
}

/** Is this chat a possible collab? A quick look first; then the free AI (Cloudflare only) reads the
 *  last few messages and decides, with the plain-words rules as a safety net (see collabCheck.ts). */
async function verdict(db: ReturnType<typeof admin>, creator: number, text: string, ctx: { token: string; igsid: string; me: string }): Promise<{ flag: '' | 'likely' | 'maybe'; hint: string; brand: string }> {
  const none = { flag: '' as const, hint: '', brand: '' };
  const first = ruleCheck(text);
  if (first === 'scam' || (!first && !worthChecking(text))) return none;
  const chat = transcript(await recent(ctx.token, ctx.igsid, ctx.me), text);
  // Their side of the chat only: her own words ("my rates are…") don't make it an offer.
  const rule = ruleCheck(chat.split('\n').filter((l) => l.startsWith('Them:')).join('\n'));
  if (rule === 'scam') return none;
  // Her niche, city and languages go with the chat, so the AI knows whose DMs it is reading.
  const { data: s } = await db.from('creator_settings').select('site_url, niche, city, content_languages').eq('id', creator).single();
  const site = String(s?.site_url || 'https://collab-desk.zypocare.workers.dev').replace(/\/$/, '');
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  await db.from('ai_tickets').insert({ token: ticket, creator_id: creator });
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const r = await fetch(`${site}/api/ai/classify`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: anon }, body: JSON.stringify({ text: chat, niche: s?.niche ?? '', city: s?.city ?? '', languages: s?.content_languages ?? [] }) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { collab?: string; kind?: string; brand?: string; summary?: string } | null;
  const ai: Ai = j && (j.collab === 'likely' || j.collab === 'maybe' || j.collab === 'no') ? { collab: j.collab, kind: j.kind } : null;
  const flag = decide(rule, ai);
  return { flag, hint: (flag && ai && ai.collab !== 'no' && j?.summary) || '', brand: j?.brand ?? '' };
}

async function validSignature(raw: string, header: string | null) {
  if (!SECRET || !header?.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === header.slice(7);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Meta's one-time check of the address.
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && VERIFY && url.searchParams.get('hub.verify_token') === VERIFY) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get('x-hub-signature-256')))) return new Response('Bad signature', { status: 401 });

  const db = admin();
  const body = JSON.parse(raw || '{}');

  // The creator an Instagram account belongs to, with her token (looked up once per delivery).
  type Owner = { creator: number; me: string; token: string };
  const owners = new Map<string, Owner | null>();
  const ownerOf = async (igUserId: string): Promise<Owner | null> => {
    if (!igUserId || igUserId === 'undefined') return null;
    if (!owners.has(igUserId)) {
      const { data: a } = await db.from('ig_account').select('id').eq('ig_user_id', igUserId).maybeSingle();
      const { data: t } = a ? await db.from('ig_token').select('access_token').eq('id', a.id).maybeSingle() : { data: null };
      owners.set(igUserId, a ? { creator: Number(a.id), me: igUserId, token: String(t?.access_token ?? '') } : null);
    }
    return owners.get(igUserId)!;
  };

  for (const entry of body.entry ?? []) {
    // Comment-to-DM: a comment with one of her keywords gets a DM with what they asked for.
    for (const ch of entry.changes ?? []) {
      if (ch.field !== 'comments' || !ch.value?.id) continue;
      const owner = await ownerOf(String(entry.id ?? ''));
      if (!owner) continue;
      const job = commentToDm(db, owner, ch.value).catch((e) => console.error('[comment-to-dm]', e));
      (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(job);
    }
    for (const ev of entry.messaging ?? []) {
      const m = ev.message;
      if (!m?.mid || m.is_deleted) continue;
      // Whose account: the entry's account, else her side of the message (the sender of her own echo,
      // the recipient of theirs).
      const owner = (await ownerOf(String(entry.id ?? ''))) ?? (await ownerOf(String((m.is_echo ? ev.sender?.id : ev.recipient?.id) ?? '')));
      if (!owner) {
        console.log(`[instagram-webhook] message for an account no creator has connected (${entry.id}); ignored`);
        continue;
      }
      const { creator, me, token } = owner;
      const fromMe = m.is_echo === true || String(ev.sender?.id) === me;
      const igsid = String(fromMe ? ev.recipient?.id : ev.sender?.id);
      const at = new Date(Number(ev.timestamp) || Date.now()).toISOString();
      const text = String(m.text ?? (m.attachments?.length ? '[Photo or video]' : ''));

      const { data: thread } = await db.from('ig_threads').select('igsid, username, unread, collab_flag, collab_id').eq('creator_id', creator).eq('igsid', igsid).maybeSingle();
      const kept = !!thread && (!!thread.collab_id || thread.collab_flag === 'likely' || thread.collab_flag === 'maybe');

      if (kept) {
        // A chat about a collab: keep the message (hers too), alert for theirs.
        await db.from('ig_threads').update({ last_text: text.slice(0, 300), last_at: at, ...(fromMe ? {} : { last_from_them_at: at, unread: (thread.unread ?? 0) + 1 }) }).eq('creator_id', creator).eq('igsid', igsid);
        await db.from('ig_dms').upsert({ creator_id: creator, mid: m.mid, igsid, from_me: fromMe, text, attachments: m.attachments ?? [], created_at: at });
        if (!fromMe) await db.from('outbox').insert({ creator_id: creator, kind: 'ig_dm', to_email: '', payload: { from: thread.username || 'Someone', text: text.slice(0, 140), igsid } });
        continue;
      }
      // Anything else: her own messages and chats she marked "Not a collab" are never kept.
      if (fromMe || thread?.collab_flag === 'no' || !m.text) continue;

      // A new message in a chat that isn't a collab yet: check it before keeping anything.
      const job = (async () => {
        const v = await verdict(db, creator, text, { token, igsid, me });
        if (!v.flag) return; // not a collab: dropped, nothing saved
        let profile: { username?: string; name?: string; profile_pic?: string } = {};
        if (token) {
          const r = await fetch(`${GRAPH}/${igsid}?fields=username,name,profile_pic&access_token=${token}`).catch(() => null);
          profile = (await r?.json().catch(() => ({}))) ?? {};
        }
        const who = profile.username || thread?.username || 'someone';
        const hint = v.hint || ruleHint(text, who);
        await db.from('ig_threads').upsert({
          creator_id: creator,
          igsid,
          ...(profile.username ? { username: profile.username, name: profile.name ?? '', picture: profile.profile_pic ?? '' } : {}),
          last_text: text.slice(0, 300),
          last_at: at,
          last_from_them_at: at,
          unread: (thread?.unread ?? 0) + 1,
          collab_flag: v.flag,
          collab_hint: hint
        }, { onConflict: 'creator_id,igsid' });
        await db.from('ig_dms').upsert({ creator_id: creator, mid: m.mid, igsid, from_me: false, text, attachments: m.attachments ?? [], created_at: at });
        await db.from('outbox').insert({ creator_id: creator, kind: 'ig_collab', to_email: '', payload: { from: who, brand: v.brand, text: hint, igsid } });
      })().catch((e) => console.error('[collab check]', e));
      // In the background, so Meta gets its answer straight away.
      (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(job);
    }
  }
  return new Response('ok');
});

// A comment on her post. Off: nothing. Ask: kept for her to send from the app. Auto: sent now.
// Her own comments, comments with no keyword and repeats are skipped; at most 200 a day go out.
async function commentToDm(db: ReturnType<typeof admin>, owner: { creator: number; me: string; token: string }, v: { id: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string } }) {
  if (!v.text || String(v.from?.id ?? '') === owner.me) return;
  const { data: s } = await db.from('creator_settings').select('comment_dm_mode, site_url').eq('id', owner.creator).maybeSingle();
  if (!s || s.comment_dm_mode === 'off') return;
  const { data: rules } = await db.from('dm_rules').select('id, keyword, reply, uses').eq('creator_id', owner.creator).eq('active', true);
  const rule = matchRule(rules ?? [], v.text);
  if (!rule) return;
  const reply = fillReply(rule.reply, String(s.site_url ?? '').replace(/\/$/, ''));
  const row = { creator_id: owner.creator, comment_id: String(v.id), media_id: String(v.media?.id ?? ''), from_username: String(v.from?.username ?? ''), text: String(v.text).slice(0, 500), rule_id: rule.id, reply };
  const { data: log, error } = await db.from('dm_auto_log').insert({ ...row, status: 'pending' }).select('id').maybeSingle();
  if (error || !log) return; // a repeat delivery of the same comment
  if (s.comment_dm_mode !== 'auto' || !owner.token) {
    await db.from('outbox').insert({ creator_id: owner.creator, kind: 'comment_dm', to_email: '', payload: { from: row.from_username || 'Someone', keyword: rule.keyword, text: row.text.slice(0, 140) } });
    return;
  }
  const since = new Date(Date.now() - 864e5).toISOString();
  const { count } = await db.from('dm_auto_log').select('id', { count: 'exact', head: true }).eq('creator_id', owner.creator).eq('status', 'sent').gte('sent_at', since);
  if ((count ?? 0) >= 200) return void (await db.from('dm_auto_log').update({ status: 'skipped', error: 'Daily limit of 200 reached' }).eq('id', log.id));
  try {
    await privateReply(owner.token, row.comment_id, reply);
    await db.from('dm_auto_log').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', log.id);
    await db.from('dm_rules').update({ uses: (rule.uses ?? 0) + 1 }).eq('id', rule.id);
  } catch (e) {
    await db.from('dm_auto_log').update({ status: 'failed', error: String((e as Error)?.message ?? e).slice(0, 300) }).eq('id', log.id);
  }
}
