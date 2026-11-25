<script lang="ts">
	import { ask } from '../confirm.svelte';
	import type { Collab } from '../types';
	import { hoursLeft, makeShotList, suggestShoot, type Shot } from '../content';
	import { studio, updateCollab } from '../studio.svelte';
	import { copyText, toast, ui } from '../ui.svelte';
	import { delivText, diff, fmt, relWord } from '../util';
	import DatePicker from './DatePicker.svelte';
	import Icon from './Icon.svelte';
	import Mono from './Mono.svelte';
	import ScriptSheet from './ScriptSheet.svelte';

	// One collab in her content plan: what's left to make, when she shoots it, and its shot list.
	let { c, plan = false }: { c: Collab; plan?: boolean } = $props();

	let open = $state(false);
	let scriptOpen = $state(false);
	let adding = $state('');
	const owed = $derived(c.deliverables.filter((d) => !d.done));
	const hours = $derived(hoursLeft(c, studio.settings));
	const shots = $derived(c.shot_list ?? []);
	const doneShots = $derived(shots.filter((x) => x.done).length);
	const pct = $derived(shots.length ? Math.round((doneShots / shots.length) * 100) : 0);
	const sug = $derived(suggestShoot(c));

	const draftAfterLive = $derived(!!c.draft_date && !!c.live_date && c.draft_date > c.live_date);
	const draftWhen = $derived.by(() => {
		if (!c.draft_date) return '';
		const n = diff(c.draft_date);
		if (Math.abs(n) <= 30) return relWord(n);
		const y = c.draft_date.slice(0, 4);
		return `${fmt(c.draft_date)}${y !== String(new Date().getFullYear()) ? ` ${y}` : ''}`;
	});

	type ParsedShot = { time: string; visual: string; spoken: string };

	function stripQuotes(str: string): string {
		return str.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
	}

	// Parses strings like: `0-3s · Creator holding a gift hamper (say: "I'm so excited...")`
	// into structured timecode, visual direction, and clean spoken dialogue without duplicate quotes.
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

	const save = (list: Shot[]) => updateCollab(c.id, { shot_list: list });
	function addShot(e: SubmitEvent) {
		e.preventDefault();
		if (!adding.trim()) return;
		save([...shots, { t: adding.trim(), done: false }]);
		adding = '';
	}
</script>

