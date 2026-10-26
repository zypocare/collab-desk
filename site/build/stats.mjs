// The website's own visitor counts (migration 167): one small script on every page adds to daily totals in the
// database (visits, page views, where visitors came from, clicks on Join and sign-in). No cookies and nothing
// about the person; the admin Dashboard shows the totals. Uses the same public key the web app ships with.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = Object.fromEntries(
	readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../web/.env.live'), 'utf8')
		.split(/\r?\n/)
		.filter((l) => /^VITE_SUPABASE_(URL|ANON_KEY)=/.test(l))
		.map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_ = process.env.WAITLIST_SB_URL || env.VITE_SUPABASE_URL;
const KEY = process.env.WAITLIST_SB_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) throw new Error('web/.env.live needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');

// A visit is the first page in a browser tab's session (sessionStorage, not a cookie); its source (utm_source or
// the referring site) is kept for the clicks that follow. Robots and automated browsers aren't counted.
export const STATS_SCRIPT = `<script>(()=>{try{
if(navigator.webdriver||/bot|crawl|spider|preview|lighthouse|headless/i.test(navigator.userAgent))return;
const U=${JSON.stringify(`${URL_.replace(/\/$/, '')}/rest/v1/rpc/site_hit`)},K=${JSON.stringify(KEY)};
const send=(k,l)=>fetch(U,{method:'POST',keepalive:true,headers:{apikey:K,authorization:'Bearer '+K,'content-type':'application/json'},body:JSON.stringify({p_kind:k,p_path:location.pathname,p_source:src,p_label:l||''})}).catch(()=>{});
let src=new URLSearchParams(location.search).get('utm_source')||'';
if(!src&&document.referrer){try{const h=new URL(document.referrer).hostname.replace(/^www\\./,'');if(!/(^|\\.)miracleapp\\.live$/.test(h))src=h}catch(e){}}
let first=true;try{first=!sessionStorage.getItem('mc-src');if(first)sessionStorage.setItem('mc-src',src||'direct');else src=sessionStorage.getItem('mc-src')||src}catch(e){}
send(first?'visit':'view');
document.addEventListener('click',(e)=>{const a=e.target&&e.target.closest&&e.target.closest('a[href],button[type=submit]');if(!a)return;
const h=a.getAttribute('href')||(a.closest('form')&&a.closest('form').getAttribute('action'))||'';
if(/signin|login/.test(h))return send('click','sign in');
if(/signup|waitlist/.test(h))send('click','join · '+(/as=brand/.test(h)?'brand':/as=agency/.test(h)?'agency':'creator'));},{capture:true});
}catch(e){}})();</script>`;
