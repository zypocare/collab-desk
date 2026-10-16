<script lang="ts">
	import { onMount } from 'svelte';
	import { saveSettings, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';

	type Review = { id: string; rating: number; body: string; name: string; shown: boolean; created_at: string; collab: { code: string; brand: { name: string } } };
	const s = $derived(studio.settings!);
	let reviews = $state<Review[]>([]);

	async function load() {
		const { data } = await supabase.from('brand_reviews').select('*, collab:collabs(code, brand:brands(name))').order('created_at', { ascending: false });
		reviews = (data as Review[]) ?? [];
	}
	onMount(load);

	async function toggle(r: Review, shown: boolean) {
		r.shown = shown;
		const { error } = await supabase.from('brand_reviews').update({ shown }).eq('id', r.id);
		if (error) return toast(`Couldn't save: ${error.message}`, 'alert');
		toast(shown ? 'Review is on your page' : 'Review hidden', shown ? 'eye' : 'x');
	}
</script>

<section class="panel rv" style="--i:3">
	<div class="panel-h"><h2>Results & reviews</h2><small>proof brands see on your page</small></div>
	<div class="switch-row" style="border-top:0">
		<div><b>Show results from past collabs</b><small>Your best collab posts with real views and reach (from Instagram).</small></div>
		<input type="checkbox" class="tgl" checked={s.show_results} aria-label="Show results" onchange={(e) => saveSettings({ show_results: (e.currentTarget as HTMLInputElement).checked })} />
	</div>
	<div class="rv-list">
		{#each reviews as r (r.id)}
			<div class="rv-row">
				<div>
					<b><span class="rev-stars">{'★'.repeat(r.rating)}<i>{'★'.repeat(5 - r.rating)}</i></span> {r.collab?.brand?.name}</b>
					<small>{r.body || 'No comment'} · {r.name}</small>
				</div>
				<input type="checkbox" class="tgl sm" checked={r.shown} aria-label="Show this review on your page" onchange={(e) => toggle(r, (e.currentTarget as HTMLInputElement).checked)} />
			</div>
		{:else}
			<p class="hint" style="padding:0 20px 16px;margin:0">When a collab is wrapped, the brand gets an email asking for a quick review. 4 and 5 star reviews show on your page automatically; you can hide or show any of them here.</p>
		{/each}
	</div>
</section>
