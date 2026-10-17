// Posts approved Reels (and photos) to Instagram at the time she picked, with the brand added as a
// collaborator. Called every 5 minutes by the database while something is due, or by her ("Post now").
// Instagram prepares a video first (a "container"); when it's ready it is published.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed } from '../_shared/admin.ts';

const GRAPH = 'https://graph.instagram.com/v21.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

async function call(token: string, path: string, params: Record<string, string>, method = 'POST') {
  const u = new URL(GRAPH + path);
  const body = new URLSearchParams({ ...params, access_token: token });
  const r = method === 'GET' ? await fetch(`${u}?${body}`) : await fetch(u, { method, body });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(j.error.error_user_msg || j.error.message || 'Instagram error');
  return j;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!cronAllowed(req)) {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: isCreator } = await asUser.rpc('is_creator');
    if (isCreator !== true) return reply({ error: 'Only the creator can do this.' }, 403);
  }
  const db = admin();
  const { data: tok } = await db.from('ig_token').select('access_token, permissions').eq('id', 1).maybeSingle();
  if (!tok?.access_token) return reply({ error: 'Connect Instagram first.' }, 400);
  const canPost = String(tok.permissions ?? '').includes('instagram_business_content_publish');
  const { only } = await req.json().catch(() => ({}));

  let q = db.from('scheduled_posts').select('*').in('status', ['scheduled', 'publishing']);
  q = only ? q.eq('id', only) : q.lte('publish_at', new Date(Date.now() + 2 * 60e3).toISOString());
  const { data: due } = await q;
  const done: Record<string, string> = {};

  for (const p of (due ?? []) as any[]) {
    try {
      if (!canPost) throw new Error('Allow posting first: My page > Profile & Instagram > Allow DMs and posting.');
      let container = p.container_id as string | null;
      if (!container) {
        const { data: signed } = await db.storage.from('drafts').createSignedUrl(p.file_path, 60 * 60 * 6);
        if (!signed?.signedUrl) throw new Error("Couldn't open the draft file.");
        const video = String(p.file_type).startsWith('video/');
        const params: Record<string, string> = video
          ? { media_type: 'REELS', video_url: signed.signedUrl, share_to_feed: 'true', caption: p.caption }
          : { image_url: signed.signedUrl, caption: p.caption };
        if ((p.collaborators ?? []).length) params.collaborators = JSON.stringify(p.collaborators);
        const c = await call(tok.access_token, '/me/media', params);
        container = String(c.id);
        await db.from('scheduled_posts').update({ container_id: container, status: 'publishing', error: '' }).eq('id', p.id);
      }
      const st = await call(tok.access_token, `/${container}`, { fields: 'status_code,status' }, 'GET');
      if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error(`Instagram couldn't process the file (${st.status ?? st.status_code}).`);
      if (st.status_code !== 'FINISHED') {
        done[p.id] = 'processing';
        continue; // still preparing: the next run publishes it
      }
      const pub = await call(tok.access_token, '/me/media_publish', { creation_id: container });
      const media = await call(tok.access_token, `/${pub.id}`, { fields: 'permalink' }, 'GET').catch(() => ({}));
      await db.from('scheduled_posts').update({ status: 'published', ig_media_id: String(pub.id), permalink: media.permalink ?? '', error: '' }).eq('id', p.id);
      await db.from('collab_events').insert({ collab_id: p.collab_id, kind: 'note', text: 'Posted to Instagram from the app.', visible_to_brand: false });
      done[p.id] = 'published';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from('scheduled_posts').update({ status: 'failed', error: msg.slice(0, 400) }).eq('id', p.id);
      done[p.id] = `failed: ${msg}`;
    }
  }
  return reply({ ok: true, done });
});
