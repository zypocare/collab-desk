<script lang="ts">
	import { saveSettings, studio } from '../studio.svelte';
	import Select from './Select.svelte';

	const s = $derived(studio.settings!);
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value.trim();
</script>

<section class="panel rv" style="--i:3">
	<div class="panel-h"><h2>Products & shipping</h2><small>private until a collab is confirmed</small></div>
	<div class="form-b">
		<div class="f"><label for="sh-name">Name on the parcel</label><input class="inp" id="sh-name" value={s.ship_name} placeholder={s.display_name} onchange={(e) => saveSettings({ ship_name: val(e) })} /></div>
		<div class="f"><label for="sh-phone">Phone for the courier</label><input class="inp" id="sh-phone" inputmode="tel" value={s.ship_phone} onchange={(e) => saveSettings({ ship_phone: val(e) })} /></div>
		<div class="f span2"><label for="sh-addr">Shipping address</label><textarea class="inp" id="sh-addr" rows="3" placeholder={'Flat, building, street\nArea, city, PIN code'} value={s.ship_address} onchange={(e) => saveSettings({ ship_address: val(e) })}></textarea></div>
		<div class="f span2">
			<label for="sh-days">Draft due after the product arrives</label>
			<Select id="sh-days" value={s.draft_days_after_product} options={[3, 5, 7, 10, 14, 21].map((d) => ({ value: d, label: `${d} days` }))} onchange={(v) => saveSettings({ draft_days_after_product: v })} />
			<p class="hint" style="margin-top:6px">Brands see your address only on their own confirmed barter or paid + product collabs, never on your public page.</p>
		</div>
	</div>
</section>
