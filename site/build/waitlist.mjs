// The pre-launch waitlist page (/waitlist). Until Miracle opens to everyone, every "Join" on the website
// comes here. It calls the database's public waitlist_join with the same public key the web app ships with.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, page } from './layout.mjs';

const env = Object.fromEntries(
	readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../web/.env.live'), 'utf8')
		.split(/\r?\n/)
		.filter((l) => /^VITE_SUPABASE_(URL|ANON_KEY)=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
// (WAITLIST_SB_URL and WAITLIST_SB_KEY point a test build at the local database.)
const URL_ = process.env.WAITLIST_SB_URL || env.VITE_SUPABASE_URL;
const KEY = process.env.WAITLIST_SB_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) throw new Error('web/.env.live needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');

const NICHES = ['Fashion', 'Beauty', 'Food', 'Travel', 'Fitness', 'Lifestyle', 'Tech', 'Finance', 'Parenting', 'Comedy', 'Education', 'Other'];
const FOLLOWERS = ['Under 10K', '10K–50K', '50K–1L', '1L–5L', '5L+'];

export function waitlistPage() {
	const body = `
<section class="hero wrap wl"><div class="wl-in">
  <div>
  <span class="eb">Opening soon</span>
  <h1>Get in <em>first.</em></h1>
  <p class="lede">Miracle opens in batches, starting with the waitlist. Join now: we hold your link name, you get first access to the 100 founding places (half price, yearly), and every friend who joins with your link moves you up.</p>

  <div class="wl-box" id="wl">
    <form class="card wl-form" id="wl-form" novalidate>
      <div class="wl-roles" role="radiogroup" aria-label="I'm joining as">
        <button type="button" role="radio" data-role="creator" aria-checked="true">Creator</button>
        <button type="button" role="radio" data-role="brand" aria-checked="false">Brand</button>
        <button type="button" role="radio" data-role="agency" aria-checked="false">Agency</button>
      </div>
      <div class="wl-grid">
        <label><span>Your name</span><input name="name" autocomplete="name" maxlength="80" required></label>
        <label><span>Email</span><input name="email" type="email" autocomplete="email" maxlength="160" required></label>
        <label class="c b a"><span>Instagram</span><input name="instagram" placeholder="@yourhandle" autocapitalize="off" maxlength="60"></label>
        <label><span>City</span><input name="city" autocomplete="address-level2" maxlength="60"></label>
        <label class="c"><span>What you create</span><select name="niche"><option value="">Choose</option>${NICHES.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
        <label class="c"><span>Followers</span><select name="followers"><option value="">Choose</option>${FOLLOWERS.map((n) => `<option>${esc(n)}</option>`).join('')}</select></label>
        <label class="b a" hidden><span>Company</span><input name="company" autocomplete="organization" maxlength="100"></label>
        <label class="b a" hidden><span>Website</span><input name="site" placeholder="yourbrand.in" maxlength="200"></label>
        <label class="c wl-link wide"><span>Your link (we'll hold it)</span><span class="wl-slug"><input name="link" placeholder="yourname" autocapitalize="off" maxlength="30" pattern="[A-Za-z0-9-]{3,30}"><em>.miracleapp.live</em></span></label>
        <label class="wl-hp" aria-hidden="true"><span>Leave empty</span><input name="website_url" tabindex="-1" autocomplete="off"></label>
      </div>
      <p class="wl-err" id="wl-err" role="alert" hidden></p>
      <button class="btn grad wl-go" type="submit">Join the waitlist</button>
      <p class="small">No spam: one email when you join, one when it's your turn. <a href="/privacy">Privacy</a>.</p>
    </form>

    <div class="card wl-done" id="wl-done" hidden>
      <span class="eb">You're on the list</span>
      <p class="wl-pos"><b id="wl-n">#1</b><small id="wl-of"></small></p>
      <p id="wl-held" hidden></p>
      <p><b>Move up the line.</b> Every friend who joins with your link moves you up. <span id="wl-refs"></span></p>
      <div class="wl-share"><input id="wl-url" readonly aria-label="Your referral link"><button class="btn" type="button" id="wl-copy">Copy</button><a class="btn grad" id="wl-wa" target="_blank" rel="noopener">Share on WhatsApp</a></div>
      <p class="small">We've emailed you this link too. Plans and prices: <a href="/pricing">pricing</a>.</p>
    </div>
  </div>
  </div>

  <ul class="perks" aria-label="Why join now">
    <li><i>1</i><div><b>Your link name, held</b><span>yourname.miracleapp.live stays yours until launch, so nobody takes it first.</span></div></li>
    <li><i>2</i><div><b>The founding price</b><span>The first 100 yearly plans are half price, kept for as long as the plan renews. Waitlist members get first access.</span></div></li>
    <li><i>3</i><div><b>14 days of Pro, free</b><span>Every autopilot on from day one, no card needed. Then stay free or pick a plan.</span></div></li>
    <li><i>4</i><div><b>Why a waitlist?</b><span>Miracle reads Instagram through Meta's official sign-in, which opens to everyone once Meta finishes its review. We'd rather you start with everything working.</span></div></li>
    <li><i>5</i><div><b>No commission, ever</b><span>Brands pay creators directly. Miracle earns only from optional plans, never from your deals. <a href="/pricing">See the plans</a>.</span></div></li>
  </ul>
</div></section>

<script>
(() => {
  const URL_ = ${JSON.stringify(URL_)}, KEY = ${JSON.stringify(KEY)};
  const q = new URLSearchParams(location.search);
  const f = document.getElementById('wl-form'), done = document.getElementById('wl-done'), err = document.getElementById('wl-err');
  let role = ['creator', 'brand', 'agency'].includes(q.get('as')) ? q.get('as') : 'creator';
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const ref = (q.get('ref') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (ref) store.set('wl_from', ref);
  if (q.get('link')) f.link.value = q.get('link').toLowerCase().replace(/[^a-z0-9-]/g, '');
  function setRole(r) {
    role = r;
    f.querySelectorAll('[data-role]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.role === r)));
    const k = r === 'creator' ? 'c' : r === 'brand' ? 'b' : 'a';
    f.querySelectorAll('.wl-grid > label.c, .wl-grid > label.b, .wl-grid > label.a').forEach((l) => (l.hidden = !l.classList.contains(k)));
  }
  f.querySelectorAll('[data-role]').forEach((b) => b.addEventListener('click', () => setRole(b.dataset.role)));
  setRole(role);
  async function rpc(fn, args) {
    const r = await fetch(URL_ + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && j.message) || 'Something went wrong. Try again.');
    return j;
  }
  function show(s, note) {
    if (!s) return;
    f.hidden = true; done.hidden = false;
    document.getElementById('wl-n').textContent = '#' + s.position;
    document.getElementById('wl-of').textContent = ' of ' + s.total + ' ' + (s.role === 'brand' ? 'brands' : s.role === 'agency' ? 'agencies' : 'creators');
    const held = document.getElementById('wl-held');
    held.hidden = !(s.link || note);
    held.innerHTML = s.link ? 'We\\'re holding <b>' + s.link + '.miracleapp.live</b> for you.' : note || '';
    document.getElementById('wl-refs').textContent = s.referrals ? s.referrals + (s.referrals === 1 ? ' friend has' : ' friends have') + ' joined with it so far.' : '';
    const url = location.origin + '/waitlist?ref=' + s.ref_code;
    document.getElementById('wl-url').value = url;
    document.getElementById('wl-wa').href = 'https://wa.me/?text=' + encodeURIComponent('I just joined the Miracle waitlist: the app for creator brand deals, with no commission. Join with my link: ' + url);
    store.set('wl_code', s.ref_code);
  }
  document.getElementById('wl-copy').addEventListener('click', async (e) => {
    const i = document.getElementById('wl-url');
    try { await navigator.clipboard.writeText(i.value); e.target.textContent = 'Copied'; } catch { i.select(); }
  });
  // Back again: show your place.
  const mine = store.get('wl_code');
  if (mine && !ref) rpc('waitlist_status', { p_code: mine }).then((s) => s && show(s)).catch(() => {});
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const d = Object.fromEntries(new FormData(f));
    if (!d.email || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(d.email)) { err.textContent = 'Type a full email address.'; err.hidden = false; return; }
    const btn = f.querySelector('.wl-go'); btn.disabled = true; btn.textContent = 'Joining…';
    try {
      const s = await rpc('waitlist_join', { p: { ...d, role, ref: store.get('wl_from') || '', source: [q.get('utm_source'), document.referrer && new URL(document.referrer).hostname].filter(Boolean).join(' ').slice(0, 120) } });
      show(s, s.link_note);
    } catch (x) {
      err.textContent = x.message; err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = 'Join the waitlist'; }
  });
})();
</script>`;
	return page({
		path: '/waitlist',
		title: 'Join the Miracle waitlist · Get in first',
		description: 'Miracle opens in batches. Join the waitlist: we hold your link name, you get first access to the founding price, and friends who join move you up.',
		body,
		crumbs: [{ name: 'Waitlist', path: '/waitlist' }]
	});
}
