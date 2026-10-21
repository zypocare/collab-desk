// A phone notification about money still to come in, at the times she picked (9 AM, 1 PM, 5 PM and
// 9 PM to start). Runs every hour on the hour from the database cron job; sends only at her times
// and only when something is pending. Buttons: remind the brands, or open Payments.
// It runs once for every active creator, each at her own times and with her own collabs.
import { admin, cronAllowed, daysBetween, todayIST } from '../_shared/admin.ts';
import { pushToCreator } from '../_shared/push.ts';
import { activeCreators, type Settings } from '../_shared/creators.ts';

const rupees = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const shortDate = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

Deno.serve(async (req) => {
  if (!cronAllowed(req)) return new Response('Forbidden', { status: 403 });
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
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
      results.push({ creator: s.id, ...(await alertFor(db, s, dry)) });
    } catch (e) {
      console.error(`[payment-alerts] creator ${s.id}:`, e);
      results.push({ creator: s.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ creators: results });
});

/** One creator's alert: what is still owed to her, if this is one of her times. */
async function alertFor(db: ReturnType<typeof admin>, s: Settings, dry: boolean): Promise<Record<string, unknown>> {
  if (!s.pay_alerts) return { skipped: 'turned off' };
  const hour = new Date(Date.now() + 5.5 * 3600e3).getUTCHours();
  if (!dry && !(s.pay_alert_hours ?? []).includes(hour)) return { skipped: `not one of her times (${hour}:00)` };

  // Same rule as the Payments screen: paid collabs (not barter), content live or done, or already
  // invoiced, with money still owed.
  const { data: rows, error } = await db
    .from('collabs')
    .select('code, fee, pay_received, pay_status, pay_due, stage, brand:brands(name)')
    .eq('creator_id', s.id)
    .neq('type', 'barter')
    .neq('pay_status', 'paid')
    .in('stage', ['confirmed', 'creating', 'live', 'wrapped']);
  if (error) throw new Error(error.message);

  const today = todayIST();
  const pending = (rows ?? [])
    .map((c) => {
      const owed = Math.max(0, (Number(c.fee) || 0) - (Number(c.pay_received) || 0));
      const invoiced = c.pay_status === 'invoiced' || c.pay_status === 'advance';
      const late = invoiced && c.pay_due ? daysBetween(c.pay_due, today) : 0;
      return { code: c.code, brand: (c.brand as unknown as { name: string } | null)?.name ?? 'A brand', owed, invoiced, due: c.pay_due as string | null, late, live: c.stage === 'live' || c.stage === 'wrapped' };
    })
    .filter((p) => p.owed > 0 && (p.invoiced || p.live))
    .sort((a, b) => b.late - a.late || b.owed - a.owed);

  if (!pending.length) return { skipped: 'nothing pending' };

  const total = pending.reduce((a, p) => a + p.owed, 0);
  const lateN = pending.filter((p) => p.late > 0).length;
  const notSent = pending.filter((p) => !p.invoiced).length;
  const line = (p: (typeof pending)[number]) =>
    `${p.brand} ${rupees(p.owed)} · ${!p.invoiced ? 'invoice not sent' : p.late > 0 ? `${p.late} day${p.late === 1 ? '' : 's'} late` : p.due ? `due ${p.late === 0 ? 'today' : shortDate(p.due)}` : 'invoiced'}`;
  const body = [...pending.slice(0, 3).map(line), pending.length > 3 ? `+ ${pending.length - 3} more` : ''].filter(Boolean).join('\n');
  const title = `${rupees(total)} still to come in${lateN ? ` · ${lateN} late` : notSent ? ` · ${notSent} to invoice` : ''}`;

  const msg = {
    title,
    body,
    url: '/studio/payments',
    // One at a time: a newer reminder replaces the last one on her phone.
    tag: 'pending-payments',
    actions: [
      { action: 'remind', title: 'Remind brands', url: '/studio/payments?act=remind' },
      { action: 'open', title: 'See payments', url: '/studio/payments' }
    ]
  };
  if (dry) return { dry: true, hour, msg, pending: pending.length };
  const res = await pushToCreator(db, s.id, msg);
  return { ...res, pending: pending.length, total };
}
