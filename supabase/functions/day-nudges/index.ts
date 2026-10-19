// Fun nudges through the day. Runs every hour on the hour (India time) from the database cron job.
// From 11 AM to 11 PM to start: work lines built on her real day, water and food in between, yoga at
// 6 PM and a wind-down at the end. The free AI writes each one fresh (shown the recent ones so it
// doesn't echo them); near-copies are dropped and written again; if the day's free AI is used up,
// a hand-written line that has never been sent goes instead. Every line sent is kept, so none repeats.
//   ?dry=1         work out and show the message, send nothing
//   ?hour=13       pretend it's this hour (India time)
//   ?site=<url>    where the AI lives (local testing)
import { admin, cronAllowed, daysBetween, todayIST } from '../_shared/admin.ts';
import { pushToCreator } from '../_shared/push.ts';
import { LINES, PARTS, WORK, type Line } from '../_shared/funLines.ts';

type Kind = 'work' | 'water' | 'food' | 'yoga' | 'night';
type Fact = { topic: string; text: string; url: string; prio: number; vars: Record<string, string> };

// The day: work and wellbeing take turns; yoga at her yoga hour; wind down at 11 PM.
const PLAN: Record<number, Kind> = { 11: 'work', 12: 'water', 13: 'food', 14: 'work', 15: 'water', 16: 'work', 17: 'food', 18: 'yoga', 19: 'work', 20: 'water', 21: 'food', 22: 'work', 23: 'night' };
const meal = (h: number) => (h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'evening chai and a snack' : 'dinner');
const rupees = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (t: string) => new Set(norm(t).split(' ').filter((w) => w.length > 2));
function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / (a.size + b.size - n);
}
/** Too close to something already sent: same title, same opening, or mostly the same words. */
function tooClose(l: Line, past: Line[]) {
  const t = norm(l.title), open = t.split(' ').slice(0, 3).join(' '), w = words(l.title + ' ' + l.body);
  return past.some((p, i) => {
    const pt = norm(p.title);
    return pt === t || (i < 60 && open.length > 6 && pt.startsWith(open)) || overlap(w, words(p.title + ' ' + p.body)) >= 0.45;
  });
}
const fill = (s: string, v: Record<string, string>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '').replace(/\(s\)/g, v.n === '1' ? '' : 's').replace(/^\w/, (c) => c.toUpperCase());

