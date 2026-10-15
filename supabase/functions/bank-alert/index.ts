// Receives "money credited" emails from her bank (sent here by the Gmail watcher script) and
// marks the matching invoice as paid. Protected by the private inbox token from creator_settings.
//
// Matching, in order:
//   1. The invoice number appears in the email (UPI note or transfer remarks).
//   2. Exactly one open invoice is waiting for this exact amount (with or without TDS deducted).
//   Otherwise the credit is saved as "unmatched" for her to assign in Payments.
import { admin, esc, inr, todayIST } from '../_shared/admin.ts';
import { sendTelegram, telegramConfigured } from '../_shared/telegram.ts';

type OpenInvoice = {
  id: string; number: string; total: number; payable: number; amount_received: number; tds_amount: number; tds_deducted: number;
  bill_to: { name?: string };
};

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function parseAlert(text: string) {
  const flat = text.replace(/\s+/g, ' ');
  const isCredit = /credit/i.test(flat) && !/\bdebited\b/i.test(flat);
  const amountMatch = flat.match(/(?:INR|Rs\.?|₹)\s?([\d,]+(?:\.\d{1,2})?)/i);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : null;
  const refMatch = flat.match(/(?:UTR|UPI Ref(?:erence)?(?: No\.?)?|Ref(?:erence)? No\.?|RRN)[\s:.#-]*([A-Z0-9]{10,22})/i) ?? flat.match(/\b(\d{12})\b/);
  return { isCredit, amount, ref: refMatch ? refMatch[1] : '', flat };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const db = admin();
  const { data: s } = await db.from('creator_settings').select('inbox_token, creator_email, telegram_chat_id').eq('id', 1).single();
  const token = req.headers.get('x-inbox-token') ?? '';
  if (!s || !token || token !== s.inbox_token) return new Response('Forbidden', { status: 403 });

  const body = await req.json().catch(() => ({}));
  const subject = String(body.subject ?? '');
  const text = `${subject}\n${String(body.body ?? '')}`;
  const { isCredit, amount, ref, flat } = parseAlert(text);
  if (!isCredit || !amount) return Response.json({ skipped: 'not a credit alert' });

  const hashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(body.id ?? '') + '|' + flat));
  const hash = [...new Uint8Array(hashBytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Find the invoice.
  const { data: open } = await db
    .from('invoices')
    .select('id, number, total, payable, amount_received, tds_amount, tds_deducted, bill_to')
    .in('status', ['sent', 'partly_paid']);
  const invoices = (open ?? []) as OpenInvoice[];
  const textNorm = norm(flat);
  let match = invoices.find((i) => i.number && textNorm.includes(norm(i.number)));
  let withTds = false;
  if (!match) {
    const byAmount = invoices.filter((i) => {
      const dueNet = Number(i.payable) - Number(i.amount_received);
      const dueGross = Number(i.total) - Number(i.amount_received);
      return Math.abs(dueNet - amount) <= 1 || Math.abs(dueGross - amount) <= 1;
    });
    if (byAmount.length === 1) match = byAmount[0];
  }
  if (match) {
    const dueNet = Number(match.payable) - Number(match.amount_received);
    withTds = Number(match.tds_amount) > 0 && Math.abs(dueNet - amount) <= 1 && Math.abs(Number(match.total) - Number(match.amount_received) - amount) > 1;
  }

  const excerpt = flat.slice(0, 400);
  const { error: insErr } = await db.from('bank_alerts').insert({
    received_at: body.date ? new Date(body.date).toISOString() : new Date().toISOString(),
    sender: String(body.from ?? '').slice(0, 200), amount, ref, excerpt, hash,
    status: match ? 'matched' : 'unmatched', invoice_id: match?.id ?? null,
  });
  if (insErr) {
    if (insErr.code === '23505') return Response.json({ skipped: 'already processed' });
    return Response.json({ error: insErr.message }, { status: 500 });
  }

  if (match) {
    await db.from('invoices').update({
      amount_received: Number(match.amount_received) + amount,
      tds_deducted: withTds ? match.tds_amount : match.tds_deducted,
      payment_ref: ref,
      paid_on: todayIST(),
    }).eq('id', match.id);
  }

  const brand = match?.bill_to?.name ?? '';
  await db.from('outbox').insert({
    kind: match ? 'bank_matched' : 'bank_unmatched', to_email: s.creator_email,
    payload: { amount, number: match?.number ?? '', brand, excerpt: excerpt.slice(0, 240) },
  });
  if (telegramConfigured && s.telegram_chat_id) {
    const msg = match
      ? `💰 <b>${esc(inr(amount))}</b> received from ${esc(brand)} · ${esc(match.number)} marked paid`
      : `💰 <b>${esc(inr(amount))}</b> credited, but it didn't match an invoice. Open Payments to assign it.`;
    await sendTelegram(s.telegram_chat_id, msg).catch(() => {});
  }

  return Response.json({ amount, ref, matched: match?.number ?? null, tds: withTds });
});
