import { studio } from './studio.svelte';
import { supabase } from './supabase';
import type { FinancialSummary } from './reports';
import { errMessage } from './util';

/** Each report instance follows its selected year and discards stale responses. */
export function useFinancialReport(year: () => number) {
	const result = $state<{ summary: FinancialSummary | null; pending: boolean; error: string }>({ summary: null, pending: true, error: '' });
	$effect(() => {
		const start = year();
		void studio.revision;
		let cancelled = false;
		result.pending = true;
		result.summary = null;
		result.error = '';
		supabase.rpc('financial_report', { p_start: start }).then(({ data, error }) => {
			if (cancelled) return;
			result.pending = false;
			if (error) result.error = `Showing the last complete studio snapshot. Live totals could not be refreshed: ${errMessage(error)}`;
			else result.summary = data as FinancialSummary;
		});
		return () => { cancelled = true; };
	});
	return result;
}
