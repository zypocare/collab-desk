<script lang="ts">
	import { onMount } from 'svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { errMessage, initials, relWord, diff } from '#lib/util.ts';
	import { saveBlob } from '#lib/download.ts';
	import { DEFAULT_LOOK, QR_COLORS, drawQr, loadPhoto, look, qrSvg, type QrLook } from '#lib/brandQr.ts';
	import type { QrCode } from '#lib/types.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Segmented from '#lib/components/Segmented.svelte';

	// Branded QR codes for events, packaging, a phone case or a printed media kit. Each code is its
	// own short link, so she sees how many people scanned it and how many requests came from it.
	const s = $derived(studio.settings!);
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	const handle = $derived(studio.ig?.username || s.handle || '');
	const name = $derived(s.display_name || handle);

	let codes = $state<QrCode[]>([]);
	let loaded = $state(false);
	let selId = $state('');
	let photo = $state<HTMLImageElement | null>(null);
	let canvas = $state<HTMLCanvasElement>();
	const sel = $derived(codes.find((q) => q.id === selId) ?? null);
	const l = $derived(sel ? look(sel.style) : DEFAULT_LOOK);
	const url = (q: QrCode) => `${link}/q/${q.slug}`;
	const requests = (q: QrCode) => studio.collabs.filter((c) => c.qr_id === q.id).length;

	onMount(async () => {
		const { data, error } = await supabase.from('qr_codes').select('*').order('created_at', { ascending: false });
		if (error) toast(`Couldn't load your QR codes: ${errMessage(error)}`, 'alert');
		codes = (data as QrCode[] | null) ?? [];
		// The first visit makes her brand-page code straight away, ready to share.
		if (!error && !codes.length) await create();
		selId = codes[0]?.id ?? '';
		loaded = true;
		photo = await loadPhoto(studio.ig?.profile_picture_url);
	});

	$effect(() => {
		if (!canvas || !sel) return;
		const extras = { handle, initials: initials(name || 'N').slice(0, 2), photo };
		drawQr(canvas, url(sel), l, extras);
		// Fonts arrive a moment later the first time: draw again once they're in.
		document.fonts?.ready.then(() => canvas && sel && drawQr(canvas, url(sel), l, extras));
	});

	async function create() {
		const n = codes.length;
		const { data, error } = await supabase
			.from('qr_codes')
			.insert({ name: n ? `QR code ${n + 1}` : 'My brand page', style: DEFAULT_LOOK })
			.select('*')
			.single();
		if (error) return toast(`Couldn't make a QR code: ${errMessage(error)}`, 'alert');
		codes = [data as QrCode, ...codes];
		selId = (data as QrCode).id;
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function patch(p: Partial<Pick<QrCode, 'name' | 'dest' | 'style'>>) {
		if (!sel) return;
		Object.assign(sel, p);
		const id = sel.id, body = { name: sel.name, dest: sel.dest, style: sel.style };
		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			const { error } = await supabase.from('qr_codes').update(body).eq('id', id);
			if (error) toast(`Couldn't save: ${errMessage(error)}`, 'alert');
		}, 400);
	}
	const setLook = (p: Partial<QrLook>) => patch({ style: { ...l, ...p } });

	let confirmDel = $state(false);
	async function remove() {
		if (!sel) return;
		const id = sel.id;
		const { error } = await supabase.from('qr_codes').delete().eq('id', id);
		if (error) return toast(`Couldn't delete: ${errMessage(error)}`, 'alert');
		codes = codes.filter((q) => q.id !== id);
		selId = codes[0]?.id ?? '';
		confirmDel = false;
		toast('QR code deleted. Its old prints no longer open your page');
	}

	const fileName = (q: QrCode, ext: string) => `${q.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'qr-code'}.${ext}`;
	function pngBlob(q: QrCode): Promise<Blob | null> {
		const c = document.createElement('canvas');
		drawQr(c, url(q), look(q.style), { handle, initials: initials(name || 'N').slice(0, 2), photo }, 2000);
		return new Promise((res) => {
			try {
				c.toBlob((b) => res(b), 'image/png');
			} catch {
				res(null);
			}
		});
	}
	async function downloadPng() {
		if (!sel) return;
		const b = await pngBlob(sel);
		if (b) saveBlob(b, fileName(sel, 'png'));
		else toast("Couldn't make the picture. Try the SVG instead", 'alert');
	}
	function downloadSvg() {
		if (!sel) return;
		const svg = qrSvg(url(sel), l, { handle, initials: initials(name || 'N').slice(0, 2) });
		saveBlob(new Blob([svg], { type: 'image/svg+xml' }), fileName(sel, 'svg'));
	}
	const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
	async function share() {
		if (!sel) return;
		const b = await pngBlob(sel);
		const file = b ? new File([b], fileName(sel, 'png'), { type: 'image/png' }) : null;
		try {
			if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: sel.name });
			else await navigator.share({ url: url(sel), title: sel.name });
		} catch {
			/* she closed the share sheet */
		}
	}
	const lastScan = (q: QrCode) => (q.last_scan_at ? `last ${relWord(diff(q.last_scan_at.slice(0, 10)))}` : 'not scanned yet');
