<script lang="ts">
	import { onMount } from 'svelte';
	import { refreshAccount } from '../auth.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage, fmt, inr } from '../util';
	import Icon from './Icon.svelte';

	// Delete a brand's company or a creator's page: what goes, what stays, running work to cancel, then
	// type the name to confirm. It closes at once and is erased 30 days later (sign in to bring it back).
	type Item = { code: string; name: string; stage: string; stage_label: string; fee?: number; live_date?: string | null; number?: string; amount?: number };
	type Check = { kind: 'brand' | 'creator'; owner: boolean; confirm: string; team?: number; running: Item[]; owed?: Item[]; unpaid?: Item[] };
	// The parent can read it too (whether this login owns the company).
	let { check = $bindable(null) }: { check?: Check | null } = $props();
	let open = $state(false);
	let showAll = $state(false);
	let cancel = $state(false);
	let typed = $state('');
	let busy = $state(false);
	onMount(async () => {
		const { data } = await supabase.rpc('my_delete_check');
		check = data as Check | null;
	});
	const brand = $derived(check?.kind === 'brand');
	const money = $derived((brand ? check?.unpaid : check?.owed) ?? []);
	const due = $derived(money.reduce((a, x) => a + (Number(x.amount) || 0), 0));
	const ok = $derived(!!check && typed.trim().toLowerCase() === check.confirm.trim().toLowerCase() && (!check.running.length || cancel));
	const erase = $derived(fmt(new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)));
	async function go() {
		if (!check || !ok) return;
		busy = true;
		const { error } = await supabase.rpc('account_delete', { p_confirm: typed.trim(), p_cancel: cancel });
		busy = false;
		if (error) return toast(errMessage(error), 'alert');
		toast(brand ? `${check.confirm} is closed. You can bring it back until ${erase}.` : `Your page is closed. You can bring it back until ${erase}.`, 'check');
		await refreshAccount();
	}
</script>

