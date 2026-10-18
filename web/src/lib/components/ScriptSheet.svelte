<script lang="ts">
	import { scriptLanguage } from '../languages';
	import { untrack } from 'svelte';
	import { askAi, collabFacts } from '../ai';
	import { portal } from '../portal';
	import { studio, updateCollab } from '../studio.svelte';
	import type { Collab, ReelScript } from '../types';
	import { copyText, toast } from '../ui.svelte';
	import { delivText, fmt } from '../util';
	import AiThinking from './AiThinking.svelte';
	import Icon from './Icon.svelte';

	// Brief to Reel script: the free AI turns the brand's brief into a ready-to-shoot script (three
	// hooks, scene by scene with what to say and on-screen text, must-says, caption). Saved on the
	// collab; its scenes become the shot list.
	let { c, onclose }: { c: Collab; onclose: () => void } = $props();

	const STYLES = ['Talking to camera', 'Aesthetic voiceover', 'Tutorial / how-to', 'Storytime', 'Before and after', 'Day in my life'];
	const LANGS = ['English', 'Hinglish', 'Kannada + English', 'Hindi'];
	const LENGTHS = ['15 seconds', '30 seconds', '45-60 seconds'];

	const saved = untrack(() => c.script);
	let style = $state(saved?.style ?? STYLES[0]);
	// The collab's content language decides the spoken language (Kannada → Kannada + English, Hindi + English → Hinglish).
	let language = $state(saved?.language ?? untrack(() => scriptLanguage(c.content_language)));
	let length = $state(saved?.length ?? LENGTHS[1]);
	let s = $state<ReelScript | null>(saved ? structuredClone($state.snapshot(saved) as ReelScript) : null);
	let hook = $state(saved?.hook ?? saved?.hooks?.[0] ?? '');
	let busy = $state(false);
	let dirty = $state(false);
	const noBrief = $derived(!c.brief?.trim() && !Object.values(c.brief_details ?? {}).some((v) => (Array.isArray(v) ? v.length : String(v ?? '').trim())));

	async function write() {
		if (busy) return;
		busy = true;
		try {
			const st = studio.settings;
			const r = await askAi<ReelScript>('script', {
				...collabFacts(c, st),
				niche: st?.niche,
				brief: c.brief,
				brief_details: c.brief_details,
				deliverables: c.deliverables.map((d) => `${d.qty} ${d.kind}`),
				style,
				language,
				length
			});
			s = { ...r, style, language, length, made_at: new Date().toISOString() };
			hook = r.hooks[0] ?? '';
			dirty = true;
		} catch (e) {
			toast((e as Error).message, 'alert');
		}
		busy = false;
	}

	/** Save the script, and its scenes as the shot list (keeping shots already ticked). */
	async function save() {
		if (!s) return;
		const done = new Set((c.shot_list ?? []).filter((x) => x.done).map((x) => x.t));
		const shots = s.scenes.map((x) => {
			const t = `${x.time ? x.time + ' · ' : ''}${x.shot}${x.say ? ` (say: "${x.say}")` : ''}`.slice(0, 300);
			return { t, done: done.has(t) };
		});
		await updateCollab(c.id, { script: { ...s, hook }, shot_list: shots });
		dirty = false;
		toast('Script saved. Its scenes are now your shot list', 'check');
	}

	const asText = $derived(
		s
			? [
					`${c.brand.name}: ${delivText(c.deliverables)}`,
					s.idea && `Idea: ${s.idea}`,
					hook && `Hook: ${hook}`,
					'',
					...s.scenes.map((x) => `${x.time}  ${x.shot}${x.say ? `\n   Say: ${x.say}` : ''}${x.text ? `\n   On screen: ${x.text}` : ''}`),
					'',
					s.must.length && `Must say / show:\n${s.must.map((m) => `☐ ${m}`).join('\n')}`,
					s.avoid.length && `Avoid:\n${s.avoid.map((m) => `✕ ${m}`).join('\n')}`,
					s.props.length && `Keep ready: ${s.props.join(', ')}`,
					s.music && `Music: ${s.music}`,
					'',
					`Caption:\n${s.caption}${s.hashtags.length ? `\n\n${s.hashtags.join(' ')}` : ''}`
				]
					.filter((x): x is string => typeof x === 'string')
					.join('\n')
			: ''
	);
	const close = () => {
		if (dirty && s) save();
		onclose();
	};
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && close()}>
	<div class="dialog sc" role="dialog" aria-modal="true" aria-labelledby="sc-title">
		<header class="ng-h">
			<div>
				<span class="eb">Reel script <span class="ai-tag"><Icon name="spark" />AI</span></span>
				<h2 id="sc-title">{c.brand.name}</h2>
				<small>{delivText(c.deliverables)}{c.live_date ? ` · live ${fmt(c.live_date)}` : ''}</small>
			</div>
			<button class="icon-btn" onclick={close} aria-label="Close"><Icon name="x" /></button>
		</header>

		<div class="sc-opts">
			<label class="f"><span class="lbl-t">Style</span><select class="inp" bind:value={style}>{#each STYLES as o (o)}<option>{o}</option>{/each}</select></label>
			<label class="f"><span class="lbl-t">Language</span><select class="inp" bind:value={language}>{#each LANGS as o (o)}<option>{o}</option>{/each}</select></label>
			<label class="f"><span class="lbl-t">Length</span><select class="inp" bind:value={length}>{#each LENGTHS as o (o)}<option>{o}</option>{/each}</select></label>
		</div>
		{#if noBrief}<p class="hint sc-note"><Icon name="info" />No brief yet: the script will use the deal details only. Add the brand's brief on the collab for a sharper script.</p>{/if}

		{#if busy}
			<div class="ng-busy"><AiThinking label="Writing your script: hooks, scenes, what to say" /></div>
		{:else if !s}
			<div class="ng-acts">
				<button class="btn grad" onclick={write}><Icon name="spark" />Write my script</button>
				<span class="hint">Three hooks, every scene with what to say and on-screen text, the brief's must-says, and a caption with #ad.</span>
			</div>
		{:else}
			{#if s.idea}<p class="ng-read"><Icon name="spark" />{s.idea}</p>{/if}
			{#if s.hooks.length}
				<fieldset class="sc-hooks">
					<legend>Pick your hook (first 3 seconds)</legend>
					{#each s.hooks as h, i (i)}
						<label class:on={hook === h}><input type="radio" name="sc-hook" value={h} bind:group={hook} onchange={() => (dirty = true)} /><span>{h}</span></label>
					{/each}
				</fieldset>
			{/if}
			<ol class="sc-scenes">
				{#each s.scenes as x, i (i)}
					<li>
						<span class="sc-t">{x.time || `${i + 1}`}</span>
						<div>
							<b>{x.shot}</b>
							{#if x.say}<p class="sc-say"><Icon name="send" />“{x.say}”</p>{/if}
							{#if x.text}<p class="sc-txt"><Icon name="edit" />On screen: {x.text}</p>{/if}
						</div>
					</li>
				{/each}
			</ol>
			<div class="sc-cols">
				{#if s.must.length}<div class="sc-box"><h3>Must say / show</h3><ul>{#each s.must as m, i (i)}<li><Icon name="check" />{m}</li>{/each}</ul></div>{/if}
				{#if s.avoid.length}<div class="sc-box avoid"><h3>Avoid</h3><ul>{#each s.avoid as m, i (i)}<li><Icon name="x" />{m}</li>{/each}</ul></div>{/if}
			</div>
			{#if s.props.length || s.music}
				<p class="sc-meta">{#if s.props.length}<span><Icon name="box" />Keep ready: {s.props.join(', ')}</span>{/if}{#if s.music}<span><Icon name="film" />Music: {s.music}</span>{/if}</p>
			{/if}
			<div class="sc-cap">
				<div class="sc-cap-h"><h3>Caption</h3><button class="btn sm ghost" onclick={() => copyText(`${s!.caption}${s!.hashtags.length ? `\n\n${s!.hashtags.join(' ')}` : ''}`, 'Caption copied')}><Icon name="copy" />Copy</button></div>
				<p>{s.caption}</p>
				{#if s.hashtags.length}<p class="sc-tags">{s.hashtags.join(' ')}</p>{/if}
			</div>
			<div class="ng-acts">
				<button class="btn grad" onclick={save} disabled={!dirty}><Icon name="check" />{dirty ? 'Save script' : 'Saved'}</button>
				<button class="btn" onclick={() => copyText(asText, 'Script copied')}><Icon name="copy" />Copy all</button>
				<button class="btn ghost" onclick={write}><Icon name="refresh" />Write again</button>
			</div>
		{/if}
	</div>
</div>
