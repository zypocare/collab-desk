<script lang="ts">
	import { assignAlert, ignoreAlert, studio } from '../studio.svelte';
	import { balanceDue, type Invoice } from '../invoice';
	import { fmt, inr } from '../util';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	const unmatched = $derived(studio.alerts.filter((a) => a.status === 'unmatched'));
	const recent = $derived(studio.alerts.filter((a) => a.status === 'matched').slice(0, 5));
	const open = $derived(
		studio.collabs.flatMap((c) => c.invoices.filter((i) => i.status === 'sent' || i.status === 'partly_paid').map((i) => ({ i, brand: c.brand.name })))
	);
	const byId = (id: string | null) => studio.collabs.flatMap((c) => c.invoices).find((i) => i.id === id);
	let choice = $state<Record<string, string>>({});
</script>

{#if unmatched.length || recent.length}
	<section class="panel rv" style="--i:4;margin-bottom:18px">
		<div class="panel-h">
			<h2>Bank credits</h2>
			<small>{unmatched.length ? `${unmatched.length} to check` : 'all matched'} · matched from your bank's credit emails, not a check with the bank</small>
		</div>
		{#each unmatched as a (a.id)}
			<div class="alert-row">
				<span class="mini-ic tint k-follow" style="width:38px;height:38px"><Icon name="wallet" /></span>
				<div class="alert-body">
					<b class="num">{inr(a.amount ?? 0)}</b> <span class="hint">· {fmt((a.received_at ?? a.created_at).slice(0, 10))}{a.ref ? ` · Ref ${a.ref}` : ''}</span>
					<small>{a.excerpt.slice(0, 160)}</small>
				</div>
				<div class="alert-acts">
					<Select size="sm" ariaLabel="Which invoice is this?" placeholder="Which invoice?" bind:value={choice[a.id]} options={open.map((o) => ({ value: o.i.id, label: `${o.i.number} · ${o.brand}`, hint: inr(balanceDue(o.i)) }))} />
					<button class="btn sm primary" disabled={!choice[a.id]} onclick={() => assignAlert(a, byId(choice[a.id]) as Invoice)}>Match</button>
					<button class="btn sm ghost" onclick={() => ignoreAlert(a)}>Not a collab</button>
				</div>
			</div>
		{/each}
		{#each recent as a (a.id)}
			<div class="alert-row done">
				<span class="mini-ic tint k-pay" style="width:38px;height:38px"><Icon name="check" /></span>
				<div class="alert-body"><b class="num">{inr(a.amount ?? 0)}</b> <span class="hint">matched to {byId(a.invoice_id)?.number ?? 'an invoice'} · {fmt((a.received_at ?? a.created_at).slice(0, 10))}</span></div>
			</div>
		{/each}
	</section>
{/if}
