// Phone notifications to the creator's devices (Web Push, free). Uses the VAPID keys in the secrets.
import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:push@example.com';
export const pushConfigured = PUBLIC !== '' && PRIVATE !== '';
if (pushConfigured) webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

// The Android and iPhone apps get alerts through Firebase Cloud Messaging (free). Their devices are kept in
// the same tables as browsers, with the endpoint "fcm:<token>". The secret is the Firebase project's
// service account JSON (Project settings > Service accounts > Generate new private key).
const FCM = (() => {
  try {
    const j = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '{}');
    return j.client_email && j.private_key && j.project_id ? (j as { client_email: string; private_key: string; project_id: string }) : null;
  } catch {
    return null;
  }
})();
export const fcmConfigured = !!FCM;
let fcmToken: { value: string; until: number } | null = null;
const b64url = (b: Uint8Array | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function fcmAccess() {
  if (fcmToken && fcmToken.until > Date.now() + 60_000) return fcmToken.value;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss: FCM!.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = FCM!.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${b64url(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Firebase sign-in failed: ${JSON.stringify(j).slice(0, 160)}`);
  fcmToken = { value: j.access_token, until: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return fcmToken.value;
}
/** One alert to one app device. Throws with statusCode 404 when the device is gone (uninstalled). */
async function sendFcm(endpoint: string, msg: Push) {
  const token = endpoint.slice(4);
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM!.project_id}/messages:send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await fcmAccess()}` },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: { url: msg.url, tag: msg.tag ?? '' },
        android: { priority: 'HIGH', ttl: '86400s', notification: { channel_id: 'alerts', tag: msg.tag ?? undefined, color: '#F25A90' } },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', 'thread-id': msg.tag ?? 'miracle' } } },
      },
    }),
  });
  if (r.ok) return;
  const text = await r.text();
  const gone = r.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(text);
  throw Object.assign(new Error(text.slice(0, 200)), { statusCode: gone ? 404 : r.status, body: text.slice(0, 200) });
}
// The iPhone app gets alerts straight from Apple's push service (free), endpoint "apns:<device token>".
// Secrets: APNS_KEY (the text of the .p8 key from Certificates, IDs & Profiles > Keys, with Apple Push
// Notifications service ticked), APNS_KEY_ID (its 10-character ID) and APPLE_TEAM_ID.
const APNS = (() => {
  const key = (Deno.env.get('APNS_KEY') ?? '').trim();
  const id = (Deno.env.get('APNS_KEY_ID') ?? '').trim();
  const team = (Deno.env.get('APPLE_TEAM_ID') ?? '').trim();
  return key && id && team ? { key, id, team, topic: Deno.env.get('APNS_TOPIC') ?? 'live.miracleapp.app' } : null;
})();
export const apnsConfigured = !!APNS;
let apnsJwt: { value: string; until: number } | null = null;
/** Apple's sign-in for sending: a token signed with the .p8 key, renewed every 50 minutes (Apple allows 60). */
async function apnsAuth() {
  if (apnsJwt && apnsJwt.until > Date.now()) return apnsJwt.value;
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: APNS!.id }));
  const body = b64url(JSON.stringify({ iss: APNS!.team, iat: Math.floor(Date.now() / 1000) }));
  const pem = APNS!.key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`)));
  apnsJwt = { value: `${head}.${body}.${b64url(sig)}`, until: Date.now() + 50 * 60_000 };
  return apnsJwt.value;
}
/** One alert to one iPhone. Throws with statusCode 404 when the app is gone from it (or the token is no good). */
async function sendApns(endpoint: string, msg: Push) {
  const r = await fetch(`https://api.push.apple.com/3/device/${endpoint.slice(5)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await apnsAuth()}`,
      'apns-topic': APNS!.topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
      ...(msg.tag ? { 'apns-collapse-id': msg.tag.slice(0, 64) } : {}),
    },
    body: JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', 'thread-id': msg.tag ?? 'miracle' }, url: msg.url, tag: msg.tag ?? '' }),
  });
  if (r.ok) return;
  const text = await r.text();
  const gone = r.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text);
  throw Object.assign(new Error(text.slice(0, 200)), { statusCode: gone ? 404 : r.status, body: text.slice(0, 200) });
}

