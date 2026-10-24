// Tells Bing, Yandex and the other IndexNow search engines about every page in the sitemaps (run after a
// deploy that adds or changes pages): node site/build/indexnow.mjs
const KEY = '37a193ba37959d8add1e6f7db6e846ff';
const HOST = 'www.miracleapp.live';
const grab = async (u) => [...(await (await fetch(u)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const urls = [...new Set([...(await grab('https://www.miracleapp.live/sitemap.xml')), ...(await grab('https://www.miracleapp.live/creators/sitemap.xml'))])].filter((u) => new URL(u).host === HOST);
const r = await fetch('https://api.indexnow.org/indexnow', {
	method: 'POST',
	headers: { 'content-type': 'application/json; charset=utf-8' },
	body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls })
});
console.log('IndexNow', r.status, urls.length, 'urls');
