<script lang="ts">
	import { untrack } from 'svelte';
	import type { BriefTemplate } from '../briefTemplates';
	import { portal } from '../portal';
	import Icon from './Icon.svelte';

	// Brief templates in their own sheet (like the AI report): each one shows what it fills in, and
	// "Use this" applies it to the brief.
	let { templates, suggested, onpick, onclose }: { templates: BriefTemplate[]; suggested: BriefTemplate | null; onpick: (t: BriefTemplate) => void; onclose: () => void } = $props();
	// The suggested one starts open (only the first time; she opens others herself).
	let open = $state<string>(untrack(() => suggested?.id ?? templates[0]?.id ?? ''));
	const lines = (s?: string) => (s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="dialog-scrim" role="presentation" use:portal onclick={(e) => e.target === e.currentTarget && onclose()}>
	<div class="dialog ng tpl-sheet" role="dialog" aria-modal="true" aria-labelledby="tpl-title">
		<header class="ng-h">
			<div>
				<span class="eb">Brief</span>
				<h2 id="tpl-title">Start from a template</h2>
				<small>Pick one to fill the key message, do's, don'ts and hashtags. You can change anything after.</small>
			</div>
			<button class="icon-btn" onclick={onclose} aria-label="Close"><Icon name="x" /></button>
		</header>
		<div class="tpl-list">
			{#each templates as t (t.id)}
				<article class="tpl-card" class:open={open === t.id}>
					<button type="button" class="tpl-head" aria-expanded={open === t.id} onclick={() => (open = open === t.id ? '' : t.id)}>
						<span class="tpl-ic"><Icon name="doc" /></span>
						<span class="tpl-name"><b>{t.label}</b>{#if t === suggested}<small>Suggested for this brand</small>{:else if t.brief.message}<small>{t.brief.message}</small>{/if}</span>
						<Icon name="chevR" class="tpl-chev" />
					</button>
					{#if open === t.id}
						<div class="tpl-body">
							{#if t.brief.message}<p class="tpl-msg">“{t.brief.message}”</p>{/if}
							<div class="sc-cols">
								{#if t.brief.dos}<div class="sc-box"><h3>Do's</h3><ul>{#each lines(t.brief.dos) as l, i (i)}<li><Icon name="check" />{l}</li>{/each}</ul></div>{/if}
								{#if t.brief.donts}<div class="sc-box avoid"><h3>Don'ts</h3><ul>{#each lines(t.brief.donts) as l, i (i)}<li><Icon name="x" />{l}</li>{/each}</ul></div>{/if}
							</div>
							{#if t.brief.hashtags?.length}<p class="tpl-tags">{t.brief.hashtags.join(' ')}</p>{/if}
							<button type="button" class="btn grad tpl-use" onclick={() => (onpick(t), onclose())}><Icon name="check" />Use this template</button>
						</div>
					{/if}
				</article>
			{/each}
		</div>
	</div>
</div>
