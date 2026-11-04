// Builds the launch-kit page (out/kit/index.html) from posts.cjs and the rendered files in out/:
// every slide as a JPEG, each Reel and cover, and the captions with copy buttons.
//   node marketing/instagram/kit.cjs   (after build.cjs)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { POSTS } = require('./posts.cjs');

const OUT = path.join(__dirname, 'out');
const KIT = path.join(OUT, 'kit');
fs.rmSync(KIT, { recursive: true, force: true });
fs.mkdirSync(path.join(KIT, 'img'), { recursive: true });
fs.mkdirSync(path.join(KIT, 'video'), { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (h) => h.replace(/<[^>]+>/g, '');
const jpg = (src, dst) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-q:v', '2', dst]);

const DAYS = { p1: 1, p2: 1, p3: 1, r4: 2, p5: 2, p6: 2, r7: 3, r8: 3, p9: 3 };
const PIN = { r4: 'Pin this', p1: 'Pin this', p9: 'Pin this' };

const posts = POSTS.map((p, i) => {
	const dir = path.join(OUT, `${p.id}-${p.slug}`);
	const media = [];
	if (p.kind === 'carousel') {
		fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort().forEach((f) => {
			const name = f.replace('.png', '.jpg');
			jpg(path.join(dir, f), path.join(KIT, 'img', name));
			media.push(`img/${name}`);
		});
	} else {
		jpg(path.join(dir, `${p.id}-cover.png`), path.join(KIT, 'img', `${p.id}-cover.jpg`));
		fs.copyFileSync(path.join(dir, `${p.id}-${p.slug}.mp4`), path.join(KIT, 'video', `${p.id}.mp4`));
	}
	const title = p.kind === 'carousel' ? plain(p.slides[0].title) : plain(p.cover.title);
	return { ...p, n: i + 1, media, title, day: DAYS[p.id] };
});

const card = (p) => {
	const caption = `${p.caption}\n\n${p.tags}`;
	const mediaHtml =
		p.kind === 'carousel'
			? `<div class="rail" tabindex="0" aria-label="${p.media.length} slides, scroll sideways">${p.media.map((m, k) => `<figure><img src="${m}" alt="Slide ${k + 1} of ${p.media.length}" loading="lazy" width="1080" height="1350"><figcaption>${k + 1}/${p.media.length}</figcaption></figure>`).join('')}</div>`
			: `<div class="rail reel"><figure><video src="video/${p.id}.mp4" poster="img/${p.id}-cover.jpg" controls playsinline muted preload="none" width="1080" height="1920"></video><figcaption>Reel · ${Math.round(p.scenes.reduce((a, s) => a + s.dur, 0))} s</figcaption></figure><figure><img src="img/${p.id}-cover.jpg" alt="Reel cover" loading="lazy" width="1080" height="1920"><figcaption>Cover</figcaption></figure></div>`;
	return `<article class="post" id="${p.id}">
  <header class="ph">
    <span class="no">${p.n}</span>
    <div class="pt"><h3>${esc(p.title)}</h3>
      <p class="meta"><span class="chip">${p.kind === 'carousel' ? `Carousel · ${p.media.length} slides` : 'Reel'}</span><span class="chip">Day ${p.day}</span>${PIN[p.id] ? '<span class="chip pin">Pin to profile</span>' : ''}</p></div>
  </header>
  ${mediaHtml}
  <div class="cap">
    <div class="cap-h"><span class="lbl">Caption</span><button type="button" class="copy" data-for="c-${p.id}">Copy caption</button></div>
    <pre id="c-${p.id}">${esc(caption)}</pre>
    ${p.audio ? `<p class="tip"><b>Audio:</b> ${esc(p.audio)}</p>` : ''}
  </div>
</article>`;
};

// Profile grid as it reads once all nine are up: newest first.
const grid = [...posts].reverse().map((p) => `<a href="#${p.id}" class="g"><img src="${p.kind === 'carousel' ? p.media[0] : `img/${p.id}-cover.jpg`}" alt="${esc(p.title)}" loading="lazy"><span>${p.n}</span>${p.kind === 'reel' ? '<i>Reel</i>' : ''}</a>`).join('');

const html = `<title>Miracle Instagram Launch Kit</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap">
<style>
/* A posting desk: the plan up top, then the nine posts in the order they go up, each with its media rail and caption. */
:root{
  --bg:#F7F4F4;--surface:#FFFFFF;--line:#E6DCDC;--ink:#1E171C;--ink-2:#5A5057;--accent:#C8255E;--plum:#6B3FD4;
  --em:linear-gradient(100deg,#6B3FD4,#D4296A 55%,#E2782A);
  --f-display:'Instrument Serif',Georgia,'Times New Roman',serif;--f-body:'Geist',system-ui,-apple-system,'Segoe UI',sans-serif;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#140D12;--surface:#1F161C;--line:#33272F;--ink:#FBF2F6;--ink-2:#B9AAB3;--accent:#F25A90;--plum:#B79BFF;--em:linear-gradient(100deg,#B79BFF,#F25A90 55%,#FFAE6B);color-scheme:dark}}
:root[data-theme="dark"]{--bg:#140D12;--surface:#1F161C;--line:#33272F;--ink:#FBF2F6;--ink-2:#B9AAB3;--accent:#F25A90;--plum:#B79BFF;--em:linear-gradient(100deg,#B79BFF,#F25A90 55%,#FFAE6B);color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:400 16px/1.55 var(--f-body);-webkit-font-smoothing:antialiased}
.wrap{max-width:1040px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:40px 80px;display:grid;gap:56px}
em{font-style:italic;background:var(--em);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.06em}
h1,h2,h3{font-family:var(--f-display);font-weight:400;letter-spacing:-.01em;text-wrap:balance;margin:0}
h1{font-size:clamp(44px,8vw,76px);line-height:.98}
h2{font-size:clamp(30px,5vw,40px);line-height:1.05}
h3{font-size:26px;line-height:1.15}
.eb{font:600 12px/1 var(--f-body);letter-spacing:.2em;text-transform:uppercase;color:var(--ink-2)}
.intro{display:grid;gap:18px;max-width:680px}
.intro p{margin:0;color:var(--ink-2);font-size:18px}
.plan{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,340px);gap:40px;align-items:start}
.steps{margin:0;padding:0;list-style:none;display:grid;gap:18px;counter-reset:s}
.steps li{display:grid;grid-template-columns:36px minmax(0,1fr);gap:12px;counter-increment:s}
.steps li::before{content:counter(s);font:italic 400 30px/1 var(--f-display);color:var(--accent)}
.steps b{display:block;font-weight:600}
.steps span{color:var(--ink-2)}
.gridbox{display:grid;gap:10px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;background:var(--surface);padding:3px;border:1px solid var(--line)}
.g{position:relative;display:block;aspect-ratio:3/4;overflow:hidden;max-width:100%}
.g img{width:100%;height:100%;object-fit:cover;display:block}
.g span{position:absolute;left:6px;top:6px;font:600 11px/1 var(--f-body);background:rgba(0,0,0,.6);color:#fff;padding:4px 6px}
.g i{position:absolute;right:6px;top:6px;font:600 10px/1 var(--f-body);letter-spacing:.1em;text-transform:uppercase;font-style:normal;background:rgba(0,0,0,.6);color:#fff;padding:4px 6px}
.small{font-size:13px;color:var(--ink-2);margin:0}
.posts{display:grid;gap:44px}
.post{display:grid;gap:18px;padding-top:28px;border-top:1px solid var(--line)}
.ph{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;align-items:start}
.no{font:italic 400 54px/.8 var(--f-display);background:var(--em);-webkit-background-clip:text;background-clip:text;color:transparent;min-width:40px}
.pt{display:grid;gap:10px}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:0}
.chip{font:600 12px/1 var(--f-body);letter-spacing:.06em;padding:7px 10px;border:1px solid var(--line);color:var(--ink-2)}
.chip.pin{border-color:var(--accent);color:var(--accent)}
.rail{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:10px;margin:0 calc(-1 * max(16px,env(safe-area-inset-left,0px)));padding-inline:max(16px,env(safe-area-inset-left,0px))}
.rail:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
.rail figure{margin:0;flex:0 0 auto;width:min(300px,72vw);scroll-snap-align:start;display:grid;gap:6px}
.rail.reel figure{width:min(260px,62vw)}
.rail img,.rail video{width:100%;height:auto;display:block;background:var(--surface);border:1px solid var(--line)}
.rail figcaption{font:500 12px/1 var(--f-body);color:var(--ink-2);font-variant-numeric:tabular-nums}
.cap{display:grid;gap:10px;max-width:680px}
.cap-h{display:flex;justify-content:space-between;align-items:center;gap:12px}
.lbl{font:600 12px/1 var(--f-body);letter-spacing:.2em;text-transform:uppercase;color:var(--ink-2)}
.copy{font:700 12px/1 var(--f-body);letter-spacing:.14em;text-transform:uppercase;padding:12px 16px;border:0;cursor:pointer;background:var(--ink);color:var(--bg);box-shadow:4px 4px 0 var(--accent)}
.copy:active{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--accent)}
.copy:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.copy.done{background:var(--plum)}
pre{margin:0;white-space:pre-wrap;word-break:break-word;font:400 15px/1.55 var(--f-body);background:var(--surface);border:1px solid var(--line);padding:16px 18px;user-select:text}
.tip{margin:0;font-size:14px;color:var(--ink-2)}
.after{display:grid;gap:14px;max-width:680px}
.after ul{margin:0;padding-left:20px;display:grid;gap:8px;color:var(--ink-2)}
.after b{color:var(--ink)}
@media (max-width:760px){.plan{grid-template-columns:minmax(0,1fr)}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style>
<div class="wrap">
  <section class="intro">
    <span class="eb">@themiracleapp · first 9 posts</span>
    <h1>Instagram <em>launch kit</em></h1>
    <p>Six carousels and three Reels, made from Miracle’s real screens, each with a caption ready to paste. Post them over three days so the grid is full before you start inviting creators.</p>
  </section>

  <section class="plan" aria-label="How to post">
    <div style="display:grid;gap:18px;min-width:0">
      <h2>How to post them</h2>
      <ol class="steps">
        <li><div><b>Save the files to your phone.</b><span>Long-press each slide below and choose Save image (or use the zip from the chat). Keep slides in order.</span></div></li>
        <li><div><b>Post in order, three a day.</b><span>Day 1: posts 1–3. Day 2: posts 4–6. Day 3: posts 7–9. Copy each caption with its button.</span></div></li>
        <li><div><b>Reels: upload the video, then set the cover.</b><span>Tap Edit cover › Add from camera roll and pick the cover image. Add a trending track in Instagram, quietly under the text.</span></div></li>
        <li><div><b>Pin three to the top.</b><span>Pin the demo Reel (4), the pricing post (1) and “Free, 0% commission” (9). New visitors see those first.</span></div></li>
        <li><div><b>Reply to every comment in the first hour.</b><span>Early replies push the post further. For the “Comment RATE” style asks, answer by hand until there are too many.</span></div></li>
      </ol>
    </div>
    <div class="gridbox">
      <span class="eb">Your grid once all 9 are up</span>
      <div class="grid">${grid}</div>
      <p class="small">Newest first, before pinning. Tap a square to jump to it.</p>
    </div>
  </section>

  <section class="posts" aria-label="The nine posts">
    ${posts.map(card).join('\n')}
  </section>

  <section class="after">
    <h2>After the first nine</h2>
    <ul>
      <li><b>3 Reels and 2 carousels a week,</b> plus a few Stories a day (polls like “What did your last brand pay you?”).</li>
      <li><b>Turn on Trial Reels</b> for new Reels, so they’re shown to non-followers first.</li>
      <li><b>Invite the creators who sign up to Collab posts,</b> so a post lands on their followers’ feeds too.</li>
      <li><b>Comment early</b> on bigger Indian creator-economy accounts, every day, with something useful.</li>
      <li><b>Track saves and shares per post,</b> profile visits, link taps and sign-ups from Instagram. Make more of what gets shared.</li>
    </ul>
    <p class="small">General guidance in the contract, payment and barter posts is not legal or tax advice; each says so on the slide.</p>
  </section>
</div>
<script>
document.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', () => {
  const pre = document.getElementById(b.dataset.for);
  const done = () => { b.textContent = 'Copied'; b.classList.add('done'); setTimeout(() => { b.textContent = 'Copy caption'; b.classList.remove('done'); }, 1800); };
  const select = () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'Selected, copy it'; };
  try { navigator.clipboard.writeText(pre.textContent).then(done, select); } catch (e) { select(); }
}));
</script>
`;
fs.writeFileSync(path.join(KIT, 'index.html'), html);
console.log('kit', posts.length, 'posts', fs.readdirSync(path.join(KIT, 'img')).length, 'images');
