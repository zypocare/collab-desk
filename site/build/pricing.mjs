// The pricing page and the refund and cancellation policy. Prices match billing_plans in the database
// (supabase/migrations/20261024000154_billing.sql, the set in 20261026000161_free_paid_set.sql); change both together.
// Creators are free (20261030000184_creators_free.sql). Creator Pro is only switched off in admin → Plans, so the
// page is built with both creator layouts: "free, everything included" shows by default (and to search engines),
// and a small script swaps in Free + Creator Pro, with the prices from the database, whenever it's on sale again.
import { esc, JOIN, JOIN_BRAND, JOIN_LABEL, md, page, PRELAUNCH } from './layout.mjs';
import { SB_KEY, SB_URL } from './stats.mjs';

// Creators today: everything on the free plan.
const CREATOR_FREE = ['Your brand page brands book you from, and a spot in the creator directory', 'Unlimited collabs, offer checks and pitches', 'Every autopilot, including the pitch autopilot', 'Reminders that go by themselves, and bank-credit matching', 'The formal demand letter and MSME complaint, written for you', 'A live insights page for brands and your fan list', 'One teammate: your manager or assistant', 'No commission on any deal, ever'];

export const PLANS = [
	{
		who: 'For creators',
		free: { name: 'Free', price: '₹0', perks: ['Your brand page brands book you from', 'Requests, collab board and calendar', '5 collabs at a time, unlimited invoices with a UPI QR', 'One-tap payment reminders', '1 offer check a day and 5 pitches a month', 'A little AI every day'] },
		paid: {
			name: 'Creator Pro',
			month: 299,
			year: 2999,
			founding: 1499,
			perks: ['Unlimited collabs, offer checks and pitches', 'Every autopilot, including the pitch autopilot', 'Reminders that go by themselves, and bank-credit matching', 'The formal demand letter and MSME complaint, written for you', 'Invoices and your page without the Miracle line', 'A live insights page to send brands', 'One teammate: your manager or assistant', '6× the daily AI'],
			join: JOIN
		}
	},
	{
		who: 'For brands',
		free: { name: 'Free', price: '₹0', perks: ['Find creators with real audience health', '10 full creator profiles a day', '3 requests and 1 campaign a month', 'Briefs, drafts, approvals and reports', 'Pay creators directly, no commission', 'A little AI every day'] },
		paid: {
			name: 'Brand Pro',
			month: 1999,
			year: 19999,
			founding: 9999,
			perks: ['Every creator profile in full', 'Unlimited requests and campaigns', 'Open briefs that creators apply to', 'Brand autopilots and competitor watch', 'Sales tracking from your store', 'Turnaround owners, targets and escalation', 'A team of 5 with approvals', '3× the daily AI'],
			join: JOIN_BRAND
		}
	}
];
export const AGENCY = { name: 'Agency', month: 4999, year: 49999, founding: 24999, perks: ['Pro for every creator you manage', 'Pro for your own brand team', 'Switch between client workspaces', 'Roster, commission ledger and pitch decks', '15 seats'] };

const rs = (n) => '₹' + n.toLocaleString('en-IN');
const perks = (list) => `<ul class="ticks">${list.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
// The price shows monthly or yearly; the switch at the top flips every card.
const priceBlock = (p) => `
  <p class="price"><b data-m="${rs(p.month)}" data-y="${rs(p.year)}">${rs(p.year)}</b><small data-m="/month" data-y="/year">/year</small></p>
  <p class="alt" data-m="or ${rs(p.year)}/year: 2 months free" data-y="about ${rs(Math.round(p.year / 12))} a month · &lt;b&gt;founding members ${rs(p.founding)}/year&lt;/b&gt;">about ${rs(Math.round(p.year / 12))} a month · <b>founding members ${rs(p.founding)}/year</b></p>`;
const paidCard = (p, join, attrs = '') => `
<div class="card plan hot"${attrs}>
  <h3>${esc(p.name)}</h3>
  ${priceBlock(p)}
  ${perks(p.perks)}
  <a class="btn grad" href="${join}">${PRELAUNCH ? JOIN_LABEL : 'Start the 14-day trial'}</a>