/** Web push for browsers, Firebase for the Android app, Apple's push service for the iPhone app. */
async function deliver(s: { endpoint: string; p256dh: string; auth: string }, msg: Push) {
  if (s.endpoint.startsWith('apns:')) {
    if (!APNS) throw Object.assign(new Error("Apple's push service is not set up on the server"), { statusCode: null });
    return sendApns(s.endpoint, msg);
  }
  if (s.endpoint.startsWith('fcm:')) {
    if (!FCM) throw Object.assign(new Error('Firebase is not set up on the server'), { statusCode: null });
    return sendFcm(s.endpoint, msg);
  }
  if (!pushConfigured) throw Object.assign(new Error('web push is not set up'), { statusCode: null });
  await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 24, urgency: 'high' });
}

export type Push = { title: string; body: string; url: string; tag?: string; /** What happened (request_received_creator, payment...), for the icon in Alerts. */ kind?: string; /** false: not kept in the app's Alerts (the casual nudges and tests). */ keep?: boolean; /** Only her own phones, never her team's (the personal water, food and break nudges). */ ownerOnly?: boolean; /** Buttons on the notification (Android, Windows, Mac Chrome). */ actions?: { action: string; title: string; url: string }[]; /** Her name only, without her line under each alert (for the light, friendly nudges). */ nameOnly?: boolean; /** Exactly as written: no name in front, no line under it. */ plain?: boolean };

/** Every event alert is also kept in the app (Alerts), whether or not any phone gets it. A newer alert with
 * the same tag (the same chat, the same payment reminder) replaces the older one, as on her phone. */
async function keepAlert(db: SupabaseClient, creator: number, msg: Push) {
  if (msg.keep === false) return;
  try {
    const tag = String(msg.tag ?? '').slice(0, 80);
    if (tag) await db.from('creator_alerts').delete().eq('creator_id', creator).eq('tag', tag);
    const { error } = await db.from('creator_alerts').insert({
      creator_id: creator,
      kind: String(msg.kind ?? '').slice(0, 40),
      title: String(msg.title ?? '').slice(0, 200),
      body: String(msg.body ?? '').slice(0, 600),
      url: String(msg.url ?? '').slice(0, 500),
      tag,
    });
    if (error) console.error('[alerts]', error.message);
  } catch (e) {
    console.error('[alerts]', e);
  }
}

/** Sends to every device the creator's team turned alerts on for; forgets devices the browser says are gone.
 * Each person is greeted by their own name: the creator by hers ("Call me" in Settings), a teammate
 * (manager, assistant, agency) by theirs, with whose studio it is. */
export async function pushToCreator(db: SupabaseClient, creator: number, msg: Push) {
  await keepAlert(db, creator, msg);
  if (!pushConfigured && !fcmConfigured && !apnsConfigured) return { sent: 0, skipped: 'push not configured' };
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth, device, user_id').eq('creator_id', creator);
  const { data: me } = await db.from('creator_settings').select('alert_name, alert_line, display_name, creator_email').eq('id', creator).maybeSingle();
  const first = (n: unknown) => String(n ?? '').trim().split(/\s+/)[0] ?? '';
  // Her "Call me" name (Settings), else the first name on her profile.
  const name = String(me?.alert_name ?? '').trim() || first(me?.display_name);
  const line = String(me?.alert_line ?? '').trim();
  const herName = name || 'your creator';
  const ownerEmail = String(me?.creator_email ?? '').trim().toLowerCase();
  // Whose phone each device is: the login it was turned on from, and that person's name on her team.
  const ids = [...new Set((subs ?? []).map((s) => s.user_id).filter(Boolean))];
  const { data: people } = ids.length ? await db.from('profiles').select('id, email, full_name').in('id', ids) : { data: [] };
  const { data: team } = await db.from('team_members').select('email, name').eq('creator_id', creator);
  const forDevice = (userId: string | null): Push | null => {
    const p = (people ?? []).find((x) => x.id === userId);
    const email = String(p?.email ?? '').trim().toLowerCase();
    const isHers = !userId || !p || !ownerEmail || email === ownerEmail;
    if (msg.plain) return isHers || !msg.ownerOnly ? msg : null;
    if (isHers) {
      return {
        ...msg,
        title: name ? `Hey ${name}! ${msg.title}` : msg.title,
        body: line && !msg.nameOnly ? (msg.body ? `${msg.body}\n${line}` : line) : msg.body,
      };
    }
    if (msg.ownerOnly) return null;
    const mate = first((team ?? []).find((t) => String(t.email ?? '').trim().toLowerCase() === email)?.name) || first(p?.full_name);
    return { ...msg, title: mate ? `Hey ${mate}! ${msg.title}` : msg.title, body: msg.body ? `${msg.body}\nFor ${herName}` : `For ${herName}` };
  };
  let sent = 0;
  const failed: { device: string; code: number | null; error: string }[] = [];
  for (const s of subs ?? []) {
    const own = forDevice(s.user_id ?? null);
    if (!own) continue;
    try {
      // High urgency: Android (Doze) and iPhone hold normal pushes while the phone is locked and idle,
      // and show them only when it wakes. These are things she should see now.
      await deliver(s, own);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      const body = String((e as { body?: string }).body ?? (e as Error).message ?? '').slice(0, 200);
      failed.push({ device: s.device ?? 'device', code: code ?? null, error: body });
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('[push]', code, body);
    }
  }
  return { sent, devices: subs?.length ?? 0, failed };
}

