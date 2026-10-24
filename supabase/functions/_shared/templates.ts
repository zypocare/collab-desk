// Email templates for the outbox. Each kind turns a payload into a subject, HTML and plain text.
// Brand emails read like a professional note from her: a greeting, what happened, the details,
// what happens next, a clear button, and her sign-off. Emails to her are short work notes with
// the facts and what to do. Every email carries the app's logo and a footer saying why it came.
import type { Mail } from './mailer.ts';

export type Settings = { app_name: string; display_name: string; site_url: string; reply_time: string; handle?: string; city?: string };
type Payload = Record<string, unknown>;
type To = 'brand' | 'creator' | 'app';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
// Amounts in the payload's currency (foreign brands are quoted and invoiced in theirs).
const SIGN: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$' };
let CUR = 'INR';
const inr = (n: unknown) =>
  CUR === 'INR'
    ? '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')
    : (SIGN[CUR] ?? CUR + ' ') + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const first = (name: string) => (name || '').split(' ')[0] || 'there';
const url = (s: Settings, path: string) => s.site_url.replace(/\/$/, '') + path;

const INK = '#1e171c', MUTED = '#8c8288', BODY = '#3b3238', SOFT = '#f6f1f2', LINE = '#eee5e7';
const P = (html: string) => `<p style="margin:0 0 14px">${html}</p>`;

