<script lang="ts">
	import { ago, day, inrShort, label, num, STAGE_LABEL, STAGE_TAG, STATUS_TAG } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';
	import Icon from '../Icon.svelte';
	import RecordHead from './RecordHead.svelte';
	import Notes from './Notes.svelte';

	let { id }: { id: string } = $props();

	type R = Record<string, any>;
	let b = $state<R | null>(null);
	let err = $state('');
	let tab = $state('overview');

	async function load() {
		const { data, error } = await supabase.rpc('admin_brand_login', { p_id: id });
		err = error ? errMessage(error) : '';
		if (!error) b = data as R;
	}
	$effect(() => {
		void id;
		b = null;
		tab = 'overview';
		load();
	});

	async function pause(on: boolean) {
		if (!b) return;
		const reason = await askText(
			on
				? { title: `Pause ${b.company?.name ?? b.email}?`, body: 'Nobody working in this login\'s own workspace can send requests, messages or open briefs until you resume, and they get an email saying the account is paused while we look into it. Other workspaces this login is in aren\'t affected.', ok: 'Pause', danger: true, input: { label: 'Why (for the audit trail)', required: true } }
				: { title: `Resume ${b.company?.name ?? b.email}?`, body: 'Their workspace works as before.', ok: 'Resume', input: { label: 'Note (optional)' } }
		);
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_brand_login_set', { p_id: id, p_action: on ? 'pause' : 'resume', p_reason: reason });
		if (error) return toast(errMessage(error), true);
		b = data as R;
		toast(on ? 'Paused, they got an email' : 'Resumed');
	}
</script>

