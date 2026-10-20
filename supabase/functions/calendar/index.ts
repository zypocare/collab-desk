// Private calendar feed (.ics) with every draft, go-live, follow-up, product and payment date.
// Subscribe once in Google Calendar or the iPhone Calendar; it refreshes by itself.
// URL: /functions/v1/calendar?token=<creator_settings.calendar_token>
import { admin, inr } from '../_shared/admin.ts';

type Row = {
  id: string; code: string; stage: string; type: string; fee: number; pay_received: number; pay_status: string;
  product_date: string | null; shoot_date: string | null; draft_date: string | null; live_date: string | null; pay_due: string | null;
  follow_date: string | null; follow_note: string; resume_on: string | null; brand: { name: string };
  deliverables: { kind: string; qty: number; items: { id: string; position: number; status: string; due_date: string | null; assigned_to: string }[] }[];
};

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const day = (d: string) => d.replaceAll('-', '');
const nextDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10).replaceAll('-', '');
// Lines longer than 75 characters must be folded.
const fold = (line: string) => line.match(/.{1,73}/g)!.join('\r\n ');

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const db = admin();
  const { data: s } = await db.from('creator_settings').select('calendar_token, display_name, app_name, site_url').eq('id', 1).single();
  if (!s || !token || token !== s.calendar_token) return new Response('Not found', { status: 404 });

  const data: Row[] = [];
  for (;;) {
    const { data: page, error } = await db.from('collabs')
      .select('id, code, stage, type, fee, pay_received, pay_status, product_date, shoot_date, draft_date, live_date, pay_due, follow_date, follow_note, resume_on, brand:brands(name), deliverables(kind, qty, items:deliverable_items(id, position, status, due_date, assigned_to))')
      .not('stage', 'in', '(declined,cancelled)').order('id').range(data.length, data.length + 199);
    if (error) return new Response('Calendar could not be refreshed. Please try again.', { status: 503 });
    if (!page?.length) break;
    data.push(...page as unknown as Row[]);
  }

  const site = String(s.site_url).replace(/\/$/, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const events: string[] = [];
  const add = (uid: string, date: string, summary: string, desc: string, code: string) => {
    events.push(
      ['BEGIN:VEVENT', `UID:${uid}@collab-desk`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${nextDay(date)}`,
        `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(desc)}`, `URL:${site}/studio/collabs?open=${code}`, 'TRANSP:TRANSPARENT', 'END:VEVENT']
        .map(fold).join('\r\n'),
    );
  };

  for (const c of (data ?? []) as unknown as Row[]) {
    const b = c.brand?.name ?? 'Brand';
    const what = c.deliverables.map((d) => `${d.qty} × ${d.kind}`).join(', ');
    if (c.stage === 'paused') {
      if (c.resume_on) add(`${c.id}-review`, c.resume_on, `${b}: review paused collaboration`, what, c.code);
      continue;
    }
    const pieces = c.deliverables.flatMap((d) => (d.items ?? []).filter((x) => x.due_date && !['published', 'delivered'].includes(x.status)).map((x) => ({ ...x, kind: d.kind })));
    for (const item of pieces) add(`${item.id}-deliverable`, item.due_date!, `${b}: ${item.kind} ${item.position} due`, item.assigned_to ? `Assigned to ${item.assigned_to}` : what, c.code);
    const active = !['wrapped'].includes(c.stage);
    if (c.product_date && ['confirmed', 'creating'].includes(c.stage)) add(`${c.id}-product`, c.product_date, `📦 ${b}: product arrives`, what, c.code);
    if (c.shoot_date && ['confirmed', 'creating'].includes(c.stage)) add(`${c.id}-shoot`, c.shoot_date, `🎬 ${b}: shoot day`, what, c.code);
    if (!pieces.length && c.draft_date && ['confirmed', 'creating'].includes(c.stage)) add(`${c.id}-draft`, c.draft_date, `✏️ ${b}: draft due`, what, c.code);
    if (c.live_date && !['request', 'negotiating'].includes(c.stage)) add(`${c.id}-live`, c.live_date, `✨ ${b}: goes live`, what, c.code);
    if (c.follow_date && active) add(`${c.id}-follow`, c.follow_date, `🔔 ${b}: follow up`, c.follow_note, c.code);
    if (c.pay_due && c.type !== 'barter' && ['invoiced', 'advance'].includes(c.pay_status))
      add(`${c.id}-pay`, c.pay_due, `₹ ${b}: payment due`, `${inr(c.fee - c.pay_received)} due`, c.code);
  }

  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Collab Desk//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${icsText(`${s.app_name} · ${s.display_name}`)}`), 'X-WR-TIMEZONE:Asia/Kolkata',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...events, 'END:VCALENDAR',
  ].join('\r\n') + '\r\n';

  return new Response(body, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="collabs.ics"', 'Cache-Control': 'no-store' },
  });
});
