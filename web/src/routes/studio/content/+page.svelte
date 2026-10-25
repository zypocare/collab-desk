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
	import { phone } from '#lib/phone.svelte.ts';
	import Columns from '#lib/components/charts/Columns.svelte';
	import Donut from '#lib/components/charts/Donut.svelte';
	import type { Slice } from '#lib/moneyDash.ts';

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
	// Phone: this week's hours as a ring (like Home's goal ring), the coming weeks as tiles.
	const wk = $derived(weeks[0]);
	const wkPct = $derived(cap ? Math.min(1, wk.hours / cap) : 0);
	// What she's making, by content type (pieces still to make).
	const KIND_COL: Record<string, string> = { Reel: 'var(--g2)', Story: 'var(--g3)', Carousel: 'var(--g1)', 'Static post': 'var(--h-request)', 'UGC video': 'var(--h-live)', Shoot: 'var(--h-nego)' };
	const mix = $derived.by(() => {
		const m = new Map<string, number>();
		for (const c of [...toMake, ...waitingProduct]) for (const d of c.deliverables) if (!d.done) m.set(d.kind, (m.get(d.kind) ?? 0) + d.qty);
		return [...m].sort((a, b) => b[1] - a[1]).map(([label, value]): Slice => ({ label, value, color: KIND_COL[label] ?? 'var(--m5)' }));
	});
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

