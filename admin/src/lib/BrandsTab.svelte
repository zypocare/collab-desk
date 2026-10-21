<script lang="ts">
	import { onMount } from 'svelte';
	import { ago, inr, num, ROOT, siteOf } from './format.ts';
	import { errMessage, supabase } from './supabase.ts';
	import type { Brand } from './types.ts';
	import Icon from './Icon.svelte';

	// Every brand across all creators, newest activity first; the search matches the brand or the creator's name.
	let brands = $state<Brand[] | null>(null);
	let q = $state('');
	let err = $state('');
	let busy = $state(false);
	let asked = 0;

	async function load(search: string) {
		const n = ++asked;
		busy = true;
		const { data, error } = await supabase.rpc('admin_brands', { p_search: search.trim() || null });
		if (n !== asked) return;
		busy = false;
		err = error ? errMessage(error) : '';
		if (!error) brands = (data as Brand[]) ?? [];
	}
	onMount(() => {
		load('');
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(() => load(q), 300);
	}
	const igUrl = (v: string) => (/^https?:/.test(v) ? v : `https://instagram.com/${v.replace(/^@+/, '')}`);
	const igName = (v: string) => '@' + v.replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@+/, '').replace(/\/.*$/, '');
</script>

<div class="br-top">
	<label class="br-search">
		<Icon name="search" />
		<span class="sr">Search brands</span>
		<input type="search" placeholder="Search a brand or creator" bind:value={q} oninput={onInput} />
		{#if busy}<span class="spinner"></span>{/if}
	</label>
	{#if brands}<span class="br-n">{brands.length === 500 ? 'First 500' : `${num(brands.length)} brand${brands.length === 1 ? '' : 's'}`}</span>{/if}
</div>

{#if err}<p class="err">{err}</p>{/if}

{#if !brands}
	<div class="br-load"><span class="spinner"></span></div>
{:else if !brands.length}
	<p class="br-none">{q.trim() ? `No brand matches “${q.trim()}”.` : 'No brands yet.'}</p>
{:else}
	<div class="tbl-wrap">
		<table class="tbl">
			<thead><tr><th>Brand</th><th>Creator</th><th class="r">Collabs</th><th class="r">Paid</th><th class="r">Logins</th><th>Last collab</th></tr></thead>
			<tbody>
				{#each brands as b (b.id)}
					<tr>
						<td class="who">
							<b>{b.name}</b>
							<span>{[b.category, b.instagram ? null : b.website].filter(Boolean).join(' · ')}</span>
							{#if b.instagram}<a href={igUrl(b.instagram)} target="_blank" rel="noopener">{igName(b.instagram)}</a>{/if}
						</td>
						<td data-l="Creator"><a href={siteOf(b.creator.slug)} target="_blank" rel="noopener" title="{b.creator.slug}.{ROOT}">{b.creator.name || b.creator.slug}</a></td>
						<td class="r num" data-l="Collabs">{num(b.collabs)}</td>
						<td class="r num" data-l="Paid">{inr(b.paid)}</td>
						<td class="r num" data-l="Logins">{num(b.logins)}</td>
						<td data-l="Last collab">{b.last_collab ? ago(b.last_collab) : '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.br-top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
	.br-search { flex: 0 1 420px; display: flex; align-items: center; gap: 10px; height: 46px; padding: 0 14px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-3); }
	.br-search:focus-within { border-color: var(--accent); }
	.br-search input { flex: 1; min-width: 0; height: 100%; border: 0; background: none; outline: 0; color: var(--ink); }
	.br-search input::placeholder { color: var(--ink-3); }
	.br-n { font-size: 13.5px; color: var(--ink-3); }
	.br-load { min-height: 220px; display: grid; place-items: center; }
	.br-none { color: var(--ink-3); padding: 20px 0; }

	.tbl-wrap { border: 1px solid var(--line); background: var(--surface); overflow-x: auto; }
	.tbl { width: 100%; border-collapse: collapse; font-size: 14.5px; }
	.tbl th { padding: 13px 16px; text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--ink-3); border-bottom: 1px solid var(--line-strong); white-space: nowrap; }
	.tbl td { padding: 13px 16px; border-bottom: 1px solid var(--line); white-space: nowrap; }
	.tbl tbody tr:last-child td { border-bottom: 0; }
	.tbl tbody tr:hover td { background: color-mix(in oklab, var(--surface-2) 60%, transparent); }
	.tbl a { text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
	.r { text-align: right !important; }
	.who { display: grid; gap: 1px; white-space: normal !important; min-width: 200px; }
	.who b { font-size: 15px; }
	.who span, .who a { font-size: 13px; color: var(--ink-3); overflow-wrap: anywhere; }

	@media (max-width: 760px) {
		.br-search { flex-basis: 100%; }
		.tbl-wrap { border: 0; background: none; overflow: visible; }
		.tbl thead { display: none; }
		.tbl, .tbl tbody { display: grid; gap: 12px; }
		.tbl tr { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--line-strong); background: var(--surface); }
		.tbl tbody tr:hover td { background: none; }
		.tbl td { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 16px; white-space: normal; }
		.tbl td[data-l]::before { content: attr(data-l); font-size: 12.5px; color: var(--ink-3); }
		.tbl td.who { grid-column: 1 / -1; display: grid; padding: 16px; min-width: 0; }
		.tbl td[data-l='Creator'], .tbl td[data-l='Last collab'] { grid-column: 1 / -1; }
		.tbl tr td:last-child { border-bottom: 0; }
	}
</style>
