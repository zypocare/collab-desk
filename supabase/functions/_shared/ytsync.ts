// YouTube: her channel's recent videos and Shorts with views and likes, from the channel's public
// feed (no key needed). With a YouTube Data API key (secret YOUTUBE_API_KEY), the subscriber count.
// deno-lint-ignore-file no-explicit-any
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; CollabDesk/1.0)', 'accept-language': 'en' };

/** A channel id from a link, an @handle or the id itself. */
export async function resolveChannel(input: string): Promise<string> {
  const s = input.trim();
  const direct = s.match(/(UC[\w-]{22})/);
  if (direct) return direct[1];
  const handle = s.match(/@([\w.-]+)/)?.[1] ?? (/^[\w.-]+$/.test(s) ? s : '');
  if (!handle) throw new Error('Paste your channel link, like youtube.com/@yourname.');
  const html = await (await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, { headers: UA })).text();
  const id = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1] ?? html.match(/"channelId":"(UC[\w-]{22})"/)?.[1];
  if (!id) throw new Error(`Couldn't find the channel @${handle}. Check the link.`);
  return id;
}

type Video = { video_id: string; title: string; published_at: string; views: number | null; likes: number | null; thumbnail: string; is_short: boolean };

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export async function runYoutube(db: any) {
  const { data: s } = await db.from('creator_settings').select('youtube_channel, youtube_channel_id').eq('id', 1).single();
  if (!s?.youtube_channel) return { skipped: 'No YouTube channel added.' };
  try {
    const id = s.youtube_channel_id || (await resolveChannel(s.youtube_channel));
    const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: UA })).text();
    if (!xml.includes('<feed')) throw new Error("YouTube didn't return the channel's videos. Try again later.");
    const title = decode(xml.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
    const videos: Video[] = [];
    for (const e of xml.split('<entry>').slice(1)) {
      const vid = e.match(/<yt:videoId>([^<]+)/)?.[1];
      if (!vid) continue;
      // A Short opens at /shorts/<id>; a normal video is redirected to /watch.
      const r = await fetch(`https://www.youtube.com/shorts/${vid}`, { method: 'HEAD', redirect: 'manual', headers: UA }).catch(() => null);
      videos.push({
        video_id: vid,
        title: decode(e.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''),
        published_at: e.match(/<published>([^<]+)/)?.[1] ?? new Date().toISOString(),
        views: Number(e.match(/<media:statistics views="(\d+)"/)?.[1] ?? NaN) || null,
        likes: Number(e.match(/<media:starRating count="(\d+)"/)?.[1] ?? NaN) || null,
        thumbnail: e.match(/<media:thumbnail url="([^"]+)"/)?.[1] ?? '',
        is_short: r?.status === 200
      });
    }
    let subscribers: number | null = null;
    const key = Deno.env.get('YOUTUBE_API_KEY') ?? '';
    if (key) {
      const j = await (await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${id}&key=${key}`)).json();
      const n = Number(j?.items?.[0]?.statistics?.subscriberCount);
      if (n) subscribers = n;
    }
    const now = new Date().toISOString();
    if (videos.length) await db.from('yt_videos').upsert(videos.map((v) => ({ ...v, synced_at: now })));
    await db.from('creator_settings').update({ youtube_channel_id: id, youtube_title: title, youtube_synced_at: now, youtube_error: '', ...(subscribers ? { youtube_subscribers: subscribers } : {}) }).eq('id', 1);
    return { ok: true, videos: videos.length, shorts: videos.filter((v) => v.is_short).length, subscribers };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('creator_settings').update({ youtube_error: msg.slice(0, 300) }).eq('id', 1);
    throw e;
  }
}
