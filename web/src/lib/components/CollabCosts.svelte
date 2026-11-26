<script lang="ts">
	import { ask } from '../confirm.svelte';
	import type { Collab } from '../types';
	import { reloadCollabs, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage, fmt, inr } from '../util';
	import {
		collabProfit,
		EXPENSE_CATS,
		EXPENSE_PRESETS,
		type ExpensePreset
	} from '../expenses';
	import { estimateTrip, type TravelMode, type TravelSlotId } from '../travel';
	import Icon from './Icon.svelte';

	let { c }: { c: Collab } = $props();

	let activePresetId = $state<string>('attire');
	let label = $state('');
	let amount = $state('');
	let spentOn = $state(new Date().toISOString().slice(0, 10));
	let busy = $state(false);

	const preset = $derived<ExpensePreset>(
		EXPENSE_PRESETS.find((x) => x.id === activePresetId) ?? EXPENSE_PRESETS[0]
	);
	const p = $derived(collabProfit(c));
	const expenses = $derived(c.expenses ?? []);

	const costSharePct = $derived(
		p.earned > 0 ? Math.min(100, Math.round((p.costs / p.earned) * 100)) : p.costs > 0 ? 100 : 0
	);

	// Smart integration with Shoot location & travel: offer 1-tap travel expense logging
	const s = $derived(studio.settings);
	const travelMode = $derived<TravelMode>((s?.travel_mode as TravelMode) || 'cab');
	const slotId = $derived<TravelSlotId>((c.travel_slot as TravelSlotId) || 'midday');
	const bufferMins = $derived(Number(s?.travel_buffer_mins ?? 15));

	const plannedTrip = $derived(
		c.shoot_mode === 'location' && typeof c.travel_km === 'number' && c.travel_km > 0
			? estimateTrip(c.travel_km, c.travel_mins, travelMode, slotId, bufferMins)
			: null
	);
	const hasTravelLogged = $derived(expenses.some((x) => x.category === 'travel'));

	// Category breakdown totals for visual ledger
	const breakdown = $derived.by(() => {
		const map = new Map<keyof typeof EXPENSE_CATS, number>();
		for (const x of expenses) {
			map.set(x.category, (map.get(x.category) ?? 0) + (Number(x.amount) || 0));
		}
		return [...map.entries()]
			.map(([cat, total]) => ({
				cat,
				name: EXPENSE_CATS[cat],
				total,
				pct: p.costs > 0 ? Math.round((total / p.costs) * 100) : 0
			}))
			.sort((a, b) => b.total - a.total);
	});

	function selectPreset(item: ExpensePreset) {
		activePresetId = item.id;
	}

	function applyQuickTag(tag: string) {
		label = tag;
	}

	async function addExpense(e: SubmitEvent) {
		e.preventDefault();
		const amt = Number(amount);
		const cleanLabel = label.trim() || preset.label;
		if (!Number.isFinite(amt) || amt <= 0) {
			return toast('Enter an expense amount above ₹0', 'alert');
		}
		busy = true;
		const { error } = await supabase.from('collab_expenses').insert({
			collab_id: c.id,
			label: cleanLabel.slice(0, 80),
			amount: amt,
			category: preset.category,
			spent_on: spentOn || new Date().toISOString().slice(0, 10)
		});
		busy = false;
		if (error) return toast(`Couldn't save: ${errMessage(error)}`, 'alert');
		label = '';
		amount = '';
		toast(`${cleanLabel} logged`, 'check');
		reloadCollabs();
	}

	async function quickLogTravel() {
		if (!plannedTrip) return;
		busy = true;
		const place = c.venue_name || c.brand.name;
		const desc = `${plannedTrip.mode.label} round trip · ${plannedTrip.distKm} km (${place})`.slice(0, 80);
		const { error } = await supabase.from('collab_expenses').insert({
			collab_id: c.id,
			label: desc,
			amount: plannedTrip.roundTripCost,
			category: 'travel',
			spent_on: c.shoot_date || new Date().toISOString().slice(0, 10)
		});
		busy = false;
		if (error) return toast(`Couldn't save travel cost: ${errMessage(error)}`, 'alert');
		toast(`Logged ₹${plannedTrip.roundTripCost} travel estimate`, 'check');
		reloadCollabs();
	}

	async function remove(id: string, what: string) {
		if (!(await ask({ title: `Remove “${what}”?`, ok: 'Remove', danger: true }))) return;
		await supabase.from('collab_expenses').delete().eq('id', id);
		reloadCollabs();
	}
