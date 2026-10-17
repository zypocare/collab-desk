<script lang="ts">
	import { ask } from '#lib/confirm.svelte.ts';
	import { onMount } from 'svelte';
	import { createCollab, studio } from '#lib/studio.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { askAi } from '#lib/ai.ts';
	import { toast, ui } from '#lib/ui.svelte.ts';
	import { emailOk, errMessage, fmt } from '#lib/util.ts';
	import AiThinking from '#lib/components/AiThinking.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import Segmented from '#lib/components/Segmented.svelte';

	// Brands she'd like to work with: a wishlist, a pitch from her own email, polite follow-ups.
	type Pitch = {
		id: string; brand_name: string; instagram: string; category: string; contact_name: string; email: string; subject: string; body: string;
		status: 'idea' | 'sent' | 'replied' | 'won' | 'not_now'; auto_follow: boolean; followups: number; sent_at: string | null; next_follow_on: string | null; collab_id: string | null; created_at: string;
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

	const s = $derived(studio.settings!);
	const link = $derived((s.site_url || location.origin).replace(/\/$/, ''));
	const LABEL: Record<Pitch['status'], { t: string; k: string }> = {
		idea: { t: 'Wishlist', k: 'plain' }, sent: { t: 'Pitched', k: 'k-new' }, replied: { t: 'Replied', k: 'k-pay' }, won: { t: 'Won', k: 'k-live' }, not_now: { t: 'Not now', k: 'plain' }
	};
	const shown = $derived(list.filter((p) => show === 'all' || ['idea', 'sent', 'replied'].includes(p.status)));
	const counts = $derived({ idea: list.filter((p) => p.status === 'idea').length, sent: list.filter((p) => p.status === 'sent').length, won: list.filter((p) => p.status === 'won').length });

	function template(p: Partial<Pitch>) {
		const first = (p.contact_name ?? '').split(' ')[0] || 'there';
		return {
			subject: `Content idea for ${p.brand_name || 'your brand'}`,
			body: `Hi ${first},\n\nI'm ${s.display_name} (@${s.handle}), a ${s.niche || 'lifestyle'} creator from ${s.city || 'India'}. I love what ${p.brand_name || 'you'} ${p.brand_name ? 'is' : 'are'} doing and would really enjoy creating for you.\n\nOne idea: a Reel that shows how your product fits into a real day, the way my audience follows along every week.\n\nMy rates, audience and past results are all here: ${link}\n\nWould a quick chat this week work?\n\nThanks,\n${s.display_name}`
		};
	}
	function newPitch() {
		open = { brand_name: '', instagram: '', category: '', contact_name: '', email: '', subject: '', body: '', auto_follow: true };
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

<div class="toolbar rv" style="--i:1">
	<Segmented label="Show" bind:value={show} options={[{ value: 'open', label: 'In progress' }, { value: 'all', label: 'All' }]} />
</div>

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
