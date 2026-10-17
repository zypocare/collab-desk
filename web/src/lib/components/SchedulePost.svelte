<script lang="ts">
	import { onMount } from 'svelte';
	import { ask } from '../confirm.svelte';
	import { studio } from '../studio.svelte';
	import { supabase } from '../supabase';
	import type { Collab, Draft } from '../types';
	import { toast } from '../ui.svelte';
	import { errMessage, fmtTime } from '../util';
	import Icon from './Icon.svelte';

	// An approved draft with a file: post it to Instagram at a set time, with the brand tagged as
	// collaborator. Needs the "posting" permission on her Instagram connection.
	let { c, d }: { c: Collab; d: Draft } = $props();
	type Post = { id: string; publish_at: string; status: string; permalink: string; error: string; draft_id: string | null };
	let posts = $state<Post[]>([]);
	let canPost = $state<boolean | null>(null);
	let open = $state(false);
	let when = $state('');
	let caption = $state('');
	let tagBrand = $state(true);
	let busy = $state(false);

	const brandHandle = $derived((c.brand.instagram ?? '').replace(/^@/, ''));
	const mine = $derived(posts.filter((p) => p.draft_id === d.id && p.status !== 'cancelled'));
	async function load() {
		const [{ data }, perms] = await Promise.all([
			supabase.from('scheduled_posts').select('id, publish_at, status, permalink, error, draft_id').eq('collab_id', c.id).order('publish_at'),
			supabase.rpc('ig_permissions')
		]);
		posts = (data as Post[]) ?? [];
		canPost = String(perms.data ?? '').includes('instagram_business_content_publish');
	}
	onMount(load);

	function start() {
		// Default: the go-live date at 7 pm (or tomorrow 7 pm), in her own time.
		const upcoming = !!c.live_date && c.live_date >= new Date().toISOString().slice(0, 10);
		const base = upcoming ? new Date(c.live_date + 'T19:00') : new Date(Date.now() + 864e5);
		if (!upcoming) base.setHours(19, 0, 0, 0);
		const pad = (n: number) => String(n).padStart(2, '0');
		when = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}T${pad(base.getHours())}:${pad(base.getMinutes())}`;
		caption = d.caption ?? '';
		open = true;
	}
	async function schedule(now = false) {
		const at = now ? new Date() : new Date(when);
		if (!now && (isNaN(at.getTime()) || at.getTime() < Date.now() - 60e3)) return toast('Pick a time in the future', 'alert');
		if (!/#ad\b|paid partnership/i.test(caption) && !(await ask({ title: 'No #ad in the caption', body: 'Indian advertising rules (ASCI) ask for #ad or the paid-partnership label on paid posts. Post anyway?', ok: 'Post anyway' }))) return;
		busy = true;
		const { data, error } = await supabase
			.from('scheduled_posts')
			.insert({ collab_id: c.id, draft_id: d.id, file_path: d.file_path, file_type: d.file_type, caption, collaborators: tagBrand && brandHandle ? [brandHandle] : [], publish_at: at.toISOString() })
			.select('id')
			.single();
		if (error) {
			busy = false;
			return toast(`Couldn't schedule: ${errMessage(error)}`, 'alert');
		}
		if (now) {
			const r = await supabase.functions.invoke('instagram-publish', { body: { only: (data as { id: string }).id } });
			if (r.error) toast("Started. Instagram is preparing the video; it posts within a few minutes.", 'clock');
			else toast('Posting to Instagram. Videos take a few minutes to go up.', 'send');
		} else toast(`Scheduled for ${fmtTime(at.toISOString())}`, 'check');
		busy = false;
		open = false;
		load();
	}
	async function cancel(p: Post) {
		await supabase.from('scheduled_posts').update({ status: 'cancelled' }).eq('id', p.id);
		load();
	}
	const LABEL: Record<string, string> = { scheduled: 'Scheduled', publishing: 'Posting…', published: 'Posted', failed: "Didn't post" };
</script>

{#if d.status === 'approved' && d.file_path && canPost !== null}
	<div class="sp">
		{#each mine as p (p.id)}
			<div class="sp-row">
				<span class="pill tint {p.status === 'published' ? 'k-pay' : p.status === 'failed' ? 'k-bad' : 'k-new'}">{LABEL[p.status] ?? p.status}</span>
				<span class="hint">{fmtTime(p.publish_at)}</span>
				{#if p.permalink}<a class="lnk" href={p.permalink} target="_blank" rel="noopener">View on Instagram</a>{/if}
				{#if p.status === 'scheduled'}<button class="lnk" onclick={() => cancel(p)}>Cancel</button>{/if}
				{#if p.error}<p class="err" style="margin:4px 0 0;flex-basis:100%">{p.error}</p>{/if}
			</div>
		{/each}
		{#if !mine.some((p) => p.status === 'scheduled' || p.status === 'publishing' || p.status === 'published')}
			{#if !canPost}
				<p class="hint" style="margin:8px 0 0"><Icon name="info" /> To post from here, allow posting on <a class="lnk" href="/studio/settings?s=profile">Profile &amp; Instagram</a>.</p>
			{:else if !open}
				<button class="btn sm primary" onclick={start}><Icon name="send" />Schedule on Instagram</button>
			{:else}
				<div class="sp-form">
					<div class="f"><label for="sp-when-{d.id}">Post on</label><input class="inp" id="sp-when-{d.id}" type="datetime-local" bind:value={when} /></div>
					<div class="f"><label for="sp-cap-{d.id}">Caption</label><textarea class="inp" id="sp-cap-{d.id}" rows="4" bind:value={caption}></textarea></div>
					{#if brandHandle}<label class="check-row"><input type="checkbox" class="cbx" bind:checked={tagBrand} /><span>Add @{brandHandle} as collaborator (the post shows on both profiles)</span></label>{/if}
					<div class="row-btns" style="border:0;padding:0;gap:8px">
						<button class="btn ghost sm" onclick={() => (open = false)}>Cancel</button>
						<button class="btn sm" disabled={busy} onclick={() => schedule(true)}>Post now</button>
						<button class="btn grad sm" disabled={busy} onclick={() => schedule(false)}>{#if busy}<span class="spinner"></span>{:else}<Icon name="clock" />{/if}Schedule</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
{/if}
