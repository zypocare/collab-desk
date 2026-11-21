<script lang="ts">
	import type { Collab, Stage } from '../types';
	import { copyText } from '../ui.svelte';
	import {
		initials,
		inr,
		isPaid,
		outstanding,
		stageIndex,
		STAGES,
		waShare
	} from '../util';
	import { openOutside } from '../native';
	import Icon from './Icon.svelte';

	// Mobile Live Deal Cockpit for Collab Detail (/studio/c/[code]):
	// Hero brand + deal value card, 6-stage visual progress stepper, 3-tab quick jump (Work/Money/Details),
	// 1-tap WhatsApp payment nudge tones, and a floating sticky bottom primary CTA bar.
	let {
		c,
		next = null,
		onstage,
		onrunnext,
		onjump
	}: {
		c: Collab;
		next: { key: string; label: string; hint: string; icon: string } | null;
		onstage: (st: Stage) => void;
		onrunnext: (key: string) => void;
		onjump: (id: string) => void;
	} = $props();

	const SHORT_LABEL: Record<string, string> = {
		request: 'Request',
		negotiating: 'Quote',
		confirmed: 'Booked',
		creating: 'Create',
		live: 'Live',
		wrapped: 'Paid'
	};

	const si = $derived(stageIndex(c.stage));
	const paid = $derived(isPaid(c));
	const owes = $derived(outstanding(c));
	const dealVal = $derived(c.type === 'barter' ? Number(c.product_value) || 0 : Number(c.fee) || 0);
	const received = $derived(Math.max(0, Number(c.pay_received) || 0));

	const delivTotal = $derived((c.deliverables ?? []).reduce((a, d) => a + (Number(d.qty) || 1), 0));
	const delivDone = $derived((c.deliverables ?? []).filter((d) => d.done).reduce((a, d) => a + (Number(d.qty) || 1), 0));

	let nudgeOpen = $state(false);
	let tone = $state<'polite' | 'firm' | 'final'>('polite');

	const brandFirst = $derived(c.contact_name?.trim().split(/\s+/)[0] || c.brand.name);
	const invLink = $derived(
		c.invoices?.[0]?.public_token ? `${location.origin}/invoice/${c.invoices[0].public_token}` : `${location.origin}/t/${c.track_token}`
	);

	const nudgeMsg = $derived.by(() => {
		const amt = owes > 0 ? inr(owes) : inr(dealVal);
		if (tone === 'firm') {
			return `Hi ${brandFirst}, quick reminder that the ${amt} balance for ${c.brand.name} (${c.code}) is due. You can complete the UPI transfer in 1 tap here: ${invLink}`;
		}
		if (tone === 'final') {
			return `Hi ${brandFirst}, the ${amt} payment for ${c.brand.name} (${c.code}) is overdue per our agreed terms. Please clear it by EOD via this link: ${invLink}`;
		}
		return `Hi ${brandFirst}! Sharing the quick UPI link for ${amt} on our ${c.brand.name} collab (${c.code}): ${invLink}`;
	});

	function sendWhatsApp(msg?: string) {
		const text =
			msg ||
			(owes > 0
				? nudgeMsg
				: `Hi ${brandFirst}, quick update on our ${c.brand.name} collab (${c.code}). You can check the latest details here: ${location.origin}/t/${c.track_token}`);
		const href = waShare(c.contact_phone || '', text);
		copyText(text, 'WhatsApp message copied!');
		openOutside(href);
	}
</script>

