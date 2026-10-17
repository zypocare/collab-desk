<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import type { Settings } from '../types';
	import Segmented from './Segmented.svelte';

	// What the "Should I take it?" report needs to know about her: where she starts from, how she
	// travels, and what a shoot look costs her.
	const s = $derived(studio.settings!);
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value.trim();
	const num = (e: Event) => Math.max(0, Math.round(Number((e.currentTarget as HTMLInputElement).value) || 0));
	const MODES: { value: Settings['travel_mode']; label: string }[] = [
		{ value: 'car', label: 'Own car' },
		{ value: 'bike', label: 'Scooter' },
		{ value: 'cab', label: 'Cab' },
		{ value: 'public', label: 'Metro / bus' }
	];
</script>

<section class="panel rv" style="--i:4">
	<div class="panel-h"><h2>Deciding on a collab</h2><small>for the "Should I take it?" report</small></div>
	<div class="form-b">
		<div class="f span2">
			<label for="dc-home">Home area</label>
			<input class="inp" id="dc-home" value={s.home_area} placeholder="e.g. HSR Layout, Bengaluru" onchange={(e) => saveSettings({ home_area: val(e), home_lat: null, home_lng: null })} />
			<p class="hint" style="margin-top:6px">Area and city is enough. Only used to work out travel time to store visits and events; brands never see it.</p>
		</div>
		<div class="f span2">
			<span class="lbl-t">How you usually travel</span>
			<Segmented label="How you travel" options={MODES} value={s.travel_mode} onchange={(v) => saveSettings({ travel_mode: v })} />
		</div>
		<div class="f"><label for="dc-max">Longest trip you're happy with (minutes, one way)</label><input class="inp num" id="dc-max" type="number" inputmode="numeric" min="10" max="600" value={s.travel_max_min} onchange={(e) => saveSettings({ travel_max_min: Math.min(600, Math.max(10, num(e))) })} /></div>
		<div class="f"><label for="dc-mu">Professional makeup & hair (₹)</label><input class="inp num" id="dc-mu" type="number" inputmode="numeric" value={s.makeup_cost || ''} placeholder="0 if you do your own" onchange={(e) => saveSettings({ makeup_cost: num(e) })} /></div>
		<div class="f"><label for="dc-out">A new outfit for a specific look (₹)</label><input class="inp num" id="dc-out" type="number" inputmode="numeric" value={s.outfit_cost || ''} placeholder="e.g. 2000" onchange={(e) => saveSettings({ outfit_cost: num(e) })} /></div>
		<div class="f span2"><label for="dc-avoid">Brands or products you won't promote</label><input class="inp" id="dc-avoid" value={s.avoid_brands} placeholder="e.g. alcohol, betting apps, fairness creams" onchange={(e) => saveSettings({ avoid_brands: val(e) })} /></div>
	</div>
</section>
