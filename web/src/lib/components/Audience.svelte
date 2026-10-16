<script lang="ts">
	import { audienceOf } from '../insights';
	let { demo, i = 5 }: { demo: Partial<Record<'age' | 'gender' | 'city' | 'country', Record<string, number>>>; i?: number } = $props();
	const aud = $derived(audienceOf(demo));
	const age = $derived(aud.age);
	const gender = $derived(aud.gender);
	const cities = $derived(aud.cities);
	const countries = $derived(aud.countries);
	const maxAge = $derived(Math.max(1, ...age.map((a) => a.p)));
	const has = $derived(age.length || gender.length || cities.length);
</script>

{#if has}
	<section class="panel rv audience" style="--i:{i}">
		<div class="panel-h"><h2>Audience</h2><small>from Instagram</small></div>
		<div class="aud-grid">
			{#if age.length}
				<div>
					<span class="lbl">Age</span>
					<div class="age-bars" role="img" aria-label={age.map((a) => `${a.k}: ${a.p}%`).join(', ')}>
						{#each age as a, i (a.k)}
							<div class="age-col"><span class="age-v">{a.p}%</span><i style="height:{(a.p / maxAge) * 100}%;--i:{i}"></i><span class="age-k">{a.k}</span></div>
						{/each}
					</div>
				</div>
			{/if}
			{#if gender.length}
				<div>
					<span class="lbl">Gender</span>
					<div class="gender-bar" role="img" aria-label={gender.map((g) => `${g.k}: ${g.p}%`).join(', ')}>
						{#each gender as g, i (g.k)}<i style="flex:{g.p};--i:{i}" class="g{i}"></i>{/each}
					</div>
					<ul class="aud-list">{#each gender as g, i (g.k)}<li><span class="dt g{i}"></span>{g.k}<b>{g.p}%</b></li>{/each}</ul>
				</div>
			{/if}
			{#if cities.length}
				<div>
					<span class="lbl">Top cities</span>
					<ul class="aud-list">{#each cities as c (c.k)}<li>{c.k}<b>{c.p}%</b></li>{/each}</ul>
				</div>
			{/if}
			{#if countries.length}
				<div>
					<span class="lbl">Top countries</span>
					<ul class="aud-list">{#each countries as c (c.k)}<li>{c.k}<b>{c.p}%</b></li>{/each}</ul>
				</div>
			{/if}
		</div>
	</section>
{/if}
