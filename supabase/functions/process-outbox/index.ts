// Sends queued emails from public.outbox.
// Called by the database (trigger right after an email is queued, plus a cron retry every 5 minutes).
// It is not public: callers must send the shared secret in the x-cron-secret header.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mailConfigured, sendMail } from '../_shared/mailer.ts';
import { render, type Settings } from '../_shared/templates.ts';
import { pushFor, pushToCreator } from '../_shared/push.ts';

// Alerts only: a brand opening her insights link.
const PUSH_ONLY = new Set(['insights_viewed', 'ig_dm', 'ig_collab', 'month_summary']);

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: settings, error: settingsError } = await supabase
    .from('creator_settings')
    .select('app_name, display_name, site_url, reply_time, barter_reply_time, creator_email, handle, city')
    .eq('id', 1)
    .single<Settings>();
  if (settingsError) return Response.json({ error: settingsError.message }, { status: 500 });

  const { data: rows, error } = await supabase.rpc('claim_outbox', { n: 20 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Her team gets copies of what is sent to her (if they chose to).
  const { data: copies } = await supabase.rpc('team_copy_emails');
  const ownerEmail = String((settings as Settings & { creator_email?: string }).creator_email ?? '').toLowerCase();
  const teamCc = ((copies as string[] | null) ?? []).filter((e) => e !== ownerEmail);

  let sent = 0, failed = 0, skipped = 0;
  for (const row of rows ?? []) {
    // Amounts for a foreign brand are in their currency: older payloads don't say which, so look it up
    // from the collab's latest quote (the collab fee itself is kept in rupees).
    const p = (row.payload ?? {}) as Record<string, unknown>;
    if (!p.currency && p.code && (p.total || p.payable)) {
      const { data: c } = await supabase.from('collabs').select('id, brand:brands(currency)').eq('code', String(p.code)).maybeSingle();
      const cc = c as { id: string; brand?: { currency?: string } } | null;
      if (cc?.brand?.currency && cc.brand.currency !== 'INR') {
        const { data: q } = await supabase.from('quotes').select('currency').eq('collab_id', cc.id).order('version', { ascending: false }).limit(1).maybeSingle();
        if ((q as { currency?: string } | null)?.currency) p.currency = (q as { currency: string }).currency;
      }
      row.payload = p;
    }
    // A barter request's confirmation gives her barter reply time (paid ones are answered sooner).
    if (row.kind === 'request_received_brand' && p.code && !p.reply_time) {
      const { data: c } = await supabase.from('collabs').select('type').eq('code', String(p.code)).maybeSingle();
      const bt = String((settings as Settings & { barter_reply_time?: string }).barter_reply_time ?? '');
      if ((c as { type?: string } | null)?.type === 'barter' && bt) p.reply_time = bt;
      row.payload = p;
    }
    // A new request: the creator's email also shows the usage, preferred go-live and who referred them.
    if (row.kind === 'request_received_creator' && p.code && p.usage === undefined) {
      const { data: c } = await supabase.from('collabs').select('usage, preferred_live, referred_by').eq('code', String(p.code)).maybeSingle();
      const cc = c as { usage?: string; preferred_live?: string | null; referred_by?: string | null } | null;
      p.usage = cc?.usage ?? '';
      p.preferred_live = cc?.preferred_live ? new Date(cc.preferred_live + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      p.referred_by = '';
      if (cc?.referred_by) {
        const { data: rb } = await supabase.from('brands').select('name').eq('id', cc.referred_by).maybeSingle();
        p.referred_by = (rb as { name?: string } | null)?.name ?? '';
      }
      row.payload = p;
    }
    // A payment receipt: an advance isn't the end of the collab, so it mustn't read like a goodbye.
    if (row.kind === 'payment_thanks' && p.number && p.advance === undefined) {
      const { data: inv } = await supabase.from('invoices').select('kind').eq('number', String(p.number)).maybeSingle();
      p.advance = (inv as { kind?: string } | null)?.kind === 'advance';
      row.payload = p;
    }
    // Phone alert for things that need her (independent of the email going out).
    const alert = pushFor(row.kind, row.payload ?? {});
    if (alert) await pushToCreator(supabase, alert).catch((e) => console.error('[push]', e));
    // Some things are worth a phone alert but not an email.
    if (PUSH_ONLY.has(row.kind)) {
      await supabase.from('outbox').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', row.id);
      sent++;
      continue;
    }
    try {
      const mail = render(row.kind, row.payload ?? {}, settings);
      if (!mailConfigured) {
        console.log(`[outbox] SMTP not configured, skipping #${row.id} to ${row.to_email}: ${mail.subject}`);
        await supabase.from('outbox').update({ status: 'skipped', last_error: 'SMTP not configured' }).eq('id', row.id);
        skipped++;
        continue;
      }
      await sendMail({ to: row.to_email, cc: String(row.to_email).toLowerCase() === ownerEmail ? teamCc : undefined, ...mail });
      await supabase.from('outbox').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', row.id);
      sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[outbox] #${row.id} failed: ${message}`);
      await supabase
        .from('outbox')
        .update({ status: row.attempts >= 5 ? 'failed' : 'pending', last_error: message.slice(0, 500) })
        .eq('id', row.id);
      failed++;
    }
  }

  return Response.json({ sent, failed, skipped });
});