</div>`;

// Feature by feature, for each side. [feature, free, pro]: true, false or a short text; null starts a group.
const COMPARE = {
	creator: [
		['Your page and getting found', null],
		['Brand page brands book you from (yourname.miracleapp.live)', true, true],
		['Live Instagram numbers and media kit', true, true],
		['Listed in the creator directory', true, true],
		['Live insights page to send brands', false, true],
		['Your page without “Made with Miracle”', false, true],
		['Deals', null],
		['Requests, collab board, calendar and drafts', true, true],
		['Collabs at a time (from the first quote to wrapped)', '5', 'Unlimited'],
		['Invoices with a UPI QR', 'Unlimited', 'Unlimited'],
		['Invoices without the “Sent with Miracle” line', false, true],
		['Offer check: AI reads the agreement against your rates', '1 a day', 'Unlimited'],
		['Getting paid', null],
		['Payment reminders you send with one tap', true, true],
		['Reminders that go by themselves, and bank-credit matching', false, true],
		['Formal demand letter and MSME complaint', false, true],
		['Autopilots', null],
		['Pitch autopilot: brands found and pitched for you', false, true],
		['Pitches you send yourself', '5 a month', 'Unlimited'],
		['Invoices, dates and tracking links on their own', false, true],
		['Nudges, counters for low offers, rebook offers', false, true],
		['Team and AI', null],
		['Team: your manager or assistant', false, '1 teammate'],
		['Daily AI (captions, scripts, replies, checks)', 'A little', '6×'],
		['No commission on any deal', true, true]
	],
	brand: [
		['Finding creators', null],
		['Discover with audience health and filters', true, true],
		['Full creator profiles (audience, fit, history)', '10 a day', 'Unlimited'],
		['Creator pools and shortlists', true, true],
		['Working with creators', null],
		['Requests to creators', '3 a month', 'Unlimited'],
		['Campaigns', '1 a month', 'Unlimited'],
		['Open briefs that creators apply to', false, true],
		['Briefs, drafts, approvals and reports', true, true],
		['Autopilots and tracking', null],
		['Brand autopilots: shortlist, follow-up, draft check, negotiate, rebook', false, true],
		['Competitor watch', false, true],
		['Sales tracking from your store', false, true],
		['Turnaround owners, targets and escalation', false, true],
		['Team and AI', null],
		['Team seats with roles and approvals', '1', '5'],
		['Daily AI (briefs, report reading)', 'A little', '3×'],
		['Pay creators directly, no commission', true, true]
	]
};
const cell = (v) => (v === true ? '<span class="y">✓</span>' : v === false ? '<span class="n">—</span>' : esc(v));
const compareTable = (rows, paidName) => `
<div class="table"><table class="cmp"><thead><tr><th>Feature</th><th>Free</th><th>${esc(paidName)}</th></tr></thead><tbody>
${rows.map((r) => (r[1] === null ? `<tr class="grp"><td colspan="3">${esc(r[0])}</td></tr>` : `<tr><td>${esc(r[0])}</td><td>${cell(r[1])}</td><td>${cell(r[2])}</td></tr>`)).join('')}
</tbody></table></div>`;

export const PRICING_FAQ = [
	['Is there a commission on deals?', 'No, never. Brands pay creators directly by UPI or bank transfer, and Miracle takes nothing from any deal on any plan. Plans pay for the tools, not for the deals.'],
	['Is Miracle really free for creators?', 'Yes. Every feature, with no time limit and no card: unlimited collabs, every autopilot, automatic payment reminders and a teammate. Brands and agencies pay for their plans; creators never pay and never give a cut of a deal.'],
	['How does the free trial work?', 'Every new brand team gets 14 days of Brand Pro, with no card needed. When it ends you stay on the free plan unless you pick a paid one; nothing you made is deleted.'],
	['How do I pay?', 'On the website or the web app, through Razorpay: UPI AutoPay, cards or net banking. Plans renew by themselves and you can stop renewal any time. Plans aren’t sold inside the Play Store or iPhone apps; once you’ve paid, they unlock there too.'],
	['Is GST included?', 'Yes. Prices include 18% GST, and every payment comes with a tax invoice from Zyposoft Technologies Private Limited, by email and as a link.'],
	['What is the founding member price?', 'The first 100 people to buy a yearly plan pay half, and keep that price for as long as their plan keeps renewing.'],
	['Can I get a refund?', 'Yes, within 7 days of your first payment for a plan, if it isn’t for you. See the [refund and cancellation policy](/refund-policy).'],
	['I manage several creators or clients. Which plan?', 'The Agency plan: Pro for every creator you manage and for your own brand team, client workspaces you switch between, a roster with your commission ledger, and 15 seats.']
];

// The creator section: free with everything (default), or Free + Creator Pro when it's on sale (script below).
const creatorSection = (s) => `
<section class="sec wrap">
  <div class="sec-h"><span class="eb">${esc(s.who)}</span><h2>Get more deals, <em>chase less.</em></h2></div>
  <div class="grid2 plans" data-cp="free">
    <div class="card plan hot">
      <h3>Free, everything included</h3>
      <p class="price"><b>₹0</b><small>/forever</small></p>
      <p class="alt">No card. No time limit. No commission.</p>
      ${perks(CREATOR_FREE)}
      <a class="btn grad" href="${s.paid.join}">${PRELAUNCH ? JOIN_LABEL : 'Join free'}</a>
    </div>
    <div class="card"><h3>Why is it free for creators?</h3><p>Brands and agencies pay for Miracle's tools. Creators never pay, and never give anyone a cut of a deal: brands pay you directly by UPI or bank transfer. Invoices and your page carry a small “Sent with Miracle” line, and that's all we ask.</p></div>
  </div>
  <div data-cp="pro" hidden>
  <div class="grid2 plans">
    <div class="card plan">
      <h3>${esc(s.free.name)}</h3>
      <p class="price"><b>${s.free.price}</b><small>/forever</small></p>
      <p class="alt">No card. No time limit.</p>
      ${perks(s.free.perks)}
      <a class="btn ghost" href="${s.paid.join}">${PRELAUNCH ? JOIN_LABEL : 'Join free'}</a>
    </div>
    ${paidCard(s.paid, s.paid.join, ' id="cp-card"')}
  </div>
  <details class="cmp-more" open><summary>Compare Free and ${esc(s.paid.name)}, feature by feature</summary>${compareTable(COMPARE.creator, s.paid.name)}</details>
  </div>