// Amounts in the payload's currency (foreign brands are quoted and invoiced in theirs).
const SIGN: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' };
let CUR = 'INR';
const inr = (n: unknown) =>
  CUR === 'INR'
    ? '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
    : (SIGN[CUR] ?? CUR + ' ') + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const open = (code: unknown) => `/studio/collabs?open=${encodeURIComponent(String(code ?? ''))}`;

/** The phone alert for an email that went to her, if that kind deserves one. */
export function pushFor(kind: string, p: Record<string, unknown>): Push | null {
  CUR = typeof p.currency === 'string' && p.currency ? p.currency : 'INR';
  const brand = String(p.brand ?? 'A brand');
  const code = String(p.code ?? '');
  switch (kind) {
    case 'request_received_creator':
      return { title: `New request from ${brand}`, body: [p.deliverables, p.type === 'barter' ? 'Barter' : Number(p.fee) ? inr(p.fee) : 'Asked for a quote'].filter(Boolean).join(' · '), url: open(code), tag: code };
    case 'message_to_creator':
      return { title: `${brand} sent a message`, body: String(p.body ?? '').slice(0, 140), url: open(code), tag: `msg-${code}` };
    case 'case_study_answer':
      return { title: p.ok ? `${brand} approved your case study` : `${brand} asked for case study changes`, body: p.ok ? 'It\'s on your page now.' : String(p.note ?? '').slice(0, 140), url: open(code), tag: `case-${code}` };
    case 'support_reply':
      return { title: p.solved ? `Ticket #${p.number} solved` : `Miracle support replied (#${p.number})`, body: String(p.body ?? '').slice(0, 140), url: String(p.link ?? '/studio/help'), tag: `support-${p.id}` };
    case 'sales_reported':
      return { title: `${brand} reported ${p.sales} orders from your code`, body: `${Number(p.revenue) ? `${inr(p.revenue)} in sales · ` : ''}${code}`, url: open(code), tag: code };
    case 'quote_accepted':
      return { title: `${brand} accepted your quote`, body: `${inr(p.total)} · ${code}. The collab is confirmed.`, url: open(code), tag: code };
    case 'quote_changes':
      return { title: `${brand} asked for quote changes`, body: String(p.note ?? '').slice(0, 140), url: open(code), tag: code };
    case 'draft_reviewed':
      return { title: p.approved ? `${brand} approved your draft` : `${brand} asked for draft changes`, body: p.approved ? 'You can post it.' : String(p.feedback ?? '').slice(0, 140), url: open(code), tag: code };
    case 'product_shipped':
      return { title: `${brand} shipped the product`, body: [p.carrier, p.tracking].filter(Boolean).join(' · '), url: open(code), tag: code };
    case 'usage_ext_requested':
      return { title: `${brand} wants to extend usage`, body: `${p.days} more days for ${inr(p.price)}`, url: open(code), tag: code };
    case 'month_summary':
      return { title: `Your ${String(p.label ?? 'month')} in review is ready`, body: 'What you earned, what worked, and what to charge next.', url: `/studio/reports?m=${String(p.month ?? '')}`, tag: `month-${String(p.month ?? '')}` };
    case 'ig_collab':
      return { title: `${String(p.brand || '@' + String(p.from ?? ''))} may want a collab`, body: `${String(p.text ?? '')} · Instagram DM`, url: `/studio/inbox/ig/${encodeURIComponent(String(p.igsid ?? ''))}`, tag: `igc-${String(p.igsid ?? '')}` };
    case 'ig_dm':
      return { title: `Instagram DM from @${String(p.from ?? '')}`, body: String(p.text ?? ''), url: `/studio/inbox/ig/${encodeURIComponent(String(p.igsid ?? ''))}`, tag: `ig-${String(p.igsid ?? '')}` };
    case 'comment_dm':
      return { title: `@${String(p.from ?? '')} commented "${String(p.keyword ?? '')}"`, body: 'A DM reply is ready. Tap to send it.', url: '/studio/settings?s=autopilot', tag: 'comment-dm' };
    case 'insights_viewed':
      return { title: `${String(p.label ?? 'A brand')} opened your insights`, body: Number(p.views) > 1 ? `Viewed ${p.views} times. A good moment to follow up.` : 'A good moment to follow up.', url: '/studio/settings?s=profile', tag: `ins-${String(p.label ?? '')}` };
    case 'question_received':
      return { title: `Question from ${p.brand || p.name || p.email}`, body: String(p.body ?? '').slice(0, 140), url: '/studio', tag: `q-${p.email}` };
    case 'payment_claimed':
      return { title: `${brand} says they paid ${inr(p.amount)}`, body: `${p.number} · ref ${p.ref}. Tap to confirm.`, url: open(code), tag: `claim-${code}` };
    case 'email_request':
      return { title: `New request by email: ${brand}`, body: [p.deliverables, Number(p.fee) ? inr(p.fee) : ''].filter(Boolean).join(' · ') || String(p.subject ?? ''), url: open(code), tag: code };
    case 'brief_completed':
      return { title: `${brand} filled in the brief`, body: `${code}: ready to plan the shoot.`, url: open(code), tag: `brief-${code}` };
    case 'post_now':
      return { title: `Post ${brand} at ${p.time}`, body: p.caption ? 'Caption is ready: tap to copy it.' : `${p.deliverables}. Tap to get your caption.`, url: `/studio/content?post=${encodeURIComponent(code)}`, tag: `post-${code}` };
    case 'counter_taken':
      return { title: `${brand} took your paid offer`, body: `Barter is now Paid + product at ${inr(p.fee)} · ${code}`, url: open(code), tag: code };
    case 'review_received':
      return { title: `${brand} left you ${p.rating} stars`, body: String(p.body ?? '').slice(0, 140), url: '/studio/settings?s=reviews', tag: `review-${code}` };
    case 'bank_matched':
      return { title: 'Payment received', body: `${inr(p.amount)}${p.brand ? ` from ${brand}` : ''}`, url: '/studio/payments' };
    case 'post_detected':
      return { title: `Your ${brand} post is live`, body: p.missing_ad ? 'Add #ad to the first line of the caption.' : 'The brand has been told.', url: open(code), tag: code };
    case 'brief_fit': {
      const min = Number(p.budget_min) || 0, max = Number(p.budget_max) || 0;
      const money = max ? (min && min < max ? `${inr(min)}-${num(max)}` : `up to ${inr(max)}`) : 'barter-friendly';
      const closes = p.open_until ? ` Closes ${dayMon(p.open_until)}.` : '';
      return { title: 'A brief that fits you', body: `${brand} wants ${String(p.deliverables ?? '') || 'content'}, ${money}.${closes}`, url: '/studio/pitches', tag: `brief-${String(p.campaign ?? '')}` };
    }
    case 'checkup_ready':
      return { title: p.first ? 'Your growth check-up is ready' : 'Your new growth check-up is ready', body: Number(p.count) ? `${Number(p.count)} thing${Number(p.count) === 1 ? '' : 's'} holding you back. Biggest: ${String(p.biggest ?? '').toLowerCase()}.` : 'Nothing big holding you back. See what moved.', url: '/studio/grow/checkup', tag: 'growth-checkup' };
    case 'collab_reel_invite':
      return { title: `${String(p.from ?? 'A creator')} wants to make a collab reel`, body: String(p.idea ?? '').slice(0, 120), url: '/studio/grow#collab', tag: `collab-reel-${String(p.id ?? '')}` };
    case 'collab_reel_answer':
      return { title: p.yes ? `${String(p.from ?? 'They')} said yes to your collab reel` : `${String(p.from ?? 'They')} can't do the collab reel`, body: p.yes ? 'It’s in your Calendar.' : String(p.idea ?? '').slice(0, 120), url: '/studio/grow#collab', tag: `collab-reel-answer-${String(p.from ?? '')}` };
    case 'brief_shortlisted':
      return { title: `You're shortlisted for ${String(p.campaign ?? 'a brief')}`, body: `${brand} picked you. If they go ahead, a request${Number(p.rate) ? ` at ${inr(p.rate)}` : ''} comes next.`, url: '/studio/pitches', tag: `shortlist-${String(p.campaign ?? '')}` };
    default:
      return null;
  }
}

