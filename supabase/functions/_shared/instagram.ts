// Instagram API with Instagram Login (free, for her own professional account).
// With IG_MOCK=1 (local development only) a simulated account is used instead, so everything can be
// tested without a Meta app.
const GRAPH = 'https://graph.instagram.com';
const APP_ID = Deno.env.get('INSTAGRAM_APP_ID') ?? '';
const APP_SECRET = Deno.env.get('INSTAGRAM_APP_SECRET') ?? '';
export const MOCK = Deno.env.get('IG_MOCK') === '1';

export type Profile = { user_id: string; username: string; name: string; profile_picture_url: string; followers_count: number; follows_count: number; media_count: number };
export type Media = {
  id: string; caption?: string; media_type: string; media_product_type?: string; permalink: string; timestamp: string;
  thumbnail_url?: string; media_url?: string; like_count?: number; comments_count?: number;
};
export type Insights = { views?: number; reach?: number; saved?: number; shares?: number; likes?: number; comments?: number; replies?: number; total_interactions?: number };
export type Demographics = Record<'age' | 'gender' | 'city' | 'country', Record<string, number>>;
/** Account totals for a period: reach, views, accounts_engaged, total_interactions, likes, comments, shares, saves, profile_links_taps. */
export type AccountTotals = Record<string, number>;

export class IgError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

async function get(path: string, params: Record<string, string>) {
  const u = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u);
  const json = await res.json();
  if (json.error) throw new IgError(json.error.message ?? 'Instagram error', json.error.code);
  return json;
}