{#if scriptOpen}<ScriptSheet {c} onclose={() => (scriptOpen = false)} />{/if}

<div class="ct-row" class:open>
	<div class="ct-main">
		<Mono name={c.brand.name} size="sm" />
		<div class="ct-t">
			<button class="ct-name" onclick={() => (ui.openCollab = c.id)}>{c.brand.name}</button>
			<small>{delivText(owed.length ? owed : c.deliverables)}{hours ? ` · about ${hours} h` : ''}</small>
			<div class="ct-meta">
				{#if c.draft_date}<span class:late={diff(c.draft_date) < 0 || draftAfterLive}><Icon name="film" />Draft {draftWhen}</span>{/if}
				{#if c.live_date}<span><Icon name="spark" />Live {fmt(c.live_date)}</span>{/if}
				{#if c.product_received_at}<span class="ok"><Icon name="box" />Product here</span>{/if}
				{#if c.shot_at}<span class="ok"><Icon name="check" />Shot · editing</span>{/if}
			</div>
			{#if draftAfterLive}<button class="ct-warn" onclick={() => (ui.openCollab = c.id)}><Icon name="alert" />The draft is due after it goes live. Fix the dates</button>{/if}
		</div>
		<button class="btn sm ai-btn ct-script" onclick={() => (scriptOpen = true)} title="A ready-to-shoot script from the brief"><Icon name="spark" />{c.script ? 'Script' : 'Write script'}</button>
		<button class="btn sm ct-shots" aria-expanded={open} onclick={() => (open = !open)}>
			<Icon name="layers" /><span class="ct-shots-t">Shot list{#if shots.length}<em>{doneShots} of {shots.length}</em>{/if}</span><Icon name={open ? 'chevU' : 'chevD'} />
		</button>
	</div>

	{#if open}
		<div class="ct-list sb-wrap">
			{#if !shots.length}
				<div class="sb-empty">
					<p class="hint">Make a storyboard shot list from the brief: every shot for {delivText(c.deliverables)}, what to say, and what to frame.</p>
					<button class="btn sm grad" onclick={() => save(makeShotList(c))}><Icon name="spark" />Make from the brief</button>
				</div>
			{:else}
				<div class="sb-prog-wrap">
					<div class="sb-prog-hd">
						<span class="sb-prog-lbl">Shoot storyboard</span>
						<span class="sb-prog-stat">{doneShots} / {shots.length} filmed</span>
					</div>
					<div class="sb-prog" aria-hidden="true"><i style="width:{pct}%"></i></div>
				</div>

				<div class="sb-deck">
					{#each shots as s, i (i)}
						{@const ps = parseShot(s.t)}
						<article class="sb-card" class:done={s.done}>
							<header class="sb-top">
								<label class="sb-check" aria-label="Mark shot {i + 1} filmed">
									<input
										type="checkbox"
										checked={s.done}
										onchange={(e) => save(shots.map((x, j) => (j === i ? { ...x, done: (e.currentTarget as HTMLInputElement).checked } : x)))}
									/>
								</label>
								<span class="sb-num">Shot {String(i + 1).padStart(2, '0')}</span>
								{#if ps.time}<span class="sb-time">{ps.time}</span>{/if}
								<button
									class="sb-x"
									type="button"
									aria-label="Remove shot"
									onclick={() => save(shots.filter((_, j) => j !== i))}
								>
									<Icon name="x" />
								</button>
							</header>

							<p class="sb-vis">{ps.visual}</p>

							{#if ps.spoken}
								<div class="sb-say">
									<span class="sb-say-ic" aria-hidden="true"><Icon name="mic" /></span>
									<span class="sb-say-txt">“{ps.spoken}”</span>
								</div>
							{/if}
						</article>
					{/each}
				</div>

				<form class="sb-add" onsubmit={addShot}>
					<label class="sr" for="shot-add-{c.id}">Add a shot or note</label>
					<input id="shot-add-{c.id}" placeholder="Add a shot (e.g. 22–26s · Close-up product)" bind:value={adding} />
					<button type="submit" disabled={!adding.trim()} aria-label="Add"><Icon name="plus" /></button>
				</form>

				<div class="sb-links">
					<button type="button" onclick={() => copyText(`${c.brand.name} shot list\n` + shots.map((x) => `${x.done ? '☑' : '☐'} ${x.t}`).join('\n'), 'Shot list copied')}><Icon name="copy" />Copy list</button>
					<button type="button" onclick={async () => (await ask({ title: 'Start the shot list over?', body: 'A fresh list is made from the brief. Your ticks and edits are replaced.', ok: 'Start over', danger: true })) && save(makeShotList(c))}><Icon name="refresh" />Start over</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if !c.shot_at && c.shoot_date && diff(c.shoot_date) <= 0 && ['confirmed', 'creating'].includes(c.stage)}
		<div class="ct-plan">
			<span class="ct-plan-l">{diff(c.shoot_date) === 0 ? 'Shooting today' : `Shoot was ${fmt(c.shoot_date)}`}</span>
			<button class="btn sm primary" onclick={async () => (await updateCollab(c.id, { shot_at: new Date().toISOString() }), toast('Shoot done. Next: edit and send the draft', 'film'))}><Icon name="check" />Shoot done</button>
		</div>
	{/if}
	{#if plan}
		<div class="ct-plan">
			<span class="ct-plan-l">Shoot day</span>
			{#if !c.shoot_date}
				<button class="btn sm" onclick={() => updateCollab(c.id, { shoot_date: sug })}><Icon name="cal" />Shoot {fmt(sug)}</button>
				<span class="hint">or</span>
			{/if}
			<DatePicker size="sm" ariaLabel="Shoot day for {c.brand.name}" placeholder={c.shoot_date ? 'Pick a shoot day' : 'Another day'} value={c.shoot_date} onchange={(v) => updateCollab(c.id, { shoot_date: v || null })} />
		</div>
	{/if}
</div>

<style>
	/* Remove outer nested box from app.css so cards breathe cleanly inside the collab card */
	.ct-list.sb-wrap {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 14px;
		padding: 14px 0 2px;
		border-radius: 0;
		background: transparent;
		border-top: 1px solid var(--line);
	}
	.sb-empty {
		display: grid;
		gap: 10px;
		justify-items: start;
		padding: 14px;
		border-radius: 14px;
		border: 1px dashed var(--line-strong);
		background: var(--surface-2, var(--surface));
	}
	.sb-prog-wrap {
		display: grid;
		gap: 7px;
	}
	.sb-prog-hd {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.sb-prog-lbl {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.sb-prog-stat {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11.5px;
		font-weight: 600;
		color: var(--ink-2);
		font-variant-numeric: tabular-nums;
	}
	.sb-prog {
		height: 4px;
		border-radius: 99px;
		background: var(--line);
		overflow: hidden;
	}
	.sb-prog i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--g1), var(--g2), var(--g3));
		transition: width 0.35s ease;
	}

	.sb-deck {
		display: grid;
		gap: 10px;
	}
	.sb-card {
		display: grid;
		gap: 9px;
		padding: 13px 14px;
		border-radius: 16px;
		border: 1px solid var(--line);
		background: var(--surface-2, #1e1820);
		transition: border-color 0.2s, opacity 0.2s, background 0.2s;
	}
	.sb-card.done {
		border-color: color-mix(in oklab, var(--ok) 35%, var(--line));
		background: color-mix(in oklab, var(--ok) 5%, var(--surface));
		opacity: 0.68;
	}

	.sb-top {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.sb-check {
		display: grid;
		place-items: center;
		cursor: pointer;
	}
	.sb-check input {
		appearance: none;
		-webkit-appearance: none;
		width: 20px;
		height: 20px;
		margin: 0;
		border: 1.5px solid var(--line-strong);
		border-radius: 50%;
		background: var(--surface);
		display: grid;
		place-items: center;
		cursor: pointer;
		transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
	}
	.sb-check input:checked {
		border-color: var(--ok);
		background: var(--ok);
		box-shadow: 0 0 10px color-mix(in oklab, var(--ok) 45%, transparent);
	}
	.sb-check input:checked::after {
		content: '';
		width: 8px;
		height: 4.5px;
		margin-top: -2px;
		border-left: 2px solid var(--bg);
		border-bottom: 2px solid var(--bg);
		transform: rotate(-45deg);
	}
	.sb-check input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.sb-num {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.sb-time {
		font-family: var(--f-mono, ui-monospace, monospace);
		font-size: 11px;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 99px;
		color: var(--g1);
		background: color-mix(in oklab, var(--g1) 14%, var(--surface));
		border: 1px solid color-mix(in oklab, var(--g1) 32%, var(--line));
	}
	.sb-x {
		margin-left: auto;
		width: 26px;
		height: 26px;
		padding: 0;
		display: grid;
		place-items: center;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--ink-3);
		opacity: 0.5;
		cursor: pointer;
	}
	.sb-x:hover {
		opacity: 1;
		background: var(--surface);
	}
	.sb-x :global(.ic) {
		width: 13px;
		height: 13px;
	}

	.sb-vis {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
		line-height: 1.42;
		color: var(--ink);
		overflow-wrap: anywhere;
	}
	.sb-card.done .sb-vis {
		color: var(--ink-3);
		text-decoration: line-through;
	}

	/* Editorial left-accented voiceover line (no heavy nested rounded box) */
	.sb-say {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 6px 0 6px 11px;
		border-left: 2px solid var(--g2);
		background: linear-gradient(90deg, color-mix(in oklab, var(--g2) 8%, transparent), transparent 85%);
		border-radius: 0 8px 8px 0;
	}
	.sb-say-ic {
		color: var(--g2);
		padding-top: 2px;
		flex-shrink: 0;
	}
	.sb-say-ic :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.sb-say-txt {
		font-size: 13.5px;
		line-height: 1.48;
		color: var(--ink-2);
	}

	.sb-add {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 4px 4px 14px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		background: var(--surface-2);
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

	.sb-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.sb-links button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 12px;
		border-radius: 99px;
		border: 1px solid var(--line-strong);
		background: var(--surface);
		color: var(--ink-2);
		font: inherit;
		font-size: 12.5px;
		font-weight: 600;
		cursor: pointer;
	}
	.sb-links button:hover {
		color: var(--ink);
		border-color: var(--ink-3);
	}
	.sb-links button :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.ct-warn {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--bad);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		text-align: left;
		cursor: pointer;
	}
	.ct-warn :global(.ic) {
		flex: none;
		width: 15px;
		height: 15px;
	}
	.ct-shots-t {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
	}
	.ct-shots-t em {
		font-style: normal;
		font-size: 0.86em;
		font-weight: 500;
		opacity: 0.7;
	}
</style>
