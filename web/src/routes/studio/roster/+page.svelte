<script lang="ts">
	import { onMount } from 'svelte';
	import { loadRoster, setDealPct, setSettled, setSplit, useCreator, type RosterCreator, type RosterDeal } from '#lib/agency.svelte.ts';
	import { rosterDeck } from '#lib/agencyDeck.ts';
	import { studio } from '#lib/studio.svelte.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { compact, errMessage, fmt, inr, inrS } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';

	// Agency mode: every creator she manages at once, her commission on their deals (tracking only),
	// and a pitch deck for a brand from the creators she picks.
	let roster = $state<RosterCreator[]>([]);
	let loaded = $state(false);
	let error = $state('');
	let picked = $state<Set<number>>(new Set());
	let brand = $state('');
	let brief = $state('');
	let making = $state(false);
	let linkBusy = $state(false);
	let liveDecks = $state<{ id: string; token: string; brand_name: string; views: number; created_at: string }[]>([]);
	let deckLeads = $state<{ id: string; brand_name: string; contact: string; selected_handles: string[]; message: string; created_at: string }[]>([]);
	onMount(async () => {
		try {
			roster = await loadRoster();
			const [dRes, qRes] = await Promise.all([
				supabase.from('roster_decks').select('id, token, brand_name, views, created_at').order('created_at', { ascending: false }).limit(10),
				supabase.from('roster_deck_inquiries').select('id, brand_name, contact, selected_handles, message, created_at').order('created_at', { ascending: false }).limit(15)
			]);
			if (!dRes.error) liveDecks = (dRes.data as typeof liveDecks) ?? [];
			if (!qRes.error) deckLeads = (qRes.data as typeof deckLeads) ?? [];
		} catch (e) {
			error = errMessage(e);
		}
		loaded = true;
	});
	// Each deal at its own percentage: the one it was agreed at, not today's rate.
	const ledger = $derived(
		roster.flatMap((r) => r.deals.map((d) => {
			const commission = Math.round((Number(d.fee) * Number(d.pct)) / 100);
			return { r, d, commission, net: Number(d.fee) - commission };
		}))
	);
	const totals = $derived(ledger.reduce((a, x) => ({ gross: a.gross + Number(x.d.fee), commission: a.commission + x.commission, open: a.open + (x.d.settled ? 0 : x.commission) }), { gross: 0, commission: 0, open: 0 }));
	function toggle(id: number) {
		const n = new Set(picked);
		if (n.has(id)) n.delete(id);
		else n.add(id);
		picked = n;
	}
	async function pct(r: RosterCreator, v: string) {
		const n = Math.max(0, Math.min(50, Number(v) || 0));
		try {
			await setSplit(r.id, n);
			// Paid deals are locked at the old rate on the server; reload to show their terms.
			roster = await loadRoster();
			toast(`${n}% from now on. Deals already paid keep their own rate.`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	async function dealPct(d: RosterDeal, v: string) {
		const n = Math.max(0, Math.min(50, Number(v) || 0));
		try {
			await setDealPct(d.id, n);
			d.pct = n;
			d.term = 'deal';
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	async function settle(r: RosterCreator, id: string, on: boolean) {
		await setSettled(r.id, id, on).catch((e) => toast(errMessage(e), 'alert'));
		const d = r.deals.find((x) => x.id === id);
		if (d) d.settled = on;
	}
	async function createLiveDeck() {
		if (!brand.trim() || !picked.size) return;
		linkBusy = true;
		try {
			const selected = roster.filter((r) => picked.has(r.id)).map((r) => ({
				name: r.name,
				handle: r.handle,
				niche: r.niche,
				city: r.city,
				photo: r.photo,
				followers: r.followers,
				engagement: r.engagement,
				avg_views: r.avg_views,
				site_url: r.site_url,
				rates: r.rates
			}));
			const { data, error: err } = await supabase.rpc('roster_deck_create', {
				p_brand: brand.trim(),
				p_brief: brief.trim(),
				p_agency: studio.settings?.display_name || studio.me?.email || '',
				p_creators: selected
			});
			if (err) throw err;
			const created = data as { id: string; token: string; brand_name: string; views: number; created_at: string };
			liveDecks = [created, ...liveDecks];
			const url = `${location.origin}/deck/${created.token}`;
			copyText(url, 'Live pitch deck link copied! Send it to the brand.');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			linkBusy = false;
		}
	}
	async function deck() {
		if (!brand.trim() || !picked.size) return;
		making = true;
		try {
			await rosterDeck({ brand: brand.trim(), brief: brief.trim(), from: studio.me?.email ?? 'your manager', creators: roster.filter((r) => picked.has(r.id)) });
		} finally {
			making = false;
		}
	}
</script>

<svelte:head><title>Roster · Miracle</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Agency · {roster.length} creator{roster.length === 1 ? '' : 's'}</div>
		<h1>Your <em>roster</em></h1>
		<p>Everyone you manage, their deals and your commission. Open a creator to work in their studio.</p>
	</div>
</header>

{#if !loaded}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else if error}
	<div class="err-box">{error}</div>
{:else if roster.length < 2}
	<div class="clear hero-card glow m-none">
		<div class="mesh" aria-hidden="true"></div>
		<span class="clear-ic"><Icon name="users" /></span>
		<b>Manage more than one creator?</b>
		<small>Ask each creator to add you as a manager in Settings › Team. Everyone you manage shows up here, with one-tap switching between their studios.</small>
	</div>
{:else}
	<section class="tks bk-tks ro-list">
		{#each roster as r, i (r.id)}
			<Ticket
				name={r.name}
				sub={[r.niche?.split(',')[0]?.trim(), r.handle ? `@${r.handle.replace(/^@+/, '')}` : ''].filter(Boolean).join(' · ')}
				money={r.followers != null ? compact(r.followers) : '—'}
				moneySub="followers"
				task={`${r.open} open deal${r.open === 1 ? '' : 's'}${r.due ? ` · ${inrS(r.due)} to collect` : ''}${r.week ? ` · ${r.week} going live this week` : ''}`}
				status={r.requests ? `${r.requests} new request${r.requests === 1 ? '' : 's'}` : 'All caught up'}
				tone={r.requests ? 'hot' : 'ok'}
				onopen={() => useCreator(r.id, '/studio', r.slug)}
				{i}
			>
				<label class="ro-pick"><input type="checkbox" class="cbx" checked={picked.has(r.id)} onchange={() => toggle(r.id)} aria-label="Add {r.name} to the deck" />Deck</label>
				<button class="btn primary" onclick={() => useCreator(r.id, '/studio', r.slug)}>Open</button>
			</Ticket>
		{/each}
	</section>

	<div class="ro-grid">
		<section class="panel rv ro-deck" aria-labelledby="ro-deck-t">
			<div class="panel-h"><h2 id="ro-deck-t">Pitch deck</h2><small>{picked.size ? `${picked.size} picked` : 'Tick "Deck" on the creators to include'}</small></div>
			<div class="ro-b">
				<div class="f"><label for="ro-brand">For which brand</label><input class="inp" id="ro-brand" placeholder="e.g. Kora Botanicals" bind:value={brand} /></div>
				<div class="f"><label for="ro-brief">What they want <span class="hint">(optional)</span></label><textarea class="inp" id="ro-brief" rows="2" placeholder="e.g. Festive skincare launch, women 22-35 in Bengaluru and Mumbai" bind:value={brief}></textarea></div>
				<div style="display:flex;gap:8px;flex-wrap:wrap">
					<button class="btn grad" onclick={createLiveDeck} disabled={linkBusy || !brand.trim() || !picked.size}>{#if linkBusy}<span class="spinner"></span>{:else}<Icon name="link" />{/if}Create live pitch link</button>
					<button class="btn" onclick={deck} disabled={making || !brand.trim() || !picked.size}>{#if making}<span class="spinner"></span>{:else}<Icon name="download" />{/if}Download PDF</button>
				</div>
				{#if liveDecks.length}
					<div style="display:grid;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
						<small class="hint">Live pitch links ({liveDecks.length})</small>
						{#each liveDecks as d (d.id)}
							<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2)">
								<div><b>{d.brand_name}</b> <small class="hint">· {d.views} view{d.views === 1 ? '' : 's'}</small></div>
								<div style="display:flex;gap:6px">
									<button type="button" class="btn sm" onclick={() => copyText(`${location.origin}/deck/${d.token}`, 'Pitch link copied')}><Icon name="copy" />Copy</button>
									<a class="btn sm" href="/deck/{d.token}" target="_blank" rel="noopener">Open</a>
								</div>
							</div>
						{/each}
					</div>
				{/if}
				{#if deckLeads.length}
					<div style="display:grid;gap:6px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
						<small class="hint">Brand shortlist inquiries ({deckLeads.length})</small>
						{#each deckLeads as q (q.id)}
							<div style="padding:9px 11px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2)">
								<b>{q.brand_name}</b> <small class="hint">· {q.contact}</small>
								<div class="hint" style="margin-top:2px">Shortlisted: {q.selected_handles.join(', ') || 'All'}{#if q.message} — "{q.message}"{/if}</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>

		<section class="panel rv ro-ledger" aria-labelledby="ro-l-t">
			<div class="panel-h"><h2 id="ro-l-t">Commission ledger</h2><small>last 12 months · tracking only, no money moves through Miracle</small></div>
			<div class="ro-b">
				<div class="ro-k">
					<div><small>Deals paid</small><b class="num">{inr(totals.gross)}</b></div>
					<div><small>Your commission</small><b class="num">{inr(totals.commission)}</b></div>
					<div><small>Not settled yet</small><b class="num">{inr(totals.open)}</b></div>
				</div>
				<div class="ro-splits">
					{#each roster as r (r.id)}
						<label><span>{r.name}</span><input class="inp num" type="number" min="0" max="50" step="0.5" value={r.pct} onchange={(e) => pct(r, (e.currentTarget as HTMLInputElement).value)} aria-label="Your commission from {r.name}, in percent" />%</label>
					{/each}
				</div>
				<div class="ro-tw">
					<table class="ro-t">
						<thead><tr><th>Deal</th><th>Paid</th><th>Fee</th><th>Rate</th><th>Commission</th><th>To creator</th><th>Settled</th></tr></thead>
						<tbody>
							{#each ledger as x (x.d.id)}
								<tr>
									<td><b>{x.r.name}</b><small>{x.d.brand} · {x.d.code}</small></td>
									<td>{fmt(x.d.paid_on)}</td>
									<td class="num">{inr(x.d.fee)}</td>
									<td class="ro-rate"><input class="inp num" type="number" min="0" max="50" step="0.5" value={x.d.pct} onchange={(e) => dealPct(x.d, (e.currentTarget as HTMLInputElement).value)} aria-label="Commission on {x.d.code}, in percent" />%<small>{x.d.term === 'deal' ? 'this deal' : x.d.term === 'rate' ? 'locked' : 'current'}</small></td>
									<td class="num">{inr(x.commission)}</td>
									<td class="num">{inr(x.net)}</td>
									<td><input type="checkbox" class="cbx" checked={x.d.settled} onchange={(e) => settle(x.r, x.d.id, (e.currentTarget as HTMLInputElement).checked)} aria-label="Commission on {x.d.code} settled" /></td>
								</tr>
							{:else}
								<tr><td colspan="7" class="hint">No paid deals in the last 12 months.</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	</div>
{/if}

<style>
	.ro-list {
		margin-bottom: 18px;
	}
	.ro-pick {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--ink-2);
	}
	.ro-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		gap: 16px;
	}
	@media (max-width: 900px) {
		.ro-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.ro-b {
		display: grid;
		gap: 12px;
		padding: 0 18px 18px;
	}
	.ro-b > .btn {
		justify-self: start;
	}
	.ro-k {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	.ro-k > div {
		display: grid;
	}
	.ro-k small {
		color: var(--ink-3);
		font-size: 12px;
	}
	.ro-k b {
		font-size: 20px;
	}
	.ro-splits {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
	}
	.ro-splits label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
	}
	.ro-splits input {
		width: 70px;
		height: 34px;
	}
	.ro-tw {
		overflow-x: auto;
	}
	.ro-t {
		width: 100%;
		min-width: 640px;
		border-collapse: collapse;
		font-size: 13px;
	}
	.ro-t th {
		text-align: left;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
		padding: 0 8px 8px 0;
	}
	.ro-t td {
		padding: 10px 8px 10px 0;
		border-top: 1px solid var(--line);
		vertical-align: top;
	}
	.ro-t td small {
		display: block;
		color: var(--ink-3);
	}
	.ro-rate {
		white-space: nowrap;
	}
	.ro-rate input {
		width: 58px;
		height: 30px;
		margin-right: 3px;
	}
	.ro-t .ro-rate small {
		font-size: 11px;
	}
</style>
