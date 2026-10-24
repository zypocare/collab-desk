<script lang="ts">
	import { portal } from '../portal';
	import { toast } from '../ui.svelte';
	import { errMessage, inrS } from '../util';
	import { useWorkspace, workspaces, type Workspace } from '../workspaces.svelte';
	import Icon from './Icon.svelte';

	// Only for a login on more than one brand team (an agency's staff): which client it's working for, and
	// a sheet with every client side by side to switch. A brand with one team never sees it.
	let { compact = false }: { compact?: boolean } = $props();
	const current = $derived(workspaces.list.find((w) => w.current));
	let open = $state(false);
	let busy = $state('');
	const ROLE: Record<string, string> = { admin: 'Admin', approver: 'Approver', finance: 'Finance', member: 'Member' };
	async function pick(w: Workspace) {
		if (w.current) return (open = false);
		busy = w.owner;
		try {
			await useWorkspace(w.owner);
		} catch (e) {
			toast(errMessage(e), 'alert');
			busy = '';
		}
	}
	const line = (w: Workspace) =>
		[
			w.open ? `${w.open} open` : 'Nothing open',
			w.waiting ? `${w.waiting} waiting on you` : '',
			w.approvals ? `${w.approvals} to approve` : '',
			w.to_pay ? `${inrS(w.to_pay)} to pay` : ''
		]
			.filter(Boolean)
			.join(' · ');
</script>

{#if workspaces.list.length > 1 && current}
	<button class="ws-btn" class:compact onclick={() => (open = true)} aria-haspopup="dialog">
		<span class="ws-l"><small>Working for</small><b>{current.name}</b></span>
		<span class="ws-n" aria-label="{workspaces.list.length} clients">{workspaces.list.length}</span>
		<Icon name="chevD" />
	</button>
{/if}

{#if open}
	<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && (open = false)}>
		<div class="dialog ws-sheet" role="dialog" aria-modal="true" aria-labelledby="ws-t">
			<header class="ws-h">
				<div><span class="eb">Your clients</span><h2 id="ws-t">Which team are you working for?</h2></div>
				<button class="icon-btn" onclick={() => (open = false)} aria-label="Close"><Icon name="x" /></button>
			</header>
			<p class="ws-note">Each client sees only its own companies, requests and money. You see one client at a time.</p>
			<ul class="ws-list">
				{#each workspaces.list as w (w.owner)}
					<li>
						<button class="ws-it" class:on={w.current} disabled={!!busy} onclick={() => pick(w)} aria-current={w.current ? 'true' : undefined}>
							<span class="ws-top">
								<b>{w.name}</b>
								{#if w.current}<em class="ws-now">Working here</em>{:else if busy === w.owner}<span class="spinner"></span>{/if}
							</span>
							<small>{w.own ? 'Your own' : ROLE[w.role ?? 'member']} · {w.companies} compan{w.companies === 1 ? 'y' : 'ies'}</small>
							<span class="ws-k" class:hot={w.waiting || w.approvals}>{line(w)}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<style>
	.ws-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--line-strong);
		border-radius: 14px;
		background: var(--surface);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.ws-btn.compact {
		margin: 8px 16px 0;
		width: calc(100% - 32px);
	}
	.ws-btn :global(.ic) {
		flex: none;
		width: 16px;
		height: 16px;
		color: var(--ink-3);
	}
	.ws-l {
		display: grid;
		flex: 1;
		min-width: 0;
	}
	.ws-l small {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.ws-l b {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 14.5px;
	}
	.ws-n {
		flex: none;
		min-width: 22px;
		padding: 2px 7px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--ink) 10%, transparent);
		font-size: 12px;
		font-weight: 700;
		text-align: center;
	}
	.ws-sheet {
		width: min(520px, 100%);
	}
	.ws-h {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}
	.ws-h h2 {
		margin: 4px 0 0;
		font: 400 24px/1.15 var(--f-serif, Georgia, serif);
	}
	.ws-note {
		margin: 8px 0 14px;
		font-size: 13px;
		color: var(--ink-3);
	}
	.ws-list {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: 60vh;
		overflow-y: auto;
	}
	.ws-it {
		display: grid;
		gap: 3px;
		width: 100%;
		padding: 14px 16px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: var(--surface-2, var(--surface));
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.ws-it.on {
		border-color: var(--g2, var(--accent));
		box-shadow: 0 0 0 1px var(--g2, var(--accent)) inset;
	}
	.ws-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.ws-top b {
		font-size: 15.5px;
	}
	.ws-now {
		padding: 2px 8px;
		border-radius: 999px;
		background: color-mix(in oklab, var(--ok) 18%, transparent);
		color: var(--ok);
		font-size: 11px;
		font-style: normal;
		font-weight: 700;
	}
	.ws-it small {
		font-size: 12.5px;
		color: var(--ink-3);
	}
	.ws-k {
		font-size: 13px;
		color: var(--ink-2);
	}
	.ws-k.hot {
		color: var(--warn);
	}
</style>
