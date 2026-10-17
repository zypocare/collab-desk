<script lang="ts">
	import { goto } from '$app/navigation';
	import { createCollab, loadStudio, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { parseDm } from '#lib/parseDm.ts';
	import type { CollabType, Stage } from '#lib/types.ts';
	import { confetti, toast } from '#lib/ui.svelte.ts';
	import { delivText, emailOk, inr, todayIso } from '#lib/util.ts';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Select from '#lib/components/Select.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import { PHONE_Q, phone } from '#lib/phone.svelte.ts';

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
	// A phone starts with one card (add more as you go); a laptop with three rows.
	const onPhone = typeof matchMedia !== 'undefined' && matchMedia(PHONE_Q).matches;
	let rows = $state<Row[]>(onPhone ? [blank()] : [blank(), blank(), blank()]);
	const typeLabel = (t: CollabType) => TYPES.find((x) => x.value === t)?.label ?? '';
	const whereLabel = (w: Where) => WHERE.find((x) => x.value === w)?.label ?? '';
	async function addRow() {
		rows = [...rows, blank()];
		await new Promise((r) => setTimeout(r, 30));
		document.getElementById(`ib-${rows[rows.length - 1].id}`)?.focus();
	}
	function oneByOne() {
		showBulk = false;
		document.getElementById(`ib-${rows[0]?.id}`)?.focus();
	}
	let bulk = $state('');
	let showBulk = $state(false);
	let busy = $state(false);
	let progress = $state(0);
	let sendLinks = $state(true);
	// Laptop: each row's details (contact, email, product, their DM) open under it.
	let open = $state<number | null>(null);

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
		// Check every row first, and say which one needs fixing.
		const bad = ready
			.map((r) => {
				const n = rows.indexOf(r) + 1;
				if (r.type !== 'barter' && r.fee !== '' && !(Number(r.fee) >= 0)) return `Row ${n}: the fee can't be below ₹0.`;
				if (r.type !== 'paid' && r.worth !== '' && !(Number(r.worth) >= 0)) return `Row ${n}: the product value can't be below ₹0.`;
				if (r.email.trim() && !emailOk(r.email)) return `Row ${n}: the email doesn't look right.`;
				return '';
			})
			.filter(Boolean);
		if (bad.length) return toast(bad[0] + (bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''), 'alert');
		busy = true;
		const done = new Set<number>();
		progress = 0;
		let ok = 0;
		const imported: string[] = [];
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
				done.add(r.id);
				if (r.email.trim()) imported.push(c.id);
				if (['live', 'wrapped'].includes(stage)) await supabase.from('deliverables').update({ done: true }).eq('collab_id', c.id);
			}
			progress = ok;
		}
		if (sendLinks && imported.length) await supabase.rpc('send_track_links', { p_ids: imported, p_notify: true });
		await loadStudio();
		busy = false;
		const failed = ready.length - ok;
		if (failed) {
			// Keep the rows that didn't save on screen (the saved ones go), so nothing is lost.
			rows = rows.filter((r) => !done.has(r.id));
			toast(`${ok ? `${ok} imported. ` : ''}${failed} row${failed > 1 ? 's' : ''} couldn't be saved and ${failed > 1 ? 'are' : 'is'} still here to fix.`, 'alert');
		} else if (ok) {
			confetti();
			toast(`${ok} collab${ok > 1 ? 's' : ''} imported${sendLinks && imported.length ? `, ${imported.length} tracking link${imported.length > 1 ? 's' : ''} emailed` : ''}`, 'check');
			goto('/studio/collabs');
		}
	}
</script>

<svelte:head><title>Import collabs · {studio.settings?.app_name}</title></svelte:head>