{#if err}
	<p class="err">{err}</p>
{:else if !b}
	<div class="ld"><span class="spinner"></span></div>
{:else}
	<RecordHead
		crumb={{ label: 'Brand logins', href: href('brand-logins') }}
		title={b.email}
		color="#1c539f"
		bind:tab
		tabs={[
			{ id: 'overview', label: 'Overview' },
			{ id: 'collabs', label: 'Collabs', n: b.collabs.length },
			{ id: 'companies', label: 'Companies', n: b.companies.length },
			{ id: 'trust', label: 'Support & safety', n: b.support.length + b.reports.length },
			{ id: 'notes', label: 'Notes & log', n: b.notes.length + b.audit.length }
		]}
	>
		{#snippet tags()}
			<span class="tag {STATUS_TAG[b!.state]}">{label(b!.state)}</span>
			{#if b!.workspaces.length > 1}<span class="tag t-info">In {b!.workspaces.length} workspaces</span>{/if}
		{/snippet}
		{#snippet sub()}
			{#if b!.name}<span>{b!.name}</span>{/if}
			{#if b!.company}<span>{b!.company.name}{b!.company.role ? ' · ' + b!.company.role : ''}</span>{/if}
			<span>Joined {day(b!.joined)}</span>
			<span>Last sign-in {ago(b!.last_sign_in)}</span>
		{/snippet}
		{#snippet actions()}
			{#if b!.company && b!.state === 'active'}<button class="btn warn" onclick={() => pause(true)}><Icon name="pause" />Pause account</button>{/if}
			{#if b!.state === 'paused'}<button class="btn pri" onclick={() => pause(false)}><Icon name="play" />Resume</button>{/if}
		{/snippet}
	</RecordHead>

	<div class="rec">
		<div class="main">
			{#if tab === 'overview'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Workspaces this login can open</h2><span class="muted sm">Each client's data is sealed from the others</span></div>
					<table class="tbl">
						<thead><tr><th>Workspace</th><th>Role</th><th class="r">Companies here</th><th></th></tr></thead>
						<tbody>
							{#each b.workspaces as w (w.id)}
								<tr><td><a class="w5" href={href('workspaces', w.id)}>{w.name}</a></td><td><span class="tag {w.role === 'owner' ? 't-acc' : 't-mute'}">{label(w.role)}</span></td><td class="r mono">{num(w.companies)}</td><td class="r">{#if w.id === b.active_workspace}<span class="tag t-ok">Working in now</span>{/if}</td></tr>
							{/each}
						</tbody>
					</table>
				</section>
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Latest collabs</h2><button class="lnk" onclick={() => (tab = 'collabs')}>All</button></div>
					{#if !b.collabs.length}<div class="card-empty">No collabs yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Code</th><th>Creator</th><th>Stage</th><th class="r">Fee</th><th>Created</th></tr></thead>
							<tbody>{#each b.collabs.slice(0, 6) as k (k.id)}<tr><td class="mono">{k.code}</td><td>{#if k.creator_id}<a href={href('creators', k.creator_id)}>{k.creator}</a>{:else}—{/if}</td><td><span class="tag {STAGE_TAG[k.stage] ?? 't-mute'}">{STAGE_LABEL[k.stage] ?? k.stage}</span></td><td class="r mono">{inrShort(k.fee)}</td><td>{day(k.at)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'collabs'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Collabs with companies this login is in</h2><span class="muted sm">latest 25</span></div>
					{#if !b.collabs.length}<div class="card-empty">No collabs yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Code</th><th>Creator</th><th>Stage</th><th class="r">Fee</th><th>Pay</th><th>Created</th></tr></thead>
							<tbody>{#each b.collabs as k (k.id)}<tr><td class="mono">{k.code}</td><td>{#if k.creator_id}<a href={href('creators', k.creator_id)}>{k.creator}</a>{:else}—{/if}</td><td><span class="tag {STAGE_TAG[k.stage] ?? 't-mute'}">{STAGE_LABEL[k.stage] ?? k.stage}</span></td><td class="r mono">{inrShort(k.fee)}</td><td>{label(k.pay)}</td><td>{day(k.at)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'companies'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Companies</h2><span class="muted sm">A company is kept in one creator's studio</span></div>
					{#if !b.companies.length}<div class="card-empty">Not linked to any company yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Company</th><th>Creator</th><th>Workspace</th></tr></thead>
							<tbody>{#each b.companies as x (x.id)}<tr><td class="w5">{x.name}</td><td>{#if x.creator_id}<a href={href('creators', x.creator_id)}>{x.creator}</a>{:else}—{/if}</td><td><a href={href('workspaces', x.workspace)}>{b.workspaces.find((w: R) => w.id === x.workspace)?.name ?? 'Open'}</a></td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'trust'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Support tickets</h2><a href={href('support')}>Open support</a></div>
					{#if !b.support.length}<div class="card-empty">No tickets.</div>{:else}
						<table class="tbl"><tbody>{#each b.support as t (t.id)}<tr><td class="mono">#{t.number}</td><td>{t.subject}</td><td><span class="tag t-mute">{label(t.status)}</span></td><td>{ago(t.at)}</td></tr>{/each}</tbody></table>
					{/if}
				</section>
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Reports about this login</h2><a href={href('safety')}>Open safety</a></div>
					{#if !b.reports.length}<div class="card-empty">No reports.</div>{:else}
						<table class="tbl"><tbody>{#each b.reports as r (r.id)}<tr><td>{r.by}</td><td>{label(r.reason)}</td><td><span class="tag {r.status === 'open' ? 't-bad' : 't-mute'}">{label(r.status)}</span></td><td>{ago(r.at)}</td></tr>{/each}</tbody></table>
					{/if}
				</section>
			{:else if tab === 'notes'}
				<Notes kind="brand_login" record={b.id} notes={b.notes} audit={b.audit} onsaved={(x) => b && ((b.notes = x.notes), (b.audit = x.audit))} />
			{/if}
		</div>
		<aside class="side">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Details</h2></div>
				<dl class="kv">
					<div><dt>Email</dt><dd>{b.email}</dd></div>
					{#if b.name}<div><dt>Name</dt><dd>{b.name}</dd></div>{/if}
					{#if b.phone}<div><dt>Phone</dt><dd class="mono">{b.phone}</dd></div>{/if}
					{#if b.company}
						<div><dt>Own company</dt><dd>{b.company.name}</dd></div>
						<div><dt>Category</dt><dd>{b.company.category || '—'}</dd></div>
						{#if b.company.city}<div><dt>City</dt><dd>{b.company.city}</dd></div>{/if}
						{#if b.company.website}<div><dt>Website</dt><dd>{b.company.website}</dd></div>{/if}
						{#if b.company.instagram}<div><dt>Instagram</dt><dd>@{b.company.instagram}</dd></div>{/if}
						{#if b.company.gstin}<div><dt>GSTIN</dt><dd class="mono">{b.company.gstin}</dd></div>{/if}
						{#if b.company.goals?.length}<div><dt>Goals</dt><dd>{b.company.goals.join(', ')}</dd></div>{/if}
					{:else}
						<div><dt>Own company</dt><dd>None; works in teammates' workspaces</dd></div>
					{/if}
					{#if b.instagram}<div><dt>Connected IG</dt><dd>@{b.instagram.username} · {num(b.instagram.followers)}</dd></div>{/if}
					<div><dt>Blocked by</dt><dd>{num(b.blocked_by)} creator{b.blocked_by === 1 ? '' : 's'}</dd></div>
				</dl>
			</section>
			{#if tab !== 'notes'}
				<section class="card">
					<div class="card-h"><h2 class="card-t">Latest note</h2><button class="lnk" onclick={() => (tab = 'notes')}>{b.notes.length ? 'All notes' : 'Add one'}</button></div>
					{#if b.notes[0]}<p class="card-b ln">{b.notes[0].body}<small class="muted">{b.notes[0].admin} · {ago(b.notes[0].at)}</small></p>{:else}<div class="card-empty">No notes yet.</div>{/if}
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
	.sm { font-size: 12px; }
	.w5 { font-weight: 500; }
	.ln { font-size: 13px; white-space: pre-wrap; display: grid; gap: 6px; }
</style>
