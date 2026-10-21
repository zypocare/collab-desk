// Brand emails from her Gmail (sent here by the Gmail watcher script for emails she labels "collab-desk").
//   - From someone with an open collab: added to that collab's messages.
//   - Otherwise: read like a pasted DM and saved as a new request, and she gets an alert.
// Protected by the private inbox token from creator_settings (same as bank alerts); the token says
// which creator's Gmail this came from, and everything below is for that creator only.
import { admin } from '../_shared/admin.ts';
import { creatorByToken } from '../_shared/creators.ts';
import { parseDm } from '../_shared/parseDm.ts';

const titleCase = (s: string) => s.replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, (m) => m.toUpperCase());

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const db = admin();
  const s = await creatorByToken(db, 'inbox_token', req.headers.get('x-inbox-token') ?? '');
  if (!s) return new Response('Unauthorized', { status: 401 });
  const creator_id = s.id;

  const body = await req.json().catch(() => ({}));
  const msgId = String(body.id ?? '').slice(0, 200);
  const fromRaw = String(body.from ?? '');
  const subject = String(body.subject ?? '').slice(0, 300);
  const text = String(body.body ?? '').replace(/\r/g, '').slice(0, 6000);
  if (!msgId || !fromRaw) return Response.json({ error: 'id and from are needed' }, { status: 400 });

  const email = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim().toLowerCase();
  const fromName = fromRaw.replace(/<[^>]+>/, '').replace(/"/g, '').trim();
  const { data: seen } = await db.from('inbound_emails').select('msg_id').eq('creator_id', creator_id).eq('msg_id', msgId).maybeSingle();
  if (seen) return Response.json({ skipped: 'already handled' });

  // Her own emails and her team's are not brand emails.
  const { data: team } = await db.from('team_members').select('email').eq('creator_id', creator_id);
  if (email === String(s.creator_email).toLowerCase() || (team ?? []).some((t) => t.email === email)) {
    await db.from('inbound_emails').insert({ creator_id, msg_id: msgId, sender: email, subject, action: 'skipped' });
    return Response.json({ skipped: 'from you or your team' });
  }

  // A reply in an ongoing collab: into its messages (her alert comes from the messages trigger).
  // Quoted earlier messages ("On … wrote:") are cut off.
  const { data: open } = await db
    .from('collabs').select('id, code').eq('creator_id', creator_id).ilike('contact_email', email)
    .not('stage', 'in', '(wrapped,declined,paused,cancelled)').order('created_at', { ascending: false }).limit(1);
  if (open?.length) {
    const reply = text.split(/\n(?:On .{5,200} wrote:|-{2,} ?Original Message|From: .+\nSent: )/i)[0].trim();
    await db.from('collab_messages').insert({ collab_id: open[0].id, sender: 'brand', body: (subject && !/^re:/i.test(subject) ? `${subject}\n\n` : '') + (reply || text).slice(0, 4000) });
    await db.from('inbound_emails').insert({ creator_id, msg_id: msgId, sender: email, subject, collab_id: open[0].id, action: 'message' });
    return Response.json({ message: open[0].code });
  }

  // A new request.
  const p = parseDm(`${fromName}\n${subject}\n${text}`, s.handle ?? '');
  const promo = `${subject}\n${text}`.match(/\b(?:promo|discount|coupon)\s*code\b[\s:-]*([A-Z0-9]{4,20})\b/i)?.[1]?.toUpperCase() ?? '';
  const domain = email.split('@')[1]?.split('.')[0] ?? '';
  const free = /^(gmail|yahoo|outlook|hotmail|icloud|live|rediffmail|proton(mail)?)$/i.test(domain);
  let brandId: string | null = null;
  // Same sender as an older collab, then same brand name.
  const { data: past } = await db.from('collabs').select('brand_id').eq('creator_id', creator_id).ilike('contact_email', email).limit(1);
  brandId = past?.[0]?.brand_id ?? null;
  const name = (p.brand || (!free && domain ? titleCase(domain) : '') || fromName || email).slice(0, 80);
  if (!brandId) {
    const { data: same } = await db.from('brands').select('id').eq('creator_id', creator_id).ilike('name', name).limit(1);
    brandId = same?.[0]?.id ?? null;
  }
  if (!brandId) {
    const { data: b, error } = await db.from('brands').insert({ creator_id, name, instagram: p.instagram, website: !free && email.includes('@') ? email.split('@')[1] : '' }).select('id').single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    brandId = b.id;
  }

  const { data: c, error } = await db.from('collabs').insert({
    creator_id, brand_id: brandId, source: 'email', contact_name: p.contact || fromName, contact_email: email, contact_phone: p.phone,
    type: p.type ?? 'paid', fee: p.type === 'barter' ? 0 : p.fee, product: p.product, product_value: p.productValue,
    usage: p.usage || 'Organic only', brief: `${subject}\n\n${text}`.trim().slice(0, 4000), preferred_live: p.preferredLive || null,
    brief_details: promo ? { promo } : {},
  }).select('id, code').single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (p.deliverables.length) await db.from('deliverables').insert(p.deliverables.map((d, i) => ({ collab_id: c.id, kind: d.kind, qty: d.qty, position: i })));
  await db.from('collab_events').insert({ collab_id: c.id, kind: 'stage', text: 'Request received by email' });
  await db.from('inbound_emails').insert({ creator_id, msg_id: msgId, sender: email, subject, collab_id: c.id, action: 'new_request' });
  await db.from('outbox').insert({
    creator_id, kind: 'email_request', to_email: s.creator_email, payload: {
      code: c.code, brand: name, contact: p.contact || fromName, email, subject,
      deliverables: p.deliverables.map((d) => `${d.qty} × ${d.kind}`).join(', '), type: p.type ?? '', fee: p.fee,
    },
  });
  return Response.json({ request: c.code });
});
