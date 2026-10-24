// The pricing page and the refund and cancellation policy. Prices match billing_plans in the database
// (supabase/migrations/20261024000154_billing.sql); change both together.
import { APP, esc, JOIN, JOIN_BRAND, md, page } from './layout.mjs';

export const PLANS = [
	{
		who: 'For creators',
		free: { name: 'Free', price: '₹0', perks: ['Your brand page brands book you from', 'Requests, collab board and calendar', 'Listed in the creator directory', '3 quotes, 3 invoices and 5 pitches a month', 'A little AI every day'] },
		paid: {
			name: 'Creator Pro',
			month: 299,
			year: 2999,
			founding: 1499,
			perks: ['Every autopilot: invoices, dates, tracking links, nudges, counters', 'Pitch autopilot: new brands found and pitched for you', 'Unlimited quotes, invoices and pitches', 'Payment reminders and bank-credit matching', 'A live insights page to send brands', 'Your team: manager, assistant, accountant', '6× the daily AI'],
			join: JOIN
		}
	},
	{
		who: 'For brands',
		free: { name: 'Free', price: '₹0', perks: ['Find creators with real audience health', '3 requests and 1 campaign a month', 'Briefs, drafts, approvals and reports', 'Pay creators directly, no commission', 'A little AI every day'] },
		paid: {
			name: 'Brand Pro',
			month: 1999,
			year: 19999,
			founding: 9999,
			perks: ['Unlimited requests and campaigns', 'Open briefs that creators apply to', 'Brand autopilots and competitor watch', 'Sales tracking from your store', 'Turnaround owners, targets and escalation', 'A team of 5 with approvals', '3× the daily AI'],
			join: JOIN_BRAND
		}
	}
];
export const AGENCY = { name: 'Agency', month: 4999, year: 49999, founding: 24999, perks: ['Pro for every creator you manage', 'Pro for your own brand team', 'Switch between client workspaces', 'Roster, commission ledger and pitch decks', '15 seats'] };

const rs = (n) => '₹' + n.toLocaleString('en-IN');
const perks = (list) => `<ul class="ticks">${list.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
const paidCard = (p, join, label = 'Start the 14-day trial') => `
<div class="card plan hot">
  <h3>${esc(p.name)}</h3>
  <p class="price"><b>${rs(p.month)}</b><small>/month</small></p>
  <p class="alt">or ${rs(p.year)}/year (2 months free) · <b>founding members ${rs(p.founding)}/year</b></p>
  ${perks(p.perks)}
  <a class="btn grad" href="${join}">${label}</a>
</div>`;

export const PRICING_FAQ = [
	['Is there a commission on deals?', 'No, never. Brands pay creators directly by UPI or bank transfer, and Miracle takes nothing from any deal on any plan. Plans pay for the tools, not for the deals.'],
	['How does the free trial work?', 'Every new creator and brand gets 14 days of Pro, with no card needed. When it ends you stay on the free plan unless you pick a paid one; nothing you made is deleted.'],
	['How do I pay?', 'On the website or the web app, through Razorpay: UPI AutoPay, cards or net banking. Plans renew by themselves and you can stop renewal any time. Plans aren’t sold inside the Play Store or iPhone apps; once you’ve paid, they unlock there too.'],
	['Is GST included?', 'Yes. Prices include 18% GST, and every payment comes with a GST invoice from Zyposoft Technologies Private Limited.'],
	['What is the founding member price?', 'The first 100 people to buy a yearly plan pay half, and keep that price for as long as their plan keeps renewing.'],
	['Can I get a refund?', 'Yes, within 7 days of your first payment for a plan, if it isn’t for you. See the [refund and cancellation policy](/refund-policy).'],
	['I manage several creators or clients. Which plan?', 'The Agency plan: Pro for every creator you manage and for your own brand team, client workspaces you switch between, a roster with your commission ledger, and 15 seats.']
];

export function pricingPage() {
	const body = `
<section class="hero wrap">
  <span class="eb">Pricing</span>
  <h1>Start free. <em>Go Pro when the deals come.</em></h1>
  <p class="lede">Every plan keeps your deals commission-free: brands pay creators directly. Pro puts the autopilots to work, so the follow-ups, invoices and pitches happen without you. 14 days of Pro free for everyone, no card needed.</p>
