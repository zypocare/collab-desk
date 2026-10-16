<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import type { BarterMode } from '../priority';
	import { barterSlotsUsed } from '../priority';
	import { toast } from '../ui.svelte';
	import { CATS, inr } from '../util';
	import Segmented from './Segmented.svelte';
	import Select from './Select.svelte';

	const s = $derived(studio.settings!);
	const used = $derived(barterSlotsUsed(studio.collabs));
	const num = (e: Event) => Math.max(0, Math.round(Number((e.currentTarget as HTMLInputElement).value) || 0));

	const MODE_HINT: Record<BarterMode, string> = {
		open: 'Brands can send any barter request. They are ranked after paid ones.',
		selective: 'Brands see your barter rules before sending. Requests below your minimum product value are turned away with a polite note asking for a fee.',
		closed: 'Brands can only send paid, or paid + product, requests.'
	};

	function setMode(m: BarterMode) {
		saveSettings({ barter_mode: m });
		toast(m === 'closed' ? 'Paid collaborations only' : m === 'open' ? 'Open to all barter requests' : 'Barter rules on');
	}
	function toggleCat(cat: string) {
		const cur = s.priority_categories ?? [];
		saveSettings({ priority_categories: cur.includes(cat) ? cur.filter((x) => x !== cat) : [...cur, cat] });
	}
</script>

<section class="panel rv" style="--i:3">
	<div class="panel-h"><h2>Priority rules</h2><small>paid first, barter second</small></div>
	<div class="rules-b">
		<ol class="rules-order">
			<li><b>Paid</b><span>first</span></li>
			<li><b>Paid + product</b><span>next</span></li>
			<li><b>Barter</b><span>last</span></li>
		</ol>
		<p class="hint">Within each, offers closer to your rate card, brands that paid you before, categories you prefer and requests waiting longer rise to the top. Brands with overdue payments drop.</p>

		<div class="f">
			<span class="lbl-t">Barter requests</span>
			<Segmented
				label="Barter requests"
				value={s.barter_mode}
				onchange={setMode}
				options={[
					{ value: 'open', label: 'Open' },
					{ value: 'selective', label: 'Selective' },
					{ value: 'closed', label: 'Paid only' }
				]}
			/>
			<p class="hint" style="margin-top:8px">{MODE_HINT[s.barter_mode]}</p>
		</div>

		{#if s.barter_mode !== 'closed'}
			<div class="fields">
				<div class="f">
					<label for="pr-min">Minimum product value</label>
					<div class="pre"><span>₹</span><input class="inp num" id="pr-min" type="number" inputmode="numeric" min="0" placeholder="No minimum" value={s.barter_min_value || ''} onchange={(e) => saveSettings({ barter_min_value: num(e) })} /></div>
				</div>
				<div class="f">
					<label for="pr-cap">Barter collabs per month</label>
					<Select
						id="pr-cap"
						value={s.barter_monthly_cap}
						options={[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: n, label: n ? `Up to ${n}` : 'No limit', hint: n ? `${Math.min(used, n)} used this month` : undefined }))}
						onchange={(v) => saveSettings({ barter_monthly_cap: v })}
					/>
				</div>
				<div class="f span2">
					<label for="pr-reply">Reply time you promise for barter</label>
					<input class="inp" id="pr-reply" value={s.barter_reply_time} placeholder="5 days" onchange={(e) => saveSettings({ barter_reply_time: (e.currentTarget as HTMLInputElement).value.trim() || '5 days' })} />
					<p class="hint" style="margin-top:6px">Paid requests use your usual reply time ({s.reply_time}).{s.barter_min_value ? ` Barter below ${inr(s.barter_min_value)} ${s.barter_mode === 'selective' ? 'is turned away' : 'drops in priority'}.` : ''}</p>
				</div>
			</div>
		{/if}

		<div class="f">
			<span class="lbl-t">Categories you prefer <span class="hint">(rank higher)</span></span>
			<div class="cat-chips">
				{#each CATS as cat (cat)}
					<button type="button" class="cat-chip" class:on={s.priority_categories?.includes(cat)} aria-pressed={s.priority_categories?.includes(cat)} onclick={() => toggleCat(cat)}>{cat}</button>
				{/each}
			</div>
		</div>
	</div>
</section>
