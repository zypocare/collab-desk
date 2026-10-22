<script lang="ts">
	import { ago, igOf, inr, num, ROOT, siteOf, STATUS_LABEL } from './format.ts';
	import type { Creator, Status } from './types.ts';
	import Icon from './Icon.svelte';

	let { creators, busyId, onset }: { creators: Creator[] | null; busyId: number | null; onset: (c: Creator, to: Status) => void } = $props();

	const FILTERS: { id: Status | 'all'; label: string }[] = [
		{ id: 'all', label: 'All' },
		{ id: 'active', label: 'Active' },
		{ id: 'pending', label: 'Waiting' },
		{ id: 'paused', label: 'Paused' },
		{ id: 'declined', label: 'Declined' }
	];
	let filter = $state<Status | 'all'>('all');
	const count = (id: Status | 'all') => (creators ?? []).filter((c) => id === 'all' || c.status === id).length;
	const rows = $derived((creators ?? []).filter((c) => filter === 'all' || c.status === filter));
</script>

{#if !creators}
	<div class="cr-load"><span class="spinner"></span></div>
{:else}
	<div class="chips" role="group" aria-label="Show">
		{#each FILTERS as f (f.id)}
			<button class="chip" aria-pressed={filter === f.id} onclick={() => (filter = f.id)}>{f.label}<i>{count(f.id)}</i></button>
		{/each}
	</div>

	{#if !rows.length}
		<p class="cr-none">No creators here.</p>
	{:else}
		<div class="tbl-wrap">
			<table class="tbl">
				<thead>
					<tr><th>Creator</th><th>Status</th><th class="r">Collabs</th><th class="r">Brands</th><th class="r">Paid</th><th class="r">Team</th><th>Instagram</th><th>Last active</th><th class="r"><span class="sr">Actions</span></th></tr>
				</thead>
				<tbody>
					{#each rows as c (c.id)}
						<tr>
							<td class="who">
								<b>{c.name || '—'}</b>
								{#if c.slug}<a href={siteOf(c.slug)} target="_blank" rel="noopener">{c.slug}.{ROOT}</a>{:else}<small>Picking a link</small>{/if}
								{#if c.handle}<a class="h" href={igOf(c.handle)} target="_blank" rel="noopener">@{c.handle}</a>{/if}
							</td>
							<td data-l="Status"><span class="pill {c.status}">{STATUS_LABEL[c.status] ?? c.status}</span></td>
							<td class="r num" data-l="Collabs">{num(c.collabs)}</td>
							<td class="r num" data-l="Brands">{num(c.brands)}</td>
							<td class="r num" data-l="Paid">{inr(c.paid)}</td>
							<td class="r num" data-l="Team">{num(c.team)}</td>
							<td data-l="Instagram">{#if c.instagram}<span class="yes"><Icon name="check" />Connected</span>{:else}<span class="no">Not yet</span>{/if}</td>
							<td data-l="Last active">{ago(c.last_active)}</td>
							<td class="r acts"><div class="acts-in">
								{#if c.status === 'pending'}
									<button class="neo grad sm" disabled={busyId === c.id} onclick={() => onset(c, 'active')}>Approve</button>
									<button class="neo dark sm" disabled={busyId === c.id} onclick={() => onset(c, 'declined')}>Decline</button>
								{:else if c.status === 'active'}
									<button class="neo dark sm" disabled={busyId === c.id} onclick={() => onset(c, 'paused')}>Pause</button>
								{:else if c.status === 'paused'}
									<button class="neo white sm" disabled={busyId === c.id} onclick={() => onset(c, 'active')}>Resume</button>
								{:else}
									<button class="neo dark sm" disabled={busyId === c.id} onclick={() => onset(c, 'active')}>Approve</button>
								{/if}
							</div></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
{/if}

<style>
	.cr-load { min-height: 260px; display: grid; place-items: center; }
	.cr-none { color: var(--ink-3); padding: 20px 0; }
	.chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
	.chip { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px; border: 1px solid var(--line-strong); background: none; color: var(--ink-2); font-weight: 600; font-size: 14px; }
	.chip i { font-style: normal; font-size: 12px; color: var(--ink-3); }
	.chip[aria-pressed='true'] { background: var(--ink); color: var(--bg); border-color: var(--ink); box-shadow: 3px 3px 0 var(--g2); }
	.chip[aria-pressed='true'] i { color: var(--bg); opacity: .7; }

	.tbl-wrap { border: 1px solid var(--line); background: var(--surface); overflow-x: auto; }
	.tbl { width: 100%; border-collapse: collapse; font-size: 14.5px; }
	.tbl th { padding: 13px 16px; text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--ink-3); border-bottom: 1px solid var(--line-strong); white-space: nowrap; }
	.tbl td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; white-space: nowrap; }
	.tbl tbody tr:last-child td { border-bottom: 0; }
	.tbl tbody tr:hover td { background: color-mix(in oklab, var(--surface-2) 60%, transparent); }
	.r { text-align: right !important; }
	.who { display: grid; gap: 1px; white-space: normal !important; min-width: 200px; }
	.who b { font-size: 15px; }
	.who a { font-size: 13px; color: var(--ink-2); text-decoration-color: var(--line-strong); text-underline-offset: 3px; overflow-wrap: anywhere; }
	.who a.h { color: var(--ink-3); }
	.yes { display: inline-flex; align-items: center; gap: 5px; color: var(--ok); font-weight: 600; }
	.yes :global(.ic) { width: 15px; height: 15px; stroke-width: 2.6; }
	.no { color: var(--ink-3); }
	.acts-in { display: flex; gap: 10px; justify-content: flex-end; }

	/* Phone: each creator is a card, numbers in a two-column list. */
	@media (max-width: 760px) {
		.tbl-wrap { border: 0; background: none; overflow: visible; }
		.tbl thead { display: none; }
		.tbl, .tbl tbody { display: grid; gap: 14px; }
		.tbl tr { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line-strong); background: var(--surface); }
		.tbl tbody tr:hover td { background: none; }
		.tbl td { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 16px; border-bottom: 1px solid var(--line); white-space: normal; }
		.tbl td[data-l]::before { content: attr(data-l); font-size: 12.5px; color: var(--ink-3); }
		.tbl td.r { text-align: right; }
		.tbl td.who { grid-column: 1 / -1; display: grid; padding: 16px; min-width: 0; }
		.tbl td.acts { grid-column: 1 / -1; padding: 14px 16px 16px; border-bottom: 0; }
		.tbl td.acts .acts-in { flex: 1; }
		.tbl td.acts .neo { flex: 1; }
		.tbl td[data-l='Status'], .tbl td[data-l='Instagram'], .tbl td[data-l='Last active'] { grid-column: 1 / -1; }
	}
</style>
