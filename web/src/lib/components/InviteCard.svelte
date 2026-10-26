<script lang="ts">
	import { onMount } from 'svelte';
	import { inviteLink } from '../invite';
	import { supabase } from '../supabase';
	import { copyText } from '../ui.svelte';
	import { fmt, waShare } from '../util';
	import Icon from './Icon.svelte';

	// Invite and earn: her link, who joined with it, and the months of Pro it has earned her this year.
	type Person = { name: string; kind: 'creator' | 'brand'; at: string; rewarded_at: string | null; skipped: string };
	let data = $state<{ slug: string; cap: number; earned_year: number; people: Person[] } | null>(null);
	onMount(async () => {
		const { data: d } = await supabase.rpc('my_referrals');
		data = (d as typeof data) ?? null;
	});
	const link = $derived(data?.slug ? inviteLink('creator', 'invite', data.slug) : '');
	const text = $derived(`I run my brand deals on Miracle: quotes, invoices and payments in one place, and brands pay us directly. Get your own page free: ${link}`);
	const status = (p: Person) =>
		p.rewarded_at ? `Joined ${fmt(p.rewarded_at.slice(0, 10))} · you got a month` : p.skipped ? 'Joined · this year’s 6 months are already yours' : p.kind === 'creator' ? 'Waiting for Miracle to approve them' : 'Joined · the month comes with their first request';
</script>

{#if data?.slug}
	<section class="panel rv iv">
		<div class="panel-h"><h2>Invite and earn</h2><small>{data.earned_year} of {data.cap} months earned this year</small></div>
		<div class="iv-b">
			<p class="iv-lede">A free month of <b>Creator Pro</b> for every creator who joins with your link, and every brand that sends its first request from your page, invoices or quotes.</p>
			<div class="iv-link">
				<span class="iv-url">{link.replace(/^https?:\/\//, '').replace('?as=creator&', '?').replace(/&utm_source=invite$/, '')}</span>
				<button class="btn sm" onclick={() => copyText(link, 'Invite link copied')}><Icon name="copy" />Copy</button>
				<a class="btn sm grad" href={waShare('', text)} target="_blank" rel="noopener"><Icon name="send" />WhatsApp</a>
			</div>
			<div class="iv-meter" aria-hidden="true">{#each Array.from({ length: data.cap }, (_, i) => i) as i (i)}<i class:on={i < data.earned_year}></i>{/each}</div>
			{#if data.people.length}
				<ul class="iv-list">
					{#each data.people as p, i (i)}
						<li><span class="iv-av" class:brand={p.kind === 'brand'}><Icon name={p.kind === 'brand' ? 'box' : 'users'} /></span><span class="iv-who"><b>{p.name}</b><small>{status(p)}</small></span>{#if p.rewarded_at}<span class="iv-got"><Icon name="check" /></span>{/if}</li>
					{/each}
				</ul>
			{:else}
				<p class="hint iv-none">Brands you work with see your link on your page, invoices, quotes and tracking links. Share it with creator friends too.</p>
			{/if}
		</div>
	</section>
{/if}

<style>
	.iv { margin-bottom: 16px; }
	.iv-b { display: grid; gap: 14px; padding: 0 20px 18px; }
	.iv-lede { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
	.iv-link { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	.iv-url { flex: 1 1 220px; min-width: 0; padding: 10px 12px; border-radius: 10px; background: var(--surface-2); font: 500 13px/1.3 var(--f-mono); color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.iv-meter { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
	.iv-meter i { height: 6px; border-radius: 6px; background: var(--surface-2); }
	.iv-meter i.on { background: var(--grad); }
	.iv-list { display: grid; margin: 0; padding: 0; list-style: none; }
	.iv-list li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
	.iv-av { width: 32px; height: 32px; flex: none; border-radius: 50%; display: grid; place-items: center; background: color-mix(in oklab, var(--g1) 14%, var(--surface)); color: var(--g1); }
	.iv-av.brand { background: color-mix(in oklab, var(--g3) 16%, var(--surface)); color: var(--g3); }
	.iv-av :global(.ic) { width: 16px; height: 16px; }
	.iv-who { display: grid; flex: 1; min-width: 0; }
	.iv-who b { font-size: 14px; }
	.iv-who small { font-size: 12.5px; color: var(--ink-3); }
	.iv-got { color: var(--ok); }
	.iv-got :global(.ic) { width: 18px; height: 18px; }
	.iv-none { margin: 0; }
</style>
