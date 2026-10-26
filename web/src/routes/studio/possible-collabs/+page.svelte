<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { ask } from '#lib/confirm.svelte.ts';
	import { addLeadAsCollab, lastBrandLines } from '#lib/leads.ts';
	import { knownBrandHandle, loadLeads, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { toast, ui } from '#lib/ui.svelte.ts';
	import { errMessage, stageLabel } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Ticket from '#lib/components/Ticket.svelte';

	// Every Instagram chat the check flagged as a possible collab, in one place: the new ones to act on, the ones
	// already on the board (with their collab), and the ones from brands she already works with. An alert opens
	// here with its chat at the top (?lead=<igsid>). "Not a collab" removes the chat, as it does in Messages.
	type Lead = {
		igsid: string;
		username: string;
		name: string;
		picture: string;
		collab_flag: string;
		collab_hint: string;
		collab_id: string | null;
		flagged_at: string | null;
		last_at: string | null;
		last_from_them_at: string | null;
		unread: number;
	};
	let rows = $state<Lead[] | null>(null);
	let lines = $state<Record<string, string>>({});
	let tab = $state<'new' | 'added' | 'all'>('new');
	let q = $state('');
	let busy = $state('');
	const focus = page.url.searchParams.get('lead') ?? '';

	async function load() {
		const { data, error } = await supabase
			.from('ig_threads')
			.select('igsid, username, name, picture, collab_flag, collab_hint, collab_id, flagged_at, last_at, last_from_them_at, unread')
			.in('collab_flag', ['likely', 'maybe'])
			.order('flagged_at', { ascending: false, nullsFirst: false })
			.limit(500);
		if (error) return toast(errMessage(error), 'alert');
		rows = (data ?? []) as Lead[];
		lines = await lastBrandLines(rows.filter((r) => kind(r) === 'new').slice(0, 40).map((r) => r.igsid));
	}
	onMount(() => {
		load().then(async () => {
			// From an alert: that chat on top and in view, whichever list it's in.
			const hit = rows?.find((r) => r.igsid === focus);
			if (hit && kind(hit) !== 'new') tab = 'all';
			await tick();
			if (hit) document.getElementById(`pc-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
		});
		const ch = supabase.channel('possible-collabs').on('postgres_changes', { event: '*', schema: 'public', table: 'ig_threads' }, () => load()).subscribe();
		return () => void supabase.removeChannel(ch);
	});

	/** new: to act on · added: on the board · known: a brand she already works with (most likely about that collab). */
	const kind = (r: Lead) => (r.collab_id ? 'added' : knownBrandHandle(r.username || '') ? 'known' : 'new');
	const all = $derived(rows ?? []);
	const counts = $derived({ new: all.filter((r) => kind(r) === 'new').length, added: all.filter((r) => kind(r) === 'added').length, all: all.length });
	const shown = $derived.by(() => {
		const t = q.trim().toLowerCase();
		const list = all.filter((r) => (tab === 'all' || kind(r) === tab) && (!t || `${r.username} ${r.name} ${r.collab_hint} ${lines[r.igsid] ?? ''}`.toLowerCase().includes(t)));
		// The alert's chat first, then likely before maybe among the new ones; newest first within that.
		return list.sort((a, b) => Number(b.igsid === focus) - Number(a.igsid === focus) || (tab === 'new' ? Number(b.collab_flag === 'likely') - Number(a.collab_flag === 'likely') : 0));
	});

	// The check's summary reads "Brand: Paid, 1 reel + 2 stories, budget ₹15,000".
	const brandOf = (r: Lead) => /^([^:@][^:]{0,40}):\s/.exec(r.collab_hint)?.[1].trim() ?? '';
	const offerOf = (r: Lead) => r.collab_hint.replace(/^[^:]{1,42}:\s+/, '').trim();
	const budgetOf = (r: Lead) => /₹\s?[\d,]+(?:\.\d+)?\s?(?:k|lakh|L)?\b/i.exec(r.collab_hint)?.[0].replace(/\s/g, '') ?? '';
	/** What they want: the check's summary, or (when it only says "asking about a collab") their own last line. */
	function taskOf(r: Lead) {
		const offer = offerOf(r);
		if (offer && !/^asking about/i.test(offer)) return offer[0].toUpperCase() + offer.slice(1);
		return lines[r.igsid] ? `“${lines[r.igsid]}”` : 'Asking about working together';
	}
	const collabOf = (r: Lead) => (r.collab_id ? studio.collabs.find((c) => c.id === r.collab_id) : undefined);
	function ago(ts: string | null) {
		if (!ts) return '';
		const m = Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 60000));
		if (m < 60) return m <= 1 ? 'just now' : `${m} min ago`;
		const h = Math.round(m / 60);
		if (h < 24) return `${h}h ago`;
		const d = Math.round(h / 24);
		return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	}
	function status(r: Lead) {
		const c = collabOf(r);
		if (kind(r) === 'added') return c ? `On your board · ${stageLabel(c.stage)}` : 'On your board';
		if (kind(r) === 'known') return 'From a brand on your board';
		return `${r.collab_flag === 'likely' ? 'Likely a collab' : 'Maybe a collab'} · wrote ${ago(r.last_from_them_at ?? r.last_at)}`;
	}

	async function add(r: Lead) {
		busy = r.igsid;
		await addLeadAsCollab(r.igsid, r.username, r.name);
		busy = '';
	}
	async function notCollab(r: Lead) {
		if (!(await ask({ title: `@${r.username || 'This chat'} isn't a collab?`, body: 'The chat is removed from Miracle, and their later messages stay out.', ok: 'Remove', danger: true }))) return;
		const { error } = await supabase.rpc('ig_not_collab', { p_igsid: r.igsid });
		if (error) return toast(errMessage(error), 'alert');
		rows = all.filter((x) => x.igsid !== r.igsid);
		loadLeads();
		toast('Removed. Their messages will stay out of the app.', 'check');
	}
</script>

<svelte:head><title>Possible collabs · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Spotted in your Instagram DMs</div>
		<h1>Possible <em>collabs</em></h1>
		<p>{counts.all} brand{counts.all === 1 ? '' : 's'} wrote about a collab · {counts.added} on your board. Every DM that looks like a collab is kept here, so none gets lost in your chats.</p>
	</div>
</header>

<div class="m-stages" role="tablist" aria-label="Show">
	<button role="tab" aria-selected={tab === 'new'} class:on={tab === 'new'} onclick={() => (tab = 'new')}><i class="dt" style="--hue:var(--accent)"></i>New<span>{counts.new}</span></button>
	<button role="tab" aria-selected={tab === 'added'} class:on={tab === 'added'} onclick={() => (tab = 'added')}><i class="dt" style="--hue:var(--ok)"></i>On your board<span>{counts.added}</span></button>
	<button role="tab" aria-selected={tab === 'all'} class:on={tab === 'all'} onclick={() => (tab = 'all')}>All<span>{counts.all}</span></button>
</div>

{#if counts.all > 4}
	<label class="search rv" style="--i:1"><Icon name="search" /><span class="sr">Search possible collabs</span><input type="search" placeholder="Brand, @handle or offer" bind:value={q} autocomplete="off" /></label>
{/if}

{#if !rows}
	<div class="empty"><span class="spinner"></span></div>
{:else if shown.length}
	<section class="tks pt-tks">
		{#each shown as r, i (r.igsid)}
			{@const brand = brandOf(r)}
			{@const c = collabOf(r)}
			<div class="pc-it" class:pc-focus={r.igsid === focus} id="pc-{r.igsid}">
				<Ticket
					name={brand || r.username || 'Instagram'}
					title={brand || `@${r.username || 'someone'}`}
					sub={[brand && r.username ? `@${r.username}` : r.name, `spotted ${ago(r.flagged_at)}`].filter(Boolean).join(' · ')}
					money={budgetOf(r)}
					moneySub={budgetOf(r) ? 'budget' : ''}
					task={taskOf(r)}
					status={status(r)}
					tone={kind(r) === 'added' ? 'ok' : kind(r) === 'known' ? 'calm' : r.collab_flag === 'likely' ? 'hot' : 'warn'}
					chips={r.unread && kind(r) !== 'added' ? [{ text: `${r.unread} unread`, tone: 'info' }] : []}
					href="/studio/inbox/ig/{r.igsid}"
					{i}
				>
					<span class="pt-tk-acts">
						{#if kind(r) === 'added'}
							{#if c}<button class="btn primary" onclick={() => (ui.openCollab = c.id)}><Icon name="board" />Open collab</button>{/if}
							<a class="btn" href="/studio/inbox/ig/{r.igsid}"><Icon name="send" />Chat</a>
						{:else}
							<button class="btn primary" disabled={busy === r.igsid} onclick={() => add(r)}>{#if busy === r.igsid}<span class="spinner"></span>{:else}<Icon name="plus" />{/if}Add as collab</button>
							<a class="btn" href="/studio/inbox/ig/{r.igsid}"><Icon name="send" />Chat</a>
							<button class="icon-btn" aria-label="Not a collab" title="Not a collab" onclick={() => notCollab(r)}><Icon name="x" /></button>
						{/if}
					</span>
				</Ticket>
			</div>
		{/each}
	</section>
{:else}
	<section class="panel rv" style="--i:2">
		<div class="empty">
			{#if q.trim()}
				<b>Nothing matches “{q.trim()}”</b>
			{:else if tab === 'new'}
				<b>{counts.all ? 'All caught up' : 'No possible collabs yet'}</b>
				<small>{counts.all ? 'Every brand that wrote is on your board or set aside. New ones show up here the moment they DM you.' : 'When a brand DMs you on Instagram about working together, it shows up here, with what they’re offering.'}</small>
			{:else if tab === 'added'}
				<b>None on your board yet</b><small>Tap “Add as collab” on a new one: the chat is read and the collab filled in for you.</small>
			{:else}
				<b>No possible collabs yet</b><small>When a brand DMs you on Instagram about working together, it shows up here.</small>
			{/if}
			{#if !studio.ig?.connected && !counts.all}<a class="btn primary" style="margin-top:10px" href="/studio/instagram"><Icon name="link" />Connect Instagram</a>{/if}
		</div>
	</section>
{/if}

<style>
	.pc-it { scroll-margin: 90px; border-radius: 22px; transition: box-shadow .3s; }
	.pc-it.pc-focus { box-shadow: 0 0 0 2px var(--accent), 0 0 0 6px color-mix(in oklab, var(--accent) 22%, transparent); }
	.search { margin-bottom: 4px; }
</style>
