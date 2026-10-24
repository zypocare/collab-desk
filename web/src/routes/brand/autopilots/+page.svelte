<script lang="ts">
	import { onMount } from 'svelte';
	import { KIND_LABEL, actOn, autopilots, checkCompetitors, loadAutopilots, saveAutopilots, type AutopilotItem, type AutopilotKind, type Competitor, type Mode } from '#lib/autopilots.svelte.ts';
	import { campaigns, loadCampaigns } from '#lib/campaigns.svelte.ts';
	import { healthChips } from '#lib/health.ts';
	import { compact } from '#lib/util.ts';
	import Avatar from '#lib/components/Avatar.svelte';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage, firstName, fmt } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// Autopilots: five agents, each Off / Ask me / Auto, and what they prepared, waiting for an OK.
	onMount(() => {
		loadAutopilots().catch((e) => toast(errMessage(e), 'alert'));
		loadCampaigns().catch(() => {});
	});

	// Competitor watch: up to five competitors, the campaign new creators are invited to, and Check now.
	let rivals = $state<Competitor[]>([]);
	let rivalsFor = '';
	$effect(() => {
		const key = JSON.stringify(st?.watch_brands ?? []);
		if (st && key !== rivalsFor) {
			rivalsFor = key;
			rivals = (st.watch_brands ?? []).map((b) => ({ ...b }));
		}
	});
	async function saveRivals() {
		const clean = rivals.map((r) => ({ name: r.name.trim(), handle: r.handle.trim().replace(/^@+/, '') })).filter((r) => r.name || r.handle);
		rivalsFor = JSON.stringify(clean);
		await saveField({ watch_brands: clean });
	}
	async function setWatch(m: Mode) {
		if (m !== 'off' && !rivals.some((r) => r.name.trim() || r.handle.trim())) {
			toast('Add a competitor first.', 'alert');
			return;
		}
		if (m === 'auto' && !st?.watch_campaign) {
			toast('Pick the campaign to invite creators to first.', 'alert');
			return;
		}
		await saveField({ watch: m });
		toast(`Competitor watch: ${m === 'off' ? 'off' : m === 'ask' ? 'asks you first' : 'on Auto'}`, 'check');
	}
	let checking = $state(false);
	async function checkNow() {
		checking = true;
		try {
			const r = await checkCompetitors();
			toast(r.creators ? `Found ${r.creators} creator${r.creators === 1 ? '' : 's'} with your competitors${r.invites ? `, ${r.invites} invite${r.invites === 1 ? '' : 's'} ready` : ''}` : 'No creators found yet. We’ll look again every Monday.', 'check');
			document.getElementById('inbox')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			checking = false;
		}
	}
	const ig = (h: string) => `https://www.instagram.com/${encodeURIComponent(h)}/`;
	const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
	const st = $derived(autopilots.settings);
	const pending = $derived(autopilots.items.filter((i) => i.status === 'pending'));
	const lately = $derived(autopilots.items.filter((i) => i.status !== 'pending').slice(0, 8));
	type Agent = { key: 'shortlist' | 'followup' | 'draftcheck' | 'negotiate' | 'rebook'; kind: AutopilotKind; name: string; what: string; auto: string };
	const AGENTS: Agent[] = [
		{ key: 'shortlist', kind: 'shortlist', name: 'Shortlist', what: 'Finds creators who fit each campaign: niche, content, engagement, price and how past work with you went. Suggests them in the campaign.', auto: 'Auto ticks them for you when you write a campaign; sending is always your call.' },
		{ key: 'followup', kind: 'followup', name: 'Follow-up', what: "Sends a friendly nudge in the request's chat when a creator hasn't quoted, a draft is late, or a post is due.", auto: 'Auto sends the nudge; Ask me shows it first.' },
		{ key: 'draftcheck', kind: 'draft', name: 'Draft checker', what: "Checks every draft's caption against your brief: mentions, hashtags, promo code, link and the #ad label.", auto: 'Auto approves drafts that pass every check. Anything missing waits for you.' },
		{ key: 'negotiate', kind: 'negotiate', name: 'Negotiator', what: 'Accepts campaign quotes within your budget per creator, and asks for a lower price on the ones a little above it.', auto: 'Auto answers quotes for you and signs the agreement with your name.' },
		{ key: 'rebook', kind: 'rebook', name: 'Rebook', what: 'When a collab ends, compares its cost per 1,000 views with your others and offers your best creators the same brief again.', auto: 'Auto sends the repeat request; the creator still quotes.' }
	];
	const MODES: { v: Mode; label: string }[] = [
		{ v: 'off', label: 'Off' },
		{ v: 'ask', label: 'Ask me' },
		{ v: 'auto', label: 'Auto' }
	];
	async function setMode(a: Agent, m: Mode) {
		if (m === 'auto' && a.key === 'negotiate' && !st?.signer.trim()) {
			toast('Add the name to sign agreements with first.', 'alert');
			return;
		}
		try {
			await saveAutopilots({ [a.key]: m } as never);
			toast(`${a.name}: ${m === 'off' ? 'off' : m === 'ask' ? 'asks you first' : 'on Auto'}`, 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
	async function saveField(patch: Record<string, unknown>) {
		try {
			await saveAutopilots(patch as never);
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}

	// The inbox
	const at = (slug: string | null, path: string) => (!slug || slug === pageSlug ? path : addressFor(slug, path));
	const edits = $state<Record<string, string>>({});
	let busy = $state('');
	async function act(i: AutopilotItem, action: 'approve' | 'alt' | 'skip') {
		busy = i.id;
		try {
			await actOn(i.id, action, edits[i.id]);
			if (action !== 'skip') toast('Done', 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	const sub = (i: AutopilotItem) => [i.campaign, i.creator?.name ?? i.payload.creator?.name].filter(Boolean).join(' · ');
	const editable = (i: AutopilotItem) => i.kind === 'followup' || (i.kind === 'draft' && i.payload.action === 'changes') || (i.kind === 'negotiate' && i.payload.action === 'counter');
	const primary = (i: AutopilotItem) =>
		i.kind === 'followup' ? 'Send'
		: i.kind === 'draft' ? (i.payload.action === 'changes' ? 'Ask for these changes' : 'Approve')
		: i.kind === 'negotiate' ? (i.payload.action === 'accept' ? 'Accept' : i.payload.action === 'counter' ? 'Send' : '')
		: i.kind === 'rebook' ? 'Book again'
		: i.kind === 'invite' ? 'Invite'
		: i.kind === 'watch' ? 'Got it'
		: '';
	const statusText = (i: AutopilotItem) => (i.status === 'auto' ? 'Done on Auto' : i.status === 'done' ? 'You approved' : 'Skipped');
</script>

<svelte:head><title>Autopilots · Miracle</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Plan{st && pending.length ? ` · ${pending.length} waiting for your OK` : ''}</div>
		<h1>Your <em>autopilots</em></h1>
		<p>Each one works on your campaigns every day. Ask me: it prepares the step and waits for your OK. Auto: it does it and tells you.</p>
	</div>
</header>

{#if !autopilots.loaded || !st}
	<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
{:else}
	<div class="ap-wrap">
		<div class="ap-grid">
			{#each AGENTS as a, n (a.key)}
				{@const mode = st[a.key] as Mode}
				<section class="ap-c rv" class:wide={n === AGENTS.length - 1} style="--i:{n}" aria-label={a.name}>
					<div class="ap-top">
						<h2>{a.name}</h2>
						<div class="ap-seg" role="radiogroup" aria-label="{a.name} mode">
							{#each MODES as m (m.v)}<button role="radio" aria-checked={mode === m.v} class:on={mode === m.v} class:auto={m.v === 'auto'} onclick={() => setMode(a, m.v)}>{m.label}</button>{/each}
						</div>
					</div>
					<p>{a.what}</p>
					{#if a.key === 'shortlist'}
						<label class="ap-rule">Up to <input type="number" min="1" max="20" value={st.shortlist_max} onchange={(e) => saveField({ shortlist_max: Number((e.currentTarget as HTMLInputElement).value) })} /> a campaign · only creators open to brands</label>
					{:else if a.key === 'followup'}
						<label class="ap-rule">After <input type="number" min="1" max="14" value={st.followup_days} onchange={(e) => saveField({ followup_days: Number((e.currentTarget as HTMLInputElement).value) })} /> quiet days · at most one nudge a week each</label>
					{:else if a.key === 'negotiate'}
						<label class="ap-rule">Signs agreements as <input class="ap-name" value={st.signer} placeholder="Your full name" maxlength="120" onchange={(e) => saveField({ signer: (e.currentTarget as HTMLInputElement).value })} /></label>
						<label class="ap-rule">Asks for a lower price on quotes up to <input type="number" min="0" max="100" value={st.negotiate_over} onchange={(e) => saveField({ negotiate_over: Number((e.currentTarget as HTMLInputElement).value) })} />% over budget</label>
					{/if}
					{#if mode !== 'off'}<small class="ap-mode">{mode === 'auto' ? a.auto : 'Prepares each step and waits for your OK.'}</small>{/if}
					{#if st.lately[a.kind]}<small class="ap-late" class:ok={st.lately[a.kind]?.status !== 'pending'}>Lately: {st.lately[a.kind]?.title}</small>{/if}
				</section>
			{/each}
		</div>

		<section class="ap-c cw rv" aria-label="Competitor watch">
			<div class="ap-top">
				<h2>Competitor watch</h2>
				<div class="ap-seg" role="radiogroup" aria-label="Competitor watch mode">
					{#each MODES as m (m.v)}<button role="radio" aria-checked={st.watch === m.v} class:on={st.watch === m.v} class:auto={m.v === 'auto'} onclick={() => setWatch(m.v)}>{m.label}</button>{/each}
				</div>
			</div>
			<p>Every Monday, finds the creators your competitors work with: paid posts by creators on Miracle that tag or name them, and what a Google search turns up, with links. New creators who haven't worked with you are invited to your campaign.</p>
			<div class="cw-rivals">
				{#each rivals as r, n (n)}
					<div class="cw-rival">
						<input placeholder="Brand name, e.g. Mamaearth" maxlength="80" bind:value={r.name} onchange={saveRivals} aria-label="Competitor {n + 1} name" />
						<input placeholder="@instagram" maxlength="31" bind:value={r.handle} onchange={saveRivals} aria-label="Competitor {n + 1} Instagram" />
						<button class="icon-btn" onclick={() => ((rivals = rivals.filter((_, k) => k !== n)), saveRivals())} aria-label="Remove competitor {n + 1}"><Icon name="x" /></button>
					</div>
				{/each}
				{#if rivals.length < 5}<button class="btn sm ghost" onclick={() => (rivals = [...rivals, { name: '', handle: '' }])}><Icon name="plus" />Add a competitor</button>{/if}
			</div>
			<label class="ap-rule">Invite new creators to
				<select class="cw-sel" value={st.watch_campaign ?? ''} onchange={(e) => saveField({ watch_campaign: (e.currentTarget as HTMLSelectElement).value || null })}>
					<option value="">No campaign: just tell me</option>
					{#each campaigns.list as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
				</select>
				· up to <input type="number" min="1" max="20" value={st.watch_max} onchange={(e) => saveField({ watch_max: Number((e.currentTarget as HTMLInputElement).value) })} /> a week
			</label>
			{#if st.watch !== 'off'}<small class="ap-mode">{st.watch === 'auto' ? 'Auto invites new creators to the campaign and tells you. Creators not on Miracle are added to it by Instagram handle, with an invite you can copy and send them.' : 'Each invite waits for your OK.'}</small>{/if}
			<div class="cw-foot">
				<small>{st.watch_checked_at ? `Last checked ${when(st.watch_checked_at)}` : 'Not checked yet'}{st.lately.watch ? ` · ${st.lately.watch.title}` : ''}</small>
				<button class="btn sm" onclick={checkNow} disabled={checking || st.watch === 'off' || !rivals.some((r) => r.name.trim() || r.handle.trim())}>{#if checking}<span class="spinner"></span>Checking…{:else}<Icon name="search" />Check now{/if}</button>
			</div>
		</section>

		<section class="ap-inbox" id="inbox" aria-label="Waiting for your OK">
			<header class="hs-h"><h2>Waiting for your OK</h2>{#if pending.length}<span class="hs-n">{pending.length}</span>{/if}</header>
			<p class="ap-isub">What your autopilots prepared. Nothing goes out until you approve it.</p>
			{#if !pending.length}
				<p class="ap-none">All clear. New items show up here as quotes, drafts and quiet requests come in.</p>
			{/if}
			{#each pending as i (i.id)}
				<article class="ap-i" class:hot={i.kind === 'negotiate' || i.kind === 'draft'}>
					<div class="ap-ih2"><span class="ap-tag k-{i.kind}">{KIND_LABEL[i.kind]}</span>{#if sub(i)}<span class="ap-sub">{sub(i)}</span>{/if}</div>
					<b class="ap-t">{i.title}</b>
					{#if i.kind === 'draft' && i.payload.checks}
						<ul class="ap-checks">{#each i.payload.checks as c, k (k)}<li class={c.ok === null ? 'na' : c.ok ? 'ok' : 'no'}>{c.ok === null ? '–' : c.ok ? '✓' : '✕'} {c.label}</li>{/each}</ul>
					{/if}
					{#if i.kind === 'shortlist' && i.payload.creators}
						<p class="ap-body">{i.payload.creators.slice(0, 4).map((c) => firstName(c.name)).join(', ')}{i.payload.creators.length > 4 ? ` and ${i.payload.creators.length - 4} more` : ''}</p>
					{/if}
					{#if i.kind === 'watch' && i.payload.competitors}
						<div class="cw-brief">
							{#each i.payload.competitors as c (c.name)}
								<div class="cw-sec">
									<div class="cw-h"><b>{c.name}</b>{#if c.handle}<a href={ig(c.handle)} target="_blank" rel="noopener">@{c.handle}</a>{/if}<small>{c.miracle.length + c.web.length} creator{c.miracle.length + c.web.length === 1 ? '' : 's'}</small></div>
									{#if !c.miracle.length && !c.web.length}<p class="cw-none">No creators spotted with {c.name} yet.</p>{/if}
									{#each c.miracle as m (m.creator_id)}
										<div class="cw-row">
											<Avatar name={m.creator.name} src={m.creator.photo ?? ''} size="40px" />
											<div class="cw-who">
												<b>{m.creator.name}{#if m.new}<em class="cw-new">New</em>{/if}{#if m.known}<em class="cw-known">Worked with you</em>{/if}</b>
												<small>{[m.creator.niche?.split(',')[0]?.trim(), m.creator.city, m.creator.followers != null ? `${compact(m.creator.followers)} followers` : ''].filter(Boolean).join(' · ')}</small>
												<span class="cw-chips">{#each healthChips(m.creator.health as never) as ch (ch.text)}<i class="cp-chip {ch.tone}">{ch.text}</i>{/each}<i class="cp-chip info">On Miracle</i></span>
												<span class="cw-posts">{#each m.posts.slice(0, 3) as p (p.link)}<a href={p.link} target="_blank" rel="noopener">{p.source === 'web' ? 'Source' : `Post ${when(p.posted_at)}`}{p.views ? ` · ${compact(p.views)} views` : ''}</a>{/each}</span>
											</div>
											<a class="btn sm" href="/brand/creator/{m.creator_id}">Profile</a>
										</div>
									{/each}
									{#each c.web as w (w.handle)}
										<div class="cw-row">
											<span class="cw-av">@</span>
											<div class="cw-who">
												<b>{w.name || `@${w.handle}`}{#if w.new}<em class="cw-new">New</em>{/if}</b>
												<small>@{w.handle}{w.note ? ` · ${w.note}` : ''}</small>
												<span class="cw-posts"><a href={w.link} target="_blank" rel="noopener">Where we saw it</a><span>Not on Miracle yet</span></span>
											</div>
											<a class="btn sm" href={ig(w.handle)} target="_blank" rel="noopener">Instagram</a>
										</div>
									{/each}
								</div>
							{/each}
							{#if !i.payload.campaign}<p class="cw-tip">Pick a campaign in Competitor watch, and the new creators are invited to it (after your OK, or on Auto).</p>{/if}
						</div>
					{/if}
					{#if i.kind === 'invite'}
						<div class="cw-row cw-inv">
							{#if i.payload.creator}<Avatar name={i.payload.creator.name} src={i.payload.creator.photo ?? ''} size="40px" />{:else}<span class="cw-av">@</span>{/if}
							<div class="cw-who">
								<b>{i.payload.creator?.name ?? `@${i.payload.handle}`}</b>
								<small>{i.payload.on_miracle ? [i.payload.creator?.niche?.split(',')[0]?.trim(), i.payload.creator?.city, i.payload.creator?.followers != null ? `${compact(i.payload.creator.followers)} followers` : ''].filter(Boolean).join(' · ') : `@${i.payload.handle} · not on Miracle yet: added to the campaign, where you can copy an invite to send them`}</small>
								{#if i.payload.link}<span class="cw-posts"><a href={i.payload.link} target="_blank" rel="noopener">What they made for {i.payload.competitor}</a></span>{/if}
							</div>
						</div>
					{/if}
					{#if editable(i)}
						<label class="ap-msg"><span>Message</span><textarea rows="2" value={edits[i.id] ?? i.body} oninput={(e) => (edits[i.id] = (e.currentTarget as HTMLTextAreaElement).value)}></textarea></label>
					{:else if i.body && i.kind !== 'shortlist'}
						<p class="ap-body">{i.body}</p>
					{/if}
					{#if i.note}<p class="ap-note">Couldn't do it on Auto: {i.note}</p>{/if}
					<div class="ap-acts">
						{#if primary(i)}<button class="btn grad" disabled={busy === i.id} onclick={() => act(i, 'approve')}>{primary(i)}</button>{/if}
						{#if i.kind === 'draft' && i.payload.action === 'changes'}<button class="btn" disabled={busy === i.id} onclick={() => act(i, 'alt')}>Approve anyway</button>{/if}
						{#if i.kind === 'shortlist' && i.campaign_id}<a class="btn primary" href="/brand/campaigns/{i.campaign_id}?suggest=1" onclick={() => actOn(i.id, 'approve')}>See them</a>{/if}
						{#if i.code}<a class="btn" href={at(i.slug, `/brand/r/${i.code}`)}>Open the request</a>{/if}
						<button class="btn ghost" disabled={busy === i.id} onclick={() => act(i, 'skip')}>Skip</button>
					</div>
				</article>
			{/each}
			{#if lately.length}
				<header class="hs-h"><h2>Lately</h2></header>
				<div class="ap-lately">
					{#each lately as i (i.id)}<div><span class="ap-tag k-{i.kind}">{KIND_LABEL[i.kind]}</span><span class="ap-lt">{i.title}</span><small>{statusText(i)} · {fmt((i.acted_at ?? i.created_at).slice(0, 10))}</small></div>{/each}
				</div>
			{/if}
		</section>
	</div>
{/if}

<style>
	.ap-wrap {
		display: grid;
		gap: 30px;
	}
	.ap-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}
	.ap-c {
		display: grid;
		align-content: start;
		gap: 10px;
		padding: 20px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.ap-c.wide {
		grid-column: 1 / -1;
	}
	.ap-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	.ap-top h2 {
		margin: 0;
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 26px;
	}
	.ap-seg {
		display: flex;
		gap: 2px;
		padding: 3px;
		border-radius: 10px;
		background: color-mix(in oklab, var(--ink) 5%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.ap-seg button {
		min-height: 36px;
		padding: 0 12px;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--ink-3);
		font: 600 12.5px/1 var(--f-body);
		cursor: pointer;
	}
	.ap-seg button.on {
		background: var(--surface);
		color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.ap-seg button.on.auto {
		box-shadow: inset 0 0 0 1.5px var(--ok);
	}
	.ap-c p {
		margin: 0;
		color: var(--ink-2);
		font-size: 14px;
		line-height: 1.5;
	}
	.ap-rule {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: var(--ink-3);
	}
	.ap-rule input {
		width: 56px;
		height: 32px;
		padding: 0 8px;
		border: 0;
		background: color-mix(in oklab, var(--ink) 5%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		font: 600 13px/1 var(--f-body);
	}
	.ap-rule .ap-name {
		width: 200px;
	}
	.ap-mode {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.ap-late {
		font-size: 12.5px;
		color: var(--g3);
	}
	.ap-late.ok {
		color: var(--ok);
	}
	.cw {
		gap: 12px;
	}
	.cw-rivals {
		display: grid;
		gap: 8px;
		justify-items: start;
	}
	.cw-rival {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
		gap: 8px;
		width: 100%;
		max-width: 560px;
	}
	.cw-rival input,
	.cw-sel {
		height: 38px;
		padding: 0 10px;
		border: 0;
		border-radius: 0;
		background: color-mix(in oklab, var(--ink) 5%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		font: 500 14px/1 var(--f-body);
		min-width: 0;
	}
	.cw-sel {
		max-width: 260px;
	}
	.cw-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding-top: 10px;
		border-top: 1px dashed var(--line-strong);
	}
	.cw-foot small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.cw-brief {
		display: grid;
		gap: 14px;
	}
	.cw-sec {
		display: grid;
		gap: 8px;
	}
	.cw-h {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.cw-h b {
		font-family: var(--f-serif);
		font-weight: 400;
		font-size: 20px;
	}
	.cw-h a,
	.cw-h small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.cw-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		padding: 10px 12px;
		border-radius: 14px;
		background: color-mix(in oklab, var(--ink) 3%, var(--surface));
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.cw-inv {
		grid-template-columns: auto minmax(0, 1fr);
	}
	.cw-av {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--surface-2);
		color: var(--ink-3);
		font-weight: 700;
	}
	.cw-who {
		display: grid;
		gap: 3px;
		min-width: 0;
	}
	.cw-who b {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		font-size: 14.5px;
	}
	.cw-who small {
		font-size: 12.5px;
		color: var(--ink-3);
		overflow-wrap: anywhere;
	}
	.cw-new,
	.cw-known {
		padding: 2px 7px;
		border-radius: 99px;
		background: var(--g2);
		color: #fff;
		font-size: 10px;
		font-style: normal;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.cw-known {
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.cw-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.cw-chips i {
		padding: 2px 8px;
		border-radius: 99px;
		background: var(--surface-2);
		color: var(--ink-2);
		font-size: 11px;
		font-style: normal;
		font-weight: 600;
	}
	.cw-chips i.ok {
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		color: var(--ok);
	}
	.cw-chips i.warn {
		background: color-mix(in oklab, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.cw-chips i.bad {
		background: color-mix(in oklab, var(--bad) 16%, transparent);
		color: var(--bad);
	}
	.cw-posts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		font-size: 12.5px;
	}
	.cw-posts a {
		color: var(--ink-2);
	}
	.cw-posts span {
		color: var(--ink-3);
	}
	.cw-none,
	.cw-tip {
		margin: 0;
		font-size: 13px;
		color: var(--ink-3);
	}
	.ap-inbox {
		display: grid;
		gap: 14px;
		scroll-margin-top: 90px;
	}
	.ap-isub {
		margin: -6px 0 0;
		color: var(--ink-3);
		font-size: 14px;
	}
	.ap-none {
		margin: 0;
		padding: 18px;
		border-radius: 18px;
		box-shadow: inset 0 0 0 1px var(--line);
		color: var(--ink-3);
		font-size: 14px;
	}
	.ap-i {
		display: grid;
		gap: 10px;
		padding: 20px;
		border-radius: 20px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.ap-i.hot {
		background:
			radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--g3) 12%, transparent), transparent 60%),
			var(--surface);
	}
	.ap-ih2 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.ap-tag {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		padding: 5px 10px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		color: var(--g2);
		white-space: nowrap;
	}
	.ap-tag.k-negotiate {
		background: color-mix(in oklab, var(--g1) 18%, transparent);
		color: var(--g1);
	}
	.ap-tag.k-followup {
		background: color-mix(in oklab, #4ccfc2 18%, transparent);
		color: #3fb3a8;
	}
	.ap-tag.k-rebook {
		background: color-mix(in oklab, var(--ok) 18%, transparent);
		color: var(--ok);
	}
	.ap-sub {
		font-size: 13px;
		color: var(--ink-3);
	}
	.ap-t {
		font-size: 18px;
		font-weight: 600;
	}
	.ap-body {
		margin: 0;
		color: var(--ink-2);
		font-size: 14px;
		line-height: 1.5;
	}
	.ap-note {
		margin: 0;
		font-size: 13px;
		color: var(--g3);
	}
	.ap-checks {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 13.5px;
	}
	.ap-checks .ok {
		color: var(--ok);
	}
	.ap-checks .no {
		color: var(--bad);
	}
	.ap-checks .na {
		color: var(--ink-3);
	}
	.ap-msg {
		display: grid;
		gap: 6px;
	}
	.ap-msg span {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ap-msg textarea {
		padding: 12px 14px;
		border: 0;
		background: color-mix(in oklab, var(--ink) 4%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		font: 14px/1.5 var(--f-body);
		resize: vertical;
	}
	.ap-acts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.ap-lately {
		display: grid;
		border-radius: 16px;
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.ap-lately > div {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 12px;
		padding: 12px 16px;
	}
	.ap-lately > div + div {
		border-top: 1px solid var(--line);
	}
	.ap-lt {
		flex: 1;
		min-width: 180px;
		font-size: 14px;
	}
	.ap-lately small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	@media (max-width: 900px) {
		.ap-wrap {
			display: flex;
			flex-direction: column-reverse;
		}
		.ap-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
