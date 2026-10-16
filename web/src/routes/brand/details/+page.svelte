<script lang="ts">
	import { goto } from '$app/navigation';
	import BrandDetailsForm from '#lib/components/BrandDetailsForm.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import BrandBillingForm from '#lib/components/BrandBillingForm.svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { page } from '$app/state';
	import { loadRequests } from '#lib/brand.svelte.ts';
	import BrandTeam from '#lib/components/BrandTeam.svelte';

	const isNew = $derived(page.url.searchParams.get('new') === '1');
</script>

<svelte:head><title>Company details</title></svelte:head>

<a class="back" href="/brand"><Icon name="back" />My requests</a>
<header class="ph rv">
	<div>
		<div class="eb">Your account</div>
		{#if isNew}
			<h1>Add a <em>brand</em></h1>
			<p>Manage several brands from one login, for example as an agency. Switch between them from the top bar.</p>
		{:else}
			<h1>Company <em>details</em></h1>
			<p>Used on every request you send.</p>
		{/if}
	</div>
</header>
{#key isNew}
	<section class="panel rv" style="--i:1;padding:22px"><BrandDetailsForm {isNew} submitLabel={isNew ? 'Add brand' : 'Save details'} onsaved={() => (loadRequests(), goto('/brand'))} /></section>
{/key}
{#if !isNew}<p class="hint" style="margin:12px 4px 0">Managing more than one brand? <a class="lnk" href="/brand/details?new=1">Add another brand</a></p>{/if}
{#if !isNew && auth.account?.role === 'brand' && auth.account.brand}
	<section class="panel rv" style="--i:2;padding:22px;margin-top:18px">
		<h2 style="font-size:18px;margin-bottom:4px">Billing details</h2>
		<p class="hint" style="margin-bottom:16px">Printed on the invoices you receive. Add your GSTIN if you want to claim GST input credit.</p>
		<BrandBillingForm />
	</section>
	<BrandTeam />
{/if}
