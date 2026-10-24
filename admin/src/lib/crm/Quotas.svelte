<script lang="ts">
	import { onMount } from 'svelte';
	import { num } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';
	import QuotaBars, { quotasOf } from './QuotaBars.svelte';

	// Today's free daily allowances (email, Workers AI, Gemini): used, left, the last 14 days, and the
	// limits, which admins set for email because they depend on the sending service.
	type R = Record<string, any>;
	let q = $state<R | null>(null);
	let err = $state('');

	async function load() {
		const { data, error } = await supabase.rpc('admin_quotas');
		err = error ? errMessage(error) : '';
		if (!error) q = data as R;
	}
	onMount(load);

	async function setLimit(key: string) {
		if (!q) return;
		const keys = key === 'mail' ? ['mail_main', 'mail_backup'] : [key];
		for (const k of keys) {
			const l = q.limits[k];
			const v = await askText({
				title: `${l.label}: daily limit`,
				body: l.note,
				ok: 'Save',
				input: { label: `${l.unit} a day (leave empty if there's no limit or no account)`, value: l.daily === null ? '' : String(l.daily) }
			});
			if (v === null) return;
			const daily = v.trim() === '' ? null : Math.max(0, Math.round(Number(v.replace(/[^\d.]/g, '')) || 0));
			const { data, error } = await supabase.rpc('admin_quota_set', { p_key: k, p_daily: daily, p_reason: '' });
			if (error) return toast(errMessage(error), true);
			q = data as R;
		}
		toast('Limit saved');
	}

	const quotas = $derived(q ? quotasOf(q) : []);
	const maxNeurons = $derived(q ? Math.max(1, q.limits.ai_neurons?.daily ?? 0, ...q.days.map((d: R) => Number(d.neurons))) : 1);
	const maxMail = $derived(q ? Math.max(1, ...q.days.map((d: R) => Number(d.mail_sent) + Number(d.mail_failed))) : 1);
	const dayLabel = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
</script>

