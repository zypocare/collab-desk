<script lang="ts">
	import { onMount } from 'svelte';
	import { igStart, invokeFn, loadInstagram, saveSettings, studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';
	import Segmented from './Segmented.svelte';
	import Select from './Select.svelte';

	// Full Instagram Automations: Comment-to-DM + Public Comment Auto-Reply + DM Keyword + Story Reply + Per-Reel targeting.
	type TriggerType = 'comment' | 'dm' | 'story_reply';
	type MatchType = 'contains' | 'exact' | 'any';
	type Rule = {
		id: string;
		keyword: string;
		reply: string;
		public_reply: string;
		trigger_type: TriggerType;
		match_type: MatchType;
		media_id: string | null;
		active: boolean;
		uses: number;
	};
	type Log = {
		id: string;
		from_username: string;
		text: string;
		reply: string;
		status: string;
		trigger_type?: TriggerType;
		public_replied?: boolean;
		created_at: string;
		error: string | null;
	};

	const s = $derived(studio.settings!);
	let rules = $state<Rule[]>([]);
	let logs = $state<Log[]>([]);
	let perms = $state('');
	let busy = $state('');
	let filter = $state<'all' | TriggerType>('all');

	// New rule form state
	let triggerType = $state<TriggerType>('comment');
	let matchType = $state<MatchType>('contains');
	let mediaId = $state<string>('');
	let kw = $state('');
	let text = $state('');
	let publicReply = $state('Sent it to your DMs!');

	const allowed = $derived(perms.includes('instagram_business_manage_comments') && perms.includes('instagram_business_manage_messages'));
	const pending = $derived(logs.filter((l) => l.status === 'pending'));
	const sentWeek = $derived(logs.filter((l) => l.status === 'sent' && Date.now() - Date.parse(l.created_at) < 7 * 864e5).length);
	const totalSent = $derived(rules.reduce((a, r) => a + (r.uses ?? 0), 0));
	const activeCount = $derived(rules.filter((r) => r.active).length);
	const filteredRules = $derived(filter === 'all' ? rules : rules.filter((r) => r.trigger_type === filter));

	const mediaOptions = $derived([
		{ value: '', label: 'All posts & Reels' },
		...studio.media.slice(0, 15).map((m) => {
			const clean = (m.caption || 'Instagram Reel').replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
			const short = clean.length > 42 ? clean.slice(0, 40).trim() + '…' : clean || 'Instagram post';
			return { value: m.id, label: short };
		})
	]);

	const triggerOpts: { value: TriggerType; label: string }[] = [
		{ value: 'comment', label: 'Comment on Reel / Post' },
		{ value: 'dm', label: 'Incoming DM Keyword' },
		{ value: 'story_reply', label: 'Story Reply' }
	];

	const matchOpts: { value: MatchType; label: string }[] = [
		{ value: 'contains', label: 'Contains keyword' },
		{ value: 'exact', label: 'Exact match' },
		{ value: 'any', label: 'Any comment / reply' }
	];

	const DEFAULTS = [
		{
			keyword: 'COLLAB',
			trigger_type: 'comment',
			match_type: 'contains',
			public_reply: 'Sent you a DM with my rates & details!',
			reply: 'Hi! Thanks for asking about a collab. My rates, packages and the request form are all here: {link}'
		},
		{
			keyword: 'LINK',
			trigger_type: 'comment',
			match_type: 'contains',
			public_reply: 'Just sent the link to your DMs!',
			reply: 'Hi! Here is the link you asked for: {link}'
		}
	];

	function mediaLabel(id: string | null): string {
		if (!id) return 'All posts';
		const found = studio.media.find((m) => m.id === id);
		if (!found) return 'Selected post';
		const clean = (found.caption || '').replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
		return clean.length > 28 ? clean.slice(0, 26).trim() + '…' : clean || 'Selected post';
	}

	function triggerBadge(t?: string): string {
		if (t === 'dm') return 'DM';
		if (t === 'story_reply') return 'STORY';
		return 'COMMENT';
	}

	async function load() {
		const [r, l, p] = await Promise.all([
			supabase
				.from('dm_rules')
				.select('id, keyword, reply, public_reply, trigger_type, match_type, media_id, active, uses')
				.order('created_at', { ascending: false }),
			supabase
				.from('dm_auto_log')
				.select('id, from_username, text, reply, status, trigger_type, public_replied, created_at, error')
				.order('created_at', { ascending: false })
				.limit(30),
			supabase.rpc('ig_permissions')
		]);
		rules = ((r.data ?? []) as Partial<Rule>[]).map((x) => ({
			id: String(x.id ?? ''),
			keyword: String(x.keyword ?? ''),
			reply: String(x.reply ?? ''),
			public_reply: String(x.public_reply ?? ''),
			trigger_type: (x.trigger_type ?? 'comment') as TriggerType,
			match_type: (x.match_type ?? 'contains') as MatchType,
			media_id: x.media_id ?? null,
			active: x.active !== false,
			uses: Number(x.uses ?? 0)
		}));
		logs = (l.data ?? []) as Log[];
		perms = String(p.data ?? '');
	}

	onMount(() => {
		if (!studio.media.length) void loadInstagram();
		void load();
	});

	async function setMode(m: string) {
		await saveSettings({ comment_dm_mode: m as 'off' | 'ask' | 'auto' });
		if (m !== 'off' && !rules.length) {
			await supabase.from('dm_rules').insert(DEFAULTS);
			await load();
		}
	}

	async function add() {
		const keyword = matchType === 'any' ? '*' : kw.trim().replace(/^#/, '').toUpperCase();
		if (!keyword || !text.trim()) return;
		const { error } = await supabase.from('dm_rules').insert({
			keyword,
			reply: text.trim(),
			public_reply: triggerType === 'comment' ? publicReply.trim() : '',
			trigger_type: triggerType,
			match_type: matchType,
			media_id: triggerType === 'comment' && mediaId ? mediaId : null,
			active: true
		});
		if (error) {
			return toast(errMessage(error).includes('duplicate') ? 'You already have that rule for this trigger.' : errMessage(error), 'alert');
		}
		kw = '';
		text = '';
		mediaId = '';
		toast('Automation added', 'check');
		await load();
	}

	async function update(r: Rule, patch: Partial<Rule>) {
		const { error } = await supabase.from('dm_rules').update(patch).eq('id', r.id);
		if (error) toast(errMessage(error), 'alert');
		else Object.assign(r, patch);
	}

	async function remove(r: Rule) {
		await supabase.from('dm_rules').delete().eq('id', r.id);
		rules = rules.filter((x) => x.id !== r.id);
	}

	async function answer(l: Log, send: boolean) {
		busy = l.id;
		try {
			await invokeFn('instagram-dm', { comment_log: l.id, text: send ? l.reply : false });
			toast(send ? `Sent to @${l.from_username || 'follower'}` : 'Skipped', send ? 'send' : 'check');
			await load();
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}

	async function allow() {
		try {
			location.href = await igStart(true, true);
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}
</script>

<section class="panel cdm rv" aria-labelledby="cdm-t">
	<div class="panel-h">
		<h2 id="cdm-t">Instagram Automations</h2>
		<small>{sentWeek ? `${sentWeek} sent this week` : 'Auto-reply to comments, DMs & Story replies for free'}</small>
	</div>

	<div class="cdm-b">
		<!-- Live Automation Stats -->
		<div class="cdm-stats">
			<span><small>Active rules</small><b>{activeCount}</b></span>
			<span><small>Sent this week</small><b>{sentWeek}</b></span>
			<span><small>Total DMs sent</small><b>{totalSent}</b></span>
		</div>

		<Segmented
			label="Automation mode"
			value={s.comment_dm_mode ?? 'off'}
			onchange={(v) => setMode(v)}
			options={[
				{ value: 'off', label: 'Off' },
				{ value: 'ask', label: 'Ask me' },
				{ value: 'auto', label: 'Auto' }
			]}
		/>
		<small class="hint">
			{s.comment_dm_mode === 'auto'
				? 'Replies go out automatically (up to 200/day), including public comment replies when set.'
				: s.comment_dm_mode === 'ask'
					? 'Each matched comment, DM, or Story reply waits below for your 1-tap approval.'
					: 'Turn this on to auto-DM links, rates, or guides when followers comment, DM, or reply to your Story.'}
		</small>

		{#if (s.comment_dm_mode ?? 'off') !== 'off' && !allowed}
			<div class="cdm-allow">
				<span>
					<b>Allow comments &amp; DMs on Instagram</b>
					<small>Instagram asks once for comment and message permissions so automations can run.</small>
				</span>
				<button class="btn primary sm" onclick={allow}>Allow</button>
			</div>
		{/if}

		{#if pending.length}
			<div class="cdm-wait">
				<span class="lbl-t">Waiting for your tap · {pending.length}</span>
				{#each pending as l (l.id)}
					<div class="cdm-l">
						<div class="cdm-lh">
							<span class="cdm-tbadge">{triggerBadge(l.trigger_type)}</span>
							<b>@{l.from_username || 'follower'}</b>
						</div>
						<p class="cdm-q">“{l.text}”</p>
						<small>DM: {l.reply}</small>
						<span class="row">
							<button class="btn sm primary" disabled={busy === l.id} onclick={() => answer(l, true)}><Icon name="send" />Send DM</button>
							<button class="btn sm ghost" disabled={busy === l.id} onclick={() => answer(l, false)}>Skip</button>
						</span>
					</div>
				{/each}
			</div>
		{/if}

		<!-- New Automation Builder -->
		<form class="cdm-add" onsubmit={(e) => (e.preventDefault(), add())}>
			<span class="lbl-t">New automation</span>
			<div class="cdm-grid2">
				<div class="cdm-f">
					<label for="cdm-trig">Trigger</label>
					<Select id="cdm-trig" ariaLabel="Trigger type" bind:value={triggerType} options={triggerOpts} />
				</div>
				<div class="cdm-f">
					<label for="cdm-match">Match</label>
					<Select id="cdm-match" ariaLabel="Match rule" bind:value={matchType} options={matchOpts} />
				</div>
			</div>

			{#if triggerType === 'comment'}
				<div class="cdm-f">
					<label for="cdm-media">Applies to</label>
					<Select id="cdm-media" ariaLabel="Target post or Reel" bind:value={mediaId} options={mediaOptions} />
				</div>
			{/if}

			{#if matchType !== 'any'}
				<input class="inp" placeholder="Keyword, e.g. LINK, CAFE, RATES" maxlength="30" bind:value={kw} aria-label="Trigger keyword" />
			{/if}

			<textarea
				class="inp"
				rows="2"
				maxlength="900"
				placeholder={'DM they receive automatically. {link} becomes your Miracle page link.'}
				bind:value={text}
				aria-label="Automatic DM text"
			></textarea>

			{#if triggerType === 'comment'}
				<input
					class="inp"
					maxlength="200"
					placeholder="Optional public comment reply (e.g. Sent it to your DMs!)"
					bind:value={publicReply}
					aria-label="Public comment reply"
				/>
			{/if}

			<button class="btn sm primary" disabled={(matchType !== 'any' && !kw.trim()) || !text.trim()}>
				<Icon name="plus" />Add automation
			</button>
		</form>

		<!-- Saved Rules Filter + List -->
		{#if rules.length}
			<div class="cdm-filters" role="tablist" aria-label="Filter automations">
				<button type="button" class:on={filter === 'all'} onclick={() => (filter = 'all')}>All ({rules.length})</button>
				<button type="button" class:on={filter === 'comment'} onclick={() => (filter = 'comment')}>Comments</button>
				<button type="button" class:on={filter === 'dm'} onclick={() => (filter = 'dm')}>DMs</button>
				<button type="button" class:on={filter === 'story_reply'} onclick={() => (filter = 'story_reply')}>Stories</button>
			</div>

			{#each filteredRules as r (r.id)}
				<div class="cdm-r" class:off={!r.active}>
					<div class="cdm-rh">
						<span class="cdm-tbadge">{triggerBadge(r.trigger_type)}</span>
						<b>{r.match_type === 'any' ? 'ANY' : r.keyword}</b>
						{#if r.match_type === 'exact'}<span class="cdm-mbadge">EXACT</span>{/if}
						{#if r.trigger_type === 'comment' && r.media_id}<span class="cdm-pbadge">{mediaLabel(r.media_id)}</span>{/if}
						<small>{r.uses} sent</small>
						<input
							type="checkbox"
							class="tgl"
							checked={r.active}
							aria-label="Toggle {r.keyword}"
							onchange={(e) => update(r, { active: (e.currentTarget as HTMLInputElement).checked })}
						/>
						<button class="icon-btn sm" onclick={() => remove(r)} aria-label="Remove {r.keyword}"><Icon name="x" /></button>
					</div>
					<textarea
						class="inp"
						rows="2"
						maxlength="900"
						value={r.reply}
						aria-label="DM reply for {r.keyword}"
						onchange={(e) => update(r, { reply: (e.currentTarget as HTMLTextAreaElement).value })}
					></textarea>
					{#if r.trigger_type === 'comment'}
						<input
							class="inp cdm-pub"
							maxlength="200"
							value={r.public_reply}
							placeholder="Public comment reply (optional)"
							aria-label="Public comment reply for {r.keyword}"
							onchange={(e) => update(r, { public_reply: (e.currentTarget as HTMLInputElement).value })}
						/>
					{/if}
				</div>
			{/each}
		{/if}

		{#if logs.some((l) => l.status === 'failed')}
			<small class="err">Some replies failed: {logs.find((l) => l.status === 'failed')?.error}</small>
		{/if}
	</div>
</section>

<style>
	.cdm-b {
		display: grid;
		gap: 12px;
		padding: 0 18px 18px;
	}
	.cdm-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.cdm-stats span {
		padding: 10px 11px;
		border-radius: 12px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		display: grid;
		gap: 2px;
	}
	.cdm-stats small {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.cdm-stats b {
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: 24px;
		line-height: 1.05;
	}
	.cdm-allow,
	.cdm-l,
	.cdm-r,
	.cdm-add {
		display: grid;
		gap: 9px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--surface-2);
		border: 1px solid var(--line);
	}
	.cdm-allow {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
	}
	.cdm-allow span {
		display: grid;
		gap: 2px;
	}
	.cdm-allow small,
	.cdm-l small {
		color: var(--ink-3);
		line-height: 1.45;
	}
	.cdm-lh {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.cdm-q {
		margin: 0;
		font-size: 13.5px;
		color: var(--ink);
	}
	.cdm-wait {
		display: grid;
		gap: 8px;
	}
	.cdm-grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	@media (max-width: 540px) {
		.cdm-grid2 {
			grid-template-columns: 1fr;
		}
	}
	.cdm-f {
		display: grid;
		gap: 4px;
	}
	.cdm-f label {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.cdm-filters {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.cdm-filters button {
		padding: 6px 11px;
		border-radius: 99px;
		border: 1px solid var(--line-strong);
		background: transparent;
		color: var(--ink-3);
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.cdm-filters button.on {
		background: var(--surface-2);
		color: var(--ink);
		border-color: var(--g1);
	}
	.cdm-r.off {
		opacity: 0.58;
	}
	.cdm-rh {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.cdm-rh small {
		margin-right: auto;
		color: var(--ink-3);
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11.5px;
	}
	.cdm-tbadge {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		padding: 2px 7px;
		border-radius: 99px;
		color: var(--g1);
		background: color-mix(in oklab, var(--g1) 14%, var(--surface));
	}
	.cdm-mbadge,
	.cdm-pbadge {
		font-size: 10.5px;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 99px;
		background: var(--surface);
		border: 1px solid var(--line-strong);
		color: var(--ink-2);
		max-width: 150px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cdm-add .inp,
	.cdm-pub {
		width: 100%;
	}
</style>
