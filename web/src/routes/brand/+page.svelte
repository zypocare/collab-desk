<script lang="ts">
	import { onMount } from 'svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { autopilots } from '#lib/autopilots.svelte.ts';
	import { brandHome } from '#lib/brand.svelte.ts';
	import { loadBrandToday } from '#lib/brandToday.svelte.ts';
	import { isAppHost } from '#lib/creatorHost.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import { firstName } from '#lib/util.ts';
	import BrandLaptopToday from '#lib/components/BrandLaptopToday.svelte';
	import BrandPhoneToday from '#lib/components/BrandPhoneToday.svelte';
	import CompanyStep from '#lib/components/CompanyStep.svelte';

	// Today for a brand: the creator's Today screen, with everything across every creator this login works with.
	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const d = $derived(brandHome.dash);
	onMount(() => {
		loadBrandToday();
		supabase.rpc('autopilots_get').then(({ data }) => data && (autopilots.settings = data as never));
	});
	const onApp = isAppHost(location.hostname);
	// On a creator's address, before anything was sent: the company first (Miracle's own address asks at sign-up).
	const needsCompany = $derived(!!acc && !!d && !onApp && !d.creators?.length && !acc.brand && !acc.profile);
</script>

<svelte:head><title>Today · Miracle</title></svelte:head>

{#if needsCompany}
	<header class="ph rv"><div><div class="eb">Welcome</div><h1>Tell us about your <em>brand</em></h1><p>We'll use this on every request you send.</p></div></header>
	<CompanyStep creator={firstName(pub.data?.display_name ?? '')} />
{:else}
	{#if brandHome.error}<div class="err-box">{brandHome.error}</div>{/if}
	{#if phone.on}
		<BrandPhoneToday />
	{:else}
		<BrandLaptopToday />
	{/if}
{/if}
