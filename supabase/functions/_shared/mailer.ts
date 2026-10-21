// Sends the app's email from its own address (no-reply@miracleapp.live, a Zoho mailbox).
// Hosted Supabase blocks ports 25 and 587, so production uses port 465 (SSL).
// Nobody reads the no-reply inbox: mail a person may answer carries a Reply-To instead.
import nodemailer from 'npm:nodemailer@6.9.16';

export type Mail = { to: string; cc?: string[]; subject: string; html: string; text: string; replyTo?: string; fromName?: string };

const host = Deno.env.get('SMTP_HOST') ?? '';
const port = Number(Deno.env.get('SMTP_PORT') ?? '465');
const user = Deno.env.get('SMTP_USER') ?? '';
const pass = Deno.env.get('SMTP_PASS') ?? '';
// "Miracle <no-reply@miracleapp.live>": the name can change per mail, the address never does.
const fromRaw = Deno.env.get('SMTP_FROM') ?? user;
const fromAddress = (fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw).trim();
const fromName = (fromRaw.includes('<') ? fromRaw.slice(0, fromRaw.indexOf('<')) : '').trim().replace(/^"|"$/g, '') || 'Miracle';
const secure = (Deno.env.get('SMTP_SECURE') ?? (port === 465 ? 'true' : 'false')) === 'true';

export const mailConfigured = host !== '';

const transport = mailConfigured
  ? nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined })
  : null;

export async function sendMail(mail: Mail): Promise<void> {
  if (!transport) throw new Error('SMTP is not configured (set SMTP_HOST).');
  await transport.sendMail({
    from: { name: mail.fromName || fromName, address: fromAddress },
    to: mail.to,
    cc: mail.cc?.length ? mail.cc : undefined,
    replyTo: mail.replyTo || undefined,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
}
