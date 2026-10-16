// Sends queued emails from public.outbox.
// Called by the database (trigger right after an email is queued, plus a cron retry every 5 minutes).
// It is not public: callers must send the shared secret in the x-cron-secret header.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { mailConfigured, sendMail } from '../_shared/mailer.ts';
import { render, type Settings } from '../_shared/templates.ts';
import { pushFor, pushToCreator } from '../_shared/push.ts';

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
    .select('app_name, display_name, site_url, reply_time, creator_email')
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
    // Phone alert for things that need her (independent of the email going out).
    const alert = pushFor(row.kind, row.payload ?? {});
    if (alert) await pushToCreator(supabase, alert).catch((e) => console.error('[push]', e));
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
