<script lang="ts">
	import { goto } from '$app/navigation';
	import { money } from '#lib/currency.ts';
	import { page } from '$app/state';
	import { auth, homeFor } from '#lib/auth.svelte.ts';
	import { supabase } from '#lib/supabase.ts';
	import type { Agreement } from '#lib/types.ts';
	import { fmtLong, fmtTime, inr, payTerms, plural, usageLabel } from '#lib/util.ts';
	import Icon from '#lib/components/Icon.svelte';

	let a = $state<Agreement | null>(null);
	let loaded = $state(false);

	$effect(() => {
		if (!auth.session) {
			goto(`/login?next=${encodeURIComponent(page.url.pathname)}`, { replace: true });
			return;
		}
		supabase.rpc('get_agreement', { p_quote: page.params.id }).then(({ data }) => {
			a = (data as Agreement | null) ?? null;
			loaded = true;
		});
	});

	const q = $derived(a?.quote);
	const isAgreement = $derived(q?.status === 'accepted');
	let pdfBusy = $state(false);
	async function pdf() {
		if (!a) return;
		pdfBusy = true;
		const { downloadAgreement } = await import('#lib/agreementPdf.ts');
		await downloadAgreement(a).catch((e) => console.error(e));
		pdfBusy = false;
	}
	let fp = $state('');
	$effect(() => {
		if (a?.quote.status === 'accepted') import('#lib/agreementPdf.ts').then((m) => m.fingerprint(a!)).then((f) => (fp = f));
	});
	const back = $derived(auth.account?.role === 'creator' ? '/studio/collabs' : a ? `/brand/r/${a.code}` : homeFor(auth.account));
</script>

<svelte:head><title>{isAgreement ? 'Agreement' : 'Quote'} {a?.code ?? ''}</title></svelte:head>

<div class="page">
	<div class="wrap doc-wrap">
		<div class="doc-tools no-print">
			<a class="back" href={back}><Icon name="back" />Back</a>
			{#if a}
				<span class="doc-acts">
					<button class="btn" onclick={() => print()}><Icon name="copy" />Print</button>
					<button class="btn primary" disabled={pdfBusy} onclick={pdf}>{#if pdfBusy}<span class="spinner"></span>{:else}<Icon name="download" />{/if}{isAgreement ? 'Download signed PDF' : 'Download PDF'}</button>
				</span>
			{/if}
		</div>

		{#if !loaded}
			<div class="loader" style="min-height:40vh"><span class="ring"><span></span></span></div>
		{:else if !a || !q}
			<div class="empty-card"><h2>Not available</h2><p>This agreement doesn't exist or belongs to another account.</p></div>
		{:else}
			<article class="doc">
				<header class="doc-h">
					<div>
						<div class="eb">{isAgreement ? 'Collaboration agreement' : 'Quote'} · {a.code} · version {q.version}</div>
						<h1>{a.creator.name} <em>×</em> {a.brand.name}</h1>
					</div>
					{#if isAgreement}<span class="pill tint k-pay"><Icon name="check" />Accepted</span>{:else}<span class="pill tint k-new">Not yet accepted</span>{/if}
				</header>

				<section class="doc-parties">
					<div><span class="lbl">Creator</span><b>{a.creator.name}</b><small>@{a.creator.handle}{a.creator.city ? ` · ${a.creator.city}` : ''}</small></div>
					<div>
						<span class="lbl">Brand</span><b>{a.brand.name}</b>
						<small>{a.brand.instagram ? `@${a.brand.instagram}` : ''}{a.brand.website ? ` · ${a.brand.website}` : ''}</small>
						<small>Contact: {a.contact.name} · {a.contact.email}</small>
					</div>
				</section>

				<h2>1. Deliverables and fee</h2>
				<table class="doc-table">
					<thead><tr><th>Deliverable</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
					<tbody>
						{#each q.items as it, i (i)}
							<tr><td>{plural(it.kind, it.qty)}</td><td>{it.qty}</td><td>{money(it.rate, q.currency)}</td><td>{money(it.qty * it.rate, q.currency)}</td></tr>
						{/each}
						{#if Number(q.usage_fee)}<tr><td colspan="3">Usage rights: {usageLabel(q.usage)}</td><td>{money(q.usage_fee, q.currency)}</td></tr>{/if}
						{#if Number(q.discount)}<tr><td colspan="3">Discount</td><td>− {money(q.discount, q.currency)}</td></tr>{/if}
					</tbody>
					<tfoot><tr><td colspan="3">Total fee (taxes extra if applicable)</td><td>{money(q.total, q.currency)}</td></tr></tfoot>
				</table>
				{#if a.type !== 'paid' && a.product}<p>Products supplied by the brand: {a.product}{a.product_value ? ` (value ${inr(a.product_value)})` : ''}.</p>{/if}

				<h2>2. Terms</h2>
				<ul class="doc-terms">
					<li><b>Usage rights:</b> {usageLabel(q.usage)}. The brand may repost the content with credit to @{a.creator.handle}{q.usage !== 'Organic only' ? ' and run it as ads from its own ad account for the period stated; the creator does not run ads' : ''}.</li>
					<li><b>Payment:</b> {payTerms(q)}. Invoices are issued by the creator.</li>
					<li><b>Revisions:</b> {q.revision_rounds} round{q.revision_rounds === 1 ? '' : 's'} of changes included. Extra rounds may be charged.</li>
					{#if q.exclusivity_days}<li><b>Exclusivity:</b> the creator won't post for a direct competitor for {q.exclusivity_days} days after going live.</li>{/if}
					<li><b>Go-live:</b> {a.live_date ? fmtLong(a.live_date) : a.preferred_live ? `around ${fmtLong(a.preferred_live)}, to be confirmed` : 'to be agreed'}.</li>
					<li><b>Disclosure:</b> posts are marked as a paid partnership or with #ad, as Indian advertising rules (ASCI) require.</li>
					<li><b>Approval:</b> the brand reviews drafts before posting. Content stays the creator's own work; the brand gets the usage rights above.</li>
				</ul>
				{#if q.notes}<h2>3. Notes</h2><p style="white-space:pre-wrap">{q.notes}</p>{/if}

				<footer class="doc-sign">
					{#if isAgreement}
						<p><b>Accepted online</b> by {q.accepted_name} ({q.accepted_email}) on {q.responded_at ? fmtTime(q.responded_at) : ''} IST{a.accepted_ip ? ` from ${a.accepted_ip}` : ''}.</p>
						{#if q.response_note}<p>Note: {q.response_note}</p>{/if}
					{:else}
						<p>This quote{q.valid_until ? ` is valid until ${fmtLong(q.valid_until)} and` : ''} becomes the agreement when the brand accepts it online.</p>
					{/if}
					<p class="hint">Prepared with {a.creator.app_name} · {q.sent_at ? `sent ${fmtTime(q.sent_at)}` : ''}</p>
					{#if fp}<p class="hint">Document fingerprint (SHA-256): <span class="id">{fp}</span></p>{/if}
				</footer>
			</article>
		{/if}
	</div>
</div>
