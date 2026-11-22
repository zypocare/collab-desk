import { supabase } from './supabase';
import { errMessage } from './util';

export type CreatorApprovalLink = {
	token: string;
	creator_name: string;
	kind: 'contract' | 'draft';
	brand_name: string;
	title: string;
	fee_text: string;
	terms_summary: string;
	draft_url: string;
	status: 'pending' | 'approved' | 'changes_requested';
	signer_name: string | null;
	signer_note: string | null;
	responded_at: string | null;
	created_at: string;
};

export type BrandMemory = {
	brand_name: string;
	last_quoted: number;
	last_settled: number;
	avg_pay_days: number;
	revision_count: number;
	private_notes: string;
	updated_at?: string;
};

export type CreatorPost = {
	id: string;
	brand_name: string;
	platform: 'instagram' | 'youtube_shorts' | 'ugc_raw';
	post_url: string;
	views_48h: number;
	views_7d: number;
	views_30d: number;
	viral_threshold: number;
	status: 'tracking' | 'viral_ready' | 'pitched';
};

export type BudgetGate = {
	min_reel_budget: number;
	accept_barter: boolean;
	auto_sort_low: boolean;
	note_for_brands: string;
};

// 1. Off-platform Draft Approval & Contract Links
export async function createCreatorLink(args: {
	kind: 'contract' | 'draft';
	brand: string;
	title: string;
	fee: string;
	terms: string;
	draftUrl?: string;
	creatorName: string;
}): Promise<CreatorApprovalLink> {
	const { data, error } = await supabase.rpc('creator_link_create', {
		p_kind: args.kind,
		p_brand: args.brand,
		p_title: args.title,
		p_fee: args.fee,
		p_terms: args.terms,
		p_draft_url: args.draftUrl ?? '',
		p_creator_name: args.creatorName
	});
	if (error) throw new Error(errMessage(error));
	return data as CreatorApprovalLink;
}

export async function listCreatorLinks(): Promise<CreatorApprovalLink[]> {
	const { data, error } = await supabase.rpc('creator_link_list');
	if (error) throw new Error(errMessage(error));
	return (data as CreatorApprovalLink[]) ?? [];
}

export async function getCreatorLink(token: string): Promise<CreatorApprovalLink | null> {
	const { data, error } = await supabase.rpc('creator_link_get', { p_token: token });
	if (error) throw new Error(errMessage(error));
	return (data as CreatorApprovalLink | null) ?? null;
}

export async function respondCreatorLink(token: string, status: 'approved' | 'changes_requested', name: string, note: string): Promise<CreatorApprovalLink> {
	const { data, error } = await supabase.rpc('creator_link_respond', {
		p_token: token,
		p_status: status,
		p_name: name,
		p_note: note
	});
	if (error) throw new Error(errMessage(error));
	return data as CreatorApprovalLink;
}

// 2. Private Brand CRM & Payment Memory
export async function listBrandMemories(): Promise<BrandMemory[]> {
	const { data, error } = await supabase.rpc('brand_memory_list');
	if (error) throw new Error(errMessage(error));
	return (data as BrandMemory[]) ?? [];
}

export async function saveBrandMemory(m: BrandMemory): Promise<BrandMemory> {
	const { data, error } = await supabase.rpc('brand_memory_save', {
		p_brand: m.brand_name,
		p_quoted: m.last_quoted,
		p_settled: m.last_settled,
		p_pay_days: m.avg_pay_days,
		p_revisions: m.revision_count,
		p_notes: m.private_notes
	});
	if (error) throw new Error(errMessage(error));
	return data as BrandMemory;
}

// 3. Multi-Platform & Viral Upsell Tracker
export async function listCreatorPosts(): Promise<CreatorPost[]> {
	const { data, error } = await supabase.rpc('creator_post_list');
	if (error) throw new Error(errMessage(error));
	return (data as CreatorPost[]) ?? [];
}

export async function saveCreatorPost(args: {
	brand: string;
	platform: 'instagram' | 'youtube_shorts' | 'ugc_raw';
	url: string;
	views48h?: number;
	views7d?: number;
	views30d?: number;
	threshold?: number;
}): Promise<CreatorPost> {
	const { data, error } = await supabase.rpc('creator_post_upsert', {
		p_brand: args.brand,
		p_platform: args.platform,
		p_url: args.url,
		p_views_48h: args.views48h ?? 0,
		p_views_7d: args.views7d ?? 0,
		p_views_30d: args.views30d ?? 0,
		p_threshold: args.threshold ?? 50000
	});
	if (error) throw new Error(errMessage(error));
	return data as CreatorPost;
}

export async function updateCreatorPostStatus(id: string, status: 'tracking' | 'viral_ready' | 'pitched'): Promise<CreatorPost> {
	const { data, error } = await supabase.rpc('creator_post_status', { p_id: id, p_status: status });
	if (error) throw new Error(errMessage(error));
	return data as CreatorPost;
}

// 4. Bio Link Budget Gate
export async function getBudgetGate(): Promise<BudgetGate | null> {
	const { data, error } = await supabase.rpc('creator_gate_get');
	if (error) throw new Error(errMessage(error));
	return (data as BudgetGate | null) ?? null;
}

