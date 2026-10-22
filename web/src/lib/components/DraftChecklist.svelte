<script lang="ts">
	import { draftCheck, type DraftCheck } from '../autopilots.svelte';
	import Icon from './Icon.svelte';

	// The draft checker on a request's page: the caption against the brief, and the changes to ask for.
	let { draft, onask }: { draft: string; onask: (message: string) => void } = $props();
	let res = $state<{ checks: DraftCheck[]; missing: number; message: string } | null>(null);
	$effect(() => {
		const id = draft;
		res = null;
		draftCheck(id)
			.then((r) => (res = r))
			.catch(() => (res = null));
	});
</script>

{#if res && res.checks.length}
	<div class="dc" class:warn={res.missing > 0}>
		<div class="dc-h"><span class="dc-tag">Draft checker</span><b>{res.missing ? `${res.missing} thing${res.missing === 1 ? '' : 's'} missing` : 'Passes every check'}</b></div>
		<ul>
			{#each res.checks as c, i (i)}
				<li class={c.ok === null ? 'na' : c.ok ? 'ok' : 'no'}>
					<i aria-hidden="true">{#if c.ok === null}–{:else if c.ok}<Icon name="check" />{:else}<Icon name="x" />{/if}</i>
					<span>{c.label}</span>
					<small class="sr">{c.ok === null ? 'check yourself' : c.ok ? 'done' : 'missing'}</small>
				</li>
			{/each}
		</ul>
		{#if res.missing}<button class="btn" onclick={() => onask(res!.message)}><Icon name="edit" />Ask for these changes</button>{/if}
	</div>
{/if}

<style>
	.dc {
		display: grid;
		gap: 10px;
		margin-top: 14px;
		padding: 14px 16px;
		border-radius: 16px;
		background: color-mix(in oklab, var(--ok) 6%, var(--surface));
		box-shadow: inset 0 0 0 1px var(--line);
	}
	.dc.warn {
		background: color-mix(in oklab, var(--g3) 7%, var(--surface));
	}
	.dc-h {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.dc-tag {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		padding: 4px 9px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--g2) 16%, transparent);
		color: var(--g2);
	}
	.dc-h b {
		font-size: 14px;
	}
	.dc.warn .dc-h b {
		color: var(--g3);
	}
	ul {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		font-size: 14px;
	}
	li + li {
		border-top: 1px solid var(--line);
	}
	li i {
		width: 22px;
		height: 22px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 50%;
		font-style: normal;
	}
	li i :global(.ic) {
		width: 13px;
		height: 13px;
		stroke-width: 2.6;
	}
	li.ok i {
		background: color-mix(in oklab, var(--ok) 18%, transparent);
		color: var(--ok);
	}
	li.no i {
		background: color-mix(in oklab, var(--bad) 18%, transparent);
		color: var(--bad);
	}
	li.na {
		color: var(--ink-3);
	}
	li.na i {
		background: color-mix(in oklab, var(--ink) 8%, transparent);
	}
	.dc .btn {
		justify-self: start;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
