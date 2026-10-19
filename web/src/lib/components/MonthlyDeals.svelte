<script lang="ts">
	import { ask } from '../confirm.svelte';
	import { deleteRetainer, saveRetainer, studio } from '../studio.svelte';
	import type { Retainer } from '../types';
	import { fmt, inr, inrS, plural } from '../util';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
	import RetainerDialog from './RetainerDialog.svelte';
	import Ticket from './Ticket.svelte';
	import { phone } from '../phone.svelte';

	// Monthly deals: what each includes, which month it's on, and the next go-live. Optionally for one brand.
	let { brandId = '', brandName = '' }: { brandId?: string; brandName?: string } = $props();
	let open = $state<{ editing?: Retainer } | null>(null);

	const list = $derived(studio.retainers.filter((r) => !brandId || r.brand_id === brandId));
	const brandOf = (id: string) => studio.brands.find((b) => b.id === id)?.name ?? '';
	const monthNo = (r: Retainer) => {
		const s = new Date(r.starts_on + 'T00:00:00'), n = new Date();
		return (n.getFullYear() - s.getFullYear()) * 12 + n.getMonth() - s.getMonth() + 1;
	};
	const status = (r: Retainer) => {
		const k = monthNo(r);
		if (!r.active) return r.months && k > r.months ? 'Finished' : 'Paused';
		if (k < 1) return `Starts ${new Date(r.starts_on + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long' })}`;
		return r.months ? `Month ${Math.min(k, r.months)} of ${r.months}` : `Month ${k}`;
	};
	const thisMonth = (r: Retainer) => studio.collabs.find((c) => c.retainer_id === r.id && c.retainer_month?.slice(0, 7) === new Date().toISOString().slice(0, 7));
	const what = (r: Retainer) => r.deliverables.map((d) => `${d.qty} ${plural(d.kind, d.qty)}`).join(' · ');

	async function toggle(r: Retainer) {
		await saveRetainer({ id: r.id, brand_id: r.brand_id, active: !r.active });
	}
	async function remove(r: Retainer) {
		if (!(await ask({ title: `Remove the monthly deal with ${brandOf(r.brand_id)}?`, body: 'Collabs already created stay as they are. No new months are created.', ok: 'Remove', danger: true }))) return;
		await deleteRetainer(r.id);
	}
</script>

<section class="panel md-panel rv">
	<div class="panel-h">
		<h2>Monthly deals</h2>
		<button class="btn sm" onclick={() => (open = {})}><Icon name="plus" />{brandId ? 'Set up a monthly deal' : 'New monthly deal'}</button>
	</div>
	{#if phone.on && list.length}
		<!-- Phone: each monthly deal a ticket, like Needs you on Today. -->
		<div class="tks md-tks">
			{#each list as r, i (r.id)}
				{@const cur = thisMonth(r)}
				<Ticket
					name={brandOf(r.brand_id)}
					title={brandId ? r.title || 'Monthly deal' : brandOf(r.brand_id)}
					sub={brandId ? `Go-live on the ${r.live_day}` : r.title || 'Monthly deal'}
					money={inrS(r.fee)}
					moneySub="a month"
					task={`${what(r)} a month`}
					status={cur ? `This month: ${cur.code}${cur.live_date ? `, live ${fmt(cur.live_date)}` : ''}` : status(r)}
					tone={r.active ? 'ok' : 'calm'}
					href={cur ? `/studio/c/${cur.code}` : ''}
					onopen={() => (open = { editing: r })}
					{i}
				>
					<span class="pt-tk-acts">
						<button class="icon-btn" aria-label="Change" onclick={() => (open = { editing: r })}><Icon name="edit" /></button>
						<button class="icon-btn" aria-label={r.active ? 'Pause' : 'Resume'} onclick={() => toggle(r)}><Icon name={r.active ? 'clock' : 'refresh'} /></button>
						<button class="icon-btn" aria-label="Remove" onclick={() => remove(r)}><Icon name="x" /></button>
					</span>
				</Ticket>
			{/each}
		</div>
	{:else}
	{#each list as r (r.id)}
		{@const cur = thisMonth(r)}
		<div class="md-row" class:off={!r.active}>
			<Mono name={brandOf(r.brand_id)} />
			<div class="md-b">
				<b>{brandId ? r.title || 'Monthly deal' : `${brandOf(r.brand_id)}${r.title ? ` · ${r.title}` : ''}`}</b>
				<small>{what(r)} a month · {inr(r.fee)} · go-live on the {r.live_day}{r.live_day === 1 || r.live_day === 21 ? 'st' : r.live_day === 2 || r.live_day === 22 ? 'nd' : r.live_day === 3 || r.live_day === 23 ? 'rd' : 'th'}</small>
				<span class="md-st"><span class="pill tint {r.active ? 'k-pay' : 'plain'}">{status(r)}</span>{#if cur}<a class="lnk" href="/studio/c/{cur.code}">This month: {cur.code}{cur.live_date ? `, live ${fmt(cur.live_date)}` : ''}</a>{/if}</span>
			</div>
			<div class="md-acts">
				<button class="icon-btn" aria-label="Change" title="Change" onclick={() => (open = { editing: r })}><Icon name="edit" /></button>
				<button class="icon-btn" aria-label={r.active ? 'Pause' : 'Resume'} title={r.active ? 'Pause' : 'Resume'} onclick={() => toggle(r)}><Icon name={r.active ? 'clock' : 'refresh'} /></button>
				<button class="icon-btn" aria-label="Remove" title="Remove" onclick={() => remove(r)}><Icon name="x" /></button>
			</div>
		</div>
	{:else}
		<p class="hint md-empty">Ambassador or retainer deal? Set it up once and each month's collab, go-live date and invoice are created on their own.</p>
	{/each}
	{/if}
</section>

{#if open}<RetainerDialog editing={open.editing} {brandName} onclose={() => (open = null)} />{/if}
