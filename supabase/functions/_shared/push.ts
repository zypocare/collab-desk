// Phone notifications to the creator's devices (Web Push, free). Uses the VAPID keys in the secrets.
import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:push@example.com';
export const pushConfigured = PUBLIC !== '' && PRIVATE !== '';
if (pushConfigured) webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

export type Push = { title: string; body: string; url: string; tag?: string; /** Buttons on the notification (Android, Windows, Mac Chrome). */ actions?: { action: string; title: string; url: string }[]; /** Her name only, without her line under each alert (for the light, friendly nudges). */ nameOnly?: boolean; /** Exactly as written: no name in front, no line under it. */ plain?: boolean };

/** Sends to every device she turned alerts on for; forgets devices the browser says are gone. */
export async function pushToCreator(db: SupabaseClient, msg: Push) {
  if (!pushConfigured) return { sent: 0, skipped: 'push not configured' };
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth, device');
  // Her own greeting, if she set one in My page > Alerts.
  const { data: me } = await db.from('creator_settings').select('alert_name, alert_line').eq('id', 1).maybeSingle();
  const name = String(me?.alert_name ?? '').trim();
  const line = String(me?.alert_line ?? '').trim();
  if (name && !msg.plain) msg = { ...msg, title: `Hey ${name}! ${msg.title}` };
  if (line && !msg.nameOnly && !msg.plain) msg = { ...msg, body: msg.body ? `${msg.body}\n${line}` : line };
  let sent = 0;
  const failed: { device: string; code: number | null; error: string }[] = [];
  for (const s of subs ?? []) {
    try {
      // High urgency: Android (Doze) and iPhone hold normal pushes while the phone is locked and idle,
      // and show them only when it wakes. These are things she should see now.
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 24, urgency: 'high' });
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
    default:
      return null;
  }
}