Deno.serve(async (req) => {
  if (!cronAllowed(req)) return new Response('Forbidden', { status: 403 });
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const db = admin();

  const { data: s } = await db
    .from('creator_settings')
    .select('fun_nudges, fun_from, fun_to, fun_yoga_hour, fun_food, alert_name, display_name, site_url, pay_alerts, pay_alert_hours, away_until, away_weeks, monthly_goal')
    .eq('id', 1)
    .single();
  if (!s?.fun_nudges && !dry) return Response.json({ skipped: 'turned off' });
  // A minute's grace either side of the hour.
  const now = new Date(Date.now() + 5.5 * 3600e3 + 5 * 60e3);
  const hour = url.searchParams.has('hour') ? Number(url.searchParams.get('hour')) : now.getUTCHours();
  const from = s?.fun_from ?? 11, to = s?.fun_to ?? 23, yoga = s?.fun_yoga_hour ?? 18;
  if (hour < from || hour > to) return Response.json({ skipped: `outside her hours (${hour}:00)` });

  let kind: Kind = hour === yoga ? 'yoga' : PLAN[hour] ?? 'work';
  if (kind === 'yoga' && hour !== yoga) kind = 'work';
  if ((kind === 'food' || kind === 'water') && s?.fun_food === false) return Response.json({ skipped: 'food and water reminders are off' });

  const today = todayIST(), tomorrow = todayIST(1);
  const monday = (() => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const away = (!!s?.away_until && s.away_until >= today) || ((s?.away_weeks as string[] | null) ?? []).includes(monday);
  const payHour = !!s?.pay_alerts && ((s?.pay_alert_hours as number[] | null) ?? []).includes(hour);
  if (kind === 'work' && away) return Response.json({ skipped: 'she is away: no work nudges' });
  if (kind === 'work' && payHour) return Response.json({ skipped: 'payment reminder goes out this hour' });

  // What has gone out before (newest first), and which work topics already went today.
  const { data: sent } = await db.from('fun_nudges_sent').select('kind, topic, title, body, sent_at').order('sent_at', { ascending: false }).limit(300);
  const past: Line[] = (sent ?? []).map((r) => ({ title: r.title, body: r.body }));
  const startOfDay = new Date(Date.parse(today + 'T00:00:00+05:30')).toISOString();
  const usedToday = new Set((sent ?? []).filter((r) => r.sent_at >= startOfDay && r.kind === 'work').map((r) => r.topic));

  // Her day, in facts the line can stand on.
  let fact: Fact | null = null;
  if (kind === 'work' || kind === 'night') {
    const facts = await herDay(db, today, tomorrow, Number(s?.monthly_goal) || 0);
    if (kind === 'night') fact = facts.find((f) => f.topic.endsWith('_tomorrow')) ?? null;
    else fact = facts.find((f) => !usedToday.has(f.topic)) ?? facts[0] ?? null;
  }

  const name = String(s?.alert_name || String(s?.display_name ?? '').split(' ')[0] || '').trim();
  const when = `${new Date(today + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' })}, ${hourLabel(hour)}`;
  const vars = { meal: meal(hour), ...(fact?.vars ?? {}) };

  // 1. The free AI writes it (three goes at a fresh one).
  let line: Line | null = null, source = 'ai';
  const site = String(url.searchParams.get('site') || s?.site_url || 'https://collab-desk.zypocare.workers.dev').replace(/\/$/, '');
  for (let attempt = 0; attempt < 3 && !line; attempt++) {
    const l = await aiLine(db, site, { kind, meal: kind === 'food' ? meal(hour) : '', name, when, fact: fact?.text ?? 'none', attempt, recent: past.slice(0, 40).map((p) => `${p.title} — ${p.body}`) });
    if (!l) break;
    if (!tooClose(l, past)) line = l;
  }
  // 2. A hand-written one that has never gone out.
  if (!line) {
    source = 'lib';
    line = pickWritten(kind, fact, vars, past);
  }
  if (!line) return Response.json({ skipped: 'nothing new to say' });

  const msg = { title: line.title, body: line.body, url: kind === 'work' ? fact?.url ?? '/studio' : kind === 'night' ? '/studio/calendar' : '/studio', tag: 'day-nudge', plain: true };
  if (dry) return Response.json({ dry: true, hour, kind, fact, source, msg });
  const res = await pushToCreator(db, msg);
  await db.from('fun_nudges_sent').insert({ kind, topic: fact?.topic ?? kind, title: line.title, body: line.body, source, norm: norm(line.title + ' ' + line.body) });
  return Response.json({ ...res, hour, kind, source, title: line.title });
});

/** The free AI, through a single-use pass the database checks (no keys leave the server). */
async function aiLine(db: ReturnType<typeof admin>, site: string, payload: Record<string, unknown>): Promise<Line | null> {
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await db.from('ai_tickets').insert({ token: ticket, kind: 'cheer' });
  if (error) return null;
  const r = await fetch(`${site}/api/ai/cheer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
    body: JSON.stringify(payload)
  }).catch(() => null);
  const j = (await r?.json().catch(() => null)) as { title?: string; body?: string } | null;
  const title = String(j?.title ?? '').trim(), body = String(j?.body ?? '').trim();
  return title && body && title.length <= 60 && body.length <= 180 ? { title, body } : null;
}

/** A hand-written line never sent before; when the list runs out, a new pairing of opener and closer. */
function pickWritten(kind: Kind, fact: Fact | null, vars: Record<string, string>, past: Line[]): Line | null {
  const pool = kind === 'work' ? WORK[fact?.topic ?? 'clear'] ?? WORK.clear : LINES[kind] ?? [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5).map((l) => ({ title: fill(l.title, vars), body: fill(l.body, vars) }));
  const fresh = shuffled.find((l) => !tooSame(l, past));
  if (fresh) return fresh;
  const parts = PARTS[kind];
  const v = { ...vars, fact: fact?.text ?? '' };
  for (const o of [...parts.open].sort(() => Math.random() - 0.5))
    for (const c of [...parts.close].sort(() => Math.random() - 0.5)) {
      const l = { title: fill(o, v), body: fill(c, v) };
      if (!tooSame(l, past)) return l;
    }
  return null;
}
// For the written lines only the exact words matter (they were written to be different).
const tooSame = (l: Line, past: Line[]) => past.some((p) => norm(p.title + ' ' + p.body) === norm(l.title + ' ' + l.body));

/** Her day from her collabs: most urgent first. */
async function herDay(db: ReturnType<typeof admin>, today: string, tomorrow: string, goal: number): Promise<Fact[]> {
  const { data: rows } = await db
    .from('collabs')
    .select('id, code, stage, type, fee, pay_received, pay_status, pay_due, draft_date, shoot_date, live_date, product_date, follow_date, paid_on, brand:brands(name)')
    .neq('stage', 'declined');
  const cs = (rows ?? []).map((c) => ({ ...c, b: (c.brand as unknown as { name: string } | null)?.name ?? 'a brand' }));
  const open = cs.filter((c) => c.stage !== 'wrapped');
  const facts: Fact[] = [];
  const at = (field: 'draft_date' | 'shoot_date' | 'live_date' | 'product_date', day: string) => open.find((c) => c[field] === day);

  const d0 = at('draft_date', today);
  if (d0) facts.push({ topic: 'draft_today', prio: 100, text: `The draft for ${d0.b} is due today`, url: `/studio/c/${d0.code}`, vars: { brand: d0.b } });
  const s0 = at('shoot_date', today);
  if (s0) facts.push({ topic: 'shoot_today', prio: 96, text: `Shoot for ${s0.b} is today`, url: `/studio/c/${s0.code}`, vars: { brand: s0.b } });
  const l0 = at('live_date', today);
  if (l0) facts.push({ topic: 'live_today', prio: 95, text: `${l0.b}'s content goes live today`, url: `/studio/c/${l0.code}`, vars: { brand: l0.b } });

  // Brands whose last message is theirs (in the last two weeks): waiting for her reply.
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const { data: msgs } = await db.from('collab_messages').select('collab_id, sender, created_at').gte('created_at', since).order('created_at', { ascending: false }).limit(500);
  const last = new Map<string, string>();
  for (const m of msgs ?? []) if (!last.has(m.collab_id)) last.set(m.collab_id, m.sender);
  const waiting = open.filter((c) => last.get(c.id) === 'brand');
  if (waiting.length) facts.push({ topic: 'reply', prio: 90, text: `${waiting.length} brand${waiting.length === 1 ? ' is' : 's are'} waiting for her reply, starting with ${waiting[0].b}`, url: '/studio/inbox', vars: { brand: waiting[0].b, n: String(waiting.length) } });

  const reqs = open.filter((c) => c.stage === 'request');
  if (reqs.length) facts.push({ topic: 'request', prio: 80, text: `${reqs.length} new collab request${reqs.length === 1 ? '' : 's'} to look at, one from ${reqs[0].b}`, url: '/studio/collabs', vars: { brand: reqs[0].b, n: String(reqs.length) } });

  const owed = (c: (typeof cs)[number]) => Math.max(0, (Number(c.fee) || 0) - (Number(c.pay_received) || 0));
  const late = cs.filter((c) => c.type !== 'barter' && c.pay_status !== 'paid' && (c.pay_status === 'invoiced' || c.pay_status === 'advance') && c.pay_due && daysBetween(c.pay_due, today) > 0 && owed(c) > 0).sort((a, b) => owed(b) - owed(a));
  if (late.length) {
    const total = late.reduce((a, c) => a + owed(c), 0);
    facts.push({ topic: 'late_pay', prio: 75, text: `${rupees(total)} in payments is late, the biggest from ${late[0].b}`, url: '/studio/payments', vars: { brand: late[0].b, amt: rupees(total), n: String(late.length) } });
  }
  const uninvoiced = cs.filter((c) => c.type !== 'barter' && ['live', 'wrapped'].includes(c.stage) && (!c.pay_status || c.pay_status === 'pending') && owed(c) > 0);
  if (uninvoiced.length) facts.push({ topic: 'to_invoice', prio: 70, text: `${uninvoiced.length} finished collab${uninvoiced.length === 1 ? ' is' : 's are'} not invoiced yet, like ${uninvoiced[0].b}`, url: '/studio/payments', vars: { brand: uninvoiced[0].b, n: String(uninvoiced.length) } });

  const d1 = at('draft_date', tomorrow);
  if (d1) facts.push({ topic: 'draft_tomorrow', prio: 68, text: `The draft for ${d1.b} is due tomorrow`, url: `/studio/c/${d1.code}`, vars: { brand: d1.b } });
  const s1 = at('shoot_date', tomorrow);
  if (s1) facts.push({ topic: 'shoot_tomorrow', prio: 64, text: `Shoot for ${s1.b} is tomorrow`, url: `/studio/c/${s1.code}`, vars: { brand: s1.b } });
  const l1 = at('live_date', tomorrow);
  if (l1) facts.push({ topic: 'live_tomorrow', prio: 63, text: `${l1.b}'s content goes live tomorrow`, url: `/studio/c/${l1.code}`, vars: { brand: l1.b } });
  const f0 = open.find((c) => c.follow_date && c.follow_date <= today);
  if (f0) facts.push({ topic: 'follow', prio: 60, text: `A follow-up with ${f0.b} is due`, url: `/studio/c/${f0.code}`, vars: { brand: f0.b } });
  const p0 = at('product_date', today);
  if (p0) facts.push({ topic: 'product', prio: 50, text: `${p0.b}'s product should arrive today`, url: `/studio/c/${p0.code}`, vars: { brand: p0.b } });

  const month = today.slice(0, 7);
  const got = cs.filter((c) => (c.paid_on ?? '').startsWith(month)).reduce((a, c) => a + (Number(c.pay_received) || 0), 0);
  if (got > 0) facts.push({ topic: 'goal', prio: 30, text: goal ? `${rupees(got)} came in this month, ${Math.round((got / goal) * 100)}% of her ${rupees(goal)} goal` : `${rupees(got)} came in this month so far`, url: '/studio/money', vars: { amt: rupees(got), pct: String(goal ? Math.round((got / goal) * 100) : 0), goal: goal ? rupees(goal) : '' } });

  facts.push({ topic: 'clear', prio: 10, text: 'Nothing urgent on her desk: a good time to plan content or pitch a dream brand', url: '/studio/pitches', vars: {} });
  return facts.sort((a, b) => b.prio - a.prio);
}
