<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '../auth.svelte';
	import { inviteLink } from '../invite';
	import { supabase } from '../supabase';
	import { firstName } from '../util';
	import Icon from './Icon.svelte';
	import Logo from './Logo.svelte';

	// Slim sticky zero-login brand bar shown on outbound creator links (invoice, files, report, brief, action, review).
	// Keeps focus on the document while offering a clean 1-tap signup CTA and safe-area-inset-top support.
	let { creator = '', from, context = 'collab' }: { creator?: string; from: string; context?: string } = $props();
	let dismissed = $state(false);
	let founding = $state<{ on: boolean; left: number; months: number } | null>(null);

	const show = $derived(!dismissed && auth.account?.role !== 'brand');
	const who = $derived(firstName(creator) || 'This creator');

	onMount(() => {
		if (show) {
			supabase.rpc('founding_brands').then(({ data }) => {
				founding = (data as typeof founding) ?? null;
			});
		}
	});
</script>

{#if show}
	<aside class="zlb no-print" aria-label="Claim your free Brand Workspace on Miracle">
		<div class="zlb-in">
			<span class="zlb-logo" aria-hidden="true"><Logo size={18} /></span>
			<div class="zlb-copy">
				<b>{who}</b><span> runs this {context} on Miracle</span>
				{#if founding?.on}
					<small class="zlb-sub">· {founding.months}m Brand Pro free ({founding.left} left)</small>
				{/if}
			</div>
			<div class="zlb-act">
				<a class="zlb-cta" href={inviteLink('brand', `${from}_bar`)}>Claim free</a>
				<button type="button" class="zlb-x" aria-label="Dismiss" onclick={() => (dismissed = true)}>
					<Icon name="x" />
				</button>
			</div>
		</div>
	</aside>
{/if}

<style>
	.zlb {
		position: sticky;
		top: 0;
		z-index: 40;
		padding-top: env(safe-area-inset-top, 0px);
		background: rgba(16, 12, 19, 0.9);
		border-bottom: 1px solid rgba(255, 255, 255, 0.09);
		color: #faf7fc;
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}
	.zlb-in {
		max-width: 720px;
		margin: 0 auto;
		padding: 9px max(14px, env(safe-area-inset-right, 0px)) 9px max(14px, env(safe-area-inset-left, 0px));
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.zlb-logo {
		flex: none;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		background: linear-gradient(135deg, rgba(156, 123, 255, 0.22), rgba(242, 90, 144, 0.22));
		border: 1px solid rgba(242, 90, 144, 0.34);
	}
	.zlb-copy {
		flex: 1;
		min-width: 0;
		font-size: 12.5px;
		line-height: 1.25;
		color: #cfc6d6;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.zlb-copy b {
		color: #faf7fc;
		font-weight: 600;
	}
	.zlb-sub {
		font-size: 11.5px;
		color: #9b8fa8;
		margin-left: 4px;
	}
	.zlb-act {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}
	.zlb-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 28px;
		padding: 0 11px;
		border-radius: 0;
		background: linear-gradient(95deg, #9c7bff, #f25a90 55%, #ffae6b);
		color: #120b14;
		font: 700 10.5px/1 var(--f-mono, ui-monospace, monospace);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-decoration: none;
		white-space: nowrap;
		transition: opacity 0.15s ease;
	}
	.zlb-cta:hover {
		opacity: 0.92;
	}
	.zlb-x {
		appearance: none;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: transparent;
		color: #8f8499;
		width: 28px;
		height: 28px;
		border-radius: 0;
		cursor: pointer;
		display: grid;
		place-items: center;
		flex: none;
		padding: 0;
	}
	.zlb-x :global(.ic) {
		width: 14px;
		height: 14px;
	}
	.zlb-x:hover {
		color: #faf7fc;
		border-color: rgba(255, 255, 255, 0.24);
	}
	@media (max-width: 560px) {
		.zlb-sub {
			display: none;
		}
	}
</style>
