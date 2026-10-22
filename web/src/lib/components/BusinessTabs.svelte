<script lang="ts">
	import { page } from '$app/state';

	// The Business section's header: the open tab's name as the title, the tabs on the right as the
	// studio's boxed strip (company details live in Settings now).
	const TABS = [
		{ href: '/brand/business/money', label: 'Money', note: 'Every creator\'s invoice, what you owe, and the GST you can claim back.' },
		{ href: '/brand/business/content', label: 'Content', note: 'Posts creators made for you, and how long you may use them in ads.' },
		{ href: '/brand/business/calendar', label: 'Calendar', note: 'Every go-live, draft and shoot across your creators.' },
		{ href: '/brand/business/shipping', label: 'Shipping', note: 'Products on their way to creators.' },
		{ href: '/brand/business/team', label: 'Team', note: 'Who works on Miracle with you, and what needs an approver.' }
	];
	const path = $derived(page.url.pathname);
	const cur = $derived(TABS.find((t) => t.href === path) ?? TABS[0]);
</script>

<header class="bz-h rv">
	<div class="bz-t">
		<span class="bz-eb">Business</span>
		<h1>{cur.label}</h1>
		<p>{cur.note}</p>
	</div>
	<nav class="bz-tabs" aria-label="Business">
		{#each TABS as t (t.href)}<a href={t.href} aria-current={path === t.href ? 'page' : undefined}>{t.label}</a>{/each}
	</nav>
</header>

<style>
	.bz-h {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px 24px;
		margin-bottom: 26px;
	}
	.bz-t {
		display: grid;
		gap: 6px;
	}
	.bz-eb {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.17em;
		text-transform: uppercase;
		color: var(--ink-3);
	}
	.bz-h h1 {
		margin: 0;
		font-family: var(--f-serif, Georgia, serif);
		font-weight: 400;
		font-size: clamp(38px, 4.4vw, 52px);
		line-height: 1.02;
		letter-spacing: -0.01em;
	}
	.bz-h p {
		margin: 0;
		font-size: 14.5px;
		color: var(--ink-3);
	}
	/* The studio's boxed tab strip: square, ink fill and a pink edge on the open one. */
	.bz-tabs {
		display: flex;
		max-width: 100%;
		overflow-x: auto;
		scrollbar-width: none;
		border: 1px solid var(--line-strong);
	}
	.bz-tabs::-webkit-scrollbar {
		display: none;
	}
	.bz-tabs a {
		flex: none;
		display: grid;
		place-items: center;
		height: 42px;
		padding: 0 16px;
		color: var(--ink-2);
		font: 700 11px/1 var(--f-body);
		letter-spacing: 0.13em;
		text-transform: uppercase;
		text-decoration: none;
	}
	.bz-tabs a + a {
		border-left: 1px solid var(--line);
	}
	.bz-tabs a[aria-current='page'] {
		position: relative;
		z-index: 1;
		background: var(--ink);
		color: var(--bg);
		box-shadow: 3px 3px 0 var(--g2);
	}
</style>
