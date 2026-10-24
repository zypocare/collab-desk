<script lang="ts">
	import { ago, day, inr0, inrShort, label, num, STAGE_LABEL, STAGE_TAG } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import RecordHead from './RecordHead.svelte';
	import Notes from './Notes.svelte';

	// A brand (company) as kept in one creator's studio: its collabs, the logins that work for it, reviews and reports.
	let { id }: { id: string } = $props();

	type R = Record<string, any>;
	let b = $state<R | null>(null);
	let err = $state('');
	let tab = $state('overview');

	async function load() {
		const { data, error } = await supabase.rpc('admin_brand', { p_id: id });
		err = error ? errMessage(error) : '';
		if (!error) b = data as R;
	}
	$effect(() => {
		void id;
		b = null;
		tab = 'overview';
		load();
	});
</script>

{#if err}
	<p class="err">{err}</p>
{:else if !b}
	<div class="ld"><span class="spinner"></span></div>
{:else}
	<RecordHead
		crumb={{ label: 'Brands', href: href('brands') }}
		title={b.name}
		square
		color="#c2416f"
		bind:tab
		tabs={[
			{ id: 'overview', label: 'Overview' },
			{ id: 'trust', label: 'Reviews & reports', n: b.reviews.length + b.reports.length },
			{ id: 'notes', label: 'Notes & log', n: b.notes.length + b.audit.length }
		]}
	>
		{#snippet tags()}
			{#if b!.category}<span class="tag t-mute">{b!.category}</span>{/if}
			{#if b!.blocked}<span class="tag t-bad">Blocked by a creator</span>{/if}
		{/snippet}
		{#snippet sub()}
			<span>In <a href={href('creators', b!.creator.id)}>{b!.creator.name}</a>'s studio</span>
			{#if b!.instagram}<span>@{b!.instagram.replace(/^@/, '')}</span>{/if}
			{#if b!.website}<span>{b!.website}</span>{/if}
			<span>Added {day(b!.created_at)}</span>
		{/snippet}
	</RecordHead>

	<div class="rec">
		<div class="main">
			{#if tab === 'overview'}
				<section class="stats">
					<div class="card st"><small>Collabs</small><b class="mono">{num(b.stats.collabs)}</b><span>{num(b.stats.open)} open</span></div>
					<div class="card st"><small>Paid to the creator</small><b class="mono">{inr0(b.stats.paid)}</b><span>direct, no cut</span></div>
					<div class="card st"><small>Waiting to be paid</small><b class="mono">{inr0(b.stats.waiting)}</b><span>sent, not paid in full</span></div>
					<div class="card st"><small>Running retainers</small><b class="mono">{num(b.stats.retainers)}</b><span>monthly</span></div>
				</section>
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Collabs</h2><span class="muted sm">latest 50</span></div>
					{#if !b.collabs.length}<div class="card-empty">No collabs yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Collab</th><th>Stage</th><th class="r">Fee</th><th>Pay</th><th>Live date</th><th>Started</th></tr></thead>
							<tbody>{#each b.collabs as k (k.id)}<tr><td><a class="mono" href={href('collabs', k.id)}>{k.code}</a></td><td><span class="tag {STAGE_TAG[k.stage] ?? 't-mute'}">{STAGE_LABEL[k.stage] ?? k.stage}</span></td><td class="r mono">{inrShort(k.fee)}</td><td>{label(k.pay)}</td><td>{day(k.live)}</td><td>{day(k.at)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Brand logins working for it</h2></div>
					{#if !b.logins.length}<div class="card-empty">Nobody from the brand has signed in; the creator runs it by email.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Login</th><th>Workspace</th><th>Last active</th></tr></thead>
							<tbody>{#each b.logins as l (l.id + l.workspace)}<tr><td><a class="w5" href={href('brand-logins', l.id)}>{l.email}</a>{#if l.name}<small class="d">{l.name}</small>{/if}</td><td><a href={href('workspaces', l.workspace)}>{l.workspace_name}</a></td><td>{ago(l.last_active)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'trust'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Reviews the creator got from them</h2></div>
					{#if !b.reviews.length}<div class="card-empty">No reviews.</div>{:else}
						<table class="tbl"><tbody>{#each b.reviews as r, i (i)}<tr><td class="mono">{'★'.repeat(r.rating)}</td><td class="wr">{r.body}</td><td>{r.name}</td><td>{r.shown ? 'On page' : 'Hidden'}</td><td>{ago(r.at)}</td></tr>{/each}</tbody></table>
					{/if}
				</section>
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Reports about this brand</h2><a href={href('safety')}>Safety</a></div>
					{#if !b.reports.length}<div class="card-empty">No reports.</div>{:else}
						<table class="tbl"><tbody>{#each b.reports as r (r.id)}<tr><td>{r.by}</td><td>{label(r.reason)}</td><td><span class="tag {r.status === 'open' ? 't-bad' : 't-mute'}">{label(r.status)}</span></td><td>{ago(r.at)}</td></tr>{/each}</tbody></table>
					{/if}
				</section>
			{:else if tab === 'notes'}
				<Notes kind="brand" record={b.id} notes={b.notes} audit={b.audit} onsaved={(x) => b && ((b.notes = x.notes), (b.audit = x.audit))} />
			{/if}
		</div>
		<aside class="side">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Billing</h2></div>
				<dl class="kv">
					<div><dt>GSTIN</dt><dd class="mono">{b.gstin || '—'}</dd></div>
					<div><dt>PAN</dt><dd class="mono">{b.pan || '—'}</dd></div>
					<div><dt>State</dt><dd>{b.state || '—'}</dd></div>
					<div><dt>Country</dt><dd>{b.country || '—'} · {b.currency || 'INR'}</dd></div>
					<div><dt>Accounts email</dt><dd>{b.accounts_email || '—'}</dd></div>
				</dl>
			</section>
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
</style>
