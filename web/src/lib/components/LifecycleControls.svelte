<script lang="ts">
	import type { Collab } from '../types';
	import { changeLifecycle, studio } from '../studio.svelte';
	import { ask } from '../confirm.svelte';
	import { fmt, stageLabel, todayIso } from '../util';
	import { portal } from '../portal';
	import DatePicker from './DatePicker.svelte';
	let { c }: { c: Collab } = $props();
	let mode = $state<'paused' | 'cancelled' | null>(null);
	let reason = $state('');
	let resumeOn = $state<string | null>(null);
	let busy = $state(false);
	const held = $derived(c.stage === 'paused' || c.stage === 'cancelled');
	function open(value: 'paused' | 'cancelled') { reason = ''; resumeOn = null; mode = value; }
	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!mode || !reason.trim() || (mode === 'paused' && resumeOn && resumeOn < todayIso())) return;
		busy = true;
		try { if (await changeLifecycle(c, mode, reason, resumeOn)) mode = null; } finally { busy = false; }
	}
	async function resume() {
		if (!(await ask({ title: c.stage === 'cancelled' ? 'Reopen this collaboration?' : 'Resume this collaboration?', body: `Returns to ${stageLabel(c.resume_stage ?? 'request')}. Review deadlines and schedule held posts again. Existing billing stays in place.`, ok: 'Resume' }))) return;
		busy = true;
		try { await changeLifecycle(c, 'resume'); } finally { busy = false; }
	}
</script>

{#if held}
	<div class="warn-box" role="status">
		<b>{stageLabel(c.stage)}{c.resume_on ? ` · review ${fmt(c.resume_on)}` : ''}</b>
		<span>{c.lifecycle_reason}</span>
		<span>Production reminders and scheduled posting are suspended. Invoices and payment history are retained.</span>
	</div>
{/if}
{#if studio.me?.team_role !== 'accountant'}
	<div class="row" style="margin-top:12px;flex-wrap:wrap">
		{#if held}<button class="btn sm" disabled={busy} onclick={resume}>{c.stage === 'cancelled' ? 'Reopen collaboration' : 'Resume collaboration'}</button>{/if}
		{#if !['paused', 'cancelled', 'wrapped', 'declined'].includes(c.stage)}<button class="btn sm" onclick={() => open('paused')}>Pause collaboration</button>{/if}
		{#if !['cancelled', 'wrapped', 'declined'].includes(c.stage)}<button class="btn sm ghost danger" onclick={() => open('cancelled')}>Cancel collaboration</button>{/if}
	</div>
{/if}

{#if mode}
	<div class="dialog-scrim" role="presentation" use:portal>
		<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="lifecycle-title">
			<form onsubmit={submit}>
				<h2 id="lifecycle-title">{mode === 'paused' ? 'Pause' : 'Cancel'} collaboration</h2>
				<p>{mode === 'paused' ? 'Work reminders and scheduled posts will be held until you resume and review the schedule.' : 'Production stops. Review existing invoices separately to settle completed work or arrange refunds.'} The brand can see the reason.</p>
				<div class="f"><label for="lifecycle-reason">Reason</label><textarea id="lifecycle-reason" class="inp" rows="3" maxlength="600" required bind:value={reason}></textarea></div>
				{#if mode === 'paused'}<div class="f"><label for="lifecycle-review">Review on (optional)</label><DatePicker id="lifecycle-review" bind:value={resumeOn} /><small>This is a reminder to review; resuming is manual.</small></div>{/if}
				{#if resumeOn && resumeOn < todayIso()}<p class="err">Choose today or a future review date.</p>{/if}
				<div class="row"><button type="button" class="btn ghost" disabled={busy} onclick={() => (mode = null)}>Keep current stage</button><button type="submit" class="btn primary" disabled={busy || !reason.trim() || !!(resumeOn && resumeOn < todayIso())}>{mode === 'paused' ? 'Pause collaboration' : 'Cancel collaboration'}</button></div>
			</form>
		</div>
	</div>
{/if}
