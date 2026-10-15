<script lang="ts">
	import { auth } from '#lib/auth.svelte.ts';
	import { brandData } from '#lib/brand.svelte.ts';
	import { pub } from '#lib/publicPage.svelte.ts';
	import { STAGES, delivText, firstName, fmt, stageIndex } from '#lib/util.ts';
	import BrandDetailsForm from '#lib/components/BrandDetailsForm.svelte';
	import Icon from '#lib/components/Icon.svelte';

	const acc = $derived(auth.account?.role === 'brand' ? auth.account : null);
	const creator = $derived(firstName(pub.data?.display_name ?? ''));
</script>

<svelte:head><title>My requests</title></svelte:head>

{#if acc && !acc.brand}
	<header class="ph rv">
		<div>
			<div class="eb">Welcome</div>
			<h1>Tell us about your <em>brand</em></h1>
			<p>We'll use this on every request you send{creator ? ` to ${creator}` : ''}.</p>
		</div>
	</header>
	<section class="panel rv" style="--i:1;padding:22px"><BrandDetailsForm submitLabel="Continue" /></section>
{:else if acc}
	<header class="ph rv">
		<div>
			<div class="eb">{acc.brand?.name}</div>
			<h1>Your <em>requests</em></h1>
			<p>Everything you've sent{creator ? ` to ${creator}` : ''}, and where each one stands.</p>
		</div>
		<div class="acts">{#if pub.data?.accepting !== false}<a class="btn grad" href="/brand/new"><Icon name="send" />New request</a>{/if}</div>
	</header>

	{#if brandData.error}<div class="err-box">{brandData.error}</div>{/if}

	{#if !brandData.loaded}
		<div class="loader" style="min-height:30vh"><span class="ring"><span></span></span></div>
	{:else if brandData.requests.length === 0}
		<div class="empty-card rv" style="--i:1">
			<h2>No requests yet</h2>
			<p>Send your first collaboration request. You'll be able to follow it here.</p>
			<a class="btn grad lg" href="/brand/new"><Icon name="send" />Send a request</a>
		</div>
	{:else}
		<div class="req-list">
			{#each brandData.requests as r, i (r.id)}
				{@const si = r.stage === 'declined' ? -1 : stageIndex(r.stage)}
				<a class="req" href="/brand/r/{r.code}" style="--i:{i}">
					<div class="req-h">
						<span class="id">{r.code}</span>
						<b>{delivText(r.deliverables)}</b>
						{#if r.quotes?.[0]?.status === 'sent' || r.drafts?.some((d) => d.status === 'pending')}<span class="pill tint k-new"><span class="dt pulse"></span>Needs your answer</span>{/if}
						<span class="chip tint st-{r.stage === 'declined' ? 'request' : r.stage}" style={r.stage === 'declined' ? '--hue:var(--bad)' : ''}>{r.stage_label}</span>
					</div>
					<div class="mini-steps" aria-hidden="true">{#each STAGES as _, k (k)}<i class:on={k <= si}></i>{/each}</div>
					{#if r.note_for_brand}<p>{r.note_for_brand}</p>{/if}
					<small>Sent {fmt(r.received_on)}{r.live_date ? ` · go-live ${fmt(r.live_date)}` : ''}</small>
				</a>
			{/each}
		</div>
	{/if}
{/if}
