// A creator's reply to an Instagram DM, sent from the app (allowed for 24 hours after their last message).
// Also "load": brings in the latest messages of a conversation from Instagram.
import { admin } from '../_shared/admin.ts';
import { creatorOfCaller } from '../_shared/creators.ts';
import { privateReply } from '../_shared/instagram.ts';

const GRAPH = 'https://graph.instagram.com/v21.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const creator = await creatorOfCaller(req);
  if (!creator) return reply({ error: 'Only the creator can do this.' }, 403);

  const db = admin();
  const { data: tok } = await db.from('ig_token').select('access_token, permissions').eq('id', creator).maybeSingle();
  if (!tok?.access_token) return reply({ error: 'Connect Instagram first.' }, 400);
  if (!String(tok.permissions ?? '').includes('instagram_business_manage_messages')) return reply({ error: 'Allow DMs first: My page > Profile & Instagram > Allow DMs and posting.' }, 400);
  const { igsid, text, comment_log } = await req.json().catch(() => ({}));
  // Comment-to-DM, "ask" mode: she sends (or skips) a reply that was waiting for her.
  if (comment_log) {
    const { data: log } = await db.from('dm_auto_log').select('id, comment_id, reply, status, rule_id').eq('creator_id', creator).eq('id', comment_log).maybeSingle();
    if (!log || log.status !== 'pending') return reply({ error: 'That reply was already handled.' }, 400);
    if (text === false) {
      await db.from('dm_auto_log').update({ status: 'skipped' }).eq('id', log.id);
      return reply({ ok: true });
    }
    if (!String(tok.permissions ?? '').includes('instagram_business_manage_comments')) return reply({ error: 'Allow comments first: turn on Comment-to-DM again and say yes on Instagram.' }, 400);
    try {
      await privateReply(tok.access_token, log.comment_id, typeof text === 'string' && text.trim() ? text.trim() : log.reply);
    } catch (e) {
      await db.from('dm_auto_log').update({ status: 'failed', error: String((e as Error)?.message ?? e).slice(0, 300) }).eq('id', log.id);
      return reply({ error: String((e as Error)?.message ?? e) }, 400);
    }
    await db.from('dm_auto_log').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', log.id);
    return reply({ ok: true });
  }
  if (!igsid) return reply({ error: 'Missing conversation.' }, 400);

  const body = String(text ?? '').trim();
  if (!body) return reply({ error: 'Write a message first.' }, 400);
  const { data: t } = await db.from('ig_threads').select('last_from_them_at').eq('creator_id', creator).eq('igsid', igsid).maybeSingle();
  if (t?.last_from_them_at && Date.now() - Date.parse(t.last_from_them_at) > 24 * 3600e3) {
    return reply({ error: "Instagram only allows replies within 24 hours of their last message. Reply in the Instagram app instead." }, 400);
  }
  const r = await fetch(`${GRAPH}/me/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok.access_token}` },
    body: JSON.stringify({ recipient: { id: igsid }, message: { text: body.slice(0, 1000) } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) return reply({ error: j.error?.message ?? "Instagram didn't accept the message." }, 400);
  const now = new Date().toISOString();
  await db.from('ig_dms').upsert({ creator_id: creator, mid: String(j.message_id ?? `me-${Date.now()}`), igsid, from_me: true, text: body, created_at: now });
  await db.from('ig_threads').update({ last_text: body.slice(0, 300), last_at: now, unread: 0 }).eq('creator_id', creator).eq('igsid', igsid);
  return reply({ ok: true });
});
