// Sends email through the creator's own SMTP account (Gmail or Zoho).
// Hosted Supabase blocks ports 25 and 587, so production uses port 465 (SSL).
import nodemailer from 'npm:nodemailer@6.9.16';

export type Mail = { to: string; subject: string; html: string; text: string };

const host = Deno.env.get('SMTP_HOST') ?? '';
const port = Number(Deno.env.get('SMTP_PORT') ?? '465');
const user = Deno.env.get('SMTP_USER') ?? '';
const pass = Deno.env.get('SMTP_PASS') ?? '';
const from = Deno.env.get('SMTP_FROM') ?? user;
const secure = (Deno.env.get('SMTP_SECURE') ?? (port === 465 ? 'true' : 'false')) === 'true';

export const mailConfigured = host !== '';

const transport = mailConfigured
  ? nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined })
  : null;

export async function sendMail(mail: Mail): Promise<void> {
  if (!transport) throw new Error('SMTP is not configured (set SMTP_HOST).');
  await transport.sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
}
