// Phone notifications to the creator's devices (Web Push, free). Uses the VAPID keys in the secrets.
import webpush from 'npm:web-push@3.6.7';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:push@example.com';
export const pushConfigured = PUBLIC !== '' && PRIVATE !== '';
if (pushConfigured) webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);

export type Push = { title: string; body: string; url: string; tag?: string; /** Buttons on the notification (Android, Windows, Mac Chrome). */ actions?: { action: string; title: string; url: string }[]; /** Her name only, without her line under each alert (for the light, friendly nudges). */ nameOnly?: boolean; /** Exactly as written: no name in front, no line under it. */ plain?: boolean };

/** Sends to every device the creator's team turned alerts on for; forgets devices the browser says are gone. */
export async function pushToCreator(db: SupabaseClient, creator: number, msg: Push) {
  if (!pushConfigured) return { sent: 0, skipped: 'push not configured' };
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth, device').eq('creator_id', creator);
  // Her own greeting, if she set one in My page > Alerts.
  const { data: me } = await db.from('creator_settings').select('alert_name, alert_line').eq('id', creator).maybeSingle();
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
    case 'brief_fit': {
      const min = Number(p.budget_min) || 0, max = Number(p.budget_max) || 0;
      const money = max ? (min && min < max ? `${inr(min)}-${num(max)}` : `up to ${inr(max)}`) : 'barter-friendly';
      const closes = p.open_until ? ` Closes ${dayMon(p.open_until)}.` : '';
      return { title: 'A brief that fits you', body: `${brand} wants ${String(p.deliverables ?? '') || 'content'}, ${money}.${closes}`, url: '/studio/pitches', tag: `brief-${String(p.campaign ?? '')}` };
    }
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
    case 'message_to_brand':
      return { pref: 'messages', msg: { title: `${who} sent a message`, body: String(p.body ?? '').slice(0, 140), url: `/brand/inbox?c=${encodeURIComponent(code)}`, tag: `msg-${code}` } };
    case 'invoice_sent':
      return { pref: 'invoices', msg: { title: `Invoice from ${who}`, body: `${inr(p.payable)}${p.due ? ` due ${dayMon(p.due)}` : ''} · ${p.number}`, url: request, tag: `inv-${p.number}` } };
    case 'payment_reminder': {
      const late = Number(p.days_late) || 0;
      return { pref: 'invoices', msg: { title: late > 0 ? `Invoice overdue · ${who}` : `Invoice due · ${who}`, body: `${inr(p.due_amount)} · ${p.number}${late > 0 ? `, ${late} day${late > 1 ? 's' : ''} late` : late === 0 ? ', due today' : p.due ? `, due ${dayMon(p.due)}` : ''}`, url: request, tag: `inv-${p.number}` } };
    }
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
  if (!pushConfigured) return { sent: 0, skipped: 'push not configured' };
  const { data: subs } = await db.from('brand_push_subscriptions').select('id, endpoint, p256dh, auth, device').eq('user_id', userId);
  let sent = 0;
  const failed: { device: string; code: number | null; error: string }[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 24, urgency: 'high' });
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
