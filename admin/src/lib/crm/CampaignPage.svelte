<script lang="ts">
	import { ago, day, inr, inrShort, label, num, STAGE_LABEL, STAGE_TAG } from '../format.ts';
	import { href } from '../router.svelte.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { askText, toast } from '../ui.svelte.ts';
	import RecordHead from './RecordHead.svelte';
	import Notes from './Notes.svelte';

	// A brand workspace's campaign: its brief, the creators asked, who applied and the collabs it made.
	let { id }: { id: string } = $props();

	type R = Record<string, any>;
	let k = $state<R | null>(null);
	let err = $state('');
	let tab = $state('overview');

	async function load() {
		const { data, error } = await supabase.rpc('admin_campaign', { p_id: id });
		err = error ? errMessage(error) : '';
		if (!error) k = data as R;
	}
	$effect(() => {
		void id;
		k = null;
		tab = 'overview';
		load();
	});

	async function close() {
		if (!k) return;
		const reason = await askText({
			title: `Close the open brief “${k.name}”?`,
			body: 'Creators stop seeing it and can no longer apply. Applications so far stay.',
			ok: 'Close brief',
			danger: true,
			input: { label: 'Why (for the audit trail)', required: true }
		});
		if (reason === null) return;
		const { data, error } = await supabase.rpc('admin_campaign_close', { p_id: id, p_reason: reason });
		if (error) return toast(errMessage(error), true);
		k = data as R;
		toast('Brief closed');
	}
	const APP_TAG: Record<string, string> = { new: 't-warn', shortlist: 't-info', sent: 't-ok', no: 't-mute' };
</script>

{#if err}
	<p class="err">{err}</p>
{:else if !k}
	<div class="ld"><span class="spinner"></span></div>
{:else}
	<RecordHead
		crumb={{ label: 'Campaigns', href: href('campaigns') }}
		title={k.name}
		square
		color="#7a4f00"
		bind:tab
		tabs={[
			{ id: 'overview', label: 'Overview' },
			{ id: 'applications', label: 'Applications', n: k.applications.length },
			{ id: 'notes', label: 'Notes & log', n: k.notes.length + k.audit.length }
		]}
	>
		{#snippet tags()}
			{#if k!.open}<span class="tag t-ok">Open brief</span>{/if}
			<span class="tag t-mute">{label(k!.status)}</span>
		{/snippet}
		{#snippet sub()}
			<span>Workspace <a href={href('workspaces', k!.workspace.id)}>{k!.workspace.name}</a></span>
			{#if k!.pool}<span>Pool: {k!.pool.name}</span>{/if}
			<span>Made {day(k!.created_at)}</span>
			{#if k!.sent_at}<span>Sent {ago(k!.sent_at)}</span>{/if}
		{/snippet}
		{#snippet actions()}
			{#if k!.open}<button class="btn warn" onclick={close}>Close open brief</button>{/if}
		{/snippet}
	</RecordHead>

	<div class="rec">
		<div class="main">
			{#if tab === 'overview'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Creators in this campaign <span class="mono muted">{k.creators.length}</span></h2></div>
					{#if !k.creators.length}<div class="card-empty">No creators added yet.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Creator</th><th>Status</th><th>Collab</th><th class="r">Fee</th><th>Added</th></tr></thead>
							<tbody>
								{#each k.creators as x (x.id)}
									<tr>
										<td>{#if x.creator_id}<a class="w5" href={href('creators', x.creator_id)}>{x.creator}</a>{:else}{x.creator}{/if}</td>
										<td>{label(x.status)}</td>
										<td>{#if x.collab_id}<a href={href('collabs', x.collab_id)}><span class="tag {STAGE_TAG[x.stage] ?? 't-mute'}">{STAGE_LABEL[x.stage] ?? 'Open'}</span></a>{:else}—{/if}</td>
										<td class="r mono">{inrShort(x.fee)}</td>
										<td>{day(x.at)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					{/if}
				</section>
				{#if k.brief}
					<section class="card"><div class="card-h"><h2 class="card-t">Brief</h2></div><p class="card-b brief">{typeof k.brief === 'string' ? k.brief : JSON.stringify(k.brief, null, 2)}</p></section>
				{/if}
			{:else if tab === 'applications'}
				<section class="card tbl-wrap">
					<div class="card-h"><h2 class="card-t">Who applied to the open brief</h2></div>
					{#if !k.applications.length}<div class="card-empty">No applications.</div>{:else}
						<table class="tbl">
							<thead><tr><th>Creator</th><th class="r">Asked</th><th>Note</th><th>Status</th><th>Applied</th></tr></thead>
							<tbody>{#each k.applications as a (a.id)}<tr><td>{#if a.creator_id}<a class="w5" href={href('creators', a.creator_id)}>{a.creator}</a>{:else}—{/if}</td><td class="r mono">{inrShort(a.rate)}</td><td class="wr">{a.note || '—'}</td><td><span class="tag {APP_TAG[a.status] ?? 't-mute'}">{label(a.status)}</span>{#if a.collab_id} <a href={href('collabs', a.collab_id)}>collab</a>{/if}</td><td>{ago(a.at)}</td></tr>{/each}</tbody>
						</table>
					{/if}
				</section>
			{:else if tab === 'notes'}
				<Notes kind="campaign" record={k.id} notes={k.notes} audit={k.audit} onsaved={(x) => k && ((k.notes = x.notes), (k.audit = x.audit))} />
			{/if}
		</div>
		<aside class="side">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Budget</h2></div>
				<dl class="kv">
					<div><dt>Total</dt><dd>{k.budget_total ? inr(k.budget_total) : '—'}</dd></div>
					<div><dt>Per creator</dt><dd>{k.budget_min || k.budget_max ? `${inrShort(k.budget_min)} – ${inrShort(k.budget_max)}` : '—'}</dd></div>
					<div><dt>Open until</dt><dd>{day(k.open_until)}</dd></div>
					<div><dt>Applications</dt><dd>{num(k.applications.length)}</dd></div>
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
	.w5 { font-weight: 500; }
	.wr { white-space: normal; min-width: 200px; }
	.brief { font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
