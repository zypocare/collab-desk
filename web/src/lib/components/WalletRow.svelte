<script lang="ts">
	import Icon from './Icon.svelte';
	import { hueOf } from '../util';
	let { name, colorKey = name, stage, href, money, status, meta, icon, next, tag, attention, i }: {
		name: string; colorKey?: string; stage: string; href: string; money: string; status: string;
		meta: string; icon: string; next: string; tag: string; attention: boolean; i: number;
	} = $props();
</script>

<a class="wc st-{stage}" {href} style="--h:var(--m{hueOf(colorKey)});--i:{Math.min(i, 8)}">
	<span class="wc-top">
		<span class="wc-bn">{name}</span>
		<span class="wc-money">{#if attention}<i></i>{/if}{money}<small>{status}</small></span>
	</span>
	<span class="wc-meta">{meta}</span>
	<span class="wc-foot">
		<span class="wc-next"><Icon name={icon} /><span>{next}</span></span>
		{#if tag}<span class="wc-tag">{tag.toUpperCase()}</span>{/if}
	</span>
</a>
