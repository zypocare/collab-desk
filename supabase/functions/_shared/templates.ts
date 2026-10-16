// Email templates for the outbox. Each kind turns a payload into a subject, HTML and plain text.
import type { Mail } from './mailer.ts';

export type Settings = { app_name: string; display_name: string; site_url: string; reply_time: string };
type Payload = Record<string, unknown>;

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inr = (n: unknown) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const first = (name: string) => (name || '').split(' ')[0] || 'there';
const url = (s: Settings, path: string) => s.site_url.replace(/\/$/, '') + path;

function layout(s: Settings, heading: string, bodyHtml: string, button?: { label: string; href: string }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f4f4;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e171c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4f4;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;border:1px solid #eae2e2">
<tr><td style="padding:30px 32px 6px">
<div style="height:6px;width:56px;border-radius:6px;background:linear-gradient(115deg,#6b3fd4,#d4296a 52%,#f2994a)"></div>
<h1 style="margin:22px 0 10px;font-size:22px;line-height:1.25;font-weight:700">${esc(heading)}</h1>
<div style="font-size:15px;line-height:1.6;color:#3b3238">${bodyHtml}</div>
</td></tr>
${button ? `<tr><td style="padding:14px 32px 6px"><a href="${esc(button.href)}" style="display:inline-block;background:#1e171c;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:12px">${esc(button.label)}</a></td></tr>` : ''}
<tr><td style="padding:22px 32px 28px;color:#8c8288;font-size:12.5px;line-height:1.5">Sent by ${esc(s.app_name)} for ${esc(s.display_name)}.</td></tr>
</table></td></tr></table></body></html>`;
}

const row = (label: string, value: unknown) =>
  value === '' || value == null
    ? ''
    : `<tr><td style="padding:6px 12px 6px 0;color:#8c8288;font-size:13px;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 0;font-size:14px">${esc(value)}</td></tr>`;

export function render(kind: string, p: Payload, s: Settings): Omit<Mail, 'to'> {
  const code = String(p.code ?? '');
  const brand = String(p.brand ?? '');

  if (kind === 'request_received_brand') {
    const subject = `We've received your request ${code}`;
    const html = layout(
      s,
      `Thanks, ${first(String(p.contact ?? ''))}! Your request is in.`,
      `<p style="margin:0 0 12px">${esc(s.display_name)} usually replies within ${esc(s.reply_time)}. You can check the status any time by signing in with this email address.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px">${row('Request code', code)}${row('Brand', brand)}${row('Deliverables', p.deliverables)}</table>`,
      { label: 'Track your request', href: url(s, '/brand') },
    );
    const text = `Thanks! ${s.display_name} has received your request ${code} (${p.deliverables}). Track it at ${url(s, '/brand')}`;
    return { subject, html, text };
  }

  if (kind === 'request_received_creator') {
    const money = p.type === 'barter' ? `Barter: ${p.product}` : `${Number(p.fee) ? inr(p.fee) : 'Asked for a quote'}${p.type === 'hybrid' ? ` + ${p.product}` : ''}`;
    const subject = `New collab request from ${brand}`;
    const html = layout(
      s,
      `New request from ${brand}`,
      `<table role="presentation" cellpadding="0" cellspacing="0">${row('Code', code)}${row('Contact', p.contact)}${row('Email', p.email)}${row('Phone', p.phone)}${row('Package', p.package)}${row('Deliverables', p.deliverables)}${row('Offer', money)}</table>
       ${p.brief ? `<p style="margin:14px 0 0;padding:12px 14px;background:#f2eded;border-radius:12px;font-size:14px">${esc(p.brief)}</p>` : ''}`,
      { label: 'Open in your studio', href: url(s, `/studio/collabs?open=${encodeURIComponent(code)}`) },
    );
    const text = `New request ${code} from ${brand} (${p.contact}, ${p.email}). ${p.deliverables}. ${money}.`;
    return { subject, html, text };
  }

  if (kind === 'stage_changed') {
    const label = String(p.stage_label ?? '');
    const subject = `${code}: ${label}`;
    const note = String(p.note ?? '');
    const html = layout(
      s,
      `Update on your collaboration with ${s.display_name}`,
      `<p style="margin:0 0 12px">Hi ${esc(first(String(p.contact ?? '')))}, your request <b>${esc(code)}</b> is now: <b>${esc(label)}</b>.</p>
       ${note ? `<p style="margin:0;padding:12px 14px;background:#f2eded;border-radius:12px;font-size:14px"><span style="display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8c8288;margin-bottom:4px">Latest from ${esc(first(s.display_name))}</span>${esc(note)}</p>` : ''}`,
      { label: 'See full status', href: url(s, '/brand') },
    );
    const text = `Your request ${code} with ${s.display_name} is now: ${label}. ${note} ${url(s, '/brand')}`;
    return { subject, html, text };
  }

  const firstOf = (v: unknown) => first(String(v ?? ''));
  const quoteBox = (label: string, text: unknown) =>
    text ? `<p style="margin:14px 0 0;padding:12px 14px;background:#f2eded;border-radius:12px;font-size:14px"><span style="display:block;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8c8288;margin-bottom:4px">${esc(label)}</span>${esc(text)}</p>` : '';

  if (kind === 'quote_sent') {
    return {
      subject: `${code}: quote from ${s.display_name} (${inr(p.total)})`,
      html: layout(
        s,
        `Your quote is ready`,
        `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, ${esc(s.display_name)} has sent a quote of <b>${esc(inr(p.total))}</b> for request <b>${esc(code)}</b>. Review the details and accept it, or ask for changes. No sign-in needed.</p>
         ${p.action ? `<p style="margin:12px 0 0;font-size:13px"><a href="${esc(url(s, `/brand/r/${encodeURIComponent(code)}`))}" style="color:#8c8288">Or see the full request</a></p>` : ''}`,
        p.action ? { label: 'Accept or ask for changes', href: url(s, `/a/${p.action}`) } : { label: 'Review the quote', href: url(s, `/brand/r/${encodeURIComponent(code)}`) },
      ),
      text: `${s.display_name} sent a quote of ${inr(p.total)} for ${code}. Review it at ${url(s, `/brand/r/${code}`)}`,
    };
  }

  if (kind === 'agreement_confirmed') {
    return {
      subject: `${code}: agreement confirmed`,
      html: layout(
        s,
        `Agreement confirmed`,
        `<p style="margin:0">Thanks, ${esc(firstOf(p.contact))}. You accepted the quote of <b>${esc(inr(p.total))}</b> for <b>${esc(code)}</b>. The agreement is saved in your account, with the date and time you accepted it.</p>`,
        { label: 'View the agreement', href: url(s, `/agreement/${p.quote_id}`) },
      ),
      text: `You accepted the quote of ${inr(p.total)} for ${code}. View the agreement at ${url(s, `/agreement/${p.quote_id}`)}`,
    };
  }

  if (kind === 'quote_accepted') {
    return {
      subject: `${brand} accepted your quote (${inr(p.total)})`,
      html: layout(
        s,
        `${brand} accepted your quote`,
        `<p style="margin:0">${esc(p.name)} accepted <b>${esc(inr(p.total))}</b> for <b>${esc(code)}</b>. The deal is now confirmed.</p>${quoteBox('Their note', p.note)}`,
        { label: 'Open in your studio', href: url(s, `/studio/collabs?open=${encodeURIComponent(code)}`) },
      ),
      text: `${brand} (${p.name}) accepted your quote of ${inr(p.total)} for ${code}.`,
    };
  }

  if (kind === 'quote_changes') {
    return {
      subject: `${brand} asked for changes to your quote`,
      html: layout(
        s,
        `${brand} would like changes`,
        `<p style="margin:0">${esc(p.name || brand)} replied to your quote for <b>${esc(code)}</b>.</p>${quoteBox('What they asked', p.note)}`,
        { label: 'Revise the quote', href: url(s, `/studio/collabs?open=${encodeURIComponent(code)}`) },
      ),
      text: `${brand} asked for changes to your quote for ${code}: ${p.note}`,
    };
  }

  if (kind === 'draft_ready') {
    return {
      subject: `${code}: draft ${p.round} ready for your review`,
      html: layout(
        s,
        `A draft is ready for you`,
        `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, ${esc(s.display_name)} has shared draft round ${esc(p.round)} for <b>${esc(code)}</b>. Approve it or ask for changes. No sign-in needed.</p>${quoteBox(`Note from ${first(s.display_name)}`, p.note)}`,
        p.action ? { label: 'Review and approve', href: url(s, `/a/${p.action}`) } : { label: 'Review the draft', href: url(s, `/brand/r/${encodeURIComponent(code)}`) },
      ),
      text: `Draft round ${p.round} for ${code} is ready for review: ${url(s, `/brand/r/${code}`)}`,
    };
  }

  if (kind === 'draft_reviewed') {
    const ok = p.approved === true;
    return {
      subject: ok ? `${brand} approved draft ${p.round}` : `${brand} asked for changes on draft ${p.round}`,
      html: layout(
        s,
        ok ? `Draft ${p.round} approved` : `Changes requested on draft ${p.round}`,
        `<p style="margin:0">${esc(p.name)} from ${esc(brand)} ${ok ? 'approved' : 'reviewed'} draft round ${esc(p.round)} for <b>${esc(code)}</b>.</p>${quoteBox('Their feedback', p.feedback)}`,
        { label: 'Open in your studio', href: url(s, `/studio/collabs?open=${encodeURIComponent(code)}`) },
      ),
      text: `${brand} ${ok ? 'approved' : 'asked for changes on'} draft ${p.round} for ${code}. ${p.feedback ?? ''}`,
    };
  }

  const fmtDate = (d: unknown) =>
    d ? new Date(String(d) + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const tdsNote = Number(p.total) !== Number(p.payable) ? ` (${inr(p.total)} less TDS)` : '';

  if (kind === 'invoice_sent') {
    return {
      subject: `Invoice ${p.number} from ${s.display_name}`,
      html: layout(
        s,
        `Invoice ${p.number}`,
        `<p style="margin:0 0 12px">Hi ${esc(firstOf(p.contact))}, here is the invoice for <b>${esc(code)}</b>.</p>
         <table role="presentation" cellpadding="0" cellspacing="0">${row('Amount payable', inr(p.payable) + tdsNote)}${row('Due', fmtDate(p.due))}</table>
         <p style="margin:14px 0 0">You can download the PDF and pay by UPI (scan the QR code) or bank transfer from the invoice page.</p>`,
        { label: 'View and pay invoice', href: String(p.link) },
      ),
      text: `Invoice ${p.number} for ${code}: ${inr(p.payable)} due ${fmtDate(p.due)}. View and pay: ${p.link}`,
    };
  }

  if (kind === 'payment_reminder') {
    const late = Number(p.days_late) || 0;
    const when = late > 0 ? `was due on ${fmtDate(p.due)}, ${late} day${late > 1 ? 's' : ''} ago` : late === 0 ? 'is due today' : `is due on ${fmtDate(p.due)}`;
    return {
      subject: late > 0 ? `Reminder: invoice ${p.number} is overdue` : `Reminder: invoice ${p.number} ${late === 0 ? 'is due today' : 'is due soon'}`,
      html: layout(
        s,
        late > 0 ? 'A gentle reminder' : 'Friendly reminder',
        `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, invoice <b>${esc(p.number)}</b> for <b>${esc(code)}</b> (${esc(inr(p.due_amount))}) ${esc(when)}.
         If it's already paid, thank you, and please ignore this email.</p>`,
        { label: 'View and pay invoice', href: String(p.link) },
      ),
      text: `Invoice ${p.number} (${inr(p.due_amount)}) ${when}. View and pay: ${p.link}`,
    };
  }

  if (kind === 'payment_thanks') {
    return {
      subject: `Payment received for ${p.number}. Thank you!`,
      html: layout(
        s,
        'Payment received',
        `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, we've received the payment for invoice <b>${esc(p.number)}</b>. Thank you, it was lovely working with you.</p>`,
        { label: 'View receipt', href: String(p.link) },
      ),
      text: `Payment received for ${p.number}. Thank you! ${p.link}`,
    };
  }

  if (kind === 'bank_matched' || kind === 'bank_unmatched') {
    const matched = kind === 'bank_matched';
    return {
      subject: matched ? `${inr(p.amount)} received from ${brand} (${p.number})` : `${inr(p.amount)} credited: which invoice is it?`,
      html: layout(
        s,
        matched ? `${inr(p.amount)} from ${brand}` : `Money in: ${inr(p.amount)}`,
        matched
          ? `<p style="margin:0">Your bank reported a credit that matches invoice <b>${esc(p.number)}</b>. It's marked as paid.</p>`
          : `<p style="margin:0">Your bank reported a credit we couldn't match to an invoice. Open Payments to assign it.</p>${quoteBox('From the bank email', p.excerpt)}`,
        { label: 'Open payments', href: url(s, '/studio/payments') },
      ),
      text: matched ? `${inr(p.amount)} matched to ${p.number} (${brand}).` : `${inr(p.amount)} credited but not matched. ${url(s, '/studio/payments')}`,
    };
  }

  const num = (v: unknown) => (v === null || v === undefined || v === '' ? '' : Math.round(Number(v)).toLocaleString('en-IN'));

  if (kind === 'post_detected') {
    const missing = p.missing_ad === true;
    return {
      subject: missing ? `Add #ad to your ${brand} post` : `Your ${brand} post is live`,
      html: layout(
        s,
        missing ? 'Your post is live, but needs #ad' : 'Your post is live',
        `<p style="margin:0">We spotted your post for <b>${esc(brand)}</b> (${esc(code)}) on Instagram and moved the collab to Live. The brand has been told.</p>
         ${missing ? quoteBox('Action needed', 'The first line of the caption has no #ad or #collab. Indian advertising rules (ASCI) need paid and gifted posts to be clearly marked. Edit the caption and turn on the "Paid partnership" label.') : ''}
         ${Array.isArray(p.missing_items) && p.missing_items.length ? quoteBox('Missing from the brief', `The brief asked for ${(p.missing_items as string[]).join(' ')}. Add them to the caption so the brand is happy.`) : ''}`,
        { label: 'Open the post', href: String(p.permalink) },
      ),
      text: `Your ${brand} post is live: ${p.permalink}${missing ? '. Add #ad to the first line of the caption.' : ''}`,
    };
  }

  if (kind === 'report_ready') {
    return {
      subject: `Results report ready for ${brand}`,
      html: layout(
        s,
        `${brand}: results are in`,
        `<p style="margin:0">7 days after posting: <b>${esc(num(p.views) || '—')}</b> views and <b>${esc(num(p.reach) || '—')}</b> accounts reached. Check the report and send it to the brand from the collab panel.</p>`,
        { label: 'Review and send', href: url(s, `/studio/collabs?open=${encodeURIComponent(code)}`) },
      ),
      text: `Results report for ${brand} (${code}) is ready to review and send.`,
    };
  }

  if (kind === 'brand_report') {
    return {
      subject: `Results for ${code}: ${num(p.views) ? `${num(p.views)} views` : 'your campaign report'}`,
      html: layout(
        s,
        `How your collaboration performed`,
        `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, here are the results of your collaboration with ${esc(s.display_name)} (${esc(code)}), straight from Instagram.</p>
         <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px">${row('Views', num(p.views))}${row('Accounts reached', num(p.reach))}</table>`,
        { label: 'See the full report', href: String(p.link) },
      ),
      text: `Results for ${code}: ${num(p.views)} views, ${num(p.reach)} reached. Full report: ${p.link}`,
    };
  }

  if (kind === 'message_to_creator') {
    return {
      subject: `${brand} sent you a message (${code})`,
      html: layout(
        s,
        `New message from ${brand}`,
        `<p style="margin:0">${esc(firstOf(p.contact) === 'there' ? brand : firstOf(p.contact))} wrote about <b>${esc(code)}</b>:</p>${quoteBox('Message', p.body)}`,
        { label: 'Reply in your studio', href: url(s, `/studio/collabs?open=${encodeURIComponent(code)}`) },
      ),
      text: `${brand} (${code}): ${p.body}`,
    };
  }

  if (kind === 'message_to_brand') {
    return {
      subject: `${first(s.display_name)} replied about ${code}`,
      html: layout(
        s,
        `New message from ${s.display_name}`,
        `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, ${esc(first(s.display_name))} sent you a message about your request <b>${esc(code)}</b>:</p>${quoteBox(`From ${first(s.display_name)}`, p.body)}
         <p style="margin:14px 0 0;font-size:13px;color:#8c8288">Reply from your request page so everything stays in one place.</p>`,
        { label: 'Reply', href: url(s, `/brand/r/${encodeURIComponent(code)}`) },
      ),
      text: `${s.display_name} about ${code}: ${p.body} Reply at ${url(s, `/brand/r/${code}`)}`,
    };
  }

  if (kind === 'product_shipped') {
    return {
      subject: `${brand} shipped your product (${code})`,
      html: layout(
        s,
        `A parcel is on its way`,
        `<p style="margin:0">${esc(brand)} has shipped ${p.product ? `<b>${esc(p.product)}</b>` : 'the product'} for <b>${esc(code)}</b>.</p>
         <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px">${row('Courier', p.carrier)}${row('Tracking', p.tracking)}</table>
         <p style="margin:12px 0 0">Tap <b>Mark received</b> in your studio when it arrives; your draft deadline counts from that day.</p>`,
        { label: 'Open in your studio', href: url(s, `/studio/collabs?open=${encodeURIComponent(code)}`) },
      ),
      text: `${brand} shipped ${p.product || 'the product'} for ${code} via ${p.carrier} ${p.tracking}.`,
    };
  }

  if (kind === 'product_received') {
    const due = p.draft_date ? new Date(String(p.draft_date)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
    return {
      subject: `${first(s.display_name)} received your product (${code})`,
      html: layout(
        s,
        `Your product arrived`,
        `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, ${esc(first(s.display_name))} has received ${p.product ? `<b>${esc(p.product)}</b>` : 'your product'} for <b>${esc(code)}</b>.${due ? ` You can expect the draft by <b>${esc(due)}</b>.` : ''}</p>`,
        { label: 'See status', href: url(s, `/brand/r/${encodeURIComponent(code)}`) },
      ),
      text: `${s.display_name} received your product for ${code}.${due ? ` Draft expected by ${due}.` : ''}`,
    };
  }

  const day = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  if (kind === 'usage_ending') {
    return {
      subject: `Your usage rights for ${code} end on ${day(p.ends)}`,
      html: layout(
        s,
        `Paid usage ends ${day(p.ends)}`,
        `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, the ${esc(String(p.usage ?? '').toLowerCase())} for your collaboration with ${esc(s.display_name)} (<b>${esc(code)}</b>) end on <b>${esc(day(p.ends))}</b>. After that, please stop running the content as ads.</p>
         <p style="margin:12px 0 0">Want to keep the ads running? You can extend in one tap${Number(p.price30) ? `, from ${esc(inr(p.price30))} for 30 days` : ''}.</p>`,
        { label: 'Extend usage', href: url(s, `/brand/r/${encodeURIComponent(code)}`) },
      ),
      text: `Paid usage for ${code} ends on ${day(p.ends)}. Extend at ${url(s, `/brand/r/${code}`)}`,
    };
  }

  if (kind === 'usage_ext_requested') {
    return {
      subject: `${brand} wants to extend usage by ${p.days} days (${inr(p.price)})`,
      html: layout(
        s,
        `Usage extension request`,
        `<p style="margin:0">${esc(brand)} asked to keep running <b>${esc(code)}</b> as ads for <b>${esc(p.days)} more days</b>.</p>
         <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px">${row('Extra fee', inr(p.price))}${row('Currently ends', day(p.ends))}</table>`,
        { label: 'Approve or decline', href: url(s, `/studio/collabs?open=${encodeURIComponent(code)}`) },
      ),
      text: `${brand} wants ${p.days} more days of paid usage for ${code} at ${inr(p.price)}.`,
    };
  }

  if (kind === 'usage_ext_answer') {
    const ok = p.approved === true;
    return {
      subject: ok ? `Usage extended for ${code} until ${day(p.ends)}` : `About your usage extension for ${code}`,
      html: layout(
        s,
        ok ? `Extended until ${day(p.ends)}` : `Extension not available`,
        ok
          ? `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, ${esc(first(s.display_name))} approved <b>${esc(p.days)} more days</b> of paid usage for <b>${esc(code)}</b>, now until <b>${esc(day(p.ends))}</b>. An invoice for ${esc(inr(p.price))} will follow.</p>`
          : `<p style="margin:0">Hi ${esc(firstOf(p.contact))}, ${esc(first(s.display_name))} can't extend paid usage for <b>${esc(code)}</b> this time. You can reply in Messages on your request page.</p>`,
        { label: 'See your request', href: url(s, `/brand/r/${encodeURIComponent(code)}`) },
      ),
      text: ok ? `Usage for ${code} extended until ${day(p.ends)}.` : `Usage for ${code} can't be extended this time.`,
    };
  }

  throw new Error(`Unknown email kind: ${kind}`);
}
