<script lang="ts">
	import { onMount } from 'svelte';
	import type { Collab } from '../types';
	import { setStage, updateCollab } from '../studio.svelte';
	import { captionStarter } from '../suggest';
	import { timeLabel, timeOptions } from '../postTime';
	import { copyText, ui } from '../ui.svelte';
	import { delivText, diff, latestDraft, relWord } from '../util';
	import DatePicker from './DatePicker.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
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
	async function posted() {
		busy = true;
		await setStage(c, 'live');
		busy = false;
	}
</script>

<div class="post-card" class:focus id="post-{c.code}" bind:this={el}>
	<div class="ct-main">
		<Mono name={c.brand.name} size="sm" />
		<div class="ct-t">
			<button class="ct-name" onclick={() => (ui.openCollab = c.id)}>{c.brand.name}</button>
			<small>{delivText(c.deliverables)}{c.live_date ? ` · ${relWord(diff(c.live_date))}${c.live_time ? ` at ${timeLabel(c.live_time)}` : ''}` : ''}</small>
		</div>
	</div>
	<div class="post-when">
		<DatePicker size="sm" ariaLabel="Go-live date" placeholder="Go-live date" value={c.live_date} onchange={(v) => updateCollab(c.id, { live_date: v || null })} />
		<Select size="sm" ariaLabel="Post at" placeholder="Time" value={c.live_time?.slice(0, 5) ?? undefined} options={timeOptions(c.live_time)} onchange={(v) => updateCollab(c.id, { live_time: v })} />
	</div>
	<div class="post-cap">
		<span class="lbl-t">{approved ? 'Approved caption' : 'Caption from the brief (no approved caption yet)'}</span>
		<p>{caption}</p>
	</div>
	<div class="post-copy">
		<button class="btn sm grad" onclick={() => copyText(caption, 'Caption copied. Paste it in Instagram')}><Icon name="copy" />Copy caption</button>
		{#if handle}<button class="btn sm" onclick={() => copyText(handle, `${handle} copied`)}>{handle}</button>{/if}
		{#if promo}<button class="btn sm" onclick={() => copyText(promo, 'Code copied')}>Code {promo}</button>{/if}
		{#if d.link}<button class="btn sm" onclick={() => copyText(d.link!, 'Link copied')}><Icon name="link" />Link</button>{/if}
	</div>
	<p class="hint post-tip"><Icon name="alert" />Turn on the <b>Paid partnership</b> label and keep #ad in the first line.</p>
	<button class="btn sm primary" disabled={busy} onclick={posted}>{#if busy}<span class="spinner"></span>{:else}<Icon name="check" />{/if}I've posted it</button>
</div>