</section>`;

// Shows Creator Pro, priced from the database, only while it's on sale (admin → Plans → Offered to new buyers).
const creatorProScript = `<script>
(() => {
  const rs = (n) => '₹' + Number(n).toLocaleString('en-IN');
  fetch(${JSON.stringify(SB_URL + '/rest/v1/rpc/public_plans')}, { method: 'POST', headers: { apikey: ${JSON.stringify(SB_KEY)}, authorization: 'Bearer ' + ${JSON.stringify(SB_KEY)}, 'content-type': 'application/json' }, body: '{}' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const p = d && (d.plans || []).find((x) => x.code === 'creator_pro');
      if (!p) return;
      const card = document.getElementById('cp-card');
      const b = card.querySelector('.price b'), alt = card.querySelector('.alt');
      const founding = d.founding && d.founding.on && p.founding_year;
      b.dataset.m = rs(p.price_month); b.dataset.y = rs(p.price_year);
      alt.dataset.m = 'or ' + rs(p.price_year) + '/year: 2 months free';
      alt.dataset.y = 'about ' + rs(Math.round(p.price_year / 12)) + ' a month' + (founding ? ' · <b>founding members ' + rs(p.founding_year) + '/year</b>' : '');
      card.querySelector('h3').textContent = p.name;
      const on = document.querySelector('.ptoggle [aria-pressed="true"]');
      const k = on ? on.dataset.p : 'y';
      [b, alt].forEach((el) => (el.innerHTML = el.dataset[k]));
      document.querySelector('[data-cp="free"]').hidden = true;
      document.querySelector('[data-cp="pro"]').hidden = false;
    })
    .catch(() => {});
})();
</script>`;

export function pricingPage() {
	const body = `
