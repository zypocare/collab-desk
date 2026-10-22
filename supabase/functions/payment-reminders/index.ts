// Polite payment reminders to brands: 2 days before the due date, on the day, then 3, 7 and 14 days late.
// Runs every morning at 10:00 IST from the database cron job, protected by the shared secret.
// It runs once for every active creator, each with her own invoices and website address.
import { admin, cronAllowed, daysBetween, todayIST } from '../_shared/admin.ts';

const addDays = (isoDay: string, n: number) => {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
import { activeCreators, type Settings } from '../_shared/creators.ts';

const STEPS = [-2, 0, 3, 7, 14];

Deno.serve(async (req) => {
  if (!cronAllowed(req)) return new Response('Forbidden', { status: 403 });
  const db = admin();

  let creators: Settings[];
  try {
    creators = await activeCreators(db);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  const results = [];
  for (const s of creators) {
    try {
      results.push({ creator: s.id, ...(await remindFor(db, s)) });
    } catch (e) {
      console.error(`[payment-reminders] creator ${s.id}:`, e);
      results.push({ creator: s.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ creators: results });
});

/** One creator's reminders: queues the ones that are due and notes them on the invoice. */
async function remindFor(db: ReturnType<typeof admin>, s: Settings) {
  if (!s.reminders_enabled) return { skipped: 'reminders are turned off' };

  const { data: invoices, error } = await db
    .from('invoices')
    .select('id, collab_id, number, public_token, due_date, total, payable, amount_received, tds_deducted, reminders_sent, send_to, collab:collabs(code, contact_name, contact_email, stage)')
    .eq('creator_id', s.id)
    .in('status', ['sent', 'partly_paid'])
    .eq('auto_remind', true)
    .not('due_date', 'is', null);
  if (error) throw new Error(error.message);

  const today = todayIST();
  let queued = 0;
  for (const inv of invoices ?? []) {
    const daysLate = daysBetween(inv.due_date, today);
    // The latest step that has been reached, if it was reached in the last 2 days (no burst of old reminders).
    const step = [...STEPS].reverse().find((st) => daysLate >= st && daysLate - st <= 2);
    if (step === undefined || (inv.reminders_sent ?? []).includes(step)) continue;

    const collab = inv.collab as unknown as { code: string; contact_name: string; contact_email: string; stage: string };
    if (!collab || ['paused', 'cancelled'].includes(collab.stage)) continue;
    const recipients = [...new Set([collab.contact_email, inv.send_to].map((e) => (e ?? '').trim()).filter(Boolean))];
    if (!recipients.length) continue;

    const dueAmount = Math.max(0, Number(inv.payable) - Number(inv.amount_received));
    const payload = {
      code: collab.code, number: inv.number, contact: collab.contact_name, due: inv.due_date, days_late: daysLate,
      due_amount: dueAmount, link: `${String(s.site_url).replace(/\/$/, '')}/invoice/${inv.public_token}`,
      // The firm reminder (a week late or more) gives a date to pay by: a week from today.
      ...(daysLate >= 7 ? { pay_by: addDays(today, 7) } : {}),
    };
    await db.from('outbox').insert(recipients.map((to) => ({ creator_id: s.id, kind: 'payment_reminder', to_email: to, payload })));
    await db.from('invoices').update({ reminders_sent: [...(inv.reminders_sent ?? []), step], last_reminded_at: new Date().toISOString() }).eq('id', inv.id);
    await db.from('collab_events').insert({
      creator_id: s.id, collab_id: inv.collab_id,
      kind: 'reminder', text: `Payment reminder sent for ${inv.number}`, visible_to_brand: true,
    });
    queued++;
  }
  return { checked: invoices?.length ?? 0, reminders: queued };
}
