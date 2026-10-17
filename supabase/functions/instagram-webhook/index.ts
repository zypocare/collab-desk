// Instagram DMs arrive here (Meta webhook, "messages" field). Each message is saved under its
// conversation, and she gets a phone alert. Meta checks the address once with a verify token
// (secret IG_VERIFY_TOKEN); every delivery is signed with the app secret, which is checked here.
import { admin } from '../_shared/admin.ts';

const GRAPH = 'https://graph.instagram.com';
const SECRET = Deno.env.get('INSTAGRAM_APP_SECRET') ?? '';
const VERIFY = Deno.env.get('IG_VERIFY_TOKEN') ?? '';

// Business words: only DMs with one of these go to the AI check (fan messages don't use the allowance).
const BUSINESS = /\b(collab\w*|partner\w*|paid|budget|barter|campaign|promot\w*|sponsor\w*|brand|rates?|charges?|commercials?|ugc|reels?|deliverables?|launch|pr package|gift\w*|product|influencer|marketing|agency|quote|price|pricing|fee|inr|rs\.?)\b|₹|\d+\s?k\b/i;

/** Ask the site's free AI whether the conversation looks like a brand collaboration, and label it. */
async function checkCollab(db: ReturnType<typeof admin>, igsid: string, username: string) {
  const { data: t } = await db.from('ig_threads').select('collab_flag, collab_id').eq('igsid', igsid).maybeSingle();
  if (t?.collab_id || t?.collab_flag === 'likely' || t?.collab_flag === 'no') return;
  const { data: msgs } = await db.from('ig_dms').select('from_me, text, created_at').eq('igsid', igsid).order('created_at', { ascending: false }).limit(8);
  const text = (msgs ?? []).reverse().map((m) => `${m.from_me ? 'Creator' : username || 'Them'}: ${m.text}`).join('\n');
  if (!BUSINESS.test(text)) return;
  const { data: s } = await db.from('creator_settings').select('site_url').eq('id', 1).single();
  const site = String(s?.site_url || 'https://collab-desk.zypocare.workers.dev').replace(/\/$/, '');
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  await db.from('ai_tickets').insert({ token: ticket });
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const r = await fetch(`${site}/api/ai/classify`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: anon }, body: JSON.stringify({ text }) }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { collab?: string; brand?: string; summary?: string } | null;
  if (!j?.collab || j.collab === 'no') return;
  await db.from('ig_threads').update({ collab_flag: j.collab, collab_hint: j.summary || j.brand || '' }).eq('igsid', igsid);
  if (j.collab === 'likely' && t?.collab_flag !== 'maybe') {
    await db.from('outbox').insert({ kind: 'ig_collab', to_email: '', payload: { from: username, brand: j.brand ?? '', text: j.summary ?? '', igsid } });
  }
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
        const who = profile.username || thread?.username || 'Someone';
        await db.from('outbox').insert({ kind: 'ig_dm', to_email: '', payload: { from: who, text: text.slice(0, 140), igsid } });
        // Collab check in the background, so Meta gets its answer straight away.
        const job = checkCollab(db, igsid, who).catch((e) => console.error('[collab check]', e));
        (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(job);
      }
    }
  }
  return new Response('ok');
});
