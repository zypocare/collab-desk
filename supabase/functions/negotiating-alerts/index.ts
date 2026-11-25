// A daily 12:00 PM IST phone notification reminding creators to follow up on collabs currently in
// the "negotiating" stage (excluding "someday" collabs). Runs from pg_cron ('30 6 * * *' UTC = 12:00 IST)
// and sends only when at least one active collab is in talks.
import { admin, cronAllowed, daysBetween, todayIST } from '../_shared/admin.ts';
import { pushToCreator } from '../_shared/push.ts';
import { activeCreators, type Settings } from '../_shared/creators.ts';

const rupees = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

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
      console.error(`[negotiating-alerts] creator ${s.id}:`, e);
      results.push({ creator: s.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return Response.json({ creators: results });
});

async function alertFor(db: ReturnType<typeof admin>, s: Settings, dry: boolean): Promise<Record<string, unknown>> {
  const { data: rows, error } = await db
    .from('collabs')
    .select('code, type, fee, received_on, follow_date, someday, brand:brands(name)')
    .eq('creator_id', s.id)
    .eq('stage', 'negotiating')
    .eq('someday', false);
  if (error) throw new Error(error.message);

  const today = todayIST();
  const list = (rows ?? [])
    .map((c) => {
      const brand = (c.brand as unknown as { name: string } | null)?.name ?? 'A brand';
      const cash = c.type === 'barter' ? 0 : Math.max(0, Number(c.fee) || 0);
      const waitDays = c.received_on ? Math.max(0, daysBetween(String(c.received_on), today)) : 0;
      const followDue = Boolean(c.follow_date && String(c.follow_date) <= today);
      return { code: String(c.code), brand, type: String(c.type), cash, waitDays, followDue };
    })
    .sort((a, b) => Number(b.followDue) - Number(a.followDue) || b.waitDays - a.waitDays || b.cash - a.cash);

  if (!list.length) return { skipped: 'none negotiating' };

  const totalCash = list.reduce((sum, x) => sum + x.cash, 0);
  const count = list.length;
  const title =
    totalCash > 0
      ? `${count} collab${count === 1 ? '' : 's'} in talks (${rupees(totalCash)}) · follow up`
      : `${count} collab${count === 1 ? '' : 's'} in talks · time to follow up`;

  const line = (x: (typeof list)[number]) => {
    const val = x.cash > 0 ? rupees(x.cash) : x.type === 'barter' ? 'Barter' : '';
    const timing = x.followDue ? 'follow-up due' : x.waitDays > 0 ? `in talks ${x.waitDays}d` : 'in talks today';
    return [x.brand, val, timing].filter(Boolean).join(' · ');
  };

  const body = [...list.slice(0, 3).map(line), count > 3 ? `+ ${count - 3} more` : ''].filter(Boolean).join('\n');
  const targetUrl = count === 1 ? `/studio/c/${list[0].code}` : '/studio/collabs';

  const msg = {
    title,
    body,
    url: targetUrl,
    // Replaces yesterday's negotiating reminder cleanly on the phone.
    tag: 'negotiating-followups',
    kind: 'negotiating_followup',
    actions: [{ action: 'open', title: 'Follow up now', url: targetUrl }]
  };

  if (dry) return { dry: true, count, totalCash, msg };
  const res = await pushToCreator(db, s.id, msg);
  return { ...res, count, totalCash };
}