const num = (n: unknown) => Math.round(Number(n) || 0).toLocaleString('en-IN');
const dayMon = (d: unknown) => new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** What a brand login can turn alerts on and off for (Settings on the brand side). */
export type BrandPref = 'quotes' | 'drafts' | 'messages' | 'invoices' | 'live' | 'briefs';

/** The phone alert for an email that went to a brand, and which of its alert settings covers it. */
export function pushForBrand(kind: string, p: Record<string, unknown>, creatorName: string): { msg: Push; pref: BrandPref } | null {
  CUR = typeof p.currency === 'string' && p.currency ? p.currency : 'INR';
  const who = String(creatorName ?? '').trim() || 'Your creator';
  const code = String(p.code ?? '');
  const request = code ? `/brand/r/${encodeURIComponent(code)}` : '/brand';
  const applications = `/brand/campaigns/${encodeURIComponent(String(p.campaign_id ?? ''))}?tab=applications`;
  switch (kind) {
    case 'quote_sent':
      return { pref: 'quotes', msg: { title: `${who} sent a quote`, body: `${Number(p.choices) > 1 ? `${p.choices} options from ${inr(p.from)}` : inr(p.total)}${code ? ` · ${code}` : ''}`, url: request, tag: `quote-${code}` } };
    case 'draft_ready':
      return { pref: 'drafts', msg: { title: `Draft to approve · ${who}`, body: `Draft ${p.round} for ${code} is ready for your review.`, url: request, tag: `draft-${code}` } };
    case 'draft_nudge':
      return { pref: 'drafts', msg: { title: `Draft to approve · ${who}`, body: `Draft ${p.round} for ${code} is still waiting for you.`, url: request, tag: `draft-${code}` } };
    case 'tat_overdue':
    case 'tat_escalated': {
      const stage = String(p.stage ?? '');
      const pref: BrandPref = stage === 'draft_review' ? 'drafts' : stage === 'message_reply' ? 'messages' : stage === 'payment' ? 'invoices' : 'quotes';
      const title = kind === 'tat_escalated' ? `Still waiting: ${String(p.label ?? 'a handoff')}` : `Overdue: ${String(p.label ?? 'a handoff')}`;
      return { pref, msg: { title, body: `${String(p.creator ?? '')}${code ? ` · ${code}` : ''}`.replace(/^ · /, ''), url: request, tag: `tat-${code}-${stage}` } };
    }
    case 'case_study_ask':
      return { pref: 'drafts', msg: { title: `${who} wrote a case study about your collab`, body: String(p.title ?? '').slice(0, 140), url: request, tag: `case-${code}` } };
    case 'support_reply':
      return { pref: 'messages', msg: { title: p.solved ? `Ticket #${p.number} solved` : `Miracle support replied (#${p.number})`, body: String(p.body ?? '').slice(0, 140), url: String(p.link ?? '/brand/help'), tag: `support-${p.id}` } };
    case 'message_to_brand':
      return { pref: 'messages', msg: { title: `${who} sent a message`, body: String(p.body ?? '').slice(0, 140), url: `/brand/inbox?c=${encodeURIComponent(code)}`, tag: `msg-${code}` } };
    case 'invoice_sent':
      return { pref: 'invoices', msg: { title: `Invoice from ${who}`, body: `${inr(p.payable)}${p.due ? ` due ${dayMon(p.due)}` : ''} · ${p.number}`, url: request, tag: `inv-${p.number}` } };
    case 'payment_reminder': {
      const late = Number(p.days_late) || 0;
      return { pref: 'invoices', msg: { title: late > 0 ? `Invoice overdue · ${who}` : `Invoice due · ${who}`, body: `${inr(p.due_amount)} · ${p.number}${late > 0 ? `, ${late} day${late > 1 ? 's' : ''} late` : late === 0 ? ', due today' : p.due ? `, due ${dayMon(p.due)}` : ''}`, url: request, tag: `inv-${p.number}` } };
    }
    case 'payment_demand':
      return { pref: 'invoices', msg: { title: `Payment demand · ${who}`, body: `${inr(p.due_amount)} · ${p.number}, final date ${dayMon(p.final_date)}`, url: request, tag: `inv-${p.number}` } };
    // Live and results. (post_detected and report_ready mails go to her; the brand's own ones are the
    // "Live" stage update and the shared results report.)
    case 'post_detected':
      return { pref: 'live', msg: { title: `${who}'s post is live`, body: `${code} is on Instagram.`, url: request, tag: `live-${code}` } };
    case 'stage_changed':
      return p.stage === 'live' ? { pref: 'live', msg: { title: `${who}'s post is live`, body: `${code} is on Instagram.`, url: request, tag: `live-${code}` } } : null;
    case 'report_ready':
    case 'brand_report':
      return { pref: 'live', msg: { title: `Results from ${who}`, body: `${Number(p.views) ? `${num(p.views)} views · ` : ''}${code}`, url: request, tag: `report-${code}` } };
    case 'brief_application': {
      const max = Number(p.budget_max) || 0;
      const over = max > 0 && Number(p.rate) > max;
      return { pref: 'briefs', msg: { title: `${String(p.creator ?? '') || who} applied`, body: `${p.campaign} · asks ${inr(p.rate)}${over ? ', above your budget' : ''}`, url: applications, tag: `apply-${p.campaign_id}-${p.creator}` } };
    }
    case 'brief_digest': {
      const n = Number(p.count) || 0;
      const range = Number(p.low) === Number(p.high) ? inr(p.low) : `${inr(p.low)}-${num(p.high)}`;
      return { pref: 'briefs', msg: { title: `${n} new application${n === 1 ? '' : 's'}`, body: `${p.campaign} · they ask ${range}`, url: applications, tag: `digest-${p.campaign_id}` } };
    }
    default:
      return null;
  }
}

/** Sends to every device a brand login turned alerts on for; forgets devices the browser says are gone. */
export async function pushToBrandUser(db: SupabaseClient, userId: string, msg: Push) {
  if (!pushConfigured && !fcmConfigured && !apnsConfigured) return { sent: 0, skipped: 'push not configured' };
  const { data: subs } = await db.from('brand_push_subscriptions').select('id, endpoint, p256dh, auth, device').eq('user_id', userId);
  let sent = 0;
  const failed: { device: string; code: number | null; error: string }[] = [];
  for (const s of subs ?? []) {
    try {
      await deliver(s, msg);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      const body = String((e as { body?: string }).body ?? (e as Error).message ?? '').slice(0, 200);
      failed.push({ device: s.device || 'device', code: code ?? null, error: body });
      if (code === 404 || code === 410) await db.from('brand_push_subscriptions').delete().eq('id', s.id);
      else console.error('[push brand]', code, body);
    }
  }
  return { sent, devices: subs?.length ?? 0, failed };
}
