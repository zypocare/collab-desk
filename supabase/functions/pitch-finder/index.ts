// Pitch autopilot, once a day (8:30 AM India) for each creator from the database cron job, or when she taps "Find
// brands now". Up to 10 new brands a day:
//   1) Mined from Instagram first: tracked peers' collab brands + Apify Instagram Hashtag & Profile discovery
//      (reads Instagram bio emails, checks linked websites, and keeps DM-only brands as 1-tap Instagram DM pitches).
//   2) Backed up by Gemini with Google Search + website email check if Instagram returns fewer than the daily target.
// Brands with a public email queue to go out between 10 AM and 6 PM; DM-only brands land in Wishlist ready to DM.
// A brand is never pitched twice.
//   ?dry=1        find and write, save nothing, send nothing
//   ?site=<url>   where the AI lives (local testing)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { admin, cronAllowed, todayIST } from '../_shared/admin.ts';
import { activeCreators, creatorOfCaller, settingsOf, type Settings } from '../_shared/creators.ts';
import { pushToCreator } from '../_shared/push.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-creator' };
type Brand = { name: string; website: string; instagram: string; category: string; why: string };
type Found = Brand & { email: string; domain: string; discovery?: 'instagram' | 'google' };

const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const cleanHandle = (h: string) => h.replace(/^@+/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').trim().toLowerCase();
const domainOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};
const compactNum = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n));

