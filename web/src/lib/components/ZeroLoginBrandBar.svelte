<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '../auth.svelte';
	import { inviteLink } from '../invite';
	import { supabase } from '../supabase';
	import { firstName } from '../util';
	import Logo from './Logo.svelte';

	// Sticky zero-login brand conversion bar shown on outbound creator links (invoice, files, report, brief, action, review).
	// Includes safe-area-inset-top padding so it never gets clipped behind the native iOS/Android status bar.
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
			<span class="zlb-logo"><Logo size={24} /></span>
			<div class="zlb-copy">
				<b>{who} runs this {context} on Miracle</b>
				<span>
					{#if founding?.on}
						Founding Brand offer: Brand Pro free for {founding.months} months ({founding.left} spot{founding.left === 1 ? '' : 's'} left) · Track creators, GST &amp; ROI in one workspace.
					{:else}
						Manage all your creators, briefs, approvals &amp; ROI in one free brand workspace.
					{/if}
				</span>
			</div>
			<div class="zlb-act">
				<a class="zlb-cta" href={inviteLink('brand', `${from}_bar`)}>Claim free workspace</a>
				<button type="button" class="zlb-x" aria-label="Dismiss" onclick={() => (dismissed = true)}>✕</button>
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
		background: linear-gradient(90deg, color-mix(in oklab, var(--g1) 22%, var(--hero, #161118)), color-mix(in oklab, var(--g2) 18%, var(--hero, #161118)));
		border-bottom: 1px solid color-mix(in oklab, var(--g1) 38%, var(--line));
		color: #fff;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}
	.zlb-in {
		max-width: 980px;
		margin: 0 auto;
		padding: 10px max(16px, env(safe-area-inset-right, 0px)) 10px max(16px, env(safe-area-inset-left, 0px));
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.zlb-logo {
		flex: none;
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.1);
	}
	.zlb-copy {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 1px;
	}
	.zlb-copy b {
		font-size: 13px;
		font-weight: 700;
		line-height: 1.25;
		color: #fff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.zlb-copy span {
		font-size: 11.5px;
		line-height: 1.35;
		color: rgba(255, 255, 255, 0.8);
	}
	.zlb-act {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.zlb-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 7px 14px;
		border-radius: 999px;
		background: linear-gradient(135deg, var(--g1), var(--g2), var(--g3));
		color: #120b12;
		font-size: 12px;
		font-weight: 800;
		text-decoration: none;
		white-space: nowrap;
		transition: transform 0.18s ease, opacity 0.18s ease;
	}
	.zlb-cta:hover { transform: translateY(-1px); opacity: 0.95; }
	.zlb-x {
		appearance: none;
		border: 0;
		background: rgba(255, 255, 255, 0.14);
		color: rgba(255, 255, 255, 0.9);
		width: 28px;
		height: 28px;
		border-radius: 50%;
		cursor: pointer;
		font-size: 12px;
		display: grid;
		place-items: center;
		flex: none;
	}
	.zlb-x:hover { background: rgba(255, 255, 255, 0.24); }
	@media (max-width: 640px) {
		.zlb-in {
			flex-wrap: wrap;
			gap: 8px;
			padding: 10px max(14px, env(safe-area-inset-right, 0px)) 11px max(14px, env(safe-area-inset-left, 0px));
		}
		.zlb-logo { width: 30px; height: 30px; border-radius: 8px; }
		.zlb-copy b { font-size: 12.5px; }
		.zlb-copy span { display: none; }
		.zlb-act { width: 100%; justify-content: space-between; }
		.zlb-cta { flex: 1; padding: 8px 14px; }
	}
</style>