</script>

<section class="sec cp-sec">
	<h3>Costs &amp; profit {#if p.costs}<span>{inr(p.costs)} spent</span>{/if}</h3>

	<div class="cp-stack">
		<!-- 1. Net Profit Hero Card -->
		<div class="cp-hero" class:neg={p.kept < 0}>
			<div class="cp-hero-top">
				<span class="cp-eb">Net take-home</span>
				{#if p.earned > 0}
					<span class="cp-pill" class:warn={p.margin < 60} class:neg={p.kept < 0}>
						{p.margin}% kept
					</span>
				{:else if p.product > 0}
					<span class="cp-pill">{inr(p.product)} product</span>
				{/if}
			</div>

			<div class="cp-big">
				<strong>{inr(p.kept)}</strong>
				<small>
					{#if p.earned > 0}
						out of {inr(p.earned)}{p.product ? ` + ${inr(p.product)} product` : ''}
					{:else if p.product > 0}
						barter deal ({inr(p.product)} product value)
					{:else}
						set fee in Deal to track margin
					{/if}
				</small>
			</div>

			{#if p.earned > 0 || p.costs > 0}
				<div class="cp-bar" aria-hidden="true">
					<i style="width:{100 - costSharePct}%"></i>
				</div>
			{/if}

			<div class="cp-kpis">
				<div class="cp-kpi">
					<small>Earned</small>
					<b>{inr(p.earned)}</b>
				</div>
				<div class="cp-kpi">
					<small>Total costs</small>
					<b class:spent={p.costs > 0}>{p.costs ? `−${inr(p.costs)}` : '₹0'}</b>
				</div>
				<div class="cp-kpi hi" class:neg={p.kept < 0}>
					<small>You keep</small>
					<b>{inr(p.kept)}</b>
				</div>
			</div>
		</div>

		<!-- Smart 1-Tap On-Location Travel Sync -->
		{#if plannedTrip && !hasTravelLogged}
			<div class="cp-travel-nudge">
				<div class="cp-tn-txt">
					<Icon name="pin" />
					<div>
						<b>Log {plannedTrip.mode.label.toLowerCase()} travel ({plannedTrip.distKm} km)</b>
						<small>From Shoot location &amp; travel · est. round trip {inr(plannedTrip.roundTripCost)}</small>
					</div>
				</div>
				<button type="button" class="cp-tn-btn" disabled={busy} onclick={quickLogTravel}>
					+ {inr(plannedTrip.roundTripCost)}
				</button>
			</div>
		{/if}

		<!-- 2. Expense Builder Card -->
		<form class="cp-card" onsubmit={addExpense}>
			<div class="cp-card-h">
				<span>Add collab expense</span>
				<small>{EXPENSE_CATS[preset.category]}</small>
			</div>

			<div class="cp-chips" role="radiogroup" aria-label="Expense type">
				{#each EXPENSE_PRESETS as item (item.id)}
					<button
						type="button"
						class="cp-chip"
						class:on={activePresetId === item.id}
						onclick={() => selectPreset(item)}
					>
						{item.label}
					</button>
				{/each}
			</div>

			<div class="cp-tags" aria-label="Quick suggestions">
				{#each preset.quickTags as tag (tag)}
					<button
						type="button"
						class="cp-tag"
						class:on={label === tag}
						onclick={() => applyQuickTag(tag)}
					>
						+ {tag}
					</button>
				{/each}
			</div>

			<div class="cp-field">
				<label for="exp-lbl-{c.id}">Expense note</label>
				<input
					id="exp-lbl-{c.id}"
					class="cp-inp"
					type="text"
					maxlength="80"
					placeholder={preset.placeholder}
					bind:value={label}
				/>
			</div>

			<div class="cp-row2">
				<div class="cp-field">
					<label for="exp-amt-{c.id}">Amount</label>
					<div class="cp-amt-wrap">
						<span>₹</span>
						<input
							id="exp-amt-{c.id}"
							class="cp-inp num"
							type="number"
							inputmode="decimal"
							min="1"
							step="any"
							placeholder="0"
							bind:value={amount}
						/>
					</div>
				</div>
				<div class="cp-field">
					<label for="exp-dt-{c.id}">Date</label>
					<input
						id="exp-dt-{c.id}"
						class="cp-inp"
						type="date"
						bind:value={spentOn}
					/>
				</div>
			</div>

			<button type="submit" class="cp-neo" disabled={busy || !amount}>
				{#if busy}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}
				<span>Add {preset.label.toLowerCase()}</span>
			</button>
		</form>

		<!-- 3. Logged Expenses Ledger -->
		{#if expenses.length}
			<div class="cp-card">
				<div class="cp-card-h">
					<span>Expense breakdown</span>
					<small>{expenses.length} item{expenses.length === 1 ? '' : 's'} · {inr(p.costs)}</small>
				</div>

				{#if breakdown.length > 1}
					<div class="cp-cats">
						{#each breakdown as b (b.cat)}
							<div class="cp-cat-pill">
								<span>{b.name}</span>
								<b>{inr(b.total)}</b>
								<em>{b.pct}%</em>
							</div>
						{/each}
					</div>
				{/if}

				<div class="cp-list">
					{#each expenses as x (x.id)}
						<div class="cp-item">
							<div class="cp-item-l">
								<span class="cp-cat-badge">{EXPENSE_CATS[x.category]}</span>
								<b>{x.label}</b>
								<small>{fmt(x.spent_on)}</small>
							</div>
							<div class="cp-item-r">
								<strong>{inr(x.amount)}</strong>
								<button
									type="button"
									class="cp-del"
									aria-label="Remove {x.label}"
									onclick={() => remove(x.id, x.label)}
								>
									<Icon name="x" />
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</section>

<style>
	.cp-stack {
		display: grid;
		gap: 12px;
		padding-top: 4px;
	}
	.cp-hero, .cp-card {
		display: grid;
		gap: 13px;
		padding: 16px;
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: var(--surface, #161116);
	}
	.cp-hero {
		border-color: rgba(156, 123, 255, 0.28);
		background:
			radial-gradient(120% 85% at 0% 0%, rgba(156, 123, 255, 0.14), transparent 60%),
			radial-gradient(90% 80% at 100% 100%, rgba(52, 211, 153, 0.08), transparent 55%),
			var(--surface, #161116);
	}
	.cp-hero.neg {
		border-color: rgba(251, 113, 133, 0.38);
		background:
			radial-gradient(120% 85% at 0% 0%, rgba(251, 113, 133, 0.14), transparent 60%),
			var(--surface, #161116);
	}
	.cp-hero-top, .cp-card-h {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.cp-eb, .cp-card-h span {
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.cp-card-h small { font-size: 11.5px; color: var(--ink-3); }
	.cp-pill {
		font-family: var(--mono);
		font-size: 10.5px;
		font-weight: 700;
		padding: 3px 9px;
		border-radius: 999px;
		background: rgba(52, 211, 153, 0.15);
		color: #6ee7b7;
		border: 1px solid rgba(52, 211, 153, 0.3);
	}
	.cp-pill.warn { background: rgba(251, 191, 36, 0.15); color: #fcd34d; border-color: rgba(251, 191, 36, 0.35); }
	.cp-pill.neg { background: rgba(251, 113, 133, 0.18); color: #fda4af; border-color: rgba(251, 113, 133, 0.4); }

	.cp-big { display: grid; gap: 2px; }
	.cp-big strong { font: 400 32px/1.05 var(--f-serif, Georgia, serif); color: var(--ink); }
	.cp-hero.neg .cp-big strong { color: #fda4af; }
	.cp-big small { font-size: 12.5px; color: var(--ink-2); }

	.cp-bar {
		height: 6px;
		border-radius: 999px;
		background: rgba(251, 113, 133, 0.25);
		overflow: hidden;
	}
	.cp-bar i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #34d399, #9c7bff);
		transition: width 0.35s ease;
	}

	.cp-kpis {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 7px;
	}
	.cp-kpi {
		display: grid;
		gap: 2px;
		padding: 9px 10px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(13, 10, 14, 0.52);
	}
	.cp-kpi.hi { border-color: rgba(52, 211, 153, 0.32); background: rgba(16, 185, 129, 0.1); }
	.cp-kpi.hi.neg { border-color: rgba(251, 113, 133, 0.35); background: rgba(251, 113, 133, 0.1); }
	.cp-kpi small { font-family: var(--mono); font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); }
	.cp-kpi b { font-size: 14.5px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
	.cp-kpi b.spent { color: #fda4af; }
	.cp-kpi.hi b { color: #6ee7b7; }
	.cp-kpi.hi.neg b { color: #fda4af; }

	.cp-travel-nudge {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 14px;
		border: 1px solid rgba(156, 123, 255, 0.35);
		background: rgba(156, 123, 255, 0.1);
	}
	.cp-tn-txt { display: flex; align-items: flex-start; gap: 9px; min-width: 0; }
	.cp-tn-txt :global(.ic) { width: 16px; height: 16px; color: #c8b6ff; flex: none; margin-top: 2px; }
	.cp-tn-txt b { display: block; font-size: 13px; color: var(--ink); }
	.cp-tn-txt small { display: block; font-size: 11.5px; color: var(--ink-2); }
	.cp-tn-btn {
		flex: none;
		height: 34px;
		padding: 0 12px;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		color: var(--bg);
		font-size: 12.5px;
		font-weight: 700;
		box-shadow: 2.5px 2.5px 0 var(--g2);
		cursor: pointer;
	}

	.cp-chips {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 7px;
	}
	.cp-chip {
		height: 38px;
		padding: 0 10px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.03);
		color: var(--ink-2);
		font-size: 12.5px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}
	.cp-chip.on {
		border-color: var(--g2);
		background: rgba(242, 90, 144, 0.12);
		color: var(--ink);
		box-shadow: inset 0 -2.5px 0 var(--g2);
	}

	.cp-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.cp-tag {
		height: 28px;
		padding: 0 10px;
		border-radius: 999px;
		border: 1px dashed rgba(156, 123, 255, 0.35);
		background: rgba(156, 123, 255, 0.07);
		color: #d8cbff;
		font-size: 11.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.cp-tag.on {
		border-style: solid;
		border-color: var(--g1);
		background: rgba(156, 123, 255, 0.22);
		color: #fff;
	}

	.cp-field { display: grid; gap: 6px; min-width: 0; }
	.cp-field label {
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.cp-row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 9px;
	}
	.cp-amt-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}
	.cp-amt-wrap span {
		position: absolute;
		left: 12px;
		color: var(--ink-3);
		font-size: 15px;
		font-weight: 600;
		pointer-events: none;
	}
	.cp-inp {
		width: 100%;
		min-width: 0;
		height: 42px;
		padding: 0 12px;
		border-radius: 10px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: #0d0a0e;
		color: var(--ink);
		font: 400 16px/1 var(--f-sans, inherit);
		outline: none;
	}
	.cp-inp.num { padding-left: 28px; font-variant-numeric: tabular-nums; }
	.cp-inp:focus { border-color: var(--g1); }

	.cp-neo {
		width: 100%;
		height: 42px;
		border: 0;
		border-radius: 0;
		background: var(--ink);
		color: var(--bg);
		font-size: 13.5px;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		box-shadow: 3px 3px 0 var(--g2);
		cursor: pointer;
	}
	.cp-neo:disabled { opacity: 0.5; cursor: not-allowed; }
	.cp-neo :global(.ic) { width: 15px; height: 15px; }

	.cp-cats {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.cp-cat-pill {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 9px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(13, 10, 14, 0.55);
		font-size: 11.5px;
	}
	.cp-cat-pill span { color: var(--ink-2); }
	.cp-cat-pill b { color: var(--ink); }
	.cp-cat-pill em { font-style: normal; font-family: var(--mono); font-size: 10px; color: #c8b6ff; }

	.cp-list { display: grid; gap: 8px; }
	.cp-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(13, 10, 14, 0.5);
	}
	.cp-item-l { display: grid; gap: 2px; min-width: 0; }
	.cp-cat-badge {
		font-family: var(--mono);
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #c8b6ff;
	}
	.cp-item-l b { font-size: 13.5px; color: var(--ink); overflow-wrap: anywhere; }
	.cp-item-l small { font-size: 11.5px; color: var(--ink-3); }

	.cp-item-r { display: inline-flex; align-items: center; gap: 8px; flex: none; }
	.cp-item-r strong { font-size: 14px; color: #fda4af; font-variant-numeric: tabular-nums; }
	.cp-del {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(255, 255, 255, 0.04);
		color: var(--ink-3);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}
	.cp-del :global(.ic) { width: 13px; height: 13px; }
</style>
