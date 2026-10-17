// TDS certificates (Form 16A) she still needs from brands. A brand issues the certificate after
// filing its quarterly TDS return: by 15 August (April to June), 15 November (July to September),
// 15 February (October to December) and 15 June (January to March).
import type { Invoice } from './invoice';
import type { Collab } from './types';
import { certDueDate, todayIso } from './util';
export { certDueDate };


export type TdsItem = { inv: Invoice; c: Collab; due: string; overdue: boolean; askedRecently: boolean };

/** Paid invoices with TDS deducted whose certificate hasn't arrived, the overdue ones first. */
export function tdsToCollect(collabs: Collab[]): TdsItem[] {
	const today = todayIso();
	const recent = new Date(Date.now() - 14 * 864e5).toISOString();
	return collabs
		.flatMap((c) =>
			(c.invoices ?? [])
				.filter((i) => i.tds_deducted > 0 && !i.tds_certificate && i.status !== 'cancelled' && i.status !== 'draft')
				.map((inv) => {
					const due = certDueDate(inv.paid_on ?? inv.issue_date);
					return { inv, c, due, overdue: due <= today, askedRecently: !!inv.tds_requested_at && inv.tds_requested_at > recent };
				})
		)
		.sort((a, b) => a.due.localeCompare(b.due));
}
