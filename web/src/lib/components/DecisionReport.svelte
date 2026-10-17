<script lang="ts">
	import { untrack } from 'svelte';
	import { portal } from '../portal';
	import type { Collab } from '../types';
	import { hrs } from '../decide';
	import { decisionOf, readFit, studio } from '../studio.svelte';
	import { copyText, toast } from '../ui.svelte';
	import { delivText, firstName, fmt, inr, TYPE_LABEL } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';
	import ScoreRing from './ScoreRing.svelte';

	// The full "Should I take it?" report: score, each factor with its facts, the money worked out,
	// what to ask, and ready replies.
	let { c, onclose }: { c: Collab; onclose: () => void } = $props();
	const d = $derived(decisionOf(c)!);
	const fit = $derived(studio.fits[c.id]);
	let busy = $state(false);
	// Start on the reply that matches the verdict.
	const first = untrack(() => decisionOf(c));
	let tab = $state<'yes' | 'counter' | 'no'>(first?.verdict === 'pass' ? 'no' : first?.counterFee && !first.money.unknown ? 'counter' : 'yes');

	const me = $derived(firstName(studio.settings?.display_name ?? ''));
	const hi = $derived(`Hi ${firstName(c.contact_name) || c.brand.name}`);
	const asks = $derived(d.questions.length ? ` Before we lock it in, could you share: ${d.questions.map((q) => q.replace(/\?$/, '').replace(/^\w/, (x) => x.toLowerCase())).join('; ')}?` : '');
	const what = $derived(c.type !== 'paid' && c.product ? ` along with the ${c.product.toLowerCase()}` : '');
	const replies = $derived({
		yes: `${hi}, thank you for reaching out! I'd love to collaborate with ${c.brand.name}.${asks || ' Please share the brief and timeline and I’ll get started.'}\n\n${me}`,
		counter: d.counterFee && !d.money.unknown
			? `${hi}, thank you for thinking of me! I'd love to work with ${c.brand.name}. For ${delivText(c.deliverables) || 'this'}${d.travel ? ' including the visit' : ''}, my fee is ${inr(d.counterFee)}${what}.${asks} Happy to discuss!\n\n${me}`
			: '',
		no: `${hi}, thank you so much for thinking of me. I won't be able to take this one up right now, but I'd love to stay in touch for future campaigns.\n\n${me}`
	});

	async function again() {
		if (busy || studio.reading.includes(c.id)) return;
		busy = true;
		try {
			await readFit(c);
			toast('Read again', 'check');
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		busy = false;
	}
	const deal = $derived(
		[delivText(c.deliverables), TYPE_LABEL[c.type], c.type !== 'barter' && c.fee ? inr(c.fee) : '', c.type !== 'paid' && c.product ? c.product : ''].filter(Boolean).join(' · ')
	);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim dr-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog dec-report" role="dialog" aria-modal="true" aria-labelledby="dec-title">
		<header class="dec-top">
			<div>
				<span class="eb">Should you take it? <span class="ai-tag"><Icon name="spark" />AI report</span></span>
				<h2 id="dec-title">{c.brand.name}</h2>
				<small>{deal}</small>
			</div>
			<button class="icon-btn" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
		</header>

		<section class="dec-hero v-{d.verdict}">
			<div class="dec-fx" aria-hidden="true"></div>
			<ScoreRing score={d.score} verdict={d.verdict} size={108} />
			<div class="dec-hero-t">
				<span class="dec-pill v-{d.verdict}">{d.label}</span>
				<p class="dec-line">{d.line}</p>
				{#if d.summary}<p class="dec-sum">“{d.summary}”</p>{/if}
			</div>
		</section>

		{#if busy || studio.reading.includes(c.id)}<p class="dec-note"><AiThinking label="Reading the request: visit, location, outfit, makeup, red flags" /></p>{:else if !d.read}<p class="hint dec-note"><Icon name="spark" />Travel, outfit and makeup appear once the AI has read the request. <button class="lnk ai-lnk" onclick={again}>Read it now</button></p>{/if}

		<div class="dec-grid">
			{#each d.factors as f, i (f.key)}
				<article class="dec-f t-{f.tone}" style="--i:{i}">
					<div class="dec-fh">
						<span class="dec-ic"><Icon name={f.icon} /></span>
						<div><b>{f.label}</b><small>{f.weight}% of the score</small></div>
						<span class="dec-fs">{Math.round(f.score * 10) / 10}<small>/10</small></span>
					</div>
					<div class="dec-bar"><i style="--w:{f.score / 10}"></i></div>
					<p class="dec-fhl">{f.headline}</p>
					{#if f.facts.length}<ul>{#each f.facts as x (x)}<li>{x}</li>{/each}</ul>{/if}
				</article>
			{/each}
		</div>

		{#if d.money.lines.length}
			<section class="dec-box">
				<h3><Icon name="rupee" />The money</h3>
				<table class="dec-money">
					<tbody>
						{#each d.money.lines as l (l.label)}<tr><td>{l.label}{#if l.note}<small>{l.note}</small>{/if}</td><td>{inr(l.amount)}</td></tr>{/each}
						<tr class="sum"><td>A fair price for the whole job</td><td>{inr(d.money.fair)}</td></tr>
						<tr><td>Their offer{#if d.money.offerNote}<small>{d.money.offerNote}</small>{/if}</td><td>{d.money.open ? 'open' : d.money.unknown && !c.fee ? 'not known yet' : inr(d.money.offer)}{#if d.money.unknown && c.fee}<small>+ {c.product || 'product'}</small>{/if}</td></tr>
						{#if d.money.ratio !== null}<tr class="gap" class:neg={d.money.offer < d.money.fair}><td>{d.money.offer >= d.money.fair ? 'More than fair by' : 'Short by'}</td><td>{inr(Math.abs(d.money.fair - d.money.offer))}</td></tr>{/if}
					</tbody>
				</table>
				{#if d.money.netHourly !== null && d.money.usualHourly}
					<div class="dec-hourly">
						<div><small>This job, per hour</small><b>{inr(Math.max(0, d.money.netHourly))}</b></div>
						<div><small>Your usual</small><b>{inr(d.money.usualHourly)}</b></div>
						<div><small>Total time</small><b>{hrs(d.hours.total)}</b></div>
					</div>
				{/if}
				{#if d.money.unknown}<p class="hint" style="margin:10px 0 0">Ask what they're worth. If they come to less than <b>{inr(d.money.fair)}</b>, ask for the difference as a fee.</p>{:else if d.counterFee}<p class="hint" style="margin:10px 0 0">Ask for <b>{inr(d.counterFee)}</b>{c.type !== 'paid' ? ' on top of what they give' : ''} to make it worth it.</p>{/if}
			</section>
		{/if}

		{#if d.travel}
			<section class="dec-box">
				<h3><Icon name="pin" />The trip</h3>
				<div class="dec-trip">
					<div><small>From</small><b>{studio.settings?.home_area}</b></div>
					<span class="dec-trip-l" aria-hidden="true"><i></i>{d.travel.km} km</span>
					<div><small>To</small><b>{d.travel.place}</b></div>
				</div>
				<div class="dec-hourly">
					<div><small>Usually</small><b>{d.travel.oneWay} min</b></div>
					<div><small>Peak hours</small><b>{d.travel.peak} min</b></div>
					<div><small>Round trip</small><b>{hrs(d.hours.travel)}</b></div>
				</div>
				<a class="btn sm" href={d.travel.mapUrl} target="_blank" rel="noopener"><Icon name="pin" />Open in Maps</a>
			</section>
		{/if}

		{#if d.flags.length || d.good.length}
			<div class="dec-two">
				{#if d.flags.length}<section class="dec-box dec-bad"><h3><Icon name="alert" />Watch out</h3><ul>{#each d.flags as x (x)}<li>{x}</li>{/each}</ul></section>{/if}
				{#if d.good.length}<section class="dec-box dec-good"><h3><Icon name="check" />Good signs</h3><ul>{#each d.good as x (x)}<li>{x}</li>{/each}</ul></section>{/if}
			</div>
		{/if}

		{#if d.questions.length}
			<section class="dec-box">
				<h3><Icon name="info" />Ask before you say yes</h3>
				<ol class="dec-q">{#each d.questions as q (q)}<li>{q}</li>{/each}</ol>
			</section>
		{/if}

		<section class="dec-box">
			<h3><Icon name="send" />Your reply</h3>
			<div class="dec-tabs" role="tablist">
				<button role="tab" aria-selected={tab === 'yes'} class:on={tab === 'yes'} onclick={() => (tab = 'yes')}>Say yes</button>
				{#if replies.counter}<button role="tab" aria-selected={tab === 'counter'} class:on={tab === 'counter'} onclick={() => (tab = 'counter')}>Counter at {inr(d.counterFee)}</button>{/if}
				<button role="tab" aria-selected={tab === 'no'} class:on={tab === 'no'} onclick={() => (tab = 'no')}>Decline</button>
			</div>
			<p class="dec-reply">{replies[tab]}</p>
			<button class="btn sm primary" onclick={() => copyText(replies[tab], 'Reply copied')}><Icon name="copy" />Copy reply</button>
		</section>

		<footer class="dec-foot">
			<span>{fit ? `Read by AI on ${fmt(fit.read_at.slice(0, 10))}.` : 'Not read by AI yet.'} Scores use your rate card and the settings in My page &gt; Bookings.</span>
			<button class="btn sm ai-btn" disabled={busy || studio.reading.includes(c.id)} onclick={again}><Icon name="spark" />Read again</button>
		</footer>
	</div>
</div>
