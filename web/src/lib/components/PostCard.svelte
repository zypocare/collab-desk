<script lang="ts">
	import { onMount } from 'svelte';
	import type { Collab } from '../types';
	import { setChecklist, setStage, updateCollab } from '../studio.svelte';
	import { ask } from '../confirm.svelte';
	import { captionStarter } from '../suggest';
	import { timeLabel, timeOptions } from '../postTime';
	import { copyText, ui } from '../ui.svelte';
	import { CHECKLIST, checklistMissing, delivText, diff, hueOf, initials, latestDraft, relWord } from '../util';
	import DatePicker from './DatePicker.svelte';
	import Icon from './Icon.svelte';
	import Select from './Select.svelte';

	// Everything she needs at posting time on one card: when, the approved caption, the code and link to copy.
	let { c, focus = false }: { c: Collab; focus?: boolean } = $props();

	const approved = $derived(latestDraft(c)?.status === 'approved' ? latestDraft(c)?.caption.trim() : '');
	const caption = $derived(approved || captionStarter(c, 'short'));
	const d = $derived(c.brief_details ?? {});
	const handle = $derived(c.brand.instagram ? `@${c.brand.instagram.replace(/^@/, '')}` : '');
	const promo = $derived(d.promo?.trim().split(/\s/)[0].toUpperCase() ?? '');
	let el = $state<HTMLElement>();
	let busy = $state(false);

	onMount(() => {
		if (focus) setTimeout(() => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
	});
	// The same disclosure checklist as the collab page: ask before skipping it.
	const missing = $derived(checklistMissing(c));
	async function posted() {
		if (missing.length && !(await ask({ title: 'Posting checklist not finished', body: `Still unticked: ${missing.join('; ')}. Indian ad rules need paid posts clearly marked.`, ok: 'Mark posted anyway', cancel: 'Go back' }))) return;
		busy = true;
		await setStage(c, 'live');
		busy = false;
	}
	const ticked = $derived(CHECKLIST.filter((x) => !!c.checklist?.[x.key]).length);
	const when = $derived(c.live_date ? relWord(diff(c.live_date)) : 'No date');
</script>

<!-- Ready to post, as a ticket: the brand on its band with the day, then the caption to copy,
     the checklist with its progress and one big button. -->
<article class="pc" class:focus id="post-{c.code}" bind:this={el} style="--h: var(--m{hueOf(c.brand.name)})">
	<button class="pc-band" onclick={() => (ui.openCollab = c.id)}>
		<span class="pc-tile">{initials(c.brand.name)}</span>
		<span class="pc-who"><b>{c.brand.name}</b><small>{delivText(c.deliverables)}</small></span>
		<span class="pc-day"><b>{when}</b><small>{c.live_time ? timeLabel(c.live_time) : 'goes live'}</small></span>
	</button>
	<div class="pc-cut" aria-hidden="true"></div>

	<div class="pc-body">
		<div class="pc-when">
			<DatePicker size="sm" ariaLabel="Go-live date" placeholder="Go-live date" value={c.live_date} onchange={(v) => updateCollab(c.id, { live_date: v || null })} />
			<Select size="sm" ariaLabel="Post at" placeholder="Time" value={c.live_time?.slice(0, 5) ?? undefined} options={timeOptions(c.live_time)} onchange={(v) => updateCollab(c.id, { live_time: v })} />
		</div>

		<section class="pc-cap">
			<span class="pc-eb">Caption <i class:ok={!!approved}>{approved ? 'Approved by the brand' : 'From the brief · not approved yet'}</i></span>
			<p>{caption}</p>
			<div class="pc-copy">
				<button class="pc-neo pc-ink" onclick={() => copyText(caption, 'Caption copied. Paste it in Instagram')}><Icon name="copy" />Copy caption</button>
				{#if handle}<button class="pc-chip" onclick={() => copyText(handle, `${handle} copied`)}>{handle}</button>{/if}
				{#if promo}<button class="pc-chip" onclick={() => copyText(promo, 'Code copied')}>Code {promo}</button>{/if}
				{#if d.link}<button class="pc-chip" onclick={() => copyText(d.link!, 'Link copied')}><Icon name="link" />Link</button>{/if}
			</div>
		</section>

		<section class="pc-check">
			<div class="pc-ch"><span class="pc-eb">Before you post</span><span class="pc-n">{ticked} of {CHECKLIST.length}</span></div>
			<div class="pc-bar" aria-hidden="true">{#each CHECKLIST as item, i (item.key)}<i class:on={i < ticked}></i>{/each}</div>
			{#each CHECKLIST as item (item.key)}
				<label class="pc-row" class:done={!!c.checklist?.[item.key]}>
					<input type="checkbox" checked={!!c.checklist?.[item.key]} onchange={(e) => setChecklist(c, { [item.key]: (e.currentTarget as HTMLInputElement).checked })} />
					<span class="pc-box" aria-hidden="true"><Icon name="check" /></span>
					<span>{item.label}</span>
				</label>
			{/each}
		</section>

		<button class="pc-neo pc-go" disabled={busy} onclick={posted}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}I've posted it</button>
	</div>
</article>

<style>
	.pc { position: relative; border-radius: 22px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); margin: 6px 0 14px; }
	.pc.focus { box-shadow: 0 0 0 2px var(--g2); }
	.pc-band { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 16px 18px 18px; border: 0; border-radius: 21px 21px 0 0; color: #fff; font: inherit; text-align: left; cursor: pointer;
		background: linear-gradient(135deg, color-mix(in oklab, var(--h) 82%, #1a0d18) 0%, color-mix(in oklab, var(--h) 45%, #140a12) 70%, #140a12 100%); }
	.pc-tile { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; background: rgba(255, 255, 255, .18); border: 1px solid rgba(255, 255, 255, .25); font-weight: 800; font-size: 15px; }
	.pc-who { flex: 1; min-width: 0; display: grid; gap: 3px; }
	.pc-who b { font: italic 400 28px/1.05 var(--f-serif, Georgia, serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.pc-who small, .pc-day small { font-size: 10.5px; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: rgba(255, 255, 255, .75); }
	.pc-day { flex: none; display: grid; gap: 3px; text-align: right; }
	.pc-day b { font-size: 17px; font-weight: 700; text-transform: capitalize; }
	.pc-cut { position: relative; height: 0; margin: 0 16px; border-top: 2px dashed var(--line-strong); }
	.pc-cut::before, .pc-cut::after { content: ''; position: absolute; top: -12px; width: 22px; height: 22px; border-radius: 50%; background: var(--bg); border: 1px solid var(--line); }
	.pc-cut::before { left: -29px; clip-path: inset(0 0 0 50%); }
	.pc-cut::after { right: -29px; clip-path: inset(0 50% 0 0); }

	.pc-body { display: flex; flex-direction: column; gap: 18px; padding: 18px 18px 20px; }
	.pc-when { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.pc-eb { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 10.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-3); }
	.pc-eb i { font-style: normal; letter-spacing: .1em; color: var(--warn, #e0a23a); }
	.pc-eb i.ok { color: var(--ok); }

	/* The caption as it will read on Instagram, with what to copy under it. */
	.pc-cap { display: grid; gap: 10px; }
	.pc-cap p { margin: 0; padding: 14px 16px; border: 1px solid var(--line); background: color-mix(in oklab, var(--ink) 4%, transparent); font-size: 15px; line-height: 1.5; white-space: pre-wrap; max-height: 168px; overflow: auto; scrollbar-width: none; }
	.pc-copy { display: flex; flex-wrap: wrap; gap: 8px; padding-right: 4px; }
	.pc-neo { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 0; font: 700 14px var(--f-body, inherit); cursor: pointer; transition: transform .07s, box-shadow .07s; }
	.pc-neo:active:not(:disabled) { transform: translate(3px, 3px); box-shadow: none !important; }
	.pc-neo :global(.ic) { width: 16px; height: 16px; }
	.pc-ink { height: 40px; padding: 0 16px; background: var(--ink); color: var(--bg); box-shadow: 3px 3px 0 var(--g2); }
	.pc-ink :global(.ic) { color: var(--g3); }
	.pc-chip { height: 40px; padding: 0 14px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line-strong); border-radius: 0; background: transparent; color: var(--ink); font: 600 13.5px var(--f-body, inherit); cursor: pointer; }
	.pc-chip:active { transform: translate(2px, 2px); }
	.pc-chip :global(.ic) { width: 15px; height: 15px; }

	/* Before you post: progress in four blocks, then square ticks. */
	.pc-check { display: grid; gap: 4px; }
	.pc-ch { display: flex; align-items: center; }
	.pc-n { margin-left: auto; font-size: 12px; font-weight: 700; color: var(--ink-2); }
	.pc-bar { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; margin: 6px 0 4px; }
	.pc-bar i { height: 6px; background: color-mix(in oklab, var(--ink) 9%, transparent); transition: background .3s; }
	.pc-bar i.on { background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3)); }
	.pc-row { position: relative; display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 14.5px; line-height: 1.35; cursor: pointer; }
	.pc-row:last-of-type { border-bottom: 0; }
	.pc-row input { position: absolute; opacity: 0; pointer-events: none; }
	.pc-box { width: 22px; height: 22px; display: grid; place-items: center; border: 1.5px solid var(--line-strong); color: transparent; transition: background .2s, border-color .2s, transform .3s cubic-bezier(.2, 1.6, .4, 1); }
	.pc-box :global(.ic) { width: 14px; height: 14px; stroke-width: 3; }
	.pc-row.done .pc-box { border-color: transparent; background: linear-gradient(135deg, var(--g1), var(--g2)); color: #fff; transform: scale(1.06); }
	.pc-row.done > span:last-child { color: var(--ink-3); text-decoration: line-through; text-decoration-color: color-mix(in oklab, var(--ink-3) 60%, transparent); }
	.pc-row input:focus-visible + .pc-box { outline: 2px solid var(--g2); outline-offset: 2px; }

	.pc-go { height: 50px; width: calc(100% - 4px); color: #fff; font-size: 15px; background: linear-gradient(110deg, var(--g1), var(--g2) 55%, var(--g3)); box-shadow: 4px 4px 0 #5c3ea0; }
	.pc-go:disabled { opacity: .6; }
</style>
