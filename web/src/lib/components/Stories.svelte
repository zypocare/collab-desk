<script lang="ts">
	import { studio } from '../studio.svelte';
	import { ui } from '../ui.svelte';
	import { tasks } from '../util';
	import Avatar from './Avatar.svelte';
	import Mono from './Mono.svelte';

	// Top of Today on a phone: a row of circles like stories. Collabs that need her come first
	// with a coloured ring; the rest of the active ones follow with a quiet ring.
	const need = $derived([...new Map(tasks(studio.collabs).map((t) => [t.c.id, t])).values()]);
	const rest = $derived(studio.collabs.filter((c) => !need.some((t) => t.c.id === c.id) && !['wrapped', 'declined'].includes(c.stage)));
	const first = (n: string) => (n.length > 11 ? n.split(' ')[0].slice(0, 11) : n);
</script>

<div class="stories" aria-label="Collabs that need you">
	<button class="story st-me" onclick={() => (ui.newCollab = true)}>
		<span class="st-ring plain"><Avatar name={studio.settings?.display_name ?? ''} src={studio.ig?.connected ? studio.ig.profile_picture_url : ''} size="62px" /><i class="st-plus">+</i></span>
		<span class="st-l">New collab</span>
	</button>
	{#each need as t (t.c.id)}
		<a class="story" href={t.kind === 'msg' ? `/studio/inbox/${t.c.code}` : `/studio/c/${t.c.code}`} title={t.title}>
			<span class="st-ring"><Mono name={t.c.brand.name} size="lg" /></span>
			<span class="st-l">{first(t.c.brand.name)}</span>
		</a>
	{/each}
	{#each rest as c (c.id)}
		<a class="story seen" href="/studio/c/{c.code}">
			<span class="st-ring"><Mono name={c.brand.name} size="lg" /></span>
			<span class="st-l">{first(c.brand.name)}</span>
		</a>
	{/each}
</div>
