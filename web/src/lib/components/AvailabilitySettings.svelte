<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import { iso, parse } from '../util';
	import Select from './Select.svelte';

	const s = $derived(studio.settings!);

	// Monday of this week, then the next 11.
	const monday = (d: Date) => {
		const x = new Date(d);
		x.setHours(0, 0, 0, 0);
		x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
		return x;
	};
	const weeks = $derived.by(() => {
		const start = monday(new Date());
		return Array.from({ length: 12 }, (_, i) => {
			const w = new Date(start);
			w.setDate(start.getDate() + i * 7);
			const ws = iso(w);
			const end = new Date(w);
			end.setDate(w.getDate() + 7);
			const n = studio.collabs.filter((c) => {
				const d = c.live_date ?? c.draft_date ?? c.preferred_live;
				return ['confirmed', 'creating', 'live'].includes(c.stage) && d && parse(d) >= w && parse(d) < end;
			}).length;
			const away = (s.away_weeks ?? []).includes(ws);
			const status = away ? 'away' : n >= s.weekly_capacity ? 'full' : s.weekly_capacity > 1 && n === s.weekly_capacity - 1 ? 'limited' : 'open';
			return { ws, label: w.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), n, away, status };
		});
	});

	function toggleAway(ws: string) {
		const cur = s.away_weeks ?? [];
		saveSettings({ away_weeks: cur.includes(ws) ? cur.filter((x) => x !== ws) : [...cur, ws].sort() });
	}
</script>

<section class="panel rv" style="--i:3">
	<div class="panel-h"><h2>Open weeks</h2><small>shown on your brand page</small></div>
	<div class="form-b">
		<div class="f span2">
			<label for="av-cap">Collabs you can take per week</label>
			<Select id="av-cap" value={s.weekly_capacity} options={[1, 2, 3, 4, 5, 6, 8, 10].map((n) => ({ value: n, label: `${n} per week` }))} onchange={(v) => saveSettings({ weekly_capacity: v })} />
		</div>
	</div>
	<div class="switch-row">
		<div><b>Show on my page</b><small>Brands see which weeks are open, limited, full or away.</small></div>
		<input type="checkbox" class="tgl" checked={s.show_availability} aria-label="Show open weeks on my page" onchange={(e) => saveSettings({ show_availability: (e.currentTarget as HTMLInputElement).checked })} />
	</div>
	<div class="wk-grid">
		{#each weeks as w (w.ws)}
			<button type="button" class="wk wk-{w.status}" aria-pressed={w.away} onclick={() => toggleAway(w.ws)} title={w.away ? 'Away: tap to open this week' : 'Tap to mark yourself away'}>
				<b>{w.label}</b>
				<small>{w.away ? 'Away' : `${w.n}/${s.weekly_capacity} booked`}</small>
			</button>
		{/each}
	</div>
	<p class="hint" style="padding:0 20px 18px;margin:0">Tap a week to mark yourself away. Brands see Open, Limited, Full or Away, never who booked.</p>
</section>
