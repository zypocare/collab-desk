<script lang="ts">
	import { untrack } from 'svelte';
	import { addressFor, ROOT_DOMAIN } from '#lib/creatorHost.ts';
	import { supabase } from '#lib/supabase.ts';
	import { errMessage, firstName } from '#lib/util.ts';

	// Approved: the creator picks name.miracleapp.live (once), then goes to the studio there.
	let { name = '', handle = '' }: { name?: string; handle?: string } = $props();

	const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,28}[a-z0-9])?$/;
	const clean = (v: string) => v.toLowerCase().replace(/[._\s]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
	const ideas = $derived(
		[...new Set([clean(handle), clean(firstName(name)), clean(name), clean(handle).replace(/-/g, '')])].filter((x) => SLUG_RE.test(x) && !x.startsWith('new-')).slice(0, 3)
	);

	// The name she typed on the website's "Claim your link", kept since sign-up.
	const wanted = (() => {
		try {
			return localStorage.getItem('mc-wanted-link') ?? '';
		} catch {
			return '';
		}
	})();
	let slug = $state(untrack(() => clean(wanted) || clean(handle) || clean(firstName(name))));
	let free = $state<boolean | null>(null);
	let busy = $state(false);
	let error = $state('');

	// Is it free? Checked a moment after typing stops.
	let timer: ReturnType<typeof setTimeout> | undefined;
	let asked = '';
	$effect(() => {
		const s = slug;
		clearTimeout(timer);
		free = null;
		if (!SLUG_RE.test(s)) return;
		timer = setTimeout(async () => {
			asked = s;
			const { data, error: err } = await supabase.rpc('slug_free', { p_slug: s });
			if (asked === s) free = err ? null : !!data;
		}, 300);
	});
	const problem = $derived(!slug ? 'Type the link you want.' : !SLUG_RE.test(slug) ? 'Use letters and numbers (a hyphen in the middle is fine), up to 30.' : free === false ? `${slug}.${ROOT_DOMAIN} is taken or can't be used.` : '');

	async function take(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (problem) return (error = problem);
		if (free !== true) return (error = 'One moment, checking the name…');
		busy = true;
		const { data, error: err } = await supabase.rpc('choose_my_link', { p_slug: slug });
		if (err) {
			busy = false;
			return (error = errMessage(err));
		}
		// The studio lives on the new address (the sign-in is shared across miracleapp.live).
		location.href = addressFor((data as { slug: string }).slug, '/studio');
	}
</script>

<form class="su-plain cl" onsubmit={take} novalidate>
	<span class="cl-badge">Approved</span>
	<h1 class="su-h1 su-big">You're in{name ? `, ${firstName(name)}` : ''}. <span class="su-grad" style="display:block;font-family:var(--f-serif);font-style:italic;font-weight:400">Pick your link.</span></h1>
	<p class="su-lead">This is the page brands open to see your work and send you requests. Put it in your Instagram bio.</p>
	<label for="cl-slug" class="sr-only">Your link</label>
	<div class="cl-box">
		<input id="cl-slug" class="cl-in" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="30" bind:value={slug} oninput={() => (slug = slug.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
		<span class="cl-dom">.{ROOT_DOMAIN}</span>
		<button class="su-neo su-go cl-go" disabled={busy}>{busy ? 'One moment…' : 'Take it'}</button>
	</div>
	<span role="status" class="cl-st" class:ok={!problem && free === true} class:no={!!problem && !!slug}>
		{#if !problem && free === true}✓ {slug}.{ROOT_DOMAIN} is free{:else if problem && slug}{problem}{:else if SLUG_RE.test(slug)}Checking…{/if}
	</span>
	{#if ideas.length}
		<div class="cl-ideas">
			<span class="su-hint">Ideas from your Instagram:</span>
			{#each ideas as i (i)}<button type="button" class="su-chip" onclick={() => (slug = i)}>{i}</button>{/each}
		</div>
	{/if}
	{#if error}<p class="su-err" role="alert">{error}</p>{/if}
	<span class="su-hint">Letters, numbers and hyphens. Next: connect Instagram and add your rates, about five minutes.</span>
</form>

<style>
	.cl {
		justify-items: center;
		text-align: center;
		width: min(760px, 100%);
	}
	.cl-badge {
		padding: 8px 16px;
		border-radius: 99px;
		background: color-mix(in oklab, var(--ok) 16%, transparent);
		color: var(--ok);
		font: 700 13px/1 var(--f-body);
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.cl .su-lead {
		max-width: 560px;
	}
	.cl-box {
		width: 100%;
		display: flex;
		align-items: center;
		padding: 8px;
		border-radius: 6px;
		background: var(--surface);
		box-shadow: inset 0 0 0 2px var(--g2), 0 30px 80px -30px color-mix(in oklab, var(--g2) 60%, transparent);
	}
	.cl-in {
		flex: 1;
		min-width: 0;
		height: 58px;
		padding: 0 0 0 14px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: 600 24px var(--f-body);
		outline: 0;
	}
	.cl-dom {
		padding: 0 14px 0 2px;
		font: 500 21px var(--f-body);
		color: var(--ink-2);
		white-space: nowrap;
	}
	.cl-go {
		min-height: 58px;
		width: auto;
	}
	.cl-st {
		min-height: 1.5em;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink-3);
	}
	.cl-st.ok {
		color: var(--ok);
	}
	.cl-st.no {
		color: var(--bad);
	}
	.cl-ideas {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 8px;
	}
	@media (max-width: 640px) {
		.cl-box {
			flex-wrap: wrap;
		}
		.cl-in {
			font-size: 20px;
		}
		.cl-dom {
			font-size: 17px;
		}
		.cl-go {
			flex-basis: 100%;
			width: 100%;
		}
	}
</style>
