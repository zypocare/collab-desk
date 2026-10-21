// The picture WhatsApp, Instagram and LinkedIn show when her brand page link is shared: her name,
// handle and live numbers on her colours. The studio redraws and uploads it whenever those numbers
// change; the server points the link preview at it.
import { supabase } from './supabase';
import { loadPhoto } from './brandQr';
import { compact, initials } from './util';
import type { PublicPage } from './types';
import { studio } from './studio.svelte';

const W = 1200, H = 630;

function facts(p: PublicPage) {
	const followers = p.instagram?.followers ? compact(p.instagram.followers) : p.followers || '';
	const er = p.instagram?.engagement_rate ? `${(+p.instagram.engagement_rate).toFixed(1)}%` : p.engagement || '';
	return {
		name: p.display_name || p.handle || 'Creator',
		handle: p.handle || '',
		line: [p.city, p.niche].map((x) => (x || '').trim()).filter(Boolean).join(' · '),
		stats: [
			followers && { v: followers, k: 'followers' },
			er && { v: er, k: 'engagement' },
			p.worked_with?.length && { v: String(p.worked_with.length), k: p.worked_with.length === 1 ? 'brand' : 'brands' }
		].filter(Boolean) as { v: string; k: string }[]
	};
}

async function draw(p: PublicPage, photoUrl: string | null | undefined): Promise<Blob | null> {
	const f = facts(p);
	await document.fonts?.ready;
	const c = document.createElement('canvas');
	c.width = W;
	c.height = H;
	const x = c.getContext('2d')!;
	x.fillStyle = '#1a1020';
	x.fillRect(0, 0, W, H);
	const glow = (cx: number, cy: number, r: number, col: string) => {
		const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
		g.addColorStop(0, col);
		g.addColorStop(1, 'rgba(26,16,32,0)');
		x.fillStyle = g;
		x.fillRect(0, 0, W, H);
	};
	glow(1050, 40, 620, 'rgba(242,153,74,.55)');
	glow(80, 640, 640, 'rgba(212,41,106,.55)');
	glow(620, 330, 520, 'rgba(107,63,212,.35)');

	// Photo (or initials) on the right.
	const cx = 960, cy = 300, rad = 150;
	const photo = await loadPhoto(photoUrl);
	x.beginPath();
	x.arc(cx, cy, rad + 10, 0, Math.PI * 2);
	x.fillStyle = 'rgba(255,255,255,.18)';
	x.fill();
	x.save();
	x.beginPath();
	x.arc(cx, cy, rad, 0, Math.PI * 2);
	x.clip();
	if (photo) x.drawImage(photo, cx - rad, cy - rad, rad * 2, rad * 2);
	else {
		const g = x.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad);
		g.addColorStop(0, '#6B3FD4');
		g.addColorStop(0.6, '#D4296A');
		g.addColorStop(1, '#F2994A');
		x.fillStyle = g;
		x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
		x.fillStyle = '#fff';
		x.font = 'italic 150px "Instrument Serif", Georgia, serif';
		x.textAlign = 'center';
		x.textBaseline = 'middle';
		x.fillText(initials(f.name).slice(0, 2), cx, cy + 8);
	}
	x.restore();

	x.textAlign = 'left';
	x.textBaseline = 'alphabetic';
	x.fillStyle = 'rgba(255,255,255,.75)';
	x.font = '500 30px "Geist Mono", ui-monospace, monospace';
	if (f.handle) x.fillText(`@${f.handle}`, 80, 130);
	// Name: as big as fits next to the photo.
	let size = 116;
	x.font = `italic 400 ${size}px "Instrument Serif", Georgia, serif`;
	while (x.measureText(f.name).width > 680 && size > 60) x.font = `italic 400 ${(size -= 4)}px "Instrument Serif", Georgia, serif`;
	x.fillStyle = '#fff';
	x.fillText(f.name, 76, 250);
	if (f.line) {
		x.fillStyle = 'rgba(255,255,255,.8)';
		x.font = '500 32px Geist, system-ui, sans-serif';
		let line = f.line;
		while (x.measureText(line).width > 680 && line.length > 10) line = line.slice(0, -2);
		x.fillText(line === f.line ? line : `${line.trimEnd()}…`, 80, 310);
	}
	let sx = 80;
	for (const s of f.stats) {
		x.fillStyle = '#fff';
		x.font = '700 54px Geist, system-ui, sans-serif';
		x.fillText(s.v, sx, 440);
		const w1 = x.measureText(s.v).width;
		x.fillStyle = 'rgba(255,255,255,.7)';
		x.font = '500 26px Geist, system-ui, sans-serif';
		x.fillText(s.k, sx, 478);
		sx += Math.max(w1, x.measureText(s.k).width) + 64;
	}
	// "Open for collabs" pill.
	x.font = '600 26px Geist, system-ui, sans-serif';
	const label = p.accepting ? 'Open for collaborations' : 'See my work and rates';
	const pw = x.measureText(label).width + 64;
	x.fillStyle = 'rgba(255,255,255,.16)';
	x.beginPath();
	x.roundRect(80, 530, pw, 54, 27);
	x.fill();
	x.fillStyle = p.accepting ? '#7ee2b0' : '#fff';
	x.beginPath();
	x.arc(106, 557, 7, 0, Math.PI * 2);
	x.fill();
	x.fillStyle = '#fff';
	x.fillText(label, 124, 566);

	return new Promise((res) => {
		try {
			// JPEG keeps it well under WhatsApp's size limit for previews (about 300 KB).
			c.toBlob((b) => res(b), 'image/jpeg', 0.86);
		} catch {
			res(null);
		}
	});
}

let running = false;
/** Redraw and upload the card when what it shows has changed (once per session at most). */
export async function ensurePageCard() {
	if (running || !studio.settings) return;
	running = true;
	try {
		const { data } = await supabase.rpc('public_page');
		if (!data) return;
		const p = data as PublicPage;
		const f = facts(p);
		const sig = JSON.stringify([f, p.accepting, studio.ig?.username ?? '', !!studio.ig?.profile_picture_url, 3]);
		if (studio.settings.page_card_sig === sig) return;
		const blob = await draw(p, studio.ig?.profile_picture_url);
		if (!blob) return;
		// each creator's card lives under their own id
		const id = studio.settings.id;
		const up = await supabase.storage.from('cards').upload(`${id}/page.jpg`, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
		if (up.error) return;
		const v = Date.now();
		const { error } = await supabase.from('creator_settings').update({ page_card_v: v, page_card_sig: sig }).eq('id', id);
		if (!error) Object.assign(studio.settings, { page_card_v: v, page_card_sig: sig });
	} catch {
		/* the old card stays; next visit tries again */
	} finally {
		running = false;
	}
}
