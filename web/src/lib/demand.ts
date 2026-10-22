// Getting paid, step by step: the formal payment demand (step 3), and the MSME complaint or legal notice
// (step 4), as plain letters she reviews and as PDFs. The friendly and firm reminders (steps 1 and 2) are
// sent by the payment-reminders job.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import { saveBlob } from './download';
import { balanceDue, type Invoice } from './invoice';
import { loadFonts, wrap } from './invoicePdf';
import { supabase } from './supabase';
import type { Collab, Settings } from './types';
import { errMessage, fmtLong, inr, iso, parse, todayIso } from './util';

export const addDays = (day: string, n: number) => {
	const d = parse(day);
	d.setDate(d.getDate() + n);
	return iso(d);
};
export const daysLate = (inv: Invoice) => (inv.due_date ? Math.max(0, Math.round((parse(todayIso()).getTime() - parse(inv.due_date).getTime()) / 86400000)) : 0);
/** Under the MSMED Act a buyer must pay a registered micro or small enterprise within 45 days. */
export const msmeFrom = (inv: Invoice) => addDays(inv.issue_date, 45);

type Who = { c: Collab; inv: Invoice; s: Settings; final: string };
const me = (s: Settings) => s.legal_name || s.display_name;

export function demandLetter({ c, inv, s, final }: Who) {
	const due = balanceDue(inv);
	const late = daysLate(inv);
	const accepted = c.quotes.find((q) => q.status === 'accepted');
	return [
		`Dear ${c.contact_name || c.brand.name} and the accounts team at ${c.brand.name},`,
		`This is a formal demand for payment of invoice ${inv.number}, for ${inr(due)}, issued on ${fmtLong(inv.issue_date)} for collaboration ${c.code}${inv.due_date ? ` and due on ${fmtLong(inv.due_date)}` : ''}. It is now ${late} day${late === 1 ? '' : 's'} overdue, and two reminders have gone unanswered or unpaid.`,
		accepted
			? `The work was delivered as agreed in the collaboration agreement accepted by ${accepted.accepted_name || 'your team'}${accepted.responded_at ? ` on ${fmtLong(accepted.responded_at.slice(0, 10))}` : ''}.`
			: 'The work was delivered as agreed.',
		`Please pay the full amount by ${fmtLong(final)}. You can pay by UPI or bank transfer from the invoice page linked below.`,
		s.udyam_no
			? `I am registered as a micro enterprise (Udyam ${s.udyam_no}). Under sections 15 and 16 of the MSMED Act, 2006, payment was due within 45 days, and compound interest at three times the bank rate notified by the RBI applies after that. If the payment hasn't arrived by ${fmtLong(final)}, I will file a complaint with the MSME Facilitation Council (MSME Samadhaan).`
			: `If the payment hasn't arrived by ${fmtLong(final)}, I will take further steps to recover the amount, including a legal notice, without further reminder.`,
		'If the payment is already on its way, please share the transaction reference so I can match it.',
		`Regards,\n${me(s)}${s.handle ? ` (@${s.handle.replace(/^@+/, '')})` : ''}${s.pan ? `\nPAN ${s.pan}` : ''}${s.gstin ? ` · GSTIN ${s.gstin}` : ''}`
	].join('\n\n');
}

export function legalNotice({ c, inv, s }: Who) {
	const due = balanceDue(inv);
	return [
		'LEGAL NOTICE FOR RECOVERY OF DUES',
		`To: ${c.brand.name}${c.brand.billing_address ? `, ${c.brand.billing_address}` : ''}${c.brand.gstin ? ` (GSTIN ${c.brand.gstin})` : ''}`,
		`From: ${me(s)}${s.address ? `, ${s.address}` : ''}`,
		`1. You engaged me for an influencer marketing collaboration (${c.code}). I delivered the agreed content, which went live${c.live_date ? ` on ${fmtLong(c.live_date)}` : ''}.`,
		`2. I raised invoice ${inv.number} dated ${fmtLong(inv.issue_date)} for ${inr(inv.total)}${inv.due_date ? `, due on ${fmtLong(inv.due_date)}` : ''}. ${inr(due)} remains unpaid despite reminders and a formal payment demand.`,
		`3. You are called upon to pay ${inr(due)} within 15 days of receiving this notice, failing which I will be constrained to initiate appropriate legal proceedings for recovery, with interest and costs, at your risk as to cost and consequences.`,
		`Date: ${fmtLong(todayIso())}`,
		`${me(s)}`,
		'(A template. For a notice on a lawyer\'s letterhead, share this with your lawyer.)'
	].join('\n\n');
}

/** The answers the MSME Samadhaan form asks for, ready to copy in. */
export function samadhaanFields({ c, inv, s }: Who) {
	return [
		['Your Udyam registration number', s.udyam_no || ''],
		['Buyer (the brand)', c.brand.name],
		['Buyer GSTIN', c.brand.gstin || ''],
		['Buyer address', c.brand.billing_address || ''],
		['Buyer email', inv.send_to || c.brand.accounts_email || c.contact_email || ''],
		['Buyer phone', c.contact_phone || ''],
		['Invoice number', inv.number ?? ''],
		['Invoice date', inv.issue_date],
		['Invoice amount', String(inv.total)],
		['Amount still due', String(balanceDue(inv))],
		['Service', `Influencer marketing content (${c.code})`],
		['Date the service was accepted', c.live_date || inv.issue_date]
	] as [string, string][];
}

/** A letter as a simple A4 PDF. */
export async function letterPdf(title: string, body: string, file: string) {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const [regBytes, boldBytes] = await loadFonts();
	const reg = await doc.embedFont(regBytes);
	const bold = await doc.embedFont(boldBytes);
	doc.setTitle(title);
	const W = 595.28, H = 841.89, M = 56;
	const ink = rgb(0.12, 0.09, 0.11);
	let page = doc.addPage([W, H]);
	let y = H - M;
	page.drawText(title, { x: M, y, size: 15, font: bold, color: ink });
	y -= 30;
	for (const para of body.split(/\n{2,}/)) {
		for (const ln of para.split('\n')) {
			for (const line of wrap(ln, reg, 10.5, W - M * 2)) {
				if (y < M + 20) {
					page = doc.addPage([W, H]);
					y = H - M;
				}
				page.drawText(line, { x: M, y, size: 10.5, font: reg, color: ink });
				y -= 15;
			}
		}
		y -= 9;
	}
	const bytes = await doc.save();
	await saveBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), file);
}

export type Demand = { id: string; invoice_id: string; step: 3 | 4; kind: 'demand' | 'msme' | 'legal'; final_date: string | null; via: string; sent_at: string };
export async function loadDemands(invoiceId: string) {
	const { data } = await supabase.from('payment_demands').select('id, invoice_id, step, kind, final_date, via, sent_at').eq('invoice_id', invoiceId).order('sent_at');
	return (data ?? []) as Demand[];
}
export async function sendDemand(inv: Invoice, step: 3 | 4, kind: Demand['kind'], via: 'email' | 'whatsapp' | 'download', to: string[], final: string | null, letter: string) {
	const { error } = await supabase.rpc('payment_demand_send', { p_invoice: inv.id, p_step: step, p_kind: kind, p_final: final, p_via: via, p_to: to, p_letter: letter });
	if (error) throw new Error(errMessage(error));
}
