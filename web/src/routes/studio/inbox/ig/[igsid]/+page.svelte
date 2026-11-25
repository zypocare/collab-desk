<script lang="ts">
	import { igImg } from '#lib/igImg.ts';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { supabase } from '#lib/supabase.ts';
	import { byId, studio } from '#lib/studio.svelte.ts';
	import { askAi, collabFacts } from '#lib/ai.ts';
	import AiThinking from '#lib/components/AiThinking.svelte';
	import { toast, ui } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';

	// One Instagram DM conversation: read it (including photos, videos, reels & voice notes),
	// reply (within Instagram's 24-hour window), or turn it into a collab.
	type T = { igsid: string; username: string; name: string; picture: string; last_from_them_at: string | null; collab_id: string | null; collab_flag: string; collab_hint: string };
	type IgAttachment = {
		type?: string;
		payload?: {
			url?: string;
			title?: string;
			reel_video_id?: string;
			sticker_id?: number;
		};
	};
	type M = { mid: string; from_me: boolean; text: string; attachments?: IgAttachment[] | null; created_at: string };

	const igsid = $derived(page.params.igsid ?? '');
	let t = $state<T | null>(null);
	let msgs = $state<M[]>([]);
	let text = $state('');
	let busy = $state(false);
	let list = $state<HTMLElement>();
	let drafts = $state<string[]>([]);
	let drafting = $state(false);
	let loaded = $state(false);
	let brokenUrls = $state<Record<string, boolean>>({});

	function markBroken(url: string) {
		brokenUrls = { ...brokenUrls, [url]: true };
	}

	function attList(m: M): IgAttachment[] {
		return Array.isArray(m.attachments) ? m.attachments.filter((a) => !!a?.payload?.url || !!a?.type) : [];
	}

	function attKind(a: IgAttachment): 'image' | 'video' | 'audio' | 'share' {
		const k = (a.type ?? '').toLowerCase();
		const u = (a.payload?.url ?? '').toLowerCase();
		if (k === 'image' || k === 'sticker' || /\.(jpe?g|png|webp|gif)(\?|$)/.test(u)) return 'image';
		if (k === 'video' || k === 'ig_reel' || k === 'reel' || /\.(mp4|mov|webm)(\?|$)/.test(u)) return 'video';
		if (k === 'audio' || /\.(mp3|m4a|ogg|aac|wav)(\?|$)/.test(u)) return 'audio';
		return 'share';
	}

	function attLabel(a: IgAttachment): string {
		const k = (a.type ?? '').toLowerCase();
		if (k === 'ig_reel' || k === 'reel') return a.payload?.title || 'Instagram Reel';
		if (k === 'story_mention') return 'Mentioned you in a Story';
		if (k === 'story_reply') return 'Replied to a Story';
		if (k === 'share') return a.payload?.title || 'Shared Instagram post';
		if (k === 'video') return 'Video';
		if (k === 'audio') return 'Voice message';
		if (k === 'image') return 'Photo';
		return a.payload?.title || 'Instagram attachment';
	}

	const hasCaption = (m: M, atts: IgAttachment[]) =>
		Boolean(m.text && !(atts.length > 0 && m.text.trim() === '[Photo or video]'));

	// AI reply ideas: as her, from the chat and (if it's become a collab) the collab's facts.
	async function suggest() {
		drafting = true;
		try {
			const s = studio.settings;
			const c = byId(t?.collab_id);
			const context = {
				channel: 'instagram',
				...(c && s ? collabFacts(c, s) : { creator: s?.display_name, handle: s?.handle, niche: s?.niche, rate_card: s?.rates, reply_time: s?.reply_time }),
				...(t?.collab_hint && !c ? { looks_like: t.collab_hint } : {})
			};
			const r = await askAi<{ replies: string[] }>('reply', { thread: msgs.slice(-12).map((m) => ({ from: m.from_me ? 'creator' : 'brand', text: m.text })), context });
			drafts = r.replies;
			if (!drafts.length) toast("The AI didn't have a suggestion this time. Try again.", 'alert');
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		drafting = false;
	}

	async function load() {
		const [a, b] = await Promise.all([
			supabase.from('ig_threads').select('*').eq('igsid', igsid).maybeSingle(),
			supabase.from('ig_dms').select('mid, from_me, text, attachments, created_at').eq('igsid', igsid).order('created_at')
		]);
		t = (a.data as T | null) ?? null;
		msgs = (b.data as M[]) ?? [];
		loaded = true;
		if (!t) return;
		await supabase.from('ig_threads').update({ unread: 0 }).eq('igsid', igsid);
		await tick();
		list?.scrollTo({ top: list.scrollHeight });
	}
	onMount(() => {
		load();
		const ch = supabase
			.channel(`igdm-${igsid}`)
			.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ig_dms', filter: `igsid=eq.${igsid}` }, () => load())
			.subscribe();
		const ch2 = supabase
			.channel(`igth-${igsid}`)
			.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ig_threads', filter: `igsid=eq.${igsid}` }, (p) => (t = { ...(t as T), ...(p.new as T) }))
			.subscribe();
		return () => {
			supabase.removeChannel(ch);
			supabase.removeChannel(ch2);
		};
	});
	const flagged = $derived(!!t && !t.collab_id && (t.collab_flag === 'likely' || t.collab_flag === 'maybe'));
	const open24 = $derived(!!t?.last_from_them_at && Date.now() - Date.parse(t.last_from_them_at) < 24 * 3600e3);

	async function send(e: SubmitEvent) {
		e.preventDefault();
		const body = text.trim();
		if (!body) return;
		busy = true;
		const { data, error } = await supabase.functions.invoke('instagram-dm', { body: { igsid, text: body } });
		busy = false;
		if (error || (data as { error?: string })?.error) {
			let msg = (data as { error?: string })?.error ?? errMessage(error);
			try {
				msg = (await (error as { context?: Response })?.context?.json())?.error ?? msg;
			} catch {
				/* keep it */
			}
			return toast(msg, 'alert');
		}
		text = '';
		load();
	}
	async function notCollab() {
		const { error } = await supabase.rpc('ig_not_collab', { p_igsid: igsid });
		if (error) return toast(errMessage(error), 'alert');
		toast('Removed. Their messages will stay out of the app.', 'check');
		history.back();
	}
	function addCollab() {
		ui.pasteText = msgs.slice(-15).map((m) => `${m.from_me ? studio.settings?.display_name ?? 'Me' : t?.username || 'Brand'}: ${m.text}`).join('\n');
		ui.fromIg = igsid;
		ui.newCollab = true;
	}
	const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
</script>

<svelte:head><title>@{t?.username ?? 'Instagram'} · Messages · {studio.settings?.app_name}</title></svelte:head>

{#if loaded && !t}
	<div class="empty-card"><h2>Chat not found</h2><p>It may have been removed, or it was never a possible collab.</p><a class="btn" href="/studio/inbox">All messages</a></div>
{:else}
<div class="chat">
	<header class="chat-h">
		<button class="m-ib" onclick={() => history.back()} aria-label="Back"><Icon name="chevL" /></button>
		<div class="chat-who">
			{#if t?.picture}<img class="ig-pic" src={igImg(t.picture)} alt="" referrerpolicy="no-referrer" />{:else}<Mono name={t?.username || 'IG'} />{/if}
			<span><b>@{t?.username || 'Instagram user'}</b><small>{t?.name || 'Instagram DM'}</small></span>
		</div>
		{#if t?.collab_id}<a class="m-ib" href="/studio/collabs" aria-label="Collab"><Icon name="info" /></a>{:else if !flagged}<button class="btn sm" onclick={addCollab}><Icon name="plus" />Add as collab</button>{/if}
	</header>
	{#if flagged && t}
		<div class="collab-banner">
			<span class="cb-ic"><Icon name="spark" /></span>
			<div><b>Looks like a collab{t.collab_flag === 'maybe' ? '?' : ''} <span class="ai-tag"><Icon name="spark" />AI</span></b><small>{t.collab_hint || 'A brand may be asking about working together.'}</small></div>
			<button class="btn sm primary" onclick={addCollab}><Icon name="plus" />Add as collab</button>
			<button class="lnk" onclick={notCollab}>Not a collab</button>
		</div>
	{/if}
	<div class="thread">
		<div class="th-list" bind:this={list}>
			{#each msgs as m (m.mid)}
				{@const atts = attList(m)}
				<div class="bub-row first last" class:mine={m.from_me}>
					<div class="bub" class:has-media={atts.length > 0} title={time(m.created_at)}>
						{#if atts.length}
							<div class="ig-atts">
								{#each atts as a, idx (idx)}
									{@const url = a.payload?.url ?? ''}
									{@const kind = attKind(a)}
									{#if kind === 'image' && url && !brokenUrls[url]}
										<a class="ig-media-link" href={url} target="_blank" rel="noopener">
											<img class="ig-att-img" src={igImg(url)} alt={attLabel(a)} loading="lazy" referrerpolicy="no-referrer" onerror={() => markBroken(url)} />
										</a>
									{:else if kind === 'video' && url && !brokenUrls[url]}
										<div class="ig-vid-wrap">
											<!-- svelte-ignore a11y_media_has_caption -->
											<video class="ig-att-vid" src={url} controls playsinline preload="metadata" onerror={() => markBroken(url)}></video>
											{#if a.type === 'ig_reel' || a.type === 'reel'}
												<a class="ig-att-foot" href={url} target="_blank" rel="noopener"><Icon name="film" /><span>{attLabel(a)}</span></a>
											{/if}
										</div>
									{:else if kind === 'audio' && url && !brokenUrls[url]}
										<audio class="ig-att-aud" src={url} controls preload="metadata" onerror={() => markBroken(url)}></audio>
									{:else}
										<a class="ig-att-card" href={url || `https://ig.me/m/${t?.username ?? ''}`} target="_blank" rel="noopener">
											<span class="ig-att-ic"><Icon name={kind === 'video' ? 'film' : kind === 'image' ? 'image' : 'link'} /></span>
											<span class="ig-att-meta">
												<b>{attLabel(a)}</b>
												<small>{brokenUrls[url] ? 'Media link expired · Open in Instagram' : 'Tap to open'}</small>
											</span>
										</a>
									{/if}
								{/each}
							</div>
						{/if}
						{#if hasCaption(m, atts)}
							<p>{m.text}</p>
						{:else if !atts.length && m.text}
							<p>{m.text}</p>
						{/if}
					</div>
					<time class="bub-t" datetime={m.created_at}>{time(m.created_at)}</time>
				</div>
			{:else}
				<div class="th-empty"><Icon name="send" /><p>No messages yet.</p></div>
			{/each}
		</div>
		{#if open24}
			{#if !text}
				<div class="th-ai">
					{#if drafting}<AiThinking label="Writing replies" />{:else}<button type="button" class="btn sm ai-btn" onclick={suggest}><Icon name="spark" />{drafts.length ? 'More replies' : 'Suggest replies'}</button>{/if}
					{#each drafts as d, i (i)}<button type="button" class="ai-draft" onclick={() => ((text = d), (drafts = []))}>{d}</button>{/each}
				</div>
			{/if}
			<form class="th-box" onsubmit={send}>
				<textarea class="th-in" rows="1" placeholder="Message…" aria-label="Message" bind:value={text} onkeydown={(e) => e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches && (e.preventDefault(), (e.currentTarget as HTMLTextAreaElement).form?.requestSubmit())}></textarea>
				{#if text.trim()}<button class="send-btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>{/if}
			</form>
		{:else}
			<p class="hint ig-closed">Instagram only lets apps reply within 24 hours of their last message. <a class="lnk" href="https://ig.me/m/{t?.username ?? ''}" target="_blank" rel="noopener">Reply in Instagram</a></p>
		{/if}
	</div>
</div>
{/if}

<style>
	.bub.has-media { padding: 6px; overflow: hidden; }
	.bub.has-media p { padding: 6px 8px 4px; margin: 0; }
	.ig-atts { display: grid; gap: 6px; }
	.ig-media-link { display: block; line-height: 0; }
	.ig-att-img {
		display: block;
		max-width: 240px;
		max-height: 300px;
		width: 100%;
		object-fit: cover;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.04);
	}
	.ig-vid-wrap { display: grid; gap: 4px; }
	.ig-att-vid {
		display: block;
		max-width: 250px;
		max-height: 340px;
		width: 100%;
		border-radius: 12px;
		background: #000;
	}
	.ig-att-foot {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px 2px;
		font-size: 12px;
		font-weight: 600;
		color: inherit;
		text-decoration: none;
		opacity: 0.9;
	}
	.ig-att-foot :global(.ic) { width: 14px; height: 14px; }
	.ig-att-aud { max-width: 240px; width: 100%; height: 38px; }
	.ig-att-card {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		color: inherit;
		text-decoration: none;
		min-width: 190px;
	}
	.ig-att-ic {
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: rgba(242, 90, 144, 0.16);
		color: #ffae6b;
		display: grid;
		place-items: center;
		flex-shrink: 0;
	}
	.ig-att-ic :global(.ic) { width: 16px; height: 16px; }
	.ig-att-meta { display: grid; gap: 2px; min-width: 0; }
	.ig-att-meta b { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ig-att-meta small { font-size: 11px; opacity: 0.72; }
</style>
