<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, num, when } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';

	// Every scheduled job: when it runs, how its last runs went, and pause, resume or run now. What a job
	// runs is never shown here (it can name private settings).
	type J = { name: string; schedule: string; active: boolean; kind: string; switch: string | null; runs: number; failed: number; last: { status: string; start: string; end: string | null; message: string } | null };
	let jobs = $state<J[] | null>(null);
	let err = $state('');
	let busy = $state('');

	async function load() {
		const { data, error } = await supabase.rpc('admin_jobs');
		err = error ? errMessage(error) : '';
		if (!error) jobs = data as J[];
	}
	onMount(load);

	const WHAT: Record<string, string> = {
		'process-outbox': 'Sends queued emails and phone alerts', 'daily-digest': 'Morning digest for creators', 'payment-reminders': 'Polite payment reminders to brands',
		'instagram-sync': 'Followers, media and insights from Instagram', 'instagram-stories': 'Story stats from Instagram', 'usage-watch': 'Watches usage-rights end dates',
		'autopilot-nudges': 'Creator autopilot nudges', 'post-alerts': 'Alerts when a post should go live', 'auto-track-links': 'Sends brands their tracking links',
		'run-retainers': "Makes each month's retainer collab", 'pitch-followups': 'Follow-ups to pitched brands', 'instagram-publish': 'Publishes scheduled posts',
		'month-review': 'Monthly review alert', 'app-events-cleanup': 'Deletes app events older than 30 days', 'rebook-offers': 'Rebook offers to past brands',
		'payment-alerts': "Creator alerts about payments due", 'day-nudges': 'Friendly nudges through the day', 'pitch-sender': 'Sends approved pitches',
		'pitch-finder': 'Finds new brands to pitch', 'brand-autopilots': 'Runs each workspace’s autopilots', 'brief-digest': 'Digest of open briefs for creators',
		'erase-closed': 'Erases closed accounts after their wait', 'problems-cleanup': 'Deletes old problem reports', 'safety-cleanup': 'Deletes old safety events',
		'growth-checkup': 'Weekly growth checkup', 'page-views-cleanup': 'Deletes page views older than 400 days', 'brand-ai-usage-cleanup': 'Deletes brand AI counts after 60 days',
		'creator-alerts-cleanup': 'Deletes alerts after 90 days', 'competitor-watch': 'Scans competitor posts', 'tat-escalate': 'Escalates slow replies', 'tat-alerts-cleanup': 'Deletes old reply-time alerts'
	};

	async function setActive(j: J, on: boolean) {
		const reason = await askText(
			on
				? { title: `Resume ${j.name}?`, body: 'It runs on its schedule again.', ok: 'Resume', input: { label: 'Note (optional)' } }
				: { title: `Pause ${j.name}?`, body: `${WHAT[j.name] ?? 'This job'} stops until you resume it.`, ok: 'Pause', danger: true, input: { label: 'Why', required: true } }
		);
		if (reason === null) return;
		busy = j.name;
		const { data, error } = await supabase.rpc('admin_job_set', { p_name: j.name, p_active: on, p_reason: reason });
		busy = '';
		if (error) return toast(errMessage(error), true);
		jobs = data as J[];
		toast(on ? `${j.name} resumed` : `${j.name} paused`);
	}
	async function runNow(j: J) {
		const reason = await askText({ title: `Run ${j.name} now?`, body: `${WHAT[j.name] ?? 'It runs'} once, right away, as if its time had come. Switches still apply.`, ok: 'Run now', input: { label: 'Note (optional)' } });
		if (reason === null) return;
		busy = j.name;
		const { data, error } = await supabase.rpc('admin_job_run', { p_name: j.name, p_reason: reason });
		busy = '';
		if (error) return toast(errMessage(error), true);
		const r = data as { ok: boolean; error: string | null; jobs: J[] };
		jobs = r.jobs;
		toast(r.ok ? `${j.name} ran` : `${j.name} failed: ${r.error}`, !r.ok);
	}
	const KIND: Record<string, [string, string]> = { edge: ['Edge function', 't-info'], sql: ['Database', 't-acc'], cleanup: ['Cleanup', 't-mute'] };
	const paused = $derived((jobs ?? []).filter((j) => !j.active).length);
	const failing = $derived((jobs ?? []).filter((j) => j.failed).length);
</script>

<div class="jb">
	<header>
		<div class="eb">System</div>
		<h1>Scheduled jobs</h1>
		<p class="muted lead">{jobs ? `${jobs.length} jobs · ${paused} paused · ${failing} with failures in the last day` : ' '}</p>
	</header>
	{#if err}<p class="err">{err}</p>{/if}
	<div class="card tbl-wrap">
		{#if !jobs}
			<div class="ld"><span class="spinner"></span></div>
		{:else}
			<table class="tbl">
				<thead><tr><th>Job</th><th>Type</th><th>Schedule (UTC)</th><th>Last run</th><th class="r">Runs · failed (24h)</th><th>Switch</th><th><span class="sr">Actions</span></th></tr></thead>
				<tbody>
					{#each jobs as j (j.name)}
						<tr class:off={!j.active}>
							<td class="wr"><span class="mono w5">{j.name}</span><small class="d">{WHAT[j.name] ?? ''}</small></td>
							<td><span class="tag {KIND[j.kind]?.[1] ?? 't-mute'}">{KIND[j.kind]?.[0] ?? j.kind}</span></td>
							<td class="mono">{j.schedule}</td>
							<td>
								{#if j.last}<span class="tag {j.last.status === 'succeeded' ? 't-ok' : j.last.status === 'failed' ? 't-bad' : 't-info'}">{j.last.status}</span> <span class="muted" title={when(j.last.start)}>{ago(j.last.start)}</span>
									{#if j.last.status === 'failed' && j.last.message}<small class="d err-t">{j.last.message}</small>{/if}
								{:else}<span class="muted">Not run yet</span>{/if}
							</td>
							<td class="r mono">{num(j.runs)} · <span class:bad={j.failed}>{num(j.failed)}</span></td>
							<td>{#if j.switch}<a href={href('controls')} class="mono">{j.switch}</a>{:else}<span class="muted">—</span>{/if}</td>
							<td class="ra">
								{#if j.active}<button class="btn sm" disabled={busy === j.name} onclick={() => setActive(j, false)}>Pause</button>{:else}<button class="btn sm pri" disabled={busy === j.name} onclick={() => setActive(j, true)}>Resume</button>{/if}
								<button class="btn sm" disabled={busy === j.name} onclick={() => runNow(j)}>Run now</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</div>

<style>
	.jb { display: flex; flex-direction: column; gap: 16px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.lead { margin-top: 4px; font-size: 13.5px; }
	.ld { padding: 40px; display: grid; place-items: center; }
	.wr { white-space: normal; min-width: 200px; }
	.w5 { font-weight: 500; }
	.d { display: block; font-size: 12px; color: var(--ink-3); font-family: var(--f-body); }
	.err-t { color: var(--bad); max-width: 320px; white-space: normal; }
	.bad { color: var(--bad); font-weight: 600; }
	tr.off td { background: #fbf8f2; }
	.ra { display: flex; gap: 6px; justify-content: flex-end; }
</style>
