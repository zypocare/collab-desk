<script lang="ts">
	import { auth } from '../auth.svelte';
	import { loadRequests } from '../brand.svelte';
	import { supabase } from '../supabase';
	import type { Account } from '../types';
	import { toast } from '../ui.svelte';
	import { errMessage } from '../util';
	import BrandDetailsForm from './BrandDetailsForm.svelte';

	// No company yet on this creator's page. A brand that already works with other creators can send as
	// that company (its details are copied over); otherwise, or by choice, it fills the details in.
	let { creator = '', submitLabel = 'Continue' }: { creator?: string; submitLabel?: string } = $props();
	const companies = $derived(auth.account?.role === 'brand' ? (auth.account.companies ?? []) : []);
	// The company given at sign-up (app.miracleapp.live), when it isn't already one of the above.
	const profile = $derived.by(() => {
		const p = auth.account?.role === 'brand' ? auth.account.profile : null;
		return p && !companies.some((c) => c.name.toLowerCase() === p.name.toLowerCase()) ? p : null;
	});
	const choices = $derived([...companies.map((c) => ({ id: c.id, name: c.name })), ...(profile ? [{ id: 'profile', name: profile.name }] : [])]);
	let fresh = $state(false);
	let busy = $state('');

	async function use(id: string, name: string) {
		busy = id;
		const { data, error } = id === 'profile' ? await supabase.rpc('brand_from_profile') : await supabase.rpc('copy_brand', { p_from: id });
		busy = '';
		if (error) return toast(errMessage(error), 'alert');
		auth.account = data as Account;
		loadRequests();
		toast(`Sending as ${name}`, 'check');
	}
</script>

{#if choices.length && !fresh}
	<section class="cs rv" style="--i:1">
		<span class="cs-eb">Your company</span>
		{#if choices.length === 1}
			<h2>Send this as <em>{choices[0].name}</em>?</h2>
		{:else}
			<h2>Which company is <em>this</em> for?</h2>
		{/if}
		<p>{companies.length ? "We'll copy your company details from your other requests: name, Instagram, website, GST and billing address." : "We'll use the company details you gave when you signed up."}{creator ? ` ${creator} only sees what you send them.` : ''}</p>
		<div class="cs-acts">
			{#each choices as c (c.id)}
				<button class="cs-neo cs-grad" disabled={!!busy} onclick={() => use(c.id, c.name)}>{busy === c.id ? 'One moment…' : `Use ${c.name}`}</button>
			{/each}
			<button class="cs-neo cs-ghost" disabled={!!busy} onclick={() => (fresh = true)}>A different company</button>
		</div>
	</section>
{:else}
	<section class="panel rv" style="--i:1;padding:22px"><BrandDetailsForm {submitLabel} /></section>
{/if}

<style>
	.cs {
		display: grid;
		gap: 14px;
		max-width: 760px;
		padding: 24px 26px;
		border-radius: 22px;
		background:
			radial-gradient(120% 120% at 0% 0%, color-mix(in oklab, var(--g1) 16%, transparent), transparent 55%),
			var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.cs-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.cs h2 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		line-height: 1.3;
	}
	.cs h2 em {
		font-family: var(--f-serif);
		font-style: italic;
		font-weight: 400;
		font-size: 1.2em;
	}
	.cs p {
		margin: 0;
		font-size: 14.5px;
		line-height: 1.5;
		color: var(--ink-2);
	}
	.cs-acts {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 4px;
	}
	.cs-neo {
		min-height: 50px;
		padding: 0 22px;
		border: 0;
		border-radius: 0;
		cursor: pointer;
		font: 700 12.5px/1 var(--f-body);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		transition: transform 0.12s, box-shadow 0.12s;
	}
	.cs-grad {
		background: var(--grad);
		color: #fff;
		box-shadow: 5px 5px 0 #6a4bc9;
	}
	.cs-ghost {
		background: transparent;
		color: var(--ink);
		box-shadow:
			inset 0 0 0 1.5px var(--ink-3),
			5px 5px 0 var(--line);
	}
	.cs-neo:hover:not(:disabled) {
		transform: translate(-2px, -2px);
	}
	.cs-neo:active:not(:disabled) {
		transform: translate(5px, 5px);
		box-shadow: none;
	}
	.cs-neo:disabled {
		opacity: 0.6;
		cursor: default;
	}
	@media (max-width: 560px) {
		.cs {
			padding: 20px 18px;
		}
		.cs-neo {
			width: 100%;
		}
	}
</style>
