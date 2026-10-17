// Instagram DMs arrive here (Meta webhook, "messages" field). Each message is saved under its
// conversation, and she gets a phone alert. Meta checks the address once with a verify token
// (secret IG_VERIFY_TOKEN); every delivery is signed with the app secret, which is checked here.
import { admin } from '../_shared/admin.ts';

const GRAPH = 'https://graph.instagram.com';
const SECRET = Deno.env.get('INSTAGRAM_APP_SECRET') ?? '';
const VERIFY = Deno.env.get('IG_VERIFY_TOKEN') ?? '';

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
  const { data: tok } = await db.from('ig_token').select('access_token').eq('id', 1).maybeSingle();
  const { data: acct } = await db.from('ig_account').select('ig_user_id').eq('id', 1).maybeSingle();
  const me = String(acct?.ig_user_id ?? '');
  const body = JSON.parse(raw || '{}');

  for (const entry of body.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const m = ev.message;
      if (!m?.mid || m.is_deleted) continue;
      const fromMe = m.is_echo === true || String(ev.sender?.id) === me;
      const igsid = String(fromMe ? ev.recipient?.id : ev.sender?.id);
      const at = new Date(Number(ev.timestamp) || Date.now()).toISOString();
      const text = String(m.text ?? (m.attachments?.length ? '[Photo or video]' : ''));

      // Who it is (once per conversation).
      const { data: thread } = await db.from('ig_threads').select('igsid, username, unread').eq('igsid', igsid).maybeSingle();
      let profile: { username?: string; name?: string; profile_pic?: string } = {};
      if (!thread?.username && tok?.access_token) {
        const r = await fetch(`${GRAPH}/${igsid}?fields=username,name,profile_pic&access_token=${tok.access_token}`).catch(() => null);
        profile = (await r?.json().catch(() => ({}))) ?? {};
      }
      await db.from('ig_threads').upsert({
        igsid,
        ...(profile.username ? { username: profile.username, name: profile.name ?? '', picture: profile.profile_pic ?? '' } : {}),
        last_text: text.slice(0, 300),
        last_at: at,
        ...(fromMe ? {} : { last_from_them_at: at, unread: (thread?.unread ?? 0) + 1 })
      });
      await db.from('ig_dms').upsert({ mid: m.mid, igsid, from_me: fromMe, text, attachments: m.attachments ?? [], created_at: at });
      if (!fromMe) {
        await db.from('outbox').insert({ kind: 'ig_dm', to_email: '', payload: { from: profile.username || thread?.username || 'Someone', text: text.slice(0, 140), igsid } });
      }
    }
  }
  return new Response('ok');
});
