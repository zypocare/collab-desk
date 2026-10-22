<script lang="ts">
	import { listApplications, sendApplications, setApplication } from '#lib/campaigns.svelte.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { compact, errMessage, fmt, inrS } from '#lib/util.ts';
	import type { CampaignApplication, CampaignBoard } from '#lib/types.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';

	// The creators who applied to an open brief: new ones first, a shortlist, and one tap to send
	// every shortlisted creator a request at the rate they asked.
	type Show = 'new' | 'shortlist' | 'no' | 'sent';
	let {
		id,
		max = 0,
		until = '',
		apps = $bindable([]),
		show = $bindable('new'),
		onsent
	}: {
		/** The campaign. */
		id: string;
		/** The top of the budget per creator (0 = no cap): asks above it show in red. */
		max?: number;
		/** When applications close ('YYYY-MM-DD'), for the empty state. */
		until?: string;
		apps?: CampaignApplication[];
		show?: Show;
		/** The campaign's board after requests went out. */
		onsent?: (b: CampaignBoard | null) => void;
	} = $props();

	let loaded = $state(false);
	let busy = $state(false);
	let fan = $state(false);
	async function load(first = false) {
		try {
			apps = await listApplications(id);
			// First look: land on the pile that has someone in it.
			if (first && !apps.some((a) => a.status === show)) show = (['new', 'shortlist', 'sent', 'no'] as const).find((k) => apps.some((a) => a.status === k)) ?? 'new';
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			loaded = true;
		}
	}
	$effect(() => {
		if (id) load(true);
	});

	const HUE: Record<Show, string> = { new: 'var(--bad)', shortlist: 'var(--ok)', no: 'var(--ink-3)', sent: 'var(--accent)' };
	const counts = $derived(Object.fromEntries((['new', 'shortlist', 'no', 'sent'] as const).map((k) => [k, apps.filter((a) => a.status === k).length])) as Record<Show, number>);
	const list = $derived(apps.filter((a) => a.status === show));
	const over = (a: CampaignApplication) => max > 0 && Number(a.rate) > max;
	const who = (a: CampaignApplication) => [a.followers != null ? compact(a.followers) : '', a.city, a.niche?.split(',')[0]?.trim()].filter(Boolean).join(' · ');
	const statusText = (a: CampaignApplication) => {
		if (over(a) && a.status !== 'sent') return `Above your ${inrS(max)} budget`;
		if (a.status === 'shortlist') return 'Shortlisted';
		if (a.status === 'no') return 'Not now';
		if (a.status === 'sent') return 'Request sent';
		return `Applied ${fmt(a.applied_at?.slice(0, 10))}`;
	};
	const tone = (a: CampaignApplication) =>
		over(a) && a.status !== 'sent' && a.status !== 'no' ? 'hot' : a.status === 'new' ? 'hot' : a.status === 'no' ? 'calm' : 'ok';

	// Moves an applicant between piles straight away; puts them back if the server says no.
	async function move(a: CampaignApplication, to: 'new' | 'shortlist' | 'no') {
		const was = a.status;
		apps = apps.map((x) => (x.application === a.application ? { ...x, status: to } : x));
		try {
			await setApplication(a.application, to);
		} catch (e) {
			apps = apps.map((x) => (x.application === a.application ? { ...x, status: was } : x));
			toast(errMessage(e), 'alert');
		}
	}

	async function send() {
		const n = counts.shortlist;
		if (!n) return;
		busy = true;
		try {
			const b = await sendApplications(id);
			onsent?.(b);
			await load();
			toast(`Sent ${n} request${n === 1 ? '' : 's'}`, 'check');
			show = 'sent';
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = false;
		}
	}
</script>

{#if !loaded}
	<div class="loader" style="min-height:20vh"><span class="ring"><span></span></span></div>
{:else}
	<div class="m-stages" role="tablist" aria-label="Filter applications">
		{#each [['new', 'New'], ['shortlist', 'Shortlist'], ['no', 'Not now'], ['sent', 'Sent']] as const as [k, label] (k)}
			{#if k !== 'sent' || counts.sent}
				<button role="tab" aria-selected={show === k} class:on={show === k} onclick={() => ((show = k), (fan = false))}><i class="dt" style="--hue:{HUE[k]}"></i>{label}<span>{counts[k]}</span></button>
			{/if}
		{/each}
	</div>

	<div class="tks m-plist">
		{#each fan ? list : list.slice(0, 6) as a, i (a.application)}
			<Ticket
				name={a.name}
				sub={who(a)}
				money={inrS(Number(a.rate) || 0)}
				moneySub={Number(a.rate) ? 'asks' : 'barter'}
				task={a.note ? `“${a.note}”` : ''}
				status={statusText(a)}
				tone={tone(a)}
				href="/brand/creator/{a.id}"
				{i}
			>
				{#if a.status === 'new'}
					<button class="btn" onclick={() => move(a, 'no')} aria-label="Not now for {a.name}">Not now</button>
					<button class="btn primary" onclick={() => move(a, 'shortlist')} aria-label="Shortlist {a.name}">Shortlist</button>
				{:else if a.status === 'shortlist' || a.status === 'no'}
					<button class="btn" onclick={() => move(a, 'new')} aria-label="Undo for {a.name}">Undo</button>
				{/if}
			</Ticket>
		{:else}
			<div class="clear hero-card glow m-none">
				<div class="mesh" aria-hidden="true"></div>
				<span class="clear-ic"><Icon name={apps.length ? 'inbox' : 'users'} /></span>
				{#if !apps.length}
					<b>No applications yet</b>
					<small>Listed creators who fit your brief can apply{until ? ` until ${fmt(until)}` : ''}. They show up here with the rate they ask.</small>
				{:else if show === 'new'}
					<b>All caught up</b>
					<small>Every application has been sorted. New ones show up here.</small>
				{:else if show === 'shortlist'}
					<b>Nobody shortlisted</b>
					<small>Shortlist the creators you like, then send them all a request at once.</small>
				{:else}
					<b>Nothing here</b>
					<small>Creators you set aside for now show up here.</small>
				{/if}
				{#if apps.length && show !== 'new' && counts.new}
					<div class="clear-acts"><button class="glass-chip" onclick={() => (show = 'new')}><Icon name="inbox" />See {counts.new} new</button></div>
				{/if}
			</div>
		{/each}
		{#if !fan && list.length > 6}<span class="cr-edge tk-edge" aria-hidden="true"></span>{/if}
	</div>
	{#if list.length > 6}<button class="cr-more" onclick={() => (fan = !fan)}>{fan ? 'Show less' : `+${list.length - 6} more`}</button>{/if}

	{#if counts.shortlist}
		<div class="imp-actions ca-go">
			<span class="imp-send"><b>{counts.shortlist} shortlisted</b> · each gets a request with this brief at the rate they asked</span>
			<button class="btn grad lg" disabled={busy} onclick={send}>{#if busy}<span class="spinner"></span>Sending{:else}<Icon name="send" />Send {counts.shortlist} request{counts.shortlist === 1 ? '' : 's'}{/if}</button>
		</div>
	{/if}
{/if}

<style>
	.ca-go > span {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		color: var(--ink-2);
	}
	@media (max-width: 760px) {
		.ca-go .btn {
			grid-column: 1 / -1;
		}
	}
</style>
