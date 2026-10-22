<script lang="ts">
	import { page } from '$app/state';

	// The Business section's tabs (Company keeps its own page).
	const TABS = [
		{ href: '/brand/business/money', label: 'Money' },
		{ href: '/brand/business/content', label: 'Content' },
		{ href: '/brand/business/calendar', label: 'Calendar' },
		{ href: '/brand/business/shipping', label: 'Shipping' },
		{ href: '/brand/business/team', label: 'Team' },
		{ href: '/brand/details', label: 'Company' }
	];
	const path = $derived(page.url.pathname);
</script>

<header class="bz-h rv">
	<h1>Business</h1>
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
		gap: 14px;
		margin-bottom: 22px;
	}
	.bz-h h1 {
		margin: 0;
		font-size: clamp(34px, 4.4vw, 46px);
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.bz-tabs {
		display: flex;
		gap: 4px;
		padding: 4px;
		max-width: 100%;
		overflow-x: auto;
		scrollbar-width: none;
		border-radius: 14px;
		background: color-mix(in oklab, var(--ink) 5%, var(--bg));
		box-shadow: inset 0 0 0 1px var(--line-strong);
	}
	.bz-tabs::-webkit-scrollbar {
		display: none;
	}
	.bz-tabs a {
		flex: none;
		padding: 11px 16px;
		border-radius: 10px;
		color: var(--ink-2);
		font: 600 14px/1 var(--f-body);
		text-decoration: none;
	}
	.bz-tabs a[aria-current='page'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: inset 0 0 0 1.5px var(--g2);
	}
	@media (max-width: 560px) {
		.bz-h {
			margin-bottom: 14px;
		}
		.bz-tabs {
			margin: 0 -16px;
			padding: 4px 16px;
			border-radius: 0;
			background: none;
			box-shadow: none;
		}
		.bz-tabs a {
			border-radius: 99px;
			box-shadow: inset 0 0 0 1px var(--line-strong);
		}
	}
</style>
