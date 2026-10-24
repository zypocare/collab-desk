// Miracle's own plans (migration 154): what this account is on, what it has used, and buying through
// Razorpay. Buying happens on the website and web app only: the store apps show the plan but never a price
// or a buy button (Google's and Apple's rules).
import { isNative } from './native';
import { supabase } from './supabase';
import { errMessage } from './util';

export type PlanInfo = {
	code: string;
	side: 'creator' | 'brand' | 'agency';
	name: string;
	tagline: string;
	rank: number;
	price_month: number;
	price_year: number;
	founding_year: number | null;
	limits: Record<string, number>;
	features: string[];
};
/** One account's plan: a creator's studio, a brand team, or a login's own Agency plan. */
export type PlanState = {
	kind: 'creator' | 'workspace' | 'agency';
	subject: string;
	plan: string | null;
	name: string | null;
	rank: number | null;
	limits: Record<string, number> | null;
	features: string[] | null;
	period: 'trial' | 'month' | 'year' | 'comp' | null;
	status: string | null;
	ends_at: string | null;
	cancel_at_end: boolean;
	founding: boolean;
	via_agency: boolean;
	days_left: number | null;
	can_buy: boolean;
};
export type MyPlan = PlanState & {
	usage: Record<string, number>;
	catalog: PlanInfo[];
	offer: { on: boolean; left: number };
	agency: PlanState;
	payments: { id: string; amount: number; gst: number; invoice_no: string; paid_at: string; plan: string; period: string }[];
};

export const plan = $state<{ data: MyPlan | null; loaded: boolean }>({ data: null, loaded: false });

/** Store apps can't sell: no prices, no buy buttons there. */
export const canSell = () => !isNative();

export async function loadPlan() {
	const { data, error } = await supabase.rpc('my_plan');
	if (error) throw new Error(errMessage(error));
	plan.data = data as MyPlan;
	plan.loaded = true;
	return plan.data;
}

/** An error from a free plan's limit: "Miracle Pro: …" or "Miracle Agency: …" (screens may put
 * "Couldn't save: " in front). */
export const upgradeNeeded = (msg: string) => /Miracle (Pro|Agency): /.test(msg);
export const upgradeText = (msg: string) => msg.replace(/^.*?Miracle (Pro|Agency): /, '');

let rzpScript: Promise<void> | null = null;
function loadRazorpay() {
	rzpScript ??= new Promise<void>((ok, fail) => {
		const s = document.createElement('script');
		s.src = 'https://checkout.razorpay.com/v1/checkout.js';
		s.onload = () => ok();
		s.onerror = () => ((rzpScript = null), fail(new Error("Couldn't load the payment window. Check your connection and try again.")));
		document.head.appendChild(s);
	});
	return rzpScript;
}

async function billing<T>(body: Record<string, unknown>): Promise<T> {
	const { data, error } = await supabase.functions.invoke('billing', { body });
	if (error) {
		const ctx = (error as { context?: Response }).context;
		const j = ctx ? await ctx.json().catch(() => null) : null;
		throw new Error((j as { error?: string } | null)?.error ?? errMessage(error));
	}
	if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
	return data as T;
}

type Checkout = { key: string; subscription_id: string; name: string; amount: number; period: string; email: string; name_on: string };
type RzpWindow = Window & { Razorpay?: new (o: Record<string, unknown>) => { open(): void; on(e: string, f: (r: unknown) => void): void } };

/** Buy a plan: Razorpay's checkout opens; true once the payment is confirmed and the plan is on, false if closed. */
export async function buy(code: string, period: 'month' | 'year', agency = false): Promise<boolean> {
	if (!canSell()) throw new Error('Plans are bought on the Miracle website.');
	const [, co] = await Promise.all([loadRazorpay(), billing<Checkout>({ action: 'checkout', plan: code, period, agency })]);
	const Rzp = (window as RzpWindow).Razorpay;
	if (!Rzp) throw new Error("Couldn't load the payment window. Try again.");
	return new Promise<boolean>((resolve, reject) => {
		const r = new Rzp({
			key: co.key,
			subscription_id: co.subscription_id,
			name: 'Miracle',
			description: `${co.name}, ${co.period === 'year' ? 'yearly' : 'monthly'} (GST included)`,
			prefill: { email: co.email, name: co.name_on },
			theme: { color: '#e5487f' },
			handler: async (resp: Record<string, string>) => {
				try {
					await billing({ action: 'verify', ...resp });
					await loadPlan();
					resolve(true);
				} catch (e) {
					reject(e);
				}
			},
			modal: { ondismiss: () => resolve(false) }
		});
		r.on('payment.failed', (resp: unknown) => reject(new Error(String((resp as { error?: { description?: string } })?.error?.description ?? 'The payment didn’t go through.'))));
		r.open();
	});
}

/** Stop renewing: the plan lasts to the end of what's paid. */
export async function stopRenewal(agency = false) {
	await billing({ action: 'cancel', agency });
	await loadPlan();
}
