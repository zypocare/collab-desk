<script lang="ts">
	import { portal } from '../portal';
	import { onMount } from 'svelte';
	import { createCollab, loadLeads, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { parseDm } from '../parseDm';
	import { toast, ui } from '../ui.svelte';
	import { askAi, mergeDm, shrinkImage } from '../ai';
	import { delivText, emailOk, errMessage, inr, iso, KINDS, parse, rel, todayIso, TYPE_LABEL, USAGE, usageOption } from '../util';
	import type { CollabType } from '../types';
	import AiThinking from './AiThinking.svelte';
	import DatePicker from './DatePicker.svelte';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';
	import { canSpeak, listen as hear, type Listening } from '../speak';
	import { readDmOnDevice } from '../onDevice';

	// "Add a collab" in short steps: (her own message, when she starts from nothing) → what they're asking (read by
	// the AI from the DM, a line to tap for anything that's wrong) → the deal → when it goes live, then add. A DM
	// "Add" opens straight on what they're asking, already being read.
	let name = $state('');
	// Text shared into the app, or a DM's chat, arrives here once.
	const startText = ui.pasteText;
	let pasted = $state(startText);
	ui.pasteText = '';
	const fromIg = ui.fromIg;
	ui.fromIg = '';
	// From an Instagram chat: its account names the brand when the message itself doesn't.
	const igUser = (ui.fromIgUser ?? '').replace(/^@/, '');
	const igName = ui.fromIgName ?? '';
	ui.fromIgUser = ui.fromIgName = '';
	const igBrand = igUser ? (studio.brands.find((b) => (b.instagram ?? '').toLowerCase() === igUser.toLowerCase())?.name ?? (igName || igUser.replace(/[._]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim())) : '';
	const shared = ui.pasteImage;
	type Step = 'paste' | 'ask' | 'deal' | 'when';
	let step = $state<Step>(startText.trim() || shared || fromIg ? 'ask' : 'paste');
	const STEPS: Step[] = ['ask', 'deal', 'when'];
	const at = $derived(STEPS.indexOf(step));
	let nameTouched = $state(false);
	let busy = $state(false);
	let box = $state<HTMLTextAreaElement>();
	let body = $state<HTMLDivElement>();

	onMount(() => {
		if (step === 'paste') box?.focus();
		// A screenshot shared into the app (Android Share): read it straight away.
		ui.pasteImage = null;
		if (shared) shrinkImage(shared).then((img) => readWithAi(img), (err) => toast((err as Error).message, 'alert'));
		// A DM or pasted message: read it at once, so the details are there when she looks.
		else if (startText.trim().length > 20) readWithAi();
	});
	const close = () => (ui.newCollab = false);
	function go(s: Step) {
		if (s !== 'ask' && s !== 'paste') seed();
		step = s;
		body?.scrollTo({ top: 0 });
	}

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

	// Read the message as she types or pastes it (plain rules), with what the AI read on top.
	let aiFields = $state<Parameters<typeof mergeDm>[1]>(null);
	let aiBusy = $state(false);
	let aiNote = $state('');
	const parsed = $derived(mergeDm(pasted.trim().length > 10 ? parseDm(pasted, studio.settings?.handle ?? '') : null, aiFields));
	async function readWithAi(image?: string) {
		aiBusy = true;
		aiNote = image ? 'Reading the screenshot…' : 'Reading their messages…';
		// Text: the AI built into this device first (free, private, works offline), then the cloud.
		if (!image) {
			const f = await readDmOnDevice(pasted, studio.settings?.handle ?? '');
			if (f) {
				aiFields = f;
				aiNote = '';
				aiBusy = false;
				return;
			}
		}
		try {
			const r = await askAi<{ transcript: string; fields: Parameters<typeof mergeDm>[1] }>('dm', { text: image ? '' : pasted, image: image ?? '', handle: studio.settings?.handle ?? '' });
			if (r.transcript) pasted = r.transcript;
			aiFields = r.fields;
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		aiNote = '';
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
		go('ask');
		try {
			await readWithAi(await shrinkImage(f));
		} catch (err) {
			toast((err as Error).message, 'alert');
		}
		(e.currentTarget as HTMLInputElement).value = '';
	}
	function fromPaste() {
		if (pasted.trim().length > 20 && !aiFields && !aiBusy) readWithAi();
		go('ask');
	}
	$effect(() => {
		if (nameTouched) return;
		if (parsed?.brand) name = studio.brands.find((b) => b.name.toLowerCase() === parsed.brand.toLowerCase())?.name ?? parsed.brand;
		else if (igBrand && !name) name = igBrand;
	});
	const known = $derived(!!name.trim() && studio.brands.some((b) => b.name.toLowerCase() === name.trim().toLowerCase()));

	// The deal she's adding: what they asked for until she moves on from the first step, hers after that.
	let seeded = $state(false);
	const f = $state({ type: 'paid' as CollabType, deliv: [{ kind: 'Reel', qty: 1 }] as { kind: string; qty: number }[], fee: 0, product: '', productValue: 0, usage: 'Organic only', live: '', draft: '', agreed: true });
	function seed() {
		if (seeded) return;
		seeded = true;
		const p = parsed;
		if (!p) return;
		if (p.type) f.type = p.type;
		if (p.deliverables.length) f.deliv = p.deliverables.map((d) => ({ kind: d.kind, qty: d.qty }));
		f.fee = p.fee || 0;
		f.product = p.product || '';
		f.productValue = p.productValue || 0;
		if (p.usage && USAGE.includes(p.usage)) f.usage = p.usage;
		if (p.preferredLive && p.preferredLive >= todayIso()) setLive(p.preferredLive);
	}
	const asked = $derived(
		seeded
			? { type: f.type as CollabType | null, deliv: f.deliv.filter((d) => d.qty > 0), fee: f.fee, product: f.product, live: f.live, usage: f.usage }
			: { type: parsed?.type ?? null, deliv: parsed?.deliverables ?? [], fee: parsed?.fee ?? 0, product: parsed?.product ?? '', live: parsed?.preferredLive ?? '', usage: parsed?.usage ?? '' }
	);
	const day = (d: string) => (d ? parse(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
	type Line = { k: string; v: string; to: Step; money?: boolean };
	const lines = $derived<Line[]>([
		{ k: 'Content', v: asked.deliv.length ? delivText(asked.deliv) : '', to: 'deal' },
		{ k: 'Paid or barter', v: asked.type ? TYPE_LABEL[asked.type] : '', to: 'deal' },
		...(asked.type === 'barter' ? [] : [{ k: 'Budget', v: asked.fee ? inr(asked.fee) : '', to: 'deal' as Step, money: true }]),
		...(asked.type === 'barter' || asked.type === 'hybrid' ? [{ k: 'Product', v: asked.product, to: 'deal' as Step }] : []),
		{ k: 'Go live by', v: day(asked.live), to: 'when' },
		{ k: 'Usage rights', v: asked.usage ? usageOption(asked.usage) : '', to: 'deal' }
	]);

	// The deal step.
	const paidPart = $derived(f.type !== 'barter');
	const productPart = $derived(f.type !== 'paid');
	const more = $derived(KINDS.filter((k) => !f.deliv.some((d) => d.kind === k)));
	const qty = (kind: string, by: number) => {
		const d = f.deliv.find((x) => x.kind === kind);
		if (d) d.qty = Math.max(0, Math.min(20, d.qty + by));
	};
	const rates = $derived((studio.settings?.rates ?? {}) as Record<string, number>);
	const rateCard = $derived(f.deliv.reduce((a, d) => a + (Number(rates[d.kind]) || 0) * d.qty, 0));

	// The dates step: the brand's date (when they gave one), a week or two out, or any day; the draft three days before.
	let draftTouched = $state(false);
	let pickLive = $state(false);
	let pickDraft = $state(false);
	function setLive(d: string) {
		f.live = d;
		if (!draftTouched && d) {
			const x = parse(d);
			x.setDate(x.getDate() - 3);
			f.draft = iso(x) < todayIso() ? todayIso() : iso(x);
		}
	}
	const liveChoices = $derived(
		[
			...(parsed?.preferredLive && parsed.preferredLive >= todayIso() ? [{ d: parsed.preferredLive, l: `${day(parsed.preferredLive)} · they asked` }] : []),
			{ d: rel(7), l: day(rel(7)) },
			{ d: rel(14), l: day(rel(14)) }
		]
			.filter((x, i, all) => all.findIndex((y) => y.d === x.d) === i)
			.sort((a, b) => a.d.localeCompare(b.d))
	);

	// A reply in the Instagram chat as she adds it (they wrote in the last 24 hours, so it can go).
	let reply = $state(!!fromIg);
	let replyText = $state('');
	let replyTouched = false;
	$effect(() => {
		if (replyTouched || step !== 'when') return;
		const who = (parsed?.contact ?? '').split(' ')[0];
		const what = [delivText(f.deliv.filter((d) => d.qty > 0)), paidPart && f.fee ? `for ${inr(f.fee)}` : '', f.live ? `live on ${day(f.live)}` : ''].filter(Boolean).join(' ');
		replyText = f.agreed ? `Hi${who ? ' ' + who : ''}! Happy to do this: ${what}. I'll send the details shortly.` : `Hi${who ? ' ' + who : ''}! Thanks for reaching out, I'd love to work on this. Let me send you my quote shortly.`;
	});

	async function notCollab() {
		if (!fromIg) return close();
		const { error } = await supabase.rpc('ig_not_collab', { p_igsid: fromIg });
		if (error) return toast(errMessage(error), 'alert');
		loadLeads();
		toast('Removed. Their messages will stay out of the app.', 'check');
		close();
	}

	async function add() {
		if (!name.trim()) return go('ask');
		seed();
		busy = true;
		const p = parsed;
		const deliv = f.deliv.filter((d) => d.qty > 0);
		const c = await createCollab(name, {
			collab: {
				contact_name: p?.contact ?? '',
				contact_email: p && emailOk(p.email) ? p.email : '',
				contact_phone: p?.phone ?? '',
				type: f.type,
				fee: paidPart ? Math.max(0, Number(f.fee) || 0) : 0,
				product: productPart ? f.product : '',
				product_value: productPart ? Math.max(0, Number(f.productValue) || 0) : 0,
				preferred_live: p?.preferredLive || null,
				usage: f.usage,
				brief: p?.brief ?? '',
				live_date: f.live || null,
				draft_date: f.draft || null,
				stage: f.agreed ? 'confirmed' : 'negotiating'
			},
			deliverables: deliv.length ? deliv : [{ kind: 'Reel', qty: 1 }],
			instagram: p?.instagram || igUser
		});
		if (c && fromIg) {
			await supabase.from('ig_threads').update({ collab_id: c.id }).eq('igsid', fromIg);
			// The reply goes in the background: the collab opens straight away.
			if (reply && replyText.trim())
				supabase.functions
					.invoke('instagram-dm', { body: { igsid: fromIg, text: replyText.trim() } })
					.then(({ error }) => error && toast("The Instagram reply didn't go: reply from the chat.", 'alert'));
		}
		busy = false;
		if (c) {
			close();
			ui.openCollab = c.id;
		}
	}
	const canNext = $derived(step === 'paste' ? !!(name.trim() || pasted.trim()) : step === 'ask' ? !!name.trim() : true);
	function next() {
		if (step === 'paste') return fromPaste();
		if (step === 'ask') return go('deal');
		if (step === 'deal') return go('when');
		return add();
	}
	const back = () => go(step === 'when' ? 'deal' : step === 'deal' ? 'ask' : 'paste');
	let showChat = $state(false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && close()}>
	<div class="dialog nc" role="dialog" aria-modal="true" aria-labelledby="nc-title">
		<header class="nc-top">
			{#if step !== 'ask' && step !== 'paste'}<button type="button" class="nc-ib" aria-label="Back" onclick={back}><Icon name="chevL" /></button>{:else if step === 'ask' && !fromIg && !shared}<button type="button" class="nc-ib" aria-label="Back" onclick={back}><Icon name="chevL" /></button>{/if}
			{#if at >= 0}
				<div class="nc-prog" aria-label="Step {at + 1} of 3">{#each STEPS as s, i (s)}<i class:done={i < at} class:on={i === at}></i>{/each}</div>
				<span class="nc-eb">{at + 1} of 3</span>
			{:else}<span class="nc-eb nc-grow">New collab</span>{/if}
			<button type="button" class="nc-ib" aria-label="Close" onclick={close}><Icon name="x" /></button>
		</header>

		<div class="nc-body" bind:this={body}>
			{#if step === 'paste'}
				<h2 id="nc-title" class="nc-h">Add a <em class="nc-grad">collab</em></h2>
				<p class="nc-sub">Paste their DM or email, read a screenshot, or say it. The details fill in for you.</p>
				<div class="nc-compose">
					<label for="nc-paste" class="sr">Their message (optional)</label>
					<textarea id="nc-paste" rows="5" placeholder={'Hi! I’m Asha from Lumière Skin. We’d love 1 reel + 3 stories for our Vitamin C launch, budget ₹30k, live by 25th…'} bind:value={pasted} bind:this={box}></textarea>
					<div class="nc-tools">
						<button type="button" class="nc-pill ai" disabled={aiBusy} onclick={() => shotInput?.click()}><Icon name="image" />Screenshot</button>
						{#if speakable}<button type="button" class="nc-pill ai" class:rec={speaking} disabled={aiBusy && !speaking} onclick={speak} aria-label={speaking ? 'Stop listening' : 'Speak the details'}><Icon name="mic" />{speaking ? 'Stop' : 'Speak'}</button>{/if}
						{#if canPaste}<button type="button" class="nc-pill" onclick={pasteClip}><Icon name="copy" />Paste</button>{/if}
						<input type="file" accept="image/*" hidden bind:this={shotInput} onchange={pickShot} />
					</div>
				</div>
				{#if aiNote}<p class="nc-note"><AiThinking label={aiNote.replace('…', '')} /></p>{/if}
				<label for="nc-brand" class="nc-lbl">Brand</label>
				<input class="nc-brand" id="nc-brand" list="nc-brands" placeholder="Brand name" autocomplete="off" bind:value={name} oninput={() => (nameTouched = true)} />
				<datalist id="nc-brands">{#each studio.brands as b (b.id)}<option value={b.name}></option>{/each}</datalist>
				<p class="nc-more">Adding many? <a href="/studio/import" onclick={close}>Import them at once</a> · Ambassador deal? <a href="/studio/brands" onclick={close}>Set up a monthly deal</a></p>
			{:else if step === 'ask'}
				<div class="nc-head">
					<span class="nc-eb">New collab{fromIg ? ' · from Instagram' : ''}</span>
					<h2 id="nc-title" class="nc-h">{#if name.trim()}{name.trim()} wants <em class="nc-grad">a collab</em>{:else}What they're <em class="nc-grad">asking</em>{/if}</h2>
				</div>
				{#if igUser || pasted.trim()}
					<div class="nc-from">
						<span class="nc-av" aria-hidden="true">{(name || igUser || '?').trim().charAt(0).toUpperCase()}</span>
						<span class="nc-who"><b>{igUser ? '@' + igUser : 'Their message'}</b><small>{fromIg ? 'Instagram DM' : 'pasted'}</small></span>
						{#if pasted.trim()}<button type="button" class="nc-link" aria-expanded={showChat} onclick={() => (showChat = !showChat)}>{showChat ? 'Hide chat' : 'Read chat'}</button>{/if}
					</div>
					{#if showChat}<pre class="nc-chat">{pasted.trim()}</pre>{/if}
				{/if}
				<div class="nc-card">
					<div class="nc-card-h"><Icon name="spark" /><span class="nc-eb">What they're asking</span>{#if aiBusy}<span class="nc-reading"><AiThinking label="Reading" /></span>{/if}</div>
					{#each lines as l (l.k)}
						<button type="button" class="nc-line" onclick={() => go(l.to)}>
							<span class="nc-k">{l.k}</span>
							{#if l.v}<span class="nc-v" class:money={l.money}>{l.v}</span><span class="nc-ok" aria-hidden="true"><Icon name="check" /></span>
							{:else}<span class="nc-v miss">Not mentioned</span><span class="nc-add">Add</span>{/if}
						</button>
					{/each}
				</div>
				<p class="nc-hint">Tap any line to change it. Nothing is sent to the brand.</p>
				<label for="nc-brand2" class="nc-lbl">Brand</label>
				<input class="nc-brand" id="nc-brand2" list="nc-brands2" placeholder="Brand name" autocomplete="off" bind:value={name} oninput={() => (nameTouched = true)} />
				<datalist id="nc-brands2">{#each studio.brands as b (b.id)}<option value={b.name}></option>{/each}</datalist>
				<small class="nc-hint">{name.trim() ? (known ? 'A brand you know: their details are filled in' : 'New brand: their Instagram is saved too') : 'Who is it from?'}</small>
			{:else if step === 'deal'}
				<div class="nc-head"><span class="nc-eb">{name}</span><h2 id="nc-title" class="nc-h">The deal</h2></div>
				<div class="nc-group">
					<span class="nc-eb">How they pay</span>
					<div class="nc-seg" role="group" aria-label="How they pay">
						{#each Object.entries(TYPE_LABEL) as [v, l] (v)}<button type="button" class:on={f.type === v} aria-pressed={f.type === v} onclick={() => (f.type = v as CollabType)}>{l}</button>{/each}
					</div>
				</div>
				<div class="nc-group">
					<span class="nc-eb">What you'll make</span>
					<div class="nc-steps">
						{#each f.deliv as d (d.kind)}
							<div class="nc-step">
								<span>{d.kind}</span>
								<button type="button" class="nc-sb" aria-label="One less {d.kind}" onclick={() => qty(d.kind, -1)} disabled={d.qty === 0}>−</button>
								<b>{d.qty}</b>
								<button type="button" class="nc-sb" aria-label="One more {d.kind}" onclick={() => qty(d.kind, 1)}>+</button>
							</div>
						{/each}
						{#if more.length}<div class="nc-step nc-more-k">{#each more as k (k)}<button type="button" class="nc-chip" onclick={() => f.deliv.push({ kind: k, qty: 1 })}>+ {k}</button>{/each}</div>{/if}
					</div>
				</div>
				{#if paidPart}
					<div class="nc-group">
						<label for="nc-fee" class="nc-eb">Your fee</label>
						<div class="nc-money"><span>₹</span><input id="nc-fee" type="number" inputmode="numeric" min="0" placeholder="0" value={f.fee || ''} oninput={(e) => (f.fee = Number((e.currentTarget as HTMLInputElement).value) || 0)} />{#if parsed?.fee && f.fee === parsed.fee}<small>their offer</small>{/if}</div>
					</div>
					{#if rateCard > 0 && rateCard !== f.fee}
						<div class="nc-rate">
							<span><b>Your rates say {inr(rateCard)}</b><small>for {delivText(f.deliv.filter((d) => d.qty > 0))}, from your rate card</small></span>
							<button type="button" class="nc-ghost" onclick={() => (f.fee = rateCard)}>Use {inr(rateCard)}</button>
						</div>
					{/if}
				{/if}
				{#if productPart}
					<div class="nc-group">
						<label for="nc-prod" class="nc-eb">What they send</label>
						<input id="nc-prod" class="nc-in" placeholder="The product, a stay or a meal" bind:value={f.product} />
						<div class="nc-money sm"><span>₹</span><input type="number" inputmode="numeric" min="0" placeholder="Its value" aria-label="Its value" value={f.productValue || ''} oninput={(e) => (f.productValue = Number((e.currentTarget as HTMLInputElement).value) || 0)} /></div>
					</div>
				{/if}
				<div class="nc-group">
					<label for="nc-usage" class="nc-eb">Usage rights</label>
					<Select id="nc-usage" bind:value={f.usage} options={USAGE.map((u) => ({ value: u, label: usageOption(u) }))} />
				</div>
			{:else}
				<div class="nc-head"><span class="nc-eb">{name}</span><h2 id="nc-title" class="nc-h">When it goes live</h2></div>
				<div class="nc-group">
					<span class="nc-eb">Go-live date</span>
					<div class="nc-chips" role="group" aria-label="Go-live date">
						{#each liveChoices as o (o.d)}<button type="button" class="nc-opt" class:on={f.live === o.d && !pickLive} aria-pressed={f.live === o.d} onclick={() => ((pickLive = false), setLive(o.d))}>{o.l}</button>{/each}
						<button type="button" class="nc-opt" class:on={pickLive} onclick={() => (pickLive = true)}>{pickLive && f.live ? day(f.live) : 'Pick a date'}</button>
					</div>
					{#if pickLive}<DatePicker ariaLabel="Go-live date" value={f.live} min={todayIso()} onchange={(v) => setLive(v || '')} />{/if}
					{#if f.live}
						<p class="nc-hint">Draft to the brand by <b>{day(f.draft)}</b>{draftTouched ? '' : ', three days before'}. <button type="button" class="nc-link" onclick={() => (pickDraft = !pickDraft)}>Change</button></p>
						{#if pickDraft}<DatePicker ariaLabel="Draft due" value={f.draft} min={todayIso()} onchange={(v) => ((f.draft = v || ''), (draftTouched = true))} />{/if}
					{/if}
				</div>
				<div class="nc-group">
					<span class="nc-eb">Where it stands</span>
					<div class="nc-seg" role="group" aria-label="Where it stands">
						<button type="button" class:on={!f.agreed} aria-pressed={!f.agreed} onclick={() => (f.agreed = false)}>Still talking</button>
						<button type="button" class:on={f.agreed} aria-pressed={f.agreed} onclick={() => (f.agreed = true)}>Agreed</button>
					</div>
				</div>
				<div class="nc-ticket">
					<div class="nc-band">
						<span class="nc-tile" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
						<span class="nc-tw"><b>{name}</b><small>{delivText(f.deliv.filter((d) => d.qty > 0)) || 'Content to agree'}</small></span>
						{#if paidPart && f.fee}<b class="nc-tm">{inr(f.fee)}</b>{/if}
					</div>
					<div class="nc-cut" aria-hidden="true"></div>
					<div class="nc-tf"><span>{TYPE_LABEL[f.type]} · {usageOption(f.usage)}</span><b>{f.live ? `Live ${day(f.live)}` : 'No date yet'}</b></div>
				</div>
				{#if fromIg}
					<label class="nc-reply">
						<input type="checkbox" bind:checked={reply} />
						<span><b>Reply on Instagram</b>{#if reply}<textarea rows="3" bind:value={replyText} oninput={() => (replyTouched = true)} aria-label="Your reply"></textarea>{:else}<small>Send them a quick yes as you add it</small>{/if}</span>
					</label>
				{/if}
			{/if}
		</div>

		<footer class="nc-foot">
			<button type="button" class="nc-go" disabled={busy || !canNext} onclick={next}>
				{#if busy}<span class="spinner"></span>{/if}
				{step === 'paste' ? 'Next' : step === 'ask' ? 'Looks right · Next' : step === 'deal' ? 'Next: dates' : 'Add collab'}
				{#if !busy && step !== 'when'}<Icon name="arrow" />{/if}
			</button>
			{#if step === 'ask'}<button type="button" class="nc-text" onclick={notCollab}>{fromIg ? 'Not a collab' : 'Cancel'}</button>{/if}
		</footer>
	</div>
</div>

<style>
	/* One sheet that fits any screen: the header and the button stay put, the middle scrolls (no scroll bar). */
	:global([data-side]) .dialog.nc { display: flex; flex-direction: column; width: min(480px, 100%); max-height: min(860px, calc(100dvh - 32px)); padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 26px; background: radial-gradient(130% 30% at 50% 0%, color-mix(in oklab, var(--g1) 14%, transparent), transparent 72%), var(--surface); box-shadow: var(--shadow-lg); }
	@media (max-width: 760px) {
		:global([data-side]) .dialog.nc { width: 100%; max-height: calc(100dvh - max(24px, env(safe-area-inset-top, 0px))); border-radius: 24px 24px 0 0; border-width: 1px 0 0; }
	}
	.nc-top { display: flex; align-items: center; gap: 10px; padding: 10px 10px 4px 14px; }
	.nc-ib { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border: 0; background: none; color: var(--ink-2); cursor: pointer; }
	.nc-ib :global(.ic) { width: 20px; height: 20px; }
	.nc-prog { flex: 1; display: flex; gap: 6px; }
	.nc-prog i { height: 4px; flex: 1; background: var(--line-strong); transition: background .3s; }
	.nc-prog i.done { background: var(--g1); }
	.nc-prog i.on { background: var(--ink); }
	.nc-eb { font-size: 10.5px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	.nc-grow { flex: 1; padding-left: 6px; }
	.nc-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; display: flex; flex-direction: column; gap: 16px; padding: 8px 20px 18px; }
	.nc-body::-webkit-scrollbar { display: none; }
	.nc-head { display: flex; flex-direction: column; gap: 6px; }
	:global([data-side]) .nc .nc-h { margin: 0; font: 400 clamp(30px, 9vw, 38px)/1.04 var(--f-serif, Georgia, serif); letter-spacing: -.01em; overflow-wrap: anywhere; }
	.nc-grad { font-style: italic; padding-right: 4px; background: linear-gradient(90deg, var(--g1), var(--g2) 60%, var(--g3)); -webkit-background-clip: text; background-clip: text; color: transparent; }
	:global([data-side]) .nc .nc-sub { margin: -6px 0 0; font-size: 14.5px; color: var(--ink-3); }
	.nc-compose { display: flex; flex-direction: column; background: var(--bg); border: 1px solid var(--line-strong); box-shadow: 4px 4px 0 var(--line-strong); }
	.nc-compose:focus-within { border-color: var(--ink); box-shadow: 4px 4px 0 var(--accent); }
	.nc-compose textarea { width: 100%; min-height: 110px; max-height: 32dvh; box-sizing: border-box; border: 0; outline: 0; resize: none; background: none; color: var(--ink); font: 400 16px/1.5 var(--f-body, inherit); padding: 14px 16px 8px; scrollbar-width: none; }
	.nc-compose textarea::-webkit-scrollbar { display: none; }
	.nc-tools { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); border-top: 1px dashed var(--line-strong); }
	.nc-pill { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; height: 60px; border: 0; background: transparent; color: var(--ink-2); font: 700 10px var(--f-body, inherit); letter-spacing: .1em; text-transform: uppercase; cursor: pointer; }
	.nc-pill + .nc-pill { border-left: 1px dashed var(--line-strong); }
	.nc-pill :global(.ic) { width: 21px; height: 21px; color: var(--ink); }
	.nc-pill.ai :global(.ic) { color: var(--g2); }
	.nc-pill.rec { background: color-mix(in oklab, var(--g2) 12%, transparent); }
	.nc-pill:disabled { opacity: .5; }
	.nc-note { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; color: var(--ink-2); }
	.nc-lbl { margin-bottom: -10px; font-size: 10.5px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	.nc-brand { width: 100%; height: 54px; box-sizing: border-box; padding: 0 2px; border: 0; border-bottom: 2px solid var(--line-strong); outline: 0; border-radius: 0; background: transparent; color: var(--ink); font: 400 28px var(--f-serif, Georgia, serif); }
	.nc-brand:focus { border-bottom-color: var(--ink); }
	.nc-more { margin: 0; font-size: 13px; color: var(--ink-3); line-height: 1.5; }
	.nc-more a { color: var(--ink-2); font-weight: 600; }
	.nc-from { display: flex; align-items: center; gap: 12px; }
	.nc-av { width: 40px; height: 40px; flex: none; display: grid; place-items: center; background: var(--g1); color: #fff; font-weight: 800; }
	.nc-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.nc-who b { font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.nc-who small { font-size: 12.5px; color: var(--ink-3); }
	.nc-link { min-height: 44px; padding: 0 4px; border: 0; background: none; color: var(--accent); font: 700 13.5px var(--f-body, inherit); cursor: pointer; }
	.nc-hint .nc-link { min-height: 0; padding: 0; }
	.nc-chat { margin: 0; max-height: 180px; overflow-y: auto; scrollbar-width: none; padding: 12px 14px; background: var(--bg); border: 1px solid var(--line); font: 400 13.5px/1.5 var(--f-body, inherit); color: var(--ink-2); white-space: pre-wrap; overflow-wrap: anywhere; }
	.nc-card { border: 1px solid var(--line-strong); background: var(--bg); box-shadow: 4px 4px 0 var(--line-strong); }
	.nc-card-h { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-bottom: 1px solid var(--line-strong); }
	.nc-card-h :global(.ic) { width: 16px; height: 16px; color: var(--g2); }
	.nc-card-h .nc-eb { color: var(--ink); }
	.nc-reading { margin-left: auto; font-size: 12.5px; }
	.nc-line { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 50px; padding: 4px 14px; border: 0; border-top: 1px dashed var(--line-strong); background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
	.nc-line:first-of-type { border-top: 0; }
	.nc-line:active { background: var(--surface-2); }
	.nc-k { width: 104px; flex: none; font-size: 13px; color: var(--ink-3); }
	.nc-v { flex: 1; min-width: 0; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
	.nc-v.money { font: 400 21px var(--f-serif, Georgia, serif); }
	.nc-v.miss { font-weight: 500; color: var(--warn, #c77a1e); }
	.nc-ok { display: grid; color: var(--ok); }
	.nc-ok :global(.ic) { width: 17px; height: 17px; }
	.nc-add { font-size: 11.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
	.nc-hint { margin: 0; font-size: 13px; line-height: 1.5; color: var(--ink-3); }
	.nc-hint b { color: var(--ink); }
	small.nc-hint { margin-top: -8px; }
	.nc-group { display: flex; flex-direction: column; gap: 10px; }
	.nc-seg { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; }
	.nc-seg button, .nc-opt { min-height: 46px; padding: 0 10px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink-2); font: 700 13.5px var(--f-body, inherit); cursor: pointer; transition: transform .07s, box-shadow .07s; }
	.nc-seg button.on, .nc-opt.on { background: var(--ink); color: var(--bg); border-color: var(--ink); box-shadow: 3px 3px 0 var(--g1); }
	.nc-chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.nc-steps { border: 1px solid var(--line-strong); background: var(--bg); }
	.nc-step { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 4px 6px 4px 16px; border-top: 1px dashed var(--line-strong); }
	.nc-step:first-child { border-top: 0; }
	.nc-step > span { flex: 1; font-size: 16px; font-weight: 600; }
	.nc-step > b { width: 28px; text-align: center; font: 400 26px var(--f-serif, Georgia, serif); }
	.nc-sb { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font-size: 20px; cursor: pointer; }
	.nc-sb:disabled { opacity: .35; }
	.nc-more-k { flex-wrap: wrap; gap: 8px; padding: 10px 12px; }
	.nc-chip { min-height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: 999px; background: transparent; color: var(--ink-2); font: 600 13px var(--f-body, inherit); cursor: pointer; }
	.nc-money { display: flex; align-items: baseline; gap: 6px; border-bottom: 2px solid var(--ink); }
	.nc-money span { font: 400 28px var(--f-serif, Georgia, serif); color: var(--ink-3); }
	.nc-money input { flex: 1; min-width: 0; height: 54px; border: 0; outline: 0; background: transparent; color: var(--ink); font: 400 38px var(--f-serif, Georgia, serif); padding: 0; }
	.nc-money small { font-size: 12.5px; color: var(--ink-3); white-space: nowrap; }
	.nc-money.sm { border-bottom-width: 1px; border-color: var(--line-strong); }
	.nc-money.sm input { height: 44px; font-size: 24px; }
	.nc-money.sm span { font-size: 20px; }
	.nc-in { height: 48px; padding: 0 14px; border: 1px solid var(--line-strong); background: var(--bg); color: var(--ink); font: 400 16px var(--f-body, inherit); outline: 0; }
	.nc-in:focus { border-color: var(--ink); }
	.nc-rate { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid color-mix(in oklab, var(--g3) 50%, transparent); background: color-mix(in oklab, var(--g3) 9%, transparent); }
	.nc-rate > span { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
	.nc-rate b { font-size: 14.5px; }
	.nc-rate small { font-size: 12.5px; line-height: 1.4; color: var(--ink-2); }
	.nc-ghost { min-height: 44px; padding: 0 12px; border: 1px solid var(--ink); background: transparent; color: var(--ink); font: 700 13px var(--f-body, inherit); white-space: nowrap; cursor: pointer; }
	.nc-ticket { border: 1px solid var(--line); border-radius: 18px; overflow: hidden; background: var(--bg); }
	.nc-band { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: linear-gradient(135deg, var(--g1), color-mix(in oklab, var(--g2) 70%, var(--g1))); color: #fff; }
	.nc-tile { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border: 1px solid rgba(255, 255, 255, .4); border-radius: 10px; font-weight: 800; }
	.nc-tw { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.nc-tw b { font: italic 400 24px/1.05 var(--f-serif, Georgia, serif); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.nc-tw small { font-size: 10.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; opacity: .85; }
	.nc-tm { font-size: 19px; }
	.nc-cut { border-top: 2px dashed var(--line-strong); margin: 0 14px; }
	.nc-tf { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 12px 16px; font-size: 13.5px; }
	.nc-tf span { color: var(--ink-3); }
	.nc-reply { display: flex; align-items: flex-start; gap: 12px; padding: 14px; border: 1px solid var(--line-strong); cursor: pointer; }
	.nc-reply input { width: 20px; height: 20px; margin: 2px 0 0; flex: none; accent-color: var(--g1); }
	.nc-reply > span { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
	.nc-reply b { font-size: 14.5px; }
	.nc-reply small { font-size: 13px; color: var(--ink-3); }
	.nc-reply textarea { width: 100%; box-sizing: border-box; resize: none; border: 1px solid var(--line); background: var(--bg); color: var(--ink); font: 400 14px/1.45 var(--f-body, inherit); padding: 8px 10px; outline: 0; scrollbar-width: none; }
	.nc-foot { display: flex; flex-direction: column; gap: 4px; padding: 12px 20px calc(16px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--line); background: var(--surface); }
	.nc-go { display: flex; align-items: center; justify-content: center; gap: 10px; height: 54px; border: 0; background: var(--ink); color: var(--bg); font: 800 16px var(--f-body, inherit); box-shadow: 4px 4px 0 var(--g2); cursor: pointer; transition: transform .07s, box-shadow .07s, opacity .2s; }
	.nc-go:not(:disabled):active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--g2); }
	.nc-go:disabled { opacity: .4; cursor: default; }
	.nc-go :global(.ic) { width: 18px; height: 18px; }
	.nc-text { height: 44px; border: 0; background: none; color: var(--ink-2); font: 600 14px var(--f-body, inherit); cursor: pointer; }
	/* Short screens (iPhone SE, a laptop window made small): tighter, so most of a step fits at once. */
	@media (max-height: 700px) {
		.nc-body { gap: 12px; }
		:global([data-side]) .nc .nc-h { font-size: 30px; }
		.nc-line { min-height: 44px; }
		.nc-step { min-height: 50px; }
		.nc-go { height: 50px; }
	}
	@media (prefers-reduced-motion: reduce) {
		.nc-go, .nc-seg button, .nc-opt { transition: none; }
	}
</style>
