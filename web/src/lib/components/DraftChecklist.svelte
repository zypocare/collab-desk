<script lang="ts">
	import { draftCheck, type DraftCheck } from '../autopilots.svelte';
	import Icon from './Icon.svelte';

	// Interactive Brief & ASCI Pre-Approval Checklist on a draft: combines automated brief checks
	// with manual visual/ASCI verification toggles and compiles missing items into one edit request.
	let { draft, onask }: { draft: string; onask: (message: string) => void } = $props();
	let res = $state<{ checks: DraftCheck[]; missing: number; message: string } | null>(null);
	let overrides = $state<Record<number, boolean>>({});

	$effect(() => {
		const id = draft;
		res = null;
		overrides = {};
		draftCheck(id)
			.then((r) => (res = r))
			.catch(() => (res = null));
	});

	const items = $derived.by(() => {
		if (!res) return [];
		return res.checks.map((c, i) => ({
			...c,
			idx: i,
			checked: overrides[i] !== undefined ? overrides[i] : c.ok === true
		}));
	});

	const doneCount = $derived(items.filter((x) => x.checked).length);
	const missingItems = $derived(items.filter((x) => !x.checked));

	function toggle(idx: number, cur: boolean) {
		overrides = { ...overrides, [idx]: !cur };
	}

	function askChanges() {
		if (!missingItems.length) return;
		const msg =
			res?.message && missingItems.length === res.missing
				? res.message
				: `Could you update these before going live?\n${missingItems.map((m) => `• ${m.label}`).join('\n')}`;
		onask(msg);
	}
</script>

{#if items.length}
	<section class="dc-card" class:ready={missingItems.length === 0}>
		<header class="dc-head">
			<div>
				<span class="dc-eb">Brief &amp; ASCI Checker</span>
				<h4>{missingItems.length ? `${missingItems.length} item${missingItems.length === 1 ? '' : 's'} to verify` : 'Passes every check'}</h4>
			</div>
			<span class="dc-score" class:ok={missingItems.length === 0}>{doneCount} / {items.length} Ready</span>
		</header>

		<div class="dc-list">
			{#each items as c (c.idx)}
				<button type="button" class="dc-item" class:done={c.checked} onclick={() => toggle(c.idx, c.checked)}>
					<span class="dc-box">{#if c.checked}<Icon name="check" />{/if}</span>
					<span class="dc-txt">
						<b>{c.label}</b>
						<small>{c.ok === null ? 'Manual visual check · tap to verify' : c.checked ? 'Verified' : 'Missing in caption/brief'}</small>
					</span>
				</button>
			{/each}
		</div>

		{#if missingItems.length}
			<button type="button" class="dc-ask" onclick={askChanges}>
				<Icon name="edit" />Send {missingItems.length} open item{missingItems.length === 1 ? '' : 's'} to creator
			</button>
		{/if}
	</section>
{/if}

<style>
	.dc-card {
		display: grid;
		gap: 12px;
		margin-top: 14px;
		padding: 15px;
		border-radius: 20px;
		background: linear-gradient(180deg, rgba(31, 24, 34, 0.94) 0%, rgba(21, 16, 23, 0.98) 100%);
		border: 1px solid rgba(255, 184, 92, 0.28);
		color: #faf7fc;
	}
	.dc-card.ready { border-color: rgba(60, 226, 155, 0.38); }
	.dc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
	.dc-eb {
		display: inline-block;
		font: 700 10px/1.2 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		background: linear-gradient(90deg, #9c7bff, #f25a90, #ffae6b);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
	}
	.dc-head h4 { margin: 3px 0 0; font: 400 22px/1.1 var(--f-serif, Georgia, serif); color: #faf7fc; }
	.dc-score {
		padding: 4px 10px;
		border-radius: 999px;
		background: rgba(255, 184, 92, 0.15);
		border: 1px solid rgba(255, 184, 92, 0.35);
		color: #ffb85c;
		font: 700 10px/1 var(--f-mono, ui-monospace, monospace);
		text-transform: uppercase;
		white-space: nowrap;
	}
	.dc-score.ok { background: rgba(60, 226, 155, 0.15); border-color: rgba(60, 226, 155, 0.38); color: #3ce29b; }

	.dc-list { display: grid; gap: 8px; }
	.dc-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border-radius: 13px;
		background: rgba(13, 10, 14, 0.55);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #faf7fc;
		text-align: left;
		cursor: pointer;
	}
	.dc-item.done { background: rgba(60, 226, 155, 0.08); border-color: rgba(60, 226, 155, 0.38); }
	.dc-box {
		width: 19px;
		height: 19px;
		border-radius: 6px;
		border: 1.5px solid #8f8499;
		display: grid;
		place-items: center;
		flex-shrink: 0;
		color: #0d0a0e;
	}
	.dc-item.done .dc-box { background: #3ce29b; border-color: #3ce29b; }
	.dc-box :global(.ic) { width: 13px; height: 13px; stroke-width: 2.6; }
	.dc-txt b { display: block; font-size: 12.5px; line-height: 1.3; }
	.dc-txt small { display: block; font-size: 11px; color: #8f8499; }

	.dc-ask {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 10px 15px;
		border: 0;
		border-radius: 10px;
		background: #faf7fc;
		color: #140e16;
		font: 800 12px/1 var(--f-body, system-ui, sans-serif);
		box-shadow: 0 3px 0 0 #f25a90;
		cursor: pointer;
	}
	.dc-ask :global(.ic) { width: 14px; height: 14px; }
</style>
