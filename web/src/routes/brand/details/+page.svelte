<script lang="ts">
	import { goto } from '$app/navigation';
	import BrandDetailsForm from '#lib/components/BrandDetailsForm.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import BrandBillingForm from '#lib/components/BrandBillingForm.svelte';
	import { auth } from '#lib/auth.svelte.ts';
	import { page } from '$app/state';
	import { loadRequests } from '#lib/brand.svelte.ts';
	import BrandTeam from '#lib/components/BrandTeam.svelte';
	import { signOut, switchBrand } from '#lib/auth.svelte.ts';
	import { phone } from '#lib/phone.svelte.ts';
	import { theme, toggleTheme, toast } from '#lib/ui.svelte.ts';
	import { errMessage } from '#lib/util.ts';

	const acct = $derived(auth.account?.role === 'brand' ? auth.account : null);
	async function useBrand(id: string) {
		try {
			await switchBrand(id);
			await loadRequests();
			toast(`Now working as ${acct?.brand?.name ?? 'that brand'}`, 'refresh');
		} catch (e) {
			toast(errMessage(e), 'alert');
		}
	}

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
{#if phone.on && !isNew && acct}
	<!-- Phone: account settings live here, like an app's settings screen. -->
	<section class="b-acct rv" style="--i:3">
		<h2>Account</h2>
		<div class="b-rows">
			<div class="b-row"><span class="b-ri"><Icon name="mail" /></span><span class="b-rt"><b>Signed in as</b><small>{acct.email}</small></span></div>
			{#if (acct.brands?.length ?? 0) > 1}
				{#each acct.brands ?? [] as b (b.id)}
					<button class="b-row" onclick={() => useBrand(b.id)} disabled={b.id === acct.brand?.id}><span class="b-ri"><Icon name="users" /></span><span class="b-rt"><b>{b.name}</b><small>{b.id === acct.brand?.id ? 'Working as this brand' : 'Switch to this brand'}</small></span>{#if b.id === acct.brand?.id}<Icon name="check" class="b-ok" />{/if}</button>
				{/each}
			{/if}
			<a class="b-row" href="/brand/details?new=1"><span class="b-ri"><Icon name="plus" /></span><span class="b-rt"><b>Add another brand</b><small>For agencies with several brands</small></span><Icon name="chevR" class="b-chev" /></a>
			<button class="b-row" onclick={toggleTheme}><span class="b-ri"><Icon name={theme.value === 'dark' ? 'sun' : 'moon'} /></span><span class="b-rt"><b>{theme.value === 'dark' ? 'Light look' : 'Dark look'}</b><small>How the app looks on this phone</small></span></button>
			<button class="b-row b-out" onclick={async () => (await signOut(), goto('/', { replaceState: true }))}><span class="b-ri"><Icon name="logout" /></span><span class="b-rt"><b>Sign out</b></span></button>
		</div>
	</section>
{/if}
