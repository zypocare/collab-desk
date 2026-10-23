<script lang="ts">
	import { AD_HOW, rightsRows } from '../rights';
	import { studio, updateCollab } from '../studio.svelte';
	import type { Collab } from '../types';
	import { toast } from '../ui.svelte';
	import { fmt, usageLabel } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	// On a collab: how the brand may use her content, where, and until when; the partnership-ad code she
	// shares; and the exclusivity she agreed to, with any deal that clashes with it.
	let { c }: { c: Collab } = $props();
	const row = $derived(rightsRows(studio.collabs).find((r) => r.c.id === c.id) ?? null);
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
	async function save(patch: Partial<Pick<Collab, 'ad_how' | 'ad_code' | 'territory' | 'excl_scope'>>, msg = '') {
		await updateCollab(c.id, patch);
		if (msg) toast(msg, 'check');
	}
</script>

{#if row}
	<div class="rc">
		<div class="rc-top">
			<span class="rc-pill {row.state}">{row.state === 'organic' ? 'Organic only' : row.state === 'forever' ? 'No end date' : row.state === 'waiting' ? 'Starts when it goes live' : row.state === 'ended' ? 'Ended' : `${row.left} day${row.left === 1 ? '' : 's'} left`}</span>
			<b>{usageLabel(row.usage)}</b>
			{#if row.ends}<small>{row.starts ? `${fmt(row.starts)} to ${fmt(row.ends)}` : `Ends ${fmt(row.ends)}`}</small>{/if}
		</div>

		{#if row.paid}
			<div class="fields">
				<div class="f">
					<label for="rc-how-{c.id}">How they run the ads</label>
					<Select id="rc-how-{c.id}" value={c.ad_how ?? ''} options={Object.entries(AD_HOW).map(([value, label]) => ({ value, label }))} onchange={(v) => save({ ad_how: v as Collab['ad_how'] })} />
				</div>
				<div class="f"><label for="rc-ter-{c.id}">Where</label><input class="inp" id="rc-ter-{c.id}" value={c.territory ?? 'India'} maxlength="80" onchange={(e) => save({ territory: val(e).trim() || 'India' })} /></div>
			</div>
			{#if c.ad_how === 'partnership'}
				<div class="rc-code">
					<label for="rc-code-{c.id}"><b>Your partnership ad code</b> <small>The brand pastes it in Meta Ads Manager to run ads from your post.</small></label>
					<div class="rc-row">
						<input class="inp" id="rc-code-{c.id}" placeholder="Paste the code from Instagram" value={c.ad_code ?? ''} maxlength="200" onchange={(e) => save({ ad_code: val(e).trim() }, 'Code shared with the brand')} />
					</div>
					<small class="hint">In Instagram: open the post › ⋯ › Partnership label and ads › <b>Get partnership ad code</b>. {c.ad_code_at ? `Shared ${fmt(c.ad_code_at.slice(0, 10))}.` : ''}</small>
				</div>
			{/if}
		{/if}

		{#if row.exclDays}
			<div class="rc-ex">
				<span><Icon name="shield" /><b>No {c.excl_scope || c.brand.category || 'competing'} brands for {row.exclDays} days</b>{#if row.exclEnds}<small> · until {fmt(row.exclEnds)}</small>{/if}</span>
				<input class="inp sm" aria-label="What the exclusivity covers" placeholder="What it covers, e.g. skincare" value={c.excl_scope ?? ''} maxlength="120" onchange={(e) => save({ excl_scope: val(e).trim() })} />
				{#each row.clashes as o (o.id)}
					<span class="rc-clash"><Icon name="alert" />{o.brand.name} goes live {fmt(o.live_date)}, inside this exclusivity.</span>
				{/each}
			</div>
		{/if}
		<a class="lnk hint" href="/studio/rights">All your usage rights<Icon name="arrow" /></a>
	</div>
{/if}

<style>
	.rc {
		display: grid;
		gap: 12px;
	}
	.rc-top {
		display: grid;
		gap: 4px;
		justify-items: start;
	}
	.rc-top small {
		color: var(--ink-3);
	}
	.rc-pill {
		padding: 4px 10px;
		border-radius: 99px;
		font-size: 11.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.rc-pill.running,
	.rc-pill.forever {
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		color: var(--ok);
	}
	.rc-pill.ending {
		background: color-mix(in oklab, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.rc-pill.ended {
		background: color-mix(in oklab, var(--bad) 16%, transparent);
		color: var(--bad);
	}
	.rc-code,
	.rc-ex {
		display: grid;
		gap: 8px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2);
	}
	.rc-code label {
		display: grid;
		gap: 2px;
	}
	.rc-code label small {
		color: var(--ink-3);
	}
	.rc-ex > span:first-child {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.rc-ex small {
		color: var(--ink-3);
	}
	.rc-clash {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--warn);
		font-size: 13px;
	}
	.lnk {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		justify-self: start;
	}
</style>