{#if phone.on}
	<section class="hero-card glow m-hero m-pipe m-week" aria-label="This week">
		<div class="mesh" aria-hidden="true"></div>
		<div class="hc-in">
			<div class="hc-top">
				<span class="hc-eb">This week</span>
				<a class="glass-chip" href="/studio/calendar"><Icon name="cal" />Calendar</a>
			</div>
			<div class="hc-main">
				<div>
					<div class="hc-val">{wk.hours}<span class="hc-unit"> h</span></div>
					<div class="hc-sub">{pieces ? `${pieces} piece${pieces > 1 ? 's' : ''} to make` : 'Nothing to make right now'}{wk.hours > cap ? ` · ${wk.hours - cap} h over your ${cap} h` : ` · ${cap - wk.hours} h free`}</div>
				</div>
				<div class="goal" class:over={wk.hours > cap} style="--p:{wkPct}">
					<svg viewBox="0 0 120 120" aria-hidden="true"
						><defs
							><linearGradient id="weekGradM" x1="0" y1="0" x2="1" y2="1"
								><stop offset="0" style="stop-color:var(--g3)" /><stop offset=".5" style="stop-color:var(--g2)" /><stop offset="1" style="stop-color:var(--g1)" /></linearGradient
							></defs
						><circle class="g-track" cx="60" cy="60" r="50" /><circle class="g-prog" cx="60" cy="60" r="50" pathLength="100" style="stroke:url(#weekGradM)" /></svg
					>
					<div class="g-txt"><b>{Math.round((wk.hours / (cap || 1)) * 100)}%</b><small>of {cap} h</small></div>
				</div>
			</div>
			<div class="hc-foot">
				{#each weeks.slice(1) as w (w.w)}
					<div class:over={w.hours > cap}><small>{w.label}</small><b>{w.hours} h</b><span class="m-wbar"><i style="--p:{Math.min(1, w.hours / (cap || 1))}"></i></span></div>
				{/each}
			</div>
		</div>
	</section>
{:else}
	<!-- Laptop: the same dashboard language as Money. -->
	<section class="md-hero rv" aria-label="This week">
		<div class="mesh" aria-hidden="true"></div>
		<div class="md-main">
			<span class="bx-eb">To make this week</span>
			<b class="md-big num">{wk.hours}<span class="ct-unit"> h</span></b>
			<div class="md-sub">
				<span class="md-chip" class:down={wk.hours > cap}>{wk.hours > cap ? `${wk.hours - cap} h over your ${cap} h` : `${cap - wk.hours} h free of ${cap} h`}</span>
				<span>{pieces ? `${pieces} piece${pieces > 1 ? 's' : ''} to make` : 'Nothing to make right now'}</span>
			</div>
			<div class="ct-cap"><span><i style="width:{Math.round(wkPct * 100)}%"></i></span><small>{Math.round((wk.hours / (cap || 1)) * 100)}% of your week</small></div>
		</div>
		<div class="md-tiles">
			<a class="md-tile" href="#ct-shoot"><small>Shoots to plan</small><b class="num">{unplanned.length}</b><span>{days.length ? `${days.length} shoot day${days.length > 1 ? 's' : ''} planned` : 'no shoot days yet'}</span></a>
			<a class="md-tile" href="#ct-post"><small>Ready to post</small><b class="num">{toPost.length}</b><span>{toPost[0]?.live_date ? `next: ${toPost[0].brand.name} · ${fmt(toPost[0].live_date)}` : 'approved by brands'}</span></a>
			<a class="md-tile" href="#ct-brand"><small>With the brand</small><b class="num">{withBrand.length}</b><span>drafts waiting for review</span></a>
			<a class="md-tile" class:bad={waitingProduct.length > 0} href="#ct-product"><small>Waiting for products</small><b class="num">{waitingProduct.length}</b><span>{waitingProduct.length ? 'not here yet' : 'all products in'}</span></a>
		</div>
	</section>

	<div class="md-grid ct-dash">
		<section class="md-card rv" style="--i:1">
			<header class="md-h"><div><span class="bx-eb">Your time</span><h2>Next 4 weeks</h2></div><a href="/studio/calendar">Calendar<Icon name="arrow" /></a></header>
			<Columns items={weeks.map((w, i) => ({ label: w.label, values: [Math.min(w.hours, cap), Math.max(0, w.hours - cap)], now: i === 0 }))} names={['Planned', 'Over your week']} colors={['linear-gradient(180deg, var(--g2), var(--g1))', 'var(--bad)']} stacked fmt={(v) => `${Math.round(v)} h`} height={200} />
		</section>

		<section class="md-card rv" style="--i:2">
			<header class="md-h"><div><span class="bx-eb">What you're making</span><h2>By content type</h2></div></header>
			<Donut slices={mix} center={String(pieces)} sub={pieces === 1 ? 'piece' : 'pieces'} fmt={(v) => String(v)} />
		</section>

		<section class="md-card md-list md-wide rv" id="ct-shoot" style="--i:3">
			<header class="md-h"><div><span class="bx-eb">Shoot days</span><h2>Plan your shoots</h2></div>{#if unplanned.length}<b class="md-sum">{unplanned.length} to plan</b>{/if}</header>
			{#each days.filter((d) => diff(d.date) <= 0) as d (d.date)}
				<div class="ct-dayh" class:late={diff(d.date) < 0} class:today={diff(d.date) === 0}><Icon name="cal" /><b>{dayLabel(d.date)}</b><small>{d.cs.length} collab{d.cs.length > 1 ? 's' : ''} · about {d.hours} h</small></div>
				{#each d.cs as c (c.id)}<ContentRow {c} plan />{/each}
			{/each}
			{#if unplanned.length}
				<div class="ct-dayh"><Icon name="spark" /><b>Not planned yet</b><small>each has a suggested day</small></div>
				{#each unplanned as c (c.id)}<ContentRow {c} plan />{/each}
			{/if}
			{#each days.filter((d) => diff(d.date) > 0) as d (d.date)}
				<div class="ct-dayh"><Icon name="cal" /><b>{dayLabel(d.date)}</b><small>{d.cs.length} collab{d.cs.length > 1 ? 's' : ''} · about {d.hours} h</small></div>
				{#each d.cs as c (c.id)}<ContentRow {c} plan />{/each}
			{/each}
			{#if !unplanned.length && !days.length}<p class="md-note">No shoots to plan. Confirmed collabs show up here with a suggested shoot day and a shot list from the brief.</p>{/if}
		</section>

		<section class="md-card md-list rv" id="ct-post" style="--i:4">
			<header class="md-h"><div><span class="bx-eb">Approved</span><h2>Ready to post</h2></div>{#if toPost.length}<b class="md-sum">{toPost.length}</b>{/if}</header>
			{#each toPost as c (c.id)}
				<PostCard {c} focus={page.url.searchParams.get('post') === c.code} />
			{:else}<p class="md-note">Approved drafts land here, with the caption ready to copy.</p>{/each}
		</section>

		<div class="ct-stack">
			<section class="md-card md-list rv" id="ct-brand" style="--i:5">
				<header class="md-h"><div><span class="bx-eb">Drafts</span><h2>With the brand</h2></div></header>
				{#each withBrand as c (c.id)}
					{@const dr = latestDraft(c)}
					<button class="ct-mini" onclick={() => (ui.openCollab = c.id)}>
						<Mono name={c.brand.name} size="sm" />
						<span><b>{c.brand.name}</b><small>Draft {dr?.round} sent {relWord(diff(dr?.submitted_at.slice(0, 10) ?? todayIso()))}</small></span>
						<Icon name="chevR" />
					</button>
				{:else}<p class="md-note">Nothing waiting on brands.</p>{/each}
			</section>
			<section class="md-card md-list rv" id="ct-product" style="--i:6">
				<header class="md-h"><div><span class="bx-eb">Barter</span><h2>Waiting for products</h2></div></header>
				{#each waitingProduct as c (c.id)}
					<button class="ct-mini" onclick={() => (ui.openCollab = c.id)}>
						<Mono name={c.brand.name} size="sm" />
						<span><b>{c.brand.name}</b><small>{c.shipped_at ? `On the way · ${c.ship_carrier}` : c.product_date ? `Expected ${fmt(c.product_date)}` : 'Not shipped yet'}</small></span>
						<Icon name="box" />
					</button>
				{:else}<p class="md-note">Every product is in.</p>{/each}
			</section>
		</div>
	</div>
{/if}

{#if phone.on}
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
			{:else}<div class="ct-empty"><span class="ct-empty-ic" aria-hidden="true"><Icon name="send" /></span><span><b>Nothing to post yet</b><small>Approved drafts land here, with the caption ready to copy.</small></span></div>{/each}
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
			{:else}<div class="ct-empty"><span class="ct-empty-ic v" aria-hidden="true"><Icon name="clock" /></span><span><b>Nothing waiting on brands</b><small>Drafts you send for approval wait here until the brand replies.</small></span></div>{/each}
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

{/if}

<!-- How posts are doing, and what to make next. -->
<InstagramPanel />
<ContentTips />

<style>
	.ct-unit { font-size: .45em; font-weight: 500; letter-spacing: 0; color: color-mix(in oklab, var(--hero-ink) 70%, transparent); }
	.ct-cap { display: flex; align-items: center; gap: 12px; max-width: 520px; margin-top: 6px; }
	.ct-cap > span { flex: 1; height: 8px; border-radius: 99px; background: color-mix(in oklab, var(--hero-ink) 12%, transparent); overflow: hidden; }
	.ct-cap i { display: block; height: 100%; border-radius: 99px; background: var(--grad); box-shadow: 0 0 18px color-mix(in oklab, var(--g2) 70%, transparent); }
	.ct-cap small { font-size: 13.5px; color: color-mix(in oklab, var(--hero-ink) 72%, transparent); white-space: nowrap; }
	.ct-dash { align-items: start; }
	.ct-stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
	.ct-dayh { display: flex; align-items: center; gap: 8px; margin: 6px 0 -6px; font-size: 14px; color: var(--ink-2); }
	.ct-dayh :global(.ic) { width: 16px; height: 16px; color: var(--g2); }
	.ct-dayh b { font-size: 15px; color: var(--ink); }
	.ct-dayh small { color: var(--ink-3); font-size: 13px; }
	.ct-dayh.today b { color: var(--g2); }
	.ct-dayh.late b, .ct-dayh.late :global(.ic) { color: var(--bad); }
	.md-list :global(.ct-row), .md-list :global(.post-card) { margin-left: -24px; margin-right: -24px; padding-left: 24px; padding-right: 24px; }
	.md-list :global(.ct-mini) { width: calc(100% + 48px); margin-left: -24px; margin-right: -24px; padding-left: 24px; padding-right: 24px; }
</style>
