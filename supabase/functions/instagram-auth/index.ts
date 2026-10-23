// Connects a creator's Instagram: swaps the one-time code for a 60-day token, stores it on the server,
// then runs the first sync. Also handles "Disconnect". Only the creator's own team may call it.
//
// Which creator is connecting has to survive the trip to Instagram and back, so "start" hands out a
// state that carries the creator's id, signed by the server and valid for 15 minutes. Instagram can
// send her straight back to this function (GET, with the code and that state), which checks the
// state, saves the token for that creator and sends her on to her own site. The studio's own
// callback page (POST with the code) still works: there the signed-in person says who she is.
//
// Brands connect too (Settings, Company & Instagram): only their profile is read, to show creators the
// brand's real handle, photo and followers as "Verified on Instagram". Their state carries "b:<team owner>".
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
// Comment-to-DM: asked for only when she turns it on, so connecting stays the same for everyone else.
const COMMENTS = ['instagram_business_manage_comments'];
const BRAND = ['instagram_business_basic'];
// Where a brand lands after connecting (Miracle's own address; the sign-in is shared across miracleapp.live).
const BRAND_SETTINGS = Deno.env.get('BRAND_SETTINGS_URL') ?? 'https://app.miracleapp.live/brand/settings';
// Miracle's own address (the phone app opens it).
const APP_ORIGIN = new URL(BRAND_SETTINGS).origin;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function sign(text: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(STATE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`ig-connect:${text}`))));
}

/** "who.expires.nonce.signature": who is a creator's id, or "b:" and a brand team's owner. */
async function makeState(who: number | string) {
  const body = `${who}.${Math.floor(Date.now() / 1000) + STATE_LIFE}.${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return `${body}.${await sign(body)}`;
}

/** Who a state was made for, or null if it is forged, changed or out of date. */
async function readWho(state: string): Promise<{ creator?: number; brand?: string; app?: boolean } | null> {
  const parts = state.split('.');
  if (parts.length !== 4 || !STATE_SECRET) return null;
  const [who, expires, nonce, signature] = parts;
  const expected = await sign(`${who}.${expires}.${nonce}`);
  // Compared in full every time, so the answer doesn't leak how much of it matched.
  let diff = expected.length ^ signature.length;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (signature.charCodeAt(i) || 0);
  if (diff !== 0 || Number(expires) * 1000 < Date.now()) return null;
  if (who.startsWith('b:')) return /^[0-9a-f-]{36}$/.test(who.slice(2)) ? { brand: who.slice(2) } : null;
  // "12~a": creator 12, connecting from the Android or iPhone app (sent back to the app's own address).
  const app = who.endsWith('~a');
  const id = Number(app ? who.slice(0, -2) : who);
  return Number.isInteger(id) && id > 0 ? { creator: id, app } : null;
}

/** The creator a state was made for (creator states only). */
async function readState(state: string): Promise<number | null> {
  return (await readWho(state))?.creator ?? null;
}

/** The brand team owner the signed-in person connects for (the team's Admin), or null. */
async function brandOfCaller(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/brand_ig_owner`, {
    method: 'POST',
    headers: { authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'content-type': 'application/json', ...(req.headers.get('x-creator') ? { 'x-creator': req.headers.get('x-creator')! } : {}) },
    body: '{}'
  }).catch(() => null);
  const id = r?.ok ? await r.json().catch(() => null) : null;
  return typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id) ? id : null;
}

