// Razorpay, for Miracle's own plans (never for money between brands and creators).
// Keys come from the server's secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET.

export const razorpayReady = () => !!Deno.env.get('RAZORPAY_KEY_ID') && !!Deno.env.get('RAZORPAY_KEY_SECRET');
export const razorpayKeyId = () => Deno.env.get('RAZORPAY_KEY_ID') ?? '';

/** A call to Razorpay's API with the account's keys; throws with Razorpay's own message on an error. */
export async function rzp<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const auth = btoa(`${Deno.env.get('RAZORPAY_KEY_ID')}:${Deno.env.get('RAZORPAY_KEY_SECRET')}`);
  const r = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String((j as { error?: { description?: string } }).error?.description ?? `Razorpay said ${r.status}`));
  return j as T;
}

/** HMAC-SHA256 in hex, as Razorpay signs checkouts and webhooks. */
export async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares two signatures without leaking how much matched. */
export function sameSig(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export type RzpSubscription = { id: string; status: string; current_end: number | null; plan_id: string; notes?: Record<string, string>; short_url?: string };
