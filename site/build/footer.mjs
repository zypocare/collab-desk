// The one footer every page of the website shows: the generated pages (layout.mjs), the hand-written
// ones (home, legal, sign-in, calculators; build.mjs stamps it in between the "site footer" markers) and
// the creator directory (build.mjs writes web/worker/siteFooter.ts from this). Its classes all start
// with "sf" and its CSS sets everything it needs, so it looks the same whatever page it sits on.

const SITE = 'https://www.miracleapp.live';

/** The footer's HTML. `base` is '' on the website and the full address on other hosts (the directory). */
export const footerHtml = (base = '') => `<footer class="sf"><div class="sf-w">
  <div class="sf-cta">
    <div><span class="sf-eb">Contact us</span><p class="sf-cta-t">Questions, partnerships or press? <em>Write to us.</em></p></div>
    <a class="sf-mail" href="mailto:contact@miracleapp.live"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>contact@miracleapp.live</a>
  </div>
  <div class="sf-cols">
    <div class="sf-brand"><a class="sf-logo" href="${base}/" aria-label="Miracle home"><img src="${base}/icon.svg" alt="" width="34" height="34"><b>Miracle</b></a><p>Brand collaborations, handled, for creators, the brands they work with and the managers who run it all. Made in Bengaluru.</p><p class="sf-tag">No commission on any deal. Brands pay creators directly.</p></div>
    <nav aria-label="For creators"><b>Creators</b><a href="${base}/get-brand-deals">Get brand deals</a><a href="${base}/pitch-brands">Pitch brands with AI</a><a href="${base}/link-in-bio-for-creators">Link in bio that books deals</a><a href="${base}/influencer-media-kit">Live media kit</a><a href="${base}/influencer-rate-card">Rates and quotes</a><a href="${base}/brand-collaboration-management">Manage collabs</a><a href="${base}/get-paid-by-brands">Get paid on time</a></nav>
    <nav aria-label="For brands and agencies"><b>Brands &amp; agencies</b><a href="${base}/find-influencers-india">Find influencers in India</a><a href="${base}/creators">Creator directory</a><a href="${base}/influencer-marketing-no-commission">No-commission campaigns</a><a href="${base}/influencer-agency-software">For agencies and managers</a><a href="${base}/signin?as=brand">Brand sign in</a></nav>
    <nav aria-label="Learn"><b>Learn</b><a href="${base}/guides">Guides</a><a href="${base}/help">Help centre</a><a href="${base}/tools/rate-calculator">Rate calculator</a><a href="${base}/tools/engagement-calculator">Engagement calculator</a></nav>
    <nav aria-label="Company"><b>Company</b><a href="${base}/pricing">Pricing</a><a href="${base}/waitlist">Waitlist</a><a href="mailto:support@miracleapp.live">Support</a><a href="${base}/refund-policy">Refunds &amp; cancellation</a><a href="${base}/signin">Sign in</a></nav>
  </div>
  <div class="sf-bot"><span>© 2026 Miracle is a product of Zyposoft Technologies Private Limited, #7, Nisarga Layout, Chikkalsandra, Bangalore 560061, India.</span><span class="sf-links"><a href="${base}/terms">Terms</a><a href="${base}/privacy">Privacy</a><a href="${base}/data-deletion">Data deletion</a></span></div>
</div><div class="sf-giant" aria-hidden="true">Miracle</div></footer>`;

export const footerCss = `
.sf{position:relative;overflow:hidden;margin:0;padding:64px 0 0;border-top:1px solid #2E262E;background:#09070A;color:#A39AA1;font:400 14.5px/1.6 'Geist',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;text-align:left;-webkit-font-smoothing:antialiased}
.sf *{box-sizing:border-box}
.sf a{color:#A39AA1;text-decoration:none;transition:color .2s}.sf a:hover{color:#F4EEF2}
.sf-w{width:min(1200px,100%);margin:0 auto;padding-left:max(20px,env(safe-area-inset-left,0px));padding-right:max(20px,env(safe-area-inset-right,0px))}
.sf-cta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:22px;margin-bottom:60px;padding:28px 32px;border-radius:24px;background:radial-gradient(120% 140% at 0% 0%,rgba(156,123,255,.16),transparent 55%),radial-gradient(90% 120% at 100% 100%,rgba(242,90,144,.14),transparent 55%),#1A151A;box-shadow:inset 0 0 0 1px #3E343E}
.sf-eb{font:700 11.5px/1.2 'Geist',ui-sans-serif,system-ui,sans-serif;letter-spacing:.28em;text-transform:uppercase;color:#A39AA1}
.sf-cta-t{margin:10px 0 0;font-size:clamp(21px,2.5vw,29px);line-height:1.2;font-weight:600;letter-spacing:-.01em;color:#F4EEF2}
.sf-cta-t em{font:italic 400 1.12em/1 'Instrument Serif',Georgia,serif;background:linear-gradient(115deg,#9C7BFF,#F25A90 52%,#FFAE6B);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
.sf .sf-mail{display:inline-flex;align-items:center;gap:10px;min-height:52px;padding:0 22px;background:#F4EEF2;color:#1E171C;font:700 15px/1 'Geist',ui-sans-serif,system-ui,sans-serif;box-shadow:5px 5px 0 #F25A90;transition:transform .12s,box-shadow .12s}
.sf .sf-mail:hover{color:#1E171C;transform:translate(-2px,-2px);box-shadow:7px 7px 0 #F25A90}.sf-mail svg{width:18px;height:18px}
.sf-cols{display:grid;grid-template-columns:1.5fr repeat(4,minmax(0,1fr));gap:36px 30px}
.sf nav{display:grid;align-content:start}
.sf nav b{display:block;margin-bottom:12px;color:#F4EEF2;font-weight:600;font-size:12.5px;letter-spacing:.16em;text-transform:uppercase}
.sf nav a{display:block;padding:5px 0}
.sf .sf-logo{display:flex;align-items:center;gap:10px;color:#F4EEF2}.sf-logo img{display:block;border-radius:9px}.sf-logo b{font:italic 400 28px/1 'Instrument Serif',Georgia,serif;color:#F4EEF2}
.sf-brand p{margin:16px 0 0;max-width:32ch}.sf-brand .sf-tag{margin-top:10px;font-size:13.5px}
.sf-bot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 24px;margin-top:52px;padding-top:24px;border-top:1px solid #2E262E;font-size:13px}
.sf-links{display:flex;flex-wrap:wrap;gap:8px 22px}
.sf-giant{margin:36px 0 0;padding:0 .12em .14em;font:italic 400 clamp(100px,21vw,320px)/1 'Instrument Serif',Georgia,serif;letter-spacing:-.03em;text-align:center;color:transparent;-webkit-text-stroke:1px #3E343E;background:linear-gradient(115deg,#9C7BFF,#F25A90 52%,#FFAE6B);-webkit-background-clip:text;background-clip:text;background-size:0% 100%;background-repeat:no-repeat;transition:background-size 1.4s cubic-bezier(.2,.8,.2,1);user-select:none}
.sf-giant:hover{background-size:100% 100%;-webkit-text-stroke:0 transparent}
@media (max-width:980px){.sf-cols{grid-template-columns:repeat(2,minmax(0,1fr))}.sf-brand{grid-column:1/-1}}
@media (max-width:560px){.sf{padding-top:48px}.sf-cta{padding:22px 20px;margin-bottom:44px}.sf .sf-mail{width:100%;justify-content:center}.sf-cols{gap:30px 20px}}
`;

export const SITE_FOOTER = footerHtml('');
export const DIRECTORY_FOOTER = footerHtml(SITE);