<section class="hero wrap">
  <span class="eb">Pricing</span>
  <h1>Free for creators. <em>Pro for brands that scale.</em></h1>
  <p class="lede">Creators get every feature free, and every deal stays commission-free: brands pay creators directly. Brands start free and go Pro when they run more campaigns; new brand teams get 14 days of Brand Pro free, no card needed.</p>
  ${PRELAUNCH ? `<p class="soon"><span><b>Opening soon.</b> Miracle opens in batches, starting with the waitlist. Waitlist members get first access to the 100 founding places. <a href="${JOIN}">Join the waitlist</a></span></p>` : ''}
  <div class="ptoggle" role="group" aria-label="Billing"><button type="button" data-p="m" aria-pressed="false">Monthly</button><button type="button" data-p="y" aria-pressed="true">Yearly <em>2 months free</em></button></div>
</section>
${creatorSection(PLANS[0])}
${PLANS.slice(1).map((s, j) => { const i = j + 1; return `
<section class="sec wrap">
  <div class="sec-h"><span class="eb">${esc(s.who)}</span><h2>${i === 0 ? 'Get more deals, <em>chase less.</em>' : 'Find creators, <em>keep the budget.</em>'}</h2></div>
  <div class="grid2 plans">
    <div class="card plan">
      <h3>${esc(s.free.name)}</h3>
      <p class="price"><b>${s.free.price}</b><small>/forever</small></p>
      <p class="alt">No card. No time limit.</p>
      ${perks(s.free.perks)}
      <a class="btn ghost" href="${s.paid.join}">${PRELAUNCH ? JOIN_LABEL : 'Join free'}</a>
    </div>
    ${paidCard(s.paid, s.paid.join)}
  </div>
  <details class="cmp-more"${i === 0 ? ' open' : ''}><summary>Compare Free and ${esc(s.paid.name)}, feature by feature</summary>${compareTable(i === 0 ? COMPARE.creator : COMPARE.brand, s.paid.name)}</details>
</section>`; }).join('')}
<section class="sec wrap">
  <div class="sec-h"><span class="eb">For agencies</span><h2>Every creator and client, <em>one desk.</em></h2></div>
  <div class="grid2 plans">${paidCard(AGENCY, PRELAUNCH ? '/waitlist?as=agency' : JOIN_BRAND)}
    <div class="card"><h3>Running creators and brands together?</h3><p>Agency covers every creator you manage on Pro, your own brand team, and the client teams you work in, with one sign-in and 15 seats. Write to <a href="mailto:support@miracleapp.live">support@miracleapp.live</a> for a walkthrough, or <a href="/influencer-agency-software">see what's in it</a>.</p></div>
  </div>
</section>
<section class="sec wrap split"><div class="sec-h"><span class="eb">Questions</span><h2>Good to <em>know.</em></h2><p>Anything else? Write to <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>.</p></div><div class="faq">${PRICING_FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${md(a)}</p></details>`).join('')}</div></section>
<section class="sec wrap"><p class="small">Prices in Indian rupees, including 18% GST. Sold by Zyposoft Technologies Private Limited, #7, Nisarga Layout, Chikkalsandra, Bangalore 560061, India. Questions: <a href="mailto:support@miracleapp.live">support@miracleapp.live</a>. See the <a href="/terms#price">terms</a> and the <a href="/refund-policy">refund and cancellation policy</a>.</p></section>
<script>
(() => {
  const set = (k) => {
    document.querySelectorAll('.ptoggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === k)));
    document.querySelectorAll('[data-m][data-y]').forEach((el) => (el.innerHTML = el.dataset[k]));
  };
  document.querySelectorAll('.ptoggle button').forEach((b) => b.addEventListener('click', () => set(b.dataset.p)));
})();
</script>
${creatorProScript}`;
	return page({
		path: '/pricing',
		title: 'Pricing · Miracle: free for creators, Brand Pro from ₹1,999',
		description: 'Miracle is free for creators: every feature, no commission on any deal. Brands start free; Brand Pro ₹1,999/month, Agency ₹4,999/month. 14-day Brand Pro trial.',
		body,
		ld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: PRICING_FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') } })) }],
		crumbs: [{ name: 'Pricing', path: '/pricing' }],
		section: 'pricing'
	});
}

export function refundPage() {
	const body = `
<article class="hero wrap prose">
  <span class="eb">Policy</span>
  <h1>Refunds and <em>cancellation</em></h1>
  <p class="lede">For Miracle's own paid plans (such as Brand Pro and Agency). Money between brands and creators never passes through Miracle, so this policy doesn't cover deals.</p>
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
