<script lang="ts">
	import { page } from '$app/state';
	import { askAi, collabFacts } from '#lib/ai.ts';
	import { ask } from '#lib/confirm.svelte.ts';
	import { hoursLeft, makeShotList, type Shot } from '#lib/content.ts';
	import { scriptLanguage } from '#lib/languages.ts';
	import { studio, updateCollab } from '#lib/studio.svelte.ts';
	import type { ReelScript } from '#lib/types.ts';
	import { copyText, toast } from '#lib/ui.svelte.ts';
	import { delivText, diff, fmt } from '#lib/util.ts';
	import AiThinking from '#lib/components/AiThinking.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Mono from '#lib/components/Mono.svelte';
	import ScriptSheet from '#lib/components/ScriptSheet.svelte';

	const code = $derived(page.params.code ?? '');
	const c = $derived(studio.collabs.find((x) => x.code === code) ?? null);

	let scriptOpen = $state(false);
	let adding = $state('');
	let regenBusy = $state(false);

	const owed = $derived(c ? c.deliverables.filter((d) => !d.done) : []);
	const hours = $derived(c ? hoursLeft(c, studio.settings) : 0);
	const shots = $derived(c?.shot_list ?? []);
	const doneShots = $derived(shots.filter((x) => x.done).length);
	const firstOpenIdx = $derived(shots.findIndex((x) => !x.done));
	const pct = $derived(shots.length ? Math.round((doneShots / shots.length) * 100) : 0);

	type ParsedShot = { time: string; visual: string; spoken: string };

	function stripQuotes(str: string): string {
		let s = str.trim();
		while (s.length >= 2 && (/^["“”'‘’]/.test(s) || /["“”'‘’]$/.test(s))) {
			const next = s.replace(/^["“”'‘’]+/, '').replace(/["“”'‘’]+$/, '').trim();
			if (next === s) break;
			s = next;
		}
		return s;
	}

	function parseShot(raw: string): ParsedShot {
		let rest = raw.trim();
		let time = '';
		let spoken = '';

		const timeMatch = rest.match(/^(\d+\s*[-–]\s*\d+\s*s|\d+\s*s)\s*[·:\-–—]\s*/i);
		if (timeMatch) {
			time = timeMatch[1].replace(/\s+/g, '').replace('-', '–');
			rest = rest.slice(timeMatch[0].length).trim();
		}

		const sayParen = rest.match(/\s*\(\s*say\s*:\s*([\s\S]*?)\)\s*$/i);
		if (sayParen) {
			spoken = stripQuotes(sayParen[1]);
			rest = rest.slice(0, sayParen.index).trim();
		} else {
			const sayInline = rest.match(/\s*[·—-]\s*say\s*:\s*([\s\S]*?)$/i);
			if (sayInline) {
				spoken = stripQuotes(sayInline[1]);
				rest = rest.slice(0, sayInline.index).trim();
			}
		}

		return { time, visual: rest || raw.trim(), spoken };
	}

	function shotTag(i: number, total: number, done: boolean): string {
		if (done) return 'FILMED';
		if (i === 0) return 'HOOK';
		if (i === total - 1 && total > 2) return 'CLOSING';
		return 'SCENE';
	}

	async function save(list: Shot[]) {
		if (!c) return;
		await updateCollab(c.id, { shot_list: list });
	}

	function toggleShot(i: number) {
		void save(shots.map((x, j) => (j === i ? { ...x, done: !x.done } : x)));
	}

	function addShot(e: SubmitEvent) {
		e.preventDefault();
		if (!adding.trim() || !c) return;
		void save([...shots, { t: adding.trim(), done: false }]);
		adding = '';
	}

	async function regenerateWithAi() {
		if (!c || regenBusy) return;
		if (doneShots > 0) {
			const ok = await ask({
				title: 'Regenerate shot list?',
				body: 'Miracle will write a fresh shot-by-shot storyboard from the brief and replace your current ticks.',
				ok: 'Regenerate',
				danger: true
			});
			if (!ok) return;
		}
		regenBusy = true;
		try {
			const st = studio.settings;
			const style = c.script?.style ?? 'Talking to camera';
			const language = c.script?.language ?? scriptLanguage(c.content_language);
			const length = c.script?.length ?? '30 seconds';
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
			const nextShots: Shot[] = (r.scenes ?? []).map((x) => {
				const cleanSay = x.say ? stripQuotes(x.say) : '';
				const t = `${x.time ? x.time + ' · ' : ''}${x.shot}${cleanSay ? ` (say: "${cleanSay}")` : ''}`.slice(0, 300);
				return { t, done: false };
			});
			if (nextShots.length) {
				await updateCollab(c.id, {
					script: { ...r, style, language, length, hook: r.hooks?.[0] ?? '', made_at: new Date().toISOString() },
					shot_list: nextShots
				});
				toast('Fresh shot list generated from the brief', 'spark');
			} else {
				await save(makeShotList(c));
				toast('Shot list refreshed from the brief', 'check');
			}
		} catch (e) {
			toast((e as Error).message, 'alert');
		} finally {
			regenBusy = false;
		}
	}

	async function markShootDone() {
		if (!c) return;
		await updateCollab(c.id, { shot_at: new Date().toISOString() });
		toast('Shoot done. Next: edit and send the draft', 'film');
	}
</script>

<svelte:head><title>{c ? `${c.brand.name} · Shot List` : 'Shot List'} · Miracle</title></svelte:head>

{#if c && scriptOpen}
	<ScriptSheet {c} onclose={() => (scriptOpen = false)} />
{/if}

<div class="slp">
	{#if !c}
		<section class="slp-card slp-empty">
			<span class="slp-ic"><Icon name="layers" /></span>
			<b>Collaboration not found</b>
			<small>This collab may have been archived or removed.</small>
			<a class="btn sm" href="/studio/content">Back to Content</a>
		</section>
	{:else}
		<!-- Compact Header & Controls -->
		<header class="slp-head">
			<div class="slp-hero-top">
				<Mono name={c.brand.name} size="sm" />
				<div class="slp-ht">
					<h1>{c.brand.name}</h1>
					<small>{delivText(owed.length ? owed : c.deliverables)}{hours ? ` · about ${hours} h` : ''}</small>
				</div>
				{#if c.shot_at}
					<span class="slp-badge ok"><Icon name="check" />Shot</span>
				{/if}
			</div>

			{#if shots.length}
				<div class="slp-prog-wrap">
					<div class="slp-prog-hd">
						<span class="slp-prog-lbl">Shoot timeline</span>
						<span class="slp-prog-stat">{doneShots} / {shots.length} filmed · {pct}%</span>
					</div>
					<div class="slp-prog" aria-hidden="true"><i style="width:{pct}%"></i></div>
				</div>
			{/if}

			<div class="slp-acts">
				<button class="slp-neopop" type="button" onclick={regenerateWithAi} disabled={regenBusy}>
					<Icon name="refresh" />
					<span>{regenBusy ? 'Regenerating…' : shots.length ? 'Regenerate' : 'Generate with AI'}</span>
				</button>
				<button class="slp-soft" type="button" onclick={() => (scriptOpen = true)}>
					<Icon name="spark" />
					<span>{c.script ? 'Script' : 'Write script'}</span>
				</button>
				{#if shots.length}
					<button
						class="slp-soft"
						type="button"
						onclick={() =>
							copyText(
								`${c.brand.name} shot list\n` + shots.map((x) => `${x.done ? '☑' : '☐'} ${x.t}`).join('\n'),
								'Shot list copied'
							)}
					>
						<Icon name="copy" />
						<span>Copy</span>
					</button>
				{/if}
			</div>
		</header>

		{#if regenBusy}
			<section class="slp-card slp-busy">
				<AiThinking label="Writing a fresh shot-by-shot timeline from your brief" />
			</section>
		{:else if !shots.length}
			<section class="slp-card slp-empty">
				<span class="slp-ic"><Icon name="layers" /></span>
				<b>No shots yet</b>
				<small>Generate a shot-by-shot timeline with spoken lines using AI, or build a quick checklist from the brief.</small>
				<div class="slp-empty-acts">
					<button class="slp-neopop" type="button" onclick={regenerateWithAi}><Icon name="spark" />Generate with AI</button>
					<button class="slp-soft" type="button" onclick={() => save(makeShotList(c))}>Quick checklist</button>
				</div>
			</section>
		{:else}
			<!-- Activity-style editorial vertical timeline -->
			<ol class="tl">
				{#each shots as s, i (i)}
					{@const ps = parseShot(s.t)}
					{@const isNext = i === firstOpenIdx}
					<li class="tl-item" class:done={s.done} class:next={isNext}>
						<!-- Left Serif Index Rail (matches Activity's date column) -->
						<div class="tl-rail" aria-hidden="true">
							<span class="tl-idx">{String(i + 1).padStart(2, '0')}</span>
							<span class="tl-unit">SHOT</span>
						</div>

						<!-- Spine + Interactive Node -->
						<div class="tl-spine">
							<button
								type="button"
								class="tl-node"
								class:done={s.done}
								class:next={isNext}
								aria-pressed={s.done}
								aria-label="Mark shot {i + 1} as {s.done ? 'not filmed' : 'filmed'}"
								onclick={() => toggleShot(i)}
							>
								{#if s.done}<Icon name="check" />{/if}
							</button>
						</div>

						<!-- Clean Borderless Content Column -->
						<div class="tl-body">
							<div class="tl-meta">
								{#if ps.time}<span class="tl-time">{ps.time.toUpperCase()}</span>{/if}
								<span class="tl-tag" class:ok={s.done}>{shotTag(i, shots.length, s.done)}</span>
								<button
									class="tl-x"
									type="button"
									aria-label="Remove shot"
									onclick={() => save(shots.filter((_, j) => j !== i))}
								>
									<Icon name="x" />
								</button>
							</div>

							<button type="button" class="tl-vis" onclick={() => toggleShot(i)}>
								{ps.visual}
							</button>

							{#if ps.spoken}
								<p class="tl-say">
									<Icon name="mic" />
									<span>“{ps.spoken}”</span>
								</p>
							{/if}
						</div>
					</li>
				{/each}
			</ol>

			<form class="sb-add" onsubmit={addShot}>
				<label class="sr" for="shot-add-{c.id}">Add a shot or note</label>
				<input id="shot-add-{c.id}" placeholder="Add a shot (e.g. 22–26s · Close-up product)" bind:value={adding} />
				<button type="submit" disabled={!adding.trim()} aria-label="Add"><Icon name="plus" /></button>
			</form>

			{#if !c.shot_at && ['confirmed', 'creating'].includes(c.stage)}
				<div class="slp-done-bar">
					<div>
						<b>Finished filming?</b>
						<small>{c.shoot_date && diff(c.shoot_date) <= 0 ? `Shoot date was ${fmt(c.shoot_date)}` : 'Mark shot done to move into editing'}</small>
					</div>
					<button class="slp-neopop" type="button" onclick={markShootDone}><Icon name="check" />Shoot done</button>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.slp {
		max-width: 660px;
		margin: 0 auto;
		display: grid;
		gap: 18px;
		padding-bottom: 36px;
	}
	.slp-head {
		display: grid;
		gap: 14px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--line);
	}
	.slp-hero-top {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.slp-ht {
		flex: 1;
		min-width: 0;
	}
	.slp-ht h1 {
		font-family: var(--f-serif, Georgia, serif);
		font-style: italic;
		font-weight: 400;
		font-size: 30px;
		line-height: 1.06;
		margin: 0;
	}
	.slp-ht small {
		display: block;
		font-size: 12.5px;
		color: var(--ink-2);
		margin-top: 3px;
	}
	.slp-badge {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		border-radius: 99px;
		font-size: 11.5px;
		font-weight: 700;
	}
	.slp-badge.ok {
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 14%, var(--surface));
		border: 1px solid color-mix(in oklab, var(--ok) 40%, var(--line));
	}
	.slp-prog-wrap {
		display: grid;
		gap: 6px;
	}
	.slp-prog-hd {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.slp-prog-lbl {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.slp-prog-stat {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11.5px;
		font-weight: 600;
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}
	.slp-prog {
		height: 4px;
		border-radius: 99px;
		background: var(--line);
		overflow: hidden;
	}
	.slp-prog i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3));
		transition: width 0.35s ease;
	}
	.slp-acts {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.slp-neopop {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: 7px;
		border: 0;
		background: #f4eef2;
		color: #110d11;
		font-size: 12.5px;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 3px 3px 0 var(--g2);
	}
	.slp-neopop:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.slp-soft {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 8px 12px;
		border-radius: 9px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink-2);
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.slp-soft:hover {
		color: var(--ink);
		border-color: var(--ink-3);
	}

	/* Activity-style vertical timeline */
	.tl {
		list-style: none;
		margin: 0;
		padding: 2px 0 0;
		display: grid;
		gap: 0;
	}
	.tl-item {
		display: grid;
		grid-template-columns: 42px 26px minmax(0, 1fr);
		gap: 0 10px;
		align-items: stretch;
	}
	.tl-rail {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding-top: 1px;
		user-select: none;
	}
	.tl-idx {
		font-family: var(--f-serif, Georgia, serif);
		font-size: 27px;
		line-height: 0.95;
		color: var(--ink-3);
		font-variant-numeric: tabular-nums;
	}
	.tl-item.next .tl-idx {
		color: var(--g1);
	}
	.tl-item.done .tl-idx {
		color: var(--ok);
		opacity: 0.65;
	}
	.tl-unit {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--ink-3);
		margin-top: 3px;
		opacity: 0.7;
	}

	.tl-spine {
		position: relative;
		display: flex;
		justify-content: center;
		padding-top: 5px;
	}
	.tl-spine::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
		transform: translateX(-50%);
		background: var(--line-strong);
	}
	.tl-item:first-child .tl-spine::before {
		top: 14px;
	}
	.tl-item:last-child .tl-spine::before {
		bottom: calc(100% - 14px);
	}

	.tl-node {
		position: relative;
		z-index: 1;
		width: 16px;
		height: 16px;
		padding: 0;
		border-radius: 50%;
		border: 1.5px solid var(--line-strong);
		background: var(--bg);
		display: grid;
		place-items: center;
		cursor: pointer;
		transition: transform 0.15s, border-color 0.2s, background 0.2s, box-shadow 0.2s;
	}
	.tl-node.next {
		width: 18px;
		height: 18px;
		border-color: var(--g2);
		background: var(--g2);
		box-shadow: 0 0 0 5px color-mix(in oklab, var(--g2) 22%, transparent);
	}
	.tl-node.done {
		width: 18px;
		height: 18px;
		border-color: var(--ok);
		background: var(--ok);
		color: var(--bg);
	}
	.tl-node.done :global(.ic) {
		width: 11px;
		height: 11px;
		stroke-width: 2.6;
	}

	.tl-body {
		min-width: 0;
		padding: 2px 0 22px;
		display: grid;
		gap: 5px;
	}
	.tl-item:last-child .tl-body {
		padding-bottom: 6px;
	}
	.tl-meta {
		display: flex;
		align-items: center;
		gap: 9px;
		min-height: 20px;
	}
	.tl-time {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--ink-3);
	}
	.tl-tag {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--g2);
	}
	.tl-tag.ok {
		color: var(--ok);
	}
	.tl-x {
		margin-left: auto;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--ink-3);
		opacity: 0.45;
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.tl-x:hover {
		opacity: 1;
		background: var(--surface);
	}
	.tl-x :global(.ic) {
		width: 13px;
		height: 13px;
	}

	.tl-vis {
		padding: 0;
		border: 0;
		background: none;
		text-align: left;
		font: inherit;
		font-size: 15.5px;
		font-weight: 500;
		line-height: 1.4;
		color: var(--ink);
		cursor: pointer;
		overflow-wrap: anywhere;
	}
	.tl-item.done .tl-vis {
		color: var(--ink-3);
		text-decoration: line-through;
	}

	.tl-say {
		margin: 2px 0 0;
		display: flex;
		align-items: flex-start;
		gap: 7px;
		font-size: 13.5px;
		line-height: 1.46;
		color: var(--ink-2);
	}
	.tl-say :global(.ic) {
		width: 13px;
		height: 13px;
		margin-top: 3px;
		color: var(--g2);
		flex-shrink: 0;
	}
	.tl-item.done .tl-say {
		opacity: 0.55;
	}

	.slp-card {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 24px 18px;
	}
	.slp-busy {
		display: grid;
		place-items: center;
		min-height: 140px;
	}
	.slp-empty {
		display: grid;
		place-items: center;
		text-align: center;
		gap: 10px;
	}
	.slp-empty b {
		font-size: 16px;
	}
	.slp-empty small {
		font-size: 13px;
		color: var(--ink-2);
		max-width: 340px;
		line-height: 1.45;
	}
	.slp-empty-acts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
		margin-top: 4px;
	}
	.slp-ic {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		border: 1px solid var(--line-strong);
		background: var(--surface-2);
		display: grid;
		place-items: center;
		color: var(--g1);
	}

	.sb-add {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 4px 4px 14px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface);
	}
	.sb-add:focus-within {
		border-color: var(--g1);
	}
	.sb-add input {
		flex: 1;
		min-width: 0;
		height: 36px;
		padding: 0;
		border: 0;
		outline: 0;
		background: none;
		color: var(--ink);
		font: inherit;
		font-size: 14px;
	}
	.sb-add input::placeholder {
		color: var(--ink-3);
	}
	.sb-add button {
		flex: none;
		width: 34px;
		height: 34px;
		padding: 0;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 9px;
		background: var(--ink);
		color: var(--bg);
		cursor: pointer;
		transition: opacity 0.2s;
	}
	.sb-add button:disabled {
		opacity: 0.25;
		cursor: default;
	}
	.sb-add button :global(.ic) {
		width: 17px;
		height: 17px;
	}
	.slp-done-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 15px;
		border-radius: 16px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		flex-wrap: wrap;
	}
	.slp-done-bar b {
		display: block;
		font-size: 14px;
	}
	.slp-done-bar small {
		display: block;
		font-size: 12px;
		color: var(--ink-3);
		margin-top: 2px;
	}
</style>
