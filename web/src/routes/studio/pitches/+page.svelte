<script lang="ts">
	import { ask } from '#lib/confirm.svelte.ts';
	import { onMount } from 'svelte';
	import { createCollab, saveSettings, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { askAi } from '#lib/ai.ts';
	import { toast, ui } from '#lib/ui.svelte.ts';
	import { emailOk, errMessage, fmt } from '#lib/util.ts';
	import { portal } from '#lib/portal.ts';
	import AiThinking from '#lib/components/AiThinking.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Logo from '#lib/components/Logo.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import OpenBriefs from '#lib/components/OpenBriefs.svelte';
	import { openBriefs } from '#lib/campaigns.svelte.ts';
	import type { OpenBrief } from '#lib/types.ts';
	import { openOutside } from '#lib/native.ts';

	type Pitch = {
		id: string;
		brand_name: string;
		instagram: string;
		category: string;
		contact_name: string;
		email: string;
		subject: string;
		body: string;
		status: 'idea' | 'ready' | 'sent' | 'replied' | 'won' | 'not_now' | 'skipped';
		auto_follow: boolean;
		website?: string;
		source?: string;
		fit_note?: string;
		approved?: boolean;
		send_after?: string | null;
		followups: number;
		dm_sent_at?: string | null;
		sent_at: string | null;
		next_follow_on: string | null;
		collab_id: string | null;
		found_on?: string | null;
		created_at: string;
	};

	let list = $state<Pitch[]>([]);
	let loaded = $state(false);
	let stageFilter = $state<'new' | 'wishlist' | 'pitched' | 'replied'>('new');
	let didInitStage = false;
	let justFoundIds = $state<string[]>([]);
	let open = $state<Partial<Pitch> | null>(null);
	let busy = $state(false);
	let writing = $state(false);

	async function load() {
		const { data } = await supabase.from('pitches').select('*').order('created_at', { ascending: false });
		const rows = (data as Pitch[]) ?? [];
		list = rows;
		if (!didInitStage) {
			didInitStage = true;
			const hasNew = rows.some((p) => p.status === 'ready' && (!p.approved || !p.email));
			stageFilter = hasNew ? 'new' : 'wishlist';
		}
		loaded = true;
	}
	onMount(load);

	let briefs = $state<OpenBrief[] | null>(null);
	let tab = $state<'briefs' | 'pitches' | null>(null);
	onMount(() => {
		openBriefs()
			.then((b) => (briefs = b ?? []))
			.catch(() => (briefs = []));
	});
	const view = $derived(tab ?? (briefs === null ? null : briefs.length ? 'briefs' : 'pitches'));

	const s = $derived(studio.settings!);
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	const LABEL: Record<Pitch['status'], { t: string; tone: 'ok' | 'warn' | 'vio' | 'muted' }> = {
		idea: { t: 'Wishlist', tone: 'vio' },
		ready: { t: 'Ready', tone: 'warn' },
		sent: { t: 'Pitched', tone: 'warn' },
		replied: { t: 'Replied', tone: 'ok' },
		won: { t: 'Won', tone: 'ok' },
		not_now: { t: 'Later', tone: 'muted' },
		skipped: { t: 'Skipped', tone: 'muted' }
	};

	const auto = $derived(s.pitch_mode === 'auto');
	const isNewPitch = (p: Pitch) => p.status === 'ready' && (!p.approved || !p.email);
	const isQueuedPitch = (p: Pitch) => p.status === 'ready' && !!p.approved && !!p.email;

	const newList = $derived(
		list.filter(isNewPitch).sort((a, b) => {
			const aj = justFoundIds.includes(a.id) ? 1 : 0;
			const bj = justFoundIds.includes(b.id) ? 1 : 0;
			if (aj !== bj) return bj - aj;
			return (b.created_at ?? '').localeCompare(a.created_at ?? '');
		})
	);
	const wishlistList = $derived(list.filter((p) => p.status === 'idea' || p.status === 'not_now'));
	const pitchedList = $derived(list.filter((p) => p.status === 'sent' || isQueuedPitch(p)));
	const repliedList = $derived(list.filter((p) => p.status === 'replied' || p.status === 'won'));

	const shown = $derived.by(() => {
		if (stageFilter === 'new') return newList;
		if (stageFilter === 'wishlist') return wishlistList;
		if (stageFilter === 'pitched') return pitchedList;
		return repliedList;
	});

	const waiting = $derived(newList.filter((p) => !!p.email && !p.approved && !auto));

	const todayKey = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
	function ageInfo(p: Pitch): { label: string; fresh: boolean } {
		if (justFoundIds.includes(p.id)) return { label: 'Just found', fresh: true };
		const refDate = (p.found_on || p.created_at || '').slice(0, 10);
		if (!refDate) return { label: '', fresh: false };
		if (refDate === todayKey) return { label: 'New · Today', fresh: true };
		const diff = Math.round((Date.parse(todayKey) - Date.parse(refDate)) / 864e5);
		if (diff === 1) return { label: 'Yesterday', fresh: false };
		if (diff > 1 && diff < 30) return { label: `${diff}d ago`, fresh: false };
		return { label: fmt(refDate), fresh: false };
	}
	const at = (t: string | null | undefined) =>
		t
			? new Date(t).toLocaleString('en-IN', {
					weekday: new Date(t).toDateString() === new Date().toDateString() ? undefined : 'short',
					hour: 'numeric',
					minute: '2-digit'
				})
			: '';
	const goes = (p: Pitch) => (p.approved || auto ? `Goes out ${at(p.send_after)}` : 'Waiting for OK');

	async function approve(ps: Pitch[]) {
		const { error } = await supabase.from('pitches').update({ approved: true }).in('id', ps.map((p) => p.id));
		if (error) return toast(errMessage(error), 'alert');
		toast(
			ps.length === 1
				? `${ps[0].brand_name} goes out ${at(ps[0].send_after)}`
				: `${ps.length} pitches approved. They go out one at a time through the day.`,
			'send'
		);
		load();
	}

	async function saveToWishlist(p: Pitch) {
		const { error } = await supabase
			.from('pitches')
			.update({ status: 'idea', approved: false, send_after: null })
			.eq('id', p.id);
		if (error) return toast(errMessage(error), 'alert');
		toast(`Saved ${p.brand_name} to your Wishlist`, 'check');
		load();
	}

	async function skip(p: Pitch) {
		await supabase.from('pitches').update({ status: 'skipped' }).eq('id', p.id);
		toast(`${p.brand_name} skipped. It won't come back.`, 'x');
		load();
	}

	let finding = $state(false);
	let findStep = $state(0);
	const FIND_STEPS = [
		'Mining your peers’ recent brand collabs',
		'Scanning Instagram niche & city hashtags',
		'Checking bio emails & writing tailored pitches'
	];

	$effect(() => {
		if (!finding) {
			findStep = 0;
			return;
		}
		findStep = 0;
		const timer = setInterval(() => {
			if (findStep < FIND_STEPS.length - 1) findStep += 1;
		}, 1400);
		return () => clearInterval(timer);
	});

	async function findNow() {
		const prevIds = new Set(list.map((p) => p.id));
		finding = true;
		const { data, error } = await supabase.functions.invoke('pitch-finder', { body: {} });
		finding = false;
		if (error) {
			const said = await (error as { context?: Response }).context?.json?.().catch(() => null);
			return toast(`Couldn't find brands just now: ${said?.error ?? said?.skipped ?? errMessage(error)}`, 'alert');
		}
		const r = data as { added?: number; emailCount?: number; dmCount?: number; skipped?: string; error?: string };
		if (r.error) return toast(r.error, 'alert');
		const parts = [r.emailCount ? `${r.emailCount} email` : '', r.dmCount ? `${r.dmCount} IG DM` : ''].filter(Boolean).join(', ');
		toast(
			r.added
				? `${r.added} new brand${r.added === 1 ? '' : 's'} found${parts ? ` (${parts})` : ''}`
				: r.skipped
					? `Nothing new: ${r.skipped}`
					: 'No new brands found right now',
			r.added ? 'check' : 'alert'
		);
		await load();
		if (r.added) {
			justFoundIds = list.filter((p) => !prevIds.has(p.id)).map((p) => p.id);
			tab = 'pitches';
			stageFilter = 'new';
		}
	}

	const handleOf = (p: Pitch) =>
		(p.instagram ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '');

	function dmText(p: Pitch) {
		const niche =
			(s.niche || '')
				.split(/[,/·|]/)
				.map((x) => x.trim().toLowerCase())
				.filter(Boolean)
				.slice(0, 2)
				.join(' and ') || 'content';
		const intro = `Hi ${p.brand_name} team! I'm ${s.display_name} (@${s.handle}), a ${niche} creator from ${s.city || 'India'}.`;
		return `${intro} I love what you're doing and would love to create content for ${p.brand_name}. My rates, past work and live Instagram numbers are all here: ${link}\n\nHappy to share a few ideas if you're open to it!`;
	}

	let dmFor = $state<Pitch | null>(null);
	let dmBody = $state('');
	function dm(p: Pitch) {
		if (!handleOf(p)) return;
		dmFor = p;
		dmBody = dmText(p);
	}

	function copyNow(text: string) {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
		document.body.appendChild(ta);
		ta.select();
		ta.setSelectionRange(0, text.length);
		let ok = false;
		try {
			ok = document.execCommand('copy');
		} catch {
			ok = false;
		}
		ta.remove();
		if (!ok) navigator.clipboard?.writeText(text).catch(() => {});
	}

	async function sendDm() {
		const p = dmFor;
		const h = p ? handleOf(p) : '';
		if (!p || !h) return;
		copyNow(dmBody.trim());
		toast('Message copied. In the chat, hold the message box, tap Paste, then send.', 'copy');
		openOutside(`https://ig.me/m/${encodeURIComponent(h)}`);
		dmFor = null;
		const nowIso = new Date().toISOString();
		list = list.map((x) => (x.id === p.id ? { ...x, dm_sent_at: nowIso } : x));
		await supabase.from('pitches').update({ dm_sent_at: nowIso }).eq('id', p.id);
	}

	const counts = $derived({
		fresh: newList.length,
		wishlist: wishlistList.length,
		pitched: pitchedList.length,
		replied: repliedList.length
	});
	const totalOutreach = $derived(counts.pitched + counts.replied);
	const totalActive = $derived(counts.fresh + counts.wishlist + counts.pitched + counts.replied);

	function template(p: Partial<Pitch>) {
		const first = (p.contact_name ?? '').split(' ')[0] || 'there';
		return {
			subject: `Content idea for ${p.brand_name || 'your brand'}`,
			body: `Hi ${first},\n\nI'm ${s.display_name} (@${s.handle}), a ${s.niche || 'content'} creator from ${s.city || 'India'}. I love what ${p.brand_name || 'you'} ${p.brand_name ? 'is' : 'are'} doing and would really enjoy creating for you.\n\nOne idea: a Reel that shows how your product fits into a real day, the way my audience follows along every week.\n\nMy rates, audience and past results are all here: ${link}\n\nWould a quick chat this week work?\n\nThanks,\n${s.display_name}`
		};
	}

	function newPitch() {
		tab = 'pitches';
		open = { brand_name: '', instagram: '', category: '', contact_name: '', email: '', subject: '', body: '', auto_follow: true };
	}

	async function writeAi() {
		if (!open?.brand_name?.trim()) return toast('Add the brand name first', 'alert');
		writing = true;
		try {
			const r = await askAi<{ subject: string; body: string }>('pitch', {
				brand: open.brand_name,
				brand_instagram: open.instagram,
				category: open.category,
				contact: open.contact_name,
				creator: s.display_name,
				handle: s.handle,
				niche: s.niche,
				city: s.city,
				followers: studio.ig?.followers ?? s.followers,
				engagement: s.engagement,
				page_link: link,
				past_brands: [...new Set(studio.collabs.filter((c) => ['live', 'wrapped'].includes(c.stage)).map((c) => c.brand.name))].slice(0, 5)
			});
			if (r.subject) open.subject = r.subject;
			if (r.body) open.body = r.body;
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		writing = false;
	}

	async function save(send: boolean) {
		if (!open?.brand_name?.trim()) return;
		if (!open.subject?.trim() || !open.body?.trim()) Object.assign(open, template(open));
		if (send && !emailOk(open.email)) return toast("Add the brand's email (like name@brand.com) to send the pitch.", 'alert');
		busy = true;
		const { id, ...row } = open;
		const { data, error } = id
			? await supabase.from('pitches').update(row).eq('id', id).select('*').single()
			: await supabase.from('pitches').insert(row).select('*').single();
		if (error) {
			busy = false;
			return toast(`Couldn't save: ${errMessage(error)}`, 'alert');
		}
		open.id = (data as Pitch).id;
		if (send) {
			const r = await supabase.rpc('send_pitch', { p_id: (data as Pitch).id });
			if (r.error) {
				busy = false;
				await load();
				return toast(errMessage(r.error), 'alert');
			}
			toast(`Pitch sent to ${open.brand_name}. Follow-ups go out on their own if they don't reply.`, 'send');
		} else {
			toast('Saved to your wishlist', 'check');
		}
		busy = false;
		open = null;
		load();
	}

	async function setStatus(p: Pitch, status: Pitch['status']) {
		await supabase
			.from('pitches')
			.update({ status, ...(status === 'replied' ? { replied_at: new Date().toISOString() } : {}) })
			.eq('id', p.id);
		load();
	}

	async function won(p: Pitch) {
		const c = await createCollab(p.brand_name, {
			collab: { stage: 'negotiating', contact_name: p.contact_name, contact_email: p.email },
			deliverables: [],
			instagram: p.instagram
		});
		if (!c) return;
		await supabase.from('pitches').update({ status: 'won', collab_id: c.id }).eq('id', p.id);
		toast(`${p.brand_name} is on your board now`, 'check');
		ui.openCollab = c.id;
	}

	async function remove(p: Pitch) {
		if (!(await ask({ title: `Remove ${p.brand_name}?`, ok: 'Remove', danger: true }))) return;
		await supabase.from('pitches').delete().eq('id', p.id);
		load();
	}

	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value;
	const cleanUrl = (u?: string) => (u ? u.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '') : '');
</script>

<svelte:head><title>Pitches · {studio.settings?.app_name}</title></svelte:head>

<div class="pt2">
	<!-- Editorial Outreach Hero -->
	<section class="pt2-hero rv" aria-label="Outreach overview">
		<div class="pt2-htop">
			<span class="pt2-eb">Outreach studio</span>
			<span class="pt2-status" class:on={s.pitch_auto ?? false}>
				<i class="pt2-dot" aria-hidden="true"></i>
				<span>{s.pitch_auto ? (auto ? 'Autopilot · Auto' : 'Autopilot · On') : 'Manual'}</span>
			</span>
		</div>

		<div class="pt2-hmain">
			<div>
				<b class="pt2-hnum num">{totalOutreach}</b>
				<span class="pt2-hsub">
					brand{totalOutreach === 1 ? '' : 's'} pitched{#if counts.fresh} · <em>{counts.fresh} new</em>{/if}
				</span>
			</div>
		</div>

		<div class="pt2-kpi4">
			<button type="button" onclick={() => { tab = 'pitches'; stageFilter = 'new'; }}>
				<small>New</small>
				<b class="num rose">{counts.fresh}</b>
			</button>
			<button type="button" onclick={() => { tab = 'pitches'; stageFilter = 'wishlist'; }}>
				<small>Wishlist</small>
				<b class="num vio">{counts.wishlist}</b>
			</button>
			<button type="button" onclick={() => { tab = 'pitches'; stageFilter = 'pitched'; }}>
				<small>Pitched</small>
				<b class="num warn">{counts.pitched}</b>
			</button>
			<button type="button" onclick={() => { tab = 'pitches'; stageFilter = 'replied'; }}>
				<small>Replied</small>
				<b class="num ok">{counts.replied}</b>
			</button>
		</div>

		<div class="pt2-hacts">
			<button type="button" class="pt2-neo" onclick={newPitch}>
				<Icon name="plus" /><span>New pitch</span>
			</button>
			<button type="button" class="pt2-find" onclick={findNow} disabled={finding}>
				<Icon name="insta" /><span>{finding ? 'Finding…' : 'Find brands'}</span>
			</button>
		</div>
	</section>

	<!-- Sharp NeoPOP Top View Tabs -->
	<div class="pt2-tabs pt2-tabs-2" role="tablist" aria-label="Show">
		<button type="button" role="tab" aria-selected={view === 'briefs'} class:on={view === 'briefs'} onclick={() => (tab = 'briefs')}>
			Open briefs ({briefs?.length ?? 0})
		</button>
		<button type="button" role="tab" aria-selected={view === 'pitches'} class:on={view === 'pitches'} onclick={() => (tab = 'pitches')}>
			Your pitches ({totalActive})
		</button>
	</div>

	{#if view === null}
		<div class="pt2-empty"><span class="spinner"></span></div>
	{:else if view === 'briefs' && briefs}
		<OpenBriefs bind:briefs />
	{:else}
		<!-- Compact Pitch Autopilot Control Card -->
		<section class="pt2-card pt2-auto rv">
			<div class="pt2-auto-h">
				<div>
					<b>Pitch autopilot</b>
					<small>Finds up to {s.pitch_daily ?? 10} brands a day via Instagram collabs, niche hashtags & Google. New finds land in New for you to pitch, DM, or save to Wishlist.</small>
				</div>
				<input
					type="checkbox"
					class="tgl"
					checked={s.pitch_auto ?? false}
					aria-label="Pitch autopilot"
					onchange={(e) => saveSettings({ pitch_auto: (e.currentTarget as HTMLInputElement).checked })}
				/>
			</div>

			{#if s.pitch_auto}
				<div class="pt2-tabs pt2-tabs-2" role="radiogroup" aria-label="How pitches go out">
					<button type="button" class:on={!auto} onclick={() => saveSettings({ pitch_mode: 'approve' })}>Ask me first</button>
					<button type="button" class:on={auto} onclick={() => saveSettings({ pitch_mode: 'auto' })}>Fully automatic</button>
				</div>
				<div class="pt2-auto-foot">
					<small>{auto ? 'Runs daily at 8:30 AM and sends automatically.' : 'Runs daily at 8:30 AM. Emails send only after you approve.'}</small>
					{#if waiting.length > 1}
						<button type="button" class="pt2-neo sm" onclick={() => approve(waiting)}>
							<Icon name="check" /><span>Approve all {waiting.length}</span>
						</button>
					{/if}
				</div>
			{/if}
		</section>

		<!-- Unified 4-Stage Sharp NeoPOP Tabs -->
		<div class="pt2-tabs pt2-tabs-4" role="tablist" aria-label="Pitch stages">
			<button type="button" role="tab" aria-selected={stageFilter === 'new'} class:on={stageFilter === 'new'} onclick={() => (stageFilter = 'new')}>
				New{#if counts.fresh} ({counts.fresh}){/if}
			</button>
			<button type="button" role="tab" aria-selected={stageFilter === 'wishlist'} class:on={stageFilter === 'wishlist'} onclick={() => (stageFilter = 'wishlist')}>
				Wishlist{#if counts.wishlist} ({counts.wishlist}){/if}
			</button>
			<button type="button" role="tab" aria-selected={stageFilter === 'pitched'} class:on={stageFilter === 'pitched'} onclick={() => (stageFilter = 'pitched')}>
				Pitched{#if counts.pitched} ({counts.pitched}){/if}
			</button>
			<button type="button" role="tab" aria-selected={stageFilter === 'replied'} class:on={stageFilter === 'replied'} onclick={() => (stageFilter = 'replied')}>
				Replied{#if counts.replied} ({counts.replied}){/if}
			</button>
		</div>

		{#if shown.length}
			<div class="pt2-list">
				{#each shown as p (p.id)}
					{@const igH = handleOf(p)}
					{@const age = ageInfo(p)}
					{@const freshCard = stageFilter === 'new' && age.fresh}
					{@const meta = isQueuedPitch(p) ? { t: goes(p), tone: 'ok' } : isNewPitch(p) ? { t: p.email ? 'Email ready' : 'IG DM', tone: p.email ? 'warn' : 'vio' } : LABEL[p.status]}
					<article class="pt2-card pt2-brand" class:is-fresh={freshCard}>
						<div class="pt2-bh">
							<Mono name={p.brand_name} size="sm" />
							<div class="pt2-bid">
								<button type="button" class="pt2-bname" onclick={() => (open = { ...p })}>{p.brand_name}</button>
								<div class="pt2-bsub">
									{#if igH}<a href="https://www.instagram.com/{igH}/" target="_blank" rel="noopener">@{igH}</a>{/if}
									{#if p.category}<span>{p.category}</span>{/if}
									{#if age.label}<span class="pt2-age" class:fresh={age.fresh}>{age.label}</span>{/if}
									{#if p.dm_sent_at}<span class="ok">DM {fmt(p.dm_sent_at.slice(0, 10))}</span>{/if}
								</div>
							</div>
							<span class="pt2-pill {meta.tone}">{meta.t}</span>
						</div>

						{#if p.fit_note}
							<p class="pt2-why">{p.fit_note}</p>
						{:else if p.status === 'sent'}
							<p class="pt2-why">
								Pitched {fmt(p.sent_at?.slice(0, 10))}{p.followups ? ` · ${p.followups} follow-up${p.followups > 1 ? 's' : ''} sent` : ''}{p.auto_follow && p.followups < 2 && p.next_follow_on ? ` · next follow-up ${fmt(p.next_follow_on)}` : ''}
							</p>
						{/if}

						{#if p.email || p.website}
							<div class="pt2-contact">
								{#if p.email}<span><Icon name="mail" />{p.email}</span>{/if}
								{#if p.website}<a href={p.website} target="_blank" rel="noopener"><Icon name="globe" />{cleanUrl(p.website)}</a>{/if}
							</div>
						{/if}

						<div class="pt2-bacts">
							{#if isNewPitch(p)}
								{#if p.email}
									<button type="button" class="pt2-neo sm" onclick={() => approve([p])}>
										<Icon name="check" /><span>Approve</span>
									</button>
									{#if igH}
										<button type="button" class="pt2-btn" onclick={() => dm(p)}>
											<Icon name="insta" /><span>{p.dm_sent_at ? 'DM again' : 'DM'}</span>
										</button>
									{/if}
								{:else if igH}
									<button type="button" class="pt2-neo sm" onclick={() => dm(p)}>
										<Icon name="insta" /><span>{p.dm_sent_at ? 'DM again' : 'DM on IG'}</span>
									</button>
								{:else}
									<button type="button" class="pt2-neo sm" onclick={() => (open = { ...p })}>
										<Icon name="send" /><span>Pitch</span>
									</button>
								{/if}
								<button type="button" class="pt2-btn" onclick={() => saveToWishlist(p)} title="Save to Wishlist for future reference">
									<Icon name="pin" /><span>Wishlist</span>
								</button>
								<button type="button" class="pt2-icbtn" aria-label="Edit pitch" onclick={() => (open = { ...p })}>
									<Icon name="edit" />
								</button>
								<button type="button" class="pt2-icbtn" aria-label="Skip brand" onclick={() => skip(p)}>
									<Icon name="x" />
								</button>
							{:else if p.status === 'idea' || p.status === 'not_now'}
								{#if p.email}
									<button type="button" class="pt2-neo sm" onclick={() => (open = { ...p })}>
										<Icon name="send" /><span>Email pitch</span>
									</button>
								{:else if igH}
									<button type="button" class="pt2-neo sm" onclick={() => dm(p)}>
										<Icon name="insta" /><span>{p.dm_sent_at ? 'DM again' : 'DM on IG'}</span>
									</button>
								{:else}
									<button type="button" class="pt2-neo sm" onclick={() => (open = { ...p })}>
										<Icon name="send" /><span>Pitch</span>
									</button>
								{/if}
								{#if igH && p.email}
									<button type="button" class="pt2-btn" onclick={() => dm(p)}>
										<Icon name="insta" /><span>DM</span>
									</button>
								{/if}
								{#if !p.email}
									<button type="button" class="pt2-btn" onclick={() => (open = { ...p })}>
										<Icon name="edit" /><span>Edit</span>
									</button>
								{/if}
							{:else if isQueuedPitch(p)}
								{#if igH}
									<button type="button" class="pt2-btn" onclick={() => dm(p)}>
										<Icon name="insta" /><span>{p.dm_sent_at ? 'DM again' : 'DM'}</span>
									</button>
								{/if}
								<button type="button" class="pt2-btn" onclick={() => saveToWishlist(p)}>
									<Icon name="pin" /><span>Wishlist</span>
								</button>
								<button type="button" class="pt2-icbtn" aria-label="Edit pitch" onclick={() => (open = { ...p })}>
									<Icon name="edit" />
								</button>
							{/if}

							{#if p.status === 'sent'}
								<button type="button" class="pt2-btn" onclick={() => setStatus(p, 'replied')}>
									<Icon name="mail" /><span>Replied</span>
								</button>
								{#if igH}
									<button type="button" class="pt2-btn" onclick={() => dm(p)}>
										<Icon name="insta" /><span>{p.dm_sent_at ? 'DM again' : 'DM'}</span>
									</button>
								{/if}
								<button type="button" class="pt2-neo sm" onclick={() => won(p)}>
									<Icon name="check" /><span>Won</span>
								</button>
							{/if}

							{#if p.status === 'replied'}
								<button type="button" class="pt2-neo sm" onclick={() => won(p)}>
									<Icon name="check" /><span>Move to collab</span>
								</button>
								{#if igH}
									<button type="button" class="pt2-btn" onclick={() => dm(p)}>
										<Icon name="insta" /><span>DM</span>
									</button>
								{/if}
							{/if}

							{#if p.status === 'won' && p.collab_id}
								<button type="button" class="pt2-btn" onclick={() => (ui.openCollab = p.collab_id)}>
									<Icon name="board" /><span>Open collab</span>
								</button>
							{/if}

							{#if !isNewPitch(p) && !isQueuedPitch(p) && p.status !== 'won' && p.status !== 'idea' && p.status !== 'not_now'}
								<button type="button" class="pt2-icbtn" title="Save to Wishlist" aria-label="Save to Wishlist" onclick={() => saveToWishlist(p)}>
									<Icon name="pin" />
								</button>
							{/if}
							{#if !isNewPitch(p)}
								<button type="button" class="pt2-icbtn" title="Remove" aria-label="Remove" onclick={() => remove(p)}>
									<Icon name="x" />
								</button>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{:else}
			<section class="pt2-card pt2-empty">
				{#if loaded}
					<span class="pt2-eic"><Icon name="send" /></span>
					<b>{stageFilter === 'new' ? 'No new brands waiting' : stageFilter === 'wishlist' ? 'Your wishlist is empty' : stageFilter === 'pitched' ? 'No pitches sent yet' : 'No replies or wins yet'}</b>
					<small>{stageFilter === 'wishlist' ? 'Tap Wishlist on any brand in New to save it here for future reference.' : 'Tap Find brands above to pull active brands from Instagram, or add a brand manually.'}</small>
					<div class="pt2-eacts">
						<button type="button" class="pt2-neo sm" onclick={newPitch}><Icon name="plus" /><span>New pitch</span></button>
						<button type="button" class="pt2-find sm" onclick={findNow} disabled={finding}><Icon name="insta" /><span>Find brands</span></button>
					</div>
				{:else}
					<span class="spinner"></span>
				{/if}
			</section>
		{/if}
	{/if}
</div>

{#if finding}
	<div class="pt2-ov" use:portal aria-live="polite" role="status">
		<section class="pt2-ov-card">
			<div class="pt2-orb" aria-hidden="true">
				<span class="pt2-ring"></span>
				<span class="pt2-core"><Logo size={30} /></span>
			</div>
			<span class="pt2-ov-eb">Pitch Autopilot</span>
			<h2>Finding brands for you</h2>
			<p class="pt2-ov-sub">Scanning Instagram collabs and niche hashtags for active brands that match your profile.</p>
			<div class="pt2-steps">
				{#each FIND_STEPS as label, i (label)}
					<div class="pt2-step" class:done={i < findStep} class:active={i === findStep}>
						<span class="pt2-sdot" aria-hidden="true">
							{#if i < findStep}<Icon name="check" />{:else}<i></i>{/if}
						</span>
						<span>{label}</span>
					</div>
				{/each}
			</div>
		</section>
	</div>
{/if}

{#if open}
	<div class="dialog-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (open = null)}>
		<div class="dialog quote-dialog" role="dialog" aria-modal="true" aria-labelledby="pt-title">
			<h2 id="pt-title">{open.id ? `Pitch ${open.brand_name}` : 'New pitch'}</h2>
			<p>Sent from your own email, so their reply lands in your inbox—or save to your Wishlist for later.</p>
			<div class="fields">
				<div class="f"><label for="pt-brand">Brand</label><input class="inp" id="pt-brand" bind:value={open.brand_name} placeholder="Brand name" /></div>
				<div class="f"><label for="pt-ig">Instagram <span class="hint">(optional)</span></label><div class="pre"><span>@</span><input class="inp" id="pt-ig" value={open.instagram} oninput={(e) => open && (open.instagram = val(e).replace(/^@/, ''))} /></div></div>
				<div class="f"><label for="pt-contact">Contact name <span class="hint">(optional)</span></label><input class="inp" id="pt-contact" bind:value={open.contact_name} placeholder="Marketing lead" /></div>
				<div class="f"><label for="pt-email">Their email</label><input class="inp" id="pt-email" type="email" bind:value={open.email} placeholder="collabs@brand.com" /></div>
			</div>
			<div class="pt-write">
				{#if writing}<AiThinking label="Writing your pitch" />{:else}<button class="btn sm ai-btn" onclick={writeAi}><Icon name="spark" />Write with AI</button>{/if}
				<button class="btn sm ghost" onclick={() => open && Object.assign(open, template(open))}><Icon name="edit" />Use a template</button>
			</div>
			<div class="f"><label for="pt-subj">Subject</label><input class="inp" id="pt-subj" bind:value={open.subject} /></div>
			<div class="f" style="margin-top:10px"><label for="pt-body">Message</label><textarea class="inp" id="pt-body" rows="10" bind:value={open.body}></textarea></div>
			<label class="check-row"><input type="checkbox" class="cbx" bind:checked={open.auto_follow} /><span>Send two polite follow-ups if they don't reply (after 5 and 12 days)</span></label>
			<div class="row">
				<button class="btn ghost" onclick={() => (open = null)}>Cancel</button>
				<button class="btn" disabled={busy || !open.brand_name?.trim()} onclick={() => save(false)}>Save to wishlist</button>
				<button class="btn grad" disabled={busy || !open.brand_name?.trim() || !open.email?.trim()} onclick={() => save(true)}>{#if busy}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Send pitch</button>
			</div>
		</div>
	</div>
{/if}

{#if dmFor}
	<div class="dialog-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (dmFor = null)}>
		<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dm-title">
			<h2 id="dm-title">DM {dmFor.brand_name}</h2>
			<p>We copy this and open your chat with @{handleOf(dmFor)}. In the chat, hold the message box, tap <b>Paste</b>, then send.</p>
			<div class="f"><label for="dm-body">Your message</label><textarea class="inp" id="dm-body" rows="8" bind:value={dmBody}></textarea></div>
			<div class="row">
				<button class="btn ghost" onclick={() => (dmFor = null)}>Cancel</button>
				<button class="btn grad" disabled={!dmBody.trim()} onclick={sendDm}><Icon name="insta" />Copy &amp; open</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.pt2 {
		max-width: 780px;
		margin: 0 auto;
		display: grid;
		gap: 14px;
		padding-bottom: 32px;
	}
	.pt2-hero {
		border-radius: 20px;
		border: 1px solid var(--line-strong);
		background:
			radial-gradient(240px 140px at 90% 0%, color-mix(in oklab, var(--g2) 20%, transparent), transparent 72%),
			radial-gradient(200px 130px at 10% 0%, color-mix(in oklab, var(--g1) 16%, transparent), transparent 70%),
			linear-gradient(180deg, #1e1721 0%, #151018 100%);
		padding: 16px;
		display: grid;
		gap: 13px;
	}
	.pt2-htop {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.pt2-eb {
		font: 700 11px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.pt2-status {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 99px;
		font: 700 11px/1.2 var(--f-mono, ui-monospace, monospace);
		text-transform: uppercase;
		color: var(--ink-3);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--line);
	}
	.pt2-status.on {
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 13%, transparent);
		border-color: color-mix(in oklab, var(--ok) 34%, transparent);
	}
	.pt2-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	.pt2-hmain {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	.pt2-hnum {
		font: 400 44px/1 var(--f-serif, Georgia, serif);
		color: var(--ink);
		margin-right: 8px;
	}
	.pt2-hsub {
		font-size: 14.5px;
		color: var(--ink-2);
	}
	.pt2-hsub em {
		font-style: normal;
		color: var(--g3);
		font-weight: 600;
	}
	.pt2-kpi4 {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 7px;
	}
	.pt2-kpi4 button {
		border: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.03);
		border-radius: 13px;
		padding: 9px 7px;
		display: grid;
		gap: 2px;
		text-align: left;
		cursor: pointer;
	}
	.pt2-kpi4 small {
		font-size: 11px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.pt2-kpi4 b {
		font: 400 22px/1.1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.pt2-kpi4 b.vio { color: var(--g1); }
	.pt2-kpi4 b.warn { color: var(--g3); }
	.pt2-kpi4 b.ok { color: var(--ok); }

	.pt2-hacts {
		display: grid;
		grid-template-columns: 1.25fr 1fr;
		gap: 9px;
	}
	.pt2-neo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 42px;
		padding: 0 15px;
		border-radius: 0;
		border: 1px solid var(--ink);
		background: var(--ink);
		color: var(--bg);
		font: 700 14px/1 var(--f-body, inherit);
		box-shadow: 3px 3px 0 var(--g2);
		cursor: pointer;
		white-space: nowrap;
	}
	.pt2-neo.sm {
		min-height: 36px;
		padding: 0 12px;
		font-size: 13px;
		box-shadow: 2.5px 2.5px 0 var(--g2);
	}
	.pt2-neo :global(.ic) { width: 15px; height: 15px; }

	.pt2-find {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		min-height: 42px;
		padding: 0 14px;
		border-radius: 0;
		border: 1px solid color-mix(in oklab, var(--g1) 46%, var(--line-strong));
		background: color-mix(in oklab, var(--g1) 13%, var(--surface-2));
		color: var(--ink);
		font: 700 13.5px/1 var(--f-body, inherit);
		cursor: pointer;
		white-space: nowrap;
	}
	.pt2-find.sm {
		min-height: 36px;
		padding: 0 12px;
		font-size: 13px;
	}
	.pt2-find:disabled { opacity: 0.55; cursor: default; }
	.pt2-find :global(.ic) { width: 15px; height: 15px; color: var(--g1); }

	/* Sharp NeoPOP Segmented Tabs */
	.pt2-tabs {
		display: grid;
		border: 1px solid var(--line-strong);
		background: var(--surface);
	}
	.pt2-tabs-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	.pt2-tabs-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
	.pt2-tabs button {
		min-height: 40px;
		padding: 8px 4px;
		border: 0;
		border-right: 1px solid var(--line);
		background: transparent;
		color: var(--ink-2);
		font: 700 11px/1 var(--f-body, inherit);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.pt2-tabs button:last-child { border-right: 0; }
	.pt2-tabs button.on {
		background: var(--ink);
		color: var(--bg);
		box-shadow: inset 0 -3px 0 var(--g2);
	}

	.pt2-card {
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-radius: 18px;
		padding: 15px;
		display: grid;
		gap: 12px;
	}
	.pt2-auto-h {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.pt2-auto-h b { display: block; font-size: 15.5px; color: var(--ink); }
	.pt2-auto-h small { display: block; margin-top: 3px; font-size: 13px; line-height: 1.45; color: var(--ink-2); }
	.pt2-auto-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.pt2-auto-foot small { font-size: 12.5px; color: var(--ink-3); }


	.pt2-list { display: grid; gap: 11px; }
	.pt2-brand {
		background:
			radial-gradient(200px 100px at 100% 0%, color-mix(in oklab, var(--g1) 10%, transparent), transparent 72%),
			var(--surface);
	}
	.pt2-brand.is-fresh {
		background:
			radial-gradient(200px 100px at 100% 0%, color-mix(in oklab, var(--g2) 12%, transparent), transparent 72%),
			var(--surface);
	}
	.pt2-bh {
		display: flex;
		align-items: center;
		gap: 11px;
		min-width: 0;
	}
	.pt2-bh :global(.mono) { flex: none; }
	.pt2-bid { flex: 1; min-width: 0; display: grid; gap: 2px; }
	.pt2-bname {
		border: 0;
		background: none;
		padding: 0;
		text-align: left;
		font: 400 21px/1.12 var(--f-serif, Georgia, serif);
		color: var(--ink);
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pt2-bsub {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 13px;
		color: var(--ink-3);
	}
	.pt2-bsub a { color: var(--g1); text-decoration: none; font-weight: 600; }
	.pt2-bsub .ok { color: var(--ok); }

	.pt2-pill {
		flex: none;
		padding: 4px 9px;
		border-radius: 99px;
		font: 700 10.5px/1.2 var(--f-mono, ui-monospace, monospace);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.pt2-pill.ok { color: var(--ok); background: color-mix(in oklab, var(--ok) 13%, transparent); border: 1px solid color-mix(in oklab, var(--ok) 32%, var(--line)); }
	.pt2-pill.warn { color: var(--g3); background: color-mix(in oklab, var(--g3) 13%, transparent); border: 1px solid color-mix(in oklab, var(--g3) 34%, var(--line)); }
	.pt2-pill.vio { color: var(--g1); background: color-mix(in oklab, var(--g1) 13%, transparent); border: 1px solid color-mix(in oklab, var(--g1) 34%, var(--line)); }
	.pt2-pill.muted { color: var(--ink-3); background: var(--surface-2); border: 1px solid var(--line); }

	.pt2-why {
		margin: 0;
		font-size: 13.5px;
		line-height: 1.45;
		color: var(--ink-2);
	}
	.pt2-contact {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.pt2-contact span,
	.pt2-contact a {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--ink-2);
		text-decoration: none;
	}
	.pt2-contact :global(.ic) { width: 14px; height: 14px; color: var(--g1); }

	.pt2-bacts {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		padding-top: 10px;
		border-top: 1px dashed var(--line-strong);
	}
	.pt2-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 0 11px;
		border-radius: 10px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		color: var(--ink);
		font: 600 13px/1 var(--f-body, inherit);
		cursor: pointer;
	}
	.pt2-btn :global(.ic) { width: 14px; height: 14px; color: var(--g1); }
	.pt2-icbtn {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		border: 1px solid var(--line);
		background: var(--surface-2);
		color: var(--ink-3);
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.pt2-icbtn :global(.ic) { width: 15px; height: 15px; }

	.pt2-empty {
		justify-items: center;
		text-align: center;
		padding: 28px 18px;
		gap: 9px;
	}
	.pt2-eic {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		display: grid;
		place-items: center;
		background: var(--surface-2);
		border: 1px solid var(--line);
		color: var(--g2);
	}
	.pt2-empty b { font-size: 16.5px; color: var(--ink); }
	.pt2-empty small { font-size: 13.5px; color: var(--ink-3); max-width: 34ch; line-height: 1.45; }
	.pt2-eacts { display: flex; gap: 10px; margin-top: 6px; flex-wrap: wrap; justify-content: center; }

	.pt-write { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }

	/* Animated Instagram Discovery Overlay */
	@property --pt-rim { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
	@keyframes ptSpin { to { --pt-rim: 360deg; } }
	@keyframes ptPulse { 0%, 100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.16); opacity: 1; } }
	.pt2-ov {
		position: fixed;
		inset: 0;
		z-index: 220;
		display: grid;
		place-items: center;
		padding: 24px 16px;
		background: rgba(12, 8, 14, 0.88);
		-webkit-backdrop-filter: blur(18px);
		backdrop-filter: blur(18px);
	}
	.pt2-ov-card {
		position: relative;
		width: 100%;
		max-width: 390px;
		padding: 30px 22px 26px;
		border-radius: 24px;
		background:
			radial-gradient(120% 90% at 95% 0%, rgba(242, 90, 144, 0.16), transparent 55%),
			radial-gradient(95% 95% at 5% 100%, rgba(156, 123, 255, 0.14), transparent 55%),
			#19131e;
		text-align: center;
		display: grid;
		justify-items: center;
		gap: 10px;
		box-shadow: 0 24px 50px -28px rgba(0, 0, 0, 0.75);
	}
	.pt2-ov-card::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		padding: 1.25px;
		background: conic-gradient(from var(--pt-rim), #9c7bff, #f25a90, #ffae6b, rgba(255, 255, 255, 0.08) 48%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		pointer-events: none;
		animation: ptSpin 5s linear infinite;
	}
	.pt2-orb { position: relative; width: 72px; height: 72px; margin-bottom: 4px; display: grid; place-items: center; }
	.pt2-ring {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		padding: 2.5px;
		background: conic-gradient(from var(--pt-rim), #9c7bff, #f25a90, #ffae6b, transparent 62%, #9c7bff);
		-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
		-webkit-mask-composite: xor;
		mask-composite: exclude;
		animation: ptSpin 1.8s linear infinite;
	}
	.pt2-core {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: #140f17;
		border: 1px solid rgba(255, 255, 255, 0.08);
		display: grid;
		place-items: center;
	}
	.pt2-ov-eb { font: 700 11px/1.2 var(--f-mono, ui-monospace, monospace); letter-spacing: 0.14em; text-transform: uppercase; color: #9b8fa8; }
	.pt2-ov-card h2 { margin: 0; font: 400 26px/1.1 var(--f-serif, Georgia, serif); color: #faf7fc; }
	.pt2-ov-sub { margin: 0; font-size: 14px; line-height: 1.5; color: #cfc6d6; max-width: 32ch; }
	.pt2-steps { width: 100%; margin-top: 10px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.09); display: grid; gap: 10px; text-align: left; }
	.pt2-step { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #7d7288; transition: color 0.2s; }
	.pt2-step.active { color: #faf7fc; font-weight: 500; }
	.pt2-step.done { color: #4ade80; }
	.pt2-sdot { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.14); display: grid; place-items: center; flex-shrink: 0; }
	.pt2-step.active .pt2-sdot { border-color: #f25a90; }
	.pt2-step.active .pt2-sdot i { width: 7px; height: 7px; border-radius: 50%; background: linear-gradient(135deg, #9c7bff, #f25a90, #ffae6b); animation: ptPulse 1.1s ease-in-out infinite; }
	.pt2-step.done .pt2-sdot { border-color: rgba(74, 222, 128, 0.45); background: rgba(74, 222, 128, 0.12); color: #4ade80; }
	.pt2-step.done .pt2-sdot :global(.ic) { width: 12px; height: 12px; }
	.pt2-kpi4 .num.rose { color: #f25a90; }
	.pt2-brand.is-fresh { border-color: rgba(242, 90, 144, 0.36); background: linear-gradient(155deg, rgba(242, 90, 144, 0.08), rgba(156, 123, 255, 0.05) 45%, var(--paper) 100%); }
	.pt2-age { font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
	.pt2-age.fresh { color: #f79fc0; font-weight: 600; }
</style>
