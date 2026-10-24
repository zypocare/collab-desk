// Buying a Miracle plan through Razorpay, from the website or the web app (never the store apps).
//   { action: 'checkout', plan, period, agency? }  -> a Razorpay subscription to open in Razorpay's checkout
//   { action: 'verify', razorpay_payment_id, razorpay_subscription_id, razorpay_signature } -> the plan, on at once
//   { action: 'cancel', agency? } -> stop renewing; the plan lasts to the end of what's paid
// Who may buy for which account, and the price, come from the database (billing_intent), as the buyer.
import { admin } from '../_shared/admin.ts';
import { reportProblem } from '../_shared/problems.ts';
import { hmacHex, RazorpayError, razorpayKeyId, razorpayReady, rzp, sameSig, type RzpSubscription } from '../_shared/razorpay.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

type Intent = { plan: string; name: string; period: 'month' | 'year'; kind: string; subject: string; amount: number; founding: boolean; gateway_key: string; gateway_plan: string | null; email: string; name_on: string };

/** A database function run as the person calling (their sign-in, and the creator page they're on). */
async function asCaller<T>(req: Request, fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      authorization: req.headers.get('authorization') ?? '',
      apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      'content-type': 'application/json',
      ...(req.headers.get('x-creator') ? { 'x-creator': req.headers.get('x-creator')! } : {}),
    },
    body: JSON.stringify(args),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(String((j as { message?: string } | null)?.message ?? 'Please sign in again.'));
  return j as T;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!(req.headers.get('authorization') ?? '').startsWith('Bearer ')) return reply({ error: 'Please sign in first.' }, 401);
  if (!razorpayReady()) return reply({ error: "Payments aren't switched on yet. Please try again soon." }, 503);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const db = admin();
  try {
    if (body.action === 'checkout') {
      const it = await asCaller<Intent>(req, 'billing_intent', { p_plan: String(body.plan ?? ''), p_period: String(body.period ?? ''), p_agency: body.agency === true });
      // Razorpay needs a plan at this price; make it once and remember its id.
      let planId = it.gateway_plan;
      if (!planId) {
        const made = await rzp<{ id: string }>('/plans', {
          period: it.period === 'year' ? 'yearly' : 'monthly',
          interval: 1,
          item: { name: `Miracle ${it.name}${it.founding ? ' (founding)' : ''}`, amount: it.amount * 100, currency: 'INR', description: `${it.name}, billed ${it.period === 'year' ? 'yearly' : 'monthly'}, GST included` },
          notes: { plan: it.plan, key: it.gateway_key },
        });
        planId = made.id;
        await db.rpc('billing_set_gateway_plan', { p_plan: it.plan, p_key: it.gateway_key, p_id: planId });
      }
      const sub = await rzp<RzpSubscription>('/subscriptions', {
        plan_id: planId,
        total_count: it.period === 'year' ? 10 : 120,
        quantity: 1,
        customer_notify: 1,
        notes: { kind: it.kind, subject: it.subject, plan: it.plan, period: it.period, email: it.email },
      });
      const { error } = await db.rpc('billing_pending', { p: { kind: it.kind, subject: it.subject, plan: it.plan, period: it.period, founding: it.founding, gateway_id: sub.id, email: it.email } });
      if (error) throw new Error(error.message);
      return reply({ key: razorpayKeyId(), subscription_id: sub.id, amount: it.amount, name: it.name, period: it.period, founding: it.founding, email: it.email, name_on: it.name_on });
    }

    if (body.action === 'verify') {
      const pay = String(body.razorpay_payment_id ?? ''), sub = String(body.razorpay_subscription_id ?? ''), sig = String(body.razorpay_signature ?? '');
      if (!pay || !sub || !sameSig(await hmacHex(Deno.env.get('RAZORPAY_KEY_SECRET')!, `${pay}|${sub}`), sig)) return reply({ error: "We couldn't confirm that payment. If money left your account, write to support@miracleapp.live." }, 400);
      // Razorpay's own record of the subscription and the payment (not what the browser said).
      const s = await rzp<RzpSubscription>(`/subscriptions/${encodeURIComponent(sub)}`);
      const p = await rzp<{ id: string; amount: number; status: string }>(`/payments/${encodeURIComponent(pay)}`);
      const { data, error } = await db.rpc('billing_event', { p: { event: 'subscription.charged', subscription_id: s.id, payment_id: p.status === 'captured' || p.status === 'authorized' ? p.id : null, amount: p.amount, current_end: s.current_end } });
      if (error) throw new Error(error.message);
      return reply({ ok: true, result: data });
    }

    if (body.action === 'cancel') {
      const it = await asCaller<{ kind: string; subject: string; can_buy: boolean }>(req, 'my_plan', {});
      const kind = body.agency === true ? 'agency' : it.kind;
      const subject = body.agency === true ? String((it as unknown as { agency?: { subject?: string } }).agency?.subject ?? '') : it.subject;
      if (!it.can_buy && body.agency !== true) return reply({ error: 'Only the account owner can change the plan.' }, 403);
      const { data } = await db.rpc('billing_current', { p_kind: kind, p_subject: subject });
      const cur = data as { gateway_id?: string } | null;
      if (!cur?.gateway_id) return reply({ error: "There's no paid plan to stop." }, 404);
      const s = await rzp<RzpSubscription>(`/subscriptions/${encodeURIComponent(cur.gateway_id)}/cancel`, { cancel_at_cycle_end: 1 });
      await db.rpc('billing_event', { p: { event: 'subscription.cancelled', subscription_id: s.id, current_end: s.current_end } });
      return reply({ ok: true });
    }
    return reply({ error: 'Unknown action.' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Razorpay refusing our own keys or account (not anything the buyer did): tell the buyer plainly, and
    // put the real reason in the admin's problems list.
    if (e instanceof RazorpayError) {
      await reportProblem(db, 'server', `Razorpay: ${msg}`, `billing ${String(body.action ?? '')}`);
      return reply({ error: 'Payments are temporarily unavailable. Please try again in a little while.' }, 503);
    }
    return reply({ error: msg }, 400);
  }
});
