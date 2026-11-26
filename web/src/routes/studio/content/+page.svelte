<script lang="ts">
	import { studio, updateCollab } from '#lib/studio.svelte.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { findNearbyPairs, type NearbyPair, type TravelMode } from '#lib/travel.ts';
	import { contentState, hoursLeft, suggestShoot, weekOf } from '#lib/content.ts';
	import { ui } from '#lib/ui.svelte.ts';
	import { diff, fmt, fmtLong, latestDraft, relWord, todayIso } from '#lib/util.ts';
	import ContentRow from '#lib/components/ContentRow.svelte';
	import PostCard from '#lib/components/PostCard.svelte';
	import { page } from '$app/state';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
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

	const nearbyPairs = $derived(findNearbyPairs([...toMake, ...waitingProduct], (s.travel_mode as TravelMode) || 'cab'));
	async function batchPair(pair: NearbyPair) {
		const targetDate = pair.a.shoot_date || pair.b.shoot_date || suggestShoot(pair.a);
		await Promise.all([
			updateCollab(pair.a.id, { shoot_date: targetDate }),
			updateCollab(pair.b.id, { shoot_date: targetDate })
		]);
		toast(`Batched ${pair.a.brand.name} & ${pair.b.brand.name} on ${fmt(targetDate)}`, 'check');
	}
	const unplanned = $derived(toMake.filter((c) => !c.shoot_date).sort((a, b) => suggestShoot(a).localeCompare(suggestShoot(b))));
	const days = $derived.by(() => {
		const m = new Map<string, typeof toMake>();
		for (const c of [...toMake, ...waitingProduct].filter((c) => c.shoot_date)) m.set(c.shoot_date!, [...(m.get(c.shoot_date!) ?? []), c]);
		return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([date, cs]) => ({ date, cs, hours: cs.reduce((a, c) => a + hoursLeft(c, s), 0) }));
	});

	const weeks = $derived.by(() => {
		const start = weekOf(todayIso());
		return [0, 1, 2, 3].map((i) => {
			const d = new Date(start + 'T00:00:00');
			d.setDate(d.getDate() + i * 7);
			const w = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			const cs = [...toMake, ...waitingProduct].filter((c) => weekOf(c.shoot_date ?? suggestShoot(c)) === w || (i === 0 && (c.shoot_date ?? suggestShoot(c)) < w));
			const hours = cs.reduce((a, c) => a + hoursLeft(c, s), 0);
			const n = cs.reduce((a, c) => a + c.deliverables.filter((d) => !d.done).reduce((k, d) => k + d.qty, 0), 0);
			return { w, hours, n, label: i === 0 ? 'This week' : i === 1 ? 'Next week' : `In ${i} wks`, from: fmt(w) };
		});
	});
	const cap = $derived(s.weekly_hours || 25);
	const pieces = $derived([...toMake, ...waitingProduct].reduce((a, c) => a + c.deliverables.filter((d) => !d.done).reduce((n, d) => n + d.qty, 0), 0));
	const wk = $derived(weeks[0]);
	const wkPct = $derived(cap ? Math.min(1, wk.hours / cap) : 0);

	const KIND_COL: Record<string, string> = { Reel: 'var(--g2)', Story: 'var(--g3)', Carousel: 'var(--g1)', 'Static post': 'var(--h-request)', 'UGC video': 'var(--h-live)', Shoot: 'var(--h-nego)' };
	const mix = $derived.by(() => {
		const m = new Map<string, number>();
		for (const c of [...toMake, ...waitingProduct]) for (const d of c.deliverables) if (!d.done) m.set(d.kind, (m.get(d.kind) ?? 0) + d.qty);
		return [...m].sort((a, b) => b[1] - a[1]).map(([label, value]): Slice => ({ label, value, color: KIND_COL[label] ?? 'var(--m5)' }));
	});
	const dayLabel = (iso: string) => (diff(iso) === 0 ? 'Today' : diff(iso) === 1 ? 'Tomorrow' : diff(iso) < 0 ? `${fmtLong(iso)} · missed` : fmtLong(iso));

	let tab = $state<'all' | 'shoots' | 'post' | 'waiting'>('all');
	const showShoots = $derived(tab === 'all' || tab === 'shoots');
	const showPost = $derived(tab === 'all' || tab === 'post');
	const showWaiting = $derived(tab === 'all' || tab === 'waiting');
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
	<section class="ct2-hero rv" aria-label="This week">
		<div class="ct2-htop">
			<span class="ct2-eb">This week's shoot load</span>
			<span class="ct2-cap-pill" class:over={wk.hours > cap}>
				{wk.hours > cap ? `+${wk.hours - cap}h over ${cap}h cap` : `${cap - wk.hours}h free / ${cap}h`}
			</span>
		</div>

		<div class="ct2-hmain">
			<div>
				<b class="ct2-hnum num">{wk.n} <em>{wk.n === 1 ? 'piece' : 'pieces'}</em></b>
				<div class="ct2-hsub">{wk.n ? `About ${wk.hours} h of shooting & editing` : 'Nothing to make this week'}</div>
			</div>
			<div class="goal" class:over={wk.hours > cap} style="--p:{wkPct}">
				<svg viewBox="0 0 120 120" aria-hidden="true">
					<defs>
						<linearGradient id="weekGradM" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" style="stop-color:var(--g3)" />
							<stop offset=".5" style="stop-color:var(--g2)" />
							<stop offset="1" style="stop-color:var(--g1)" />
						</linearGradient>
					</defs>
					<circle class="g-track" cx="60" cy="60" r="50" />
					<circle class="g-prog" cx="60" cy="60" r="50" pathLength="100" style="stroke:url(#weekGradM)" />
				</svg>
				<div class="g-txt">
					{#if wk.hours > cap}<b>+{wk.hours - cap}h</b><small>over</small>{:else}<b>{cap - wk.hours}h</b><small>free</small>{/if}
				</div>
			</div>
		</div>

		<div class="ct2-kpi4">
			<button type="button" onclick={() => (tab = 'shoots')}>
				<small>To plan</small>
				<b class="num">{unplanned.length}</b>
			</button>
			<button type="button" class="ok" onclick={() => (tab = 'post')}>
				<small>To post</small>
				<b class="num">{toPost.length}</b>
			</button>
			<button type="button" class="warn" onclick={() => (tab = 'waiting')}>
				<small>With brand</small>
				<b class="num">{withBrand.length}</b>
			</button>
			<button type="button" class="vio" onclick={() => (tab = 'waiting')}>
				<small>Products</small>
				<b class="num">{waitingProduct.length}</b>
			</button>
		</div>

		<div class="ct2-wk3">
			{#each weeks.slice(1) as w (w.w)}
				<div class:over={w.hours > cap}>
					<small title="From {w.from}">{w.label}</small>
					<b>{w.hours ? `${w.hours}h · ${w.n}p` : 'Free'}</b>
					<span class="ct2-wbar"><i style="width:{Math.min(100, Math.round((w.hours / (cap || 1)) * 100))}%"></i></span>
				</div>
			{/each}
		</div>

		<a class="ct2-cta" href="/studio/calendar">
			<Icon name="cal" />
			<span>Open shoot calendar</span>
			<Icon name="arrow" />
		</a>
	</section>

	<!-- Sharp NeoPOP segmented tabs matching Insights / Today / Money -->
	<div class="ct2-tabs" role="tablist" aria-label="Content sections">
		<button type="button" role="tab" aria-selected={tab === 'all'} class:on={tab === 'all'} onclick={() => (tab = 'all')}>All</button>
		<button type="button" role="tab" aria-selected={tab === 'shoots'} class:on={tab === 'shoots'} onclick={() => (tab = 'shoots')}>Shoots</button>
		<button type="button" role="tab" aria-selected={tab === 'post'} class:on={tab === 'post'} onclick={() => (tab = 'post')}>To post</button>
		<button type="button" role="tab" aria-selected={tab === 'waiting'} class:on={tab === 'waiting'} onclick={() => (tab = 'waiting')}>Waiting</button>
	</div>

	<div class="ct2-grid">
		{#if showShoots}
			<div class="ct2-sec" id="m-shoots">
			{#if nearbyPairs.length}
				{#each nearbyPairs as pair (pair.a.id + pair.b.id)}
					<section class="ct2-batch">
						<div class="ct2-bh">
							<span class="ct2-beb"><Icon name="pin" />Nearby shoots · {pair.gapKm} km apart</span>
							<span class="ct2-bsave">Save ~₹{pair.savedCost} · {pair.savedMins}m</span>
						</div>
						<b>{pair.a.brand.name} + {pair.b.brand.name}</b>
						<small>Shoot both on the same day to cut a second round trip across the city.</small>
						<button type="button" class="ct2-bcta" onclick={() => batchPair(pair)}>
							<Icon name="cal" /><span>Batch on {fmt(pair.a.shoot_date || pair.b.shoot_date || suggestShoot(pair.a))}</span>
						</button>
					</section>
				{/each}
			{/if}

				{#each days.filter((d) => diff(d.date) <= 0) as d (d.date)}
					<div class="ct2-dayh" class:late={diff(d.date) < 0} class:today={diff(d.date) === 0}>
						<Icon name="cal" />
						<b>{dayLabel(d.date)}</b>
						<small>{d.cs.length} collab{d.cs.length > 1 ? 's' : ''} · ~{d.hours} h</small>
					</div>
					{#each d.cs as c (c.id)}<ContentRow {c} plan />{/each}
				{/each}

				{#if unplanned.length}
					<div class="ct2-dayh">
						<Icon name="spark" />
						<b>Plan a shoot day</b>
						<small>{unplanned.length} not planned yet</small>
					</div>
					{#each unplanned as c (c.id)}<ContentRow {c} plan />{/each}
				{/if}

				{#each days.filter((d) => diff(d.date) > 0) as d (d.date)}
					<div class="ct2-dayh">
						<Icon name="cal" />
						<b>{dayLabel(d.date)}</b>
						<small>{d.cs.length} collab{d.cs.length > 1 ? 's' : ''} · ~{d.hours} h</small>
					</div>
					{#each d.cs as c (c.id)}<ContentRow {c} plan />{/each}
				{/each}

				{#if !unplanned.length && !days.length}
					<div class="ct2-empty">
						<span class="ct2-empty-ic"><Icon name="film" /></span>
						<div>
							<b>No shoots to plan</b>
							<small>Confirmed collabs appear here with a suggested shoot day and a shot list from the brief.</small>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		{#if showPost}
			<section class="ct2-sec" id="m-post">
				<div class="ct2-sh">
					<h2>Ready to post</h2>
					<small>approved by the brand</small>
				</div>
				{#each toPost as c (c.id)}
					<PostCard {c} focus={page.url.searchParams.get('post') === c.code} />
				{:else}
					<div class="ct2-empty">
						<span class="ct2-empty-ic"><Icon name="send" /></span>
						<div>
							<b>Nothing to post yet</b>
							<small>Approved drafts land here, with the caption ready to copy.</small>
						</div>
					</div>
				{/each}
			</section>
		{/if}

		{#if showWaiting}
			<section class="ct2-sec" id="m-brand">
				<div class="ct2-sh">
					<h2>With the brand</h2>
					<small>drafts waiting for review</small>
				</div>
				{#each withBrand as c (c.id)}
					{@const dr = latestDraft(c)}
					<button type="button" class="ct2-mini" onclick={() => (ui.openCollab = c.id)}>
						<Mono name={c.brand.name} size="sm" />
						<span>
							<b>{c.brand.name}</b>
							<small>Draft {dr?.round} sent {relWord(diff(dr?.submitted_at.slice(0, 10) ?? todayIso()))}</small>
						</span>
						<Icon name="chevR" />
					</button>
				{:else}
					<div class="ct2-empty">
						<span class="ct2-empty-ic v"><Icon name="clock" /></span>
						<div>
							<b>Nothing waiting on brands</b>
							<small>Drafts you send for approval wait here until the brand replies.</small>
						</div>
					</div>
				{/each}
			</section>

			{#if waitingProduct.length}
				<section class="ct2-sec" id="m-prod">
					<div class="ct2-sh">
						<h2>Waiting for products</h2>
						<small>barter shipments</small>
					</div>
					{#each waitingProduct as c (c.id)}
						<button type="button" class="ct2-mini" onclick={() => (ui.openCollab = c.id)}>
							<Mono name={c.brand.name} size="sm" />
							<span>
								<b>{c.brand.name}</b>
								<small>{c.shipped_at ? `On the way · ${c.ship_carrier}` : c.product_date ? `Expected ${fmt(c.product_date)}` : 'Not shipped yet'}</small>
							</span>
							<Icon name="box" />
						</button>
					{/each}
				</section>
			{/if}
		{/if}
	</div>
{:else}
	<!-- Laptop: matching editorial studio board -->
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
				<div class="ct2-dayh" class:late={diff(d.date) < 0} class:today={diff(d.date) === 0}><Icon name="cal" /><b>{dayLabel(d.date)}</b><small>{d.cs.length} collab{d.cs.length > 1 ? 's' : ''} · about {d.hours} h</small></div>
				{#each d.cs as c (c.id)}<ContentRow {c} plan />{/each}
			{/each}
			{#if unplanned.length}
				<div class="ct2-dayh"><Icon name="spark" /><b>Not planned yet</b><small>each has a suggested day</small></div>
				{#each unplanned as c (c.id)}<ContentRow {c} plan />{/each}
			{/if}
			{#each days.filter((d) => diff(d.date) > 0) as d (d.date)}
				<div class="ct2-dayh"><Icon name="cal" /><b>{dayLabel(d.date)}</b><small>{d.cs.length} collab{d.cs.length > 1 ? 's' : ''} · about {d.hours} h</small></div>
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
					<button class="ct2-mini" onclick={() => (ui.openCollab = c.id)}>
						<Mono name={c.brand.name} size="sm" />
						<span><b>{c.brand.name}</b><small>Draft {dr?.round} sent {relWord(diff(dr?.submitted_at.slice(0, 10) ?? todayIso()))}</small></span>
						<Icon name="chevR" />
					</button>
				{:else}<p class="md-note">Nothing waiting on brands.</p>{/each}
			</section>
			<section class="md-card md-list rv" id="ct-product" style="--i:6">
				<header class="md-h"><div><span class="bx-eb">Barter</span><h2>Waiting for products</h2></div></header>
				{#each waitingProduct as c (c.id)}
					<button class="ct2-mini" onclick={() => (ui.openCollab = c.id)}>
						<Mono name={c.brand.name} size="sm" />
						<span><b>{c.brand.name}</b><small>{c.shipped_at ? `On the way · ${c.ship_carrier}` : c.product_date ? `Expected ${fmt(c.product_date)}` : 'Not shipped yet'}</small></span>
						<Icon name="box" />
					</button>
				{:else}<p class="md-note">Every product is in.</p>{/each}
			</section>
		</div>
	</div>
{/if}

<!-- What to make next. (How her posts are doing, the Instagram panel, lives on Grow.) -->
<ContentTips />

<style>
	.ct-unit { font-size: .45em; font-weight: 500; letter-spacing: 0; color: color-mix(in oklab, var(--hero-ink) 70%, transparent); }
	.ct-cap { display: flex; align-items: center; gap: 12px; max-width: 520px; margin-top: 6px; }
	.ct-cap > span { flex: 1; height: 8px; border-radius: 99px; background: color-mix(in oklab, var(--hero-ink) 12%, transparent); overflow: hidden; }
	.ct-cap i { display: block; height: 100%; border-radius: 99px; background: var(--grad); box-shadow: 0 0 18px color-mix(in oklab, var(--g2) 70%, transparent); }
	.ct-cap small { font-size: 13.5px; color: color-mix(in oklab, var(--hero-ink) 72%, transparent); white-space: nowrap; }
	.ct-dash { align-items: start; }
	.ct-stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
	.md-list :global(.post-card) { margin-left: -24px; margin-right: -24px; padding-left: 24px; padding-right: 24px; }

	/* Mobile Hero Card */
	.ct2-hero {
		border-radius: 20px;
		border: 1px solid var(--line-strong);
		background:
			radial-gradient(220px 140px at 90% 0%, color-mix(in oklab, var(--g2) 20%, transparent), transparent 72%),
			radial-gradient(190px 130px at 10% 0%, color-mix(in oklab, var(--g1) 16%, transparent), transparent 70%),
			linear-gradient(180deg, #1e1721 0%, #151018 100%);
		padding: 16px;
		margin-bottom: 14px;
		display: grid;
		gap: 12px;
	}
	.ct2-htop {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.ct2-eb {
		font: 700 11px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ct2-cap-pill {
		padding: 4px 10px;
		border-radius: 99px;
		font: 700 11.5px/1.2 var(--f-mono, ui-monospace, monospace);
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 13%, transparent);
		border: 1px solid color-mix(in oklab, var(--ok) 34%, transparent);
	}
	.ct2-cap-pill.over {
		color: var(--bad);
		background: color-mix(in oklab, var(--bad) 13%, transparent);
		border-color: color-mix(in oklab, var(--bad) 36%, transparent);
	}
	.ct2-hmain {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.ct2-hnum {
		display: block;
		font: 400 42px/1 var(--f-serif, Georgia, serif);
		letter-spacing: -1.4px;
		color: var(--ink);
	}
	.ct2-hnum em {
		font: italic 400 0.54em var(--f-serif, Georgia, serif);
		color: var(--g3);
	}
	.ct2-hsub {
		font-size: 14px;
		color: var(--ink-2);
		margin-top: 4px;
	}
	.ct2-kpi4 {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 7px;
	}
	.ct2-kpi4 button {
		border: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.03);
		border-radius: 12px;
		padding: 9px 6px;
		display: grid;
		gap: 2px;
		text-align: left;
		cursor: pointer;
	}
	.ct2-kpi4 small {
		font-size: 11px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.ct2-kpi4 b {
		font: 400 20px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.ct2-kpi4 button.ok b { color: var(--ok); }
	.ct2-kpi4 button.warn b { color: var(--g3); }
	.ct2-kpi4 button.vio b { color: var(--g1); }

	.ct2-wk3 {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 7px;
	}
	.ct2-wk3 div {
		padding: 8px 9px;
		border-radius: 12px;
		background: rgba(17, 13, 17, 0.55);
		border: 1px solid var(--line);
		display: grid;
		gap: 4px;
	}
	.ct2-wk3 small {
		font-size: 11px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.ct2-wk3 b {
		font-size: 13px;
		color: var(--ink);
	}
	.ct2-wk3 div.over b {
		color: var(--bad);
	}
	.ct2-wbar {
		height: 4px;
		border-radius: 999px;
		background: var(--surface-2);
		overflow: hidden;
		display: block;
	}
	.ct2-wbar i {
		display: block;
		height: 100%;
		border-radius: 999px;
		background: var(--grad);
	}

	.ct2-cta {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 0 15px;
		border-radius: 0;
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--bg);
		font: 700 14.5px/1 var(--f-body, inherit);
		text-decoration: none;
		box-shadow: 3.5px 3.5px 0 var(--g2);
	}
	.ct2-cta span {
		flex: 1;
	}
	.ct2-cta :global(.ic) {
		width: 16px;
		height: 16px;
	}

	/* Sharp NeoPOP Segmented Tabs */
	.ct2-tabs {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		border: 1px solid var(--line-strong);
		background: var(--surface);
		margin-bottom: 14px;
	}
	.ct2-tabs button {
		min-height: 40px;
		padding: 8px 4px;
		border: 0;
		border-right: 1px solid var(--line);
		background: transparent;
		color: var(--ink-2);
		font: 700 11px/1 var(--f-body, inherit);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.ct2-tabs button:last-child {
		border-right: 0;
	}
	.ct2-tabs button.on {
		background: var(--ink);
		color: var(--bg);
		box-shadow: inset 0 -3px 0 var(--g2);
	}

	.ct2-grid {
		display: grid;
		gap: 16px;
	}
	.ct2-sec {
		display: grid;
		gap: 4px;
	}
	.ct2-dayh {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 8px 2px 6px;
		font-size: 14px;
		color: var(--ink-2);
	}
	.ct2-dayh :global(.ic) {
		width: 15px;
		height: 15px;
		align-self: center;
		color: var(--g2);
	}
	.ct2-dayh b {
		font: 400 20px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.ct2-dayh small {
		margin-left: auto;
		font: 600 11.5px/1 var(--f-mono, ui-monospace, monospace);
		color: var(--ink-3);
	}
	.ct2-dayh.today b { color: var(--g2); }
	.ct2-dayh.late b, .ct2-dayh.late :global(.ic) { color: var(--bad); }

	.ct2-sh {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 0 2px 6px;
	}
	.ct2-sh h2 {
		margin: 0;
		font: 400 22px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.ct2-sh small {
		font-size: 13px;
		color: var(--ink-3);
	}

	.ct2-mini {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 13px 14px;
		margin-bottom: 8px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--line);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.ct2-mini :global(.mono) {
		flex: none;
	}
	.ct2-mini > span {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 2px;
	}
	.ct2-mini b {
		font-size: 15.5px;
		color: var(--ink);
	}
	.ct2-mini small {
		font-size: 13.5px;
		color: var(--ink-3);
	}
	.ct2-mini > :global(.ic) {
		width: 16px;
		height: 16px;
		color: var(--ink-3);
		flex: none;
	}

	.ct2-empty {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 15px 16px;
		border-radius: 16px;
		background: var(--surface);
		border: 1px solid var(--line);
	}
	.ct2-empty-ic {
		width: 40px;
		height: 40px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		flex: none;
		background: color-mix(in oklab, var(--g2) 12%, var(--surface-2));
		color: var(--g2);
	}
	.ct2-empty-ic.v {
		background: color-mix(in oklab, var(--g1) 12%, var(--surface-2));
		color: var(--g1);
	}
	.ct2-empty b {
		display: block;
		font-size: 15px;
		color: var(--ink);
	}
	.ct2-empty small {
		display: block;
		font-size: 13.5px;
		color: var(--ink-3);
		line-height: 1.4;
		margin-top: 2px;
	}

	.ct2-batch {
		display: grid;
		gap: 8px;
		padding: 14px 15px;
		margin-bottom: 12px;
		border-radius: 18px;
		border: 1px solid rgba(52, 211, 153, 0.36);
		background:
			radial-gradient(120% 80% at 0% 0%, rgba(16, 185, 129, 0.16), transparent 60%),
			linear-gradient(165deg, #101f1b 0%, #151118 70%);
	}
	.ct2-bh { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; }
	.ct2-beb { display: inline-flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 10.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #6ee7b7; }
	.ct2-beb :global(.ic) { width: 13px; height: 13px; }
	.ct2-bsave { font-family: var(--mono); font-size: 11px; font-weight: 700; color: #a7f3d0; padding: 2px 8px; border-radius: 999px; background: rgba(16, 185, 129, 0.16); }
	.ct2-batch b { font: 400 21px/1.1 var(--f-serif, Georgia, serif); color: var(--ink); }
	.ct2-batch small { font-size: 13px; color: var(--ink-2); }
	.ct2-bcta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		height: 38px;
		padding: 0 14px;
		width: fit-content;
		border: 0;
		border-radius: 0;
		background: linear-gradient(110deg, #10b981, #34d399);
		color: #062118;
		font: 700 13px/1 var(--f-sans, inherit);
		box-shadow: 3px 3px 0 #065f46;
		cursor: pointer;
	}
	.ct2-bcta :global(.ic) { width: 14px; height: 14px; }
</style>
