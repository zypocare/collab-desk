// Email templates for the outbox. Each kind turns a payload into a subject, HTML and plain text.
// Brand emails read like a professional note from her: a greeting, what happened, the details,
// what happens next, a clear button, and her sign-off. Emails to her are short work notes with
// the facts and what to do. Every email carries the app's logo and a footer saying why it came.
import type { Mail } from './mailer.ts';

export type Settings = { app_name: string; display_name: string; site_url: string; reply_time: string; handle?: string; city?: string };
type Payload = Record<string, unknown>;
type To = 'brand' | 'creator';

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
  opts: { to?: To; next?: string[]; code?: string; preheader?: string } = {},
) {
  const to = opts.to ?? 'brand';
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
    <td style="vertical-align:middle;padding-left:12px"><div style="font-size:16px;font-weight:700;letter-spacing:-.2px;color:${INK}">${esc(s.app_name)}</div><div style="font-size:12.5px;color:${MUTED}">${to === 'brand' ? `Collaborations with ${esc(s.display_name)}` : `Your creator studio`}</div></td>
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
    ${to === 'brand'
      ? `<div style="font-size:15px;line-height:1.6;color:${BODY}">Warm regards,<br><b style="color:${INK}">${esc(s.display_name)}</b>${handle ? `<br><span style="font-size:13.5px;color:${MUTED}">@${esc(handle)} on Instagram${s.city ? ` · ${esc(s.city)}` : ''}</span>` : ''}</div>`
      : `<div style="font-size:13.5px;line-height:1.6;color:${MUTED}">${esc(s.app_name)} · keeping your collaborations moving</div>`}
  </td></tr>
  </table>
</td></tr>
<tr><td style="padding:18px 16px 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center">
  ${to === 'brand'
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

  if (kind === 'payment_reminder') {
    const late = Number(p.days_late) || 0;
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
