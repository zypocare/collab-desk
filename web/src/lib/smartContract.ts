import { supabase } from './supabase';
import { errMessage } from './util';

export type AsciRule = {
	id: string;
	title: string;
	desc: string;
	code: string;
	required: boolean;
	creator_ok: boolean;
};

export type SmartContract = {
	collab_id: string;
	usage_terms: string;
	exclusivity: string;
	revision_rounds: number;
	payout_terms: string;
	asci_rules: AsciRule[];
	brand_signed_name: string | null;
	brand_signed_email: string | null;
	brand_signed_at: string | null;
	creator_signed_name: string | null;
	creator_signed_email: string | null;
	creator_signed_at: string | null;
	audit_hash: string | null;
	updated_at: string;
};

export const USAGE_OPTS = ['Organic only', 'Meta Ads · 90d', 'Paid Ads · 6m', 'Perpetual UGC'] as const;
export const EXCL_OPTS = ['None', '15d · Category', '30d · Category', '60d · Category'] as const;
export const REV_OPTS = [1, 2, 3] as const;
export const PAYOUT_OPTS = ['Within 7d of live post', '50% advance / 50% live', 'Net 15 after invoice'] as const;

export const DEFAULT_ASCI: AsciRule[] = [
	{
		id: 'caption',
		title: '#ad / #paidpartnership in first 2 lines',
		desc: 'Visible above the fold without tapping "more".',
		code: '#ad',
		required: true,
		creator_ok: false
	},
	{
		id: 'label',
		title: 'Instagram Paid Partnership label enabled',
		desc: 'Tag the brand via the official Branded Content tool.',
		code: 'Paid Partnership',
		required: true,
		creator_ok: false
	},
	{
		id: 'video',
		title: '3-second on-screen or verbal disclosure',
		desc: 'Superimposed text clearly readable on Reel or Story.',
		code: '3s overlay',
		required: true,
		creator_ok: false
	},
	{
		id: 'claims',
		title: 'No unverified medical / guaranteed claims',
		desc: 'Keep claims aligned with the product label (ASCI safe).',
		code: 'ASCI Safe',
		required: true,
		creator_ok: false
	},
	{
		id: 'gifted',
		title: 'Disclose gifted / barter products clearly',
		desc: 'Include #gifted or #collab whenever a product kit is seeded.',
		code: '#gifted',
		required: true,
		creator_ok: false
	}
];

export async function loadSmartContract(code: string): Promise<SmartContract | null> {
	const { data, error } = await supabase.rpc('smart_contract_get', { p_code: code });
	if (error) throw new Error(errMessage(error));
	return (data as SmartContract | null) ?? null;
}

export async function brandSignContract(args: {
	code: string;
	usage: string;
	exclusivity: string;
	revisions: number;
	payout: string;
	asci: AsciRule[];
	signer: string;
}): Promise<SmartContract> {
	const { data, error } = await supabase.rpc('smart_contract_brand_sign', {
		p_code: args.code,
		p_usage: args.usage,
		p_exclusivity: args.exclusivity,
		p_revisions: args.revisions,
		p_payout: args.payout,
		p_asci: args.asci,
		p_signer: args.signer
	});
	if (error) throw new Error(errMessage(error));
	return data as SmartContract;
}

export async function creatorSignContract(args: {
	code: string;
	asci: AsciRule[];
	signer: string;
}): Promise<SmartContract> {
	const { data, error } = await supabase.rpc('smart_contract_creator_sign', {
		p_code: args.code,
		p_asci: args.asci,
		p_signer: args.signer
	});
	if (error) throw new Error(errMessage(error));
	return data as SmartContract;
}

export function fmtIst(iso: string | null | undefined): string {
	if (!iso) return 'Pending';
	try {
		return new Date(iso).toLocaleString('en-IN', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			hour12: true,
			timeZone: 'Asia/Kolkata'
		}) + ' IST';
	} catch {
		return iso;
	}
}

export function openSmartContractPrint(opts: {
	code: string;
	brandName: string;
	creatorName: string;
	deliverables: string;
	feeText: string;
	contract: SmartContract;
}) {
	const { code, brandName, creatorName, deliverables, feeText, contract } = opts;
	const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]!);
	const reqRules = (contract.asci_rules ?? []).filter((r) => r.required);
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>Agreement ${esc(code)} · Miracle</title><style>
		body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#17111c;max-width:740px;margin:32px auto;padding:0 24px;line-height:1.5}
		h1{font-family:Georgia,serif;font-weight:400;font-size:30px;margin:4px 0 6px}
		.eb{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7c5cfa}
		.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0;padding:14px;border:1px solid #e5dce9;border-radius:12px;background:#faf7fc}
		.grid small{display:block;color:#6e6179;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
		.grid b{font-size:14px}
		ul{padding-left:18px}
		.sigs{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}
		.sig{padding:14px;border:1px solid #d9cde0;border-radius:12px}
		.sig-n{font-family:Georgia,serif;font-style:italic;font-size:24px;margin:4px 0}
		.hash{margin-top:18px;font-family:monospace;font-size:11px;color:#6e6179;word-break:break-all}
	</style></head><body>
		<div class="eb">Miracle Executed Smart Agreement · ${esc(code)}</div>
		<h1>${esc(brandName)} × ${esc(creatorName)}</h1>
		<div class="grid">
			<div><small>Deliverables</small><b>${esc(deliverables || 'As specified in brief')}</b></div>
			<div><small>Fee &amp; Offer</small><b>${esc(feeText || 'As agreed')}</b></div>
			<div><small>Usage &amp; Paid Ad Rights</small><b>${esc(contract.usage_terms)}</b></div>
			<div><small>Category Exclusivity</small><b>${esc(contract.exclusivity)}</b></div>
			<div><small>Revisions Included</small><b>${contract.revision_rounds} round${contract.revision_rounds === 1 ? '' : 's'}</b></div>
			<div><small>Payment Release</small><b>${esc(contract.payout_terms)}</b></div>
		</div>
		<h3>ASCI (India) Disclosure Commitments (${reqRules.length})</h3>
		<ul>${reqRules.map((r) => `<li><b>${esc(r.title)}</b> — ${esc(r.desc)} ${r.creator_ok ? '✓ Confirmed by creator' : ''}</li>`).join('')}</ul>
		<div class="sigs">
			<div class="sig"><small class="eb">Brand Signatory</small><div class="sig-n">${esc(contract.brand_signed_name || 'Pending')}</div><div>${esc(contract.brand_signed_email || '')}</div><small>${esc(fmtIst(contract.brand_signed_at))}</small></div>
			<div class="sig"><small class="eb">Creator Signatory</small><div class="sig-n">${esc(contract.creator_signed_name || 'Pending')}</div><div>${esc(contract.creator_signed_email || '')}</div><small>${esc(fmtIst(contract.creator_signed_at))}</small></div>
		</div>
		<div class="hash">SHA-256 Audit Hash: ${esc(contract.audit_hash || '—')}</div>
		<script>window.onload=()=>window.print()</script>
	</body></html>`;
	const w = window.open('', '_blank', 'noopener,noreferrer');
	if (!w) return false;
	w.document.open();
	w.document.write(html);
	w.document.close();
	return true;
}