export async function saveBudgetGate(g: BudgetGate): Promise<BudgetGate> {
	const { data, error } = await supabase.rpc('creator_gate_save', {
		p_min: g.min_reel_budget,
		p_barter: g.accept_barter,
		p_auto_sort: g.auto_sort_low,
		p_note: g.note_for_brands
	});
	if (error) throw new Error(errMessage(error));
	return data as BudgetGate;
}

// 5. Fair Rate, Usage-Rights & Net Take-Home Calculator
export function calcCreatorPackage(args: {
	baseReel: number;
	reels: number;
	stories: number;
	shortsOrUgc: number;
	usageDays: 0 | 30 | 90 | 180;
	exclDays: 0 | 15 | 30 | 60;
	gstRegistered: boolean;
	tdsPct: 0 | 2 | 10;
}) {
	const contentBase =
		args.reels * args.baseReel +
		args.stories * Math.round(args.baseReel * 0.25) +
		args.shortsOrUgc * Math.round(args.baseReel * 0.75);
	const usagePct = args.usageDays === 30 ? 0.2 : args.usageDays === 90 ? 0.4 : args.usageDays === 180 ? 0.65 : 0;
	const exclPct = args.exclDays === 15 ? 0.15 : args.exclDays === 30 ? 0.3 : args.exclDays === 60 ? 0.5 : 0;
	const usageFee = Math.round(contentBase * usagePct);
	const exclFee = Math.round(contentBase * exclPct);
	const subtotal = contentBase + usageFee + exclFee;
	const gst = args.gstRegistered ? Math.round(subtotal * 0.18) : 0;
	const invoiceTotal = subtotal + gst;
	const tds = Math.round((subtotal * args.tdsPct) / 100);
	const netTakeHome = Math.max(0, invoiceTotal - tds);
	return { contentBase, usageFee, exclFee, subtotal, gst, invoiceTotal, tds, netTakeHome };
}

// 6. CA-Ready Form 26AS TDS & GST Tax Pack CSV
export function downloadCreatorTaxCsv(
	creatorName: string,
	rows: { brand: string; code: string; stage: string; gross: number; gstPct: number; tdsPct: number }[]
) {
	const header = ['Brand', 'Collab Code', 'Stage', 'Gross Fee (INR)', 'GST Collected (INR)', 'TDS Deducted / Form 26AS (INR)', 'Net Received (INR)'];
	const lines = [header.join(',')];
	for (const r of rows) {
		const gst = Math.round((r.gross * r.gstPct) / 100);
		const tds = Math.round((r.gross * r.tdsPct) / 100);
		const net = Math.max(0, r.gross + gst - tds);
		const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
		lines.push([esc(r.brand), esc(r.code), esc(r.stage), r.gross, gst, tds, net].join(','));
	}
	const slug = creatorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'creator';
	const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${slug}-form26as-tds-gst-pack.csv`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

// 7. 1-Click Creator Collab Proof Report PDF
export function openCreatorProofPdf(opts: {
	creatorName: string;
	handle: string;
	followers: string;
	engagement: string;
	collabs: { brand: string; fee: number; stage: string }[];
}) {
	const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]!);
	const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
	const totalEarned = opts.collabs.reduce((a, c) => a + c.fee, 0);
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.creatorName)} · Proof Report</title><style>
		body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#17111c;max-width:760px;margin:32px auto;padding:0 24px;line-height:1.5}
		h1{font-family:Georgia,serif;font-weight:400;font-size:34px;margin:4px 0 8px}
		.eb{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#7c5cfa}
		.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}
		.kpi{padding:14px;border-radius:12px;border:1px solid #e5dce9;background:#faf7fc}
		.kpi small{display:block;color:#6e6179;font-size:11px;text-transform:uppercase}
		.kpi b{font-size:22px}
		table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13.5px}
		th,td{padding:10px 8px;border-bottom:1px solid #e5dce9;text-align:left}
		th{font-size:11px;text-transform:uppercase;color:#6e6179;letter-spacing:.08em}
	</style></head><body>
		<div class="eb">Miracle Verified Creator Proof Report · @${esc(opts.handle)}</div>
		<h1>${esc(opts.creatorName)}</h1>
		<div class="kpis">
			<div class="kpi"><small>Followers</small><b>${esc(opts.followers || '—')}</b></div>
			<div class="kpi"><small>Engagement Rate</small><b>${esc(opts.engagement || '—')}</b></div>
			<div class="kpi"><small>Verified Collabs</small><b>${opts.collabs.length} (${inr(totalEarned)})</b></div>
		</div>
		<h3>Recent Brand Collaborations</h3>
		<table><thead><tr><th>Brand</th><th>Status</th><th>Deal Value</th></tr></thead><tbody>
			${opts.collabs.slice(0, 10).map((c) => `<tr><td><b>${esc(c.brand)}</b></td><td>${esc(c.stage)}</td><td>${c.fee ? inr(c.fee) : 'Barter / Gifted'}</td></tr>`).join('')}
		</tbody></table>
		<p style="margin-top:20px;font-size:12px;color:#6e6179">Generated live from Miracle Creator Studio.</p>
		<script>window.onload=()=>window.print()</script>
	</body></html>`;
	const w = window.open('', '_blank', 'noopener,noreferrer');
	if (!w) return false;
	w.document.open();
	w.document.write(html);
	w.document.close();
	return true;
}
