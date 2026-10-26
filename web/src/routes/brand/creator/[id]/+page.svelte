<script lang="ts">
	import { creatorChips } from '#lib/trust.svelte.ts';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { auth } from '#lib/auth.svelte.ts';
	import { discover, loadDiscover, rateCreator } from '#lib/brand.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { fit, NO_FILTERS, reelRate, similar } from '#lib/fit.ts';
	import { pageSlug, supabase } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage, firstName, fmt, hueOf, inrS } from '#lib/util.ts';
	import AddToPool from '#lib/components/AddToPool.svelte';
	import Avatar from '#lib/components/Avatar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import Columns from '#lib/components/charts/Columns.svelte';
	import Donut from '#lib/components/charts/Donut.svelte';
	import HBars from '#lib/components/charts/HBars.svelte';
	import Gauge from '#lib/components/charts/Gauge.svelte';
	import ReportMenu from '#lib/components/ReportMenu.svelte';
	import HealthCard from '#lib/components/HealthCard.svelte';
	import ProNote from '#lib/components/ProNote.svelte';
	import { healthChips } from '#lib/health.ts';
	import { goto } from '$app/navigation';

	// One creator, from the brand's side: how well they fit, who their audience is, what they did with
	// you, your team's private rating, and creators like them. Laid out with the app's dashboard cards.
	const id = $derived(Number(page.params.id));
	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const category = $derived(acct?.brand?.category || acct?.profile?.category || '');
	const company = $derived(acct?.brand?.name || acct?.profile?.name || 'your brand');
	onMount(() => {
		if (!discover.loaded) loadDiscover();
	});
	const c = $derived(discover.list.find((x) => x.id === id) ?? null);
	// A free brand team opens 10 full profiles a day (creators it has worked with never count).
	let gate = $state<{ id: number; ok: boolean; msg: string } | null>(null);
	$effect(() => {
		const want = id;
		if (!acct || !want) return;
		supabase.rpc('brand_profile_open', { p_creator: want }).then(({ data, error }) => {
			const r = error ? null : (data as { ok: boolean; msg?: string } | null);
			gate = { id: want, ok: r?.ok !== false, msg: r?.msg ?? '' };
		});
	});
	const opened = $derived(!acct || gate?.id === id);
	const locked = $derived(gate?.id === id && !gate.ok);
	const ft = $derived(c ? fit(c, NO_FILTERS, category) : null);
	const like = $derived(c ? similar(c, discover.list.filter((x) => x.listed)) : []);
	const at = (slug: string, path: string) => (slug === pageSlug ? path : addressFor(slug, path));
	const rate = $derived(c ? reelRate(c) : null);
	const ages = $derived(c?.audience ? Object.entries(c.audience.age).filter(([, v]) => v > 0) : []);
	const cpv = $derived(c && c.with_me.fees > 0 && c.with_me.views > 0 ? c.with_me.fees / c.with_me.views : null);

	// Your private rating: three sets of stars and a note for the team.
	let onTime = $state(0);
	let quality = $state(0);
	let results = $state(0);
	let note = $state('');
	let saving = $state(false);
	let seeded = 0;
	$effect(() => {
		if (!c || seeded === c.id) return;
		seeded = c.id;
		onTime = c.rating?.on_time ?? 0;
		quality = c.rating?.quality ?? 0;
		results = c.rating?.results ?? 0;
		note = c.rating?.note ?? '';
	});
	const canRate = $derived(!!c?.with_me.collabs);
	async function save() {
		if (!c) return;
		if (!onTime || !quality || !results) return toast('Pick stars for all three.', 'alert');
		saving = true;
		try {
			await rateCreator(c.id, onTime, quality, results, note);
			toast(`Rating saved. Only your team sees it.`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			saving = false;
		}
	}
	let explain = $state(false);
	const ROWS = [
		{ key: 'onTime', label: 'On time' },
		{ key: 'quality', label: 'Quality' },
		{ key: 'results', label: 'Results' }
	] as const;
	const get = (k: (typeof ROWS)[number]['key']) => (k === 'onTime' ? onTime : k === 'quality' ? quality : results);
	const set = (k: (typeof ROWS)[number]['key'], v: number) => (k === 'onTime' ? (onTime = v) : k === 'quality' ? (quality = v) : (results = v));
</script>

<svelte:head><title>{c?.name ?? 'Creator'} · Miracle</title></svelte:head>

{#if !discover.loaded}
	<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
{:else if !c}
	<div class="clear hero-card glow m-none">
		<div class="mesh" aria-hidden="true"></div>
		<span class="clear-ic"><Icon name="users" /></span>
		<b>Creator not found</b>
		<small>They may have stopped listing themselves for brands.</small>
		<div class="clear-acts"><a class="glass-chip" href="/brand/creators?tab=discover"><Icon name="search" />Discover</a></div>
	</div>
{:else}
	<a class="back rv" href="/brand/creators?tab=discover"><Icon name="back" />Discover</a>
	<header class="ph rv">
		<div style="display:flex;gap:16px;align-items:center">
			<Avatar name={c.name} src={c.photo} size="64px" />
			<div>
				<div class="eb">{[c.niche?.split(',')[0]?.trim(), c.city, c.handle ? `@${c.handle.replace(/^@+/, '')}` : ''].filter(Boolean).join(' · ')}</div>
				<h1>{c.name}</h1>
				<p>{c.followers != null ? `${compact(c.followers)} followers` : 'Instagram not linked'}{c.engagement != null ? ` · ${Number(c.engagement).toFixed(2)}% engagement` : ''}{rate ? ` · Reels from ${inrS(rate)}` : ''}</p>
				<div class="cp-trust">{#each [...healthChips(c.health), ...creatorChips(c.trust)] as ch (ch.text)}<span class="cp-chip {ch.tone}">{ch.text}</span>{/each}<button class="lnk hint" onclick={() => (explain = !explain)} aria-expanded={explain}>What these mean</button></div>
				{#if explain}
					<p class="hint cp-explain"><b>Verified deals:</b> collabs done through Miracle and paid in full against a Miracle invoice. <b>On time:</b> the post went live on or before the agreed date, by Instagram's own time. <b>Replies in:</b> how fast they usually answer a new request. Worked out by Miracle; creators can't edit them.</p>
				{/if}
			</div>
		</div>
		<div class="acts">
			<AddToPool creator={c.id} name={c.name} />
			<a class="btn" href={at(c.slug, '/')} target="_blank" rel="noopener"><Icon name="eye" />Their page</a>
			{#if c.accepting !== false}<a class="btn grad" href={at(c.slug, '/brand/new')}><Icon name="send" />Send a request</a>{/if}
			<ReportMenu name={c.name} target={{ creator_id: c.id }} onblocked={() => goto('/brand/creators?tab=discover')} />
		</div>
	</header>

	{#if locked}
		<div class="rv" style="margin:8px 0 24px"><ProNote side="brand" title="See every creator in full" body={gate?.msg || 'The free plan opens 10 full creator profiles a day.'} /></div>
	{:else if !opened}
		<div class="loader" style="min-height:24vh"><span class="ring"><span></span></span></div>
	{:else}
	<div class="md-grid">
		<!-- Fit -->
		<section class="md-card rv" style="--i:1">
			<header class="md-h"><div><span class="bx-eb">Fit for {company}</span><h2>{ft?.label}</h2></div></header>
			<div class="cp-fit">
				<Gauge value={(ft?.total ?? 0) / 100} gradient={false} color={ft && ft.total >= 80 ? 'var(--ok)' : 'var(--warn)'} center={String(ft?.total ?? '—')} sub="of 100" />
				<HBars
					rows={[
						{ label: 'Niche', values: [ft?.niche ?? 0] },
						...(ft?.audience != null ? [{ label: 'Audience', values: [ft.audience] }] : []),
						...(ft?.results != null ? [{ label: 'Past results', values: [ft.results] }] : []),
						...(ft?.price != null ? [{ label: 'Price', values: [ft.price] }] : [])
					]}
					names={['Score']}
					colors={['var(--ok)']}
					fmt={(v) => String(v)}
				/>
			</div>
			<p class="md-note">From their niche, the audience they share, your past collabs with them and their rates. {ft?.audience == null ? 'They haven\'t shared their audience yet.' : ''}</p>
		</section>

		<HealthCard health={c.health} name={firstName(c.name)} connected={c.followers != null} />

		<!-- Audience -->
		<section class="md-card rv" style="--i:2">
			<header class="md-h"><div><span class="bx-eb">Their audience</span><h2>Who follows them</h2></div></header>
			{#if c.audience}
				{#if c.audience.women !== null}
					<Donut
						slices={[
							{ label: 'Women', value: c.audience.women, color: 'var(--g2)' },
							{ label: 'Men', value: 100 - c.audience.women, color: 'var(--h-request)' }
						]}
						center="{c.audience.women}%"
						sub="women"
						fmt={() => ''}
						size={140}
					/>
				{/if}
				{#if ages.length}<Columns items={ages.map(([k, v]) => ({ label: k, values: [v] }))} names={['Share']} colors={['linear-gradient(180deg, var(--g2), var(--g1))']} fmt={(v) => `${v}%`} height={150} />{/if}
				{#if c.audience.cities.length}<HBars rows={c.audience.cities.map((x) => ({ label: x.name, values: [x.pct] }))} names={['Share']} colors={['var(--g1)']} fmt={(v) => `${v}%`} />{/if}
			{:else}
				<p class="md-note">{firstName(c.name)} hasn't shared their audience from Instagram yet. Ask in your request, or check their page.</p>
			{/if}
		</section>

		<!-- Your private rating -->
		<section class="md-card rv" style="--i:3">
			<header class="md-h"><div><span class="bx-eb">Your rating</span><h2>Only your team sees this</h2></div>{#if c.rating}<small class="md-note">Updated {fmt(c.rating.updated_at.slice(0, 10))}</small>{/if}</header>
			{#if canRate}
				<div class="cp-stars">
					{#each ROWS as row (row.key)}
						<div class="cp-row">
							<span>{row.label}</span>
							<span class="cp-st" role="radiogroup" aria-label={row.label}>
								{#each [1, 2, 3, 4, 5] as n (n)}<button role="radio" aria-checked={get(row.key) === n} aria-label="{n} star{n === 1 ? '' : 's'}" class:on={get(row.key) >= n} onclick={() => set(row.key, n)}>★</button>{/each}
							</span>
						</div>
					{/each}
				</div>
				<div class="f"><label for="cp-note">Note for your team</label><textarea class="inp" id="cp-note" rows="2" maxlength="500" placeholder="e.g. Fast drafts, very natural with skincare" bind:value={note}></textarea></div>
				<button class="btn primary" style="align-self:flex-start" onclick={save} disabled={saving}>{#if saving}<span class="spinner"></span>{:else}<Icon name="check" />{/if}Save rating</button>
				<p class="md-note">Like the ratings creators give brands, it never shows to {firstName(c.name)}.</p>
			{:else}
				<p class="md-note">Rate {firstName(c.name)} after you work together: on time, quality and results. Only your team sees it.</p>
			{/if}
		</section>

		<!-- With you -->
		<section class="md-card rv" style="--i:4">
			<header class="md-h"><div><span class="bx-eb">With {company}</span><h2>What you did together</h2></div>{#if c.with_me.collabs}<a href={at(c.slug, '/brand/requests')}>Requests<Icon name="arrow" /></a>{/if}</header>
			<div class="cp-nums">
				<div><small>Requests</small><b class="num">{c.with_me.collabs}</b></div>
				<div><small>Finished</small><b class="num">{c.with_me.wrapped}</b></div>
				<div><small>Views</small><b class="num">{compact(c.with_me.views)}</b></div>
				<div><small>Per view</small><b class="num">{cpv === null ? '—' : `₹${cpv.toFixed(2)}`}</b></div>
			</div>
		</section>
	</div>
	{/if}

	<!-- Creators like them: the app's tickets. -->
	{#if like.length}
		<section class="hs">
			<header class="hs-h"><h2>Creators like {firstName(c.name)}</h2><span class="hs-n">{like.length}</span></header>
			<div class="tks m-plist">
				{#each like as x, i (x.id)}
					{@const xf = fit(x, NO_FILTERS, category)}
					<Ticket
						name={x.name}
						sub={[x.niche?.split(',')[0]?.trim(), x.city, x.followers != null ? compact(x.followers) : ''].filter(Boolean).join(' · ')}
						money={String(xf.total)}
						moneySub="fit"
						task={reelRate(x) ? `Reels from ${inrS(reelRate(x)!)}` : 'Ask for a quote'}
						status={xf.label}
						tone={xf.tone}
						href="/brand/creator/{x.id}"
						hue="var(--m{hueOf(x.name)})"
						{i}
					>
						<a class="btn" href="/brand/creator/{x.id}">Open</a>
					</Ticket>
				{/each}
			</div>
		</section>
	{/if}
{/if}

<style>
	.cp-trust {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
	}
	.cp-chip {
		padding: 5px 10px;
		border-radius: 99px;
		font-size: 12px;
		font-weight: 600;
	}
	.cp-chip.ok {
		background: color-mix(in oklab, var(--ok) 15%, transparent);
		color: var(--ok);
	}
	.cp-chip.warn {
		background: color-mix(in oklab, var(--warn) 15%, transparent);
		color: var(--warn);
	}
	.cp-chip.info {
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.cp-explain {
		max-width: 60ch;
		margin: 8px 0 0;
		line-height: 1.5;
	}
	.cp-fit {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 18px;
		align-items: center;
	}
	.cp-stars {
		display: grid;
		gap: 8px;
	}
	.cp-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 15px;
	}
	.cp-st button {
		padding: 0 2px;
		border: 0;
		background: none;
		font-size: 26px;
		line-height: 1;
		color: var(--line-strong);
		cursor: pointer;
	}
	.cp-st button.on {
		color: var(--g3);
	}
	.cp-nums {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}
	.cp-nums div {
		display: grid;
		gap: 4px;
		padding: 12px 14px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--ink) 5%, transparent);
	}
	.cp-nums small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.cp-nums b {
		font-size: 24px;
		font-weight: 600;
	}
	@media (max-width: 560px) {
		.cp-fit {
			grid-template-columns: minmax(0, 1fr);
			justify-items: center;
		}
		.cp-nums {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
