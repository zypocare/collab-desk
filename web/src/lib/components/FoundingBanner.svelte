<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '../supabase';
	import Icon from './Icon.svelte';

	// A founding brand team (one of the first 100): Brand Pro is free until a date. Shown on Today until
	// they close it (kept on this device).
	let until = $state<string | null>(null);
	let hidden = $state(true);
	const KEY = 'mc-founding-seen';
	onMount(async () => {
		try {
			hidden = localStorage.getItem(KEY) === '1';
		} catch {
			hidden = false;
		}
		if (hidden) return;
		const { data } = await supabase.rpc('my_founding');
		until = (data as { until?: string } | null)?.until ?? null;
	});
	function close() {
		hidden = true;
		try {
			localStorage.setItem(KEY, '1');
		} catch {
			/* storage blocked */
		}
	}
	const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
</script>

{#if until && !hidden}
	<aside class="fb" aria-label="Founding brand">
		<span class="fb-ic" aria-hidden="true"><Icon name="spark" /></span>
		<div class="fb-t">
			<small>Founding brand</small>
			<b>Brand Pro is on us until {day(until)}</b>
			<span>Unlimited creator profiles, every filter and campaign tool. Thanks for being one of the first 100.</span>
			<a href="/brand/explore">Explore creators<Icon name="chevR" /></a>
		</div>
		<button class="fb-x" onclick={close} aria-label="Close"><Icon name="x" /></button>
	</aside>
{/if}

<style>
	.fb { position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 12px; align-items: start; margin: 4px 0 16px; padding: 16px; border-radius: 20px; border: 1px solid color-mix(in oklab, var(--g2) 40%, var(--line)); background: radial-gradient(120% 90% at 100% 0%, color-mix(in oklab, var(--g2) 18%, transparent), transparent 60%), var(--surface); }
	.fb-ic { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, var(--g1), var(--g2) 60%, var(--g3)); }
	.fb-t { display: grid; gap: 4px; min-width: 0; }
	.fb-t small { font-size: 10.5px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: var(--g2); }
	.fb-t b { font: 400 21px/1.15 var(--f-serif); }
	.fb-t span { color: var(--ink-2); font-size: 13.5px; line-height: 1.45; }
	.fb-t a { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; color: var(--ink); font-weight: 700; font-size: 14px; text-decoration: none; }
	.fb-t a :global(.ic) { width: 15px; height: 15px; }
	.fb-x { width: 32px; height: 32px; border-radius: 50%; border: 0; background: transparent; color: var(--ink-3); display: grid; place-items: center; cursor: pointer; }
</style>
