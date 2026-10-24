<script lang="ts">
	import { onMount } from 'svelte';
	import { STAGE, TARGETS, assignTat, hrs, loadTat, saveTat, type OpenClock, type StageStat, type Tat } from '#lib/turnaround.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage, todayIso } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Select from '#lib/components/Select.svelte';

	// Turnaround: every handoff waiting on the team (who holds it, how long is left), how fast each kind of
	// handoff got done this period against the one before, per owner, and the targets the admin sets.
	let tat = $state<Tat | null>(null);
	let days = $state('30');
	let error = $state('');
	async function load() {
		try {
			const to = todayIso();
			const from = new Date(Date.now() - (Number(days) - 1) * 864e5).toISOString().slice(0, 10);
			tat = await loadTat(from, to);
			error = '';
		} catch (e) {
			error = errMessage(e);
		}
	}
	onMount(load);
	$effect(() => {
		void days;
		load();
	});

	const ours = $derived((tat?.open ?? []).filter((c) => c.side === 'brand'));
	const theirs = $derived((tat?.open ?? []).filter((c) => c.side === 'creator'));
	const late = $derived(ours.filter((c) => c.overdue).length);
	const brandStages = $derived((tat?.stages ?? []).filter((s) => s.side === 'brand'));
	const creatorStages = $derived((tat?.stages ?? []).filter((s) => s.side === 'creator'));
	const onTime = $derived.by(() => {
		const xs = brandStages.filter((s) => s.on_time !== null && s.done > 0);
		const n = xs.reduce((a, s) => a + s.done, 0);
		return n ? Math.round(xs.reduce((a, s) => a + (s.on_time ?? 0) * s.done, 0) / n) : null;
	});
	const people = $derived((tat?.team ?? []).map((p) => ({ value: p.id, label: p.name || p.email })));
	const due = (c: OpenClock) => (c.paused ? 'Paused' : c.hours_left === null ? 'No due date' : c.overdue ? `${hrs(c.hours_left)} late` : `${hrs(c.hours_left)} left`);
	// Faster or slower than the period before (median hours).
	const trend = (s: StageStat) => (s.median === null || s.median_before === null || s.median_before === 0 ? null : Math.round(((s.median - s.median_before) / s.median_before) * 100));

	async function assign(c: OpenClock, who: 'assignee' | 'backup', id: string) {
		const cur = tat?.owners[c.collab] ?? { assignee: null, backup: null };
		const next = { ...cur, [who]: id || null };
		try {
			tat = await assignTat(c.collab, next.assignee, next.backup);
			toast(who === 'assignee' ? 'Owner set' : 'Backup set', 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}

	// The admin's targets.
	let editing = $state(false);
	let hours = $state<Record<string, number>>({});
	let skip = $state(true);
	let escalate = $state(true);
	let backup = $state('');
	let saving = $state(false);
	function edit() {
		if (!tat) return;
		hours = { ...tat.settings.hours };
		skip = tat.settings.skip_sundays;
		escalate = tat.settings.escalate;
		backup = tat.settings.backup?.id ?? '';
		editing = true;
	}
	async function save() {
		saving = true;
		try {
			await saveTat({ hours, skip_sundays: skip, escalate, backup: backup || null });
			await load();
			editing = false;
			toast('Turnaround targets saved', 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Turnaround · Miracle</title></svelte:head>

<div class="ta-bar">
	<Segmented label="Period" bind:value={days} options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: 'Year' }]} />
	{#if tat?.can_edit}<button class="btn" onclick={edit}><Icon name="gear" />Targets</button>{/if}
</div>

{#if error}<p class="err-box">{error}</p>{/if}
{#if !tat}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<section class="md-hero rv" aria-label="Turnaround now">
		<div class="mesh" aria-hidden="true"></div>
		<div class="md-main">
			<span class="bx-eb">Waiting on your team</span>
			<b class="md-big num">{ours.length}</b>
			<div class="md-sub">
				<span class="md-chip" class:down={late > 0}>{late ? `${late} past due` : 'Nothing past due'}</span>
				<span>{theirs.length} waiting on creators</span>
			</div>
		</div>
		<div class="md-tiles">
			<div class="md-tile"><small>On time</small><b class="num">{onTime === null ? '—' : `${onTime}%`}</b><span>handoffs done in the period</span></div>
			{#each brandStages.filter((s) => s.stage !== 'payment').slice(0, 3) as s (s.stage)}
				{@const t = trend(s)}
				<div class="md-tile"><small>{STAGE[s.stage].label}</small><b class="num">{hrs(s.median)}</b><span>{s.done ? `median · ${t === null ? 'no earlier data' : t <= 0 ? `${-t}% faster` : `${t}% slower`}` : 'nothing done yet'}</span></div>
			{/each}
		</div>
	</section>

	<section class="panel rv ta-sec" aria-labelledby="ta-open">
		<div class="panel-h"><h2 id="ta-open">Waiting now</h2><small>most urgent first{tat.can_edit ? ' · set who owns each collab and their backup' : ''}</small></div>
		{#if ours.length}
			<ul class="ta-list">
				{#each ours as c (c.clock)}
					<li class:late={c.overdue} class:paused={c.paused}>
						<div class="ta-what">
							<b>{STAGE[c.stage].label}</b>
							<a href="/brand/r/{encodeURIComponent(c.code)}">{c.creator} · {c.company} · {c.code}</a>
						</div>
						<span class="ta-due">{#if c.overdue}<Icon name="alert" />{:else}<Icon name="clock" />{/if}{due(c)}{#if c.alerted}<em>{c.alerted === 2 ? 'escalated' : 'owner told'}</em>{/if}</span>
						<div class="ta-who">
							{#if tat.can_edit && c.stage !== 'approval' && c.stage !== 'payment'}
								<Select size="sm" ariaLabel="Owner of {c.code}" value={tat.owners[c.collab]?.assignee ?? ''} options={[{ value: '', label: `Default (${c.owner?.name ?? 'admin'})` }, ...people]} onchange={(v) => assign(c, 'assignee', v)} />
								<Select size="sm" ariaLabel="Backup for {c.code}" value={tat.owners[c.collab]?.backup ?? ''} options={[{ value: '', label: `Backup: ${c.backup?.name ?? 'none'}` }, ...people]} onchange={(v) => assign(c, 'backup', v)} />
							{:else}
								<span><small>Owner</small>{c.owner?.name ?? '—'}</span>
								<span><small>Backup</small>{c.backup?.name ?? '—'}</span>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="hint ta-none">Nothing is waiting on your team. Every quote, draft, message and invoice has been answered.</p>
		{/if}
	</section>

	<div class="md-grid">
		<section class="panel rv ta-sec" aria-labelledby="ta-stages">
			<div class="panel-h"><h2 id="ta-stages">How fast, by handoff</h2><small>done in the period · median and the slowest 10%</small></div>
			<table class="ta-t">
				<thead><tr><th>Handoff</th><th>Done</th><th>Median</th><th>Slowest 10%</th><th>On time</th><th>Before</th></tr></thead>
				<tbody>
					{#each brandStages as s (s.stage)}
						{@const t = trend(s)}
						<tr>
							<td><b>{STAGE[s.stage].label}</b><small>{s.stage === 'payment' ? 'by the invoice due date' : `target ${hrs(tat.settings.hours[s.stage])}`}{s.overdue ? ` · ${s.overdue} late now` : ''}</small></td>
							<td class="num">{s.done}</td>
							<td class="num">{hrs(s.median)}</td>
							<td class="num">{hrs(s.p90)}</td>
							<td class="num">{s.on_time === null ? '—' : `${s.on_time}%`}</td>
							<td class="num" class:good={t !== null && t < 0} class:bad={t !== null && t > 0}>{s.median_before === null ? '—' : `${hrs(s.median_before)}${t === null ? '' : t <= 0 ? ' ↓' : ' ↑'}`}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if creatorStages.some((s) => s.done || s.open)}
				<p class="ta-their">On the creators' side: {creatorStages.map((s) => `${STAGE[s.stage].label.toLowerCase()} ${hrs(s.median)} median`).join(' · ')}.</p>
			{/if}
		</section>

		<section class="panel rv ta-sec" aria-labelledby="ta-people">
			<div class="panel-h"><h2 id="ta-people">By owner</h2><small>your team's handoffs</small></div>
			{#if tat.people.length}
				<table class="ta-t">
					<thead><tr><th>Owner</th><th>Done</th><th>Median</th><th>On time</th><th>Waiting</th></tr></thead>
					<tbody>
						{#each tat.people as p (p.person?.id)}
							<tr>
								<td><b>{p.person?.name ?? '—'}</b></td>
								<td class="num">{p.done}</td>
								<td class="num">{hrs(p.median)}</td>
								<td class="num">{p.on_time === null ? '—' : `${p.on_time}%`}</td>
								<td class="num" class:bad={p.overdue > 0}>{p.open}{p.overdue ? ` (${p.overdue} late)` : ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="hint ta-none">Numbers show here once handoffs are done.</p>
			{/if}
		</section>
	</div>

	<p class="hint ta-fine">
		Clocks run in India time{tat.settings.skip_sundays ? ', without Sundays' : ''}. {tat.settings.escalate ? 'Past due, the owner gets an email and a phone alert; still waiting well past due, the backup and the admin do too.' : 'Escalation is off: nobody is alerted about late handoffs.'}
	</p>
{/if}

{#if editing && tat}
	<div class="dialog-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (editing = false)}>
		<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ta-set">
			<h2 id="ta-set">Turnaround targets</h2>
			<p>How long each handoff may take before it counts as late. Invoices follow their own due date.</p>
			<div class="ta-hours">
				{#each TARGETS as k (k)}
					<label><span>{STAGE[k].label}<small>{STAGE[k].who}</small></span><input class="inp num" type="number" min="1" max="720" bind:value={hours[k]} />h</label>
				{/each}
			</div>
			<div class="switch-row"><div><b>Skip Sundays</b><small>A Sunday doesn't count against the clock.</small></div><input type="checkbox" class="tgl" bind:checked={skip} aria-label="Skip Sundays" /></div>
			<div class="switch-row"><div><b>Escalate late handoffs</b><small>The owner is told when it's past due; the backup and you when it's well past due.</small></div><input type="checkbox" class="tgl" bind:checked={escalate} aria-label="Escalate late handoffs" /></div>
			<div class="f"><label for="ta-bk">Team backup</label><Select id="ta-bk" value={backup} options={[{ value: '', label: 'You (the admin)' }, ...people]} onchange={(v) => (backup = v)} /></div>
			<div class="row"><button class="btn ghost" onclick={() => (editing = false)}>Cancel</button><button class="btn primary" onclick={save} disabled={saving}>{#if saving}<span class="spinner"></span>{/if}Save</button></div>
		</div>
	</div>
{/if}

<style>
	.ta-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 0 0 16px;
		flex-wrap: wrap;
	}
	.ta-sec {
		margin-bottom: 18px;
	}
	.ta-list {
		display: grid;
		margin: 0;
		padding: 0 20px 12px;
		list-style: none;
	}
	.ta-list li {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) auto minmax(0, 1.6fr);
		align-items: center;
		gap: 14px;
		padding: 12px 0;
		border-top: 1px solid var(--line);
	}
	.ta-list li:first-child {
		border-top: 0;
	}
	.ta-what {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.ta-what a {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 13px;
		color: var(--ink-3);
	}
	.ta-due {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
		font-size: 13px;
		font-weight: 650;
		color: var(--ink-2);
	}
	.ta-due :global(.ic) {
		width: 15px;
		height: 15px;
	}
	.ta-due em {
		padding: 1px 7px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--warn) 16%, transparent);
		color: var(--warn);
		font-size: 10.5px;
		font-style: normal;
	}
	li.late .ta-due {
		color: var(--bad);
	}
	li.paused {
		opacity: 0.6;
	}
	.ta-who {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		min-width: 0;
	}
	.ta-who > span {
		display: grid;
		font-size: 13.5px;
	}
	.ta-who small {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ta-t {
		width: calc(100% - 40px);
		margin: 0 20px 16px;
		border-collapse: collapse;
		font-size: 13.5px;
	}
	.ta-t th {
		padding: 0 8px 8px 0;
		text-align: left;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ta-t td {
		padding: 9px 8px 9px 0;
		border-top: 1px solid var(--line);
		vertical-align: top;
	}
	.ta-t td small {
		display: block;
		font-size: 12px;
		color: var(--ink-3);
	}
	.ta-t .good {
		color: var(--ok);
	}
	.ta-t .bad {
		color: var(--bad);
	}
	.ta-their,
	.ta-none {
		margin: 0 20px 18px;
		font-size: 13px;
		color: var(--ink-3);
	}
	.ta-fine {
		margin: 4px 0 24px;
	}
	.ta-hours {
		display: grid;
		gap: 8px;
		margin: 12px 0;
	}
	.ta-hours label {
		display: grid;
		grid-template-columns: 1fr 90px auto;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}
	.ta-hours label span {
		display: grid;
	}
	.ta-hours small {
		font-size: 12px;
		color: var(--ink-3);
	}
	.ta-hours input {
		height: 38px;
	}
	@media (max-width: 760px) {
		.ta-list {
			padding: 0 16px 8px;
		}
		.ta-list li {
			grid-template-columns: minmax(0, 1fr) auto;
		}
		.ta-who {
			grid-column: 1 / -1;
		}
		.ta-t {
			width: calc(100% - 32px);
			margin: 0 16px 14px;
			font-size: 12.5px;
		}
		.ta-t th:nth-child(4),
		.ta-t td:nth-child(4),
		.ta-t th:nth-child(6),
		.ta-t td:nth-child(6) {
			display: none;
		}
	}
</style>
