<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, day, num } from '../format.ts';
	import { errMessage, supabase } from '../supabase.ts';
	import { ask, toast } from '../ui.svelte.ts';
	import Icon from '../Icon.svelte';

	// Growth Autopilot (migration 163): creators Miracle found with a public business email, the invitation
	// written for each, and what came of it. Approve mode: nothing goes out until it's approved here.
	type R = Record<string, any>;
	let d = $state<R | null>(null);
	let err = $state('');
	let busy = $state('');
	let tab = $state<'ready' | 'approved' | 'sent' | 'joined' | 'other'>('ready');
	let picked = $state<Record<string, boolean>>({});
	let open = $state('');
	let draft = $state({ subject: '', body: '' });
	let f = $state<R>({});

	async function load() {
		const { data, error } = await supabase.rpc('admin_growth');
		err = error ? errMessage(error) : '';
		if (!error) {
			d = data as R;
			const s = d.settings ?? {};
			f = { ...s, niches: (s.niches ?? []).join(', '), cities: (s.cities ?? []).join(', ') };
		}
	}
	onMount(load);

	const list = (t: string) => String(t ?? '').split(',').map((x) => x.trim()).filter(Boolean);
	async function save(patch: R, msg = 'Saved') {
		busy = 'save';
		const { data, error } = await supabase.rpc('admin_growth_settings', { p: patch });
		busy = '';
		if (error) return toast(errMessage(error), true);
		d = data as R;
		toast(msg);
	}
	async function saveForm(e: SubmitEvent) {
		e.preventDefault();
		await save({
			daily: Number(f.daily), niches: list(f.niches), cities: list(f.cities), min_followers: Number(f.min_followers), max_followers: Number(f.max_followers),
			sender_name: f.sender_name, reply_to: f.reply_to, offer: f.offer, follow_up_days: Number(f.follow_up_days)
		});
	}
	async function power() {
		const on = !d?.settings?.on;
		if (on && !(await ask({ title: 'Switch the Growth Autopilot on?', body: `Each search looks in every niche and finds dozens of creators; up to ${d?.settings?.daily} emails go out a day and the rest wait their turn. ${d?.settings?.mode === 'auto' ? 'In Auto mode their emails go out by themselves, 10 AM to 6 PM.' : 'In Approve mode nothing is sent until you approve it here.'}`, ok: 'Switch on' }))) return;
		await save({ on }, on ? 'Growth Autopilot on' : 'Growth Autopilot off');
	}
	async function mode(m: 'approve' | 'auto') {
		if (m === d?.settings?.mode) return;
		if (m === 'auto' && !(await ask({ title: 'Send without approval?', body: 'New creators found each day are emailed by themselves, and everything waiting now is queued too. You can switch back any time.', ok: 'Switch to Auto' }))) return;
		await save({ mode: m }, m === 'auto' ? 'Auto: emails go out by themselves' : 'Approve: emails wait for you');
	}
	// The search runs in the background (up to about two and a half minutes): the page checks every few seconds
	// until that run has finished, then says what it found.
	// A Claude search that seems stuck: cancel it (Claude stops, nothing more is spent) so a new one can start.
	async function cancelSearch(id: number) {
		if (!(await ask({ title: 'Cancel this search?', body: 'Claude stops searching and nothing more is spent on it. You can start a new search straight after.', ok: 'Cancel search', danger: true }))) return;
		busy = 'cancel';
		const { error } = await supabase.functions.invoke(`growth-finder?cancel=${id}`, { body: {} });
		busy = '';
		if (error) return toast(errMessage(error), true);
		toast('Search cancelled');
		await load();
	}
	async function findNow() {
		busy = 'find';
		const { data, error } = await supabase.functions.invoke('growth-finder', { body: {} });
		if (error) {
			busy = '';
			const ctx = (error as { context?: Response }).context;
			const j = ctx ? await ctx.json().catch(() => null) : null;
			return toast((j as R | null)?.error ?? errMessage(error), true);
		}
		const r = data as R;
		if (!r.started) {
			busy = '';
			await load();
			return toast(r.skipped || r.error || (r.added ? `${r.added} found` : 'Nothing new found'), !r.added);
		}
		// Claude (a batch) usually takes a few minutes, at most an hour; Gemini about two minutes.
		toast(r.batch ? 'Claude is searching. This usually takes a few minutes; creators appear here when it’s done, and you can close this page.' : 'Searching in the background. Results appear here in about two minutes.');
		const until = Date.now() + (r.batch ? 600_000 : 200_000);
		while (Date.now() < until) {
			await new Promise((ok) => setTimeout(ok, r.batch ? 20000 : 8000));
			await load();
			const run = ((d?.runs ?? []) as R[]).find((x) => x.id === r.run);
			if (run?.finished_at) {
				busy = '';
				const spent = run.engine === 'claude' && Number(run.cost_usd) ? ` · about $${Number(run.cost_usd).toFixed(2)} of Claude credit` : '';
				return toast((run.added ? `${run.added} creator${run.added === 1 ? '' : 's'} found` : run.error || 'Nothing new found') + spent, !run.added);
			}
		}
		busy = '';
		toast(r.batch ? 'Claude is still searching. Check back later: creators appear here when it’s done.' : 'The search took too long and was stopped. Try again, or narrow the niches or cities.', !r.batch);
	}
	async function act(ids: string[], action: 'approve' | 'skip' | 'never') {
		if (!ids.length) return;
		if (action === 'never' && !(await ask({ title: `Never email ${ids.length === 1 ? 'this creator' : `these ${ids.length}`}?`, body: 'They go on the never-email list.', ok: 'Never email', danger: true }))) return;
		const { data, error } = await supabase.rpc('admin_growth_leads', { p_ids: ids, p_action: action });
		if (error) return toast(errMessage(error), true);
		d = data as R;
		picked = {};
		toast(action === 'approve' ? `${ids.length} approved: they go out from 10 AM, a few minutes apart` : action === 'skip' ? `${ids.length} skipped` : `${ids.length} on the never-email list`);
	}
	function edit(r: R) {
		open = open === r.id ? '' : r.id;
		draft = { subject: r.subject, body: r.body };
	}
	async function saveEdit(id: string) {
		const { data, error } = await supabase.rpc('admin_growth_leads', { p_ids: [id], p_action: 'edit', p_subject: draft.subject, p_body: draft.body });
		if (error) return toast(errMessage(error), true);
		d = data as R;
		open = '';
		toast('Email saved');
	}

	const s = $derived(d?.settings ?? {});
	const lastEngine = $derived(((d?.runs ?? []) as R[])[0]?.engine ?? '');
	// A search still going: Claude's batch (minutes, at most an hour), or a Gemini run in its first few minutes.
	const active = $derived(((d?.runs ?? []) as R[]).find((r) => !r.finished_at && (r.batch_id || Date.now() - Date.parse(r.at) < 200_000)) ?? null);
	// While one is going the page keeps itself up to date, so its creators appear without a reload.
	$effect(() => {
		if (!active) return;
		const t = setInterval(load, 30_000);
		return () => clearInterval(t);
	});
	const c = $derived(d?.counts ?? {});
	const TABS = [['ready', 'Waiting for you'], ['approved', 'Queued'], ['sent', 'Sent'], ['joined', 'Joined'], ['other', 'Skipped · unsubscribed']] as const;
	const inTab = (r: R, t: string) => (t === 'sent' ? r.status === 'sent' || r.status === 'followed' : t === 'other' ? r.status === 'skipped' || r.status === 'unsubscribed' : r.status === t);
	const rows = $derived(((d?.rows ?? []) as R[]).filter((r) => inTab(r, tab)));
	const count = (t: string) => ((d?.rows ?? []) as R[]).filter((r) => inTab(r, t)).length;
	const pickedIds = $derived(rows.filter((r) => picked[r.id]).map((r) => r.id as string));
	const allPicked = $derived(rows.length > 0 && rows.every((r) => picked[r.id]));
	const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—');
	const host = (u: string) => {
		try {
			return new URL(u).hostname.replace(/^www\./, '');
		} catch {
			return '';
		}
	};
	const days = $derived.by(() => {
		const have = new Map(((d?.by_day ?? []) as R[]).map((x) => [String(x.day), x]));
		const out: { day: string; sent: number; joined: number }[] = [];
		const now = new Date();
		for (let i = 29; i >= 0; i--) {
			const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
			out.push({ day: k, sent: Number(have.get(k)?.sent ?? 0), joined: Number(have.get(k)?.joined ?? 0) });
		}
		return out;
	});
	const maxDay = $derived(Math.max(1, ...days.map((x) => x.sent)));
	const LINE: Record<string, string> = { ready: '#f2994a', approved: '#3a67d8', sent: '#6b3fd4', followed: '#6b3fd4', joined: '#1d6b45', skipped: '#dad3df', unsubscribed: '#d4296a' };
	const TAG: Record<string, [string, string]> = {
		ready: ['Waiting', 't-warn'], approved: ['Queued', 't-info'], sent: ['Sent', 't-acc'], followed: ['Followed up', 't-acc'],
		joined: ['Joined', 't-ok'], skipped: ['Skipped', 't-mute'], unsubscribed: ['Unsubscribed', 't-bad']
	};