</script>

<svelte:head><title>QR codes · {s.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Share with brands</div>
		<h1>QR <em>codes</em></h1>
		<p>In your colours, with your photo. Put one on a print, a product box or a story; each one counts its own scans and requests.</p>
	</div>
	<button class="btn grad" onclick={create}><Icon name="plus" />New QR code</button>
</header>

{#if loaded && !codes.length}
	<section class="md-card qr-empty rv">
		<span class="qr-empty-ic"><Icon name="qr" /></span>
		<h2>Make your first QR code</h2>
		<p>It opens your brand page. Make more later for events or packaging, and see which one brings in brands.</p>
		<button class="btn grad lg" onclick={create}><Icon name="plus" />Make a QR code</button>
	</section>
{:else if sel}
	<div class="qr-grid">
		<section class="md-card qr-list rv" style="--i:1" aria-label="Your QR codes">
			{#each codes as q (q.id)}
				<button class="qr-item" class:on={q.id === selId} onclick={() => ((selId = q.id), (confirmDel = false))}>
					<span class="qr-mini" style="--c:{QR_COLORS[look(q.style).color].stops[0]}"><Icon name="qr" /></span>
					<span class="qr-t"><b>{q.name}</b><small>{q.scans} scan{q.scans === 1 ? '' : 's'} · {requests(q)} request{requests(q) === 1 ? '' : 's'}</small></span>
				</button>
			{/each}
			<button class="qr-item qr-new" onclick={create}><span class="qr-mini"><Icon name="plus" /></span><span class="qr-t"><b>New QR code</b><small>For an event or a print</small></span></button>
		</section>

		<section class="md-card qr-stage rv" style="--i:2">
			<!-- A light passes over the code now and then, and it follows the phone's tilt. -->
			<div class="qr-art"><canvas bind:this={canvas} aria-label="QR code for {sel.name}"></canvas><span class="qr-sheen" aria-hidden="true"></span></div>
			<span class="qr-url mono">{url(sel).replace(/^https?:\/\//, '')}</span>
			<div class="qr-stats">
				<div><b class="num">{sel.scans}</b><small>scans</small></div>
				<div><b class="num">{requests(sel)}</b><small>requests</small></div>
				<div><b>{lastScan(sel)}</b><small>&nbsp;</small></div>
			</div>
			<div class="qr-acts">
				{#if canShare}<button class="btn grad qr-share" onclick={share}><Icon name="share" />Share QR code</button>{/if}
				<button class="btn" class:grad={!canShare} onclick={downloadPng}><Icon name="download" />{canShare ? 'Save image' : 'PNG'}</button>
				<button class="btn" onclick={downloadSvg}><Icon name="download" />SVG for print</button>
				<button class="btn" onclick={() => sel && copyText(url(sel), 'Link copied')}><Icon name="copy" />Copy link</button>
			</div>
		</section>

		<section class="md-card qr-ctl rv" style="--i:3">
			<div class="f">
				<label for="qr-name">Name (only you see it)</label>
				<input class="inp" id="qr-name" maxlength="40" value={sel.name} oninput={(e) => patch({ name: e.currentTarget.value || 'QR code' })} />
			</div>
			<div class="f">
				<span class="lbl">Opens</span>
				<Segmented label="Opens" value={sel.dest} onchange={(v: string) => patch({ dest: v as QrCode['dest'] })} options={[{ value: 'page', label: 'Brand page' }, { value: 'request', label: 'Request form' }]} />
			</div>
			<div class="f">
				<span class="lbl">Style</span>
				<div class="qr-seg">
					{#each [['dots', 'Dots'], ['soft', 'Soft squares'], ['classic', 'Classic']] as [v, t] (v)}
						<button class:on={l.style === v} aria-pressed={l.style === v} onclick={() => setLook({ style: v as QrLook['style'] })}>{t}</button>
					{/each}
				</div>
			</div>
			<div class="f">
				<span class="lbl">Colour</span>
				<div class="qr-seg">
					{#each Object.entries(QR_COLORS) as [k, c] (k)}
						<button class:on={l.color === k} aria-pressed={l.color === k} onclick={() => setLook({ color: k as QrLook['color'] })}><i class="sw" style="background:linear-gradient(120deg,{c.stops.join(',')})"></i>{c.label}</button>
					{/each}
				</div>
			</div>
			<div class="f">
				<span class="lbl">Middle</span>
				<div class="qr-seg">
					{#each [['photo', photo ? 'Your photo' : 'Your initials'], ['icon', 'App icon'], ['none', 'Nothing']] as [v, t] (v)}
						<button class:on={l.middle === v} aria-pressed={l.middle === v} onclick={() => setLook({ middle: v as QrLook['middle'] })}>{t}</button>
					{/each}
				</div>
			</div>
			<div class="f">
				<label for="qr-cap">Line under the code</label>
				<input class="inp" id="qr-cap" maxlength="34" value={l.caption} placeholder="Leave empty for none" oninput={(e) => setLook({ caption: e.currentTarget.value })} />
			</div>
			<p class="qr-note"><Icon name="shield" />Always scannable: the strongest error correction keeps it working with your photo in the middle.</p>
			<div class="qr-del">
				{#if confirmDel}
					<span>Old prints of this code will stop working.</span>
					<button class="btn danger sm" onclick={remove}>Delete</button>
					<button class="btn sm" onclick={() => (confirmDel = false)}>Keep</button>
				{:else}
					<button class="lnk-btn" onclick={() => (confirmDel = true)}>Delete this QR code</button>
				{/if}
			</div>
		</section>
	</div>
{/if}

<style>
	.qr-empty { display: grid; justify-items: center; gap: 10px; padding: 48px 24px; text-align: center; }
	.qr-empty h2 { margin: 6px 0 0; font-size: 22px; }
	.qr-empty p { margin: 0 0 8px; max-width: 46ch; color: var(--ink-3); }
	.qr-empty-ic { width: 64px; height: 64px; border-radius: 22px; display: grid; place-items: center; background: var(--grad); color: #fff; }
	.qr-empty-ic :global(.ic) { width: 30px; height: 30px; }

	.qr-grid { display: grid; grid-template-columns: minmax(220px, 280px) minmax(300px, 420px) minmax(300px, 1fr); gap: 16px; align-items: start; }
	@media (max-width: 1180px) { .qr-grid { grid-template-columns: minmax(300px, 420px) minmax(0, 1fr); } .qr-grid .qr-list { grid-column: 1 / -1; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); } }
	@media (max-width: 760px) { .qr-grid { grid-template-columns: minmax(0, 1fr); } }

	.qr-list { display: grid; gap: 4px; padding: 10px; align-items: start; align-content: start; min-height: 0; }
	.qr-new .qr-mini { color: var(--ink-2); background: color-mix(in oklab, var(--ink) 5%, transparent); box-shadow: none; }
	.qr-item { display: flex; align-items: center; gap: 12px; padding: 10px; border: 0; border-radius: 16px; background: none; color: inherit; text-align: left; cursor: pointer; font: inherit; }
	.qr-item:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
	.qr-item.on { background: color-mix(in oklab, var(--g1) 12%, transparent); }
	.qr-mini { width: 40px; height: 40px; flex: none; border-radius: 12px; display: grid; place-items: center; background: #fff; color: var(--c); box-shadow: inset 0 0 0 1px var(--line); }
	.qr-mini :global(.ic) { width: 22px; height: 22px; }
	.qr-t { display: grid; min-width: 0; }
	.qr-t b { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.qr-t small { font-size: 13px; color: var(--ink-3); }

	.qr-stage { display: grid; justify-items: center; gap: 14px; padding: 22px; }
	.qr-art { position: relative; display: block; width: 100%; max-width: 360px; margin: 0 auto; border-radius: 26px; line-height: 0; animation: qr-float 6s ease-in-out infinite; }
	.qr-sheen { position: absolute; inset: 0; pointer-events: none; border-radius: inherit; background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.55) 48%, rgba(255, 220, 240, 0.25) 52%, transparent 65%); background-size: 260% 100%; mix-blend-mode: soft-light; animation: qr-sheen 5.5s ease-in-out infinite; translate: calc(var(--tx, 0) * 14px) calc(var(--ty, 0) * 10px); }
	@keyframes qr-sheen { 0%, 55% { background-position: 130% 0; } 100% { background-position: -30% 0; } }
	@keyframes qr-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
	@media (prefers-reduced-motion: reduce) { .qr-art, .qr-sheen { animation: none; } }
	.qr-stage canvas { width: 100%; max-width: 360px; height: auto; border-radius: 26px; box-shadow: 0 24px 50px -30px color-mix(in oklab, var(--g1) 60%, transparent); }
	.qr-url { justify-self: stretch; width: 100%; font-size: 13px; color: var(--ink-3); overflow-wrap: anywhere; text-align: center; }
	.qr-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; width: 100%; }
	.qr-stats div { display: grid; gap: 2px; padding: 12px; border-radius: 16px; background: color-mix(in oklab, var(--ink) 5%, transparent); text-align: center; }
	.qr-stats b { font-size: 15px; font-weight: 600; }
	.qr-stats b.num { font: 600 24px/1.1 var(--f-mono); letter-spacing: -.03em; }
	.qr-stats small { font-size: 12.5px; color: var(--ink-3); }
	.qr-acts { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
	@media (max-width: 760px) { .qr-acts .qr-share { flex: 1 0 100%; justify-content: center; height: 48px; } .qr-stage canvas, .qr-art { max-width: 300px; } .qr-stage .qr-acts { order: 3; } .qr-stage .qr-stats { order: 4; } .qr-stage .qr-url { order: 2; } .qr-stage canvas { order: 1; } }

	.qr-ctl { display: grid; gap: 18px; padding: 22px; }
	.f { display: grid; gap: 8px; }
	.f label, .lbl { font-size: 14px; font-weight: 600; color: var(--ink-2); }
	.qr-seg { display: flex; flex-wrap: wrap; gap: 6px; }
	.qr-seg button { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border: 0; border-radius: 999px; background: color-mix(in oklab, var(--ink) 6%, transparent); color: var(--ink); font: 500 14.5px var(--f-body); cursor: pointer; }
	.qr-seg button:hover { background: color-mix(in oklab, var(--ink) 10%, transparent); }
	.qr-seg button.on { background: var(--ink); color: var(--surface); }
	.sw { width: 16px; height: 16px; border-radius: 50%; display: inline-block; }
	.qr-note { display: flex; gap: 8px; align-items: flex-start; margin: 0; font-size: 13.5px; color: var(--ink-3); }
	.qr-note :global(.ic) { width: 16px; height: 16px; flex: none; margin-top: 2px; color: var(--ok); }
	.qr-del { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13.5px; color: var(--ink-3); border-top: 1px solid var(--line); padding-top: 14px; }
	.lnk-btn { border: 0; background: none; padding: 0; color: var(--bad); font: 600 14px var(--f-body); cursor: pointer; }
</style>
