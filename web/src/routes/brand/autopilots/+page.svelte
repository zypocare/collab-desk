<script lang="ts">
	import { onMount } from 'svelte';
	import { KIND_LABEL, actOn, autopilots, loadAutopilots, saveAutopilots, type AutopilotItem, type AutopilotKind, type Mode } from '#lib/autopilots.svelte.ts';
	import { addressFor } from '#lib/creatorHost.ts';
	import { pageSlug } from '#lib/supabase.ts';
	import { toast } from '#lib/ui.svelte.ts';
	import { errMessage, firstName, fmt } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	// Autopilots: five agents, each Off / Ask me / Auto, and what they prepared, waiting for an OK.
	onMount(() => {
		loadAutopilots().catch((e) => toast(errMessage(e), 'alert'));
	});
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
	const sub = (i: AutopilotItem) => [i.campaign, i.creator?.name].filter(Boolean).join(' · ');
	const editable = (i: AutopilotItem) => i.kind === 'followup' || (i.kind === 'draft' && i.payload.action === 'changes') || (i.kind === 'negotiate' && i.payload.action === 'counter');
	const primary = (i: AutopilotItem) =>
		i.kind === 'followup' ? 'Send'
		: i.kind === 'draft' ? (i.payload.action === 'changes' ? 'Ask for these changes' : 'Approve')
		: i.kind === 'negotiate' ? (i.payload.action === 'accept' ? 'Accept' : i.payload.action === 'counter' ? 'Send' : '')
		: i.kind === 'rebook' ? 'Book again'
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
