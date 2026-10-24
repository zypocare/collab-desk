<script lang="ts">
	import { day, inr0, label } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';
	import { LIMIT_LABEL, PERIOD_LABEL, STATUS_TAG } from './billing.ts';

	// The Miracle plan an account is on (its own, or an Agency plan that covers it), its history, and
	// giving it a plan for free until a date, or ending a trial or free plan early.
	let { kind, subject }: { kind: 'creator' | 'workspace' | 'agency'; subject: string } = $props();

	type R = Record<string, any>;
	let p = $state<R | null>(null);
	let err = $state('');
	let giving = $state(false);
	let gPlan = $state('');
	let gUntil = $state('');
	let gReason = $state('');
	let busy = $state(false);

	async function load() {
		const { data, error } = await supabase.rpc('admin_plan', { p_kind: kind, p_subject: subject });
		err = error ? errMessage(error) : '';
		if (!error) {
			p = data as R;
			gPlan = p.plans[0]?.code ?? '';
		}
	}
	$effect(() => {
		void kind;
		void subject;
		p = null;
		load();
	});

	async function give(e: SubmitEvent) {
		e.preventDefault();
		if (!gPlan || !gUntil || !gReason.trim()) return;
		busy = true;
		const { error } = await supabase.rpc('admin_billing_grant', { p_kind: kind, p_subject: subject, p_plan: gPlan, p_until: new Date(gUntil + 'T23:59:59').toISOString(), p_reason: gReason.trim() });
		busy = false;
		if (error) return toast(errMessage(error), true);
		giving = false;
		gReason = '';
		gUntil = '';
		toast('Plan given');
		load();
	}
	async function end(h: R) {
		const reason = await askText({ title: `End this ${PERIOD_LABEL[h.period]?.toLowerCase() ?? ''} plan now?`, body: 'The account drops to its free plan straight away.', ok: 'End now', danger: true, input: { label: 'Why (for the audit trail)', required: true } });
		if (reason === null) return;
		const { error } = await supabase.rpc('admin_billing_end', { p_subscription: h.id, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		toast('Plan ended');
		load();
	}
	const limits = $derived(p ? Object.entries(p.limits ?? {}).filter(([k]) => LIMIT_LABEL[k]) : []);
	const planName = $derived(p?.name ?? (kind === 'agency' ? 'No Agency plan' : 'Free'));
	const minDate = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
</script>

<section class="card">
	<div class="card-h">
		<h2 class="card-t">Miracle plan</h2>
		{#if p}<span class="tag {p.rank > 1 ? 't-acc' : 't-mute'}">{planName}</span>{/if}
	</div>
	{#if err}<p class="card-b err">{err}</p>{:else if !p}<div class="card-empty"><span class="spinner"></span></div>{:else}
		<dl class="kv">
			<div><dt>Plan</dt><dd>{planName}{#if p.via_agency} <span class="muted">(through an Agency plan)</span>{/if}</dd></div>
			{#if p.period}<div><dt>Period</dt><dd>{PERIOD_LABEL[p.period] ?? p.period}{p.founding ? ' · founding price' : ''}{p.cancel_at_end ? ' · ends at period end' : ''}</dd></div>{/if}
			{#if p.ends_at}<div><dt>{p.period === 'month' || p.period === 'year' ? 'Renews' : 'Ends'}</dt><dd>{day(p.ends_at)} · {p.days_left} day{p.days_left === 1 ? '' : 's'} left</dd></div>{/if}
			{#if limits.length}<div><dt>Limits</dt><dd>{limits.map(([k, v]) => `${LIMIT_LABEL[k]} ${v}`).join(' · ')}</dd></div>{/if}
		</dl>
		{#if p.history.length}
			<ul class="hist">
				{#each p.history as h (h.id)}
					<li>
						<span><b>{h.plan}</b> · {PERIOD_LABEL[h.period] ?? h.period}{h.kind !== kind ? ' (agency)' : ''}</span>
						<span class="tag {h.live ? 't-ok' : STATUS_TAG[h.status] ?? 't-mute'}">{h.live ? 'Live' : label(h.status)}</span>
						<small class="muted">{day(h.starts_at)} → {day(h.ends_at)}{h.paid ? ' · paid ' + inr0(h.paid) : ''}{h.note ? ' · ' + h.note : ''}</small>
						{#if h.live && h.source !== 'razorpay' && h.kind === kind}<button class="lnk end" onclick={() => end(h)}>End now</button>{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if giving}
			<form class="give" onsubmit={give}>
				<div class="f"><label for="g-plan-{subject}">Plan</label>
					<select id="g-plan-{subject}" class="inp" bind:value={gPlan}>{#each p.plans as o (o.code)}<option value={o.code}>{o.name}</option>{/each}</select></div>
				<div class="f"><label for="g-until-{subject}">Free until</label><input id="g-until-{subject}" class="inp" type="date" min={minDate} bind:value={gUntil} required /></div>
				<div class="f wide"><label for="g-why-{subject}">Why</label><input id="g-why-{subject}" class="inp" bind:value={gReason} placeholder="e.g. Launch partner, influencer deal" required /></div>
				<div class="gb"><button type="button" class="btn sm" onclick={() => (giving = false)}>Cancel</button><button class="btn pri sm" disabled={busy || !gPlan || !gUntil || !gReason.trim()}>Give plan</button></div>
			</form>
		{:else if p.plans.length}
			<div class="card-b gv"><button class="btn sm" onclick={() => (giving = true)}>Give a plan for free</button><a class="sm" href={href('subscriptions')}>All subscriptions</a></div>
		{/if}
	{/if}
</section>

<style>
	.hist { list-style: none; margin: 0; padding: 4px 16px 10px; border-top: 1px solid var(--line-soft); }
	.hist li { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 7px 0; font-size: 12.5px; border-bottom: 1px solid var(--line-soft); }
	.hist li:last-child { border-bottom: 0; }
	.hist b { font-weight: 500; font-family: var(--f-mono); font-size: 12px; }
	.hist small { grid-column: 1 / -1; font-size: 11.5px; }
	.end { grid-column: 1 / -1; justify-self: start; font-size: 12px; color: var(--bad); }
	.give { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line-soft); }
	.wide { grid-column: 1 / -1; }
	.gb { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 8px; }
	.gv { display: flex; justify-content: space-between; align-items: center; gap: 8px; border-top: 1px solid var(--line-soft); }
	.sm { font-size: 12.5px; }
</style>
