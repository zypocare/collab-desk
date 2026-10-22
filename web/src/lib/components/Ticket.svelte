<script lang="ts">
	import type { Snippet } from 'svelte';
	import { hueOf, initials } from '../util';

	// One item as a ticket (phone): the brand on a band in its colour, a torn line, then what to do
	// and how it stands, with its buttons. The same piece on Today, Payments, Pitches and the rest.
	let {
		name,
		title = name,
		sub = '',
		money = '',
		moneySub = '',
		task = '',
		status = '',
		tone = 'warn',
		href = '',
		onopen,
		i = 0,
		leaving = false,
		hue = '',
		mark = '',
		chips = [],
		children
	}: {
		/** The brand: picks the colour and the initials. */
		name: string;
		title?: string;
		sub?: string;
		money?: string;
		moneySub?: string;
		task?: string;
		status?: string;
		tone?: 'hot' | 'warn' | 'ok' | 'calm';
		href?: string;
		onopen?: () => void;
		i?: number;
		leaving?: boolean;
		/** The band's colour when it shouldn't come from the name (a CSS colour, e.g. a stage's). */
		hue?: string;
		/** What the tile shows instead of the initials. */
		mark?: string;
		/** Small badges under the task (a creator's record, a brand's payments). */
		chips?: { text: string; tone: 'ok' | 'warn' | 'bad' | 'info' }[];
		children?: Snippet;
	} = $props();
</script>

{#snippet band()}
	<span class="tk-tile">{mark || initials(name)}</span>
	<span class="tk-who"><b>{title}</b>{#if sub}<small>{sub}</small>{/if}</span>
	{#if money}<span class="tk-money"><b>{money}</b>{#if moneySub}<small>{moneySub}</small>{/if}</span>{/if}
{/snippet}

<article class="tk" class:leaving style="--h:{hue || `var(--m${hueOf(name)})`};--i:{Math.min(i, 8)}">
	{#if href}<a class="tk-band" {href}>{@render band()}</a>{:else}<button type="button" class="tk-band" onclick={onopen}>{@render band()}</button>{/if}
	<div class="tk-cut" aria-hidden="true"></div>
	<div class="tk-foot">
		<span class="tk-task">
			{#if task}<b>{task}</b>{/if}
			{#if status}<small class={tone}><i></i>{status}</small>{/if}
			{#if chips.length}<span class="tk-chips">{#each chips as ch (ch.text)}<em class={ch.tone}>{ch.text}</em>{/each}</span>{/if}
		</span>
		{@render children?.()}
	</div>
</article>
