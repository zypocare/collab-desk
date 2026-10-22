<script lang="ts">
	import { supabase } from '../supabase';
	import { compact } from '../util';

	// "Verified on Instagram": shown to the creator when the brand's team connected the account.
	let { brandId }: { brandId: string } = $props();
	type V = { username: string; followers: number | null };
	const seen = new Map<string, V | null>();
	let v = $state<V | null>(null);
	$effect(() => {
		const id = brandId;
		if (seen.has(id)) return void (v = seen.get(id) ?? null);
		v = null;
		supabase.rpc('brand_verified', { p_brand: id }).then(({ data }) => {
			seen.set(id, (data as V | null) ?? null);
			if (id === brandId) v = (data as V | null) ?? null;
		});
	});
</script>

{#if v}
	<span class="bv" title="This brand's team signed in with the Instagram account @{v.username}">✓ Verified on Instagram · @{v.username}{v.followers != null ? ` · ${compact(v.followers)}` : ''}</span>
{/if}

<style>
	.bv {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		padding: 3px 10px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ok) 15%, transparent);
		color: var(--ok);
		font-size: 12px;
		font-weight: 700;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
