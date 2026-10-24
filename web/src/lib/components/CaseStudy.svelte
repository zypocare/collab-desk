<script lang="ts">
	import { onMount } from 'svelte';
	import { askAi } from '../ai';
	import { askCase, deleteCase, getCase, highlightsFrom, saveCase, type CaseStudy } from '../caseStudy';
	import { supabase } from '../supabase';
	import type { Collab } from '../types';
	import { toast } from '../ui.svelte';
	import { delivText, errMessage } from '../util';
	import Icon from './Icon.svelte';

	// The collab as a case study for her page: AI drafts it from the results report, she edits it, the brand
	// approves it, and it goes on her page. Editing a published one sends it back to the brand.
	let { c }: { c: Collab } = $props();
	let cs = $state<CaseStudy | null>(null);
	let loaded = $state(false);
	// The brand's review of the collab, if they left one (the AI may quote it as theirs, never invent one).
	let review = $state<{ rating: number; body: string } | null>(null);
	let form = $state({ title: '', summary: '', goal: '', made: '', results: '' });
	let editing = $state(false);
	let busy = $state('');
	const report = $derived(c.reports?.[0]?.data ?? null);
	const highlights = $derived(highlightsFrom(report));
	onMount(async () => {
		cs = await getCase(c.id).catch(() => null);
		const { data: rv } = await supabase.from('brand_reviews').select('rating, body').eq('collab_id', c.id).maybeSingle();
		review = (rv as { rating: number; body: string } | null) ?? null;
		if (cs) form = { title: cs.title, summary: cs.summary, goal: cs.goal, made: cs.made, results: cs.results };
		loaded = true;
	});
	async function draft() {
		busy = 'draft';
		try {
			const d = await askAi<typeof form>('casestudy', {
				brand: c.brand.name,
				category: c.brand.category ?? '',
				made: delivText(c.deliverables ?? []),
				brief: String(c.brief ?? '').slice(0, 800),
				results: report ? { ...report.totals, engagement_rate: report.engagement_rate, days_after: report.days_after, link: report.link ?? null } : null,
				brand_review: review ? { stars: review.rating, words: review.body } : null
			});
			form = d;
			editing = true;
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	async function save() {
		busy = 'save';
		try {
			cs = await saveCase(c.id, { ...form, highlights: highlights });
			editing = false;
			toast(cs.status === 'draft' ? 'Saved. Ask the brand to approve it when you’re ready.' : 'Saved', 'check');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	async function ask() {
		busy = 'ask';
		try {
			if (editing) await save();
			cs = await askCase(c.id);
			toast(`Sent to ${c.brand.name} to approve`, 'send');
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	async function remove() {
		busy = 'del';
		try {
			await deleteCase(c.id);
			cs = null;
			form = { title: '', summary: '', goal: '', made: '', results: '' };
			editing = false;
		} catch (e) {
			toast(errMessage(e), 'alert');
		} finally {
			busy = '';
		}
	}
	const STATUS = { draft: 'Draft', asked: 'Waiting for the brand', published: 'On your page', declined: 'Changes asked' } as const;
</script>

{#if loaded}
	<div class="cs">
		{#if !cs && !editing}
			<p class="hint">Turn this collab into a short case study for your page: the brand’s goal, what you made and the results, with Instagram’s numbers. It goes up only when {c.brand.name} approves it.</p>
			{#if !report}<p class="hint">It needs the results report first (a week after the post goes live).</p>{/if}
			<button class="btn primary" onclick={draft} disabled={!!busy || !report}>{#if busy === 'draft'}<span class="spinner"></span>Writing…{:else}<Icon name="spark" />Write it with AI{/if}</button>
		{:else if editing}
			<div class="cs-form">
				<label><span>Title</span><input class="inp" maxlength="120" bind:value={form.title} /></label>
				<label><span>In one line</span><textarea class="inp" rows="2" maxlength="300" bind:value={form.summary}></textarea></label>
				<label><span>The goal</span><textarea class="inp" rows="2" maxlength="600" bind:value={form.goal}></textarea></label>
				<label><span>What you made</span><textarea class="inp" rows="3" maxlength="600" bind:value={form.made}></textarea></label>
				<label><span>The results</span><textarea class="inp" rows="2" maxlength="600" bind:value={form.results}></textarea></label>
			</div>
			{#if highlights.length}<div class="cs-hl">{#each highlights as h (h.label)}<span><b>{h.value}</b>{h.label}</span>{/each}</div><small class="hint">Numbers from the results report; they can’t be edited.</small>{/if}
			<div class="cs-acts">
				<button class="btn primary" onclick={save} disabled={!!busy || form.title.trim().length < 3}>{#if busy === 'save'}<span class="spinner"></span>{/if}Save</button>
				<button class="btn" onclick={draft} disabled={!!busy}>{#if busy === 'draft'}<span class="spinner"></span>{:else}<Icon name="refresh" />{/if}Write again</button>
				{#if cs}<button class="btn ghost" onclick={() => ((editing = false), cs && (form = { title: cs.title, summary: cs.summary, goal: cs.goal, made: cs.made, results: cs.results }))}>Cancel</button>{/if}
			</div>
		{:else if cs}
			<div class="cs-card">
				<span class="cs-st {cs.status}">{STATUS[cs.status]}</span>
				<b>{cs.title}</b>
				<p>{cs.summary}</p>
				{#if cs.highlights.length}<div class="cs-hl">{#each cs.highlights as h (h.label)}<span><b>{h.value}</b>{h.label}</span>{/each}</div>{/if}
				{#if cs.quote}<blockquote>“{cs.quote}”{#if cs.quote_by}<small>{cs.quote_by}</small>{/if}</blockquote>{/if}
				{#if cs.status === 'declined' && cs.brand_note}<p class="cs-note">{c.brand.name}: “{cs.brand_note}”</p>{/if}
			</div>
			<div class="cs-acts">
				{#if cs.status === 'draft' || cs.status === 'declined'}<button class="btn primary" onclick={ask} disabled={!!busy}>{#if busy === 'ask'}<span class="spinner"></span>{:else}<Icon name="send" />{/if}Ask {c.brand.name} to approve</button>{/if}
				<button class="btn" onclick={() => (editing = true)} disabled={!!busy}><Icon name="edit" />Edit</button>
				<button class="btn ghost" onclick={remove} disabled={!!busy}>Delete</button>
			</div>
			{#if cs.status === 'published'}<small class="hint">Editing it sends it back to {c.brand.name} to approve again.</small>{/if}
		{/if}
	</div>
{/if}

<style>
	.cs {
		display: grid;
		gap: 12px;
	}
	.cs-form {
		display: grid;
		gap: 10px;
	}
	.cs-form label {
		display: grid;
		gap: 4px;
	}
	.cs-form span {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.cs-form .inp {
		height: auto;
		min-height: 42px;
		padding: 10px 12px;
		line-height: 1.45;
		resize: vertical;
	}
	.cs-hl {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.cs-hl span {
		display: grid;
		gap: 2px;
		min-width: 84px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--surface-2);
		font-size: 12px;
		color: var(--ink-3);
	}
	.cs-hl b {
		font: 400 22px/1 var(--f-serif, Georgia, serif);
		color: var(--ink);
	}
	.cs-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.cs-card {
		display: grid;
		gap: 8px;
		padding: 16px;
		border-radius: 16px;
		background: var(--surface-2);
	}
	.cs-card > b {
		font: 400 20px/1.2 var(--f-serif, Georgia, serif);
	}
	.cs-card p {
		margin: 0;
		font-size: 14px;
		color: var(--ink-2);
	}
	.cs-card blockquote {
		margin: 0;
		padding-left: 12px;
		border-left: 3px solid var(--g2);
		font-style: italic;
	}
	.cs-card blockquote small {
		display: block;
		font-style: normal;
		color: var(--ink-3);
	}
	.cs-st {
		justify-self: start;
		padding: 3px 9px;
		border-radius: 99px;
		background: var(--surface);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.cs-st.published {
		background: color-mix(in oklab, var(--ok) 18%, transparent);
		color: var(--ok);
	}
	.cs-st.asked {
		background: color-mix(in oklab, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.cs-st.declined {
		background: color-mix(in oklab, var(--bad) 16%, transparent);
		color: var(--bad);
	}
	.cs-note {
		color: var(--bad) !important;
	}
</style>
