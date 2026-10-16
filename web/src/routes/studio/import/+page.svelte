<script lang="ts">
	import { goto } from '$app/navigation';
	import { createCollab, loadStudio, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { parseDm } from '#lib/parseDm.ts';
	import type { CollabType, Stage } from '#lib/types.ts';
	import { confetti, toast } from '#lib/ui.svelte.ts';
	import { delivText, inr, todayIso } from '#lib/util.ts';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Select from '#lib/components/Select.svelte';

	// Bring in the collabs she already has going (from DMs, WhatsApp, email): one row each.
	// Brands are not emailed about anything imported (brand updates start switched off).
	type Where = 'negotiating' | 'confirmed' | 'creating' | 'live' | 'done';
	type Row = { id: number; brand: string; instagram: string; contact: string; email: string; what: string; type: CollabType; fee: string; product: string; worth: string; where: Where; date: string; paid: boolean; dm: string; showDm: boolean };
	const WHERE: { value: Where; label: string }[] = [
		{ value: 'negotiating', label: 'Still talking' },
		{ value: 'confirmed', label: 'Agreed, not started' },
		{ value: 'creating', label: 'Creating now' },
		{ value: 'live', label: 'Posted' },
		{ value: 'done', label: 'Done (paid & closed)' }
	];
	const TYPES: { value: CollabType; label: string }[] = [
		{ value: 'paid', label: 'Paid' },
		{ value: 'hybrid', label: 'Paid + product' },
		{ value: 'barter', label: 'Barter' }
	];
	let n = 0;
	const blank = (): Row => ({ id: ++n, brand: '', instagram: '', contact: '', email: '', what: '1 Reel', type: 'paid', fee: '', product: '', worth: '', where: 'confirmed', date: '', paid: false, dm: '', showDm: false });
	let rows = $state<Row[]>([blank(), blank(), blank()]);
	let bulk = $state('');
	let showBulk = $state(false);
	let busy = $state(false);
	let progress = $state(0);

	// A pasted DM fills its row.
	function fromDm(r: Row, text: string) {
		const p = parseDm(text, studio.settings?.handle ?? '');
		Object.assign(r, {
			brand: r.brand || p.brand,
			instagram: r.instagram || p.instagram,
			contact: r.contact || p.contact,
			email: r.email || p.email,
			what: p.deliverables.length ? delivText(p.deliverables).replace(/ · /g, ' + ') : r.what,
			type: p.type ?? r.type,
			fee: p.fee ? String(p.fee) : r.fee,
			product: p.product || r.product,
			worth: p.productValue ? String(p.productValue) : r.worth,
			date: p.preferredLive || r.date,
			dm: text
		});
	}
	// Several DMs at once: separated by a line of --- or two empty lines.
	function splitBulk() {
		const parts = bulk.split(/\n\s*-{3,}\s*\n|\n\s*\n\s*\n/).map((x) => x.trim()).filter((x) => x.length > 10);
		if (!parts.length) return toast('Paste at least one message', 'alert');
		const filled = parts.map((t) => {
			const r = blank();
			fromDm(r, t);
			return r;
		});
		rows = [...rows.filter((r) => r.brand.trim()), ...filled];
		bulk = '';
		showBulk = false;
		toast(`${filled.length} row${filled.length > 1 ? 's' : ''} filled from the messages. Check them, then save.`, 'spark');
	}

	const ready = $derived(rows.filter((r) => r.brand.trim()));
	const total = $derived(ready.reduce((a, r) => a + (r.type === 'barter' ? 0 : Number(r.fee) || 0), 0));

	async function save() {
		busy = true;
		progress = 0;
		let ok = 0;
		for (const r of ready) {
			const deliverables = parseDm(r.what.replace(/\+/g, ','), '').deliverables;
			const stage: Stage = r.where === 'done' ? 'wrapped' : r.where;
			const fee = r.type === 'barter' ? 0 : Number(r.fee) || 0;
			const paid = r.where === 'done' || (r.where === 'live' && r.paid);
			const c = await createCollab(r.brand, {
				collab: {
					stage,
					notify_brand: false,
					contact_name: r.contact.trim(),
					contact_email: r.email.trim(),
					type: r.type,
					fee,
					product: r.type === 'paid' ? '' : r.product.trim(),
					product_value: r.type === 'paid' ? 0 : Number(r.worth) || 0,
					...(['live', 'wrapped'].includes(stage) ? { live_date: r.date || todayIso() } : r.date ? { preferred_live: r.date, live_date: r.date } : {}),
					...(paid && fee ? { pay_status: 'paid' as const, pay_received: fee, paid_on: r.date || todayIso() } : {}),
					brief: r.dm.trim().slice(0, 4000)
				},
				deliverables: deliverables.length ? deliverables : [{ kind: 'Reel', qty: 1 }],
				instagram: r.instagram.replace(/^@/, '').trim()
			});
			if (c) {
				ok++;
				if (['live', 'wrapped'].includes(stage)) await supabase.from('deliverables').update({ done: true }).eq('collab_id', c.id);
			}
			progress = ok;
		}
		await loadStudio();
		busy = false;
		if (ok) {
			confetti();
			toast(`${ok} collab${ok > 1 ? 's' : ''} imported`, 'check');
			goto('/studio/collabs');
		}
	}
</script>

<svelte:head><title>Import collabs · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Bring in what you have</div>
		<h1>Import <em>collabs</em></h1>
		<p>Add the collabs already going from DMs, WhatsApp or email, one row each. Brands are not emailed about any of this.</p>
	</div>
	<div class="acts"><button class="btn" onclick={() => (showBulk = !showBulk)}><Icon name="copy" />Paste many DMs</button></div>
</header>

{#if showBulk}
	<section class="panel rv imp-bulk">
		<div class="panel-h"><h2>Paste several messages</h2><small>one row each</small></div>
		<div class="form-b" style="display:block">
			<textarea class="inp" rows="8" placeholder={'Hi! I’m Asha from Lumière Skin (@lumiere.skin). 1 reel + 3 stories, budget 30k, live by 25th Oct…\n---\nHey, Rahul from Kora Kids here. Barter for 2 reels, products worth 8k…'} bind:value={bulk}></textarea>
			<p class="hint" style="margin:8px 0 10px">Put a line with <b>---</b> (or two empty lines) between messages. Each becomes a row you can check before saving.</p>
			<button class="btn sm grad" onclick={splitBulk} disabled={!bulk.trim()}><Icon name="spark" />Fill rows</button>
		</div>
	</section>
{/if}

<div class="imp-list">
	{#each rows as r, i (r.id)}
		<section class="panel imp-row rv" style="--i:{Math.min(i, 6)}">
			<div class="imp-num">{i + 1}</div>
			<div class="imp-grid">
				<div class="f"><label for="ib-{r.id}">Brand</label><input class="inp" id="ib-{r.id}" list="imp-brands" placeholder="Brand name" bind:value={r.brand} /></div>
				<div class="f"><label for="ii-{r.id}">Instagram <span class="hint">(optional)</span></label><input class="inp" id="ii-{r.id}" placeholder="@brand" bind:value={r.instagram} /></div>
				<div class="f"><label for="iw-{r.id}">Content</label><input class="inp" id="iw-{r.id}" placeholder="1 Reel + 3 Stories" bind:value={r.what} /></div>
				<div class="f"><label for="it-{r.id}">Type</label><Select id="it-{r.id}" bind:value={r.type} options={TYPES} /></div>
				{#if r.type !== 'barter'}<div class="f"><label for="if-{r.id}">Fee</label><div class="pre"><span>₹</span><input class="inp num" id="if-{r.id}" type="number" inputmode="numeric" placeholder="0" bind:value={r.fee} /></div></div>{/if}
				{#if r.type !== 'paid'}
					<div class="f"><label for="ip-{r.id}">Product</label><input class="inp" id="ip-{r.id}" placeholder="What they send" bind:value={r.product} /></div>
					<div class="f"><label for="iv-{r.id}">Worth</label><div class="pre"><span>₹</span><input class="inp num" id="iv-{r.id}" type="number" inputmode="numeric" placeholder="0" bind:value={r.worth} /></div></div>
				{/if}
				<div class="f"><label for="is-{r.id}">Where it stands</label><Select id="is-{r.id}" bind:value={r.where} options={WHERE} /></div>
				<div class="f"><label for="id-{r.id}">{r.where === 'live' || r.where === 'done' ? 'Went live' : 'Go-live date'} <span class="hint">(optional)</span></label><DatePicker id="id-{r.id}" bind:value={r.date} /></div>
				{#if r.where === 'live' && r.type !== 'barter'}<label class="check-row imp-paid"><input type="checkbox" class="cbx" bind:checked={r.paid} /><span>Already paid</span></label>{/if}
				<div class="f"><label for="ic-{r.id}">Contact <span class="hint">(optional)</span></label><input class="inp" id="ic-{r.id}" placeholder="Name" bind:value={r.contact} /></div>
				<div class="f"><label for="ie-{r.id}">Their email <span class="hint">(optional)</span></label><input class="inp" id="ie-{r.id}" type="email" placeholder="name@brand.com" bind:value={r.email} /></div>
			</div>
			<div class="imp-foot">
				<button class="lnk" onclick={() => (r.showDm = !r.showDm)}><Icon name="copy" />{r.showDm ? 'Hide message' : 'Paste their DM to fill this row'}</button>
				<button class="shot-x" style="opacity:1" aria-label="Remove row {i + 1}" onclick={() => (rows = rows.filter((x) => x.id !== r.id))}><Icon name="x" /></button>
			</div>
			{#if r.showDm}
				<textarea class="inp" rows="4" placeholder="Paste the brand's DM or email" value={r.dm} oninput={(e) => fromDm(r, (e.currentTarget as HTMLTextAreaElement).value)}></textarea>
			{/if}
		</section>
	{/each}
	<datalist id="imp-brands">{#each studio.brands as b (b.id)}<option value={b.name}></option>{/each}</datalist>
</div>

<div class="imp-actions">
	<button class="btn" onclick={() => (rows = [...rows, blank()])}><Icon name="plus" />Add a row</button>
	<span class="hint">{ready.length} ready{total ? ` · ${inr(total)} in fees` : ''}</span>
	<button class="btn grad lg" disabled={busy || !ready.length} onclick={save}>{#if busy}<span class="spinner"></span>Saving {progress} of {ready.length}{:else}<Icon name="check" />Import {ready.length || ''} collab{ready.length === 1 ? '' : 's'}{/if}</button>
</div>
