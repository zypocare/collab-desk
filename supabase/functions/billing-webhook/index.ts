// Razorpay's webhook for Miracle's plans: renewals, failed renewals, cancellations and ends, and one-time
// creator unlocks paid by brands (order.paid, in case the buyer closed the tab before the app confirmed it).
// Set it up in Razorpay (Settings › Webhooks) to this function's address, with the secret in
// RAZORPAY_WEBHOOK_SECRET, for: subscription.activated, subscription.charged, subscription.halted,
// subscription.cancelled, subscription.completed and order.paid.
import { admin } from '../_shared/admin.ts';
import { hmacHex, sameSig } from '../_shared/razorpay.ts';

type Hook = {
  event: string;
  payload?: {
    subscription?: { entity?: { id: string; current_end: number | null; status: string } };
    payment?: { entity?: { id: string; amount: number; status: string; order_id?: string } };
    order?: { entity?: { id: string; amount_paid: number } };
  };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '';
  const raw = await req.text();
  if (!secret || !sameSig(await hmacHex(secret, raw), req.headers.get('x-razorpay-signature') ?? '')) return new Response('bad signature', { status: 401 });
  const hook = JSON.parse(raw) as Hook;
  if (hook.event === 'order.paid') {
    const pay = hook.payload?.payment?.entity, order = hook.payload?.order?.entity;
    if (!pay?.id || !order?.id) return Response.json({ ignored: hook.event });
    const { data, error } = await admin().rpc('unlock_paid', { p: { order_id: order.id, payment_id: pay.id, amount: pay.amount } });
    if (error) return new Response(error.message, { status: 500 });
    return Response.json(data);
  }
  const sub = hook.payload?.subscription?.entity;
  if (!sub?.id || !hook.event.startsWith('subscription.')) return Response.json({ ignored: hook.event });
  const pay = hook.payload?.payment?.entity;
  const { data, error } = await admin().rpc('billing_event', {
    p: { event: hook.event, subscription_id: sub.id, current_end: sub.current_end, payment_id: pay && pay.status === 'captured' ? pay.id : null, amount: pay?.amount ?? 0 },
  });
  // Razorpay retries anything that isn't a 2xx, so an unknown subscription (made elsewhere) is just noted.
  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data);
});
