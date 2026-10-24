<script lang="ts">
	import { ago, day, inr, inr0, inrShort, label, num, STATUS_TAG } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';
	import RecordHead from './RecordHead.svelte';
	import Notes from './Notes.svelte';

	let { id }: { id: string } = $props();

	type R = Record<string, any>;
	let w = $state<R | null>(null);
	let err = $state('');
	let tab = $state('overview');

	async function load() {
		const { data, error } = await supabase.rpc('admin_workspace', { p_owner: id });
		err = error ? errMessage(error) : '';
		if (!error) w = data as R;
	}
	$effect(() => {
		void id;
		w = null;
		tab = 'overview';
		load();
	});

	async function remove(m: R) {
		if (!w) return;
		const reason = await askText({
			title: `Take ${m.name || m.email} out of ${w.name}?`,
			body: 'The same as the workspace Admin removing them: they lose this team\'s companies. Their own workspace and other teams stay.',
			ok: 'Remove',
			danger: true,
			input: { label: 'Why (for the audit trail)', required: true }
		});
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_workspace_remove', { p_owner: id, p_email: m.email, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		w = data as R;
		toast('Removed from the workspace');
	}
	async function approvals() {
		if (!w) return;
		const on = !w.approval_on;
		let limit: number | null = null;
		if (on) {
			const v = await askText({
				title: 'Turn approvals on?',
				body: 'Quotes over this amount need an Approver in the team to say yes before they go ahead.',
				ok: 'Turn on',
				input: { label: 'Approve quotes over (₹)', value: String(w.approval_limit ?? 50000), required: true }
			});
			if (v === null) return;
			limit = Math.max(0, Math.round(Number(v.replace(/[^\d.]/g, '')) || 0));
		}
		const reason = await askText({ title: on ? 'Why turn approvals on?' : 'Turn approvals off?', body: on ? undefined : 'Quotes go ahead without an Approver.', ok: on ? 'Save' : 'Turn off', input: { label: 'Reason (for the audit trail)' } });
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_workspace_approvals', { p_owner: id, p_on: on, p_limit: limit, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		w = data as R;
		toast(on ? 'Approvals on' : 'Approvals off');
	}

	// Pausing a workspace is pausing its owner's brand account: everyone working in it is stopped.
	async function pause(on: boolean) {
		if (!w) return;
		const reason = await askText(
			on
				? { title: `Pause ${w.name}?`, body: 'Nobody working in this workspace can send requests, messages or open briefs until you resume, and the owner gets an email saying the account is paused while we look into it.', ok: 'Pause', danger: true, input: { label: 'Why (for the audit trail)', required: true } }
				: { title: `Resume ${w.name}?`, body: 'The workspace works as before.', ok: 'Resume', input: { label: 'Note (optional)' } }
		);
		if (reason === null) return;
		const { error } = await supabase.rpc('admin_brand_login_set', { p_id: id, p_action: on ? 'pause' : 'resume', p_reason: reason });
		if (error) return toast(errMessage(error), true);
		await load();
		toast(on ? 'Paused, the owner got an email' : 'Resumed');
	}

	const AUTOS: [string, string, (a: R) => string][] = [
		['shortlist', 'Shortlist', (a) => (a.shortlist_max ? `up to ${a.shortlist_max}` : '')],
		['followup', 'Follow-up', (a) => (a.followup_days ? `after ${a.followup_days} days` : '')],
		['draftcheck', 'Draft check', () => ''],
		['negotiate', 'Negotiate', (a) => (a.negotiate_over ? `quotes ${a.negotiate_over}% over budget` : '')],
		['rebook', 'Rebook', () => ''],
		['watch', 'Competitor watch', (a) => (a.watch_max ? `${a.watch_max} a week` : '')]
	];
	async function mode(key: string, name: string, to: string, el: HTMLSelectElement) {
		if (!w) return;
		const was = w.autopilots?.[key] ?? 'off';
		const reason = await askText({
			title: `${name}: ${to === 'off' ? 'off' : to === 'ask' ? 'ask first' : 'automatic'} for ${w.name}?`,
			body: to === 'off' ? 'It stops for this workspace straight away. Its Admin can turn it back on.' : 'The same as the workspace changing it in Autopilots.',
			ok: 'Change',
			danger: to === 'off',
			input: { label: 'Why (for the audit trail)', required: true }
		});
		if (reason === null) return void (el.value = was);
		const { data, error } = await supabase.rpc('admin_workspace_autopilot', { p_owner: id, p_key: key, p_mode: to, p_reason: reason });
		if (error) {
			el.value = was;
			return toast(errMessage(error), true);
		}
		w = data as R;
		toast(`${name} changed`);
	}
	const ITEM_TAG: Record<string, string> = { pending: 't-warn', done: 't-ok', auto: 't-info', skipped: 't-mute' };
</script>

