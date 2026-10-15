<script lang="ts">
	import { goto } from '$app/navigation';
	import BrandDetailsForm from '#lib/components/BrandDetailsForm.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import BrandBillingForm from '#lib/components/BrandBillingForm.svelte';
	import { auth } from '#lib/auth.svelte.ts';
</script>

<svelte:head><title>Company details</title></svelte:head>

<a class="back" href="/brand"><Icon name="back" />My requests</a>
<header class="ph rv">
	<div>
		<div class="eb">Your account</div>
		<h1>Company <em>details</em></h1>
		<p>Used on every request you send.</p>
	</div>
</header>
<section class="panel rv" style="--i:1;padding:22px"><BrandDetailsForm onsaved={() => goto('/brand')} /></section>
{#if auth.account?.role === 'brand' && auth.account.brand}
	<section class="panel rv" style="--i:2;padding:22px;margin-top:18px">
		<h2 style="font-size:18px;margin-bottom:4px">Billing details</h2>
		<p class="hint" style="margin-bottom:16px">Printed on the invoices you receive. Add your GSTIN if you want to claim GST input credit.</p>
		<BrandBillingForm />
	</section>
{/if}
