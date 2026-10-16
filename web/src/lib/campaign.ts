// A brand's campaign at a glance: dated milestones (who acts next), and a calendar file of them.
import type { BrandRequest } from './types';

export type Milestone = { key: string; date: string | null; title: string; who: 'you' | 'creator' | 'done'; note?: string };

const addDays = (iso: string, n: number) => {
	const d = new Date(iso.slice(0, 10) + 'T00:00:00');
	d.setDate(d.getDate() + n);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function milestones(r: BrandRequest, creator: string): Milestone[] {
	const out: Milestone[] = [];
	const accepted = r.quotes?.find((q) => q.status === 'accepted');
	const open = r.quotes?.find((q) => q.status === 'sent');
	const pending = r.drafts?.find((d) => d.status === 'pending');
	const approved = r.drafts?.find((d) => d.status === 'approved');
	const product = r.type !== 'paid';
	const confirmed = ['confirmed', 'creating', 'live', 'wrapped'].includes(r.stage);
	const live = ['live', 'wrapped'].includes(r.stage);

	out.push({ key: 'sent', date: r.received_on, title: 'Request sent', who: 'done' });
	if (accepted) out.push({ key: 'agreed', date: accepted.responded_at?.slice(0, 10) ?? null, title: 'Quote accepted', who: 'done' });
	else if (open) out.push({ key: 'agreed', date: null, title: 'Accept the quote', who: 'you', note: 'Waiting for your answer' });
	else if (!confirmed && r.stage !== 'declined') out.push({ key: 'agreed', date: null, title: `${creator} sends a quote`, who: 'creator' });

	if (product && confirmed) {
		if (r.product_received_at) out.push({ key: 'product', date: r.product_received_at.slice(0, 10), title: 'Product received', who: 'done' });
		else if (r.shipped_at) out.push({ key: 'product', date: r.product_date, title: 'Product on the way', who: 'creator', note: `Shipped ${r.shipped_at.slice(0, 10)}` });
		else out.push({ key: 'product', date: r.product_date, title: 'Ship the product', who: 'you', note: r.product_date ? undefined : 'Add tracking on this page when it goes out' });
	}

	if (confirmed) {
		if (approved) out.push({ key: 'draft', date: approved.responded_at?.slice(0, 10) ?? null, title: `Draft ${approved.round} approved`, who: 'done' });
		else if (pending) out.push({ key: 'draft', date: pending.submitted_at.slice(0, 10), title: `Review draft ${pending.round}`, who: 'you', note: 'Waiting for your approval' });
		else if (!live) out.push({ key: 'draft', date: r.draft_date, title: 'Draft for your review', who: 'creator' });
	}

	if (confirmed || r.live_date) {
		out.push({
			key: 'live',
			date: r.live_date,
			title: live ? 'Went live' : 'Goes live',
			who: live ? 'done' : 'creator',
			note: !live && r.live_time ? `at ${r.live_time.slice(0, 5)}` : undefined
		});
	}

	if (live || r.live_date) {
		out.push({
			key: 'report',
			date: r.report_token ? null : r.live_date ? addDays(r.live_date, 7) : null,
			title: r.report_token ? 'Results report ready' : 'Results report',
			who: r.report_token ? 'done' : 'creator'
		});
	}

	if (r.type !== 'barter' && (r.invoices?.length || r.pay_due)) {
		const unpaid = r.invoices?.some((i) => (i.status === 'sent' || i.status === 'partly_paid') && !i.claimed);
		const reported = r.invoices?.some((i) => (i.status === 'sent' || i.status === 'partly_paid') && i.claimed);
		out.push({
			key: 'pay',
			date: r.pay_status === 'paid' ? r.paid_on : r.pay_due,
			title: r.pay_status === 'paid' ? 'Paid' : reported && !unpaid ? 'Payment reported' : 'Payment due',
			who: r.pay_status === 'paid' ? 'done' : unpaid ? 'you' : 'creator',
			note: reported && !unpaid ? 'waiting for confirmation' : undefined
		});
	}

	if (r.usage_ends) out.push({ key: 'usage', date: r.usage_ends, title: 'Paid usage rights end', who: 'creator' });
	return out;
}

const icsEsc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (d: string) => d.slice(0, 10).replaceAll('-', '');

/** Every dated milestone still ahead, as an .ics file (opens in Google, Apple or Outlook calendar). */
export function downloadIcs(r: BrandRequest, creator: string, url: string) {
	const items = milestones(r, creator).filter((m) => m.date && m.who !== 'done');
	const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
	const ev = items.map((m) =>
		[
			'BEGIN:VEVENT',
			`UID:${r.code}-${m.key}@collab-desk`,
			`DTSTAMP:${stamp}`,
			`DTSTART;VALUE=DATE:${ymd(m.date!)}`,
			`DTEND;VALUE=DATE:${ymd(addDays(m.date!, 1))}`,
			`SUMMARY:${icsEsc(`${m.title} · ${creator} (${r.code})`)}`,
			`DESCRIPTION:${icsEsc(`${m.who === 'you' ? 'Your action. ' : ''}${url}`)}`,
			`URL:${url}`,
			'END:VEVENT'
		].join('\r\n')
	);
	const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Collab Desk//EN', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
	const a = document.createElement('a');
	a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
	a.download = `${r.code}.ics`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 4000);
	return items.length;
}
