// Sends the app's email from its own address (no-reply@miracleapp.live).
// Hosted Supabase blocks ports 25 and 587, so production uses port 465 (SSL).
// Nobody reads the no-reply inbox: mail a person may answer carries a Reply-To instead.
// A second account (SMTP2_*) is a backup: when the main one fails or hits its limit, the mail goes through it.
import nodemailer from 'npm:nodemailer@6.9.16';

export type Mail = { to: string; cc?: string[]; subject: string; html: string; text: string; replyTo?: string; fromName?: string; /** Extra headers, like List-Unsubscribe on a creator's emails to her list. */ headers?: Record<string, string>; /** Files sent with it (a PDF invoice). */ attachments?: { filename: string; content: Uint8Array; contentType?: string }[] };

type Sender = { label: string; transport: ReturnType<typeof nodemailer.createTransport>; fromAddress: string; fromName: string };

function sender(prefix: string, label: string): Sender | null {
  const host = Deno.env.get(`${prefix}_HOST`) ?? '';
  if (!host) return null;
  const port = Number(Deno.env.get(`${prefix}_PORT`) ?? '465');
  const user = Deno.env.get(`${prefix}_USER`) ?? '';
  const pass = Deno.env.get(`${prefix}_PASS`) ?? '';
  const secure = (Deno.env.get(`${prefix}_SECURE`) ?? (port === 465 ? 'true' : 'false')) === 'true';
  // "Miracle <no-reply@miracleapp.live>": the name can change per mail, the address never does.
  const fromRaw = Deno.env.get(`${prefix}_FROM`) ?? user;
  const fromAddress = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim();
  const fromName = (fromRaw.includes('<') ? fromRaw.slice(0, fromRaw.indexOf('<')) : '').trim().replace(/^"|"$/g, '') || 'Miracle';
  const transport = nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
  return { label, transport, fromAddress, fromName };
}

const senders = [sender('SMTP', 'main'), sender('SMTP2', 'backup')].filter((s): s is Sender => s !== null);
// The Growth Autopilot's invitations go from their own address when one is set up (GROWTH_SMTP_*), so the
// app's own mail (quotes, invoices, sign-in codes) keeps its good name with inboxes.
const growthSender = sender('GROWTH_SMTP', 'growth');

export const mailConfigured = senders.length > 0;

export async function sendMail(mail: Mail, only?: Sender[]): Promise<void> {
  const use = only ?? senders;
  if (!use.length) throw new Error('SMTP is not configured (set SMTP_HOST).');
  const errors: string[] = [];
  for (const s of use) {
    try {
      await s.transport.sendMail({
        from: { name: mail.fromName || s.fromName, address: s.fromAddress },
        to: mail.to,
        cc: mail.cc?.length ? mail.cc : undefined,
        replyTo: mail.replyTo || undefined,
        headers: mail.headers,
        attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType ?? 'application/pdf' })),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      if (errors.length) console.warn(`[mailer] sent through the ${s.label} account after: ${errors.join(' | ')}`);
      return;
    } catch (e) {
      errors.push(`${s.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.join(' | '));
}

/** A Growth Autopilot invitation: from its own address when there is one, else the app's. */
export const sendGrowthMail = (mail: Mail) => sendMail(mail, growthSender ? [growthSender] : undefined);
