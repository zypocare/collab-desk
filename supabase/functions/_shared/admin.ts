import { createClient } from 'npm:@supabase/supabase-js@2';

/** Database client with full access. Only for server functions, never for the website. */
export const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** Checks the shared secret sent by the database's scheduled jobs. */
export function cronAllowed(req: Request) {
  const secret = Deno.env.get('CRON_SECRET') ?? '';
  return secret !== '' && req.headers.get('x-cron-secret') === secret;
}

/** Today's date in India (YYYY-MM-DD), whatever timezone the server runs in. */
export function todayIST(offsetDays = 0) {
  const d = new Date(Date.now() + 5.5 * 3600e3 + offsetDays * 864e5);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 864e5);

export const inr = (n: unknown) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
