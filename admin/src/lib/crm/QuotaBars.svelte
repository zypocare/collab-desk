<script lang="ts" module>
	export type Quota = { key: string; label: string; used: number; daily: number | null; unit: string; resets: string; note?: string };
	/** The three daily quotas from admin_quotas(): email (main + backup accounts), Workers AI, Gemini. */
	export function quotasOf(q: Record<string, any>): Quota[] {
		const L = q.limits;
		const main = L.mail_main?.daily ?? null;
		const backup = L.mail_backup?.daily ?? null;
		const mailDaily = main === null && backup === null ? null : (main ?? 0) + (backup ?? 0);
		return [
			{ key: 'mail', label: 'Emails', used: Number(q.mail.sent), daily: mailDaily, unit: 'emails', resets: q.mail.resets, note: backup ? `main ${main ?? '?'} + backup ${backup}` : '' },
			{ key: 'ai_neurons', label: 'Workers AI', used: Number(q.ai.neurons), daily: L.ai_neurons?.daily ?? null, unit: 'neurons', resets: q.ai.resets },
			{ key: 'gemini', label: 'Gemini backup', used: Number(q.ai.gemini), daily: L.gemini?.daily ?? null, unit: 'requests', resets: q.ai.resets }
		];
	}
</script>

<script lang="ts">
	import { num } from '../format.ts';

	// One bar per daily quota: used, left and when it resets. Amber past 70%, red past 90%.
	let { quotas, onset }: { quotas: Quota[]; onset?: (key: string) => void } = $props();
	const pct = (q: Quota) => (q.daily ? Math.min(100, Math.round((q.used / q.daily) * 100)) : 0);
	const tone = (q: Quota) => (!q.daily ? 'none' : pct(q) >= 90 ? 'bad' : pct(q) >= 70 ? 'warn' : 'ok');
	const at = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
</script>

<div class="qb">
	{#each quotas as q (q.key)}
		<div class="q">
			<div class="qt"><b>{q.label}</b><span class="muted">resets {at(q.resets)}</span></div>
			<div class="bar t-{tone(q)}" role="meter" aria-label="{q.label} used today" aria-valuemin="0" aria-valuemax={q.daily ?? 0} aria-valuenow={q.used}><span style:width="{pct(q)}%"></span></div>
			<div class="qn">
				<span class="mono"><b>{num(q.used)}</b>{#if q.daily !== null}{` / ${num(q.daily)}`}{/if}{` ${q.unit} used`}</span>
				{#if q.daily !== null}
					<span class="left t-{tone(q)} mono">{num(Math.max(0, q.daily - q.used))} left</span>
				{:else if onset}
					<button class="lnk" onclick={() => onset(q.key)}>Set the daily limit</button>
				{:else}
					<span class="muted">limit not set</span>
				{/if}
			</div>
			{#if q.note}<small class="muted">{q.note}</small>{/if}
		</div>
	{/each}
</div>

<style>
	.qb { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px 22px; padding: 14px 16px 16px; }
	.q { display: grid; gap: 6px; min-width: 0; }
	.qt { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
	.qt b { font-weight: 600; }
	.qt span { font-size: 12px; }
	.bar { height: 10px; border-radius: 5px; background: #f1efeb; overflow: hidden; }
	.bar span { display: block; height: 100%; border-radius: 5px; background: var(--ok); min-width: 2px; }
	.bar.t-warn span { background: #e9b949; }
	.bar.t-bad span { background: var(--bad); }
	.bar.t-none span { background: var(--line-strong); }
	.qn { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
	.qn b { font-weight: 600; }
	.left { font-weight: 600; }
	.left.t-ok { color: var(--ok); }
	.left.t-warn { color: var(--warn); }
	.left.t-bad { color: var(--bad); }
	small { font-size: 11.5px; }
</style>