const MARKETPLACES = /\b(myntra|amazon|flipkart|nykaa|ajio|tatacliq|meesho|swiggy|zomato|blinkit|zepto|instagram|facebook|youtube|whatsapp|miracleapp)\b/i;
const CREATOR_BIO_RE = /\b(digital creator|content creator|influencer|blogger|youtuber|ugc creator|video creator|public figure|artist|actor|actress|model|photographer|personal blog)\b/i;
const COLLAB_CAPTION_RE = /(#(ad|collab|sponsored|paidpartnership|gifted|pr|brandpartner)\b|\bpaid\s+partnership\b|\bin\s+collaboration\s+with\b|\bhosted\s+by\b|\bvisited\s+@|\bwearing\s+@|\bstyled\s+by\s+@)/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  const url = new URL(req.url);
  const dry = url.searchParams.get('dry') === '1';
  const siteParam = url.searchParams.get('site') ?? '';
  const db = admin();

  // The creator herself ("Find brands now"): only for the creator she is signed in for.
  if (!cronAllowed(req)) {
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const { data: ok } = await asUser.rpc('is_creator');
    const id = ok === true ? await creatorOfCaller(req) : null;
    if (!id) return reply({ error: 'Only the creator can do this.' }, 403);
    const s = await settingsOf(db, id);
    if (!s) return reply({ error: 'No settings.' }, 500);
    const r = await findFor(db, s, { manual: true, dry, siteParam });
    return reply(r.body, r.status);
  }

  // The cron job for one creator (sent by the run below; the cron secret makes the id trustworthy).
  const body = await req.json().catch(() => ({}));
  const one = Number(body?.creator);
  if (Number.isInteger(one) && one > 0) {
    const s = await settingsOf(db, one);
    if (!s) return reply({ error: 'No settings.' }, 404);
    const r = await findFor(db, s, { manual: false, dry, siteParam });
    return reply(r.body, r.status);
  }

  const creators = (await activeCreators(db)).filter((c) => c.pitch_auto || dry);
  const self = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pitch-finder${url.search}`;
  const results = await Promise.all(creators.map(async (c) => {
    try {
      const r = await fetch(self, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cron-secret': req.headers.get('x-cron-secret') ?? '' },
        body: JSON.stringify({ creator: c.id }),
      });
      const out = await r.json().catch(() => ({ error: `status ${r.status}` }));
      if (!r.ok) console.error(`pitch-finder: creator ${c.id} failed`, out);
      return { creator: c.id, ...out };
    } catch (e) {
      console.error(`pitch-finder: creator ${c.id} failed`, e);
      return { creator: c.id, error: e instanceof Error ? e.message : String(e) };
    }
  }));
  return reply({ creators: results });
});

/** Build 2-3 high-signal Instagram hashtags from the creator's niche & city, rotated daily. */
function buildInstagramHashtags(niche: string, city: string, offset = 0): string[] {
  const c = city.toLowerCase().replace(/[^a-z]/g, '');
  const citySlug = c === 'bengaluru' ? 'bangalore' : c;
  const nicheWords = niche
    .toLowerCase()
    .split(/[,/&·|]+/)
    .map((x) => x.replace(/[^a-z]/g, ''))
    .filter((x) => x.length >= 3);

  const pool: string[] = [];
  if (citySlug) {
    pool.push(`${citySlug}cafes`, `${citySlug}bloggers`, `${citySlug}fashion`, `${citySlug}foodies`, `${citySlug}lifestyle`, `${citySlug}brands`);
  }
  for (const w of nicheWords) {
    if (w.includes('fashion') || w.includes('style')) pool.push('indianfashionbrand', 'indiansmallbusiness', 'homegrownindia');
    if (w.includes('beauty') || w.includes('skin')) pool.push('indianskincarebrand', 'indianbeautybrand');
    if (w.includes('travel') || w.includes('stay')) pool.push('indianstaycations', 'boutiquehotelsindia');
    if (w.includes('yoga') || w.includes('well') || w.includes('fit')) pool.push('indianwellnessbrand', 'activewearindia');
    if (w.includes('food') || w.includes('cafe')) pool.push('indianfoodbrand', 'indiansnacks');
    if (w.includes('life') || w.includes('home')) pool.push('indianhomedecor', 'd2cindia');
  }
  pool.push('homegrownindia', 'd2cindia', 'indianbrandcollab');
  const uniq = [...new Set(pool)];
  // Rotate starting offset by day-of-year so daily runs surface fresh brands.
  const dayIdx = Math.floor(Date.now() / 864e5);
  const start = uniq.length ? (dayIdx * 2 + offset) % uniq.length : 0;
  const picked: string[] = [];
  for (let i = 0; i < Math.min(3, uniq.length); i++) picked.push(uniq[(start + i) % uniq.length]);
  return picked;
}

/** Discover candidate brand @handles directly from Instagram (tracked peers + Apify Hashtag Scraper), then enrich via Apify Profile Scraper. */
async function discoverFromInstagram(
  db: ReturnType<typeof admin>,
  s: Settings,
  ownHandle: string,
  seenName: Set<string>,
  seenIg: Set<string>,
  seenDomain: Set<string>,
  want: number,
  offset = 0
): Promise<Found[]> {
  const token = (Deno.env.get('APIFY_API_TOKEN') ?? '').trim();
  const candidates = new Map<string, string>(); // handle -> reason

  const addCandidate = (raw: string, why: string) => {
    const h = cleanHandle(raw);
    if (!h || h.length < 2 || h.length > 30 || !/^[a-z0-9._]+$/.test(h)) return;
    if (h === ownHandle || seenIg.has(norm(h)) || MARKETPLACES.test(h)) return;
    if (!candidates.has(h)) candidates.set(h, why);
  };

  // Source 1: Tracked Peer Benchmarks' active collab brands (0 extra Apify calls!)
  try {
    const { data: peers } = await db
      .from('creator_benchmarks')
      .select('username, insights, top_posts')
      .eq('creator_id', s.id)
      .limit(8);
    for (const p of peers ?? []) {
      const peerUser = String(p.username ?? '');
      const ins = (p.insights ?? {}) as { collab_brands?: string[] };
      for (const b of ins.collab_brands ?? []) {
        addCandidate(b, `Spotted collaborating with @${peerUser} in your niche`);
      }
      const posts = Array.isArray(p.top_posts) ? (p.top_posts as { caption?: string }[]) : [];
      for (const post of posts) {
        const cap = String(post.caption ?? '');
        if (!COLLAB_CAPTION_RE.test(cap)) continue;
        for (const m of cap.matchAll(/@([a-z0-9._]{2,30})/gi)) {
          if (m[1].toLowerCase() !== peerUser.toLowerCase()) {
            addCandidate(m[1], `Featured on @${peerUser}'s recent collab post`);
          }
        }
      }
    }
  } catch {
    /* continue */
  }

  // Source 2: Live Instagram Hashtag Scraper via Apify (niche + city collab posts)
  if (token && candidates.size < want + 4) {
    const hashtags = buildInstagramHashtags(s.niche || '', s.city || '', offset);
    try {
      const res = await fetch(
        `https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hashtags: hashtags.slice(0, 2), resultsLimit: 24, resultsType: 'posts' }),
          signal: AbortSignal.timeout(25_000),
        }
      );
      if (res.ok) {
        const items = (await res.json().catch(() => [])) as Record<string, unknown>[];
        for (const item of Array.isArray(items) ? items : []) {
          const cap = String(item.caption ?? '');
          const owner = cleanHandle(String(item.ownerUsername ?? ''));
          const isCollab = COLLAB_CAPTION_RE.test(cap);
          const tag = String(item.hashtag ?? hashtags[0] ?? 'instagram');

          // Co-author / collab partner handles are the strongest signal of an active brand collab.
          const coauthors = Array.isArray(item.coauthorProducers) ? (item.coauthorProducers as { username?: string }[]) : [];
          for (const co of coauthors) {
            if (co?.username) addCandidate(co.username, `Active Instagram collab partner spotted under #${tag}`);
          }

          // Mentions inside #ad/#collab/#hosted posts
          if (isCollab) {
            const mentions = Array.isArray(item.mentions) ? (item.mentions as string[]) : [];
            for (const m of mentions) {
              if (cleanHandle(m) !== owner) addCandidate(m, `Working with creators on Instagram under #${tag}`);
            }
            for (const m of cap.matchAll(/@([a-z0-9._]{2,30})/gi)) {
              if (cleanHandle(m[1]) !== owner) addCandidate(m[1], `Tagged in a creator collab under #${tag}`);
            }
          }

          // Brand's own account posting under niche/city hashtags
          if (owner && /brand|store|studio|cafe|coffee|kitchen|label|wear|skin|beauty|jewel|decor|hotel|resort|official|india/i.test(owner)) {
            addCandidate(owner, `Active Instagram brand spotted under #${tag}`);
          }
        }
      }
    } catch {
      /* continue with peer candidates */
    }
  }

  if (!candidates.size || !token) return [];

  // Source 3: Enrich candidate handles via one batched Apify Profile Scraper call
  const handles = [...candidates.keys()].slice(0, Math.min(12, want + 5));
  let profiles: Record<string, unknown>[] = [];
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usernames: handles }),
        signal: AbortSignal.timeout(28_000),
      }
    );
    if (res.ok) {
      const arr = await res.json().catch(() => []);
      if (Array.isArray(arr)) profiles = arr as Record<string, unknown>[];
    }
  } catch {
    return [];
  }

  const out: Found[] = [];
  const enriched = await Promise.all(
    profiles.map(async (u) => {
      const handle = cleanHandle(String(u.username ?? ''));
      if (!handle || seenIg.has(norm(handle))) return null;
      const fullName = String(u.fullName ?? '').trim();
      const name = fullName || handle;
      if (seenName.has(norm(name)) || MARKETPLACES.test(name)) return null;

      const bio = String(u.biography ?? '');
      const cat = String(u.businessCategoryName ?? '');
      const isBiz = u.isBusinessAccount === true || Boolean(cat) || /shop|store|cafe|restaurant|brand|label|studio|order|shipping|dm to order|visit us/i.test(bio);
      // Skip obvious personal/creator accounts unless explicitly flagged as a business/brand
      if (!isBiz && CREATOR_BIO_RE.test(`${cat} ${bio}`)) return null;
      if (CREATOR_BIO_RE.test(cat) && !/brand|product|shop|clothing|beauty|food|cafe|restaurant|hotel|health|jewelry|home/i.test(cat)) return null;

      const followers = Number(u.followersCount ?? 0);
      if (followers > 0 && followers < 500) return null; // skip empty/inactive accounts

      const website = String(u.externalUrl ?? '').trim();
      const domain = website ? domainOf(website) : '';
      if (domain && seenDomain.has(domain)) return null;

      // 1) Check Instagram bio for a public email first
      const bioEmails = [...bio.replace(/&#64;|\[at\]|\(at\)/gi, '@').matchAll(EMAIL)]
        .map((m) => m[0].toLowerCase())
        .filter((e) => !BAD.test(e));
      let email = bioEmails[0] ?? '';

      // 2) If no bio email and they have a website, check their website contact page
      if (!email && website && !/linktr\.ee|beacons\.ai|bit\.ly|wa\.me|instagram\.com/i.test(website)) {
        const sc = await siteContact(website);
        if (sc.email) email = sc.email;
      }

      const mappedCat = mapCategory(cat || s.niche || 'Lifestyle');
      const whyBase = candidates.get(handle) || 'Active Instagram brand in your niche';
      const why = followers >= 1000 ? `${whyBase} (${compactNum(followers)} followers on IG)` : whyBase;

      return {
        name: name.slice(0, 80),
        website: website.slice(0, 200),
        instagram: handle,
        category: mappedCat,
        why: why.slice(0, 160),
        email,
        domain,
        discovery: 'instagram' as const,
      };
    })
  );

  // Prefer brands with an email first, then DM-only brands so both email autopilot & 1-tap IG DM work smoothly.
  const valid = enriched.filter((x): x is NonNullable<typeof x> => Boolean(x));
  valid.sort((a, b) => Number(Boolean(b.email)) - Number(Boolean(a.email)));

  for (const b of valid) {
    if (out.length >= want) break;
    if (seenName.has(norm(b.name)) || seenIg.has(norm(b.instagram))) continue;
    if (b.domain && seenDomain.has(b.domain)) continue;
    seenName.add(norm(b.name));
    seenIg.add(norm(b.instagram));
    if (b.domain) seenDomain.add(b.domain);
    out.push(b);
  }
  return out;
}

function mapCategory(raw: string): string {
  const s = raw.toLowerCase();
  if (/beauty|cosmetic|skin|salon|makeup/.test(s)) return 'Beauty';
  if (/cloth|apparel|fashion|jewel|boutique|shoe|wear/.test(s)) return 'Fashion';
  if (/food|cafe|coffee|restaurant|bakery|drink|beverage|bar/.test(s)) return 'Food & drink';
  if (/hotel|resort|travel|stay|tour/.test(s)) return 'Travel';
  if (/gym|fitness|sport|yoga/.test(s)) return 'Fitness';
  if (/health|wellness|spa|ayurved/.test(s)) return 'Wellness';
  if (/tech|electronic|gadget/.test(s)) return 'Tech';
  if (/home|decor|furniture|interior/.test(s)) return 'Home';
  return 'Lifestyle';
}

/** One creator's run: brands found (Instagram first, Google fallback), pitches written and queued, her alert sent. */
async function findFor(db: ReturnType<typeof admin>, s: Settings, opt: { manual: boolean; dry: boolean; siteParam: string }): Promise<{ status: number; body: unknown }> {
  const { manual, dry } = opt;
  const result = (body: unknown, status = 200) => ({ status, body });
  if (!s.pitch_auto && !manual && !dry) return result({ skipped: 'autopilot is off' });

  const today = todayIST();
  const { data: all } = await db.from('pitches').select('brand_name, instagram, email, website, status, approved, found_on').eq('creator_id', s.id);
  const pitches = all ?? [];
  const waiting = pitches.filter((p) => p.status === 'ready' && !p.approved && s.pitch_mode === 'approve').length;
  const foundToday = pitches.filter((p) => p.found_on === today).length;
  const dailyCap = s.pitch_daily ?? 10;
  const manualCap = Math.max(30, dailyCap * 3);
  const want = manual
    ? Math.min(6, Math.max(0, manualCap - foundToday))
    : Math.max(0, dailyCap - Math.max(waiting, foundToday));
  if (!want) {
    return result({
      skipped: manual
        ? `daily limit (${manualCap}) reached — try again tomorrow`
        : waiting
          ? `${waiting} still waiting for you`
          : 'today is done',
    });
  }

  const { data: brands } = await db.from('brands').select('name, instagram, website').eq('creator_id', s.id);
  const seenName = new Set([...pitches.map((p) => norm(p.brand_name)), ...(brands ?? []).map((b) => norm(b.name))].filter(Boolean));
  const seenIg = new Set([...pitches.map((p) => norm(p.instagram)), ...(brands ?? []).map((b) => norm(b.instagram ?? ''))].filter(Boolean));
  const seenDomain = new Set(
    [...pitches.map((p) => domainOf(p.website || '') || (p.email ?? '').split('@')[1] || ''), ...(brands ?? []).map((b) => domainOf(b.website ?? ''))]
      .filter((d) => d && !/gmail|yahoo|outlook|hotmail/.test(d))
  );

  const { data: ig } = await db.from('ig_account').select('followers, avg_views, username').eq('id', s.id).maybeSingle();
  const { data: done } = await db.from('collabs').select('stage, brand:brands(name, category)').eq('creator_id', s.id).in('stage', ['live', 'wrapped']).limit(60);
  const pastBrands = [...new Set((done ?? []).map((c) => (c.brand as unknown as { name: string } | null)?.name).filter(Boolean))] as string[];
  const pastCats = [...new Set((done ?? []).map((c) => (c.brand as unknown as { category: string } | null)?.category).filter(Boolean))] as string[];
  const site = String(opt.siteParam || s.site_url || 'https://app.miracleapp.live').replace(/\/$/, '');
  const page = String(s.site_url || site).replace(/\/$/, '');
  const ownHandle = cleanHandle(ig?.username || s.handle || '');
  const creator = {
    name: s.display_name, handle: s.handle, niche: s.niche, city: s.city, languages: s.content_languages,
    followers: ig?.followers ?? s.followers, avg_views: ig?.avg_views ?? null, engagement: s.engagement,
    worked_with: pastBrands.slice(0, 12), categories_that_paid: pastCats.slice(0, 8),
  };

  const started = Date.now();
  const found: Found[] = [];

  // 1. Instagram-first discovery (Peer collabs + Apify Instagram Hashtag & Profile scrapers)
  const fromIg = await discoverFromInstagram(db, s, ownHandle, seenName, seenIg, seenDomain, want, foundToday);
  found.push(...fromIg);

  // 2. Google AI Scout fallback to top up if Instagram found fewer than `want`
  const exclude = [...new Set([...pitches.map((p) => p.brand_name), ...(brands ?? []).map((b) => b.name), ...found.map((f) => f.name)])];
  let scoutedN = fromIg.length, freshN = fromIg.length, lastErr: unknown = null;
  for (let round = 0; round < 2 && found.length < want && Date.now() - started < 65_000; round++) {
    const scouted = await ai<{ brands?: Brand[]; error?: string }>(db, s.id, site, 'scout', { count: Math.min(18, want - found.length + 6), creator, exclude: exclude.slice(-200) });
    if (!scouted?.brands?.length) {
      lastErr = scouted;
      break;
    }
    scoutedN += scouted.brands.length;
    const fresh = scouted.brands.filter((b) => {
      const d = domainOf(b.website);
      const ok = d && !seenName.has(norm(b.name)) && !(b.instagram && seenIg.has(norm(b.instagram))) && !seenDomain.has(d);
      exclude.push(b.name);
      seenName.add(norm(b.name));
      if (d) seenDomain.add(d);
      return ok;
    });
    freshN += fresh.length;
    for (let i = 0; i < fresh.length && found.length < want; i += 6) {
      const batch = await Promise.all(fresh.slice(i, i + 6).map(async (b) => {
        const sc = await siteContact(b.website);
        return { ...b, instagram: sc.instagram || b.instagram, domain: domainOf(b.website), email: sc.email, discovery: 'google' as const };
      }));
      for (const b of batch) {
        if ((b.email || b.instagram) && found.length < want && !found.some((f) => (b.domain && f.domain === b.domain) || (b.instagram && f.instagram === b.instagram))) {
          found.push(b);
        }
      }
    }
  }
  if (!found.length && !scoutedN) return result({ error: 'No brands came back from Instagram or Google search.', detail: lastErr }, 502);

  // 3. Write tailored pitches (5 at a time)
  const emailFound = found.filter((b) => Boolean(b.email));
  const slots = sendTimes(emailFound.length);
  let slotIdx = 0;

  const written = await Promise.all(found.map((b, k) => new Promise<unknown>((r) => setTimeout(r, Math.floor(k / 5) * 1500)).then(() => write(b))));
  async function write(b: Found) {
    return await ai<{ subject: string; body: string }>(db, s.id, site, 'pitch', {
      brand: b.name, brand_instagram: b.instagram, category: b.category, contact: '', why_they_fit: b.why,
      creator: s.display_name, handle: s.handle, niche: s.niche, city: s.city, followers: creator.followers,
      engagement: s.engagement, page_link: page, past_brands: pastBrands.slice(0, 5),
    });
  }

  const rows = [];
  let emailCount = 0;
  let dmCount = 0;
  for (const [k, b] of found.entries()) {
    const w = written[k] as { subject: string; body: string } | null;
    const subject = w?.subject?.trim() || `Content idea for ${b.name}`;
    const body =
      (w?.body?.trim() ||
        `Hi there,\n\nI'm ${s.display_name} (@${s.handle}), a ${s.niche || 'content'} creator from ${s.city || 'India'}. I love what ${b.name} is doing and would really enjoy creating content for you.\n\nMy rates, past work and live Instagram numbers are all here: ${page}\n\nWould you be open to a quick chat?\n\nThanks,\n${s.display_name}`) +
      (b.email ? `\n\nNot the right fit right now? Just reply "no" and I won't write again.` : '');

    if (b.email) {
      emailCount++;
      rows.push({
        creator_id: s.id, brand_name: b.name, instagram: b.instagram, category: b.category, email: b.email, website: b.website, subject, body,
        status: 'ready', source: 'autopilot', fit_note: b.why, found_on: today, approved: s.pitch_mode === 'auto', send_after: slots[slotIdx++], auto_follow: true,
      });
    } else {
      dmCount++;
      rows.push({
        creator_id: s.id, brand_name: b.name, instagram: b.instagram, category: b.category, email: '', website: b.website, subject, body,
        status: 'idea', source: 'autopilot', fit_note: `${b.why} · DM on Instagram`, found_on: today, approved: false, send_after: null, auto_follow: false,
      });
    }
  }

  if (dry) return result({ dry: true, want, fromInstagram: fromIg.length, emailCount, dmCount, found: rows.length, seconds: Math.round((Date.now() - started) / 1000), rows });
  if (rows.length) {
    const { error } = await db.from('pitches').insert(rows);
    if (error) return result({ error: error.message }, 500);
    await pushToCreator(db, s.id, {
      title: `${rows.length} new brand${rows.length === 1 ? '' : 's'} found on Instagram`,
      body: `${rows.slice(0, 3).map((r) => r.brand_name).join(', ')}${rows.length > 3 ? ' and more' : ''}${emailCount && dmCount ? ` (${emailCount} email, ${dmCount} IG DM)` : dmCount ? ' — ready to DM on Instagram' : ''}.`,
      url: '/studio/pitches',
      tag: 'pitch-autopilot',
      kind: 'pitches_found',
    });
  }
  return result({
    added: rows.length,
    emailCount,
    dmCount,
    fromInstagram: fromIg.length,
    scouted: scoutedN,
    fresh: freshN,
    ...(rows.length ? {} : { skipped: 'no new brands found today' }),
    brands: rows.map((r) => (r.email ? `${r.brand_name} <${r.email}>` : `${r.brand_name} (@${r.instagram})`)),
  });
}

/** The AI job through a single-use pass (no keys leave the server), charged to this creator. */
async function ai<T>(db: ReturnType<typeof admin>, creator: number, site: string, kind: string, payload: Record<string, unknown>): Promise<T | null> {
  const ticket = crypto.randomUUID() + crypto.randomUUID();
  const { error } = await db.from('ai_tickets').insert({ creator_id: creator, token: ticket, kind });
  if (error) return null;
  const r = await fetch(`${site}/api/ai/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ai-ticket': ticket, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null);
  return ((await r?.json().catch(() => null)) as T | null) ?? null;
}

/** Today's send times: from 10 AM (or now, if later) every 45 minutes until 6 PM, then tomorrow. */
function sendTimes(n: number) {
  const out: string[] = [];
  const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3600e3);
  let t = new Date(Math.max(Date.now() + 10 * 60e3, Date.parse(`${todayIST()}T10:00:00+05:30`)));
  for (let i = 0; i < n; i++) {
    if (ist(t).getUTCHours() >= 18) t = new Date(Date.parse(`${todayIST(1)}T10:00:00+05:30`));
    out.push(t.toISOString());
    t = new Date(t.getTime() + 45 * 60e3);
  }
  return out;
}

// ---------- a public business email (and the brand's Instagram) from its own website ----------
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BAD = /(\.(png|jpe?g|gif|webp|svg|css|js)$)|example\.|sentry|wixpress|domain\.com|email\.com|yourname|@2x|noreply|no-reply|donotreply|privacy|legal|grievance|careers|jobs|hr@|recruit|admission|returns?@|refund|orders?@|invest|ir@|compliance|accounts@|billing|resv\./i;
const GOOD = ['collab', 'influenc', 'creator', 'partner', 'marketing', 'pr@', 'brand', 'social', 'media', 'hello', 'contact', 'info', 'care', 'support'];

const IG_NOT = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct', 'about', 'legal', 'developer', 'developers', 'share', 'sharer', 'web', 'embed', 'static', 'privacy', 'help', '_u', 'emails', 'oauth', 'challenge', 'instagram']);

async function siteContact(website: string): Promise<{ email: string; instagram: string }> {
  const none = { email: '', instagram: '' };
  const base = (() => {
    try {
      const u = new URL(website);
      return `${u.protocol}//${u.host}`;
    } catch {
      return '';
    }
  })();
  if (!base) return none;
  const domain = domainOf(base);
  const home = await get(base);
  if (!home) return none;
  const links = [...home.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map((m) => m[1])
    .filter((h) => /contact|collab|partner|influenc|creator|about/i.test(h))
    .map((h) => (h.startsWith('http') ? h : `${base}${h.startsWith('/') ? '' : '/'}${h}`))
    .filter((h) => domainOf(h) === domain);
  const extra = [...new Set([...links, `${base}/pages/contact`, `${base}/contact`, `${base}/contact-us`])].slice(0, 4);
  const pages = [home, ...(await Promise.all(extra.map(get)))].filter(Boolean) as string[];
  const emails = new Set<string>();
  for (const html of pages) {
    for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) emails.add(cfDecode(m[1]));
    for (const m of html.replace(/&#64;|\[at\]|\(at\)/gi, '@').matchAll(EMAIL)) emails.add(m[0]);
  }
  const ok = [...emails].map((e) => e.toLowerCase().replace(/^mailto:/, '')).filter((e) => !BAD.test(e));
  const score = (e: string) => (e.endsWith('@' + domain) || e.endsWith('.' + domain) ? 100 : /gmail|yahoo|outlook/.test(e) ? 10 : 0) + (20 - Math.min(20, GOOD.findIndex((g) => e.includes(g)) >>> 0));
  const handles = new Map<string, number>();
  for (const html of pages)
    for (const m of html.matchAll(/instagram\.com\/(?:#!\/)?([A-Za-z0-9._]{1,30})(?=[\/?"'#\s]|$)/gi)) {
      const h = m[1].replace(/\.+$/, '').toLowerCase();
      if (h && !IG_NOT.has(h)) handles.set(h, (handles.get(h) ?? 0) + 1);
    }
  return {
    email: ok.sort((a, b) => score(b) - score(a))[0] ?? '',
    instagram: [...handles.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
  };
}

function cfDecode(hex: string) {
  const k = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k);
  return out;
}

async function get(url: string) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MiracleBot/1.0; +https://miracleapp.live)' },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok || !/html|text/i.test(r.headers.get('content-type') ?? '')) return '';
    return (await r.text()).slice(0, 150_000);
  } catch {
    return '';
  }
}
