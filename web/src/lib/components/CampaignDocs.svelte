<script lang="ts">
	import type { BrandRequest } from '../types';
	import { supabase } from '../supabase';
	import { toast } from '../ui.svelte';
	import { fmt, inr } from '../util';
	import Icon from './Icon.svelte';
	import { auth } from '../auth.svelte';
	import { pub } from '../publicPage.svelte';

	// Every document for this campaign in one place: agreement, invoices, results report, files, brief.
	let { r }: { r: BrandRequest } = $props();
	const accepted = $derived(r.quotes?.find((q) => q.status === 'accepted'));
	const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b ? `${Math.max(1, Math.round(b / 1024))} KB` : '');

	async function openFile(f: NonNullable<BrandRequest['files']>[number]) {
		if (!f.file_path) return window.open(f.url, '_blank', 'noopener');
		const { data, error } = await supabase.storage.from('deliveries').createSignedUrl(f.file_path, 60 * 30, { download: f.label });
		if (error || !data) return toast("Couldn't open the file. Try again in a moment.", 'alert');
		location.href = data.signedUrl;
	}
	let sumBusy = $state(false);
	async function summary() {
		sumBusy = true;
		try {
			const { downloadSummary } = await import('../summaryPdf');
			const brand = auth.account?.role === 'brand' ? (auth.account.brand?.name ?? 'Brand') : 'Brand';
			await downloadSummary(r, brand, { name: pub.data?.display_name ?? 'Creator', handle: pub.data?.handle ?? '' });
		} catch (e) {
			toast(`Couldn't make the PDF: ${e}`, 'alert');
		}
		sumBusy = false;
	}
	const count = $derived((accepted ? 1 : 0) + (r.invoices?.length ?? 0) + (r.report_token ? 1 : 0) + (r.files?.length ?? 0));
</script>

{#if r.stage !== 'declined'}
	<section class="panel rv" style="--i:4;margin-top:18px">
		<div class="panel-h"><h2>Documents</h2><small>{count + 1} for this campaign</small></div>
		<button class="prod-row doc-btn" disabled={sumBusy} onclick={summary}><div><b>Collab summary</b><small>One page for your records: terms, dates, invoices, results · PDF</small></div>{#if sumBusy}<span class="spinner"></span>{:else}<Icon name="arrow" />{/if}</button>
		{#if accepted}
			<a class="prod-row" href="/agreement/{accepted.id}" style="text-decoration:none"><div><b>Agreement</b><small>Accepted {fmt(accepted.responded_at?.slice(0, 10))} · {inr(accepted.total)}</small></div><Icon name="check" /></a>
		{/if}
		{#each r.invoices ?? [] as inv (inv.token)}
			<a class="prod-row" href="/invoice/{inv.token}" style="text-decoration:none"><div><b>Invoice {inv.number}</b><small>{fmt(inv.issue_date)} · {inr(inv.payable)}</small></div><Icon name="wallet" /></a>
		{/each}
		{#if r.report_token}
			<a class="prod-row" href="/report/{r.report_token}" style="text-decoration:none"><div><b>Results report</b><small>Views, reach, cost per view · PDF</small></div><Icon name="chart" /></a>
		{/if}
		{#each r.files ?? [] as f (f.id)}
			<button class="prod-row doc-btn" onclick={() => openFile(f)}><div><b>{f.label}</b><small>{f.file_path ? `File · ${size(f.size)}` : 'Link'}</small></div><Icon name={f.file_path ? 'arrow' : 'link'} /></button>
		{/each}
	</section>
{/if}