/** Saves a brand's account (profile only) and its token; one Instagram account belongs to one brand. */
async function saveBrand(db: ReturnType<typeof admin>, owner: string, token: string, expiresIn: number) {
  const p = await ig.profile(token);
  const { data: other } = await db.from('brand_ig').select('owner').eq('ig_user_id', p.user_id).neq('owner', owner).limit(1);
  if (other?.length) throw new Error(`@${p.username} is already connected to another brand on Miracle.`);
  const now = new Date().toISOString();
  const { error } = await db.from('brand_ig').upsert({ owner, ig_user_id: p.user_id, username: p.username, name: p.name ?? '', picture: p.profile_picture_url ?? '', followers: p.followers_count ?? null, media_count: p.media_count ?? null, synced_at: now });
  if (error) throw new Error(error.message);
  const { error: tokErr } = await db.from('brand_ig_token').upsert({ owner, access_token: token, expires_at: new Date(Date.now() + expiresIn * 1000).toISOString() });
  if (tokErr) console.error('[brand token]', tokErr.message);
  // The handle on the brand's sign-up company, where none was typed.
  await db.from('brand_profiles').update({ instagram: p.username }).eq('owner', owner).eq('instagram', '');
  return p;
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

  // Instagram sending her back here: the signed state says which creator (or brand) is connecting.
  if (req.method === 'GET') {
    const q = new URL(req.url).searchParams;
    const who = await readWho(q.get('state') ?? '');
    if (who?.brand) {
      const to = (params: Record<string, string>) => {
        const u = new URL(BRAND_SETTINGS);
        for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
        return Response.redirect(u.toString(), 302);
      };
      if (q.get('error')) return to({ ig_error: q.get('error_description') || 'Instagram sign-in was cancelled.' });
      const code = (q.get('code') ?? '').replace(/#_$/, '');
      if (!code) return to({ ig_error: 'Instagram did not send a sign-in code. Try again.' });
      try {
        const t = await ig.exchangeCode(code, CALLBACK);
        await saveBrand(db, who.brand, t.token, t.expiresIn);
        return to({ ig: 'connected' });
      } catch (e) {
        return to({ ig_error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
      }
    }
    const creator = who?.creator ?? null;
    if (!creator) return new Response("This sign-in link isn't valid any more. Start again from My page.", { status: 400 });
    // From the phone app: back to the app's own address, where its native parts work.
    const site = who?.app ? APP_ORIGIN : String((await settingsOf(db, creator))?.site_url ?? '').replace(/\/$/, '');
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

  const { action, code, redirect_uri, state, extra, comments, app, as } = await req.json().catch(() => ({}));

  // A brand: start the connection, or refresh the profile it shows creators.
  if (as === 'brand') {
    const owner = await brandOfCaller(req);
    if (!owner) return reply({ error: "Only your team's Admin can connect the brand's Instagram." }, 403);
    if (!ig.configured) return reply({ error: 'Instagram is not set up on the server yet.' }, 400);
    if (action === 'start') {
      if (!STATE_SECRET) return reply({ error: 'INSTAGRAM_APP_SECRET is not set on the server.' }, 400);
      const signed = await makeState(`b:${owner}`);
      return reply({ url: authorizeUrl(CALLBACK, BRAND.join(','), signed) });
    }
    if (action === 'refresh') {
      const { data: t } = await db.from('brand_ig_token').select('access_token').eq('owner', owner).maybeSingle();
      if (!t?.access_token) return reply({ error: 'Connect Instagram first.' }, 400);
      try {
        const p = await saveBrand(db, owner, t.access_token, 60 * 24 * 3600);
        return reply({ ok: true, username: p.username });
      } catch (e) {
        return reply({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }
    return reply({ error: 'Unknown action.' }, 400);
  }

  const creator = await creatorOfCaller(req);
  if (!creator) return reply({ error: 'Only the creator can connect Instagram.' }, 403);

  if (action === 'disconnect') {
    await db.from('ig_token').delete().eq('id', creator);
    await db.from('ig_account').update({ connected: false, last_error: '' }).eq('id', creator);
    return reply({ ok: true });
  }

  if (!ig.configured) return reply({ error: 'Instagram is not set up on the server yet (INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET). See docs/SETUP.md.' }, 400);

  // The address to send her to on Instagram, with a signed state for this creator.
  if (action === 'start') {
    if (!STATE_SECRET) return reply({ error: 'INSTAGRAM_APP_SECRET is not set on the server.' }, 400);
    const signed = await makeState(app === true ? `${creator}~a` : creator);
    const scope = [...BASIC, ...(extra || comments ? EXTRA : []), ...(comments ? COMMENTS : [])].join(',');
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