</script>

<div class="gr">
	<header class="wh">
		<div>
			<h1>Growth Autopilot</h1>
			<p class="muted lead">Finds Indian creators who show a business email on a public page, writes each a short invitation, and sends them 10 AM to 6 PM, a few minutes apart, with one follow-up. Anyone can unsubscribe in one tap.</p>
		</div>
		<div class="acts">
			<button class="btn" onclick={findNow} disabled={!!busy || !!active}>{#if busy === 'find' || active}<span class="spinner"></span>{:else}<Icon name="search" />{/if}{active ? 'Searching…' : 'Find creators now'}</button>
			{#if d}<button class="btn {s.on ? '' : 'pri'}" onclick={power} disabled={!!busy}><Icon name={s.on ? 'pause' : 'play'} />{s.on ? 'Switch off' : 'Switch on'}</button>{/if}
		</div>
	</header>
	{#if err}<p class="err">{err}</p>{/if}

	{#if d}
		{#if active}
			<section class="card searching" role="status">
				<span class="pulse" aria-hidden="true"><i></i></span>
				<div class="st">
					<b>{active.results_read ? `Claude found ${num(active.asked)} creators: checking their pages` : active.engine === 'claude' ? 'Claude is searching for creators' : 'Searching for creators'} · started {ago(active.at)}</b>
					<small class="muted">{active.results_read ? 'A few creators every minute: each one\'s page is opened to see the email there, then they appear below under "Waiting for you".' : active.engine === 'claude' ? 'This usually takes a few minutes, sometimes up to an hour. The creators it finds appear below under "Waiting for you". You can close this page; nothing more is spent while it waits.' : 'This takes about two minutes. The creators it finds appear below under "Waiting for you".'}</small>
					{#if active.checked_at}<small class="chk">Last check {ago(active.checked_at)}: {active.batch_status || 'no answer yet'}</small>{/if}
				</div>
				{#if active.engine === 'claude'}<button class="btn sm" onclick={() => cancelSearch(active.id)} disabled={!!busy}>Cancel search</button>{/if}
			</section>
		{/if}
		<section class="state card" class:on={s.on}>
			<span class="dot" aria-hidden="true"></span>
			<div class="st">
				<b>{s.on ? 'On' : 'Off'} · {s.mode === 'auto' ? 'Auto: emails go out by themselves' : 'Approve: nothing goes out until you approve it'}</b>
				<small class="muted">{s.on ? `Searches at 9 AM when fewer than ${num(s.daily * 2)} creators are waiting. ${num(c.sent_today)} of ${s.daily} sent today.` : 'Switch it on to find creators every morning. "Find creators now" works either way.'}</small>
			</div>
			<div class="seg" role="group" aria-label="Mode">
				<button class:on={s.mode === 'approve'} onclick={() => mode('approve')}>Approve</button>
				<button class:on={s.mode === 'auto'} onclick={() => mode('auto')}>Auto</button>
			</div>
		</section>

		<section class="kpis">
			<div class="card k"><small>Found</small><b class="mono">{num(c.found)}</b><span>{num(c.waiting)} waiting for you · {num(c.queued)} queued</span></div>
			<div class="card k"><small>Emailed</small><b class="mono">{num(c.sent)}</b><span>{num(c.sent_today)} today</span></div>
			<div class="card k"><small>Opened the link</small><b class="mono">{num(c.clicked)}</b><span>{pct(Number(c.clicked), Number(c.sent))} of emailed</span></div>
			<div class="card k"><small>Signed up</small><b class="mono">{num(c.joined)}</b><span>{pct(Number(c.joined), Number(c.sent))} of emailed</span></div>
			<div class="card k"><small>Unsubscribed</small><b class="mono">{num(c.unsubscribed)}</b><span>{num(c.suppressed)} on the never-email list</span></div>
		</section>

		<div class="two">
			<div class="col">
			<section class="card">
				<div class="card-h"><h2 class="card-t">Sent by day</h2><span class="muted sm">last 30 days · green: signed up</span></div>
				<div class="chart" role="img" aria-label="Invitations sent per day for the last 30 days">
					{#each days as x (x.day)}<span class="b" style:height="{Math.max(x.sent ? 4 : 1, (x.sent / maxDay) * 100)}%" title="{day(x.day)}: {x.sent} sent, {x.joined} signed up">{#if x.joined}<i style:height="{(x.joined / Math.max(1, x.sent)) * 100}%"></i>{/if}</span>{/each}
				</div>
				<div class="axis muted"><span>{day(days[0].day)}</span><span>today</span></div>
			</section>
			<section class="card">
				<div class="card-h"><h2 class="card-t">Last searches</h2><span class="muted sm">{lastEngine === 'claude' ? 'Claude Opus 5.5' : lastEngine === 'gemini' ? 'Gemini' : ''}{d.month_cost ? ` · about $${Number(d.month_cost).toFixed(2)} of Claude credit this month` : ''}</span></div>
				{#if !(d.runs ?? []).length}
					<div class="card-empty">No searches yet.</div>
				{:else}
					<ul class="runs">
						{#each d.runs as r (r.id)}
							<li>
								<span class="mono muted">{ago(r.at)}</span>
								<span class="rn">{#if !r.finished_at && r.results_read}Checking creators…{#if r.checked_at}<small class="d">{r.batch_status}</small>{/if}{:else if !r.finished_at && r.batch_id}Claude is searching…{#if r.checked_at}<small class="d">checked {ago(r.checked_at)}: {r.batch_status}</small>{/if}{:else if !r.finished_at && Date.now() - Date.parse(r.at) < 200_000}Searching…{:else if !r.finished_at}Stopped: took too long{:else}{r.added ? `${r.added} found` : 'none added'}{/if}{r.manual ? ' · by hand' : ''}{#if r.error}<small class="d">{r.error}</small>{/if}</span>
								<span class="tag {r.engine === 'claude' ? 't-acc' : 't-mute'}">{r.engine === 'claude' ? 'Claude' : 'Gemini'}</span>
								<span class="mono">{r.engine === 'claude' ? `$${Number(r.cost_usd).toFixed(2)}` : 'free'}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
			</div>
			<form class="card set" onsubmit={saveForm}>
				<div class="card-h"><h2 class="card-t">Who to find, and how to write</h2></div>
				<div class="fields">
					<label>Emails a day<input class="inp" type="number" min="1" max="60" bind:value={f.daily} /></label>
					<label>Follow up after (days)<input class="inp" type="number" min="2" max="14" bind:value={f.follow_up_days} /></label>
					<label class="wide">Niches <small class="muted">comma separated</small><input class="inp" bind:value={f.niches} /></label>
					<label class="wide">Cities <small class="muted">empty: all of India</small><input class="inp" placeholder="e.g. Bangalore, Mumbai" bind:value={f.cities} /></label>
					<label>Followers from<input class="inp" type="number" min="0" step="1000" bind:value={f.min_followers} /></label>
					<label>Followers up to<input class="inp" type="number" min="0" step="1000" bind:value={f.max_followers} /></label>
					<label>Sender name<input class="inp" bind:value={f.sender_name} /></label>
					<label>Replies go to<input class="inp" type="email" bind:value={f.reply_to} /></label>
					<label class="wide">Offer in the email<input class="inp" bind:value={f.offer} /></label>
				</div>
				<label class="chk"><input type="checkbox" checked={s.auto_approve} onchange={(e) => save({ auto_approve: (e.currentTarget as HTMLInputElement).checked }, (e.currentTarget as HTMLInputElement).checked ? 'New creators are approved straight away' : 'New creators wait for approval in Sign-ups')} /><span>Approve new creator sign-ups straight away <small class="muted">(you can still pause anyone)</small></span></label>
				<div class="row"><button class="btn pri" type="submit" disabled={!!busy}>{#if busy === 'save'}<span class="spinner"></span>{/if}Save</button></div>
			</form>
		</div>
	{/if}

	<nav class="tabs" aria-label="Creators found">
		{#each TABS as [k, l] (k)}<button class:on={tab === k} onclick={() => ((tab = k), (picked = {}), (open = ''))}>{l} <span class="mono muted">{num(count(k))}</span></button>{/each}
	</nav>

	{#if pickedIds.length}
		<div class="bulk" role="region" aria-label="Actions on picked creators">
			<b>{pickedIds.length} picked</b>
			{#if tab === 'ready' || tab === 'other'}<button class="btn sm dk" onclick={() => act(pickedIds, 'approve')}>Approve</button>{/if}
			{#if tab === 'ready' || tab === 'approved'}<button class="btn sm dk" onclick={() => act(pickedIds, 'skip')}>Skip</button>{/if}
			<button class="btn sm dk" onclick={() => act(pickedIds, 'never')}>Never email</button>
			<button class="btn sm dk end" onclick={() => (picked = {})}>Clear</button>
		</div>
	{/if}

	{#if !d}
		<div class="card"><div class="ld"><span class="spinner"></span></div></div>
	{:else if !rows.length}
		<div class="card card-empty">{tab === 'ready' ? (active ? 'Nothing here yet: the creators from the search that is running appear here when it finishes.' : d.rows.length ? 'Nothing waiting. A new search runs at 9 AM when the queue is low, or press "Find creators now".' : 'No creators found yet. Press "Find creators now".') : 'Nobody here yet.'}</div>
	{:else}
		<div class="pickall"><label><input type="checkbox" checked={allPicked} onchange={() => (picked = Object.fromEntries(rows.map((r) => [r.id, !allPicked])))} /> Pick all {num(rows.length)} shown</label></div>
		<div class="leads">
			{#each rows as r (r.id)}
				<article class="card lift lc" class:sel={picked[r.id]} style:border-bottom-color={LINE[r.status] ?? '#dad3df'}>
					<div class="ld-top">
						<input type="checkbox" aria-label="Pick {r.name}" bind:checked={picked[r.id]} />
						<span class="tag {TAG[r.status]?.[1] ?? 't-mute'}"><i class="pd"></i>{TAG[r.status]?.[0] ?? r.status}</span>
						{#if r.niche}<span class="nich">{r.niche}</span>{/if}
					</div>
					<div class="ld-t">
						<h2>{r.name}</h2>
						<span>{[r.handle ? '@' + r.handle : '', r.city, r.followers ? `~${num(r.followers)} followers` : ''].filter(Boolean).join(' · ')}</span>
					</div>
					<div class="ld-s">
						<div><small>Email seen on</small>{#if r.source_url}<a href={r.source_url} target="_blank" rel="noopener">{host(r.source_url)}</a>{:else}<b>—</b>{/if}</div>
						<div><small>Subject</small><button class="lnk sbj" onclick={() => edit(r)} aria-expanded={open === r.id}>{r.subject}</button></div>
					</div>
					{#if r.why}<p class="why">{r.why}</p>{/if}
					{#if open === r.id}
						<div class="mail">
							<label>Subject<input class="inp" bind:value={draft.subject} disabled={!['ready', 'approved', 'skipped'].includes(r.status)} /></label>
							<label>Email<textarea class="inp" rows="8" bind:value={draft.body} disabled={!['ready', 'approved', 'skipped'].includes(r.status)}></textarea></label>
							<small class="muted">Added below it: the "Get your free page" link, the sender name, and the unsubscribe line.</small>
							{#if ['ready', 'approved', 'skipped'].includes(r.status)}<div class="row"><button class="btn sm" onclick={() => (open = '')}>Cancel</button><button class="btn sm pri" onclick={() => saveEdit(r.id)}>Save email</button></div>{/if}
						</div>
					{/if}
					<div class="ld-f">
						<span class="muted">{#if r.joined_at}Joined {day(r.joined_at)}{:else if r.clicked_at}Opened the link {ago(r.clicked_at)}{:else if r.followed_at}Followed up {ago(r.followed_at)}{:else if r.sent_at}Emailed {ago(r.sent_at)}{:else}Found {day(r.found_on)} · {r.email}{/if}</span>
						<span class="ld-a">
							{#if r.status === 'ready'}<button class="btn sm" onclick={() => act([r.id], 'skip')}>Skip</button><button class="btn sm pri" onclick={() => act([r.id], 'approve')}>Approve</button>
							{:else if r.status === 'approved'}<button class="btn sm" onclick={() => act([r.id], 'skip')}>Hold back</button>
							{:else if r.status === 'skipped'}<button class="btn sm" onclick={() => act([r.id], 'approve')}>Approve</button>{/if}
						</span>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	.gr { display: flex; flex-direction: column; gap: 14px; }
	.wh { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 12px; }
	h1 { font-size: 28px; font-weight: 800; letter-spacing: -.02em; }
	.pickall { font-size: 12.5px; color: var(--ink-3); }
	.pickall label { display: inline-flex; align-items: center; gap: 8px; }
	.leads { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 18px; align-items: start; }
	.lc { display: flex; flex-direction: column; gap: 13px; padding: 18px 20px; border-bottom: 3px solid; }
	.lc.sel { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
	.ld-top { display: flex; align-items: center; gap: 10px; }
	.ld-top .pd { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
	.nich { font-size: 13.5px; font-weight: 600; color: var(--ink-3); }
	.ld-t { display: grid; gap: 4px; }
	.ld-t h2 { font-size: 19px; font-weight: 700; }
	.ld-t span { font-size: 13px; color: var(--ink-3); }
	.ld-s { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface-2); }
	.ld-s > div { display: grid; gap: 3px; padding: 11px 14px; min-width: 0; }
	.ld-s > div + div { border-left: 1px solid var(--line-soft); }
	.ld-s small { font-size: 12px; color: var(--ink-3); }
	.ld-s a, .ld-s b, .sbj { font-size: 13.5px; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
	.sbj { text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
	.why { font-size: 13px; line-height: 1.5; color: var(--ink-2); }
	.ld-f { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding-top: 10px; border-top: 1px solid var(--line-soft); font-size: 12.5px; }
	.ld-f .muted { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ld-a { display: flex; gap: 6px; flex: none; }
	.lead { margin-top: 4px; font-size: 13.5px; max-width: 720px; }
	.acts { display: flex; gap: 8px; }
	.ld { padding: 40px; display: grid; place-items: center; }
	.state { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 16px; }
	.searching { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-color: var(--accent); background: var(--accent-soft); }
	.searching .st b { color: var(--accent-2); }
	.searching .st { flex: 1; }
	.chk { font-size: 12px; color: var(--accent-2); font-weight: 600; }
	.pulse { position: relative; width: 14px; height: 14px; flex: none; border-radius: 50%; background: var(--accent); }
	.pulse i { position: absolute; inset: 0; border-radius: 50%; background: var(--accent); animation: gp-ping 1.6s cubic-bezier(0, 0, .2, 1) infinite; }
	@keyframes gp-ping { 75%, 100% { transform: scale(2.4); opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .pulse i { animation: none; } }
	.state .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ink-3); flex: none; }
	.state.on .dot { background: #2c7a45; box-shadow: 0 0 0 4px rgba(44, 122, 69, .15); }
	.st { display: grid; gap: 2px; flex: 1; min-width: 220px; }
	.st b { font-weight: 500; }
	.st small { font-size: 12.5px; }
	.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
	.k { padding: 14px 16px; display: grid; gap: 4px; }
	.k small { font-size: 12.5px; color: var(--ink-3); }
	.k b { font-size: 22px; font-weight: 500; }
	.k span { font-size: 12px; color: var(--ink-3); }
	.two { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 16px; align-items: start; }
	.sm { font-size: 12px; }
	.chart { display: flex; align-items: flex-end; gap: 3px; height: 150px; padding: 16px 16px 6px; }
	.chart .b { position: relative; flex: 1; background: var(--accent); border-radius: 2px 2px 0 0; min-width: 3px; opacity: .85; overflow: hidden; }
	.chart .b i { position: absolute; left: 0; right: 0; bottom: 0; background: #2c7a45; }
	.axis { display: flex; justify-content: space-between; padding: 0 16px 12px; font-size: 11.5px; }
	.col { display: grid; gap: 16px; }
	.runs { list-style: none; margin: 0; padding: 4px 16px 10px; }
	.runs li { display: grid; grid-template-columns: 76px 1fr auto 52px; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line-soft); font-size: 13px; }
	.runs li:last-child { border-bottom: 0; }
	.runs .rn { min-width: 0; }
	.runs .mono:last-child { text-align: right; }
	.set { padding-bottom: 14px; }
	.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; padding: 4px 16px 10px; }
	.fields label { display: grid; gap: 4px; font-size: 12.5px; color: var(--ink-2); }
	.fields .wide { grid-column: 1 / -1; }
	.chk { display: flex; gap: 8px; align-items: flex-start; padding: 0 16px 10px; font-size: 13px; }
	.row { display: flex; gap: 8px; padding: 0 16px; }
	.tabs { display: flex; gap: 18px; border-bottom: 1px solid var(--line); overflow-x: auto; }
	.tabs button { height: 36px; padding: 0 2px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ink-2); font-weight: 500; font-size: 13.5px; white-space: nowrap; }
	.tabs button.on { color: var(--ink); border-bottom-color: var(--accent); }
	.tabs .mono { font-size: 11.5px; }
	.seg { display: inline-flex; border: 1px solid var(--line-strong); border-radius: 7px; overflow: hidden; background: var(--surface); }
	.seg button { height: 32px; padding: 0 14px; border: 0; background: none; font-size: 13px; font-weight: 500; color: var(--ink-2); }
	.seg button.on { background: var(--ink); color: #fff; }
	.bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; background: var(--side); color: #fff; font-size: 13px; }
	.btn.dk { background: var(--side-2); border-color: #3a333f; color: #fff; }
	.btn.dk:hover { background: #3a333f; color: #fff; }
	.end { margin-left: auto; }
	.ck { width: 36px; }
	.w5 { font-weight: 500; }
	.d { display: block; font-size: 12px; color: var(--ink-3); }
	.lnk { border: 0; background: none; padding: 0; color: var(--ink); text-align: left; font: inherit; text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; cursor: pointer; }
	.lnk:hover { color: var(--accent); }
	.r { text-align: right; }
	.mail { display: grid; gap: 10px; max-width: 720px; padding: 6px 0 10px; }
	.mail label { display: grid; gap: 4px; font-size: 12.5px; color: var(--ink-2); }
	.mail textarea { font: 13.5px/1.5 inherit; resize: vertical; }
	.mail .row { padding: 0; }
	@media (max-width: 640px) { .fields { grid-template-columns: 1fr; } }
</style>
