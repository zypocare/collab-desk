<script lang="ts">
	import { portal } from '../portal';
	import { untrack } from 'svelte';
	import { byId, igSync, linkPost, saveInvoice, setChecklist, setStage, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import type { Collab, IgMedia } from '../types';
	import type { Invoice } from '../invoice';
	import { invoiceStart } from '../invoiceDraft';
	import { captionCheck, CHECKLIST, delivText, inr, isPaid, noPost, parse, todayIso, waShare } from '../util';
	import DatePicker from './DatePicker.svelte';
	import Icon from './Icon.svelte';

	// Going live in one guided sheet: which post it is and the posting checklist (read from the caption), then the
	// invoice with everything filled in, then done. Opened from the collab's next step; "invoice" opens it on the
	// invoice alone (already live). The full invoice form is one tap away under "More options".
	let { c, mode = 'live', onclose, onmore }: { c: Collab; mode?: 'live' | 'invoice'; onclose: () => void; onmore: (draft?: Invoice) => void } = $props();
	// The sheet works from the collab as it was when it opened (each save reloads it; byId gives the fresh one).
	const c0 = untrack(() => c);
	const mode0 = untrack(() => mode);
	const s = studio.settings!;
	const delivery = noPost(c0);
	const start = invoiceStart(c0, s, studio.collabs);
	const foreign = !!c0.brand.currency && c0.brand.currency !== 'INR';
	// An invoice step when money is still to be invoiced (not for a barter, nor when it's all invoiced or paid).
	const wantsInvoice = isPaid(c0) && c0.pay_status !== 'paid' && start.items[0].rate > 0 && !c0.invoices.some((i) => i.status === 'draft');
	type Step = 'post' | 'invoice' | 'done';
	const steps: Step[] = mode0 === 'invoice' ? ['invoice'] : [...(delivery ? [] : (['post'] as Step[])), ...(wantsInvoice ? (['invoice'] as Step[]) : [])];
	let step = $state<Step>(steps[0] ?? 'post');
	const at = $derived(steps.indexOf(step));
	let busy = $state(false);

	// ---- the post ----
	const linked = new Set(studio.collabs.flatMap((x) => x.posts.map((p) => p.media.id)));
	const latest = studio.media.filter((m) => !linked.has(m.id)).sort((a, b) => b.posted_at.localeCompare(a.posted_at)).slice(0, 6);
	let media = $state<IgMedia[]>(latest);
	// Posted in the last three days: most likely the one, so it's picked already.
	let pick = $state(latest[0] && Date.now() - Date.parse(latest[0].posted_at) < 3 * 864e5 ? latest[0].id : '');
	const picked = $derived(media.find((m) => m.id === pick) ?? null);
	let pasteOpen = $state(!latest.length);
	let url = $state('');
	let finding = $state(false);
	const codeOf = (u: string) => u.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([\w-]+)/i)?.[1] ?? '';
	async function find() {
		const code = codeOf(url.trim());
		if (!code) return toast('Paste the post link from Instagram (Share → Copy link).', 'alert');
		finding = true;
		const look = async () => ((await supabase.from('ig_media').select('*').ilike('permalink', `%/${code}/%`).limit(1)).data?.[0] as IgMedia | undefined) ?? null;
		let m = await look();
		if (!m) {
			await igSync();
			m = await look();
		}
		finding = false;
		if (!m) return toast("That post isn't on your connected Instagram yet. You can mark it live and link it later.", 'alert');
		if (!media.some((x) => x.id === m!.id)) media = [m, ...media].slice(0, 6);
		pick = m.id;
		pasteOpen = false;
		url = '';
	}
	const thumb = (m: IgMedia) => m.thumbnail_url || '';
	const kindOf = (m: IgMedia) => (m.product_type === 'REELS' || m.media_type === 'VIDEO' ? 'Reel' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post');
	const ago = (iso: string) => {
		const h = Math.round((Date.now() - Date.parse(iso)) / 36e5);
		return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
	};

	// ---- the checklist: what the caption shows is ticked for her; the rest are hers to tick ----
	const found = $derived(picked?.caption ? captionCheck(picked.caption, c.brand.instagram) : null);
	let ticks = $state({ ...c0.checklist });
	const isOn = (k: (typeof CHECKLIST)[number]['key']) => !!(ticks[k] || (found && (k === 'ad_tag' || k === 'brand_tag') && found[k]));
	const SHORT: Record<string, string> = { paid_label: '"Paid partnership" label on', ad_tag: c0.type === 'barter' ? '#gifted in the first line' : '#ad in the first line', brand_tag: `${c0.brand.instagram ? '@' + c0.brand.instagram : 'The brand'} tagged`, link: 'Discount code or link (if agreed)' };

	// ---- the invoice ----
	const subtotal = start.items[0].rate;
	const gst = start.tax_mode === 'none' ? 0 : Math.round(subtotal * start.gst_rate) / 100;
	const total = subtotal + gst;
	const tds = Math.round((subtotal * start.tds_rate) / 100);
	let due = $state(start.due);
	const startTo = c0.contact_email || start.accounts;
	let sendTo = $state(startTo);
	let remind = $state(true);
	let pickDue = $state(false);
	let editTo = $state(!startTo);
	const canSend = $derived(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(sendTo.trim()));
	const day = (d: string) => (d ? parse(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
	const inDays = $derived(Math.round((parse(due).getTime() - parse(todayIso()).getTime()) / 864e5));
	const input = () => ({
		kind: start.kind,
		items: start.items,
		tax_mode: start.tax_mode,
		gst_rate: s.gst_registered ? start.gst_rate : 0,
		tds_rate: start.tds_rate,
		tds_section: start.tds_section,
		currency: 'INR',
		inr_rate: 1,
		issue_date: todayIso(),
		due_date: due || null,
		send_to: sendTo.trim().toLowerCase() === (c.contact_email ?? '').toLowerCase() ? '' : sendTo.trim().toLowerCase(),
		notes: '',
		auto_remind: remind
	});

	// ---- finishing ----
	let sent = $state<{ number: string; token: string } | null>(null);
	// Emailed to the brand, or (no email) made for her to send on WhatsApp.
	let emailed = $state(false);
	let wentLive = $state(false);
	async function goLive() {
		const now = byId(c.id) ?? c;
		if (now.stage === 'live' || now.stage === 'wrapped') return;
		if (!delivery) await setChecklist(now, Object.fromEntries(CHECKLIST.map((i) => [i.key, isOn(i.key)])));
		if (picked) await linkPost(byId(c.id) ?? now, picked);
		const after = byId(c.id) ?? now;
		if (after.stage !== 'live' && after.stage !== 'wrapped') await setStage(after, 'live', true);
		wentLive = true;
	}
	async function finish(withInvoice: boolean) {
		busy = true;
		if (mode === 'live') await goLive();
		if (withInvoice) {
			emailed = canSend;
			const ok = await saveInvoice(byId(c.id) ?? c, input(), true);
			if (ok) {
				const inv = (byId(c.id) ?? c).invoices.filter((i) => i.status === 'sent').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
				if (inv) sent = { number: inv.number ?? '', token: inv.public_token };
			}
		}
		busy = false;
		step = 'done';
	}
	async function more() {
		// The full form for this invoice: saved as a draft with what's here, then opened for editing.
		busy = true;
		if (mode === 'live') await goLive();
		const ok = foreign ? true : await saveInvoice(byId(c.id) ?? c, input(), false);
		busy = false;
		if (!ok) return;
		const draft = (byId(c.id) ?? c).invoices.filter((i) => i.status === 'draft').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
		onmore(foreign ? undefined : draft);
	}
	function next() {
		if (step === 'post') return steps.includes('invoice') ? (step = 'invoice') : finish(false);
		return finish(true);
	}
	const first = c0.contact_name ? c0.contact_name.split(' ')[0] : '';
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !busy && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && !busy && onclose()}>
	<div class="dialog golive" role="dialog" aria-modal="true" aria-labelledby="gl-title">
		<header class="gl-top">
			{#if step === 'invoice' && steps[0] === 'post'}<button type="button" class="gl-ib" aria-label="Back" onclick={() => (step = 'post')}><Icon name="chevL" /></button>{/if}
			{#if step !== 'done' && steps.length > 1}
				<div class="gl-prog" aria-label="Step {at + 1} of {steps.length}">{#each steps as x, i (x)}<i class:done={i < at} class:on={i === at}></i>{/each}</div>
				<span class="gl-eb">{at + 1} of {steps.length}</span>
			{:else}<span class="gl-grow"></span>{/if}
			<button type="button" class="gl-ib" aria-label="Close" onclick={onclose} disabled={busy}><Icon name="x" /></button>
		</header>

		<div class="gl-body">
			{#if step === 'post'}
				<div class="gl-head"><span class="gl-eb">{c.brand.name} · going live</span><h2 id="gl-title" class="gl-h">Which post is it?</h2></div>
				{#if media.length}
					<div class="gl-grid" role="group" aria-label="Your latest posts">
						{#each media as m (m.id)}
							<button type="button" class="gl-tile" class:on={pick === m.id} aria-pressed={pick === m.id} onclick={() => (pick = pick === m.id ? '' : m.id)} style:background-image={thumb(m) ? `url("${thumb(m)}")` : undefined}>
								<span>{kindOf(m)} · {ago(m.posted_at)}</span>
								{#if pick === m.id}<i class="gl-tick" aria-hidden="true"><Icon name="check" /></i>{/if}
							</button>
						{/each}
					</div>
				{:else if !studio.ig?.connected}
					<p class="gl-hint">Connect Instagram on My page and your posts show here to pick from. Or paste the link.</p>
				{/if}
				{#if pasteOpen}
					<div class="gl-paste">
						<label for="gl-url" class="sr">Post link</label>
						<input id="gl-url" class="gl-in" placeholder="instagram.com/reel/…" bind:value={url} inputmode="url" autocomplete="off" />
						<button type="button" class="gl-ghost" disabled={finding || !url.trim()} onclick={find}>{#if finding}<span class="spinner"></span>{:else}Find{/if}</button>
					</div>
				{:else}<button type="button" class="gl-link" onclick={() => (pasteOpen = true)}>Not here? Paste the post link</button>{/if}

				<div class="gl-group">
					<div class="gl-row-h"><span class="gl-eb">Posting checklist</span>{#if found}<small>read from the caption</small>{/if}</div>
					<div class="gl-card">
						{#each CHECKLIST as item (item.key)}
							{@const auto = !!found && (item.key === 'ad_tag' || item.key === 'brand_tag') && found[item.key]}
							<label class="gl-ck">
								<span>{SHORT[item.key]}</span>
								{#if auto}<em class="gl-yes"><Icon name="check" />found</em>{:else}<input type="checkbox" bind:checked={ticks[item.key]} aria-label={item.label} />{/if}
							</label>
						{/each}
					</div>
					<small class="gl-hint">Indian ad rules (ASCI) need paid posts and gifts clearly marked.</small>
				</div>
			{:else if step === 'invoice'}
				<div class="gl-head"><span class="gl-eb">{c.brand.name}{mode === 'live' ? (delivery ? ' · delivered' : ' · going live') : ''}</span><h2 id="gl-title" class="gl-h">Your invoice</h2></div>
				{#if foreign}
					<p class="gl-hint">{c.brand.name} pays in {c.brand.currency}. The full invoice form handles the currency and the export details.</p>
				{:else}
					<div class="gl-card gl-inv">
						<div class="gl-inv-h"><span class="gl-eb">{start.kind === 'advance' ? 'Advance invoice' : start.kind === 'balance' ? 'Balance invoice' : 'Invoice'}</span><small>ready to send</small></div>
						<div class="gl-ln"><span>{delivText(c.deliverables) || 'Content'}</span><b>{inr(subtotal)}</b></div>
						{#if gst}<div class="gl-ln"><span>GST {start.gst_rate}%</span><b>{inr(gst)}</b></div>{/if}
						<div class="gl-cut" aria-hidden="true"></div>
						<div class="gl-tot"><span>Total</span><b>{inr(total)}</b></div>
						<p class="gl-hint">{#if tds}They'll deduct {start.tds_rate}% TDS ({inr(tds)}), so <b>{inr(total - tds)}</b> lands in your bank.{:else}The brand pays you directly.{/if}{s.upi_id ? ' UPI QR on the invoice.' : ''}</p>
					</div>
					<div class="gl-opts">
						<button type="button" class="gl-opt" aria-expanded={pickDue} onclick={() => (pickDue = !pickDue)}><b>Payment due</b><small>{inDays > 0 ? `in ${inDays} days · ` : ''}{day(due)}</small></button>
						{#if pickDue}<div class="gl-pick"><DatePicker ariaLabel="Payment due" bind:value={due} min={todayIso()} clearable={false} /></div>{/if}
						{#if editTo}
							<div class="gl-opt gl-to"><label for="gl-to"><b>Send to</b></label><input id="gl-to" type="email" class="gl-in" placeholder="accounts@brand.com (optional)" bind:value={sendTo} /></div>
							{#if !canSend}<p class="gl-hint">No email? Fine: the invoice is made, and you send it on WhatsApp next.</p>{/if}
						{:else}
							<button type="button" class="gl-opt" onclick={() => (editTo = true)}><b>Send to</b><small>{sendTo}</small></button>
						{/if}
						<label class="gl-opt"><b>Payment reminders</b><small>polite, automatic</small><input type="checkbox" bind:checked={remind} /></label>
					</div>
				{/if}
				<button type="button" class="gl-link" onclick={more} disabled={busy}>More options: currency, GST, TDS, address, note</button>
			{:else}
				<div class="gl-done">
					<span class="gl-big" aria-hidden="true"><Icon name="check" /></span>
					<span class="gl-eb">{c.brand.name}</span>
					<h2 id="gl-title" class="gl-h">{wentLive ? (delivery ? 'Delivered' : "You're live") : 'Invoice sent'}</h2>
					<p>{#if sent && emailed}Invoice {sent.number} for {inr(total)} is with {first || c.brand.name}. Due {day(due)}.{:else if sent}Invoice {sent.number} for {inr(total)} is ready. Send it on WhatsApp: they pay by UPI or bank transfer from the link.{:else}Nice work.{/if}</p>
				</div>
				<ul class="gl-list">
					{#if wentLive && picked}<li><Icon name="check" />{kindOf(picked)} linked · results come in on their own</li>{/if}
					{#if wentLive && !delivery}<li><Icon name="check" />Posting checklist saved</li>{/if}
					{#if sent}<li><Icon name="check" />{emailed ? `Invoice emailed${remind ? ' · reminders on' : ''}` : 'Invoice made · send it on WhatsApp'}</li><li><Icon name="check" />Shows under Money · Due</li>{/if}
				</ul>
			{/if}
		</div>

		<footer class="gl-foot">
			{#if step === 'post'}
				<button type="button" class="gl-go" disabled={busy} onclick={next}>{#if busy}<span class="spinner"></span>{/if}{steps.includes('invoice') ? 'Next: invoice' : delivery ? 'Mark delivered' : 'Mark live'}{#if !busy && steps.includes('invoice')}<Icon name="arrow" />{/if}</button>
			{:else if step === 'invoice'}
				{#if foreign}
					<button type="button" class="gl-go" disabled={busy} onclick={more}>{#if busy}<span class="spinner"></span>{/if}Open the invoice form</button>
				{:else}
					<button type="button" class="gl-go" disabled={busy} onclick={next}>{#if busy}<span class="spinner"></span>{/if}{mode === 'live' ? (delivery ? 'Mark delivered & ' : 'Mark live & ') : ''}{canSend ? 'send invoice' : 'make invoice'}</button>
					{#if mode === 'live'}<button type="button" class="gl-text" disabled={busy} onclick={() => finish(false)}>{delivery ? 'Mark delivered' : 'Mark live'}, invoice later</button>{/if}
				{/if}
			{:else}
				{#if sent}<a class="gl-go" href={waShare(c.contact_phone, `Hi${first ? ' ' + first : ''}, here's invoice ${sent.number} for ${inr(total)}, due ${day(due)}. You can pay by UPI or bank transfer here: ${location.origin}/invoice/${sent.token}`)} target="_blank" rel="noopener">{emailed ? 'Send on WhatsApp too' : 'Send on WhatsApp'}</a>{/if}
				<button type="button" class={sent ? 'gl-text' : 'gl-go'} onclick={onclose}>Back to the collab</button>
			{/if}
		</footer>
	</div>
</div>

<style>
	/* The same sheet as Add a collab: header and button stay put, the middle scrolls without a bar. */
	:global([data-side]) .dialog.golive { display: flex; flex-direction: column; width: min(480px, 100%); max-height: min(860px, calc(100dvh - 32px)); padding: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 26px; background: var(--surface); box-shadow: var(--shadow-lg); }
	@media (max-width: 760px) {
		:global([data-side]) .dialog.golive { width: 100%; max-height: calc(100dvh - max(24px, env(safe-area-inset-top, 0px))); border-radius: 24px 24px 0 0; border-width: 1px 0 0; }
	}
	.gl-top { display: flex; align-items: center; gap: 10px; padding: 10px 10px 4px 14px; }
	.gl-ib { width: 44px; height: 44px; flex: none; display: grid; place-items: center; border: 0; background: none; color: var(--ink-2); cursor: pointer; }
	.gl-ib :global(.ic) { width: 20px; height: 20px; }
	.gl-prog { flex: 1; display: flex; gap: 6px; }
	.gl-prog i { height: 4px; flex: 1; background: var(--line-strong); }
	.gl-prog i.done { background: var(--g1); }
	.gl-prog i.on { background: var(--ink); }
	.gl-grow { flex: 1; }
	.gl-eb { font-size: 10.5px; font-weight: 800; letter-spacing: .17em; text-transform: uppercase; color: var(--ink-3); }
	.gl-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; display: flex; flex-direction: column; gap: 16px; padding: 8px 20px 18px; }
	.gl-body::-webkit-scrollbar { display: none; }
	.gl-head { display: flex; flex-direction: column; gap: 6px; }
	:global([data-side]) .golive .gl-h { margin: 0; font: 400 clamp(30px, 9vw, 38px)/1.04 var(--f-serif, Georgia, serif); letter-spacing: -.01em; }
	.gl-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
	.gl-tile { position: relative; aspect-ratio: 4 / 5; display: flex; align-items: flex-end; padding: 0; border: 0; overflow: hidden; background: linear-gradient(160deg, color-mix(in oklab, var(--g3) 70%, var(--bg)), color-mix(in oklab, var(--g2) 60%, var(--bg))) center / cover no-repeat; color: #fff; cursor: pointer; }
	.gl-tile span { width: 100%; padding: 18px 8px 7px; text-align: left; font: 700 11px var(--f-body, inherit); background: linear-gradient(transparent, rgba(0, 0, 0, .65)); }
	.gl-tile.on { outline: 3px solid var(--ink); outline-offset: -3px; }
	.gl-tick { position: absolute; top: 7px; right: 7px; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: var(--ink); color: var(--bg); }
	.gl-tick :global(.ic) { width: 15px; height: 15px; stroke-width: 2.6; }
	.gl-paste { display: flex; gap: 8px; }
	.gl-in { flex: 1; min-width: 0; height: 48px; box-sizing: border-box; padding: 0 14px; border: 1px solid var(--line-strong); background: var(--bg); color: var(--ink); font: 400 15px var(--f-body, inherit); outline: 0; }
	.gl-in:focus { border-color: var(--ink); }
	.gl-ghost { min-width: 72px; height: 48px; border: 1px solid var(--ink); background: transparent; color: var(--ink); font: 700 14px var(--f-body, inherit); cursor: pointer; }
	.gl-ghost:disabled { opacity: .45; }
	.gl-link { align-self: flex-start; min-height: 44px; padding: 0; border: 0; background: none; color: var(--accent); font: 700 13.5px var(--f-body, inherit); text-align: left; cursor: pointer; }
	.gl-group { display: flex; flex-direction: column; gap: 10px; }
	.gl-row-h { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
	.gl-row-h small { font-size: 12.5px; color: var(--ink-3); }
	.gl-card { border: 1px solid var(--line-strong); background: var(--bg); box-shadow: 4px 4px 0 var(--line-strong); }
	.gl-ck { display: flex; align-items: center; gap: 12px; min-height: 50px; padding: 4px 14px; border-top: 1px dashed var(--line-strong); cursor: pointer; }
	.gl-ck:first-child { border-top: 0; }
	.gl-ck span { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; }
	.gl-ck input, .gl-opt input { width: 22px; height: 22px; flex: none; accent-color: var(--g1); }
	.gl-yes { display: inline-flex; align-items: center; gap: 4px; font-style: normal; font-size: 12px; font-weight: 700; color: var(--ok); }
	.gl-yes :global(.ic) { width: 14px; height: 14px; stroke-width: 2.6; }
	.gl-hint { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--ink-3); }
	.gl-hint b { color: var(--ink); }
	.gl-inv { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
	.gl-inv-h { display: flex; justify-content: space-between; align-items: baseline; }
	.gl-inv-h .gl-eb { color: var(--ink); }
	.gl-inv-h small { font-size: 12.5px; color: var(--ink-3); }
	.gl-ln { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--ink-2); }
	.gl-ln span { min-width: 0; overflow-wrap: anywhere; }
	.gl-ln b { color: var(--ink); font-weight: 600; white-space: nowrap; }
	.gl-cut { border-top: 2px dashed var(--line-strong); }
	.gl-tot { display: flex; justify-content: space-between; align-items: baseline; }
	.gl-tot span { font-size: 14px; font-weight: 700; }
	.gl-tot b { font: 400 34px var(--f-serif, Georgia, serif); }
	.gl-opts { display: flex; flex-direction: column; }
	.gl-opt { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 4px 2px; border: 0; border-top: 1px solid var(--line); background: none; color: var(--ink); text-align: left; font: inherit; cursor: pointer; }
	.gl-opt b { flex: none; font-size: 14.5px; font-weight: 600; }
	.gl-opt small { flex: 1; min-width: 0; text-align: right; font-size: 13px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.gl-to { flex-wrap: wrap; cursor: default; }
	.gl-to label { flex: none; }
	.gl-to .gl-in { flex: 1 1 180px; }
	.gl-pick { padding: 4px 0 10px; }
	.gl-done { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 8px 8px; text-align: center; }
	.gl-big { width: 76px; height: 76px; display: grid; place-items: center; border-radius: 50%; background: var(--ok); color: var(--bg); box-shadow: 0 0 0 10px color-mix(in oklab, var(--ok) 16%, transparent); margin-bottom: 8px; }
	.gl-big :global(.ic) { width: 36px; height: 36px; stroke-width: 2.6; }
	.gl-done p { margin: 0; max-width: 320px; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
	.gl-list { list-style: none; margin: 0; padding: 0; }
	.gl-list li { display: flex; align-items: center; gap: 12px; min-height: 48px; border-top: 1px solid var(--line); font-size: 14px; }
	.gl-list li :global(.ic) { width: 18px; height: 18px; flex: none; color: var(--ok); stroke-width: 2.4; }
	.gl-foot { display: flex; flex-direction: column; gap: 4px; padding: 12px 20px calc(16px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid var(--line); background: var(--surface); }
	.gl-go { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 54px; padding: 0 16px; border: 0; background: var(--ink); color: var(--bg); font: 800 16px var(--f-body, inherit); text-align: center; text-decoration: none; box-shadow: 4px 4px 0 var(--g2); cursor: pointer; transition: transform .07s, box-shadow .07s, opacity .2s; }
	.gl-go:hover { color: var(--bg); text-decoration: none; }
	.gl-go:not(:disabled):active { transform: translate(4px, 4px); box-shadow: 0 0 0 var(--g2); }
	.gl-go:disabled { opacity: .45; }
	.gl-go :global(.ic) { width: 18px; height: 18px; }
	.gl-text { min-height: 44px; border: 0; background: none; color: var(--ink-2); font: 600 14px var(--f-body, inherit); cursor: pointer; }
	@media (max-height: 700px) {
		.gl-body { gap: 12px; }
		:global([data-side]) .golive .gl-h { font-size: 30px; }
		.gl-ck { min-height: 44px; }
		.gl-go { min-height: 50px; }
	}
</style>
