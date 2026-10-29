<script lang="ts">
	import { ask } from '#lib/confirm.svelte.ts';
	import { onMount } from 'svelte';
	import { createCollab, saveSettings, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { askAi } from '#lib/ai.ts';
	import { toast, ui } from '#lib/ui.svelte.ts';
	import { emailOk, errMessage, fmt } from '#lib/util.ts';
	import AiThinking from '#lib/components/AiThinking.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import Segmented from '#lib/components/Segmented.svelte';
	import Ticket from '#lib/components/Ticket.svelte';
	import OpenBriefs from '#lib/components/OpenBriefs.svelte';
	import { openBriefs } from '#lib/campaigns.svelte.ts';
	import type { OpenBrief } from '#lib/types.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { openOutside } from '#lib/native.ts';

	// Brands she'd like to work with: a wishlist, a pitch from her own email, polite follow-ups.
	type Pitch = {
		id: string; brand_name: string; instagram: string; category: string; contact_name: string; email: string; subject: string; body: string;
		status: 'idea' | 'ready' | 'sent' | 'replied' | 'won' | 'not_now' | 'skipped'; auto_follow: boolean; website?: string; source?: string; fit_note?: string; approved?: boolean; send_after?: string | null; followups: number; dm_sent_at?: string | null; sent_at: string | null; next_follow_on: string | null; collab_id: string | null; created_at: string;
	};
	let list = $state<Pitch[]>([]);
	let loaded = $state(false);
	let show = $state<'open' | 'all'>('open');
	let open = $state<Partial<Pitch> | null>(null);
	let busy = $state(false);
	let writing = $state(false);

	async function load() {
		const { data } = await supabase.from('pitches').select('*').order('created_at', { ascending: false });
		list = (data as Pitch[]) ?? [];
		loaded = true;
	}
	onMount(load);

	// Two lists here: open briefs from brands, and her own pitches. Opens on the briefs only when there are some.
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
	const LABEL: Record<Pitch['status'], { t: string; k: string }> = {
		idea: { t: 'Wishlist', k: 'plain' }, sent: { t: 'Pitched', k: 'k-new' }, replied: { t: 'Replied', k: 'k-pay' }, won: { t: 'Won', k: 'k-live' }, not_now: { t: 'Not now', k: 'plain' }, ready: { t: 'Ready', k: 'k-new' }, skipped: { t: 'Skipped', k: 'plain' }
	};
	const shown = $derived(list.filter((p) => p.status !== 'ready' && (show === 'all' || ['idea', 'sent', 'replied'].includes(p.status))));
	// Pitch autopilot: what's queued to go out today, soonest first.
	const ready = $derived(list.filter((p) => p.status === 'ready').sort((a, b) => (a.send_after ?? '').localeCompare(b.send_after ?? '')));
	const auto = $derived(s.pitch_mode === 'auto');
	const waiting = $derived(ready.filter((p) => !p.approved && !auto));
	const at = (t: string | null | undefined) => (t ? new Date(t).toLocaleString('en-IN', { weekday: new Date(t).toDateString() === new Date().toDateString() ? undefined : 'short', hour: 'numeric', minute: '2-digit' }) : '');
	const goes = (p: Pitch) => (p.approved || auto ? `Goes out ${at(p.send_after)}` : 'Waiting for your OK');
	async function approve(ps: Pitch[]) {
		const { error } = await supabase.from('pitches').update({ approved: true }).in('id', ps.map((p) => p.id));
		if (error) return toast(errMessage(error), 'alert');
		toast(ps.length === 1 ? `${ps[0].brand_name} goes out ${at(ps[0].send_after)}` : `${ps.length} pitches approved. They go out one at a time through the day.`, 'send');
		load();
	}
	async function skip(p: Pitch) {
		await supabase.from('pitches').update({ status: 'skipped' }).eq('id', p.id);
		toast(`${p.brand_name} skipped. It won't come back.`, 'x');
		load();
	}
	let finding = $state(false);
	async function findNow() {
		finding = true;
		const { data, error } = await supabase.functions.invoke('pitch-finder', { body: {} });
		finding = false;
		if (error) {
			// The finder says what went wrong in its reply; show that, not the generic status message.
			const said = await (error as { context?: Response }).context?.json?.().catch(() => null);
			return toast(`Couldn't find brands just now: ${said?.error ?? said?.skipped ?? errMessage(error)}`, 'alert');
		}
		const r = data as { added?: number; skipped?: string; error?: string };
		if (r.error) return toast(r.error, 'alert');
		toast(r.added ? `${r.added} new brand${r.added === 1 ? '' : 's'} ready` : r.skipped ? `Nothing new: ${r.skipped}` : 'No new brands with a public email today', r.added ? 'check' : 'alert');
		load();
	}
	// Instagram: Meta doesn't let an app start a DM, so Miracle writes a short one, copies it and opens the brand's
	// chat; she pastes and taps send, from her own account. The pitch remembers she did.
	const handleOf = (p: Pitch) => (p.instagram ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '');
	function dmText(p: Pitch) {
		// "Lifestyle, Travel, Fashion, Yoga" reads as "a lifestyle and travel creator".
		const niche = (s.niche || '').split(/[,/·|]/).map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 2).join(' and ') || 'content';
		const intro = `Hi ${p.brand_name} team! I'm ${s.display_name} (@${s.handle}), a ${niche} creator from ${s.city || 'India'}.`;
		return `${intro} I love what you're doing and would love to create content for ${p.brand_name}. My rates, past work and live Instagram numbers are all here: ${link}\n\nHappy to share a few ideas if you're open to it!`;
	}
	// The icon opens a sheet with the message (she can read or change it); its button copies it and opens the chat.
	let dmFor = $state<Pitch | null>(null);
	let dmBody = $state('');
	function dm(p: Pitch) {
		if (!handleOf(p)) return;
		dmFor = p;
		dmBody = dmText(p);
	}
	// Copied the old way first: inside the phone app the clipboard API can be refused without a word.
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
		// Copy, then open the chat in the same tap (a phone only opens Instagram from a tap).
		copyNow(dmBody.trim());
		toast('Message copied. In the chat, hold the message box, tap Paste, then send.', 'copy');
		openOutside(`https://ig.me/m/${encodeURIComponent(h)}`);
		dmFor = null;
		const at = new Date().toISOString();
		list = list.map((x) => (x.id === p.id ? { ...x, dm_sent_at: at } : x));
		await supabase.from('pitches').update({ dm_sent_at: at }).eq('id', p.id);
	}
	const dmNote = (p: Pitch) => (p.dm_sent_at ? ` · DM sent ${fmt(p.dm_sent_at.slice(0, 10))}` : '');
	const counts = $derived({ idea: list.filter((p) => p.status === 'idea').length, sent: list.filter((p) => p.status === 'sent').length, won: list.filter((p) => p.status === 'won').length });

	function template(p: Partial<Pitch>) {
		const first = (p.contact_name ?? '').split(' ')[0] || 'there';
		return {
			subject: `Content idea for ${p.brand_name || 'your brand'}`,
			body: `Hi ${first},\n\nI'm ${s.display_name} (@${s.handle}), a ${s.niche || 'content'} creator from ${s.city || 'India'}. I love what ${p.brand_name || 'you'} ${p.brand_name ? 'is' : 'are'} doing and would really enjoy creating for you.\n\nOne idea: a Reel that shows how your product fits into a real day, the way my audience follows along every week.\n\nMy rates, audience and past results are all here: ${link}\n\nWould a quick chat this week work?\n\nThanks,\n${s.display_name}`
		};
	}
	function newPitch() {
		tab = 'pitches';
		open ={ brand_name: '', instagram: '', category: '', contact_name: '', email: '', subject: '', body: '', auto_follow: true };
	}
	async function writeAi() {
		if (!open?.brand_name?.trim()) return toast('Add the brand name first', 'alert');
		writing = true;
		try {
			const r = await askAi<{ subject: string; body: string }>('pitch', {
				brand: open.brand_name, brand_instagram: open.instagram, category: open.category, contact: open.contact_name,
				creator: s.display_name, handle: s.handle, niche: s.niche, city: s.city, followers: studio.ig?.followers ?? s.followers,
				engagement: s.engagement, page_link: link, past_brands: [...new Set(studio.collabs.filter((c) => ['live', 'wrapped'].includes(c.stage)).map((c) => c.brand.name))].slice(0, 5)
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
		// Check the email before anything is saved, so a failed send doesn't leave a hidden copy behind.
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
		// From now on this is the saved pitch: trying again updates it instead of adding another.
		open.id = (data as Pitch).id;
		if (send) {
			const r = await supabase.rpc('send_pitch', { p_id: (data as Pitch).id });
			if (r.error) {
				busy = false;
				await load();
				return toast(errMessage(r.error), 'alert');
			}
			toast(`Pitch sent to ${open.brand_name}. Follow-ups go out on their own if they don't reply.`, 'send');
		} else toast('Saved to your wishlist', 'check');
		busy = false;
		open = null;
		load();
	}
	async function setStatus(p: Pitch, status: Pitch['status']) {
		await supabase.from('pitches').update({ status, ...(status === 'replied' ? { replied_at: new Date().toISOString() } : {}) }).eq('id', p.id);
		load();
	}
	async function won(p: Pitch) {
		const c = await createCollab(p.brand_name, { collab: { stage: 'negotiating', contact_name: p.contact_name, contact_email: p.email }, deliverables: [], instagram: p.instagram });
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
</script>

<svelte:head><title>Pitches · {studio.settings?.app_name}</title></svelte:head>

<header class="ph rv">
	<div>
		<div class="eb">Go after the brands you want</div>
		<h1>Your <em>pitches</em></h1>
		<p>{counts.idea} on your wishlist · {counts.sent} pitched · {counts.won} won. Pitches go from your own email; two polite follow-ups go out if they don't reply.</p>
	</div>
	<div class="acts"><button class="btn grad" onclick={newPitch}><Icon name="plus" />New pitch</button></div>
</header>

<div class="m-stages" role="tablist" aria-label="Show">
	<button role="tab" aria-selected={view === 'briefs'} class:on={view === 'briefs'} onclick={() => (tab = 'briefs')}><i class="dt" style="--hue:var(--accent)"></i>Open briefs<span>{briefs?.length ?? 0}</span></button>
	<button role="tab" aria-selected={view === 'pitches'} class:on={view === 'pitches'} onclick={() => (tab = 'pitches')}><i class="dt" style="--hue:var(--ok)"></i>Your pitches<span>{shown.length + ready.length}</span></button>
</div>

{#if view === null}
	<div class="empty"><span class="spinner"></span></div>
{:else if view === 'briefs' && briefs}
	<OpenBriefs bind:briefs />
{:else}
<!-- Pitch autopilot: new brands every morning, pitched from her email. -->
<section class="panel rv pa" style="--i:1">
	<div class="switch-row" style="border-top:0">
		<div><b>Pitch autopilot</b><small>Up to {s.pitch_daily ?? 10} new brands a day that suit you and already work with creators, found with Google and checked for a public email on their own website. Sent from your email between 10 AM and 6 PM, one at a time, with two polite follow-ups. A brand is never pitched twice.</small></div>
		<input type="checkbox" class="tgl" checked={s.pitch_auto ?? false} aria-label="Pitch autopilot" onchange={(e) => saveSettings({ pitch_auto: (e.currentTarget as HTMLInputElement).checked })} />
	</div>
	{#if s.pitch_auto}
		<div class="pa-mode">
			<Segmented label="How pitches go out" value={s.pitch_mode ?? 'approve'} options={[{ value: 'approve', label: 'Ask me first' }, { value: 'auto', label: 'Fully automatic' }]} onchange={(v) => saveSettings({ pitch_mode: v as 'approve' | 'auto' })} />
			<small>{auto ? 'Every morning at 8:30 the day’s pitches are written and go out on their own. You get a note with the brands.' : 'Every morning at 8:30 you get a note. Each pitch goes out only after you approve it.'}</small>
		</div>
		<div class="pa-acts">
			<button class="btn" onclick={findNow} disabled={finding}>{#if finding}<span class="spinner"></span>Finding brands…{:else}<Icon name="search" />Find brands now{/if}</button>
			{#if waiting.length > 1}<button class="btn primary" onclick={() => approve(waiting)}><Icon name="check" />Approve all {waiting.length}</button>{/if}
		</div>
	{/if}
</section>

{#if ready.length}
	<section class="hs pa-q">
		<header class="hs-h"><h2>Ready to send</h2><span class="hs-n">{ready.length}</span></header>
		
			<div class="tks pt-tks">
				{#each ready as p, i (p.id)}
					<Ticket name={p.brand_name} sub={[p.category, p.email].filter(Boolean).join(' · ') + dmNote(p)} task={p.fit_note || p.subject} status={goes(p)} tone={p.approved || auto ? 'ok' : 'warn'} onopen={() => (open = { ...p })} {i}>
						<span class="pt-tk-acts">
							{#if !p.approved && !auto}<button class="btn primary" onclick={() => approve([p])}><Icon name="check" />Approve</button>{/if}
							{#if handleOf(p)}<button class="icon-btn" aria-label="DM {p.brand_name} on Instagram" onclick={() => dm(p)}><Icon name="insta" /></button>{/if}
							<button class="icon-btn" aria-label="Read or change the pitch" onclick={() => (open = { ...p })}><Icon name="edit" /></button>
							<button class="icon-btn" aria-label="Skip this brand" onclick={() => skip(p)}><Icon name="x" /></button>
						</span>
					</Ticket>
				{/each}
			</div>
		
	</section>
{/if}

<div class="toolbar rv" style="--i:1">
	<Segmented label="Show" bind:value={show} options={[{ value: 'open', label: 'In progress' }, { value: 'all', label: 'All' }]} />
</div>

{#if shown.length}
	<!-- Phone: each pitch a ticket, like Needs you on Today. -->
	<section class="tks pt-tks">
		{#each shown as p, i (p.id)}
			<Ticket
				name={p.brand_name}
				sub={(p.instagram ? `${LABEL[p.status].t} · @${handleOf(p)}` : LABEL[p.status].t) + dmNote(p)}
				task={p.status === 'idea' ? 'On your wishlist' : p.status === 'sent' ? `Pitched ${fmt(p.sent_at?.slice(0, 10))}` : p.status === 'replied' ? 'They replied' : p.status === 'won' ? 'Won' : 'Not now'}
				status={p.status === 'sent' ? (p.auto_follow && p.followups < 2 && p.next_follow_on ? `Next follow-up ${fmt(p.next_follow_on)}` : p.followups ? `${p.followups} follow-up${p.followups > 1 ? 's' : ''} sent` : 'Waiting for a reply') : p.status === 'idea' ? 'Not pitched yet' : p.status === 'replied' ? 'Reply and close it' : p.status === 'won' ? 'Now a collab' : 'Parked for later'}
				tone={p.status === 'replied' || p.status === 'won' ? 'ok' : p.status === 'sent' ? 'warn' : 'calm'}
				{i}
			>
				<span class="pt-tk-acts">
					{#if p.status === 'idea'}<button class="btn primary" onclick={() => (open = { ...p })}><Icon name="send" />Pitch</button>{/if}
					{#if handleOf(p) && ['idea', 'sent', 'replied'].includes(p.status)}<button class="btn" onclick={() => dm(p)}><Icon name="insta" />{p.dm_sent_at ? 'DM again' : 'DM'}</button>{/if}
					{#if p.status === 'sent'}<button class="btn" onclick={() => setStatus(p, 'replied')}>Replied</button>{/if}
					{#if p.status === 'sent' || p.status === 'replied'}<button class="btn primary" onclick={() => won(p)}><Icon name="check" />Won</button>{/if}
					{#if p.status === 'won' && p.collab_id}<button class="btn" onclick={() => (ui.openCollab = p.collab_id)}>Open</button>{/if}
					{#if p.status !== 'won' && p.status !== 'not_now'}<button class="icon-btn" aria-label="Not now" onclick={() => setStatus(p, 'not_now')}><Icon name="clock" /></button>{/if}
					<button class="icon-btn" aria-label="Remove" onclick={() => remove(p)}><Icon name="x" /></button>
				</span>
			</Ticket>
		{/each}
	</section>
{:else}
<section class="panel rv pt-list" style="--i:2">
	{#each shown as p (p.id)}
		<div class="pt-row">
			<Mono name={p.brand_name} />
			<div class="pt-b">
				<b>{p.brand_name}{p.instagram ? ` · @${p.instagram}` : ''}</b>
				<small>
					<span class="pill tint {LABEL[p.status].k}">{LABEL[p.status].t}</span>
					{#if p.status === 'sent'}Sent {fmt(p.sent_at?.slice(0, 10))}{p.followups ? ` · ${p.followups} follow-up${p.followups > 1 ? 's' : ''} sent` : ''}{p.auto_follow && p.followups < 2 && p.next_follow_on ? ` · next follow-up ${fmt(p.next_follow_on)}` : p.followups >= 2 ? ' · no reply yet' : ''}{:else if p.email}{p.email}{:else}Add their email to pitch{/if}
				</small>
			</div>
			<div class="pt-acts">
				{#if p.status === 'idea'}<button class="btn sm primary" onclick={() => (open = { ...p })}><Icon name="send" />Pitch</button>{/if}
				{#if handleOf(p) && ['idea', 'sent', 'replied'].includes(p.status)}<button class="btn sm" onclick={() => dm(p)}><Icon name="insta" />{p.dm_sent_at ? 'DM again' : 'DM on Instagram'}</button>{/if}
				{#if p.status === 'sent'}<button class="btn sm" onclick={() => setStatus(p, 'replied')}><Icon name="mail" />They replied</button>{/if}
				{#if p.status === 'sent' || p.status === 'replied'}<button class="btn sm primary" onclick={() => won(p)}><Icon name="check" />Won</button>{/if}
				{#if p.status === 'won' && p.collab_id}<button class="btn sm" onclick={() => (ui.openCollab = p.collab_id)}>Open collab</button>{/if}
				{#if p.status !== 'won' && p.status !== 'not_now'}<button class="icon-btn" title="Not now" aria-label="Not now" onclick={() => setStatus(p, 'not_now')}><Icon name="clock" /></button>{/if}
				<button class="icon-btn" title="Remove" aria-label="Remove" onclick={() => remove(p)}><Icon name="x" /></button>
			</div>
		</div>
	{:else}
		<div class="empty">
			{#if loaded}<b>No pitches yet</b><small>Add the brands you'd love to work with. Pitch them from here; follow-ups go out on their own.</small><button class="btn grad" style="margin-top:10px" onclick={newPitch}><Icon name="plus" />New pitch</button>{:else}<span class="spinner"></span>{/if}
		</div>
	{/each}
</section>
{/if}
{/if}

{#if open}
	<div class="dialog-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (open = null)}>
		<div class="dialog quote-dialog" role="dialog" aria-modal="true" aria-labelledby="pt-title">
			<h2 id="pt-title">{open.id ? `Pitch ${open.brand_name}` : 'New pitch'}</h2>
			<p>Sent from your own email, so their reply lands in your inbox.</p>
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
	<!-- Instagram doesn't let any app type into a chat, so the message goes on her clipboard and she pastes it. -->
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