<section class="ck" aria-label="Live deal cockpit">
	<!-- 1. Hero Brand & Deal Value Card -->
	<div class="ck-hero">
		<div class="ck-top">
			<div class="ck-ring"><div class="ck-ring-in">{initials(c.brand.name).slice(0, 2)}</div></div>
			<div class="ck-id">
				<b class="ck-brand">{c.brand.name}</b>
				<span class="ck-sub">{c.code}{#if c.brand.instagram} · @{c.brand.instagram.replace(/^@/, '')}{/if}</span>
			</div>
			<button type="button" class="ck-wa" aria-label="WhatsApp brand" onclick={() => sendWhatsApp()}>
				<Icon name="chat" />
			</button>
		</div>

		<div class="ck-money">
			<div>
				<small>{c.type === 'barter' ? 'Barter Value' : 'Agreed Deal Value'}</small>
				<b class="ck-val">{dealVal > 0 ? inr(dealVal) : 'TBD'}</b>
			</div>
			{#if paid}
				<span class="ck-pill ok">✓ Paid in Full</span>
			{:else if owes > 0}
				<button type="button" class="ck-pill warn" onclick={() => (nudgeOpen = !nudgeOpen)}>
					● {received > 0 ? `${inr(received)} paid · ` : ''}{inr(owes)} due
				</button>
			{:else}
				<span class="ck-pill">{c.type === 'barter' ? 'Barter' : 'No invoice yet'}</span>
			{/if}
		</div>
	</div>

	<!-- 2. Interactive 6-Stage Visual Stepper -->
	{#if !['declined', 'paused', 'cancelled'].includes(c.stage)}
		<div class="ck-step-card">
			<div class="ck-step-h">
				<span>Deal Progress</span>
				<b>Stage {Math.min(si + 1, STAGES.length)} of {STAGES.length}</b>
			</div>
			<div class="ck-stepper">
				{#each STAGES as st, i (st.id)}
					<button
						type="button"
						class="ck-st"
						class:done={i < si}
						class:active={i === si}
						onclick={() => onstage(st.id)}
					>
						<i class="ck-bar"></i>
						<span>{SHORT_LABEL[st.id] ?? st.label}</span>
					</button>
				{/each}
			</div>
			{#if next}
				<div class="ck-next">
					<i class="ck-dot" aria-hidden="true"></i>
					<span><b>Next move:</b> {next.hint}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- 3. 3-Tab Quick Jump Pills (Work · Money · Details) -->
	<div class="ck-tabs" role="navigation" aria-label="Collab sections">
		<button type="button" onclick={() => onjump('sec-deliv')}>
			Work{#if delivTotal > 0} ({delivDone}/{delivTotal}){/if}
		</button>
		<button type="button" onclick={() => onjump('sec-pay')}>
			Money{#if owes > 0} · {inr(owes)}{/if}
		</button>
		<button type="button" onclick={() => onjump('sec-brief')}>Details</button>
	</div>

	<!-- 4. Inline 1-Tap WhatsApp Payment Nudge Drawer (when unpaid balance exists) -->
	{#if nudgeOpen && owes > 0}
		<div class="ck-nudge">
			<div class="ck-step-h">
				<span>1-Tap WhatsApp Payment Nudge</span>
				<button type="button" class="ck-close" onclick={() => (nudgeOpen = false)}>Hide</button>
			</div>
			<div class="ck-tones">
				{#each [['polite', 'Polite'], ['firm', 'Firm'], ['final', 'Final']] as [k, lbl] (k)}
					<button type="button" class:on={tone === k} onclick={() => (tone = k as typeof tone)}>{lbl}</button>
				{/each}
			</div>
			<p class="ck-nmsg">{nudgeMsg}</p>
			<button type="button" class="btn sm grad" onclick={() => sendWhatsApp(nudgeMsg)}>
				<Icon name="send" />Send Nudge on WhatsApp
			</button>
		</div>
	{/if}
</section>

<!-- 5. Floating Smart Sticky Bottom Action Bar -->
{#if next}
	<div class="ck-sticky no-print">
		<button type="button" class="ck-cta" onclick={() => onrunnext(next.key)}>
			<Icon name={next.icon} /><span>{next.label}</span>
		</button>
		<button type="button" class="ck-cta-wa" aria-label="Share update on WhatsApp" onclick={() => sendWhatsApp()}>
			<Icon name="chat" />
		</button>
	</div>
{/if}

<style>
	.ck {
		display: grid;
		gap: 11px;
		margin-bottom: 14px;
	}
	.ck-hero {
		border-radius: 20px;
		padding: 14px;
		background:
			radial-gradient(120% 95% at 100% 0%, color-mix(in oklab, var(--g2) 22%, transparent), transparent 58%),
			radial-gradient(100% 90% at 0% 100%, color-mix(in oklab, var(--g1) 20%, transparent), transparent 60%),
			var(--surface);
		border: 1px solid var(--line);
		display: grid;
		gap: 12px;
	}
	.ck-top {
		display: flex;
		align-items: center;
		gap: 11px;
	}
	.ck-ring {
		width: 46px;
		height: 46px;
		border-radius: 14px;
		padding: 2px;
		background: linear-gradient(135deg, var(--g1), var(--g2), var(--g3));
		flex: none;
	}
	.ck-ring-in {
		width: 100%;
		height: 100%;
		border-radius: 12px;
		background: var(--bg);
		display: grid;
		place-items: center;
		font-family: var(--f-serif, Georgia, serif);
		font-style: italic;
		font-size: 20px;
		color: var(--ink);
	}
	.ck-id {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.ck-brand {
		font-family: var(--f-serif, Georgia, serif);
		font-style: italic;
		font-weight: 400;
		font-size: 22px;
		line-height: 1.1;
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ck-sub {
		font-size: 11.5px;
		color: var(--ink-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ck-wa {
		appearance: none;
		width: 36px;
		height: 36px;
		border-radius: 11px;
		border: 1px solid color-mix(in oklab, var(--h-live) 45%, var(--line));
		background: color-mix(in oklab, var(--h-live) 14%, var(--surface));
		color: var(--h-live);
		display: grid;
		place-items: center;
		cursor: pointer;
		flex: none;
	}
	.ck-money {
		padding-top: 10px;
		border-top: 1px dashed var(--line);
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}
	.ck-money small {
		display: block;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ck-val {
		font-family: var(--f-serif, Georgia, serif);
		font-style: italic;
		font-weight: 400;
		font-size: 30px;
		line-height: 1;
		color: var(--g3);
	}
	.ck-pill {
		appearance: none;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 5px 10px;
		border-radius: 999px;
		font: 700 11px/1.1 var(--f-body);
		border: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--ink-2);
		cursor: pointer;
	}
	.ck-pill.ok {
		border-color: color-mix(in oklab, var(--h-live) 45%, transparent);
		background: color-mix(in oklab, var(--h-live) 14%, transparent);
		color: var(--h-live);
		cursor: default;
	}
	.ck-pill.warn {
		border-color: color-mix(in oklab, var(--g3) 45%, transparent);
		background: color-mix(in oklab, var(--g3) 14%, transparent);
		color: var(--g3);
	}
	.ck-step-card,
	.ck-nudge {
		border-radius: 16px;
		padding: 12px;
		background: var(--surface);
		border: 1px solid var(--line);
		display: grid;
		gap: 9px;
	}
	.ck-step-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11px;
	}
	.ck-step-h span {
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ck-step-h b {
		color: var(--g1);
	}
	.ck-stepper {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 4px;
	}
	.ck-st {
		appearance: none;
		border: 0;
		background: none;
		padding: 2px 0;
		cursor: pointer;
		display: grid;
		justify-items: center;
		gap: 4px;
		color: var(--ink-3);
		font-family: var(--f-body);
	}
	.ck-bar {
		display: block;
		width: 100%;
		height: 5px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--ink) 10%, transparent);
	}
	.ck-st.done .ck-bar {
		background: var(--h-live);
	}
	.ck-st.active .ck-bar {
		background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3));
	}
	.ck-st span {
		font-size: 9px;
		font-weight: 700;
		white-space: nowrap;
	}
	.ck-st.active span {
		color: var(--ink);
	}
	.ck-st.done span {
		color: var(--h-live);
	}
	.ck-next {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 11px;
		background: color-mix(in oklab, var(--g1) 12%, var(--surface));
		border: 1px solid color-mix(in oklab, var(--g1) 30%, transparent);
		font-size: 12px;
		color: var(--ink-2);
	}
	.ck-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--g2);
		flex: none;
	}
	.ck-tabs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 5px;
		padding: 3px;
		border-radius: 999px;
		background: var(--surface);
		border: 1px solid var(--line);
	}
	.ck-tabs button {
		appearance: none;
		border: 0;
		background: none;
		color: var(--ink-2);
		font: 700 11.5px/1 var(--f-body);
		padding: 8px 6px;
		border-radius: 999px;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ck-tabs button:active {
		background: var(--ink);
		color: var(--bg);
	}
	.ck-tones {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 6px;
	}
	.ck-tones button {
		appearance: none;
		border: 1px solid var(--line);
		background: transparent;
		color: var(--ink-3);
		font: 700 11px/1 var(--f-body);
		padding: 7px 6px;
		border-radius: 8px;
		cursor: pointer;
	}
	.ck-tones button.on {
		border-color: var(--g1);
		background: color-mix(in oklab, var(--g1) 16%, var(--surface));
		color: var(--ink);
	}
	.ck-nmsg {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--ink-2);
		padding: 9px 10px;
		border-radius: 10px;
		background: color-mix(in oklab, var(--bg) 70%, transparent);
		border: 1px solid var(--line);
	}
	.ck-close {
		appearance: none;
		border: 0;
		background: none;
		color: var(--ink-3);
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
	}
	.ck-sticky {
		position: fixed;
		left: 0;
		right: 0;
		bottom: calc(var(--rail-h, 64px) + env(safe-area-inset-bottom, 0px));
		z-index: 35;
		padding: 10px 14px;
		background: linear-gradient(180deg, transparent, color-mix(in oklab, var(--bg) 96%, transparent) 30%, var(--bg));
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ck-cta {
		flex: 1;
		height: 46px;
		border: 0;
		border-radius: 13px;
		background: linear-gradient(135deg, var(--g1), var(--g2), var(--g3));
		color: #120b12;
		font: 800 13px/1 var(--f-body);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		cursor: pointer;
		box-shadow: 0 10px 24px -10px color-mix(in oklab, var(--g2) 65%, transparent);
	}
	.ck-cta-wa {
		width: 46px;
		height: 46px;
		border-radius: 13px;
		border: 1px solid color-mix(in oklab, var(--h-live) 45%, var(--line));
		background: var(--surface);
		color: var(--h-live);
		display: grid;
		place-items: center;
		cursor: pointer;
		flex: none;
	}
</style>
