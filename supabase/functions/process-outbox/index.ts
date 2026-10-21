// Sends queued emails from public.outbox.
// Called by the database (trigger right after an email is queued, plus a cron retry every 5 minutes).
// It is not public: callers must send the shared secret in the x-cron-secret header.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { mailConfigured, sendMail } from '../_shared/mailer.ts';
import { render, type Settings as MailSettings } from '../_shared/templates.ts';
import { pushFor, pushToCreator } from '../_shared/push.ts';
import { settingsOf, teamCopies, type Settings } from '../_shared/creators.ts';

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

  const { data: rows, error } = await supabase.rpc('claim_outbox', { n: 20 });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Each email belongs to one creator: her settings, her email and her team's copies, looked up
  // once per run for every creator that has mail in this batch.
  const creators = new Map<number, Promise<Creator | null>>();
  const creatorOf = (id: number) => {
    if (!creators.has(id)) creators.set(id, loadCreator(supabase, id));
    return creators.get(id)!;
  };

  let sent = 0, failed = 0, skipped = 0;
  for (const row of rows ?? []) {
    if (row.status === 'skipped') { skipped++; continue; }
    const creator = await creatorOf(Number(row.creator_id));
    if (!creator) {
      console.error(`[outbox] #${row.id}: no creator ${row.creator_id}`);
      await supabase.from('outbox').update({ status: row.attempts >= 5 ? 'failed' : 'pending', last_error: 'Creator not found' }).eq('id', row.id);
      failed++;
      continue;
    }
    const { settings, ownerEmail, teamCc } = creator;
    // Mail for her with no address (the month in review) goes to her own email.
    if (!String(row.to_email ?? '').trim()) row.to_email = settings.creator_email;
    // Amounts for a foreign brand are in their currency: older payloads don't say which, so look it up
    // from the collab's latest quote (the collab fee itself is kept in rupees).
    const p = (row.payload ?? {}) as Record<string, unknown>;
    if (!p.currency && p.code && (p.total || p.payable)) {
      const { data: c } = await supabase.from('collabs').select('id, brand:brands(currency)').eq('creator_id', row.creator_id).eq('code', String(p.code)).maybeSingle();
      const cc = c as { id: string; brand?: { currency?: string } } | null;
      if (cc?.brand?.currency && cc.brand.currency !== 'INR') {
        const { data: q } = await supabase.from('quotes').select('currency').eq('collab_id', cc.id).order('version', { ascending: false }).limit(1).maybeSingle();
        if ((q as { currency?: string } | null)?.currency) p.currency = (q as { currency: string }).currency;
      }
      row.payload = p;
    }
    // A barter request's confirmation gives her barter reply time (paid ones are answered sooner).
    if (row.kind === 'request_received_brand' && p.code && !p.reply_time) {
      const { data: c } = await supabase.from('collabs').select('type').eq('creator_id', row.creator_id).eq('code', String(p.code)).maybeSingle();
      const bt = String(settings.barter_reply_time ?? '');
      if ((c as { type?: string } | null)?.type === 'barter' && bt) p.reply_time = bt;
      row.payload = p;
    }
    // A new request: the creator's email also shows the usage, preferred go-live and who referred them.
    if (row.kind === 'request_received_creator' && p.code && p.usage === undefined) {
      const { data: c } = await supabase.from('collabs').select('usage, preferred_live, referred_by').eq('creator_id', row.creator_id).eq('code', String(p.code)).maybeSingle();
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
    // She's away: the brand's confirmation says so (with her note and who to contact).
    if (row.kind === 'request_received_brand' && settings.away_until && settings.away_until >= new Date().toISOString().slice(0, 10) && !p.away) {
      const back = new Date(settings.away_until + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      p.away = `Away until ${back}. ${String(settings.away_note ?? '').trim()} ${settings.away_contact ? `For anything urgent: ${settings.away_contact}.` : ''}`.replace(/\s+/g, ' ').trim();
      row.payload = p;
    }
    // A quote with options: the email says how many, from the lowest.
    if (row.kind === 'quote_sent' && p.code && p.choices === undefined) {
      const { data: c } = await supabase.from('collabs').select('id').eq('creator_id', row.creator_id).eq('code', String(p.code)).maybeSingle();
      const { data: q } = c ? await supabase.from('quotes').select('options').eq('collab_id', (c as { id: string }).id).eq('status', 'sent').order('version', { ascending: false }).limit(1).maybeSingle() : { data: null };
      const opts = ((q as { options?: { total: number }[] | null } | null)?.options ?? []) as { total: number }[];
      p.choices = opts.length > 1 ? opts.length : 0;
      if (opts.length > 1) p.from = Math.min(...opts.map((o) => Number(o.total) || 0));
      row.payload = p;
    }
    // A payment receipt: an advance isn't the end of the collab, so it mustn't read like a goodbye.
    if (row.kind === 'payment_thanks' && p.number && p.advance === undefined) {
      const { data: inv } = await supabase.from('invoices').select('kind').eq('creator_id', row.creator_id).eq('number', String(p.number)).maybeSingle();
      p.advance = (inv as { kind?: string } | null)?.kind === 'advance';
      row.payload = p;
    }
    // Phone alert for things that need her (independent of the email going out).
    const alert = pushFor(row.kind, row.payload ?? {});
    if (alert) await pushToCreator(supabase, settings.id, alert).catch((e) => console.error('[push]', e));
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
      // Every mail comes from "Miracle"; replies from anyone but her reach her inbox.
      const toOwner = String(row.to_email).toLowerCase() === ownerEmail;
      await sendMail({
        to: row.to_email,
        cc: toOwner && row.kind !== 'new_device' ? teamCc : undefined,
        ...mail,
        ...(toOwner || !ownerEmail ? {} : { replyTo: ownerEmail }),
      });
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

type Creator = { settings: Settings & MailSettings; ownerEmail: string; teamCc: string[] };

/** A creator's settings, her own email, and the team members who get copies of what is sent to her. */
async function loadCreator(db: SupabaseClient, id: number): Promise<Creator | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const settings = await settingsOf(db, id);
  if (!settings) return null;
  const ownerEmail = String(settings.creator_email ?? '').toLowerCase();
  const teamCc = (await teamCopies(db, id)).filter((e) => e.toLowerCase() !== ownerEmail);
  return { settings: settings as Settings & MailSettings, ownerEmail, teamCc };
}
