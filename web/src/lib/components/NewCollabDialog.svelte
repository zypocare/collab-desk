<script lang="ts">
	import { portal } from '../portal';
	import { onMount } from 'svelte';
	import { createCollab, studio } from '../studio.svelte';
	import { parseDm } from '../parseDm';
	import { toast, ui } from '../ui.svelte';
	import { askAi, mergeDm, shrinkImage } from '../ai';
	import { delivText, fmt, inr, TYPE_LABEL } from '../util';
	import Icon from './Icon.svelte';

	let name = $state('');
	// Text shared into the app arrives here once.
	let pasted = $state(ui.pasteText);
	ui.pasteText = '';
	let nameTouched = $state(false);
	let busy = $state(false);
	let box = $state<HTMLTextAreaElement>();

	onMount(() => box?.focus());

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
		if (parsed?.brand && !nameTouched) name = studio.brands.find((b) => b.name.toLowerCase() === parsed.brand.toLowerCase())?.name ?? parsed.brand;
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
							contact_email: p.email,
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
						instagram: p.instagram
					}
				: undefined
		);
		busy = false;
		if (c) {
			ui.newCollab = false;
			ui.openCollab = c.id;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (ui.newCollab = false)} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (ui.newCollab = false)}>
	<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="nc-title"><form onsubmit={submit}>
		<h2 id="nc-title">Add a collab</h2>
		<p>Paste the brand's DM or email and we'll fill in the details. Or just type the brand name. Adding many? <a class="lnk" href="/studio/import" onclick={() => (ui.newCollab = false)}>Import them at once</a>. Ambassador deal? <a class="lnk" href="/studio/brands" onclick={() => (ui.newCollab = false)}>Set up a monthly deal</a>.</p>
		<div class="f">
			<label for="nc-paste">Their message <span class="hint">(optional)</span>{#if canPaste}<button type="button" class="lnk paste-btn" onclick={pasteClip}>Paste</button>{/if}</label>
			<div class="ai-row">
				<button type="button" class="btn sm ai-btn" disabled={aiBusy} onclick={() => shotInput?.click()}>{#if aiBusy}<span class="spinner"></span>{:else}<Icon name="spark" />{/if}Add a screenshot</button>
				{#if pasted.trim().length > 20}<button type="button" class="btn sm ghost" disabled={aiBusy} onclick={() => readWithAi()}><Icon name="spark" />Read with AI</button>{/if}
				<input type="file" accept="image/*" hidden bind:this={shotInput} onchange={pickShot} />
			</div>
			{#if aiNote}<p class="hint ai-note">{aiNote}</p>{/if}
			<textarea class="inp" id="nc-paste" rows="5" placeholder={'Hi! I’m Asha from Lumière Skin (@lumiere.skin). We’d love 1 reel + 3 stories for our Vitamin C launch, budget ₹30k, live by 25th Oct…'} bind:value={pasted} bind:this={box}></textarea>
		</div>
		{#if chips.length}
			<div class="dm-found" aria-live="polite">
				<span class="lbl-t">Found</span>
				<div>{#each chips as ch (ch.k)}<span class="dm-chip"><small>{ch.k}</small>{ch.v}</span>{/each}</div>
			</div>
		{/if}
		<div class="f" style="margin-top:12px">
			<label for="nc-brand">Brand</label>
			<input class="inp" id="nc-brand" list="nc-brands" placeholder="Brand name" autocomplete="off" bind:value={name} oninput={() => (nameTouched = true)} />
			<datalist id="nc-brands">
				{#each studio.brands as b (b.id)}<option value={b.name}></option>{/each}
			</datalist>
		</div>
		<div class="row">
			<button type="button" class="btn ghost" onclick={() => (ui.newCollab = false)}>Cancel</button>
			<button type="submit" class="btn primary" disabled={busy || !name.trim()}>
				{#if busy}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add collab
			</button>
		</div>
	</form></div>
</div>
