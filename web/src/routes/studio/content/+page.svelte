<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';
	import { contentState, hoursLeft, suggestShoot, weekOf } from '#lib/content.ts';
	import { ui } from '#lib/ui.svelte.ts';
	import { diff, fmt, fmtLong, latestDraft, relWord, todayIso } from '#lib/util.ts';
	import ContentRow from '#lib/components/ContentRow.svelte';
	import PostCard from '#lib/components/PostCard.svelte';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import InstagramPanel from '#lib/components/InstagramPanel.svelte';
	import ContentTips from '#lib/components/ContentTips.svelte';

	// Her making week, without any of the business: what to shoot when, what's with the brand, what to post.
	const s = $derived(studio.settings!);
	const active = $derived(studio.collabs.map((c) => ({ c, st: contentState(c) })).filter((x) => x.st));
	const toMake = $derived(active.filter((x) => x.st === 'to_make').map((x) => x.c));
	const waitingProduct = $derived(active.filter((x) => x.st === 'waiting_product').map((x) => x.c));
	const withBrand = $derived(active.filter((x) => x.st === 'with_brand').map((x) => x.c));
	const toPost = $derived(active.filter((x) => x.st === 'to_post').map((x) => x.c).sort((a, b) => (a.live_date ?? '9').localeCompare(b.live_date ?? '9')));

	const unplanned = $derived(toMake.filter((c) => !c.shoot_date).sort((a, b) => suggestShoot(a).localeCompare(suggestShoot(b))));
	// Shoot days, earliest first (a missed day stays at the top until it's done).
	const days = $derived.by(() => {
		const m = new Map<string, typeof toMake>();
		for (const c of [...toMake, ...waitingProduct].filter((c) => c.shoot_date)) m.set(c.shoot_date!, [...(m.get(c.shoot_date!) ?? []), c]);
		return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([date, cs]) => ({ date, cs, hours: cs.reduce((a, c) => a + hoursLeft(c, s), 0) }));
	});

	// Hours planned per week for the next 4 weeks, against what she wants to work.
	const weeks = $derived.by(() => {
		const start = weekOf(todayIso());
		return [0, 1, 2, 3].map((i) => {
			const d = new Date(start + 'T00:00:00');
			d.setDate(d.getDate() + i * 7);
			const w = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			const hours = [...toMake, ...waitingProduct]
				.filter((c) => weekOf(c.shoot_date ?? suggestShoot(c)) === w || (i === 0 && (c.shoot_date ?? suggestShoot(c)) < w))
				.reduce((a, c) => a + hoursLeft(c, s), 0);
			return { w, hours, label: i === 0 ? 'This week' : i === 1 ? 'Next week' : fmt(w) };
		});
	});
	const cap = $derived(s.weekly_hours || 25);
	const pieces = $derived([...toMake, ...waitingProduct].reduce((a, c) => a + c.deliverables.filter((d) => !d.done).reduce((n, d) => n + d.qty, 0), 0));
	const dayLabel = (iso: string) => (diff(iso) === 0 ? 'Today' : diff(iso) === 1 ? 'Tomorrow' : diff(iso) < 0 ? `${fmtLong(iso)} · missed` : fmtLong(iso));
</script>

<svelte:head><title>Content · {s.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Make</div>
		<h1>Your <em>content</em></h1>
		<p>{pieces ? `${pieces} piece${pieces > 1 ? 's' : ''} to make, about ${weeks[0].hours} h of it this week.` : 'Nothing to make right now. Enjoy it.'}</p>
	</div>
</header>

<section class="ct-weeks rv" style="--i:1" aria-label="Hours planned per week">
	{#each weeks as w (w.w)}
		<div class="ct-week" class:over={w.hours > cap}>
			<small>{w.label}</small>
			<b>{w.hours}<span> / {cap} h</span></b>
			<div class="ct-bar"><i style="width:{Math.min(100, (w.hours / cap) * 100)}%"></i></div>
			{#if w.hours > cap}<small class="warn-text">Over your {cap} h. Move a shoot or a go-live.</small>{/if}
		</div>
	{/each}
</section>

<div class="ct-grid">
	<div class="ct-col">
		{#each days.filter((d) => diff(d.date) <= 0) as d, i (d.date)}
			<section class="panel rv ct-day" class:late={diff(d.date) < 0} class:today={diff(d.date) === 0} style="--i:{3 + i}">
				<div class="panel-h"><h2><Icon name="cal" />{dayLabel(d.date)}</h2><small>{d.cs.length} collab{d.cs.length > 1 ? 's' : ''} · about {d.hours} h</small></div>
				{#each d.cs as c (c.id)}<ContentRow {c} plan />{/each}
			</section>
		{/each}
		{#if unplanned.length}
			<section class="panel rv" style="--i:2">
				<div class="panel-h"><h2>Plan a shoot day</h2><small>{unplanned.length} not planned yet</small></div>
				{#each unplanned as c (c.id)}<ContentRow {c} plan />{/each}
			</section>
		{/if}
		{#each days.filter((d) => diff(d.date) > 0) as d, i (d.date)}
			<section class="panel rv ct-day" class:late={diff(d.date) < 0} class:today={diff(d.date) === 0} style="--i:{3 + i}">
				<div class="panel-h"><h2><Icon name="cal" />{dayLabel(d.date)}</h2><small>{d.cs.length} collab{d.cs.length > 1 ? 's' : ''} · about {d.hours} h</small></div>
				{#each d.cs as c (c.id)}<ContentRow {c} plan />{/each}
			</section>
		{/each}
		{#if !unplanned.length && !days.length}
			<section class="panel rv" style="--i:2"><p class="hint" style="padding:20px;margin:0">No shoots to plan. Confirmed collabs show up here with a suggested shoot day and a shot list from the brief.</p></section>
		{/if}
	</div>

	<div class="ct-col">
		<section class="panel rv" style="--i:2">
			<div class="panel-h"><h2>Ready to post</h2><small>approved by the brand</small></div>
			{#each toPost as c (c.id)}
				<PostCard {c} focus={page.url.searchParams.get('post') === c.code} />
			{:else}<p class="hint ct-none">Approved drafts land here, with the caption ready to copy.</p>{/each}
		</section>
		<section class="panel rv" style="--i:3">
			<div class="panel-h"><h2>With the brand</h2><small>drafts waiting for review</small></div>
			{#each withBrand as c (c.id)}
				{@const dr = latestDraft(c)}
				<button class="ct-mini" onclick={() => (ui.openCollab = c.id)}>
					<Mono name={c.brand.name} size="sm" />
					<span><b>{c.brand.name}</b><small>Draft {dr?.round} sent {relWord(diff(dr?.submitted_at.slice(0, 10) ?? todayIso()))}</small></span>
					<Icon name="chevR" />
				</button>
			{:else}<p class="hint ct-none">Nothing waiting on brands.</p>{/each}
		</section>
		{#if waitingProduct.length}
			<section class="panel rv" style="--i:4">
				<div class="panel-h"><h2>Waiting for products</h2></div>
				{#each waitingProduct as c (c.id)}
					<button class="ct-mini" onclick={() => (ui.openCollab = c.id)}>
						<Mono name={c.brand.name} size="sm" />
						<span><b>{c.brand.name}</b><small>{c.shipped_at ? `On the way · ${c.ship_carrier}` : c.product_date ? `Expected ${fmt(c.product_date)}` : 'Not shipped yet'}</small></span>
						<Icon name="box" />
					</button>
				{/each}
			</section>
		{/if}
	</div>
</div>

<!-- How posts are doing, and what to make next. -->
<InstagramPanel />
<ContentTips />