{#if err}
	<p class="err">{err}</p>
{:else if !w}
	<div class="ld"><span class="spinner"></span></div>
{:else}
	<RecordHead
		crumb={{ label: 'Brand workspaces', href: href('workspaces') }}
		title={w.name}
		square
		color="#c2416f"
		bind:tab
		tabs={[
			{ id: 'overview', label: 'Overview' },
			{ id: 'auto', label: 'Autopilots', n: w.items.length ? `${w.item_counts.pending ?? 0} waiting` : '' },
			{ id: 'campaigns', label: 'Campaigns & pools', n: w.campaigns.length + w.pools.length },
			{ id: 'notes', label: 'Notes & log', n: w.notes.length + w.audit.length }
		]}
	>
		{#snippet tags()}
			<span class="tag {STATUS_TAG[w!.state]}">{label(w!.state)}</span>
			{#if w!.approval_on}<span class="tag t-acc">Approvals over {inrShort(w!.approval_limit)}</span>{/if}
		{/snippet}
		{#snippet sub()}
			<span>Owner <a href={href('brand-logins', w!.id)}>{w!.owner_email}</a></span>
			{#if w!.category}<span>{w!.category}{w!.city ? ' · ' + w!.city : ''}</span>{/if}
			{#if w!.instagram}<span>@{w!.instagram.username} · {num(w!.instagram.followers)}</span>{/if}
			<span>Set up {day(w!.joined)}</span>
		{/snippet}
		{#snippet actions()}
			<button class="btn" onclick={approvals}>{w!.approval_on ? 'Turn approvals off' : 'Turn approvals on'}</button>
			{#if w!.state === 'active' && w!.has_profile}<button class="btn warn" onclick={() => pause(true)}>Pause workspace</button>{/if}
			{#if w!.state === 'paused'}<button class="btn pri" onclick={() => pause(false)}>Resume</button>{/if}
		{/snippet}
	</RecordHead>

	<div class="rec">
		<div class="main">
			{#if tab === 'overview'}
				<section class="stats">
					<div class="card st"><small>Collabs</small><b class="mono">{num(w.stats.collabs)}</b><span>{num(w.stats.open)} open</span></div>
					<div class="card st"><small>Paid to creators</small><b class="mono">{inr0(w.stats.paid)}</b><span>directly, no cut</span></div>
					<div class="card st"><small>Companies</small><b class="mono">{num(w.stats.companies)}</b><span>across creators</span></div>
					<div class="card st"><small>AI calls (30 days)</small><b class="mono">{num(w.stats.ai_30d)}</b><span>brand AI</span></div>
				</section>
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">People <span class="mono muted">{w.members.length}</span></h2></div>
					<table class="tbl">
						<thead><tr><th>Name</th><th>Role</th><th>Joined</th><th>Last active</th><th><span class="sr">Actions</span></th></tr></thead>
						<tbody>
							{#each w.members as m (m.email)}
								<tr>
									<td>{#if m.id}<a class="w5" href={href('brand-logins', m.id)}>{m.name || m.email}</a>{:else}<span class="w5">{m.name || m.email}</span>{/if}<small class="d">{m.email}</small></td>
									<td><span class="tag {m.role === 'owner' ? 't-acc' : m.role === 'admin' ? 't-info' : 't-mute'}">{label(m.role)}</span></td>
									<td>{m.joined ? day(m.joined) : 'Invited ' + day(m.invited)}</td>
									<td>{ago(m.last_active)}</td>
									<td class="r">{#if m.role !== 'owner'}<button class="btn sm" onclick={() => remove(m)}>Remove</button>{/if}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</section>
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Approvals</h2><span class="muted sm">{w.approval_on ? `Quotes over ${inr(w.approval_limit)} wait for an Approver` : 'Off'}</span></div>
					{#if !w.approvals.length}<div class="card-empty">No quotes have needed approval.</div>{:else}
						<table class="tbl"><tbody>{#each w.approvals as a (a.id)}<tr><td class="mono">{inr(a.total)}</td><td><span class="tag {a.status === 'approved' ? 't-ok' : a.status === 'pending' ? 't-warn' : 't-mute'}">{label(a.status)}</span></td><td>{ago(a.at)}</td></tr>{/each}</tbody></table>
					{/if}
				</section>
			{:else if tab === 'auto'}
				<section class="card">
					<div class="card-h"><h2 class="card-t">Autopilots</h2><span class="muted sm">{w.autopilots ? 'updated ' + ago(w.autopilots.updated_at) : 'Never set up'}</span></div>
					<ul class="auto">
						{#each AUTOS as [k, name, extra] (k)}
							{@const v = w.autopilots?.[k] ?? 'off'}
							<li>
								<label class="sr" for="ap-{k}">{name}</label>
								<select id="ap-{k}" class="mode m-{v}" value={v} onchange={(e) => mode(k, name, e.currentTarget.value, e.currentTarget)}>
									<option value="off">Off</option><option value="ask">Ask first</option><option value="auto">Automatic</option>
								</select>
								<span>{name}{#if v !== 'off' && w.autopilots && extra(w.autopilots)}<span class="muted"> · {extra(w.autopilots)}</span>{/if}</span>
							</li>
						{/each}
					</ul>
				</section>
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">What the autopilots did</h2>
						<span class="cts">{#each Object.entries(w.item_counts) as [s, n] (s)}<span class="tag {ITEM_TAG[s] ?? 't-mute'}">{num(Number(n))} {s === 'pending' ? 'waiting' : s}</span>{/each}</span>
					</div>
					{#if !w.items.length}<div class="card-empty">Nothing yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>When</th><th>Agent</th><th>What</th><th>Status</th></tr></thead>
							<tbody>{#each w.items as i (i.id)}<tr><td>{ago(i.at)}</td><td><span class="tag t-acc">{label(i.kind)}</span></td><td class="wr">{i.title}</td><td><span class="tag {ITEM_TAG[i.status] ?? 't-mute'}">{i.status === 'pending' ? 'Waiting' : label(i.status)}</span></td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'campaigns'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Campaigns</h2></div>
					{#if !w.campaigns.length}<div class="card-empty">No campaigns.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Name</th><th>Status</th><th class="r">Budget</th><th class="r">Creators</th><th class="r">Applications</th></tr></thead>
							<tbody>{#each w.campaigns as k (k.id)}<tr><td><a class="w5" href={href('campaigns', k.id)}>{k.name}</a></td><td><span class="tag {k.open ? 't-ok' : k.status === 'sent' ? 't-info' : 't-mute'}">{k.open ? 'Open brief' : label(k.status)}</span></td><td class="r mono">{inrShort(k.budget)}</td><td class="r mono">{num(k.creators)}</td><td class="r mono">{num(k.applications)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Pools</h2></div>
					{#if !w.pools.length}<div class="card-empty">No pools.</div>{:else}
						<table class="tbl"><tbody>{#each w.pools as p (p.id)}<tr><td class="w5">{p.name}</td><td class="r mono">{num(p.creators)} creators</td></tr>{/each}</tbody></table>
					{/if}
				</section>
			{:else if tab === 'notes'}
				<Notes kind="workspace" record={w.id} notes={w.notes} audit={w.audit} onsaved={(x) => w && ((w.notes = x.notes), (w.audit = x.audit))} />
			{/if}
		</div>
		<aside class="side">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Trust</h2><a href={href('safety')}>Safety</a></div>
				<dl class="kv">
					<div><dt>Reports</dt><dd>{num(w.stats.reports)}</dd></div>
					<div><dt>Blocked by</dt><dd>{num(w.stats.blocked_by)} creator{w.stats.blocked_by === 1 ? '' : 's'}</dd></div>
					<div><dt>State</dt><dd>{label(w.state)}</dd></div>
				</dl>
			</section>
			{#if tab !== 'notes'}
				<section class="card">
					<div class="card-h"><h2 class="card-t">Latest note</h2><button class="lnk" onclick={() => (tab = 'notes')}>{w.notes.length ? 'All notes' : 'Add one'}</button></div>
					{#if w.notes[0]}<p class="card-b ln">{w.notes[0].body}<small class="muted">{w.notes[0].admin} · {ago(w.notes[0].at)}</small></p>{:else}<div class="card-empty">No notes yet.</div>{/if}
				</section>
			{/if}
		</aside>
	</div>
{/if}

<style>
	.ld { padding: 60px; display: grid; place-items: center; }
	.rec { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; margin-top: 20px; }
	.main { flex: 999 1 540px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.side { flex: 1 1 290px; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
	.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
	.st { padding: 12px 14px; display: grid; gap: 2px; }
	.st small { color: var(--ink-3); font-size: 12px; }
	.st b { font-size: 20px; font-weight: 500; }
	.st span { color: var(--ink-3); font-size: 11.5px; }
	.sm { font-size: 12px; }
	.w5 { font-weight: 500; }
	.d { display: block; font-size: 12px; color: var(--ink-3); }
	.wr { white-space: normal; min-width: 220px; }
	.cts { display: flex; flex-wrap: wrap; gap: 6px; }
	.auto { list-style: none; margin: 0; padding: 6px 16px 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 4px 16px; }
	.auto li { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 13px; border-bottom: 1px solid var(--line-soft); }
	.auto .tag { min-width: 76px; justify-content: center; }
	.mode { height: 28px; border-radius: 6px; border: 1px solid var(--line-strong); background: var(--surface); font-size: 12.5px; font-weight: 500; padding: 0 6px; min-width: 104px; }
	.mode.m-auto { background: var(--ok-bg); color: var(--ok); border-color: #bfe0cc; }
	.mode.m-ask { background: var(--warn-bg); color: var(--warn); border-color: #ecd6a8; }
	.ln { font-size: 13px; white-space: pre-wrap; display: grid; gap: 6px; }
</style>
