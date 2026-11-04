<script lang="ts">
	import { ROOT_DOMAIN } from '#lib/creatorHost.ts';
	import { SLUG_RE, cleanSlug, slugIdeas } from '#lib/slug.ts';
	import { supabase } from '#lib/supabase.ts';

	// "Your link" on the sign-up form: name.miracleapp.live, checked as she types. `ok` is true once the link
	// can be hers: free, or the one she already holds (`mine`, from a request sent before).
	let {
		slug = $bindable(),
		ok = $bindable(false),
		mine = '',
		name = '',
		handle = ''
	}: { slug: string; ok?: boolean; mine?: string; name?: string; handle?: string } = $props();

	let free = $state<boolean | null>(null);
	const ideas = $derived(slugIdeas(name, handle).filter((x) => x !== slug));

	// Is it free? Checked a moment after typing stops.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let asked = '';
	$effect(() => {
		const s = slug;
		clearTimeout(timer);
		free = null;
		if (!SLUG_RE.test(s)) return;
		if (mine && s === mine) {
			free = true;
			return;
		}
		timer = setTimeout(async () => {
			asked = s;
			const { data, error } = await supabase.rpc('slug_free', { p_slug: s });
			if (asked === s) free = error ? null : !!data;
		}, 300);
	});
	const problem = $derived(
		!slug ? 'Pick the link brands will open.' : !SLUG_RE.test(slug) ? 'Use letters and numbers (a hyphen in the middle is fine), up to 30.' : free === false ? `${slug}.${ROOT_DOMAIN} is taken. Try another.` : ''
	);
	$effect(() => {
		ok = !problem && free === true;
	});
</script>

<div class="su-f su-full">
	<label for="cf-link">Your link <span class="su-hint">(the page brands open)</span></label>
	<div class="su-pre lf-box">
		<input
			class="su-in"
			id="cf-link"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			maxlength="30"
			placeholder="yourname"
			bind:value={slug}
			oninput={() => (slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
			onblur={() => (slug = cleanSlug(slug))}
		/>
		<span class="lf-dom">.{ROOT_DOMAIN}</span>
	</div>
	<small role="status" class:su-ok={ok} class:su-no={!!problem && !!slug}>
		{#if ok}✓ {slug}.{ROOT_DOMAIN} is yours once you send this{:else if problem && slug}{problem}{:else if SLUG_RE.test(slug)}Checking…{:else}Letters, numbers and hyphens. It goes live once you're approved.{/if}
	</small>
	{#if ideas.length}
		<div class="lf-ideas">
			<span class="su-hint">Ideas:</span>
			{#each ideas as i (i)}<button type="button" class="su-chip" onclick={() => (slug = i)}>{i}</button>{/each}
		</div>
	{/if}
</div>

<style>
	.lf-box .su-in {
		padding-left: 14px;
		padding-right: 2px;
		font-weight: 600;
	}
	.lf-dom {
		padding: 0 14px 0 0;
		color: var(--ink-2);
		font-size: 16px;
		white-space: nowrap;
	}
	.lf-ideas {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
</style>