// ---------------------------------------------------------------------------
// Real client
// ---------------------------------------------------------------------------
const real = {
  configured: APP_ID !== '' && APP_SECRET !== '',

  async exchangeCode(code: string, redirectUri: string) {
    const form = new URLSearchParams({ client_id: APP_ID, client_secret: APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri, code });
    const res = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form });
    const short = await res.json();
    if (!short.access_token) throw new IgError(short.error_message ?? short.error?.message ?? 'Instagram did not accept the sign-in code.');
    const long = await get('/access_token', { grant_type: 'ig_exchange_token', client_secret: APP_SECRET, access_token: short.access_token });
    return { token: long.access_token as string, expiresIn: Number(long.expires_in) || 5184000 };
  },

  async refresh(token: string) {
    const r = await get('/refresh_access_token', { grant_type: 'ig_refresh_token', access_token: token });
    return { token: r.access_token as string, expiresIn: Number(r.expires_in) || 5184000 };
  },

  profile: (token: string): Promise<Profile> =>
    get('/me', { fields: 'user_id,username,name,profile_picture_url,followers_count,follows_count,media_count', access_token: token }),

  async media(token: string, limit = 40): Promise<Media[]> {
    const r = await get('/me/media', {
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url,like_count,comments_count',
      limit: String(limit), access_token: token,
    });
    return r.data ?? [];
  },

  // Not every metric exists for every post type, and asking for one that doesn't fails the whole call,
  // so we try the full set first and fall back to smaller ones.
  async insights(token: string, mediaId: string): Promise<Insights> {
    const sets = ['views,reach,saved,shares,likes,comments,total_interactions', 'views,reach,likes,comments', 'reach'];
    for (const metric of sets) {
      try {
        const r = await get(`/${mediaId}/insights`, { metric, access_token: token });
        const out: Insights = {};
        for (const m of r.data ?? []) {
          const v = m.values?.[0]?.value ?? m.total_value?.value;
          if (typeof v === 'number') (out as Record<string, number>)[m.name] = v;
        }
        return out;
      } catch (e) {
        if (!(e instanceof IgError)) throw e;
      }
    }
    return {};
  },

  /** A Reel's average watch time per view, in milliseconds (null if Instagram has none). */
  async watchTime(token: string, mediaId: string): Promise<number | null> {
    try {
      const r = await get(`/${mediaId}/insights`, { metric: 'ig_reels_avg_watch_time', access_token: token });
      const m = (r.data ?? [])[0];
      const v = m?.values?.[0]?.value ?? m?.total_value?.value;
      return typeof v === 'number' && v > 0 ? v : null;
    } catch (e) {
      if (e instanceof IgError) return null;
      throw e;
    }
  },

  // Stories posted in the last 24 hours. Instagram drops them (and their numbers) after that.
  async stories(token: string): Promise<Media[]> {
    const r = await get('/me/stories', {
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp,thumbnail_url,media_url',
      access_token: token,
    });
    return r.data ?? [];
  },

  async storyInsights(token: string, mediaId: string): Promise<Insights> {
    const sets = ['reach,views,replies,shares,total_interactions', 'reach,replies,shares,total_interactions', 'reach,replies', 'reach'];
    for (const metric of sets) {
      try {
        const r = await get(`/${mediaId}/insights`, { metric, access_token: token });
        const out: Insights = {};
        for (const m of r.data ?? []) {
          const v = m.values?.[0]?.value ?? m.total_value?.value;
          if (typeof v === 'number') (out as Record<string, number>)[m.name] = v;
        }
        return out;
      } catch (e) {
        if (!(e instanceof IgError)) throw e;
      }
    }
    return {};
  },

  // Account totals between two dates (Instagram allows at most 30 days per call). Metrics that don't
  // exist for this account make the whole call fail, so smaller sets are tried after.
  async accountTotals(token: string, since: Date, until: Date): Promise<AccountTotals> {
    const sets = [
      'reach,views,accounts_engaged,total_interactions,likes,comments,shares,saves,profile_links_taps',
      'reach,accounts_engaged,total_interactions,likes,comments,shares,saves',
      'reach,accounts_engaged,total_interactions',
      'reach',
    ];
    for (const metric of sets) {
      try {
        const r = await get('/me/insights', {
          metric, period: 'day', metric_type: 'total_value',
          since: String(Math.floor(since.getTime() / 1000)), until: String(Math.floor(until.getTime() / 1000)), access_token: token,
        });
        const out: AccountTotals = {};
        for (const m of r.data ?? []) {
          const v = m.total_value?.value ?? (m.values ?? []).reduce((a: number, x: { value: number }) => a + (Number(x.value) || 0), 0);
          if (typeof v === 'number') out[m.name] = v;
        }
        return out;
      } catch (e) {
        if (!(e instanceof IgError)) throw e;
      }
    }
    return {};
  },

  // Needs at least 100 followers; returns {} if Instagram has no data.
  async demographics(token: string): Promise<Partial<Demographics>> {
    const out: Partial<Demographics> = {};
    for (const breakdown of ['age', 'gender', 'city', 'country'] as const) {
      try {
        const r = await get('/me/insights', { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown, access_token: token });
        const results = r.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
        out[breakdown] = Object.fromEntries(results.map((x: { dimension_values: string[]; value: number }) => [x.dimension_values[0], x.value]));
      } catch {
        // No demographics available (small account or permission missing).
      }
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// Simulated account (local development)
// ---------------------------------------------------------------------------
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();
const MOCK_MEDIA: Media[] = [
  { id: 'm1', caption: '#ad Morning run, new routine. Gear from @kora.active ❤️ #running', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/mock1/', timestamp: daysAgo(0.3), thumbnail_url: '', like_count: 4210, comments_count: 188 },
  { id: 'm2', caption: 'Night routine with the new Vitamin C serum from @lumiere.skin ✨', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/mock2/', timestamp: daysAgo(1), thumbnail_url: '', like_count: 2950, comments_count: 97 },
  { id: 'm3', caption: 'Sunday in Coorg 🌧️', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/mock3/', timestamp: daysAgo(3), thumbnail_url: '', like_count: 5120, comments_count: 230 },
  { id: 'm4', caption: 'What I wore this week', media_type: 'VIDEO', media_product_type: 'REELS', permalink: 'https://www.instagram.com/reel/mock4/', timestamp: daysAgo(6), thumbnail_url: '', like_count: 3880, comments_count: 141 },
  { id: 'm5', caption: '#collab Monsoon weekend in Coorg with @northstar.trips. Full itinerary in the carousel!', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', permalink: 'https://www.instagram.com/p/mock5/', timestamp: daysAgo(9), thumbnail_url: '', like_count: 6120, comments_count: 312 },
];
const mock = {
  configured: true,
  exchangeCode: async (_c: string, _r: string) => ({ token: 'mock-token', expiresIn: 5184000 }),
  refresh: async (_t: string) => ({ token: 'mock-token', expiresIn: 5184000 }),
  profile: async (_t: string): Promise<Profile> => ({ user_id: '1784000000', username: 'nicks_universe_it_is', name: 'Niveditha', profile_picture_url: '', followers_count: 251340, follows_count: 812, media_count: 642 }),
  media: async (_t: string) => MOCK_MEDIA,
  insights: async (_t: string, id: string): Promise<Insights> => {
    const seed = id.charCodeAt(1) * 7919;
    const views = 60000 + (seed % 90000);
    return { views, reach: Math.round(views * 0.62), saved: 300 + (seed % 900), shares: 120 + (seed % 400), likes: 3000 + (seed % 2000), comments: 90 + (seed % 120) };
  },
  watchTime: async (_t: string, id: string): Promise<number | null> => 4000 + ((id.charCodeAt(1) * 7919) % 9000),
  stories: async (_t: string): Promise<Media[]> => [
    { id: 's1', caption: '', media_type: 'IMAGE', media_product_type: 'STORY', permalink: 'https://www.instagram.com/stories/mock/s1/', timestamp: daysAgo(0.1), thumbnail_url: '' },
    { id: 's2', caption: 'Unboxing @lumiere.skin', media_type: 'VIDEO', media_product_type: 'STORY', permalink: 'https://www.instagram.com/stories/mock/s2/', timestamp: daysAgo(0.05), thumbnail_url: '' },
  ],
  storyInsights: async (_t: string, id: string): Promise<Insights> => {
    const seed = id.charCodeAt(1) * 3571;
    const views = 9000 + (seed % 6000);
    return { views, reach: Math.round(views * 0.8), replies: 12 + (seed % 30), shares: 8 + (seed % 20), total_interactions: 60 + (seed % 90) };
  },
  demographics: async (_t: string): Promise<Partial<Demographics>> => ({
    age: { '18-24': 31200, '25-34': 118400, '35-44': 52100, '45-54': 14800 },
    gender: { F: 172300, M: 76100, U: 2900 },
    city: { 'Bengaluru, Karnataka': 41200, 'Mumbai, Maharashtra': 33800, 'Delhi, Delhi': 22100, 'Hyderabad, Telangana': 15600, 'Pune, Maharashtra': 11900 },
    country: { IN: 221400, AE: 8100, US: 6900, GB: 4200, SG: 2600 },
  }),
  accountTotals: async (_t: string, since: Date, _u: Date): Promise<AccountTotals> => {
    const older = Date.now() - since.getTime() > 45 * 864e5;
    const k = older ? 0.86 : 1;
    return { reach: Math.round(1840000 * k), views: Math.round(5210000 * k), accounts_engaged: Math.round(96400 * k), total_interactions: Math.round(312000 * k), likes: Math.round(251000 * k), comments: Math.round(8400 * k), shares: Math.round(21800 * k), saves: Math.round(30800 * k), profile_links_taps: Math.round(4100 * k) };
  },
};

export const ig = MOCK ? mock : real;