<div class="qp">
	<header>
		<div class="eb">System</div>
		<h1>Daily quotas</h1>
		<p class="muted lead">How much of each free daily allowance is used today, and what's left. Switch a feature off for everyone in <a href={href('controls')}>Switches & limits</a> if one runs low.</p>
	</header>
	{#if err}<p class="err">{err}</p>{/if}
	{#if !q}
		<div class="ld"><span class="spinner"></span></div>
	{:else}
		<section class="card">
			<div class="card-h"><h2 class="card-t">Today</h2><button class="btn sm" onclick={load}>Refresh</button></div>
			<QuotaBars {quotas} onset={setLimit} />
		</section>

		<div class="two">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Email today</h2><button class="lnk" onclick={() => setLimit('mail')}>Change limits</button></div>
				<dl class="kv">
					<div><dt>Sent since midnight</dt><dd>{num(q.mail.sent)}</dd></div>
					<div><dt>Sent in 24 hours</dt><dd>{num(q.mail.sent_24h)}</dd></div>
					<div><dt>Failed today</dt><dd>{num(q.mail.failed)}{#if q.mail.failed} · <a href={href('outbox')}>see them</a>{/if}</dd></div>
					<div><dt>Waiting to send</dt><dd>{num(q.mail.waiting)}</dd></div>
					<div><dt>Main account</dt><dd>{q.limits.mail_main.daily === null ? 'limit not set' : num(q.limits.mail_main.daily) + ' a day'}</dd></div>
					<div><dt>Backup account</dt><dd>{q.limits.mail_backup.daily === null ? 'none set' : num(q.limits.mail_backup.daily) + ' a day'}</dd></div>
				</dl>
				<p class="card-b muted sm">Sign-in code emails go through Supabase's own email setting and aren't counted here; they use the same account's limit if it's the same mailbox.</p>
			</section>

			<section class="card">
				<div class="card-h"><h2 class="card-t">AI today</h2><a href={href('ai-usage')}>AI usage by account</a></div>
				<dl class="kv">
					<div><dt>Workers AI used</dt><dd>{num(q.ai.neurons)} neurons in {num(q.ai.calls)} calls</dd></div>
					<div><dt>By creators</dt><dd>{num(q.ai.creators)} neurons</dd></div>
					<div><dt>By brands</dt><dd>{num(q.ai.brands)} neurons</dd></div>
					<div><dt>Gemini backup</dt><dd>{num(q.ai.gemini)} requests</dd></div>
					<div><dt>Each account's own share</dt><dd>creator 9,000 · brand 3,000 neurons a day (<a href={href('controls')}>lower one</a>)</dd></div>
				</dl>
				{#if q.ai.top.length}
					<div class="top">
						<small class="muted">Using the most today</small>
						{#each q.ai.top.slice(0, 5) as t (t.side + t.id)}
							<a class="tr" href={t.side === 'creator' ? href('creators', t.id) : href('workspaces', t.id)}><span>{t.name}</span><span class="mono muted">{num(t.neurons)}</span></a>
						{/each}
					</div>
				{/if}
			</section>
		</div>

		<section class="card">
			<div class="card-h"><h2 class="card-t">Last 14 days</h2><span class="muted sm">Workers AI against its daily allowance; emails sent and failed</span></div>
			<div class="hist">
				<div class="hrow h"><span>Day</span><span>Workers AI (neurons)</span><span class="r">Gemini</span><span>Emails</span></div>
				{#each [...q.days].reverse() as d (d.day)}
					{@const n = Number(d.neurons)}
					{@const lim = q.limits.ai_neurons?.daily ?? 0}
					<div class="hrow">
						<span class="mono">{dayLabel(d.day)}</span>
						<span class="hb"><span class="bar"><span class:over={lim && n > lim} style:width="{(n / maxNeurons) * 100}%"></span>{#if lim}<i style:left="{(lim / maxNeurons) * 100}%"></i>{/if}</span><span class="mono">{num(n)}</span></span>
						<span class="mono r">{num(d.gemini)}</span>
						<span class="hb"><span class="bar mail"><span style:width="{(Number(d.mail_sent) / maxMail) * 100}%"></span><span class="fail" style:width="{(Number(d.mail_failed) / maxMail) * 100}%"></span></span><span class="mono">{num(d.mail_sent)}{#if Number(d.mail_failed)} · <b class="bad">{num(d.mail_failed)} failed</b>{/if}</span></span>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.qp { display: flex; flex-direction: column; gap: 16px; }
	.eb { font-size: 12.5px; color: var(--ink-3); margin-bottom: 3px; }
	h1 { font-size: 24px; }
	.lead { margin-top: 4px; font-size: 13.5px; }
	.ld { padding: 60px; display: grid; place-items: center; }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 16px; align-items: start; }
	.sm { font-size: 12px; }
	.top { padding: 8px 16px 12px; border-top: 1px solid var(--line-soft); display: grid; gap: 2px; }
	.top small { font-size: 11.5px; margin-bottom: 4px; }
	.tr { display: flex; justify-content: space-between; font-size: 13px; color: var(--ink); padding: 3px 0; }
	.hist { padding: 6px 16px 14px; }
	.hrow { display: grid; grid-template-columns: 70px 1fr 64px 1fr; gap: 14px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--line-soft); font-size: 12.5px; }
	.hrow.h { color: var(--ink-3); font-size: 12px; }
	.hrow:last-child { border-bottom: 0; }
	.r { text-align: right; }
	.hb { display: grid; grid-template-columns: 1fr 120px; gap: 8px; align-items: center; }
	.bar { position: relative; display: flex; height: 10px; background: #f1efeb; border-radius: 5px; overflow: hidden; }
	.bar > span { display: block; height: 100%; background: var(--accent); }
	.bar > span.over { background: var(--bad); }
	.bar.mail > span { background: var(--info); }
	.bar.mail > span.fail { background: var(--bad); }
	.bar i { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--ink-2); }
	.bad { color: var(--bad); font-weight: 600; }
	@media (max-width: 640px) {
		.hrow { grid-template-columns: 60px 1fr; }
		.hrow > span:nth-child(3), .hrow.h > span:nth-child(3) { display: none; }
		.hrow > span:nth-child(4) { grid-column: 2; }
		.hb { grid-template-columns: 1fr 96px; }
	}
</style>
