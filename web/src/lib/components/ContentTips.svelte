<script lang="ts">
	import { sponsoredLine, type InsightsData } from '../insights';
	import { studio } from '../studio.svelte';
	import { compact } from '../util';
	import Icon from './Icon.svelte';
	import { phone } from '../phone.svelte';

	// What her own numbers say about planning content: when to post, what works, what people keep.
	const ins = $derived((studio.ig?.insights ?? null) as InsightsData | null);
	const bt = $derived(ins?.best_time ?? null);
	const topics = $derived(ins?.topics ?? []);
	const reels = $derived(ins?.formats?.reels ?? null);
	const spLine = $derived(sponsoredLine(ins?.sponsored ?? null));
	const bandMax = $derived(Math.max(1, ...(bt?.bands ?? []).map((b) => b.med_reach ?? 0)));
	const dayMax = $derived(Math.max(1, ...(bt?.days ?? []).map((b) => b.med_reach ?? 0)));
	const topMax = $derived(Math.max(1, ...topics.map((t) => t.med_views ?? 0)));
	const DAY_PLURAL: Record<string, string> = { Sun: 'Sundays', Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays' };
	const bandPhrase = (b: string) => (b.startsWith('Night') ? 'at night' : `in the ${b.split(' (')[0].toLowerCase()}`);
	const has = $derived(!!(bt?.best_band || topics.length || reels?.save_rate != null || spLine));
	// Phone: the best day and time as words to put in the serif line.
	const bestDay = $derived(bt?.best_day ? DAY_PLURAL[bt.best_day] ?? bt.best_day : '');
	const bestBand = $derived(bt?.best_band ? bandPhrase(bt.best_band) : '');
	const pct = (v: number | null | undefined, max: number) => Math.max(6, Math.round(((v ?? 0) / max) * 100));
</script>

{#if studio.ig?.connected && has && phone.on}
	<!-- Phone: CRED's look. Each tip a card: a line in serif, then the numbers as capsules or a ranking. -->
	<section class="hs tp">
		<header class="hs-h"><h2>Content tips</h2><span class="tp-from">from your own posts</span></header>
		{#if bt?.best_band || bt?.best_day}
			<article class="tp-card">
				<span class="tp-eb"><i><Icon name="cal" /></i>Best time to post</span>
				<p class="tp-say">Your posts travel furthest{#if bestDay}{' '}on <em>{bestDay}</em>{/if}{#if bestBand}{bestDay ? ',' : ''} {bestBand.split(' ').slice(0, -1).join(' ')} <em>{bestBand.split(' ').slice(-1)[0]}</em>{/if}.</p>
				<div class="tp-cols tp-bands">
					{#each bt.bands as b (b.k)}
						<div class="tp-col" class:best={b.k === bt.best_band}>
							<b>{compact(b.med_reach)}</b>
							<span class="tp-track"><i style="height:{pct(b.med_reach, bandMax)}%"></i></span>
							<span class="tp-lbl">{b.k.split(' (')[0]}<small>{b.k.match(/\((.*)\)/)?.[1] ?? ''}</small></span>
						</div>
					{/each}
				</div>
				<div class="tp-cols tp-days">
					{#each bt.days as dd (dd.k)}
						<div class="tp-col" class:best={dd.k === bt.best_day} title="{dd.posts} posts">
							<span class="tp-track"><i style="height:{pct(dd.med_reach, dayMax)}%"></i></span>
							<span class="tp-lbl">{dd.k}</span>
						</div>
					{/each}
				</div>
				<small class="tp-hint">Typical reach by when you posted (India time), from your last {bt.posts} posts.</small>
			</article>
		{/if}
		{#if topics.length}
			<article class="tp-card">
				<span class="tp-eb"><i><Icon name="spark" /></i>What performs best</span>
				<p class="tp-say"><em>{topics[0].k}</em> wins{topics[1] ? `, then ${topics[1].k.toLowerCase()}` : ''}.</p>
				<ol class="tp-rank">
					{#each topics as t, i (t.k)}
						<li class:top={i === 0}>
							<span class="tp-n">{String(i + 1).padStart(2, '0')}</span>
							<span class="tp-t"><b>{t.k}</b><small>{t.posts} post{t.posts === 1 ? '' : 's'}</small><span class="tp-bar"><i style="width:{pct(t.med_views, topMax)}%"></i></span></span>
							<b class="tp-v">{compact(t.med_views)}</b>
						</li>
					{/each}
				</ol>
				<small class="tp-hint">Typical views per post, by topic in the caption and hashtags.</small>
			</article>
		{/if}
		{#if reels && (reels.save_rate != null || reels.share_rate != null)}
			<article class="tp-card">
				<span class="tp-eb"><i><Icon name="check" /></i>Saves and shares on Reels</span>
				<div class="tp-nums">
					<div><b>{reels.save_rate ?? '—'}<small>%</small></b><span>saved</span></div>
					<div><b>{reels.share_rate ?? '—'}<small>%</small></b><span>shared</span></div>
				</div>
				<small class="tp-hint">Per 100 accounts reached. Saves and shares are the strongest sign people found it useful, and Instagram shows those Reels to more people.</small>
			</article>
		{/if}
		{#if spLine}
			<article class="tp-card">
				<span class="tp-eb"><i><Icon name="chart" /></i>Sponsored vs regular</span>
				<p class="tp-say tp-say-sm">{spLine}.</p>
				<small class="tp-hint">Typical post of each. Brands see this on your insights page.</small>
			</article>
		{/if}
	</section>
{:else if studio.ig?.connected && has}
	<section class="panel rv tips" style="--i:8;margin-top:18px">
		<div class="panel-h"><h2>Content tips</h2><small>from your own posts</small></div>
		<div class="tips-grid">
			{#if bt?.best_band || bt?.best_day}
				<div class="tip">
					<span class="lbl"><Icon name="cal" />Best time to post</span>
					<p>Your posts reach the most people{bt.best_day ? ` on ${DAY_PLURAL[bt.best_day] ?? bt.best_day}` : ''}{bt.best_band ? `${bt.best_day ? ',' : ''} ${bandPhrase(bt.best_band)}` : ''}.</p>
					<div class="tip-bars">
						{#each bt.bands as b (b.k)}
							<div class="tip-bar" class:best={b.k === bt.best_band}><span class="tip-band">{b.k.split(' (')[0]}<small>{b.k.match(/\((.*)\)/)?.[1] ?? ''}</small></span><i style="width:{((b.med_reach ?? 0) / bandMax) * 100}%"></i><b>{compact(b.med_reach)}</b></div>
						{/each}
					</div>
					<div class="tip-days">
						{#each bt.days as dd (dd.k)}
							<span class:best={dd.k === bt.best_day} title="{dd.posts} posts"><i style="height:{Math.max(8, ((dd.med_reach ?? 0) / dayMax) * 100)}%"></i>{dd.k}</span>
						{/each}
					</div>
					<small class="hint">Typical reach by when you posted (India time), from your last {bt.posts} posts.</small>
				</div>
			{/if}
			{#if topics.length}
				<div class="tip">
					<span class="lbl"><Icon name="spark" />What performs best</span>
					<p><b>{topics[0].k}</b> posts get the most views{topics[1] ? `, then ${topics[1].k.toLowerCase()}` : ''}.</p>
					<div class="tip-bars">
						{#each topics as t (t.k)}
							<div class="tip-bar"><span>{t.k} <small>({t.posts})</small></span><i style="width:{((t.med_views ?? 0) / topMax) * 100}%"></i><b>{compact(t.med_views)}</b></div>
						{/each}
					</div>
					<small class="hint">Typical views per post, by topic in the caption and hashtags.</small>
				</div>
			{/if}
			{#if reels && (reels.save_rate != null || reels.share_rate != null)}
				<div class="tip">
					<span class="lbl"><Icon name="check" />Saves and shares on Reels</span>
					<div class="tip-nums">
						<div><b>{reels.save_rate ?? '—'}%</b><small>saved</small></div>
						<div><b>{reels.share_rate ?? '—'}%</b><small>shared</small></div>
					</div>
					<small class="hint">Per 100 accounts reached. People saving and sharing is the strongest sign they found it useful, and Instagram shows those Reels to more people.</small>
				</div>
			{/if}
			{#if spLine}
				<div class="tip">
					<span class="lbl"><Icon name="chart" />Sponsored vs regular</span>
					<p>{spLine}.</p>
					<small class="hint">Typical post of each. Brands see this on your insights page.</small>
				</div>
			{/if}
		</div>
	</section>
{/if}