</section>
${PLANS.map((s) => `
<section class="sec wrap">
  <h2>${esc(s.who)}</h2>
  <div class="grid2 plans">
    <div class="card plan">
      <h3>${esc(s.free.name)}</h3>
      <p class="price"><b>${s.free.price}</b><small>/forever</small></p>
      <p class="alt">No card. No time limit.</p>
      ${perks(s.free.perks)}
      <a class="btn ghost" href="${s.paid.join}">Join free</a>
    </div>
    ${paidCard(s.paid, s.paid.join)}
  </div>
</section>`).join('')}
<section class="sec wrap">
  <h2>For agencies</h2>
  <div class="grid2 plans">${paidCard(AGENCY, JOIN_BRAND, 'Talk to us or start free')}
    <div class="card"><h3>Running creators and brands together?</h3><p>Agency covers every creator you manage on Pro, your own brand team, and the client teams you work in, with one sign-in. Write to <a href="mailto:support@miracleapp.live">support@miracleapp.live</a> for a walkthrough.</p></div>
  </div>
</section>
<section class="sec wrap"><h2>Questions</h2><div class="faq">${PRICING_FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${md(a)}</p></details>`).join('')}</div></section>
<section class="sec wrap"><p class="small">Prices in Indian rupees, including 18% GST. Sold by Zyposoft Technologies Private Limited, #7, Nisarga Layout, Chikkalsandra, Bangalore 560061, India. Questions: <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>. See the <a href="/terms#price">terms</a> and the <a href="/refund-policy">refund and cancellation policy</a>.</p></section>`;
	return page({
		path: '/pricing',
		title: 'Pricing · Miracle: free for creators and brands, Pro from ₹299',
		description: 'Free plan for creators and brands, Creator Pro ₹299/month, Brand Pro ₹1,999/month, Agency ₹4,999/month. 14-day free trial, no commission on any deal.',
		body,
		ld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: PRICING_FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') } })) }],
		crumbs: [{ name: 'Pricing', path: '/pricing' }]
	});
}

export function refundPage() {
	const body = `
<article class="hero wrap prose">
  <span class="eb">Policy</span>
  <h1>Refunds and <em>cancellation</em></h1>
  <p class="lede">For Miracle's own plans (Creator Pro, Brand Pro and Agency). Money between brands and creators never passes through Miracle, so this policy doesn't cover deals.</p>
  <h2>Cancelling</h2>
  <p>You can stop your plan renewing at any time in the app: Settings › Plan &amp; billing › Stop renewing. Your plan stays on until the end of the period you've paid for, then your account moves to the free plan. Nothing you made is deleted.</p>
  <h2>Refunds</h2>
  <ul>
    <li><b>First payment, 7 days:</b> if a plan isn't for you, write to us within 7 days of your first payment for it and we refund it in full.</li>
    <li><b>Renewals:</b> a renewal isn't refunded once it's charged; stop renewal before the date to avoid the next charge. We remind you before a yearly plan or a trial ends.</li>
    <li><b>Charged by mistake:</b> a double charge, or a charge after you stopped renewal, is always refunded in full.</li>
  </ul>
  <p>Refunds go back to the way you paid, through Razorpay, usually within 5 to 7 working days of our approval.</p>
  <h2>How to ask</h2>
  <p>Email <a href="mailto:support@miracleapp.live">support@miracleapp.live</a> from the address on your account with your invoice number (it's in your receipt email and in Plan &amp; billing), or raise a ticket in the app under Help. We reply within 2 working days.</p>
  <h2>Who we are</h2>
  <p>Zyposoft Technologies Private Limited, #7, Nisarga Layout, Chikkalsandra, Bangalore 560061, India. Payments are processed by Razorpay; we never see or store your card or bank details.</p>
  <p class="small">Last updated 24 October 2026.</p>
</article>`;
	return page({ path: '/refund-policy', title: 'Refund and cancellation policy · Miracle', description: 'Cancel any time; full refund within 7 days of your first payment for a Miracle plan.', body, crumbs: [{ name: 'Refund and cancellation policy', path: '/refund-policy' }] });
}