{#if phone.on}
<header class="ph imp-ph rv">
	<div>
		<div class="eb">Bring in what you have</div>
		<h1>Import <em>collabs</em></h1>
		<p>Add the collabs already going from DMs, WhatsApp or email, one row each. Brands only hear from you if you tick “Email brands their tracking link” below; otherwise copy each link into their DM from the collab.</p>
	</div>
</header>

<!-- Two ways in: paste a pile of DMs, or fill the cards one by one. -->
<div class="imp-intro rv" style="--i:1">
	<button class="imp-way" class:on={showBulk} onclick={() => (showBulk = !showBulk)}>
		<span class="iw-ic grad"><Icon name="spark" /></span>
		<span class="iw-t"><b>Paste your DMs</b><small>Paste several messages at once and the details fill themselves in</small></span>
	</button>
	<button class="imp-way" onclick={oneByOne}>
		<span class="iw-ic"><Icon name="edit" /></span>
		<span class="iw-t"><b>Add one by one</b><small>Type the brand, what you agreed and where it stands</small></span>
	</button>
</div>

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
			<header class="imp-h">
				{#if r.brand.trim()}<Mono name={r.brand} />{:else}<span class="imp-n">{i + 1}</span>{/if}
				<span class="imp-ht"><b>{r.brand.trim() || `Collab ${i + 1}`}</b><small>{r.what || 'Content'} · {typeLabel(r.type)}{r.type !== 'barter' && Number(r.fee) ? ` · ${inr(Number(r.fee))}` : ''} · {whereLabel(r.where)}</small></span>
				<button class="imp-x" aria-label="Remove collab {i + 1}" onclick={() => (rows = rows.filter((x) => x.id !== r.id))}><Icon name="x" /></button>
			</header>
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
				<button class="lnk imp-dm" onclick={() => (r.showDm = !r.showDm)}><Icon name="copy" />{r.showDm ? 'Hide message' : 'Paste their DM to fill this in'}</button>
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
	<button class="btn imp-add" onclick={addRow}><Icon name="plus" /><span class="nav-long">Add a row</span><span class="nav-short">Add another</span></button>
	<span class="hint">{ready.length} ready{total ? ` · ${inr(total)} in fees` : ''}</span>
	<label class="check-row imp-send"><input type="checkbox" class="cbx" bind:checked={sendLinks} /><span>Email brands (with an email) their tracking link</span></label>
	<button class="btn grad lg" disabled={busy || !ready.length} onclick={save}>{#if busy}<span class="spinner"></span>Saving {progress} of {ready.length}{:else}<Icon name="check" />Import {ready.length || ''} collab{ready.length === 1 ? '' : 's'}{/if}</button>
</div>
{:else}
<!-- Laptop: one table, a line per collab, details opening under a row. -->
<header class="ph imp-ph rv">
	<div>
		<div class="eb">Bring in what you have</div>
		<h1>Import collabs</h1>
		<p>Add the collabs already going in DMs, WhatsApp or email: one line each. Brands only hear from you if you tick "Email brands their tracking link".</p>
	</div>
	<div class="acts"><button class="btn ai-btn" class:on={showBulk} onclick={() => (showBulk = !showBulk)}><Icon name="spark" />Paste DMs</button></div>
</header>

{#if showBulk}
	<section class="panel rv imp-bulk">
		<div class="panel-h"><h2>Paste several messages</h2><small>each becomes a line you can check</small></div>
		<div class="ib-b">
			<textarea class="inp" rows="7" placeholder={'Hi! I’m Asha from Lumière Skin (@lumiere.skin). 1 reel + 3 stories, budget 30k, live by 25th Oct…\n---\nHey, Rahul from Kora Kids here. Barter for 2 reels, products worth 8k…'} bind:value={bulk}></textarea>
			<div class="ib-foot"><span class="hint">Put a line with <b>---</b> (or two empty lines) between messages.</span><button class="btn sm grad" onclick={splitBulk} disabled={!bulk.trim()}><Icon name="spark" />Fill lines</button></div>
		</div>
	</section>
{/if}

<section class="panel it rv" style="--i:1">
	<div class="it-row it-head" role="row">
		<span>#</span><span>Brand</span><span>Instagram</span><span>Content</span><span>Type</span><span>Fee</span><span>Where it stands</span><span>Go-live date</span><span></span>
	</div>
	{#each rows as r, i (r.id)}
		<div class="it-item" class:open={open === r.id}>
			<div class="it-row" role="row">
				<span class="it-n">{i + 1}</span>
				<input class="it-in" id="ib-{r.id}" list="imp-brands" placeholder="Brand name" aria-label="Brand" bind:value={r.brand} />
				<input class="it-in" placeholder="@brand" aria-label="Instagram" bind:value={r.instagram} />
				<input class="it-in" placeholder="1 Reel + 3 Stories" aria-label="Content" bind:value={r.what} />
				<Select bind:value={r.type} options={TYPES} />
				{#if r.type === 'barter'}
					<span class="it-money"><span>₹</span><input class="it-in num" type="number" inputmode="numeric" placeholder="Worth" aria-label="Product worth" bind:value={r.worth} /></span>
				{:else}
					<span class="it-money"><span>₹</span><input class="it-in num" type="number" inputmode="numeric" placeholder="0" aria-label="Fee" bind:value={r.fee} /></span>
				{/if}
				<Select bind:value={r.where} options={WHERE} />
				<DatePicker bind:value={r.date} />
				<span class="it-acts">
					<button class="it-ib" class:on={open === r.id} title="Contact, email, product and their DM" aria-label="More for line {i + 1}" aria-expanded={open === r.id} onclick={() => (open = open === r.id ? null : r.id)}><Icon name="more" /></button>
					<button class="it-ib" title="Remove" aria-label="Remove line {i + 1}" onclick={() => (rows = rows.filter((x) => x.id !== r.id))}><Icon name="x" /></button>
				</span>
			</div>
			{#if open === r.id}
				<div class="it-more">
					<label class="f"><span>Contact</span><input class="inp" placeholder="Name" bind:value={r.contact} /></label>
					<label class="f"><span>Their email</span><input class="inp" type="email" placeholder="name@brand.com" bind:value={r.email} /></label>
					{#if r.type !== 'paid'}
						<label class="f"><span>Product they send</span><input class="inp" placeholder="What they send" bind:value={r.product} /></label>
						{#if r.type === 'hybrid'}<label class="f"><span>Product worth</span><div class="pre"><span>₹</span><input class="inp num" type="number" inputmode="numeric" placeholder="0" bind:value={r.worth} /></div></label>{/if}
					{/if}
					{#if r.where === 'live' && r.type !== 'barter'}<label class="check-row imp-paid"><input type="checkbox" class="cbx" bind:checked={r.paid} /><span>Already paid</span></label>{/if}
					<label class="f it-dm"><span>Their DM <small>(paste it to fill this line in)</small></span><textarea class="inp" rows="3" placeholder="Paste the brand's DM or email" value={r.dm} oninput={(e) => fromDm(r, (e.currentTarget as HTMLTextAreaElement).value)}></textarea></label>
				</div>
			{/if}
		</div>
	{/each}
	<datalist id="imp-brands">{#each studio.brands as b (b.id)}<option value={b.name}></option>{/each}</datalist>
	<div class="it-foot">
		<button class="btn sm" onclick={addRow}><Icon name="plus" />Add a line</button>
		<span class="hint">{ready.length} ready{total ? ` · ${inr(total)} in fees` : ''}</span>
		<label class="check-row imp-send"><input type="checkbox" class="cbx" bind:checked={sendLinks} /><span>Email brands their tracking link</span></label>
		<button class="btn grad" disabled={busy || !ready.length} onclick={save}>{#if busy}<span class="spinner"></span>Saving {progress} of {ready.length}{:else}<Icon name="check" />Import {ready.length || ''} collab{ready.length === 1 ? '' : 's'}{/if}</button>
	</div>
</section>
{/if}
