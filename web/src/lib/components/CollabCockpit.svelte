<script lang="ts">
	import type { Collab } from '../types';
	import { deliverableProgress, fmt, inr, initials, isPaid, PAY_LABEL, payState, stageIndex, stageOf, STAGES, TYPE_LABEL } from '../util';
	import Icon from './Icon.svelte';

	let { c, next, onrunnext, onjump, onmore, moreOpen, expanded, ontoggle }: {
		c: Collab;
		next: { key: string; label: string; hint: string; icon: string } | null;
		onrunnext: (key: string) => void;
		onjump: (section: string) => void;
		onmore: (event: MouseEvent) => void;
		moreOpen: boolean;
		expanded: boolean;
		ontoggle: () => void;
	} = $props();

	const cash = $derived(isPaid(c));
	const value = $derived(cash ? c.fee : c.product_value);
	const payment = $derived(payState(c));
	const pieces = $derived(deliverableProgress(c.deliverables));
	const stage = $derived(stageIndex(c.stage));
</script>

<section class="overview" aria-label="Collaboration overview">
	<header class="deal-cover">
		<div class="identity">
			<span class="monogram" aria-hidden="true">{initials(c.brand.name)}</span>
			<span class="reference">{c.code}</span>
			<button class="more" aria-label="More collaboration actions" aria-expanded={moreOpen} onclick={onmore}><Icon name="more" /></button>
		</div>
		<h1>{c.brand.name}</h1>
		<p class="metadata">{TYPE_LABEL[c.type]} collaboration{#if c.via_agency} · via {c.via_agency}{/if}{#if c.received_on} · Received {fmt(c.received_on)}{/if}</p>
		<div class="figures">
			<button onclick={() => onjump('sec-deal')}>
				<small>{cash ? 'Deal value' : 'Barter value'}</small>
				<strong>{value ? inr(value) : 'To agree'}</strong>
			</button>
			<button onclick={() => onjump(cash ? 'sec-pay' : 'sec-deliv')}>
				<small>{cash ? 'Payment' : 'Deliverables'}</small>
				<span class="payment" class:settled={cash && payment === 'paid'}>
					{#if cash}{payment === 'paid' ? 'Paid in full' : payment === 'overdue' ? 'Overdue' : PAY_LABEL[c.pay_status] || 'Not invoiced'}{:else}{pieces.done} of {pieces.total} done{/if}
				</span>
			</button>
		</div>
	</header>

	<div class="action-card">
		<button class="stage" onclick={() => onjump('sec-stage')} aria-label={'Change stage, currently ' + stageOf(c)}>
			<span><i aria-hidden="true"></i>{stageOf(c)}</span>
			<small>{stage >= 0 && !c.someday ? 'Stage ' + (stage + 1) + ' of ' + STAGES.length : 'Manage stage'} <Icon name="chevR" /></small>
		</button>
		{#if stage >= 0 && !c.someday}
			<div class="track" aria-hidden="true">{#each STAGES as step, i (step.id)}<i class:past={i < stage} class:current={i === stage}></i>{/each}</div>
		{/if}
		{#if next}
			<div class="next-action">
				<small>Next step</small>
				<p>{next.key === 'quote' ? 'Choose a quote for the brand' : next.hint}</p>
				<button onclick={() => next && onrunnext(next.key)}><Icon name={next.icon} /><b>{next.label}</b><Icon name="arrow" /></button>
			</div>
		{/if}
	</div>

	<div class="workspace-title"><h2>{expanded ? 'All details' : 'Workspace'}</h2><button aria-expanded={expanded} onclick={ontoggle}>{expanded ? 'Show less' : 'All details'} <Icon name={expanded ? 'chevD' : 'chevR'} /></button></div>
</section>

<style>
	.overview{min-width:0;display:grid;gap:14px;color:var(--ink);font-family:var(--f-body)}
	.overview button{font:inherit;color:inherit;cursor:pointer;touch-action:manipulation}
	.deal-cover{position:relative;isolation:isolate;overflow:hidden;padding:14px 18px 16px;border-radius:20px;background:linear-gradient(125deg,#211620 28%,#43233c 80%,#5c3544);color:var(--hero-ink);border:1px solid #68435d}
	.deal-cover::before{content:'';position:absolute;z-index:-1;inset:0 0 30% 16%;background:repeating-radial-gradient(ellipse at 120% -85%,transparent 0 8px,#f5c3cc40 8.5px 9.2px,transparent 10px 13px);mask-image:linear-gradient(105deg,transparent 5%,#000 100%);pointer-events:none}
	.identity,.stage,.stage span,.stage small,.workspace-title,.workspace-title button{display:flex;align-items:center}
	.identity{gap:9px}.monogram{width:32px;height:32px;display:grid;place-items:center;border:1px solid #f4d7e645;border-radius:10px;background:#f4d7e611;font:italic 16px var(--f-serif)}.reference{font:600 11px var(--f-mono);letter-spacing:.08em;overflow-wrap:anywhere}
	.more{margin-left:auto;width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:12px;background:transparent}
	.deal-cover h1{margin:10px 0 4px;color:inherit;font:400 clamp(32px,9vw,43px)/1.03 var(--f-serif);letter-spacing:-.035em;overflow-wrap:anywhere;text-wrap:balance}
	.metadata{margin:0;color:#e3cedb;font-size:12px;line-height:1.5;overflow-wrap:anywhere}
	.figures{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-top:1px solid #f9e7f02e;margin-top:19px;padding-top:13px}
	.figures button{min-width:0;border:0;padding:0 10px 0 0;background:none;text-align:left;display:grid;align-content:start;justify-items:start;gap:5px;min-height:45px}
	.figures button+button{border-left:1px solid #f9e7f032;padding-left:16px}
	.figures small,.next-action small{font:650 11px/1.3 var(--f-body);color:#ddcad9}
	.figures strong{font:400 clamp(24px,6.5vw,29px)/1.1 var(--f-serif);overflow-wrap:anywhere}
	.payment{font:650 14px/1.3 var(--f-body);margin-top:3px}.settled{color:#98e3b0}
	.action-card{padding:0 15px 15px;border:1px solid var(--line);background:var(--surface);border-radius:17px}
	.stage{width:100%;min-height:48px;justify-content:space-between;gap:8px;background:none;border:0;text-align:left;padding:5px 0}
	.stage span{gap:8px;font-weight:700;font-size:14px}.stage span i{width:7px;height:7px;border-radius:50%;background:var(--g2)}.stage small{gap:3px;color:var(--ink-3);font-size:12px}.stage small :global(svg),.workspace-title :global(svg){width:15px;height:15px}
	.track{display:flex;gap:4px}.track i{flex:1;height:4px;border-radius:4px;background:var(--line)}.track .past{background:var(--g1)}.track .current{background:var(--grad)}
	.next-action{margin-top:15px}.next-action small{color:var(--ink-3)}.next-action p{margin:3px 0 12px;font:550 17px/1.3 var(--f-display);color:var(--ink)}
	.next-action button{display:flex;align-items:center;gap:10px;width:100%;min-height:46px;padding:9px 14px;border:0;border-radius:11px;background:linear-gradient(105deg,color-mix(in srgb,var(--g1) 70%,white),color-mix(in srgb,var(--g2) 76%,white) 56%,var(--g3));color:#21131c}
	.next-action button :global(svg:last-child){margin-left:auto}.next-action button:active{transform:translateY(1px)}
	.workspace-title{justify-content:space-between;gap:12px}.workspace-title h2{margin:0;font:600 20px var(--f-display);letter-spacing:-.04em}.workspace-title button{min-height:44px;gap:4px;padding:0 3px;border:0;background:none;color:var(--accent);font-size:13px;font-weight:650}
	@media(prefers-reduced-motion:no-preference){.next-action button{transition:transform .18s}.deal-cover::before{animation:ink-arrival .8s ease-out both}@keyframes ink-arrival{from{opacity:0;transform:translateX(9px)}to{opacity:1;transform:none}}}
</style>
