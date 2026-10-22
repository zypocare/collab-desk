// Connects a creator's Instagram: swaps the one-time code for a 60-day token, stores it on the server,
// then runs the first sync. Also handles "Disconnect". Only the creator's own team may call it.
//
// Which creator is connecting has to survive the trip to Instagram and back, so "start" hands out a
// state that carries the creator's id, signed by the server and valid for 15 minutes. Instagram can
// send her straight back to this function (GET, with the code and that state), which checks the
// state, saves the token for that creator and sends her on to her own site. The studio's own
// callback page (POST with the code) still works: there the signed-in person says who she is.
import { admin } from '../_shared/admin.ts';
import { creatorOfCaller, settingsOf } from '../_shared/creators.ts';
import { authorizeUrl, ensureMessages, ig } from '../_shared/instagram.ts';
import { runSync } from '../_shared/igsync.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

// Where Instagram sends her back when the connection starts here (add it in the Meta app's redirect addresses).
const CALLBACK = `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/instagram-auth`;
const STATE_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET') ?? '';
const STATE_LIFE = 15 * 60; // seconds
const BASIC = ['instagram_business_basic', 'instagram_business_manage_insights'];
const EXTRA = ['instagram_business_manage_messages', 'instagram_business_content_publish'];

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(STATE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`ig-connect:${text}`))));
}

/** "creator.expires.nonce.signature" */
async function makeState(creator: number) {
  const body = `${creator}.${Math.floor(Date.now() / 1000) + STATE_LIFE}.${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return `${body}.${await sign(body)}`;
}

/** The creator a state was made for, or null if it is forged, changed or out of date. */
async function readState(state: string): Promise<number | null> {
  const parts = state.split('.');
  if (parts.length !== 4 || !STATE_SECRET) return null;
  const [creator, expires, nonce, signature] = parts;
  const expected = await sign(`${creator}.${expires}.${nonce}`);
  // Compared in full every time, so the answer doesn't leak how much of it matched.
  let diff = expected.length ^ signature.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
  if (diff !== 0 || Number(expires) * 1000 < Date.now()) return null;
  const id = Number(creator);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Swaps the code, saves the token as this creator's, starts her DMs and runs the first sync. */
async function connect(db: ReturnType<typeof admin>, creator: number, code: string, redirectUri: string) {
  const t = await ig.exchangeCode(code, redirectUri);
  // An Instagram account belongs to one creator: refuse before saving the token.
  const p = await ig.profile(t.token);
  const { data: owner } = await db.from('ig_account').select('id').eq('ig_user_id', p.user_id).neq('id', creator).limit(1);
  if (owner?.length) throw new Error(`@${p.username} is already connected to another creator on Miracle.`);
  const { error } = await db.from('ig_token').upsert({ id: creator, access_token: t.token, obtained_at: new Date().toISOString(), expires_at: new Date(Date.now() + t.expiresIn * 1000).toISOString(), permissions: (t as { permissions?: string }).permissions ?? '' });
  if (error) throw new Error(error.message);
  // Start receiving her DMs (Meta sends them only after this).
  await ensureMessages(db, creator).catch((e) => console.error('[subscribe messages]', e));
  return await runSync(db, creator);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();

  // Instagram sending her back here: the signed state says which creator is connecting.
  if (req.method === 'GET') {
    const q = new URL(req.url).searchParams;
    const creator = await readState(q.get('state') ?? '');
    if (!creator) return new Response("This sign-in link isn't valid any more. Start again from My page.", { status: 400 });
    const site = String((await settingsOf(db, creator))?.site_url ?? '').replace(/\/$/, '');
    const back = (path: string, params: Record<string, string> = {}) => {
      if (!/^https?:\/\//.test(site)) return new Response(params.error_description ?? 'Instagram connected. You can close this tab.', { status: params.error ? 400 : 200 });
      const u = new URL(site + path);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      return Response.redirect(u.toString(), 302);
    };
    // Errors go to the studio's Instagram page, which shows them; success goes where that page goes.
    if (q.get('error')) return back('/studio/instagram', { error: q.get('error')!, error_description: q.get('error_description') || 'Instagram sign-in was cancelled.' });
    const code = (q.get('code') ?? '').replace(/#_$/, '');
    if (!code) return back('/studio/instagram', { error: 'missing_code', error_description: 'Instagram did not send a sign-in code. Start again from My page.' });
    try {
      await connect(db, creator, code, CALLBACK);
      return back('/studio/settings', { s: 'profile', ig: 'connected' });
    } catch (e) {
      return back('/studio/instagram', { error: 'connect_failed', error_description: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  }

  const creator = await creatorOfCaller(req);
  if (!creator) return reply({ error: 'Only the creator can connect Instagram.' }, 403);
  const { action, code, redirect_uri, state, extra } = await req.json().catch(() => ({}));

  if (action === 'disconnect') {
    await db.from('ig_token').delete().eq('id', creator);
    await db.from('ig_account').update({ connected: false, last_error: '' }).eq('id', creator);
    return reply({ ok: true });
  }

  if (!ig.configured) return reply({ error: 'Instagram is not set up on the server yet (INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET). See docs/SETUP.md.' }, 400);

  // The address to send her to on Instagram, with a signed state for this creator.
  if (action === 'start') {
    if (!STATE_SECRET) return reply({ error: 'INSTAGRAM_APP_SECRET is not set on the server.' }, 400);
    const signed = await makeState(creator);
    const scope = [...BASIC, ...(extra ? EXTRA : [])].join(',');
    return reply({ state: signed, redirect_uri: CALLBACK, url: authorizeUrl(CALLBACK, scope, signed) });
  }

  if (!code || !redirect_uri) return reply({ error: 'Missing sign-in code.' }, 400);
  // A state signed here must be for the creator who is signed in. (The studio's own page makes its
  // own state and checks it in the browser; that still works.)
  if (typeof state === 'string' && state.split('.').length === 4 && (await readState(state)) !== creator) {
    return reply({ error: "This sign-in link isn't valid any more. Start again from My page." }, 400);
  }

  try {
    const summary = await connect(db, creator, String(code), String(redirect_uri));
    return reply({ ok: true, summary });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
