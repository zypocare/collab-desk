// 9 AM summary for the creator: what needs her today, by email and Telegram.
// Called by the database cron job (see migration ..._brand_actions.sql) with the shared secret.
import { admin, cronAllowed, daysBetween, esc, inr, todayIST } from '../_shared/admin.ts';
import { mailConfigured, sendMail } from '../_shared/mailer.ts';
import { sendTelegram, telegramConfigured } from '../_shared/telegram.ts';

type Row = {
  id: string; code: string; stage: string; type: string; fee: number; pay_received: number; pay_status: string;
  received_on: string; product_date: string | null; draft_date: string | null; live_date: string | null;
  pay_due: string | null; follow_date: string | null; follow_note: string;
  brand: { name: string }; deliverables: { kind: string; qty: number; done: boolean }[];
  quotes: { version: number; status: string }[]; drafts: { round: number; status: string; feedback: string }[];
};

type Item = { group: string; text: string; when: string; urgent: boolean };

Deno.serve(async (req) => {
  if (!cronAllowed(req)) return new Response('Forbidden', { status: 403 });
  const db = admin();
  const force = new URL(req.url).searchParams.get('force') === '1';

  const { data: s, error: se } = await db.from('creator_settings').select('*').eq('id', 1).single();
  if (se) return Response.json({ error: se.message }, { status: 500 });

  const { data, error } = await db
    .from('collabs')
    .select('*, brand:brands(name), deliverables(kind, qty, done), quotes(version, status), drafts(round, status, feedback)')
    .not('stage', 'in', '(wrapped,declined)');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const today = todayIST();
  const rel = (d: string) => daysBetween(today, d);
  const whenText = (n: number) => (n < 0 ? `${-n} day${n < -1 ? 's' : ''} late` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
  const items: Item[] = [];

  for (const c of (data ?? []) as Row[]) {
    const b = c.brand?.name ?? 'A brand';
    const latestQuote = [...(c.quotes ?? [])].sort((x, y) => y.version - x.version)[0];
    const latestDraft = [...(c.drafts ?? [])].sort((x, y) => y.round - x.round)[0];
    const allDone = c.deliverables.length > 0 && c.deliverables.every((d) => d.done);

    if (c.stage === 'request') {
      const ago = -rel(c.received_on);
      items.push({ group: 'Reply', text: `New request from ${b} (${c.code})`, when: ago <= 0 ? 'received today' : `received ${ago} day${ago > 1 ? 's' : ''} ago`, urgent: true });
    }
    if (latestQuote?.status === 'changes') items.push({ group: 'Reply', text: `${b} asked for changes to your quote`, when: 'waiting on you', urgent: true });
    if (latestDraft?.status === 'changes') items.push({ group: 'Create', text: `${b} wants changes on draft ${latestDraft.round}: ${latestDraft.feedback.slice(0, 80)}`, when: 'waiting on you', urgent: true });
    if (c.follow_date && rel(c.follow_date) <= 0) items.push({ group: 'Follow up', text: `${b}: ${c.follow_note || 'follow up'}`, when: whenText(rel(c.follow_date)), urgent: true });
    if (['confirmed', 'creating'].includes(c.stage) && c.draft_date && !allDone && rel(c.draft_date) <= 1)
      items.push({ group: 'Create', text: `Send draft to ${b}`, when: whenText(rel(c.draft_date)), urgent: rel(c.draft_date) <= 0 });
    if (['confirmed', 'creating'].includes(c.stage) && c.live_date && rel(c.live_date) >= 0 && rel(c.live_date) <= 1)
      items.push({ group: 'Post', text: `${b} goes live`, when: whenText(rel(c.live_date)), urgent: rel(c.live_date) === 0 });
    if (c.stage === 'confirmed' && c.product_date && rel(c.product_date) === 0)
      items.push({ group: 'Create', text: `${b} product arrives`, when: 'today', urgent: false });
    if (c.type !== 'barter' && c.pay_status === 'invoiced' && c.pay_due && rel(c.pay_due) < 0)
      items.push({ group: 'Money', text: `${b} payment overdue: ${inr(c.fee - c.pay_received)}`, when: whenText(rel(c.pay_due)), urgent: true });
    if (c.type !== 'barter' && ['invoiced', 'advance'].includes(c.pay_status) && c.pay_due && rel(c.pay_due) === 0)
      items.push({ group: 'Money', text: `${b} payment due: ${inr(c.fee - c.pay_received)}`, when: 'today', urgent: false });
  }

  const result: Record<string, unknown> = { items: items.length };
  if (!items.length && !force) return Response.json({ ...result, skipped: 'nothing to report' });

  const first = String(s.display_name).split(' ')[0];
  const groups = [...new Set(items.map((i) => i.group))];
  const site = String(s.site_url).replace(/\/$/, '');

  // Email
  if (s.digest_enabled && mailConfigured) {
    const listHtml = groups
      .map(
        (g) => `<p style="margin:18px 0 6px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#8c8288;font-weight:700">${esc(g)}</p>` +
          items.filter((i) => i.group === g).map((i) =>
            `<div style="padding:9px 0;border-top:1px solid #eae2e2;font-size:14px">${i.urgent ? '<span style="color:#c2372e">●</span> ' : ''}${esc(i.text)} <span style="color:#8c8288">· ${esc(i.when)}</span></div>`).join(''),
      )
      .join('');
    const html = `<!doctype html><html><body style="margin:0;background:#f7f4f4;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1e171c">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:20px;border:1px solid #eae2e2"><tr><td style="padding:30px 32px">
<div style="height:6px;width:56px;border-radius:6px;background:linear-gradient(115deg,#6b3fd4,#d4296a 52%,#f2994a)"></div>
<h1 style="margin:22px 0 4px;font-size:22px">Good morning, ${esc(first)}</h1>
<p style="margin:0;color:#5a5057;font-size:15px">${items.length ? `${items.length} thing${items.length > 1 ? 's' : ''} for today.` : 'Nothing urgent today.'}</p>
${listHtml}
<p style="margin:24px 0 0"><a href="${esc(site)}/studio" style="display:inline-block;background:#1e171c;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:12px">Open your studio</a></p>
</td></tr></table></td></tr></table></body></html>`;
    const text = items.map((i) => `- ${i.text} (${i.when})`).join('\n');
    try {
      await sendMail({ to: s.creator_email, subject: `Today: ${items.length} thing${items.length === 1 ? '' : 's'} need you`, html, text });
      result.email = 'sent';
    } catch (e) {
      result.email = `failed: ${e instanceof Error ? e.message : e}`;
    }
  }

  // Telegram
  if (telegramConfigured && s.telegram_chat_id) {
    const msg = `<b>Good morning, ${esc(first)}</b>\n${items.length} thing${items.length === 1 ? '' : 's'} for today:\n\n` +
      groups.map((g) => `<b>${esc(g)}</b>\n` + items.filter((i) => i.group === g).map((i) => `${i.urgent ? '🔴' : '•'} ${esc(i.text)} · <i>${esc(i.when)}</i>`).join('\n')).join('\n\n') +
      `\n\n<a href="${esc(site)}/studio">Open your studio</a>`;
    try {
      await sendTelegram(s.telegram_chat_id, msg);
      result.telegram = 'sent';
    } catch (e) {
      result.telegram = `failed: ${e instanceof Error ? e.message : e}`;
    }
  }

  return Response.json(result);
});
