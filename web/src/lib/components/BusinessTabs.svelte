<script lang="ts">
	import { page } from '$app/state';

	// The header of a Business page, as on the creator's pages: a small line, the title and what it's for.
	// The section's tabs sit in the app's own bar (top of the page on a laptop, under the bar on a phone).
	const PAGES: Record<string, { eb: string; label: string; note: string }> = {
		'/brand/business/money': { eb: 'Money', label: 'Payments', note: "Every creator's invoice, what you owe, and the GST you can claim back." },
		'/brand/business/shipping': { eb: 'Money', label: 'Shipping', note: 'Products on their way to creators.' },
		'/brand/business/content': { eb: 'Plan', label: 'Content', note: 'Posts creators made for you, and how long you may use them in ads.' },
		'/brand/business/calendar': { eb: 'Plan', label: 'Calendar', note: 'Every go-live, draft and shoot across your creators.' },
		'/brand/business/turnaround': { eb: 'Plan', label: 'Turnaround', note: 'Who is holding each handoff, how long is left, and whether your team is getting faster.' },
		'/brand/business/team': { eb: 'Your brand', label: 'Team', note: 'Who works on Miracle with you, and what needs an approver.' }
	};
	const cur = $derived(PAGES[page.url.pathname] ?? PAGES['/brand/business/money']);
</script>

<header class="ph rv">
	<div>
		<div class="eb">{cur.eb}</div>
		<h1>{cur.label}</h1>
		<p>{cur.note}</p>
	</div>
</header>