{#if check?.owner}
	<section class="panel da rv" class:open style="--i:5">
		{#if !open}
			<div class="switch-row" style="border-top:0">
				<div><b>{brand ? `Delete ${check.confirm}` : 'Delete my page'}</b><small>{brand ? 'Your company, your team’s logins and everything with it.' : `${check.confirm}.miracleapp.live and your studio, with a month to change your mind.`}</small></div>
				<button class="btn sm danger" type="button" onclick={() => (open = true)}>Delete…</button>
			</div>
		{:else}
			<div class="da-h"><h2>{brand ? `Delete ${check.confirm}` : 'Delete my page'}</h2>{#if brand}<small>Only the owner can do this</small>{/if}</div>
			<div class="da-grid">
				<div><small>Goes</small><span>{brand ? 'Your company, team logins, briefs, applications, ratings and phone alerts.' : `${check.confirm}.miracleapp.live and your request link stop working. Instagram is disconnected; saved DMs and AI drafts are erased.`}</span></div>
				<div><small>Stays</small><span>{brand ? 'Invoices, for as long as tax law needs. Creators keep their own records of past collabs and chats.' : 'Invoices, for as long as tax law needs.'}</span></div>
			</div>
			{#if check.running.length}
				<div class="da-run">
					<span class="da-eb">{check.running.length} {brand ? 'request' : 'collab'}{check.running.length === 1 ? '' : 's'} still running</span>
					{#each check.running.slice(0, showAll ? undefined : 4) as r (r.code)}
						<div class="da-tk"><span><b>{r.name}</b><small>{r.code} · {r.stage_label}{r.live_date ? ` · live ${fmt(r.live_date)}` : ''}</small></span>{#if r.fee}<b>{inr(r.fee)}</b>{/if}</div>
					{/each}
					{#if check.running.length > 4 && !showAll}<button class="btn sm ghost" type="button" onclick={() => (showAll = true)}>And {check.running.length - 4} more</button>{/if}
					<label class="da-check"><input type="checkbox" bind:checked={cancel} /><span><b>Cancel {check.running.length === 1 ? 'it' : `these ${check.running.length}`} and tell the {brand ? 'creators' : 'brands'}</b>{#if due}<small>{brand ? `${inr(due)} on ${money.length} invoice${money.length === 1 ? ' is' : 's are'} still unpaid; pay ${money.length === 1 ? 'it' : 'them'} from Money first if you owe ${money.length === 1 ? 'it' : 'them'}.` : `Deleting doesn't cancel the ${inr(due)} brands owe you, but the reminders stop.`}</small>{/if}</span></label>
				</div>
			{:else if due}
				<p class="hint" style="margin:0">{brand ? `${inr(due)} is still unpaid on ${money.length} invoice${money.length === 1 ? '' : 's'}. Pay from Money first if you owe it.` : `Brands still owe you ${inr(due)}. Deleting doesn't cancel it, but the reminders stop.`}</p>
			{/if}
			<div class="da-go">
				<label class="f"><span class="da-eb">Type {check.confirm} to confirm</span><input class="inp" bind:value={typed} placeholder={check.confirm} autocomplete="off" /></label>
				<button class="btn da-btn" type="button" onclick={go} disabled={!ok || busy}>{#if busy}<span class="spinner"></span>{:else}<Icon name="x" />{/if}{brand ? 'Delete the company' : 'Delete my page'}</button>
			</div>
			<small class="da-note">It closes now and is erased for good on {erase}. Sign in before then and you can bring it back.{brand ? '' : ` Nobody else can take the name ${check.confirm} for 90 days.`}</small>
			<button class="btn sm ghost" type="button" onclick={() => ((open = false), (typed = ''), (cancel = false))}>Keep it</button>
		{/if}
	</section>
{/if}

<style>
	.da.open {
		display: grid;
		gap: 14px;
		padding: 22px 24px;
		background: color-mix(in oklab, var(--bad) 7%, var(--surface));
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--bad) 45%, var(--line));
	}
	.da-h {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 12px;
	}
	.da-h h2 {
		margin: 0;
		font: 400 28px/1.1 var(--f-serif, Georgia, serif);
	}
	.da-h small {
		font-size: 12.5px;
		color: color-mix(in oklab, var(--bad) 70%, var(--ink));
	}
	.da-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.da-grid > div {
		display: grid;
		gap: 4px;
	}
	.da-grid small,
	.da-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.da-run {
		display: grid;
		gap: 8px;
	}
	.da-run > .da-eb {
		color: var(--warn);
	}
	.da-tk {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2, var(--surface));
		box-shadow: inset 0 0 0 1px var(--line-strong, var(--line));
	}
	.da-tk span {
		display: grid;
		min-width: 0;
	}
	.da-tk small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.da-check {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 14px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--warn) 8%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--warn) 35%, transparent);
		cursor: pointer;
	}
	.da-check input {
		margin-top: 3px;
		accent-color: var(--accent);
	}
	.da-check span {
		display: grid;
		gap: 2px;
	}
	.da-check small {
		font-size: 12.5px;
		color: var(--ink-2);
	}
	.da-go {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		align-items: end;
	}
	/* Red, over the app's own button look. */
	.da .da-btn {
		height: 46px;
		border: 0 !important;
		background: var(--bad) !important;
		color: #fff !important;
		box-shadow: 4px 4px 0 color-mix(in oklab, var(--bad) 45%, #000) !important;
	}
	.da .da-btn:disabled {
		background: color-mix(in oklab, var(--bad) 28%, var(--surface)) !important;
		color: color-mix(in oklab, var(--bad) 55%, var(--ink-2)) !important;
		box-shadow: none !important;
		opacity: 1;
	}
	.da-note {
		font-size: 12.5px;
		color: var(--ink-2);
	}
	.da .ghost {
		justify-self: start;
	}
	@media (max-width: 640px) {
		.da-grid,
		.da-go {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
