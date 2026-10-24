<script lang="ts">
	import { applyToBrief, rulesText, withdrawFromBrief } from '#lib/campaigns.svelte.ts';
	import { ask } from '#lib/confirm.svelte.ts';
	import { portal } from '#lib/portal.ts';
	import { studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import type { OpenBrief } from '#lib/types.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { delivText, diff, errMessage, fmt, inr, usageDaysOf } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';

	// Open briefs: brands looking for creators. She applies with her own rate and a short note;
	// the brand sends a request if they pick her. Nothing is booked until then.
	let { briefs = $bindable() }: { briefs: OpenBrief[] } = $props();

	// Alerts when a brief that fits her opens (at most 3 a week).
	const alertsOn = $derived(studio.settings?.brief_alerts !== false);
	async function setAlerts(v: boolean) {
		const { error } = await supabase.rpc('brief_alerts_set', { p_on: v });
		if (error) return toast(errMessage(error), 'alert');
		if (studio.settings) studio.settings.brief_alerts = v;
		toast(v ? "You'll hear about briefs that fit you" : 'Brief alerts off', v ? 'bell' : 'check');
	}

	// The sheet: one brief, either read (her application) or the apply form.
	let open = $state<{ b: OpenBrief; edit: boolean } | null>(null);
	let rate = $state<number | null>(0);
	let note = $state('');
	let busy = $state(false);

	const rates = $derived(studio.settings?.rates ?? {});
	const isBarter = (b: OpenBrief) => b.brief.type === 'barter';
	// Her rate card's price for what the brief asks for (0 for barter).
	const cardPrice = (b: OpenBrief) => (isBarter(b) ? 0 : (b.brief.deliverables ?? []).reduce((a, d) => a + (Number(rates[d.kind]) || 0) * d.qty, 0));

	// "₹15-30K", "Up to ₹30K", "Barter".
	const k = (n: number) => (n >= 1e5 ? `${+(n / 1e5).toFixed(1)}L` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n));
	function budget(b: OpenBrief) {
		if (isBarter(b)) return 'Barter';
		const lo = Number(b.budget_min) || 0;
		const hi = Number(b.budget_max) || 0;
		if (lo && hi && lo !== hi) {
			const a = k(lo), z = k(hi);
			return a.slice(-1) === z.slice(-1) ? `₹${a.slice(0, -1)}-${z}` : `₹${a}-${z}`;
		}
		if (hi || lo) return `${lo && !hi ? 'From' : 'Up to'} ₹${k(hi || lo)}`;
		return b.brief.fee ? `₹${k(b.brief.fee)}` : 'Your rate';
	}
	function budgetSub(b: OpenBrief) {
		if (isBarter(b)) return b.brief.barter_kind === 'experience' ? 'experience' : 'product';
		return b.brief.type === 'hybrid' ? 'budget + product' : 'budget';
	}
	// "Product sent first · 30 days ad use · post by 15 Nov".
	function terms(b: OpenBrief) {
		const t = b.brief;
		const out: string[] = [];
		if (t.type !== 'paid' && t.product) out.push(t.barter_kind === 'experience' ? t.product : 'Product sent first');
		const days = usageDaysOf(t.usage ?? '');
		if (days) out.push(`${days} days ad use`);
		else if (/perpetual/i.test(t.usage ?? '')) out.push('Brand use, no end date');
		else if (/organic/i.test(t.usage ?? '')) out.push('No ads');
		if (t.preferred_live) out.push(`post by ${fmt(t.preferred_live)}`);
		if (t.content_language?.length) out.push(`in ${t.content_language.join(' or ')}`);
		return out.join(' · ');
	}
	const task = (b: OpenBrief) => [delivText(b.brief.deliverables ?? []), b.brief.product || b.name].filter(Boolean).join(' · ');
	function closes(b: OpenBrief) {
		const d = diff(b.open_until);
		return d <= 0 ? 'Closes today' : d === 1 ? 'Closes tomorrow' : `Closes in ${d} days`;
	}
	const rateText = (b: OpenBrief, n: number) => (n ? inr(n) : isBarter(b) ? 'barter' : inr(0));
	function status(b: OpenBrief) {
		const m = b.mine;
		if (m?.status === 'sent') return 'They sent you a request';
		if (m) return `${m.status === 'shortlist' ? 'Shortlisted' : 'Applied'} · ${rateText(b, m.rate)}`;
		return `${closes(b)} · ${b.applied ? `${b.applied} applied` : 'be the first'}`;
	}
	const tone = (b: OpenBrief) => (b.mine ? 'ok' : diff(b.open_until) <= 1 ? 'hot' : 'warn');
	const fits = (b: OpenBrief) => b.fit?.ok !== false;
	/** You qualify (when there are rules), or the first thing she's missing. */
	const fitChips = (b: OpenBrief) =>
		b.mine ? [] : !fits(b) ? [{ text: b.fit!.misses[0], tone: 'warn' as const }] : rulesText(b.rules) ? [{ text: '✓ You qualify', tone: 'ok' as const }] : [];

	function show(b: OpenBrief, edit: boolean) {
		// A brand that already sent a request can't be changed from here.
		if (b.mine?.status === 'sent') edit = false;
		rate = b.mine ? Number(b.mine.rate) || 0 : cardPrice(b);
		note = b.mine?.note ?? '';
		open = { b, edit };
	}
	const hint = $derived.by(() => {
		if (!open) return '';
		const b = open.b;
		const card = cardPrice(b);
		const max = Number(b.budget_max) || 0;
		if (!isBarter(b) && max && Number(rate) > max) return `Above their budget (${budget(b)})`;
		if (isBarter(b)) return 'Barter brief, so 0 is fine. Add a fee if you want one.';
		if (card && Number(rate) === card) return 'From your rate card';
		if (!card) return 'Add your rates in Settings and this fills in on its own.';
		return `Your rate card: ${inr(card)}`;
	});

	async function send(ev: SubmitEvent) {
		ev.preventDefault();
		if (!open || busy) return;
		const b = open.b;
		busy = true;
		try {
			briefs = await applyToBrief(b.id, Number(rate) || 0, note.trim());
			toast(b.mine ? `Application to ${b.brand} updated` : `Application sent to ${b.brand}. You'll hear if they pick you.`, 'send');
			open = null;
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
		busy = false;
	}
	async function withdraw(b: OpenBrief) {
		open = null;
		if (!(await ask({ title: `Withdraw from ${b.brand}?`, body: "They won't see your application any more. You can apply again while the brief is open.", ok: 'Withdraw', danger: true }))) return;
		try {
			briefs = await withdrawFromBrief(b.id);
			toast('Application withdrawn', 'x');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && open && (open = null)} />

<div class="panel" style="margin-bottom:14px">
	<div class="switch-row" style="border-top:0">
		<div><b>Tell me when a brief fits me</b><small>An alert when a brand opens a brief for your niche, content and rates. At most 3 a week.</small></div>
		<input type="checkbox" class="tgl" checked={alertsOn} aria-label="Brief alerts" onchange={(e) => setAlerts((e.currentTarget as HTMLInputElement).checked)} />
	</div>
</div>
{#if briefs.length}
	<p class="hint">Brands looking for creators like you. Apply with your own rate; the brand sends a request if they pick you.</p>
	<section class="tks pt-tks">
		{#each briefs as b, i (b.id)}
			<Ticket name={b.brand} sub={[b.verified ? '✓ Verified' : '', b.category].filter(Boolean).join(' · ')} money={budget(b)} moneySub={budgetSub(b)} task={task(b)} status={status(b)} tone={tone(b)} chips={fitChips(b)} onopen={() => show(b, !b.mine && fits(b))} {i}>
				<span class="pt-tk-acts">
					{#if !b.mine && !fits(b)}
						<button class="btn" onclick={() => show(b, false)}>See the brief</button>
					{:else if !b.mine}
						<button class="btn grad" onclick={() => show(b, true)}>Apply</button>
					{:else}
						<button class="btn" onclick={() => show(b, false)}>View</button>
						{#if b.mine.status !== 'sent'}<button class="btn" onclick={() => show(b, true)}><Icon name="edit" />Change</button>{/if}
					{/if}
				</span>
			</Ticket>
		{/each}
	</section>
{:else}
	<div class="clear hero-card glow m-none">
		<div class="mesh" aria-hidden="true"></div>
		<span class="clear-ic"><Icon name="inbox" /></span>
		<b>No open briefs right now</b>
		<small>When a brand opens a brief for creators like you, it shows up here. Your pitches carry on as usual.</small>
	</div>
{/if}

{#if open}
	{@const b = open.b}
	<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (open = null)}>
		<div class="dialog quote-dialog" role="dialog" aria-modal="true" aria-labelledby="ob-title">
			<form onsubmit={send}>
				<h2 id="ob-title">{open.edit ? `Apply to ${b.brand}` : b.brand}</h2>
				<p>{[task(b), terms(b)].filter(Boolean).join(' · ')}</p>
				{#if rulesText(b.rules)}
					<div class="f">
						<span class="lbl-t">Who can apply</span>
						<p>{rulesText(b.rules)}</p>
						{#if b.fit && !b.fit.ok && !b.mine}<p class="ob-miss">Not for you this time: {b.fit.misses.map((m) => m.charAt(0).toLowerCase() + m.slice(1)).join('; ')}.</p>{:else if !b.mine}<p class="ob-ok">✓ You qualify</p>{/if}
					</div>
				{/if}
				{#if b.brief.brief}
					<div class="f">
						<span class="lbl-t">The brief</span>
						<p>{b.brief.brief}</p>
					</div>
				{/if}

				{#if open.edit}
					<div class="fields">
						<div class="f">
							<label for="ob-rate">Your rate</label>
							<div class="pre"><span>₹</span><input class="inp num" id="ob-rate" type="number" inputmode="numeric" min="0" step="500" bind:value={rate} required /></div>
							{#if hint}<small class="hint">{hint}</small>{/if}
						</div>
						<div class="f span2">
							<label for="ob-note">Why you <span class="hint">(optional)</span></label>
							<textarea class="inp" id="ob-note" rows="3" maxlength="400" placeholder="e.g. Most of my audience is women 25-34 in Bangalore. I can post by the 12th." bind:value={note}></textarea>
						</div>
					</div>
					<p class="hint">{b.brand} sees your rate, this note and the audience numbers you already share. Nothing is booked until they send a request.</p>
					<div class="row">
						<button class="btn ghost" type="button" onclick={() => (open = null)}>Cancel</button>
						<button class="btn grad" type="submit" disabled={busy || rate === null || Number(rate) < 0}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}{b.mine ? 'Update application' : 'Send application'}</button>
					</div>
				{:else if b.mine}
					<div class="q-total">
						<div><span class="lbl">Your rate</span><b class="num">{rateText(b, b.mine.rate)}</b></div>
						<small>{b.mine.note || 'No note added'}</small>
					</div>
					<p class="hint">{b.mine.status === 'sent' ? `${b.brand} picked you and sent a request. You'll find it with your collabs.` : b.mine.status === 'shortlist' ? `${b.brand} shortlisted you. Nothing is booked until they send a request.` : `${closes(b)}. Nothing is booked until ${b.brand} sends a request.`}</p>
					<div class="row">
						{#if b.mine.status !== 'sent'}<button class="btn ghost" type="button" onclick={() => withdraw(b)}><Icon name="x" />Withdraw</button>{/if}
						<button class="btn" type="button" onclick={() => (open = null)}>Close</button>
						{#if b.mine.status !== 'sent'}<button class="btn primary" type="button" onclick={() => open && (open.edit = true)}><Icon name="edit" />Change</button>{/if}
					</div>
				{/if}
			</form>
		</div>
	</div>
{/if}

<style>
	.ob-miss {
		color: var(--warn);
		font-weight: 600;
	}
	.ob-ok {
		color: var(--ok);
		font-weight: 600;
	}
</style>
