<script lang="ts">
	import { supabase } from '../supabase';
	import { errMessage } from '../util';
	import Icon from './Icon.svelte';

	// On her page, under the hero: her links for followers, and the box to join her email list.
	let { links = [], fanList = null, first }: { links?: { id: string; title: string; url: string }[]; fanList?: { pitch: string | null } | null; first: string } = $props();

	const host = (u: string) => {
		try {
			return new URL(u).hostname.replace(/^www\./, '');
		} catch {
			return '';
		}
	};
	// Counted, then the link opens as normal (the count never holds it up).
	const tap = (id: string) => void supabase.rpc('link_click', { p_id: id }).then(() => {});

	let email = $state('');
	let name = $state('');
	let busy = $state(false);
	let error = $state('');
	let joined = $state(false);
	async function join(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return (error = 'Enter a valid email, like name@gmail.com.');
		busy = true;
		const { error: err } = await supabase.rpc('fan_join', { p_email: email.trim(), p_name: name.trim() });
		busy = false;
		if (err) return (error = errMessage(err).replace(/^LIMIT:[^:]+:/, ''));
		joined = true;
	}
</script>

{#if links.length || fanList}
	<section class="pl-sec" aria-label="Links and updates from {first}">
		<div class="pl-wrap">
			{#if links.length}
				<span class="pl-eb">Find {first} elsewhere</span>
				<ul class="pl-links">
					{#each links as l (l.id)}
						<li>
							<a href={l.url} target="_blank" rel="noopener nofollow" onclick={() => tap(l.id)}>
								<b>{l.title}</b><small>{host(l.url)}</small><Icon name="arrow" />
							</a>
						</li>
					{/each}
				</ul>
			{/if}
			{#if fanList}
				<div class="pl-fan">
					{#if joined}
						<p class="pl-done"><Icon name="check" /><b>You're on {first}'s list.</b> Every email has a link to leave.</p>
					{:else}
						<div class="pl-fan-t">
							<b>Get {first}'s updates by email</b>
							<small>{fanList.pitch || `New videos, launches and offers from ${first}, now and then.`}</small>
						</div>
						<form class="pl-form" onsubmit={join} novalidate>
							<input class="pl-in" type="text" autocomplete="given-name" aria-label="Your first name" placeholder="First name" maxlength="60" bind:value={name} />
							<input class="pl-in" type="email" inputmode="email" autocomplete="email" aria-label="Your email" placeholder="you@gmail.com" maxlength="200" bind:value={email} />
							<button class="pl-go" disabled={busy}>{busy ? 'Joining…' : 'Join'}</button>
						</form>
						{#if error}<small class="pl-err" role="alert">{error}</small>{/if}
						<small class="pl-fine">Only {first} writes to this list, at most once a day. Leave any time from any email.</small>
					{/if}
				</div>
			{/if}
		</div>
	</section>
{/if}

<style>
	.pl-sec {
		padding-block: 72px 0;
	}
	.pl-wrap {
		width: min(720px, 100%);
		margin: 0 auto;
		padding-left: max(16px, env(safe-area-inset-left, 0px));
		padding-right: max(16px, env(safe-area-inset-right, 0px));
		display: grid;
		gap: 16px;
	}
	.pl-eb {
		font: 700 12px/1 var(--f-body, system-ui);
		letter-spacing: 0.3em;
		text-transform: uppercase;
		color: var(--ink-2);
	}
	.pl-links {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 10px;
	}
	.pl-links a {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto auto;
		column-gap: 12px;
		align-items: center;
		padding: 16px 18px;
		border-radius: 18px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		text-decoration: none;
		transition: transform 0.15s, box-shadow 0.2s;
	}
	.pl-links a:hover {
		transform: translateY(-2px);
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.pl-links b {
		font-size: 16.5px;
		overflow-wrap: anywhere;
	}
	.pl-links small {
		grid-row: 2;
		color: var(--ink-3);
		font-size: 13px;
	}
	.pl-links :global(.ic) {
		grid-row: 1 / span 2;
		grid-column: 2;
		width: 18px;
		height: 18px;
		color: var(--ink-3);
	}
	.pl-fan {
		display: grid;
		gap: 12px;
		padding: 20px;
		border-radius: 22px;
		background: radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, var(--g2) 18%, transparent), transparent 60%), var(--surface);
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.pl-fan-t {
		display: grid;
		gap: 4px;
	}
	.pl-fan-t b {
		font-size: 18px;
	}
	.pl-fan-t small,
	.pl-fine {
		color: var(--ink-3);
	}
	.pl-form {
		display: grid;
		grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr) auto;
		gap: 8px;
	}
	.pl-in {
		height: 48px;
		padding: 0 14px;
		border: 0;
		border-radius: 12px;
		background: var(--bg);
		box-shadow: inset 0 0 0 1px var(--line-strong);
		color: var(--ink);
		font: 500 16px var(--f-body, system-ui);
		min-width: 0;
	}
	.pl-in:focus {
		outline: 0;
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	.pl-go {
		height: 48px;
		padding: 0 22px;
		border: 0;
		border-radius: 12px;
		background: linear-gradient(115deg, var(--g1), var(--g2) 52%, var(--g3));
		color: #fff;
		font: 700 13px var(--f-body, system-ui);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.pl-go:disabled {
		opacity: 0.6;
	}
	.pl-err {
		color: var(--bad);
	}
	.pl-done {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		color: var(--ink-2);
	}
	.pl-done :global(.ic) {
		color: var(--ok);
	}
	@media (max-width: 560px) {
		.pl-form {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
