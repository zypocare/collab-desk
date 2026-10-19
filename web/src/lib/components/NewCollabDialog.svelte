<script lang="ts">
	import { portal } from '../portal';
	import { onMount } from 'svelte';
	import { createCollab, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { parseDm } from '../parseDm';
	import { toast, ui } from '../ui.svelte';
	import { askAi, mergeDm, shrinkImage } from '../ai';
	import { delivText, emailOk, fmt, inr, TYPE_LABEL } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';
	import { canSpeak, listen as hear, type Listening } from '../speak';
	import { readDmOnDevice } from '../onDevice';

	let name = $state('');
	// Text shared into the app arrives here once.
	let pasted = $state(ui.pasteText);
	ui.pasteText = '';
	const fromIg = ui.fromIg;
	ui.fromIg = '';
	// From an Instagram chat: its account names the brand when the message itself doesn't.
	const igUser = (ui.fromIgUser ?? '').replace(/^@/, '');
	const igName = ui.fromIgName ?? '';
	ui.fromIgUser = ui.fromIgName = '';
	const igBrand = igUser ? (studio.brands.find((b) => (b.instagram ?? '').toLowerCase() === igUser.toLowerCase())?.name ?? (igName || igUser.replace(/[._]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim())) : '';
	let nameTouched = $state(false);
	let busy = $state(false);
	let box = $state<HTMLTextAreaElement>();

	onMount(() => {
		box?.focus();
		// A screenshot shared into the app (Android Share): read it straight away.
		const shot = ui.pasteImage;
		ui.pasteImage = null;
		if (shot) shrinkImage(shot).then((img) => readWithAi(img), (err) => toast((err as Error).message, 'alert'));
	});

	// One-tap paste from the clipboard (copied from WhatsApp, Instagram or email).
	const canPaste = typeof navigator !== 'undefined' && !!navigator.clipboard?.readText;
	async function pasteClip() {
		try {
			const t = await navigator.clipboard.readText();
			if (t.trim()) pasted = t;
		} catch {
			box?.focus();
		}
	}

	// Read the pasted message as she types/pastes, and fill the brand name unless she typed one.
	// What the free AI read (from a screenshot or the pasted text) is added on top.
	let aiFields = $state<Parameters<typeof mergeDm>[1]>(null);
	let aiBusy = $state(false);
	let aiNote = $state('');
	const parsed = $derived(mergeDm(pasted.trim().length > 10 ? parseDm(pasted, studio.settings?.handle ?? '') : null, aiFields));
	async function readWithAi(image?: string) {
		aiBusy = true;
		aiNote = image ? 'Reading the screenshot…' : 'Reading the message…';
		// Text: the AI built into this device first (free, private, works offline), then the cloud.
		if (!image) {
			const f = await readDmOnDevice(pasted, studio.settings?.handle ?? '');
			if (f) {
				aiFields = f;
				aiNote = 'Read on this device: free and private. Check the details before adding.';
				aiBusy = false;
				return;
			}
		}
		try {
			const r = await askAi<{ transcript: string; fields: Parameters<typeof mergeDm>[1] }>('dm', { text: image ? '' : pasted, image: image ?? '', handle: studio.settings?.handle ?? '' });
			if (r.transcript) pasted = r.transcript;
			aiFields = r.fields;
			aiNote = 'Filled in by AI. Check the details before adding.';
		} catch (e) {
			aiNote = '';
			toast((e as Error).message, 'alert');
		}
		aiBusy = false;
	}
	// Speak the details instead of typing ("Lumière, 30k, ek reel aur teen stories, 25 tak").
	let speaking = $state(false);
	let rec: Listening | null = null;
	const speakable = canSpeak();
	function speak() {
		if (speaking) return rec?.stop();
		const before = pasted.trim();
		const join = (t: string) => (before ? `${before}\n${t}` : t);
		speaking = true;
		rec = hear({
			onText: (t) => (pasted = join(t)),
			onWorking: () => (aiNote = 'Writing out what you said…'),
			onDone: (t) => {
				speaking = false;
				aiNote = '';
				if (t) pasted = join(t);
				if (t && pasted.trim().length > 20) readWithAi();
			},
			onError: (m) => {
				speaking = false;
				aiNote = '';
				toast(m, 'alert');
			}
		});
	}
	let shotInput = $state<HTMLInputElement>();
	async function pickShot(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!f) return;
		try {
			await readWithAi(await shrinkImage(f));
		} catch (err) {
			toast((err as Error).message, 'alert');
		}
		(e.currentTarget as HTMLInputElement).value = '';
	}
	$effect(() => {
		if (nameTouched) return;
		if (parsed?.brand) name = studio.brands.find((b) => b.name.toLowerCase() === parsed.brand.toLowerCase())?.name ?? parsed.brand;
		else if (igBrand && !name) name = igBrand;
	});
	const chips = $derived(
		parsed
			? [
					parsed.instagram && { k: 'Instagram', v: '@' + parsed.instagram },
					parsed.contact && { k: 'Contact', v: parsed.contact },
					parsed.email && { k: 'Email', v: parsed.email },
					parsed.phone && { k: 'Phone', v: parsed.phone },
					parsed.type && { k: 'Type', v: TYPE_LABEL[parsed.type] },
					parsed.deliverables.length && { k: 'Content', v: delivText(parsed.deliverables) },
					parsed.fee && { k: 'Budget', v: inr(parsed.fee) },
					parsed.product && { k: 'Product', v: parsed.product },
					parsed.productValue && { k: 'Worth', v: inr(parsed.productValue) },
					parsed.preferredLive && { k: 'Go-live', v: fmt(parsed.preferredLive) },
					parsed.usage && { k: 'Usage', v: parsed.usage }
				].filter((x): x is { k: string; v: string } => !!x)
			: []
	);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!name.trim()) return;
		busy = true;
		const p = parsed;
		const c = await createCollab(
			name,
			p
				? {
						collab: {
							contact_name: p.contact,
							contact_email: emailOk(p.email) ? p.email : '',
							contact_phone: p.phone,
							...(p.type ? { type: p.type } : {}),
							fee: p.type === 'barter' ? 0 : p.fee,
							product: p.product,
							product_value: p.productValue,
							preferred_live: p.preferredLive || null,
							...(p.usage ? { usage: p.usage } : {}),
							brief: p.brief
						},
						deliverables: p.deliverables,
						instagram: p.instagram || igUser
					}
				: undefined
		);
		busy = false;
		if (c) {
			if (fromIg) await supabase.from('ig_threads').update({ collab_id: c.id }).eq('igsid', fromIg);
			ui.newCollab = false;
			ui.openCollab = c.id;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (ui.newCollab = false)} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (ui.newCollab = false)}>
	<div class="dialog nc" role="dialog" aria-modal="true" aria-labelledby="nc-title"><form onsubmit={submit}>
		<span class="nc-eb" aria-hidden="true">New collab · AI fills it in</span>
		<h2 id="nc-title" class="nc-h">Add a <span class="nc-grad">collab</span></h2>
		<p class="nc-sub">Paste their DM or email, or read a screenshot. I'll fill in the rest.</p>

		<div class="nc-compose" class:busy={aiBusy}>
			<label for="nc-paste" class="sr">Their message (optional)</label>
			<textarea id="nc-paste" rows="6" placeholder={'Hi! I’m Asha from Lumière Skin. We’d love 1 reel + 3 stories for our Vitamin C launch, budget ₹30k, live by 25th Oct…'} bind:value={pasted} bind:this={box}></textarea>
			<div class="nc-tools">
				<button type="button" class="nc-pill ai" disabled={aiBusy} onclick={() => shotInput?.click()}><Icon name="image" />Screenshot</button>
				{#if speakable}<button type="button" class="nc-pill ai" class:rec={speaking} disabled={aiBusy && !speaking} onclick={speak} aria-label={speaking ? 'Stop listening' : 'Speak the details'}><Icon name="mic" />{speaking ? 'Listening… tap to stop' : 'Speak'}</button>{/if}
				{#if canPaste}<button type="button" class="nc-pill" onclick={pasteClip}><Icon name="copy" />Paste</button>{/if}
				{#if pasted.trim().length > 20}<button type="button" class="nc-pill ai" disabled={aiBusy} onclick={() => readWithAi()}><Icon name="spark" />Read with AI</button>{/if}
				<input type="file" accept="image/*" hidden bind:this={shotInput} onchange={pickShot} />
			</div>
		</div>
		{#if aiBusy}<p class="nc-note"><AiThinking label={aiNote.replace('…', '')} /></p>{:else if aiNote}<p class="nc-note"><Icon name="spark" />{aiNote}</p>{/if}

		{#if chips.length}
			<div class="nc-found dm-found" aria-live="polite">
				<span class="nc-flbl"><Icon name="spark" />Found</span>
				{#each chips as ch (ch.k)}<span class="nc-chip"><small>{ch.k}</small>{ch.v}</span>{/each}
			</div>
		{/if}

		<label for="nc-brand" class="nc-lbl">Brand</label>
		<input class="nc-brand" id="nc-brand" list="nc-brands" placeholder="Brand name" autocomplete="off" bind:value={name} oninput={() => (nameTouched = true)} />
		<datalist id="nc-brands">
			{#each studio.brands as b (b.id)}<option value={b.name}></option>{/each}
		</datalist>

		<p class="nc-more">Adding many? <a href="/studio/import" onclick={() => (ui.newCollab = false)}>Import them at once</a> · Ambassador deal? <a href="/studio/brands" onclick={() => (ui.newCollab = false)}>Set up a monthly deal</a></p>

		<div class="nc-acts">
			<button type="button" class="nc-cancel" onclick={() => (ui.newCollab = false)}>Cancel</button>
			<button type="submit" class="nc-add" disabled={busy || !name.trim()}>
				{#if busy}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add collab<span class="nc-go" aria-hidden="true"><Icon name="arrow" /></span>
			</button>
		</div>
	</form></div>
</div>

<style>
	/* Same language as Ask your desk: flat, roomy, tonal surfaces and pills, no borders. */
	:global([data-side]) .dialog.nc { width: min(620px, 100%); padding: 26px 26px 22px; border: 0; border-radius: 28px; background: var(--surface); box-shadow: var(--shadow-lg); }
	.nc { --s1: color-mix(in oklab, var(--g1) 6%, color-mix(in oklab, var(--ink) 4%, var(--surface))); --s2: color-mix(in oklab, var(--g1) 9%, color-mix(in oklab, var(--ink) 7%, var(--surface))); }
	:global([data-side]) .nc .nc-h { margin: 0; font-size: 30px; font-weight: 500; letter-spacing: -.02em; line-height: 1.15; }
	.nc-grad { background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; }
	:global([data-side]) .nc .nc-sub { margin: 8px 0 18px; font-size: 15.5px; color: var(--ink-3); }
	.nc-compose { display: flex; flex-direction: column; gap: 10px; padding: 18px 16px 12px 20px; border-radius: 26px; background: var(--s1); transition: background .15s, box-shadow .2s; }
	.nc-compose:focus-within { background: var(--s2); }
	.nc-compose.busy { box-shadow: 0 0 0 2px color-mix(in oklab, var(--g2) 45%, transparent); }
	.nc-compose textarea { width: 100%; min-height: 170px; max-height: 40vh; border: 0; outline: 0; resize: none; background: none; color: var(--ink); font: 400 17px/1.55 var(--f-body, inherit); padding: 0; }
	.nc-compose textarea::placeholder { color: var(--ink-3); opacity: .8; }
	.nc-tools { display: flex; flex-wrap: wrap; gap: 8px; }
	.nc-pill { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border: 0; border-radius: 999px; background: var(--surface); color: var(--ink); font: 500 14.5px var(--f-body, inherit); cursor: pointer; transition: background .15s; }
	.nc-pill:hover { background: color-mix(in oklab, var(--ink) 4%, var(--surface)); }
	.nc-pill:disabled { opacity: .5; cursor: default; }
	.nc-pill :global(.ic) { width: 17px; height: 17px; }
	.nc-pill.ai :global(.ic) { color: var(--g2); }
	.nc-pill.rec { background: color-mix(in oklab, var(--g2) 16%, var(--surface)); color: var(--g2); animation: nc-pulse 1.4s ease-in-out infinite; }
	@keyframes nc-pulse { 50% { box-shadow: 0 0 0 6px color-mix(in oklab, var(--g2) 14%, transparent); } }
	@media (prefers-reduced-motion: reduce) { .nc-pill.rec { animation: none; } }
	.nc-note { display: flex; align-items: center; gap: 8px; margin: 12px 4px 0; font-size: 14px; color: var(--ink-2); }
	.nc-note :global(.ic) { width: 16px; height: 16px; color: var(--g2); flex: none; }
	:global([data-side]) .nc .nc-found { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; padding: 0 4px; border: 0; background: none; }
	.nc-flbl { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; color: var(--g2); }
	.nc-flbl :global(.ic) { width: 15px; height: 15px; }
	.nc-chip { display: inline-flex; align-items: baseline; gap: 6px; padding: 7px 14px; border-radius: 999px; background: var(--s1); font-size: 14px; font-weight: 500; }
	.nc-chip small { font-size: 12px; color: var(--ink-3); font-weight: 400; }
	.nc-lbl { display: block; margin: 20px 6px 8px; font-size: 14px; font-weight: 500; color: var(--ink-2); }
	.nc-brand { width: 100%; height: 54px; box-sizing: border-box; padding: 0 22px; border: 0; outline: 0; border-radius: 999px; background: var(--s1); color: var(--ink); font: 400 17px var(--f-body, inherit); transition: background .15s, box-shadow .2s; }
	.nc-brand:focus { background: var(--s2); box-shadow: 0 0 0 2px color-mix(in oklab, var(--g2) 40%, transparent); }
	.nc-brand::placeholder { color: var(--ink-3); }
	.nc-more { margin: 16px 6px 0; font-size: 13.5px; color: var(--ink-3); line-height: 1.5; }
	.nc-more a { color: var(--ink-2); font-weight: 600; text-decoration: none; }
	.nc-more a:hover { color: var(--accent); }
	.nc-acts { display: flex; justify-content: flex-end; gap: 10px; margin-top: 22px; }
	.nc-cancel { height: 50px; padding: 0 22px; border: 0; border-radius: 999px; background: none; color: var(--ink-2); font: 600 15.5px var(--f-body, inherit); cursor: pointer; }
	.nc-cancel:hover { background: var(--s1); }
	.nc-add { display: inline-flex; align-items: center; gap: 8px; height: 50px; padding: 0 26px; border: 0; border-radius: 999px; background: linear-gradient(135deg, var(--g1), var(--g2)); color: #fff; font: 600 15.5px var(--f-body, inherit); cursor: pointer; box-shadow: 0 10px 24px -12px var(--g2); transition: opacity .15s; }
	.nc-add:disabled { opacity: .45; cursor: default; box-shadow: none; }
	.nc-add :global(.ic) { width: 18px; height: 18px; }
	.nc-eb, .nc-go { display: none; }
	/* CRED's sheet (phone and laptop). A spaced-capitals line, the title in serif, the message box as a NeoPOP
	   card with its tools as tiles, the brand on a big underline, and two NeoPOP blocks to finish. */
	@media (max-width: 760px) {
		:global([data-side]) .dialog.nc { padding: 22px 18px calc(18px + env(safe-area-inset-bottom, 0px)); border-radius: 24px 24px 0 0; }
	}
	/* Laptop: the same sheet as a centred card. */
	@media (min-width: 761px) {
		:global([data-side]) .dialog.nc { width: min(560px, calc(100vw - 48px)); padding: 30px 30px 28px; border-radius: 28px; border: 1px solid var(--line); }
	}
	@media all {
		:global([data-side]) .dialog.nc { background: radial-gradient(130% 34% at 50% 0%, color-mix(in oklab, var(--g2) 16%, transparent), transparent 72%), var(--surface); }
		.nc form > * { animation: nc-up .55s cubic-bezier(.2, .9, .25, 1) both; }
		.nc form > :nth-child(2) { animation-delay: .04s; } .nc form > :nth-child(3) { animation-delay: .08s; } .nc form > :nth-child(4) { animation-delay: .12s; }
		.nc form > :nth-child(5) { animation-delay: .16s; } .nc form > :nth-child(n+6) { animation-delay: .2s; }
		@keyframes nc-up { from { opacity: 0; transform: translateY(18px); } }
		.nc-eb { display: block; margin-top: 10px; font-size: 10.5px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
		:global([data-side]) .nc .nc-h { margin-top: 6px; font: 400 40px/1.02 var(--f-serif, Georgia, serif); letter-spacing: -.01em; }
		.nc-grad { font-style: italic; padding-right: 4px; }
		:global([data-side]) .nc .nc-sub { margin: 8px 0 18px; font-size: 14.5px; }

		.nc-compose { gap: 0; padding: 0; border-radius: 0; background: var(--bg); border: 1px solid var(--line-strong); box-shadow: 4px 4px 0 var(--line-strong); transition: box-shadow .2s, border-color .2s; }
		.nc-compose:focus-within { background: var(--bg); border-color: var(--ink); box-shadow: 4px 4px 0 var(--accent); }
		.nc-compose.busy { box-shadow: 4px 4px 0 var(--g2); animation: nc-glow 1.6s ease-in-out infinite; }
		@keyframes nc-glow { 50% { box-shadow: 4px 4px 0 var(--g1); } }
		.nc-compose textarea { min-height: 128px; padding: 16px 16px 10px; font-size: 16px; }
		.nc-tools { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 0; border-top: 1px dashed var(--line-strong); }
		.nc-pill { flex-direction: column; justify-content: center; gap: 6px; height: 66px; padding: 0 4px; border-radius: 0; background: transparent; color: var(--ink-2); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; text-align: center; line-height: 1.15; }
		.nc-pill + .nc-pill { border-left: 1px dashed var(--line-strong); }
		.nc-pill:hover { background: transparent; }
		.nc-pill:active { background: var(--surface-2); }
		.nc-pill :global(.ic) { width: 22px; height: 22px; color: var(--ink); transition: transform .3s cubic-bezier(.2, 1.6, .4, 1); }
		.nc-pill:active :global(.ic) { transform: scale(.85); }
		.nc-pill.ai :global(.ic) { color: var(--g2); }
		.nc-pill.rec { background: color-mix(in oklab, var(--g2) 12%, transparent); box-shadow: none; animation: none; }
		.nc-pill.rec :global(.ic) { animation: nc-beat 1s ease-in-out infinite; }
		@keyframes nc-beat { 50% { transform: scale(1.25); } }

		:global([data-side]) .nc .nc-found { margin-top: 16px; padding: 0; }
		.nc-chip { padding: 6px 12px; border-radius: 999px; background: transparent; border: 1px solid var(--line-strong); font-size: 13.5px; animation: nc-pop .4s cubic-bezier(.2, 1.6, .4, 1) both; }
		@keyframes nc-pop { from { opacity: 0; transform: scale(.7); } }

		.nc-lbl { margin: 22px 0 2px; font-size: 10.5px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
		.nc-brand { height: 58px; padding: 0 2px; border-radius: 0; background: transparent; border-bottom: 2px solid var(--line-strong); font: 400 30px var(--f-serif, Georgia, serif); }
		.nc-brand:focus { background: transparent; box-shadow: none; border-bottom-color: var(--ink); }
		.nc-more { margin: 14px 0 0; font-size: 13px; }

		.nc-acts { display: grid; grid-template-columns: 1fr 2fr; gap: 14px; margin-top: 24px; padding-right: 4px; }
		.nc-cancel, .nc-add { height: 52px; border-radius: 0; justify-content: center; font-weight: 700; letter-spacing: .02em; transition: transform .07s, box-shadow .07s, opacity .2s; }
		.nc-cancel { background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink); box-shadow: 3px 3px 0 var(--line-strong); }
		.nc-cancel:hover { background: var(--surface); }
		.nc-cancel:active { transform: translate(3px, 3px); box-shadow: 0 0 0 var(--line-strong); }
		.nc-add { position: relative; overflow: hidden; isolation: isolate; background: var(--ink); color: var(--bg); box-shadow: 4px 4px 0 var(--accent); }
		.nc-add:not(:disabled):active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--accent); }
		.nc-add:disabled { opacity: .35; box-shadow: 4px 4px 0 var(--line-strong); }
		.nc-add::after { content: ''; position: absolute; top: 0; bottom: 0; left: -60%; width: 45%; pointer-events: none; background: linear-gradient(100deg, transparent, rgba(255, 255, 255, .4), transparent); transform: skewX(-18deg); animation: nc-sweep 4.5s ease-in-out 1s infinite; }
		.nc-add:disabled::after { display: none; }
		@keyframes nc-sweep { 0%, 70% { left: -60%; } 100% { left: 130%; } }
		.nc-go { display: inline-grid; margin-left: 2px; transition: transform .3s; }
		.nc-add:not(:disabled) .nc-go { animation: nc-nudge 1.6s ease-in-out infinite; }
		@keyframes nc-nudge { 50% { transform: translateX(4px); } }
	}
	@media (prefers-reduced-motion: reduce) {
		.nc form > *, .nc-chip, .nc-add::after, .nc-go, .nc-pill.rec :global(.ic), .nc-compose.busy { animation: none !important; }
	}
</style>
