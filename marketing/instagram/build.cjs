// Miracle's Instagram launch posts, drawn from code: carousels (1080×1350), Reels (1080×1920 MP4) and
// Reel covers, in the website's look and with the app's real screens (site/img/screen-*.webp).
//
//   node marketing/instagram/build.cjs            everything
//   node marketing/instagram/build.cjs p1 r4      only those posts
//
// Files land in marketing/instagram/out/ (not committed). Needs Playwright's Chromium and ffmpeg.
// The words live in posts.cjs; this file only draws them.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { POSTS } = require('./posts.cjs');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out');
const TMP = path.join(OUT, '_frames');
const SCREEN = (n) => `file://${ROOT}/site/img/screen-${n}.webp`;
const ICON = fs.readFileSync(path.join(ROOT, 'web/static/icon.svg'), 'utf8');
const FPS = 30;

const FONTS =
	'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
	'<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=block" rel="stylesheet">';

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--g1:#6B3FD4;--g2:#D4296A;--g3:#F2994A;--grad:linear-gradient(115deg,var(--g1),var(--g2) 52%,var(--g3));
  --serif:'Instrument Serif',Georgia,serif;--sans:'Geist',system-ui,sans-serif}
.dark{--bg:#1C1219;--ink:#FBF2F6;--ink-2:rgba(251,242,246,.74);--ink-3:rgba(251,242,246,.5);--line:rgba(251,242,246,.14);--card:#F7F4F4;--card-ink:#1E171C;--em:linear-gradient(100deg,#B79BFF,#F25A90 55%,#FFAE6B)}
.light{--bg:#F7F4F4;--ink:#1E171C;--ink-2:#4F464C;--ink-3:#7A6F76;--line:#E2D8D8;--card:#1C1219;--card-ink:#FBF2F6;--em:linear-gradient(100deg,#6B3FD4,#D4296A 55%,#E2782A)}
html,body{background:var(--bg)}
body{font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased;overflow:hidden}
.glow{position:absolute;inset:0;pointer-events:none}
.dark .glow{background:radial-gradient(60% 45% at 8% 0%,rgba(107,63,212,.55),transparent 70%),radial-gradient(55% 40% at 100% 100%,rgba(212,41,106,.38),transparent 70%),radial-gradient(40% 30% at 100% 0%,rgba(242,153,74,.14),transparent 70%)}
.light .glow{background:radial-gradient(55% 40% at 0% 0%,rgba(107,63,212,.13),transparent 70%),radial-gradient(50% 40% at 100% 100%,rgba(212,41,106,.12),transparent 70%)}
em,.em{font-style:italic;background:var(--em);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.08em}
.eb{font:600 24px/1.2 var(--sans);letter-spacing:.22em;text-transform:uppercase;color:var(--ink-3)}
.serif{font-family:var(--serif);font-weight:400;letter-spacing:-.01em}
.brand{display:flex;align-items:center;gap:16px}
.brand svg{width:58px;height:58px;display:block}
.brand b{font:italic 400 46px/1 var(--serif);color:var(--ink)}
.neo{display:inline-flex;align-items:center;gap:14px;height:96px;padding:0 44px;font:700 26px/1 var(--sans);letter-spacing:.14em;text-transform:uppercase;color:#fff;background:var(--grad);box-shadow:10px 10px 0 #6A4BC9}
.phone{position:relative;border-radius:64px;background:#0B080A;padding:14px;box-shadow:0 50px 100px -30px rgba(0,0,0,.6),0 0 0 2px rgba(255,255,255,.08)}
.phone img{display:block;width:100%;border-radius:52px}
`;

const brand = `<div class="brand">${ICON}<b>Miracle</b></div>`;

// ---------- carousels ----------
const SLIDE_CSS = `
.s{position:relative;width:1080px;height:1350px;overflow:hidden;padding:88px 92px 200px;display:flex;flex-direction:column}
.mid{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center}
.cvp .mid{justify-content:flex-start;padding-top:70px}
.peek{position:absolute;right:-50px;top:600px;width:580px;transform:rotate(7deg);z-index:0}
.peek .phone{box-shadow:0 60px 120px -30px rgba(0,0,0,.7),0 0 0 2px rgba(255,255,255,.1)}
.cvp .foot{z-index:2}.cvp .foot .swipe{display:none}
.top{position:relative;display:flex;justify-content:space-between;align-items:center}
.pg{font:600 24px/1 var(--sans);letter-spacing:.12em;color:var(--ink-3)}
.foot{position:absolute;left:92px;right:92px;bottom:72px;display:flex;justify-content:space-between;align-items:center}
.foot .h{font:500 26px/1 var(--sans);color:var(--ink-3)}
.swipe{font:600 24px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--ink-2)}
.cv h1{font:400 148px/.96 var(--serif);letter-spacing:-.025em}
.cv h1.long{font-size:126px}
.cv p{font:400 42px/1.4 var(--sans);color:var(--ink-2);margin-top:48px;max-width:860px}
.cvp h1{font-size:132px}.cvp h1.long{font-size:116px}.cvp p{max-width:440px;font-size:38px}
.st .n{font:italic 400 260px/.8 var(--serif)}
.st h2{font:400 104px/1 var(--serif);letter-spacing:-.02em;margin-top:44px;max-width:900px}
.st p{font:400 42px/1.45 var(--sans);color:var(--ink-2);margin-top:44px;max-width:880px}
.st p b{color:var(--ink);font-weight:600}
.quote{margin-top:44px;background:var(--card);color:var(--card-ink);padding:44px 48px;box-shadow:12px 12px 0 var(--g2);font:400 36px/1.45 var(--sans);white-space:pre-line}
.quote .k{display:block;font:700 22px/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;opacity:.55;margin-bottom:22px}
.tp h2{font:400 96px/1 var(--serif);letter-spacing:-.02em;max-width:900px}
.tp .note{font:400 30px/1.4 var(--sans);color:var(--ink-3);margin-top:40px}
.ct{display:grid;grid-template-columns:1fr 430px;gap:44px;align-items:center}
.ct h2{font:400 92px/1 var(--serif);letter-spacing:-.02em}
.ct p{font:400 33px/1.45 var(--sans);color:var(--ink-2);margin-top:34px}
.ct .neo{margin-top:56px}
.ct .sub{font:500 26px/1.4 var(--sans);color:var(--ink-3);margin-top:34px}
.ct .phone{width:430px}
.fine{position:absolute;left:92px;right:92px;bottom:148px;font:400 24px/1.4 var(--sans);color:var(--ink-3)}
`;

function slideHtml(post, sl, i, n) {
	const pg = `<span class="pg">${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</span>`;
	const foot = i === 0 ? `<div class="foot">${brand}<span class="swipe">Swipe →</span></div>` : `<div class="foot">${brand}<span class="h">@themiracleapp</span></div>`;
	const eb = sl.t === 'cover' ? post.eyebrow : sl.eb || (sl.t === 'cta' ? 'Miracle does this for you' : sl.t === 'template' ? 'Copy-paste' : post.eyebrow);
	const top = `<div class="top"><span class="eb">${eb}</span>${sl.t === 'cover' && post.cover ? '<span class="swipe">Swipe →</span>' : pg}</div>`;
	let body = '';
	let cls = '';
	if (sl.t === 'cover') {
		cls = post.cover ? 'cv cvp' : 'cv';
		body = `<h1 class="${sl.long ? 'long' : ''}">${sl.title}</h1>${sl.sub ? `<p>${sl.sub}</p>` : ''}`;
	} else if (sl.t === 'step') {
		cls = 'st';
		body = `${sl.n ? `<div class="n em">${sl.n}</div>` : ''}<h2>${sl.title}</h2>${sl.body ? `<p>${sl.body}</p>` : ''}`;
	} else if (sl.t === 'template') {
		cls = 'tp';
		body = `<h2>${sl.title}</h2><div class="quote"><span class="k">${sl.label || 'Your reply'}</span>${sl.text}</div>${sl.note ? `<div class="note">${sl.note}</div>` : ''}`;
	} else if (sl.t === 'cta') {
		cls = 'ctw';
		body = `<div class="ct"><div class="l"><h2>${sl.title}</h2><p>${sl.body}</p><span class="neo">${sl.button || 'Link in bio'}</span><div class="sub">${sl.sub || 'Free for creators · 0% commission'}</div></div><div><div class="phone"><img src="${SCREEN(sl.screen)}"></div></div></div>`;
	}
	const peek = sl.t === 'cover' && post.cover ? `<div class="peek"><div class="phone"><img src="${SCREEN(post.cover)}"></div></div>` : '';
	return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}${SLIDE_CSS}</style></head><body class="${post.theme}"><div class="s ${cls}"><div class="glow"></div>${peek}<div style="position:relative">${top}</div><div class="mid">${body}</div>${sl.fine ? `<div class="fine">${sl.fine}</div>` : ''}${foot}</div></body></html>`;
}

// ---------- reels ----------
// A Reel is a list of scenes, each `dur` seconds. Scenes cross-fade; the phone slides its screens in.
const REEL_CSS = `
.r{position:relative;width:1080px;height:1920px;overflow:hidden}
.sc{position:absolute;inset:0;opacity:0}
.cap{position:absolute;left:90px;right:90px;top:250px;text-align:center}
.cap .eb{display:block;margin-bottom:28px}
.cap h2{font:400 104px/1 var(--serif);letter-spacing:-.02em}
.cap p{font:400 40px/1.35 var(--sans);color:var(--ink-2);margin-top:26px}
.ph{position:absolute;left:50%;top:700px;width:660px;margin-left:-330px}
.hook{position:absolute;left:90px;right:90px;top:430px;text-align:center}
.hook h1{font:400 150px/.95 var(--serif);letter-spacing:-.025em}
.hook p{font:400 44px/1.35 var(--sans);color:var(--ink-2);margin-top:44px}
.end{position:absolute;left:90px;right:90px;top:560px;text-align:center;display:flex;flex-direction:column;align-items:center}
.end .brand svg{width:110px;height:110px}.end .brand b{font-size:92px}
.end h2{font:400 112px/1 var(--serif);letter-spacing:-.02em;margin-top:70px}
.end p{font:400 42px/1.4 var(--sans);color:var(--ink-2);margin-top:36px}
.end .neo{margin-top:70px;height:110px;font-size:30px}
.mess{position:absolute;left:80px;right:80px;top:640px;height:900px}
.note{position:absolute;padding:34px 38px;font:500 38px/1.35 var(--sans);max-width:620px;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)}
.note.n-y{background:#FFF4B8;color:#3A3000}.note.n-w{background:#DCF8C6;color:#11300A;border-radius:28px 28px 28px 6px}.note.n-g{background:#2A2227;color:#FBF2F6;border-radius:28px}.note.n-r{background:#fff;color:#1E171C;border-radius:8px}
.note small{display:block;font:600 24px/1 var(--sans);opacity:.6;margin-bottom:14px;letter-spacing:.05em}
.tag{display:inline-block;padding:14px 26px;font:700 28px/1 var(--sans);letter-spacing:.24em;text-transform:uppercase}
.tag.bad{background:#2A2227;color:#FF7B70;box-shadow:8px 8px 0 #C2372E}.tag.good{background:var(--grad);color:#fff;box-shadow:8px 8px 0 #6A4BC9}
.link{display:inline-block;margin-top:80px;padding:44px 54px;background:#F7F4F4;color:#1E171C;font:600 60px/1 var(--sans);box-shadow:14px 14px 0 var(--g2)}
.link i{font-style:normal;color:#D4296A}
.caret{display:inline-block;width:5px;height:60px;background:#1E171C;vertical-align:-8px;margin-left:4px;animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
`;

function sceneHtml(s) {
	if (s.k === 'hook') return `<div class="hook">${s.eb ? `<span class="eb">${s.eb}</span>` : ''}<h1>${s.title}</h1>${s.sub ? `<p>${s.sub}</p>` : ''}</div>${s.screen ? `<div class="ph" style="top:1240px"><div class="phone"><img src="${SCREEN(s.screen)}"></div></div>` : ''}`;
	if (s.k === 'screen') return `<div class="cap">${s.eb ? `<span class="eb">${s.eb}</span>` : ''}<h2>${s.title}</h2>${s.sub ? `<p>${s.sub}</p>` : ''}</div><div class="ph"><div class="phone"><img src="${SCREEN(s.screen)}"></div></div>`;
	if (s.k === 'mess')
		return `<div class="cap"><span class="tag bad">${s.tag || 'Before'}</span><h2 style="margin-top:44px">${s.title}</h2></div><div class="mess">${s.notes
			.map((n, i) => `<div class="note n-${n.c}" data-pop="${i}" style="left:${n.x}px;top:${n.y}px;transform:rotate(${n.r}deg)">${n.small ? `<small>${n.small}</small>` : ''}${n.text}</div>`)
			.join('')}</div>`;
	if (s.k === 'link') return `<div class="hook" style="top:520px"><span class="eb">${s.eb}</span><h1 style="font-size:130px">${s.title}</h1><div class="link" data-type="${s.slug}"><span class="typed"></span><i>.miracleapp.live</i></div><p>${s.sub}</p></div>`;
	if (s.k === 'end') return `<div class="end">${brand}<h2>${s.title}</h2><p>${s.sub}</p><span class="neo">${s.button}</span></div>`;
	return '';
}

function reelHtml(post) {
	let t = 0;
	const parts = [];
	const anims = [];
	post.scenes.forEach((s, i) => {
		const first = i === 0;
		const last = i === post.scenes.length - 1;
		const fade = 0.25;
		// Opacity: in over `fade`, out over `fade` at the end (the last scene stays).
		anims.push(`#sc${i}{animation:sc${i} ${post.total}s linear both}
@keyframes sc${i}{0%{opacity:${first ? 1 : 0}}${pct(t - 0.12, post.total)}{opacity:${first ? 1 : 0}}${pct(t + 0.18, post.total)}{opacity:1}${last ? '' : `${pct(t + s.dur - fade, post.total)}{opacity:1}${pct(t + s.dur, post.total)}{opacity:0}`}100%{opacity:${last ? 1 : 0}}}
#sc${i} .ph{animation:ph${i} ${post.total}s cubic-bezier(.2,.8,.2,1) both}
@keyframes ph${i}{0%{transform:translateY(${first ? 0 : 140}px)}${pct(t, post.total)}{transform:translateY(${first ? 0 : 140}px)}${pct(t + 0.7, post.total)}{transform:translateY(0)}${pct(t + s.dur, post.total)}{transform:translateY(${s.scroll ? -s.scroll : -24}px)}100%{transform:translateY(${s.scroll ? -s.scroll : -24}px)}}
#sc${i} .cap,#sc${i} .hook,#sc${i} .end{animation:cp${i} ${post.total}s cubic-bezier(.2,.8,.2,1) both}
@keyframes cp${i}{0%{transform:translateY(${first ? 0 : 40}px)}${pct(t, post.total)}{transform:translateY(${first ? 0 : 40}px)}${pct(t + 0.6, post.total)}{transform:translateY(0)}100%{transform:translateY(0)}}`);
		if (s.k === 'mess')
			s.notes.forEach((n, j) => {
				const at = t + 0.3 + j * Math.min(0.55, (s.dur - 0.8) / s.notes.length);
				anims.push(`#sc${i} [data-pop="${j}"]{animation:pp${i}_${j} ${post.total}s cubic-bezier(.2,1.4,.35,1) both}
@keyframes pp${i}_${j}{0%{opacity:0;scale:.6}${pct(at, post.total)}{opacity:0;scale:.6}${pct(at + 0.35, post.total)}{opacity:1;scale:1}100%{opacity:1;scale:1}}`);
			});
		parts.push(`<div class="sc" id="sc${i}" data-start="${t}">${sceneHtml(s)}</div>`);
		t += s.dur;
	});
	return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}${REEL_CSS}${anims.join('\n')}</style></head><body class="${post.theme || 'dark'}"><div class="r"><div class="glow"></div>${parts.join('')}</div></body></html>`;
}
const pct = (s, total) => `${Math.max(0, Math.min(100, (s / total) * 100)).toFixed(3)}%`;

// The cover: the hook scene, still, with the phone peeking up from the bottom.
function coverHtml(post) {
	const s = post.cover;
	return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}${REEL_CSS}</style></head><body class="${post.theme || 'dark'}"><div class="r"><div class="glow"></div><div class="sc" style="opacity:1">${sceneHtml({ k: 'hook', ...s })}</div></div></body></html>`;
}

async function render(page, html, file, w, h) {
	const tmp = path.join(TMP, 'page.html');
	fs.writeFileSync(tmp, html);
	await page.setViewportSize({ width: w, height: h });
	await page.goto('file://' + tmp);
	await page.evaluate(() => document.fonts.ready);
	await page.waitForFunction(() => [...document.images].every((i) => i.complete));
	await page.waitForTimeout(150);
	await page.screenshot({ path: file, type: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: file.endsWith('.jpg') ? 92 : undefined });
}

async function renderReel(page, post, dir) {
	const html = reelHtml(post);
	const tmp = path.join(TMP, 'reel.html');
	fs.writeFileSync(tmp, html);
	await page.setViewportSize({ width: 1080, height: 1920 });
	await page.goto('file://' + tmp);
	await page.evaluate(() => document.fonts.ready);
	await page.waitForFunction(() => [...document.images].every((i) => i.complete));
	const frames = path.join(TMP, post.id);
	fs.mkdirSync(frames, { recursive: true });
	const n = Math.round(post.total * FPS);
	for (let f = 0; f < n; f++) {
		const ms = (f / FPS) * 1000;
		await page.evaluate(
			({ ms }) => {
				document.getAnimations().forEach((a) => {
					a.pause();
					a.currentTime = a.animationName === 'blink' ? ms : ms;
				});
				// The typed link: one letter every 90 ms from the scene's start + 0.5 s.
				document.querySelectorAll('[data-type]').forEach((el) => {
					const start = Number(el.closest('.sc').dataset.start) * 1000 + 500;
					const word = el.dataset.type;
					const k = Math.max(0, Math.min(word.length, Math.floor((ms - start) / 90)));
					el.querySelector('.typed').innerHTML = word.slice(0, k) + '<span class="caret"></span>';
				});
			},
			{ ms }
		);
		await page.screenshot({ path: path.join(frames, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90 });
	}
	const mp4 = path.join(dir, `${post.id}-${post.slug}.mp4`);
	execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', mp4]);
	fs.rmSync(frames, { recursive: true, force: true });
	return mp4;
}

(async () => {
	const only = process.argv.slice(2);
	fs.mkdirSync(TMP, { recursive: true });
	const b = await chromium.launch();
	const page = await b.newPage({ deviceScaleFactor: 1 });
	for (const post of POSTS) {
		if (only.length && !only.includes(post.id)) continue;
		const dir = path.join(OUT, `${post.id}-${post.slug}`);
		fs.mkdirSync(dir, { recursive: true });
		if (post.kind === 'carousel') {
			for (let i = 0; i < post.slides.length; i++) await render(page, slideHtml(post, post.slides[i], i, post.slides.length), path.join(dir, `${post.id}-${String(i + 1).padStart(2, '0')}.png`), 1080, 1350);
			console.log(post.id, post.slides.length, 'slides');
		} else {
			post.total = post.scenes.reduce((a, s) => a + s.dur, 0);
			await render(page, coverHtml(post), path.join(dir, `${post.id}-cover.png`), 1080, 1920);
			const mp4 = await renderReel(page, post, dir);
			console.log(post.id, post.total + 's', path.relative(ROOT, mp4));
		}
	}
	await b.close();
	fs.rmSync(TMP, { recursive: true, force: true });
})();
