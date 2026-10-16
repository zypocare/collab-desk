<script lang="ts">
	let { demo, i = 5 }: { demo: Partial<Record<'age' | 'gender' | 'city' | 'country', Record<string, number>>>; i?: number } = $props();
	const countryName = (code: string) => {
		try {
			return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
		} catch {
			return code;
		}
	};

	const pct = (part: Record<string, number> | undefined) => {
		const entries = Object.entries(part ?? {});
		const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
		return entries.map(([k, v]) => ({ k, p: Math.round((v / total) * 100) }));
	};
	const age = $derived(pct(demo.age).sort((a, b) => a.k.localeCompare(b.k)));
	const gender = $derived(pct(demo.gender).map((g) => ({ ...g, k: g.k === 'F' ? 'Women' : g.k === 'M' ? 'Men' : 'Other' })).sort((a, b) => b.p - a.p));
	const cities = $derived(pct(demo.city).sort((a, b) => b.p - a.p).slice(0, 5).map((c) => ({ ...c, k: c.k.split(',')[0] })));
	const countries = $derived(pct(demo.country).sort((a, b) => b.p - a.p).slice(0, 5).map((c) => ({ ...c, k: countryName(c.k) })));
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