/** The shared frame: logo header, heading, body, steps, button, sign-off and footer. */
function layout(
  s: Settings,
  heading: string,
  bodyHtml: string,
  button?: { label: string; href: string },
  opts: { to?: To; next?: string[]; code?: string; preheader?: string; /** To a brand, but from the app itself (open briefs), not from her. */ fromApp?: boolean; /** Why it came, for the footer of an app email to a brand. */ why?: string } = {},
) {
  const to = opts.to ?? 'brand';
  // From Miracle itself: to a brand about open briefs, or to anyone about their account.
  const app = (to === 'brand' && opts.fromApp === true) || to === 'app';
  const me = first(s.display_name);
  const handle = String(s.handle ?? '').replace(/^@/, '');
  const steps = opts.next?.filter(Boolean) ?? [];
  const pre = opts.preheader ?? '';
  return `<!doctype html><html><head><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:#f4eff0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(pre)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4eff0;padding:32px 14px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
<tr><td style="padding:0 6px 16px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle"><img src="${esc(url(s, '/icon-192.png'))}" width="40" height="40" alt="${esc(s.app_name)}" style="display:block;width:40px;height:40px;border-radius:11px;border:0"></td>
    <td style="vertical-align:middle;padding-left:12px"><div style="font-size:16px;font-weight:700;letter-spacing:-.2px;color:${INK}">${esc(s.app_name)}</div><div style="font-size:12.5px;color:${MUTED}">${to === 'app' ? `Miracle` : app ? `Creators for your brand` : to === 'brand' ? `Collaborations with ${esc(s.display_name)}` : `Your creator studio`}</div></td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border-radius:22px;border:1px solid ${LINE};overflow:hidden">
  <div style="height:5px;background:linear-gradient(115deg,#6b3fd4,#d4296a 52%,#f2994a);font-size:0;line-height:0">&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr><td style="padding:30px 34px 4px">
    <h1 style="margin:0 0 16px;font-size:23px;line-height:1.3;font-weight:700;letter-spacing:-.3px;color:${INK}">${esc(heading)}</h1>
    <div style="font-size:15.5px;line-height:1.65;color:${BODY}">${bodyHtml}</div>
  </td></tr>
  ${steps.length ? `<tr><td style="padding:6px 34px 4px"><div style="background:${SOFT};border-radius:16px;padding:16px 18px"><div style="font-size:11.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};margin-bottom:8px">What happens next</div>${steps
    .map((x, i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0"><tr><td style="vertical-align:top;width:26px"><div style="width:20px;height:20px;border-radius:50%;background:${INK};color:#fff;font-size:11.5px;font-weight:700;line-height:20px;text-align:center">${i + 1}</div></td><td style="font-size:14.5px;line-height:1.5;color:${BODY}">${x}</td></tr></table>`)
    .join('')}</div></td></tr>` : ''}
  ${button ? `<tr><td style="padding:20px 34px 6px"><a href="${esc(button.href)}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 22px;border-radius:12px">${esc(button.label)} &rarr;</a></td></tr>` : ''}
  <tr><td style="padding:24px 34px 30px">
    ${app
      ? `<div style="font-size:15px;line-height:1.6;color:${BODY}">Warm regards,<br><b style="color:${INK}">The ${esc(s.app_name)} team</b></div>`
      : to === 'brand'
      ? `<div style="font-size:15px;line-height:1.6;color:${BODY}">Warm regards,<br><b style="color:${INK}">${esc(s.display_name)}</b>${handle ? `<br><span style="font-size:13.5px;color:${MUTED}">@${esc(handle)} on Instagram${s.city ? ` · ${esc(s.city)}` : ''}</span>` : ''}</div>`
      : `<div style="font-size:13.5px;line-height:1.6;color:${MUTED}">${esc(s.app_name)} · keeping your collaborations moving</div>`}
  </td></tr>
  </table>
</td></tr>
<tr><td style="padding:18px 16px 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center">
  ${app
    ? `Sent to you by ${esc(s.app_name)}${opts.why ? ` because ${esc(opts.why)}` : ''}.${to === 'app' ? '' : ' Change which alerts you get in Settings.'}`
    : to === 'brand'
    ? `You're receiving this because of your collaboration${opts.code ? ` <b>${esc(opts.code)}</b>` : ''} with ${esc(s.display_name)}. Questions? Just reply to this email and it reaches ${esc(me)} directly.`
    : `Sent to you by ${esc(s.app_name)}. Change which emails you get in My page → Alerts.`}
  <br><a href="${esc(url(s, to === 'brand' ? '/brand' : '/studio'))}" style="color:${MUTED}">${esc(s.site_url.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

// A plain personal email (pitches): her words in paragraphs, no app branding.
const personal = (body: string) =>
  `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK};max-width:560px">${body
    .split(/\n{2,}/)
    .map((x) => `<p style="margin:0 0 14px">${esc(x).replace(/\n/g, '<br>')}</p>`)
    .join('')}</div>`;

const row = (label: string, value: unknown) =>
  value === '' || value == null
    ? ''
    : `<tr><td style="padding:9px 16px 9px 0;color:${MUTED};font-size:13.5px;white-space:nowrap;vertical-align:top;border-bottom:1px solid ${LINE}">${esc(label)}</td><td style="padding:9px 0;font-size:14.5px;color:${INK};font-weight:600;border-bottom:1px solid ${LINE}">${esc(value)}</td></tr>`;
const table = (...rows: string[]) => (rows.join('') ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px">${rows.join('')}</table>` : '');
const quoteBox = (label: string, text: unknown) =>
  text ? `<div style="margin:0 0 16px;padding:14px 16px;background:${SOFT};border-left:3px solid #d4296a;border-radius:10px;font-size:14.5px;line-height:1.6;color:${INK}"><span style="display:block;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin-bottom:4px">${esc(label)}</span>${esc(text).replace(/\n/g, '<br>')}</div>` : '';
const small = (html: string) => `<p style="margin:0 0 14px;font-size:13.5px;color:${MUTED}">${html}</p>`;

export function render(kind: string, p: Payload, s: Settings): Omit<Mail, 'to'> {
  CUR = typeof p.currency === 'string' && p.currency ? p.currency : 'INR';
  const code = String(p.code ?? '');
  const brand = String(p.brand ?? '');
  const me = first(s.display_name);
  const firstOf = (v: unknown) => first(String(v ?? ''));
  const hi = (v: unknown) => P(`Hi ${esc(firstOf(v))},`);
  const studio = (c = code) => url(s, `/studio/collabs?open=${encodeURIComponent(c)}`);
  const request = (c = code) => url(s, `/brand/r/${encodeURIComponent(c)}`);
  const sign = `\n\nWarm regards,\n${s.display_name}${s.handle ? `\n@${String(s.handle).replace(/^@/, '')} on Instagram` : ''}`;
  const fmtDate = (d: unknown) => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const day = fmtDate;
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? '' : Math.round(Number(v)).toLocaleString('en-IN'));

  // ---------------------------------------------------------------- requests
  if (kind === 'request_received_brand') {
    // Barter requests get her barter reply time (filled in by the sender).
    const reply = String(p.reply_time || s.reply_time);
    return {
      subject: `We've received your collaboration request (${code})`,
      html: layout(
        s,
        `Thank you, ${firstOf(p.contact)}. Your request is with ${me}.`,
        `${hi(p.contact)}${P(`Thank you for reaching out to collaborate with ${esc(s.display_name)}. Your request has been received and saved under the reference <b>${esc(code)}</b>. ${esc(me)} reviews every request personally and usually replies within <b>${esc(reply)}</b>.`)}
         ${p.away ? quoteBox(`${me} is away right now`, p.away) : ''}
         ${table(row('Reference', code), row('Brand', brand), row('Content requested', p.deliverables))}
         ${P(`You can follow your request at any time by signing in with this email address. There's no password: we'll send you a 6-digit code.`)}`,
        { label: 'Track your request', href: url(s, '/brand') },
        { code, preheader: `${me} usually replies within ${reply}. Your reference is ${code}.`, next: [`${esc(me)} reviews the brief, the content and the timing.`, `You'll receive a reply, or a quote you can accept online in one tap.`, `Once agreed, dates, drafts and invoices all stay in one place for you to follow.`] },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nThank you for reaching out to collaborate with ${s.display_name}. Your request has been received (reference ${code}) for ${p.deliverables}. ${me} usually replies within ${reply}.\n\nTrack your request: ${url(s, '/brand')}${sign}`,
    };
  }

  if (kind === 'request_received_creator') {
    const money = p.type === 'barter' ? `Barter: ${p.product}` : `${Number(p.fee) ? inr(p.fee) : 'Asked for a quote'}${p.type === 'hybrid' ? ` + ${p.product}` : ''}`;
    return {
      subject: `New collab request from ${brand}`,
      html: layout(
        s,
        `${brand} sent you a collaboration request`,
        `${P(`A new request has come in through your page. Here's what ${esc(brand)} is asking for:`)}
         ${table(row('Reference', code), row('Contact', p.contact), row('Email', p.email), row('Phone', p.phone), row('Package', p.package), row('Content', p.deliverables), row('Language', p.language ? (String(p.language).includes('+') ? `${p.language} (mixed)` : p.language) : ''), row('Offer', money), row('Usage', p.usage), row('Preferred go-live', p.preferred_live), row('Referred by', p.referred_by))}
         ${quoteBox('Their brief', p.brief)}`,
        { label: 'Open the request', href: studio() },
        { to: 'creator', preheader: `${p.deliverables} · ${money}`, next: [`Check the "Should you take it?" score and the brief.`, `Reply, send a quote, or decline politely from the request.`, `The brand sees your answer by email straight away.`] },
      ),
      text: `New request ${code} from ${brand} (${p.contact}, ${p.email}). ${p.deliverables}. ${money}.${p.brief ? `\n\nTheir brief: ${p.brief}` : ''}\n\nOpen it: ${studio()}`,
    };
  }

  if (kind === 'stage_changed') {
    const label = String(p.stage_label ?? '');
    const note = String(p.note ?? '');
    // Declined: a proper, polite "not this time" (with her note if she wrote one), not a status update.
    if (p.stage === 'declined') {
      return {
        subject: `About your collaboration request ${code}`,
        html: layout(
          s,
          `Thank you for thinking of ${me}`,
          `${hi(p.contact)}${P(`Thank you for reaching out about <b>${esc(code)}</b>. ${esc(me)} has looked at your request carefully and won't be able to take this one on.`)}
           ${quoteBox(`A note from ${me}`, note)}
           ${P(`This isn't a no to working together in future. You're always welcome to send a new request when you have your next campaign.`)}`,
          { label: 'Send a new request', href: url(s, '/brand/new') },
          { code, preheader: `${me} can't take on ${code} this time.` },
        ),
        text: `Hi ${firstOf(p.contact)},\n\nThank you for reaching out about ${code}. ${me} won't be able to take this one on.${note ? `\n\n${me}: ${note}` : ''}\n\nYou're always welcome to send a new request for a future campaign: ${url(s, '/brand/new')}${sign}`,
      };
    }
    return {
      subject: `${code}: your collaboration is now "${label}"`,
      html: layout(
        s,
        `An update on your collaboration with ${s.display_name}`,
        `${hi(p.contact)}${P(`Your collaboration <b>${esc(code)}</b> has moved to a new stage: <b>${esc(label)}</b>.`)}
         ${quoteBox(`A note from ${me}`, note)}
         ${P(`Your request page always shows the latest status, the agreed dates and anything waiting on you.`)}`,
        { label: 'See the full status', href: url(s, '/brand') },
        { code, preheader: `${code} is now: ${label}` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nYour collaboration ${code} is now: ${label}.${note ? `\n\n${me}: ${note}` : ''}\n\nSee the full status: ${url(s, '/brand')}${sign}`,
    };
  }

  // ---------------------------------------------------------------- quotes
  if (kind === 'quote_sent') {
    const href = p.action ? url(s, `/a/${p.action}`) : request();
    return {
      subject: p.choices ? `Quote for ${code} from ${s.display_name}: ${p.choices} options from ${inr(p.from)}` : `Quote for ${code} from ${s.display_name} (${inr(p.total)})`,
      html: layout(
        s,
        `Your quote is ready`,
        `${hi(p.contact)}${P(`Thank you for your interest in working together. Based on your request, ${esc(me)} has prepared a quote for <b>${esc(code)}</b>.`)}
         ${p.choices ? P(`There are <b>${p.choices} options</b> to choose from, starting at <b>${inr(p.from)}</b>. Pick the one that suits your campaign when you accept.`) : table(row('Reference', code), row('Total', inr(p.total)))}
         ${P(`The quote page shows the full breakdown: the content, usage rights, payment terms and revision rounds. You can accept it online in one tap, or ask for changes if something doesn't quite fit. No sign-in needed.`)}
         ${p.action ? small(`Prefer to see the whole request first? <a href="${esc(request())}" style="color:${MUTED}">Open your request page</a>.`) : ''}`,
        { label: p.action ? 'Review and accept the quote' : 'Review the quote', href },
        { code, preheader: `${inr(p.total)} for ${code}. Accept online or ask for changes.`, next: [`Review the quote and its terms.`, `Accept it in one tap: it becomes your signed agreement, with the date and time.`, `${esc(me)} confirms the dates and starts planning the content.`] },
      ),
      text: `Hi ${firstOf(p.contact)},\n\n${me} has sent a quote of ${inr(p.total)} for ${code}. You can review the details and accept it, or ask for changes, here: ${href}${sign}`,
    };
  }

  if (kind === 'agreement_confirmed') {
    return {
      subject: `${code}: agreement confirmed`,
      html: layout(
        s,
        `Your agreement is confirmed`,
        `${hi(p.contact)}${P(`Thank you for accepting the quote. We're excited to get started on <b>${esc(code)}</b>.`)}
         ${table(row('Reference', code), row('Agreed amount', inr(p.total)))}
         ${P(`The signed agreement, with the date and time you accepted it, is saved in your account and can be downloaded as a PDF any time.`)}`,
        { label: 'View the agreement', href: url(s, `/agreement/${p.quote_id}`) },
        { code, preheader: `Agreement for ${code} confirmed at ${inr(p.total)}.`, next: [`${esc(me)} confirms the shoot and go-live dates.`, `If anything is missing from the brief, you'll get a short request for it.`, `You'll review the draft before anything goes live.`] },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nThank you for accepting the quote of ${inr(p.total)} for ${code}. The agreement is saved in your account: ${url(s, `/agreement/${p.quote_id}`)}${sign}`,
    };
  }

  if (kind === 'quote_accepted') {
    return {
      subject: `${brand} accepted your quote (${inr(p.total)})`,
      html: layout(
        s,
        `${brand} accepted your quote`,
        `${P(`Good news: <b>${esc(p.name)}</b> from ${esc(brand)} accepted your quote for <b>${esc(code)}</b>. The collaboration is now confirmed and the agreement is saved.`)}
         ${table(row('Reference', code), row('Agreed amount', inr(p.total)))}
         ${quoteBox('Their note', p.note)}`,
        { label: 'Open the collab', href: studio() },
        { to: 'creator', preheader: `${inr(p.total)} confirmed for ${code}.`, next: [`Set the shoot and go-live dates.`, `Check the brief has what you need (the app can ask the brand for anything missing).`, `Raise the advance invoice if your terms include one.`] },
      ),
      text: `${brand} (${p.name}) accepted your quote of ${inr(p.total)} for ${code}. ${p.note ? `Their note: "${String(p.note).trim()}" ` : ''}Open it: ${studio()}`,
    };
  }

  if (kind === 'quote_changes') {
    return {
      subject: `${brand} asked for changes to your quote (${code})`,
      html: layout(
        s,
        `${brand} would like a few changes`,
        `${P(`<b>${esc(p.name || brand)}</b> replied to your quote for <b>${esc(code)}</b> and asked for changes before accepting.`)}
         ${quoteBox('What they asked', p.note)}
         ${P(`You can revise the quote (it keeps the earlier versions) or reply in the collab's messages.`)}`,
        { label: 'Revise the quote', href: studio() },
        { to: 'creator', preheader: String(p.note ?? '').slice(0, 90) },
      ),
      text: `${brand} asked for changes to your quote for ${code}: ${p.note}\n\nRevise it: ${studio()}`,
    };
  }

  if (kind === 'quote_nudge') {
    const href = p.action ? url(s, `/a/${p.action}`) : request();
    return {
      subject: `A gentle reminder about your quote for ${code} (${inr(p.total)})`,
      html: layout(
        s,
        `Just checking in on your quote`,
        `${hi(p.contact)}${P(`I hope you're well. I wanted to follow up on the quote of <b>${esc(inr(p.total))}</b> that ${esc(me)} sent for <b>${esc(code)}</b>, in case it got buried in your inbox.`)}
         ${P(`If the plan works for you, you can accept it in one tap. If you'd like to adjust the content, the budget or the timing, just ask for changes and ${esc(me)} will get back to you. No sign-in needed.`)}`,
        { label: 'Accept or ask for changes', href },
        { code, preheader: `A reminder about the quote for ${code}.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nJust following up on the quote of ${inr(p.total)} for ${code}. You can accept it or ask for changes here: ${href}${sign}`,
    };
  }

  if (kind === 'barter_counter') {
    const href = p.action ? url(s, `/a/${p.action}`) : request();
    return {
      subject: `${code}: an option to get your collaboration moving faster`,
      html: layout(
        s,
        `Thank you for your barter request`,
        `${hi(p.contact)}${P(`Thank you for thinking of ${esc(me)} for ${esc(p.product || 'your product')}. It sounds like a lovely fit.`)}
         ${P(`${esc(me)} works on paid collaborations first. For <b>${esc(p.deliverables)}</b>, together with the product, ${esc(me)} can take this on for <b>${esc(inr(p.fee))}</b>. Paid requests are planned first and get a reply sooner.`)}
         ${P(`Prefer to keep it as a barter? That's absolutely fine: barter requests usually get a reply within ${esc(p.reply_time)}.`)}`,
        { label: `Switch to ${inr(p.fee)} + product`, href },
        { code, preheader: `${inr(p.fee)} + product gets ${code} planned first.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nThank you for your barter request. For ${p.deliverables} with the product, ${me} can do it for ${inr(p.fee)}, and paid requests are planned first. Switch here: ${href}\n\nPrefer barter? That's fine too: replies usually come within ${p.reply_time}.${sign}`,
    };
  }

  if (kind === 'counter_taken') {
    return {
      subject: `${brand} switched to Paid + product (${inr(p.fee)})`,
      html: layout(
        s,
        `${brand} took your paid offer`,
        `${P(`Auto-pilot offered <b>${esc(inr(p.fee))}</b> plus the product for <b>${esc(code)}</b>, and ${esc(brand)} said yes. The request is now Paid + product.`)}`,
        { label: 'Send the quote', href: studio() },
        { to: 'creator', next: [`Send a quote to confirm it (it's pre-filled).`, `Once they accept, set the dates.`] },
      ),
      text: `${brand} switched ${code} to Paid + product at ${inr(p.fee)}. Send a quote: ${studio()}`,
    };
  }

  // ---------------------------------------------------------------- drafts and content
  if (kind === 'draft_ready') {
    const href = p.action ? url(s, `/a/${p.action}`) : request();
    return {
      subject: `${code}: draft ${p.round} is ready for your review`,
      html: layout(
        s,
        `Your draft is ready for review`,
        `${hi(p.contact)}${P(`${esc(me)} has shared <b>draft ${esc(p.round)}</b> for <b>${esc(code)}</b>. Please take a look and either approve it or share any changes you'd like.`)}
         ${quoteBox(`A note from ${me}`, p.note)}
         ${P(`You can watch the video and leave comments at exact moments in it. No sign-in needed.`)}`,
        { label: 'Review and approve', href },
        { code, preheader: `Draft ${p.round} for ${code} is ready.`, next: [`Approve it, or ask for changes with time-stamped comments.`, `Once approved, ${esc(me)} posts on the agreed date.`, `You'll get the results report about a week after it goes live.`] },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nDraft ${p.round} for ${code} is ready for your review: ${href}${p.note ? `\n\n${me}: ${p.note}` : ''}${sign}`,
    };
  }

  if (kind === 'draft_nudge') {
    const href = p.action ? url(s, `/a/${p.action}`) : request();
    return {
      subject: `${code}: draft ${p.round} is waiting for your review`,
      html: layout(
        s,
        `A draft is waiting for your review`,
        `${hi(p.contact)}${P(`A quick reminder that <b>draft ${esc(p.round)}</b> for <b>${esc(code)}</b> is still waiting for your review.`)}
         ${P(`To keep the go-live date on track, could you approve it or share any changes in the next day or two? It only takes a minute.`)}`,
        { label: 'Review the draft', href },
        { code, preheader: `Draft ${p.round} for ${code} needs your review.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nDraft ${p.round} for ${code} is still waiting for your review: ${href}${sign}`,
    };
  }

  if (kind === 'draft_reviewed') {
    const ok = p.approved === true;
    return {
      subject: ok ? `${brand} approved draft ${p.round} (${code})` : `${brand} asked for changes on draft ${p.round} (${code})`,
      html: layout(
        s,
        ok ? `Draft ${p.round} is approved` : `Changes requested on draft ${p.round}`,
        `${P(`<b>${esc(p.name)}</b> from ${esc(brand)} ${ok ? 'approved' : 'reviewed'} draft ${esc(p.round)} for <b>${esc(code)}</b>.`)}
         ${quoteBox('Their feedback', p.feedback)}`,
        { label: 'Open the collab', href: studio() },
        { to: 'creator', next: ok ? [`Post on the agreed date with the approved caption.`, `Turn on the Paid partnership label and tag the brand.`] : [`Make the changes they asked for.`, `Upload the next draft from the collab.`] },
      ),
      text: `${brand} ${ok ? 'approved' : 'asked for changes on'} draft ${p.round} for ${code}. ${p.feedback ?? ''}\n\n${studio()}`,
    };
  }

  // ---------------------------------------------------------------- case studies
  if (kind === 'case_study_ask') {
    return {
      subject: `${me} wrote a case study about your collab (${code})`,
      html: layout(
        s,
        `Approve ${esc(me)}'s case study?`,
        `${hi(p.contact)}${P(`${esc(s.display_name)} turned your collab <b>${esc(code)}</b> into a short case study for ${esc(me)}'s page, with the results from Instagram. It goes up only if you approve it.`)}
         ${quoteBox(String(p.title ?? ''), p.summary)}
         ${P('You can add a line of your own, ask for changes, or say no.')}`,
        { label: 'Read and approve', href: request() },
        { code, preheader: String(p.summary ?? '').slice(0, 120) },
      ),
      text: `Hi ${firstOf(p.contact)},

${s.display_name} wrote a case study about your collab ${code}: "${p.title}"

${p.summary}

It goes on ${me}'s page only if you approve it. Read and approve: ${request()}${sign}`,
    };
  }
  if (kind === 'case_study_answer') {
    const ok = p.ok === true;
    return {
      subject: ok ? `${brand} approved your case study` : `${brand} asked for changes to your case study`,
      html: layout(
        s,
        ok ? 'Your case study is live' : 'Changes asked for',
        `${P(ok ? `${esc(brand)} approved <b>${esc(p.title)}</b>. It's on your page now.` : `${esc(brand)} looked at <b>${esc(p.title)}</b> and asked for changes.`)}
         ${p.note ? quoteBox('Their note', p.note) : ''}`,
        { label: ok ? 'See your page' : 'Edit it', href: ok ? url(s, '/') : studio() },
        { to: 'creator' },
      ),
      text: `${brand} ${ok ? 'approved' : 'asked for changes to'} your case study "${p.title}". ${p.note ?? ''}

${ok ? url(s, '/') : studio()}`,
    };
  }

  if (kind === 'brief_request') {
    const NAMES: Record<string, string> = { message: 'the key message', hashtags: 'the hashtags to use', dos: "the do's and don'ts", tag: 'which accounts to tag' };
    const list = (Array.isArray(p.missing) ? p.missing : []).map((k: string) => NAMES[k] ?? k);
    const items = list.join(', ').replace(/, ([^,]*)$/, ' and $1');
    const href = p.action ? url(s, `/brief/${p.action}`) : request();
    return {
      subject: `${code}: a few details so ${me} can start creating`,
      html: layout(
        s,
        `A few details, and we're ready to shoot`,
        `${hi(p.contact)}${P(`It's great to have <b>${esc(code)}</b> confirmed. Before ${esc(me)} plans the shoot, a few details from your side will make sure the content matches exactly what you have in mind.`)}
         ${P(`Could you please add <b>${esc(items)}</b>? It takes about two minutes, and it avoids revisions later. No sign-in needed.`)}`,
        { label: 'Add the details', href },
        { code, preheader: `Please add ${items} for ${code}.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nBefore ${me} plans the shoot for ${code}, could you add ${items}? ${href}${sign}`,
    };
  }

  if (kind === 'brief_completed') {
    const left = Array.isArray(p.still_missing) && p.still_missing.length;
    return {
      subject: `${brand} added the brief details (${code})`,
      html: layout(
        s,
        `${brand} filled in the brief`,
        `${P(`The brief for <b>${esc(code)}</b> is ${left ? 'updated, though a few things are still empty' : 'now complete'}. Your shot list and caption starter already use it.`)}`,
        { label: 'Open the brief', href: studio() },
        { to: 'creator', next: [`Plan the shoot day from Plan.`, `Write the caption from the brief with AI when you're ready.`] },
      ),
      text: `${brand} added the brief details for ${code}. ${studio()}`,
    };
  }

  if (kind === 'post_now') {
    const extra = [p.promo && `Promo code: ${p.promo}`, p.link && `Link: ${p.link}`].filter(Boolean).join(' · ');
    return {
      subject: `Time to post: ${brand} at ${p.time}`,
      html: layout(
        s,
        `${brand} goes live at ${p.time}`,
        `${P(`It's almost time to post <b>${esc(p.deliverables)}</b> for <b>${esc(code)}</b>.`)}
         ${quoteBox('Approved caption', p.caption || 'No approved caption yet. Open the app to write one from the brief.')}
         ${quoteBox('Also include', extra)}`,
        { label: 'Open the caption to copy', href: url(s, `/studio/content?post=${encodeURIComponent(code)}`) },
        { to: 'creator', next: [`Turn on the "Paid partnership" label.`, `Tag @${esc(p.instagram || brand)} and put #ad in the first line.`, `The app moves it to Live and tells the brand once it spots the post.`] },
      ),
      text: `${brand} goes live at ${p.time}.\n\n${p.caption ?? ''}\n\n${extra}`,
    };
  }

  if (kind === 'files_ready') {
    const n = Number(p.count) || 0;
    const href = p.action ? url(s, `/files/${p.action}`) : request();
    return {
      subject: `${code}: your files from ${me} are ready to download`,
      html: layout(
        s,
        `Your files are ready`,
        `${hi(p.contact)}${P(`${esc(s.display_name)} has shared <b>${n} file${n === 1 ? '' : 's'}</b> for <b>${esc(code)}</b>: the final content in full quality, ready for your channels.`)}
         ${P(`The download link works for the next 90 days. No sign-in needed. Please remember the usage terms in your agreement when you post or run them.`)}`,
        { label: 'Download the files', href },
        { code, preheader: `${n} file${n === 1 ? '' : 's'} for ${code}, ready for 90 days.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\n${n} file(s) for ${code} are ready to download for 90 days: ${href}${sign}`,
    };
  }

  // ---------------------------------------------------------------- invoices and payments
  const tdsNote = Number(p.total) !== Number(p.payable) ? ` (${inr(p.total)} less TDS)` : '';

  if (kind === 'invoice_sent') {
    return {
      subject: `Invoice ${p.number} from ${s.display_name} (${code})`,
      html: layout(
        s,
        `Invoice ${p.number}`,
        `${hi(p.contact)}${P(`Thank you for the collaboration. Please find the invoice for <b>${esc(code)}</b> below.`)}
         ${table(row('Invoice', p.number), row('Reference', code), row('Amount payable', inr(p.payable) + tdsNote), row('Due date', fmtDate(p.due)))}
         ${P(`The invoice page has the PDF (with GST details where applicable), and you can pay by UPI by scanning the QR code, or by bank transfer. Once you've paid, you can mark it on the same page so ${esc(me)} knows to look out for it.`)}`,
        { label: 'View and pay the invoice', href: String(p.link) },
        { code, preheader: `${inr(p.payable)} due ${fmtDate(p.due)}.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nInvoice ${p.number} for ${code}: ${inr(p.payable)}${tdsNote}, due ${fmtDate(p.due)}.\nView and pay: ${p.link}${sign}`,
    };
  }

  if (kind === 'payment_demand') {
    const letter = String(p.letter ?? '').split(/\n{2,}/).map((t) => t.trim()).filter(Boolean);
    return {
      subject: `Payment demand: invoice ${p.number} (${inr(p.due_amount)}), final date ${fmtDate(p.final_date)}`,
      html: layout(
        s,
        'Formal payment demand',
        `${letter.map((t) => P(esc(t).replace(/\n/g, '<br>'))).join('')}
         ${table(row('Invoice', p.number), row('Amount due', inr(p.due_amount)), row('Was due', fmtDate(p.due)), row('Final date', fmtDate(p.final_date)))}`,
        { label: 'View and pay the invoice', href: String(p.link) },
        { code, preheader: `Invoice ${p.number} (${inr(p.due_amount)}) is ${p.days_late} days overdue. Final date ${fmtDate(p.final_date)}.` },
      ),
      text: `${letter.join('\n\n')}\n\nInvoice ${p.number} · ${inr(p.due_amount)} · final date ${fmtDate(p.final_date)}\nView and pay: ${p.link}${sign}`,
    };
  }

  if (kind === 'payment_reminder') {
    const late = Number(p.days_late) || 0;
    // From a week late: the firm reminder, with a date to pay by.
    if (late >= 7 && p.pay_by) {
      return {
        subject: `Second reminder: invoice ${p.number} is ${late} days overdue`,
        html: layout(
          s,
          'Your invoice is overdue',
          `${hi(p.contact)}${P(`Invoice <b>${esc(p.number)}</b> for <b>${esc(code)}</b> was due on ${esc(fmtDate(p.due))}, ${late} days ago, and I haven't received the payment yet.`)}
           ${table(row('Invoice', p.number), row('Amount due', inr(p.due_amount)), row('Please pay by', fmtDate(p.pay_by)))}
           ${P(`Please pay by <b>${esc(fmtDate(p.pay_by))}</b> by UPI or bank transfer from the invoice page. If there's a problem with the invoice, reply and let me know so we can sort it out.`)}`,
          { label: 'View and pay the invoice', href: String(p.link) },
          { code, preheader: `Invoice ${p.number} (${inr(p.due_amount)}) is ${late} days overdue. Please pay by ${fmtDate(p.pay_by)}.` },
        ),
        text: `Hi ${firstOf(p.contact)},\n\nInvoice ${p.number} (${inr(p.due_amount)}) for ${code} was due on ${fmtDate(p.due)}, ${late} days ago. Please pay by ${fmtDate(p.pay_by)}: ${p.link}\n\nIf there's a problem with the invoice, reply and let me know.${sign}`,
      };
    }
    const when = late > 0 ? `was due on ${fmtDate(p.due)}, ${late} day${late > 1 ? 's' : ''} ago` : late === 0 ? 'is due today' : `is due on ${fmtDate(p.due)}`;
    return {
      subject: late > 0 ? `Reminder: invoice ${p.number} is overdue` : `Reminder: invoice ${p.number} ${late === 0 ? 'is due today' : 'is due soon'}`,
      html: layout(
        s,
        late > 0 ? 'A gentle reminder about your invoice' : 'A friendly payment reminder',
        `${hi(p.contact)}${P(`I hope all is well. This is a ${late > 0 ? 'gentle' : 'friendly'} reminder that invoice <b>${esc(p.number)}</b> for <b>${esc(code)}</b> ${esc(when)}.`)}
         ${table(row('Invoice', p.number), row('Amount due', inr(p.due_amount)), row('Due date', fmtDate(p.due)))}
         ${P(`You can pay by UPI or bank transfer from the invoice page. If the payment is already on its way, thank you, and please ignore this email (or mark it as paid on the page so the reminders stop).`)}`,
        { label: 'View and pay the invoice', href: String(p.link) },
        { code, preheader: `Invoice ${p.number} (${inr(p.due_amount)}) ${when}.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nA reminder that invoice ${p.number} (${inr(p.due_amount)}) for ${code} ${when}. View and pay: ${p.link}\n\nIf it's already paid, thank you, and please ignore this email.${sign}`,
    };
  }

  if (kind === 'rebook_offer') {
    const pct = Number(p.pct) || 0;
    return {
      subject: `Thank you from ${s.display_name}${pct ? `, and ${pct}% off your next collab` : ''}`,
      html: layout(
        s,
        `Thank you for collaborating with ${me}`,
        `${hi(p.contact)}${P(`It was a pleasure creating for <b>${esc(brand)}</b> on ${esc(code)}. Thank you for the smooth collaboration.`)}
         ${pct ? P(`As a returning brand, your next collaboration with ${esc(me)} comes with <b>${pct}% off</b> the quote if you book by <b>${esc(p.until)}</b>. Your earlier details are filled in for you, so it only takes a minute.`) : P(`Whenever you're planning your next campaign, booking again takes a minute: your earlier details are filled in for you.`)}`,
        { label: 'Book again', href: String(p.link) },
        { code, preheader: pct ? `${pct}% off your next collab with ${me}, until ${p.until}.` : `Book your next collab with ${me} in a minute.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nThank you for collaborating with ${s.display_name} on ${code}.${pct ? ` Your next collab comes with ${pct}% off if you book by ${p.until}.` : ''} Book again: ${p.link}${sign}`,
    };
  }

  if (kind === 'tds_194r') {
    return {
      subject: `TDS under Section 194R for ${s.display_name} (FY ${p.fy})`,
      html: layout(
        s,
        `A note on Section 194R`,
        `${hi(p.contact)}${P(`Thank you for the products and experiences shared with ${esc(s.display_name)} this year. In FY ${esc(p.fy)}, what ${esc(brand)} has provided adds up to about <b>${inr(p.total)}</b>.`)}
         ${P(`Under Section 194R of the Income Tax Act, a business giving benefits worth more than ₹20,000 in a financial year deducts TDS (10%) on them. Could your accounts team please deduct and deposit it, and share Form 16A? It helps ${esc(me)} claim the credit when she files her return.`)}
         ${small(`If your team has already taken care of this, thank you, and please ignore this email.`)}`,
        undefined,
        { code, preheader: `FY ${p.fy}: benefits of about ${inr(p.total)}, above the ₹20,000 limit.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nIn FY ${p.fy}, what ${brand} has provided to ${s.display_name} adds up to about ${inr(p.total)}. Under Section 194R, TDS (10%) applies above ₹20,000 a year. Could your accounts team please deduct and deposit it, and share Form 16A?${sign}`,
    };
  }

  if (kind === 'team_added') {
    const role = p.role === 'assistant' ? 'an assistant' : p.role === 'accountant' ? 'the accountant' : 'a manager';
    const sees =
      p.role === 'assistant'
        ? `You'll see her collabs, content and brand messages. Invoices and payments stay with her.`
        : p.role === 'accountant'
          ? `You'll see her invoices, payments and reports, and can record payments.`
          : `You'll see her collabs, messages and money, just as she does.`;
    return {
      subject: `${s.display_name} added you to ${s.app_name}`,
      html: layout(
        s,
        `You're on ${esc(me)}'s team`,
        `${hi(p.name || 'there')}${P(`${esc(s.display_name)} has added you as ${role} in ${esc(s.app_name)}, where her brand collaborations, content plan and payments are run.`)}
         ${P(`Sign in with this email address. There's no password: you'll get a 6-digit code each time.`)}`,
        { label: `Sign in to ${s.app_name}`, href: String(p.link) },
        { to: 'creator', preheader: `${me} added you as ${role}.`, next: [`Sign in with this email and the code we send.`, sees] },
      ),
      text: `Hi ${firstOf(p.name || 'there')},\n\n${s.display_name} has added you as ${role} in ${s.app_name}. Sign in with this email (you'll get a 6-digit code): ${p.link}${sign}`,
    };
  }

  // Creator sign-ups: a new request for the people who run Miracle, then a welcome or a kind no.
  // ---------------------------------------------------------------- support
  // ---------------------------------------------------------------- turnaround (brand teams)
  if (kind === 'tat_overdue' || kind === 'tat_escalated') {
    const late = Number(p.hours_over) || 0;
    const overBy = late >= 48 ? `${Math.round(late / 24)} days` : `${Math.max(1, late)} hour${late === 1 ? '' : 's'}`;
    const link = url(s, p.code ? `/brand/r/${encodeURIComponent(String(p.code))}` : '/brand/business/turnaround');
    const what = `${String(p.label ?? 'A handoff')} for ${String(p.creator ?? 'a creator')} (${String(p.code ?? '')})`;
    const escalated = kind === 'tat_escalated';
    return {
      subject: escalated ? `Still waiting: ${what}` : `Overdue: ${what}`,
      html: layout(
        s,
        escalated ? 'This one is still waiting' : 'This is past its turnaround time',
        `${P(`${esc(what)} is ${esc(overBy)} past the time your team set for it.`)}
         ${escalated ? P(`It's with ${esc(String(p.owner ?? 'its owner'))}. You're getting this as the backup or the team's admin, so you can pick it up or hand it to someone else.`) : P('Open it to answer, or ask your admin to hand it to someone else on the team.')}`,
        { label: 'Open it', href: link },
        { to: 'app', why: 'your team asked Miracle to flag late handoffs', preheader: `${String(p.label ?? 'A handoff')} is ${overBy} past due` },
      ),
      text: `${what} is ${overBy} past the time your team set for it.${escalated ? ` It's with ${String(p.owner ?? 'its owner')}.` : ''}

Open it: ${link}

Turnaround alerts can be switched off in Business › Turnaround.`,
    };
  }
  if (kind === 'support_reply') {
    const link = url(s, String(p.link ?? '/studio/help'));
    const ref = `#${p.number}`;
    return {
      subject: p.solved ? `Solved: ${p.subject} (${ref})` : `Miracle support replied: ${p.subject} (${ref})`,
      html: layout(
        s,
        p.solved ? 'We think this is sorted' : 'Miracle support replied',
        `${hi(p.name || 'there')}${P(`About your ticket <b>${esc(ref)}</b>, “${esc(p.subject)}”:`)}
         ${quoteBox('Miracle support', p.body)}
         ${P(p.solved ? 'If it isn’t sorted, reply in the app and the ticket opens again.' : 'Reply in the app so everything stays in one place.')}`,
        { label: 'Open your ticket', href: link },
        { to: 'app', why: 'you asked Miracle for help', preheader: String(p.body ?? '').slice(0, 120) },
      ),
      text: `Hi ${firstOf(p.name || 'there')},

About your ticket ${ref}, "${p.subject}":

${p.body}

Open your ticket: ${link}

Miracle support`,
    };
  }
  if (kind === 'support_new' || kind === 'support_user_reply') {
    const admin = `https://admin.miracleapp.live/#support`;
    const ref = `#${p.number}`;
    const who = `${p.name || p.email} (${p.side === 'brand' ? 'brand' : p.side === 'creator' ? 'creator' : 'signed in'})`;
    const isNew = kind === 'support_new';
    return {
      subject: `${p.urgent ? '[Urgent] ' : ''}${isNew ? 'New ticket' : 'Reply on ticket'} ${ref}: ${p.subject}`,
      html: layout(
        s,
        isNew ? `New ticket ${esc(ref)}` : `${esc(String(p.name || p.email))} replied on ${esc(ref)}`,
        `${P(`<b>${esc(p.subject)}</b>${isNew ? ` · ${esc(p.category)}` : ''}`)}
         ${quoteBox(who, p.body)}
         ${P(`Their email: ${esc(p.email)}`)}`,
        { label: 'Open the Support tab', href: admin },
        { to: 'app', why: `it came to ${s.app_name} support. Reply to this email to answer them directly, or answer in the Support tab so it stays on the ticket` },
      ),
      text: `${isNew ? 'New ticket' : 'Reply on ticket'} ${ref}: ${p.subject}
From ${who}, ${p.email}

${p.body}

Answer it: ${admin}`,
    };
  }

  if (kind === 'creator_request') {
    const where = [p.niche, p.city].map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ');
    const admin = 'https://admin.miracleapp.live';
    // Signed up at app.miracleapp.live: no link yet (they pick it once approved).
    const asked = p.slug ? `asked for <b>${esc(p.slug)}.miracleapp.live</b>` : 'signed up as a creator';
    const askedText = p.slug ? `asked for ${p.slug}.miracleapp.live` : 'signed up as a creator';
    const size = [p.followers ? `${p.followers} followers` : '', p.collabs ? `paid collabs: ${p.collabs}` : ''].filter(Boolean).join(' · ');
    return {
      subject: p.slug ? `New creator: ${p.name} wants ${p.slug}.miracleapp.live` : `New creator: ${p.name} (@${p.handle}) signed up`,
      html: layout(
        s,
        `${esc(p.name)} wants to join`,
        `${P(`<b>${esc(p.name)}</b> (@${esc(p.handle)}) ${asked}.`)}
         ${where ? P(esc(where)) : ''}
         ${size ? P(esc(size)) : ''}
         ${p.note ? P(`"${esc(p.note)}"`) : ''}
         ${P(`Their email: ${esc(p.email)}`)}`,
        { label: 'Open the approval queue', href: admin },
        { to: 'creator', preheader: `${p.name} (@${p.handle}) ${askedText}.`, next: ['Check their Instagram.', 'Approve or decline in the admin panel.'] },
      ),
      text: `${p.name} (@${p.handle}) ${askedText}.${where ? `\n${where}` : ''}${p.note ? `\n"${p.note}"` : ''}\nTheir email: ${p.email}\n\nApprove or decline: ${admin}`,
    };
  }

  if (kind === 'creator_approved' && !p.slug) {
    return {
      subject: `You're in. Pick your Miracle link`,
      html: layout(
        s,
        `Welcome to Miracle, ${esc(firstOf(p.name))}`,
        `${P(`Your profile is approved. One last step: pick your link, like <b>yourname.miracleapp.live</b>. It's the page brands open to see your work and send you requests.`)}
         ${P(`Sign in with this email address. There's no password: you'll get a 6-digit code each time.`)}`,
        { label: 'Pick my link', href: String(p.url) },
        { to: 'creator', preheader: 'Your profile is approved. Pick your link.', next: ['Pick your link.', 'Connect Instagram so your numbers show on your page.', 'Add your rates and packages.', 'Put your link in your Instagram bio.'] },
      ),
      text: `Welcome to Miracle, ${firstOf(p.name)}. Your profile is approved. Pick your link (sign in with this email, you'll get a 6-digit code): ${p.url}`,
    };
  }

  if (kind === 'creator_approved') {
    return {
      subject: `You're in: ${p.slug}.miracleapp.live is yours`,
      html: layout(
        s,
        `Welcome to Miracle, ${esc(firstOf(p.name))}`,
        `${P(`Your link <b>${esc(p.slug)}.miracleapp.live</b> is live. Brands can see your page and send you proper collab requests there.`)}
         ${P(`Sign in with this email address. There's no password: you'll get a 6-digit code each time.`)}`,
        { label: 'Open your studio', href: String(p.url) },
        { to: 'creator', preheader: `${p.slug}.miracleapp.live is live.`, next: ['Add your rates and packages.', 'Connect Instagram so your numbers show on your page.', 'Add your bank or UPI details for invoices.', 'Put your link in your Instagram bio.'] },
      ),
      text: `Welcome to Miracle, ${firstOf(p.name)}. Your link ${p.slug}.miracleapp.live is live. Sign in with this email (you'll get a 6-digit code): ${p.url}`,
    };
  }

  if (kind === 'creator_declined') {
    return {
      subject: `About your Miracle request`,
      html: layout(
        s,
        `Thanks for asking, ${esc(firstOf(p.name))}`,
        `${P(p.slug ? `We can't open ${esc(p.slug)}.miracleapp.live for you just now. Miracle is taking a small number of creators while it grows.` : `We can't open a Miracle studio for you just now. Miracle is taking a small number of creators while it grows.`)}
         ${P(p.slug ? `You can send your request again later from the same link, and we'll take another look.` : `You can send your request again later at app.miracleapp.live/signup, and we'll take another look.`)}`,
        undefined,
        { to: 'creator', preheader: p.slug ? `About ${p.slug}.miracleapp.live.` : 'About your Miracle request.' },
      ),
      text: p.slug
        ? `Thanks for asking, ${firstOf(p.name)}. We can't open ${p.slug}.miracleapp.live for you just now. You can send your request again later from the same link.`
        : `Thanks for asking, ${firstOf(p.name)}. We can't open a Miracle studio for you just now. You can send your request again later at https://app.miracleapp.live/signup`,
    };
  }

  if (kind === 'new_device') {
    const ua = String(p.agent || '');
    const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
    const os = /iPhone/.test(ua) ? 'an iPhone' : /iPad/.test(ua) ? 'an iPad' : /Android/.test(ua) ? 'an Android phone' : /Mac OS X/.test(ua) ? 'a Mac' : /Windows/.test(ua) ? 'a Windows computer' : /Linux/.test(ua) ? 'a Linux computer' : 'a device';
    const when = new Date(String(p.at || Date.now())).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    return {
      subject: `New sign-in to ${s.app_name}: ${browser} on ${os}`,
      html: layout(
        s,
        `A new device signed in`,
        `${P(`Your ${esc(s.app_name)} account was just opened in <b>${esc(browser)} on ${esc(os)}</b>, ${esc(when)} (India time)${p.ip ? `, from the internet address ${esc(String(p.ip))}` : ''}.`)}
         ${P(`If that was you, there's nothing to do. If it wasn't, open your signed-in devices and sign it out.`)}`,
        { label: 'See signed-in devices', href: String(p.link) },
        { to: 'creator', preheader: `${browser} on ${os}, ${when}.` },
      ),
      text: `Your ${s.app_name} account was just opened in ${browser} on ${os}, ${when} (India time)${p.ip ? `, from ${p.ip}` : ''}. If that was you, there's nothing to do. If not, sign it out here: ${p.link}`,
    };
  }

  if (kind === 'invoice_cancelled') {
    return {
      subject: `Invoice ${p.number} for ${code} has been cancelled`,
      html: layout(
        s,
        `Invoice ${esc(p.number)} is cancelled`,
        `${hi(p.contact)}${P(`Please note that invoice <b>${esc(p.number)}</b> (${inr(p.total)}) for <b>${esc(code)}</b> has been cancelled. There's nothing to pay on it, so please don't process it.`)}
         ${P(`If a corrected invoice is needed, ${esc(me)} will send it separately. Your request page always shows the invoices that are due.`)}`,
        { label: 'See your request', href: url(s, '/brand') },
        { code, preheader: `Nothing to pay on ${p.number}: it's cancelled.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nInvoice ${p.number} for ${code} has been cancelled, so there's nothing to pay on it. If a corrected invoice is needed, it will be sent separately.\n\nYour request: ${url(s, '/brand')}${sign}`,
    };
  }

  if (kind === 'payment_not_received') {
    return {
      subject: `Payment for invoice ${p.number} hasn't arrived yet`,
      html: layout(
        s,
        `The payment hasn't arrived yet`,
        `${hi(p.contact)}${P(`Thank you for letting us know you paid invoice <b>${esc(p.number)}</b> for <b>${esc(code)}</b>. ${esc(me)} has checked, and the payment hasn't reached the account yet.`)}
         ${P(`Could you please check the transfer (the account or UPI ID, and the UTR / reference)? Bank transfers can take a day or two; if it has already gone through, you can report it again on the invoice page with the reference.`)}`,
        { label: 'Open the invoice', href: String(p.link) },
        { code, preheader: `The payment for ${p.number} hasn't arrived yet.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nThe payment you reported for invoice ${p.number} (${code}) hasn't reached the account yet. Could you please check the transfer and its reference? Invoice: ${p.link}${sign}`,
    };
  }

  if (kind === 'payment_thanks') {
    return {
      subject: `Payment received for invoice ${p.number}. Thank you!`,
      html: layout(
        s,
        `Payment received, thank you`,
        `${hi(p.contact)}${P(`This is to confirm that the payment for invoice <b>${esc(p.number)}</b> has been received in full. Thank you for the prompt payment.`)}
         ${P(p.advance ? `${esc(me)} is getting started on the content and will keep you posted on your request page. Your receipt is available on the invoice page.` : `It was a pleasure working with you, and ${esc(me)} would love to collaborate again. Your receipt is available on the invoice page.`)}`,
        { label: 'View the receipt', href: String(p.link) },
        { code, preheader: `Payment for ${p.number} received.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nThe payment for invoice ${p.number} has been received. Thank you${p.advance ? `; ${me} is getting started on the content` : ', it was a pleasure working with you'}. Receipt: ${p.link}${sign}`,
    };
  }

  if (kind === 'tds_cert_request') {
    return {
      subject: `TDS certificate (Form 16A) for invoice ${p.number}`,
      html: layout(
        s,
        'A request for the TDS certificate',
        `${hi(p.contact)}${P(`Thank you for the payment for invoice <b>${esc(p.number)}</b> (${esc(p.code)}). We noticed that TDS of <b>${esc(inr(p.tds))}</b> was deducted, as required.`)}
         ${P(`Could you please share the TDS certificate (Form 16A) for <b>${esc(p.quarter)}</b> once it's generated? It's needed to claim the TDS when filing the income tax return.`)}
         ${table(row('Deductee name', p.name), row('PAN', p.pan), row('Invoice', p.number), row('TDS deducted', inr(p.tds)), row('Quarter', p.quarter))}
         ${P(`You can simply reply to this email with the PDF attached. Thank you for your help.`)}`,
        undefined,
        { code: String(p.code ?? ''), preheader: `Form 16A for ${p.quarter}, invoice ${p.number}.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nCould you please share the TDS certificate (Form 16A) for invoice ${p.number} (${p.quarter})? TDS deducted: ${inr(p.tds)}. Deductee: ${p.name}, PAN ${p.pan}. You can reply with the PDF. Thank you!${sign}`,
    };
  }

  if (kind === 'payment_claimed') {
    return {
      subject: `${brand} says they paid ${inr(p.amount)} (${p.number})`,
      html: layout(
        s,
        `${brand} reported a payment`,
        `${P(`${esc(brand)} marked invoice <b>${esc(p.number)}</b> (${esc(code)}) as paid.`)}
         ${table(row('Amount', inr(p.amount)), row('Paid on', fmtDate(p.on)), row('Reference', p.ref))}
         ${P(`Payment reminders for this invoice are paused while you check.`)}`,
        { label: 'Confirm the payment', href: studio() },
        { to: 'creator', next: [`Check your bank for the credit.`, `Confirm it in the collab: the brand gets a thank-you and a receipt.`] },
      ),
      text: `${brand} says they paid ${inr(p.amount)} for ${p.number} (ref ${p.ref}). Confirm it: ${studio()}`,
    };
  }

  if (kind === 'bank_matched' || kind === 'bank_unmatched') {
    const matched = kind === 'bank_matched';
    return {
      subject: matched ? `${inr(p.amount)} received from ${brand} (${p.number})` : `${inr(p.amount)} credited: which invoice is it?`,
      html: layout(
        s,
        matched ? `${inr(p.amount)} received from ${brand}` : `Money in: ${inr(p.amount)}`,
        matched
          ? `${P(`Your bank reported a credit that matches invoice <b>${esc(p.number)}</b>. It's marked as paid, and the brand has been thanked.`)}`
          : `${P(`Your bank reported a credit we couldn't match to an invoice. Open Payments to assign it, so the right invoice is marked paid.`)}${quoteBox('From the bank email', p.excerpt)}`,
        { label: 'Open payments', href: url(s, '/studio/payments') },
        { to: 'creator' },
      ),
      text: matched ? `${inr(p.amount)} matched to ${p.number} (${brand}).` : `${inr(p.amount)} credited but not matched. ${url(s, '/studio/payments')}`,
    };
  }

  if (kind === 'sales_reported') {
    return {
      subject: `${p.brand} reported sales from your code (${code})`,
      html: layout(
        s,
        'Your code is selling',
        `${P(`<b>${esc(p.brand)}</b> reported <b>${esc(p.sales)} orders</b>${Number(p.revenue) ? ` worth <b>${esc(inr(p.revenue))}</b>` : ''} from your promo code for ${esc(code)}.`)}${quoteBox('Their note', p.note)}${P(`Results like this are worth adding to your next pitch to similar brands.`)}`,
        { label: 'Open the collab', href: url(s, `/studio/c/${code}`) },
        { to: 'creator' },
      ),
      text: `${p.brand} reported ${p.sales} orders${Number(p.revenue) ? ` worth ${inr(p.revenue)}` : ''} from your code for ${code}.`,
    };
  }

  // ---------------------------------------------------------------- results
  if (kind === 'post_detected') {
    const missing = p.missing_ad === true;
    return {
      subject: missing ? `Add #ad to your ${brand} post` : `Your ${brand} post is live`,
      html: layout(
        s,
        missing ? 'Your post is live, but needs #ad' : 'Your post is live',
        `${P(`We spotted your post for <b>${esc(brand)}</b> (${esc(code)}) on Instagram and moved the collab to Live. The brand has been told.`)}
         ${missing ? quoteBox('Action needed', 'The first line of the caption has no #ad or #collab. Indian advertising rules (ASCI) need paid and gifted posts to be clearly marked. Edit the caption and turn on the "Paid partnership" label.') : ''}
         ${Array.isArray(p.missing_items) && p.missing_items.length ? quoteBox('Missing from the brief', `The brief asked for ${(p.missing_items as string[]).join(' ')}. Add them to the caption so the brand is happy.`) : ''}`,
        { label: 'Open the post', href: String(p.permalink) },
        { to: 'creator', next: [`Results are collected automatically for 7 days.`, `You'll get the report to check and send to the brand.`] },
      ),
      text: `Your ${brand} post is live: ${p.permalink}${missing ? '. Add #ad to the first line of the caption.' : ''}`,
    };
  }

  if (kind === 'report_ready') {
    return {
      subject: `Results report ready for ${brand}`,
      html: layout(
        s,
        `${brand}: the results are in`,
        `${P(`Seven days after posting, here's how <b>${esc(code)}</b> performed:`)}${table(row('Views', num(p.views) || '—'), row('Accounts reached', num(p.reach) || '—'))}${P(`Check the report and send it to the brand from the collab. Brands that see results are far more likely to book again.`)}`,
        { label: 'Review and send', href: studio() },
        { to: 'creator' },
      ),
      text: `Results report for ${brand} (${code}) is ready to review and send. ${studio()}`,
    };
  }

  if (kind === 'brand_report') {
    return {
      subject: `Results for ${code}: ${num(p.views) ? `${num(p.views)} views` : 'your campaign report'}`,
      html: layout(
        s,
        `How your collaboration performed`,
        `${hi(p.contact)}${P(`Thank you again for collaborating with ${esc(s.display_name)}. Here are the results of <b>${esc(code)}</b>, taken directly from Instagram's own numbers:`)}
         ${table(row('Views', num(p.views)), row('Accounts reached', num(p.reach)))}
         ${P(`The full report includes engagement, saves and shares, with a link to the post. We'd love to hear how it went on your side, and to plan the next one.`)}`,
        { label: 'See the full report', href: String(p.link) },
        { code, preheader: `${num(p.views) ? `${num(p.views)} views` : 'Your results'} for ${code}.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nResults for ${code}: ${num(p.views)} views, ${num(p.reach)} accounts reached. Full report: ${p.link}${sign}`,
    };
  }

  if (kind === 'review_request') {
    return {
      subject: `How was working with ${me}? (${code})`,
      html: layout(
        s,
        `How did it go?`,
        `${hi(p.contact)}${P(`Thank you for collaborating with ${esc(s.display_name)} on <b>${esc(code)}</b>. It was a pleasure working with you.`)}
         ${P(`Would you leave a quick rating and a line about the experience? It takes about 20 seconds, and it genuinely helps other brands decide.`)}`,
        { label: 'Leave a quick review', href: url(s, `/review/${p.action}`) },
        { code, preheader: '20 seconds, and it helps other brands.' },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nThank you for collaborating with ${s.display_name} on ${code}. Would you leave a quick review? ${url(s, `/review/${p.action}`)}${sign}`,
    };
  }

  if (kind === 'review_received') {
    const stars = '★'.repeat(Number(p.rating) || 0) + '☆'.repeat(5 - (Number(p.rating) || 0));
    return {
      subject: `${brand} left you a ${p.rating}-star review`,
      html: layout(
        s,
        `${stars} from ${brand}`,
        `${quoteBox('Their words', p.body || 'No comment')}${small(Number(p.rating) >= 4 ? 'It is showing on your brand page.' : 'It is hidden from your page. You can show it from My page.')}`,
        { label: 'Manage reviews', href: url(s, '/studio/settings?s=reviews') },
        { to: 'creator' },
      ),
      text: `${brand} left you ${p.rating} stars: ${p.body}`,
    };
  }

  // ---------------------------------------------------------------- messages and questions
  if (kind === 'message_to_creator') {
    const who = firstOf(p.contact) === 'there' ? brand : firstOf(p.contact);
    return {
      subject: `${brand} sent you a message (${code})`,
      html: layout(
        s,
        `New message from ${brand}`,
        `${P(`<b>${esc(who)}</b> wrote about <b>${esc(code)}</b>:`)}${quoteBox('Message', p.body)}`,
        { label: 'Reply', href: studio() },
        { to: 'creator', preheader: String(p.body ?? '').slice(0, 90) },
      ),
      text: `${brand} (${code}): ${p.body}\n\nReply: ${studio()}`,
    };
  }

  if (kind === 'message_to_brand') {
    return {
      subject: `${me} replied about ${code}`,
      html: layout(
        s,
        `A message from ${s.display_name}`,
        `${hi(p.contact)}${P(`${esc(me)} sent you a message about your collaboration <b>${esc(code)}</b>:`)}${quoteBox(`From ${me}`, p.body)}
         ${small(`Reply from your request page so the whole conversation stays in one place, or simply reply to this email.`)}`,
        { label: 'Reply', href: request() },
        { code, preheader: String(p.body ?? '').slice(0, 90) },
      ),
      text: `Hi ${firstOf(p.contact)},\n\n${me} sent you a message about ${code}:\n\n${p.body}\n\nReply at ${request()}${sign}`,
    };
  }

  // A creator's email to her fan list: a plain personal letter from her (not the business frame), with
  // the way to leave the list in the footer and in the List-Unsubscribe header.
  if (kind === 'fan_broadcast') {
    const leave = url(s, `/unsubscribe?t=${encodeURIComponent(String(p.token ?? ''))}`);
    const handle = String(s.handle ?? '').replace(/^@/, '');
    const linkify = (t: string) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#d4296a">$1</a>').replace(/\n/g, '<br>');
    const paras = String(p.body ?? '').split(/\n{2,}/).map((x) => `<p style="margin:0 0 14px">${linkify(x.trim())}</p>`).join('');
    const hello = p.name ? `<p style="margin:0 0 14px">Hi ${esc(firstOf(p.name))},</p>` : '';
    return {
      subject: String(p.subject ?? ''),
      fromName: `${s.display_name} via Miracle`,
      headers: { 'List-Unsubscribe': `<${leave}>` },
      html: `<!doctype html><html><head><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f4eff0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4eff0;padding:28px 14px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;border:1px solid ${LINE}">
<tr><td style="padding:28px 30px 8px;font-size:16px;line-height:1.65;color:${BODY}">${hello}${paras}<p style="margin:18px 0 0">${esc(s.display_name)}${handle ? `<br><a href="https://instagram.com/${esc(handle)}" style="color:${MUTED};text-decoration:none">@${esc(handle)}</a>` : ''}</p></td></tr>
<tr><td style="padding:18px 30px 24px;font-size:12.5px;line-height:1.5;color:${MUTED}">You get this because you joined ${esc(me)}'s list on <a href="${esc(url(s, '/'))}" style="color:${MUTED}">${esc(url(s, '/').replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>. <a href="${esc(leave)}" style="color:${MUTED}">Leave this list</a>.</td></tr>
</table></td></tr></table></body></html>`,
      text: `${p.name ? `Hi ${firstOf(p.name)},\n\n` : ''}${String(p.body ?? '')}\n\n${s.display_name}${handle ? ` (@${handle})` : ''}\n\n--\nYou joined ${me}'s list on ${url(s, '/')}. Leave this list: ${leave}`,
    };
  }

  if (kind === 'question_received') {
    const who = [p.name, p.brand].filter(Boolean).join(', ') || String(p.email ?? '');
    return {
      subject: `Question from ${who}`,
      html: layout(
        s,
        `${who} asked a question`,
        `${table(row('From', who), row('Email', p.email))}${quoteBox('Their question', p.body)}`,
        { label: 'Reply', href: url(s, '/studio') },
        { to: 'creator', next: [`Reply from your Today page: they get it by email.`, `Or turn it into a request in one tap.`] },
      ),
      text: `${who} (${p.email}) asked: ${p.body}`,
    };
  }

  if (kind === 'question_answer') {
    return {
      subject: `${me} replied to your question`,
      html: layout(
        s,
        `A reply from ${me}`,
        `${P(`Hi${p.name ? ` ${esc(firstOf(p.name))}` : ''},`)}${P(`Thank you for your question. Here's ${esc(me)}'s reply:`)}${quoteBox(`${me}'s reply`, p.answer)}${quoteBox('You asked', p.question)}
         ${P(`Ready to go ahead? You can send a collaboration request in about two minutes, with no sign-up needed.`)}`,
        { label: 'Send a request', href: url(s, '/brand/new') },
        { preheader: String(p.answer ?? '').slice(0, 90) },
      ),
      text: `Hi${p.name ? ` ${firstOf(p.name)}` : ''},\n\n${s.display_name} replied: ${p.answer}\n\nSend a request: ${url(s, '/brand/new')}${sign}`,
    };
  }

  if (kind === 'email_request') {
    return {
      subject: `New request by email: ${brand}`,
      html: layout(
        s,
        `${brand} emailed you about a collab`,
        `${P(`${esc(p.contact || p.email)} wrote “${esc(p.subject)}”. It's been saved as a request so nothing gets lost.`)}
         ${table(row('Reference', code), row('From', p.email), row('Content', p.deliverables), row('Budget', Number(p.fee) ? inr(p.fee) : ''))}`,
        { label: 'Review the request', href: studio() },
        { to: 'creator', next: [`Check what was picked up from the email.`, `Reply, quote or decline from the request.`] },
      ),
      text: `${brand} emailed you. Saved as ${code}. ${studio()}`,
    };
  }

  // ---------------------------------------------------------------- products and usage
  if (kind === 'product_shipped') {
    return {
      subject: `${brand} shipped your product (${code})`,
      html: layout(
        s,
        `A parcel is on its way`,
        `${P(`${esc(brand)} has shipped ${p.product ? `<b>${esc(p.product)}</b>` : 'the product'} for <b>${esc(code)}</b>.`)}${table(row('Courier', p.carrier), row('Tracking', p.tracking))}`,
        { label: 'Open the collab', href: studio() },
        { to: 'creator', next: [`Tap "Mark received" when it arrives.`, `Your draft deadline counts from that day.`] },
      ),
      text: `${brand} shipped ${p.product || 'the product'} for ${code} via ${p.carrier} ${p.tracking}.

Open the collab: ${studio()}`,
    };
  }

  if (kind === 'product_received') {
    const due = p.draft_date ? new Date(String(p.draft_date)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
    return {
      subject: `${me} has received your product (${code})`,
      html: layout(
        s,
        `Your product has arrived`,
        `${hi(p.contact)}${P(`Thank you for sending ${p.product ? `<b>${esc(p.product)}</b>` : 'the product'}. ${esc(me)} has received it safely for <b>${esc(code)}</b>.`)}
         ${due ? P(`You can expect the first draft by <b>${esc(due)}</b>.`) : ''}`,
        { label: 'See the status', href: request() },
        { code, next: [`${esc(me)} creates the content from your brief.`, `You review the draft before anything goes live.`] },
      ),
      text: `Hi ${firstOf(p.contact)},\n\n${s.display_name} has received your product for ${code}.${due ? ` The draft is expected by ${due}.` : ''}${sign}`,
    };
  }

  if (kind === 'usage_ending') {
    return {
      subject: `Your usage rights for ${code} end on ${day(p.ends)}`,
      html: layout(
        s,
        `Your paid usage ends on ${day(p.ends)}`,
        `${hi(p.contact)}${P(`A quick heads-up: the ${esc(String(p.usage ?? '').toLowerCase())} for your collaboration with ${esc(s.display_name)} (<b>${esc(code)}</b>) end on <b>${esc(day(p.ends))}</b>. After that date, please stop running the content as ads.`)}
         ${P(`If the campaign is performing well and you'd like to keep it running, you can extend the usage in one tap${Number(p.price30) ? `, from <b>${esc(inr(p.price30))}</b> for 30 days` : ''}.`)}`,
        { label: 'Extend the usage', href: request() },
        { code, preheader: `Usage for ${code} ends ${day(p.ends)}.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nPaid usage for ${code} ends on ${day(p.ends)}. Extend it here: ${request()}${sign}`,
    };
  }

  if (kind === 'usage_ext_requested') {
    return {
      subject: `${brand} wants to extend usage by ${p.days} days (${inr(p.price)})`,
      html: layout(
        s,
        `A usage extension request`,
        `${P(`${esc(brand)} would like to keep running <b>${esc(code)}</b> as ads for <b>${esc(p.days)} more days</b>.`)}${table(row('Extra fee', inr(p.price)), row('Currently ends', day(p.ends)))}`,
        { label: 'Approve or decline', href: studio() },
        { to: 'creator', next: [`Approve it: they're told, and the invoice follows.`, `Or decline politely; they can still reply in messages.`] },
      ),
      text: `${brand} wants ${p.days} more days of paid usage for ${code} at ${inr(p.price)}. ${studio()}`,
    };
  }

  if (kind === 'usage_ext_answer') {
    const ok = p.approved === true;
    return {
      subject: ok ? `Usage extended for ${code} until ${day(p.ends)}` : `About your usage extension for ${code}`,
      html: layout(
        s,
        ok ? `Your usage is extended until ${day(p.ends)}` : `About your extension request`,
        ok
          ? `${hi(p.contact)}${P(`Good news: ${esc(me)} has approved <b>${esc(p.days)} more days</b> of paid usage for <b>${esc(code)}</b>. You can now run the content as ads until <b>${esc(day(p.ends))}</b>.`)}${P(`An invoice for <b>${esc(inr(p.price))}</b> will follow shortly.`)}`
          : `${hi(p.contact)}${P(`Thank you for asking. Unfortunately ${esc(me)} isn't able to extend the paid usage for <b>${esc(code)}</b> this time. Please stop running the content as ads after the current end date.`)}${P(`If you'd like to discuss other options, just reply in the messages on your request page.`)}`,
        { label: 'See your request', href: request() },
        { code },
      ),
      text: ok ? `Hi ${firstOf(p.contact)},\n\nUsage for ${code} is extended until ${day(p.ends)}. An invoice for ${inr(p.price)} will follow.${sign}` : `Hi ${firstOf(p.contact)},\n\nUsage for ${code} can't be extended this time.${sign}`,
    };
  }

  // ---------------------------------------------------------------- invites
  if (kind === 'track_invite') {
    return {
      subject: `${code}: follow our collaboration with ${me}`,
      html: layout(
        s,
        `Our collaboration, all in one place`,
        `${hi(p.contact)}${P(`To keep things simple, ${esc(s.display_name)} now manages our collaboration <b>${esc(code)}</b>${p.deliverables ? ` (${esc(p.deliverables)})` : ''} in ${esc(s.app_name)}. Right now it's at <b>${esc(p.stage)}</b>.`)}
         ${P(`Your private link shows the agreed dates and what's next at any time, with no sign-up needed. Whenever there's a quote to accept, a draft to approve or an invoice to pay, you can do it there in one tap.`)}`,
        { label: 'See where it stands', href: url(s, `/t/${p.token}`) },
        { code, preheader: `Track ${code} with ${me}, no sign-up needed.` },
      ),
      text: `Hi ${firstOf(p.contact)},\n\nFollow our collaboration ${code} with ${s.display_name} here: ${url(s, `/t/${p.token}`)}${sign}`,
    };
  }

  if (kind === 'brand_invite') {
    return {
      subject: `${p.by} added you to ${brand} on ${s.app_name}`,
      html: layout(
        s,
        `You've been added to the ${brand} team`,
        `${P(`Hi${p.name ? ` ${esc(firstOf(p.name))}` : ''},`)}${P(`${esc(p.by)} added you to <b>${esc(brand)}</b> for collaborations with ${esc(s.display_name)}.`)}
         ${P(`Sign in with this email to see every request, quote, draft, invoice and results report in one place. There's no password: we'll send you a 6-digit code.`)}`,
        { label: 'Sign in', href: url(s, '/login?next=/brand') },
        { preheader: `${p.by} added you to ${brand}.` },
      ),
      text: `${p.by} added you to ${brand} for collaborations with ${s.display_name}. Sign in with this email: ${url(s, '/login?next=/brand')}`,
    };
  }

  // ---------------------------------------------------------------- open briefs
  // Mails to the brand come from the app, not from her: she's only the creator who applied.
  if (kind === 'brief_fit') {
    const lo = Number(p.budget_min) || 0, max = Number(p.budget_max) || 0;
    const budget = max ? (lo && lo < max ? `${inr(lo)} to ${inr(max)}` : `Up to ${inr(max)}`) : lo ? `From ${inr(lo)}` : 'Barter-friendly';
    const closes = fmtDate(p.open_until);
    const href = url(s, '/studio/pitches');
    return {
      subject: `A brief that fits you: ${brand}`,
      html: layout(
        s,
        `${brand} is looking for creators like you`,
        `${P(`<b>${esc(brand)}</b> opened a brief, and your content and rates fit what they're asking for.`)}
         ${table(row('Brief', p.campaign), row('Brand', `${brand}${p.verified ? ' · Instagram verified' : ''}`), row('Content', p.deliverables), row('Budget', budget), row('Applications close', closes))}
         ${P(`Apply with your own rate and a short note. The brand picks who to work with.`)}
         ${small(`You get at most 3 of these a week. You can turn them off in Pitches → Open briefs.`)}`,
        { label: 'See the brief and apply', href },
        { to: 'creator', preheader: [p.deliverables, budget, closes ? `closes ${closes}` : ''].filter(Boolean).join(' · '), next: [`Check the brief and the budget.`, `Apply with your rate and a one-line note.`, `If ${esc(brand)} shortlists you, they can send you a request at your rate.`] },
      ),
      text: `${brand} opened a brief that fits you: ${p.campaign}.\n${[p.deliverables, budget, closes ? `Closes ${closes}` : ''].filter(Boolean).join(' · ')}\n\nSee it and apply: ${href}\n\nYou can turn these off in Pitches → Open briefs.`,
    };
  }

  if (kind === 'brief_shortlisted') {
    const href = url(s, '/studio/pitches');
    const rate = Number(p.rate) ? ` at your rate of <b>${esc(inr(p.rate))}</b>` : '';
    return {
      subject: `You're shortlisted for ${p.campaign}`,
      html: layout(
        s,
        `${brand} shortlisted you`,
        `${P(`Good news: <b>${esc(brand)}</b> picked you for <b>${esc(p.campaign)}</b>.`)}
         ${P(`If they go ahead, they send you a request${rate}. It comes in like any other request, ready for you to confirm.`)}`,
        { label: 'Open Pitches', href },
        { to: 'creator', preheader: `${brand} picked you for ${p.campaign}.`, next: [`Watch for the request from ${esc(brand)}.`, `Confirm it, then plan the content as usual.`] },
      ),
      text: `Good news: ${brand} shortlisted you for ${p.campaign}. If they go ahead, a request${Number(p.rate) ? ` at your rate of ${inr(p.rate)}` : ''} comes next.\n\n${href}`,
    };
  }

  if (kind === 'brief_application') {
    const max = Number(p.budget_max) || 0;
    const over = max > 0 && Number(p.rate) > max;
    const href = url(s, `/brand/campaigns/${encodeURIComponent(String(p.campaign_id ?? ''))}?tab=applications`);
    const asks = `${inr(p.rate)}${over ? ` (above your ${inr(max)} budget)` : ''}`;
    return {
      subject: `${p.creator} applied to ${p.campaign}`,
      html: layout(
        s,
        `${p.creator} applied to ${p.campaign}`,
        `${P(`<b>${esc(p.creator)}</b> applied to your open brief <b>${esc(p.campaign)}</b>.`)}
         ${table(row('Creator', p.creator), row('Their rate', asks))}
         ${quoteBox('Their note', p.note)}
         ${P(`See their page, numbers and fit next to the other applications, then shortlist the ones you'd like to work with.`)}`,
        { label: 'See the applications', href },
        { fromApp: true, why: `your brief ${p.campaign} is open for applications`, preheader: `Asks ${asks}.` },
      ),
      text: `${p.creator} applied to your open brief ${p.campaign}, asking ${asks}.${p.note ? `\n\nTheir note: ${p.note}` : ''}\n\nSee the applications: ${href}\n\nThe ${s.app_name} team`,
    };
  }

  if (kind === 'brief_digest') {
    const n = Number(p.count) || 0;
    const max = Number(p.budget_max) || 0;
    const range = Number(p.low) === Number(p.high) ? inr(p.low) : `${inr(p.low)} to ${inr(p.high)}`;
    const href = url(s, `/brand/campaigns/${encodeURIComponent(String(p.campaign_id ?? ''))}?tab=applications`);
    const apps = `${n} new application${n === 1 ? '' : 's'}`;
    return {
      subject: `${apps} to ${p.campaign}`,
      html: layout(
        s,
        `${apps} to ${p.campaign}`,
        `${P(`Your open brief <b>${esc(p.campaign)}</b> got <b>${esc(apps)}</b> today.`)}
         ${table(row(n === 1 ? 'They ask' : 'They ask between', range), row('Your budget', max ? `Up to ${inr(max)}` : ''), row('Applications so far', num(p.total)))}
         ${P(`Compare them side by side, then shortlist the ones you'd like to work with.`)}`,
        { label: 'See the applications', href },
        { fromApp: true, why: `your brief ${p.campaign} is open for applications`, preheader: `They ask ${range}. ${num(p.total)} so far.` },
      ),
      text: `Your open brief ${p.campaign} got ${apps} today. They ask ${range}. Applications so far: ${num(p.total)}.\n\nSee them: ${href}\n\nThe ${s.app_name} team`,
    };
  }

  // ---------------------------------------------------------------- the growth check-up
  if (kind === 'checkup_ready') {
    const href = url(s, '/studio/grow/checkup');
    const n = Number(p.count) || 0;
    const head = p.first ? 'Your growth check-up is ready' : 'Your new growth check-up is ready';
    return {
      subject: n ? `${head}: ${n} thing${n === 1 ? '' : 's'} holding you back` : head,
      html: layout(
        s,
        head,
        `${quoteBox('In one line', p.verdict)}${n ? P(`Biggest: <b>${esc(String(p.biggest ?? '').toLowerCase())}</b>. The check-up shows what's working, what to change, and ${p.first ? 'how to tell it is working' : 'what moved since the last one'}.`) : P(`Nothing big is holding you back. See what's working and what to do more of.`)}`,
        { label: 'See your check-up', href },
        { to: 'creator', preheader: String(p.verdict ?? ''), next: ['Read the one line and what holds you back.', 'Tick off the changes, one by one.', 'A new check-up comes in two weeks, with what moved.'] },
      ),
      text: `${head}.

${p.verdict}${n ? `
Biggest: ${String(p.biggest ?? '').toLowerCase()}.` : ''}

${href}`,
    };
  }

  // ---------------------------------------------------------------- collab reels (creator to creator)
  if (kind === 'collab_reel_invite') {
    const href = url(s, '/studio/grow#collab');
    const when = p.post_at ? new Date(String(p.post_at)).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';
    const who = p.handle ? `${p.from} (@${String(p.handle).replace(/^@/, '')})` : String(p.from);
    return {
      subject: `${p.from} wants to make a collab reel with you`,
      html: layout(
        s,
        `${p.from} wants to make a collab reel with you`,
        `${P(`<b>${esc(who)}</b> invited you to a collab reel on Miracle: one reel, posted on both your accounts, so it shows to both your audiences.`)}
         ${quoteBox('The idea', p.idea)}
         ${table(row('Who posts it', p.they_post ? 'You, with them as collaborator' : 'They do, with you as collaborator'), row('Post on', when))}`,
        { label: 'Answer the invite', href },
        { to: 'creator', preheader: String(p.idea ?? '').slice(0, 90), next: ['Say yes or no in Grow.', 'If yes, it goes in both your Calendars.', 'The one who posts adds the other as collaborator; the other taps Accept in Instagram.'] },
      ),
      text: `${who} invited you to a collab reel: ${p.idea}${when ? `
Post on: ${when}` : ''}

Answer: ${href}`,
    };
  }

  if (kind === 'collab_reel_answer') {
    const href = url(s, '/studio/grow#collab');
    return {
      subject: p.yes ? `${p.from} said yes to your collab reel` : `${p.from} can't do the collab reel`,
      html: layout(
        s,
        p.yes ? `${p.from} said yes` : `${p.from} can't do it this time`,
        p.yes ? `${P(`Your collab reel with <b>${esc(p.from)}</b> is on. It's in both your Calendars.`)}${quoteBox('The idea', p.idea)}` : `${P(`<b>${esc(p.from)}</b> can't do this collab reel. Try another creator from Grow.`)}`,
        { label: 'Open Grow', href },
        { to: 'creator' },
      ),
      text: p.yes ? `${p.from} said yes to your collab reel: ${p.idea}. It's in your Calendar.

${href}` : `${p.from} can't do the collab reel this time.

${href}`,
    };
  }

  // ---------------------------------------------------------------- leaving, and safety
  if (kind === 'collab_closed') {
    // To a brand: the creator closed her page (from her), or Miracle closed it (from the app).
    const byApp = p.why === 'closed';
    const who = byApp ? String(p.creator ?? 'The creator') : s.display_name;
    return {
      subject: `Request ${code} is cancelled`,
      html: layout(
        s,
        `Request ${code} is cancelled`,
        `${hi(p.contact)}${P(byApp ? `${esc(who)}'s page on ${esc(s.app_name)} has been closed, so your request <b>${esc(code)}</b> is cancelled.` : `I've closed my page on ${esc(s.app_name)}, so your request <b>${esc(code)}</b> is cancelled. Thank you for thinking of me.`)}
         ${table(row('Reference', code), row('Brand', brand))}
         ${P(`Invoices that were already sent still stand. Nothing else is owed for work that wasn't done.`)}`,
        undefined,
        byApp ? { to: 'app', why: `you sent a request to ${who}` } : { code },
      ),
      text: `${byApp ? `${who}'s page on ${s.app_name} has been closed` : `I've closed my page on ${s.app_name}`}, so your request ${code} is cancelled. Invoices that were already sent still stand.${byApp ? `\n\nThe ${s.app_name} team` : sign}`,
    };
  }

  if (kind === 'collab_closed_creator') {
    const closed = p.why === 'closed';
    return {
      subject: closed ? `${brand}'s account was closed` : `${brand} left Miracle`,
      html: layout(
        s,
        closed ? `We closed ${brand}'s account` : `${brand} closed their account`,
        closed
          ? `${P(`After reports from creators, we closed <b>${esc(brand)}</b>'s account. Any request from them is cancelled.`)}${P(`If they asked you to pay a fee to get work, please don't pay. Real brands never ask creators for money.`)}`
          : `${P(`<b>${esc(brand)}</b> closed their account on ${esc(s.app_name)}, so their running request${code ? ` <b>${esc(code)}</b>` : ''} is cancelled.`)}${P(`Invoices you already sent still stand; your copies stay in Money.`)}`,
        { label: 'Open your collabs', href: url(s, '/studio/collabs') },
        { to: 'creator', preheader: closed ? `Their requests are cancelled.` : `Request ${code} is cancelled.` },
      ),
      text: closed
        ? `After reports from creators, we closed ${brand}'s account. Any request from them is cancelled. If they asked you to pay a fee, please don't pay.`
        : `${brand} closed their account on ${s.app_name}, so request ${code} is cancelled. Invoices you already sent still stand.`,
    };
  }

  if (kind === 'report_update') {
    const name = String(p.name ?? '');
    const line = p.outcome === 'close'
      ? `We looked into your report and closed <b>${esc(name)}</b>'s account. Thank you for telling us; it keeps everyone on ${esc(s.app_name)} safer.`
      : p.outcome === 'keep'
        ? `We've paused <b>${esc(name)}</b>'s account while we look further. They can't send requests or messages until we're done.`
        : `We looked into your report about <b>${esc(name)}</b> and didn't find a reason to act this time. If anything else happens, report it again and we'll look again.`;
    const to: To = p.app ? 'app' : 'creator';
    return {
      subject: `About your report on ${name}`,
      html: layout(s, `About your report on ${name}`, P(line), undefined, { to, why: 'you sent us a report' }),
      text: line.replace(/<[^>]+>/g, ''),
    };
  }

  if (kind === 'account_paused' || kind === 'account_closed') {
    const closed = kind === 'account_closed';
    const to: To = p.side === 'creator' ? 'creator' : 'app';
    const body = closed
      ? `${P(`We've closed <b>${esc(p.name)}</b>'s account on ${esc(s.app_name)} because it broke our terms, after reports from people who worked with you.`)}${P(`Running requests are cancelled and the people involved have been told. If you think this is a mistake, reply to this email.`)}`
      : `${P(`<b>${esc(p.name)}</b>'s account on ${esc(s.app_name)} is paused while we look into reports about it. You can still sign in, but you can't send requests or messages for now.`)}${P(`If there's anything we should know, reply to this email. We usually decide within a day.`)}`;
    return {
      subject: closed ? `Your ${s.app_name} account is closed` : `Your ${s.app_name} account is paused`,
      html: layout(s, closed ? `Your account is closed` : `Your account is paused`, body, undefined, { to, why: 'it is about your account' }),
      text: body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
    };
  }

  if (kind === 'problem_new') {
    const href = 'https://admin.miracleapp.live/#problems';
    const head = p.back ? `A fixed problem is back` : `New problem in ${String(p.source) === 'jobs' ? 'emails & jobs' : String(p.source) === 'server' ? 'the server' : 'the app'}`;
    return {
      subject: `${head}: ${String(p.message ?? '').slice(0, 70)}`,
      html: layout(
        s,
        head,
        `${quoteBox('What broke', p.message)}${table(row('Where', p.place), row('Seen in', p.source))}`,
        { label: 'Open Problems', href },
        { to: 'app', why: `you're a ${s.app_name} admin` },
      ),
      text: `${head}\n\n${p.message}\nWhere: ${p.place}\n\n${href}`,
    };
  }

  // ---------------------------------------------------------------- her own pitches (no app branding)
  if (kind === 'pitch') {
    return { subject: String(p.subject ?? ''), html: personal(String(p.body ?? '')), text: String(p.body ?? '') };
  }

  if (kind === 'pitch_follow') {
    const first2 = String(p.contact ?? '').split(' ')[0] || 'there';
    const body = Number(p.round) === 1
      ? `Hi ${first2},\n\nJust bringing this back to the top of your inbox in case it got buried. I'd love to create something for ${p.brand}. Happy to share ideas, rates or my insights whenever suits you: ${p.link}\n\nThanks,\n${p.name}`
      : `Hi ${first2},\n\nOne last note from me so I don't fill your inbox. If a collaboration with ${p.brand} makes sense later, everything is here: ${p.link}\n\nWishing you a great launch season,\n${p.name}`;
    return { subject: String(p.subject ?? ''), html: personal(body), text: body };
  }

  throw new Error(`Unknown email kind: ${kind}`);
}
