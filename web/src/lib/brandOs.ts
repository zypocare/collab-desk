import { supabase } from './supabase';
import { errMessage } from './util';

export type ApprovalItem = { label: string; meta: string; value?: string };
export type ApprovalLink = {
	token: string;
	brand_name: string;
	kind: 'shortlist' | 'draft';
	title: string;
	summary: string;
	items: ApprovalItem[];
	status: 'pending' | 'approved' | 'changes_requested';
	reviewer_name: string | null;
	reviewer_note: string | null;
	responded_at: string | null;
	created_at: string;
};

export type BrandApplication = {
	id: string;
	brand_slug: string;
	creator_name: string;
	handle: string;
	city: string;
	niche: string;
	followers: number;
	engagement: number;
	reel_rate: number;
	pitch: string;
	status: 'new' | 'shortlisted' | 'archived';
	created_at: string;
};

export type CreatorMemory = {
	creator_id: number;
	last_quoted: number;
	last_settled: number;
	preferred_format: string;
	private_notes: string;
	updated_at?: string;
};

export type PostMonitor = {
	id: string;
	collab_code: string;
	creator_name: string;
	platform: 'instagram' | 'youtube_shorts' | 'ugc_raw';
	post_url: string;
	views_48h: number;
	views_7d: number;
	views_30d: number;
	viral_threshold: number;
	status: 'live' | 'viral' | 'missing';
	last_checked_at: string;
};

export const slugifyBrand = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'my-brand';

// 1. Approval Links
export async function createApprovalLink(args: {
	kind: 'shortlist' | 'draft';
	title: string;
	summary: string;
	items: ApprovalItem[];
	brandName: string;
}): Promise<ApprovalLink> {
	const { data, error } = await supabase.rpc('approval_link_create', {
		p_kind: args.kind,
		p_title: args.title,
		p_summary: args.summary,
		p_items: args.items,
		p_brand_name: args.brandName
	});
	if (error) throw new Error(errMessage(error));
	return data as ApprovalLink;
}

export async function listApprovalLinks(): Promise<ApprovalLink[]> {
	const { data, error } = await supabase.rpc('approval_link_list');
	if (error) throw new Error(errMessage(error));
	return (data as ApprovalLink[]) ?? [];
}

export async function getApprovalLink(token: string): Promise<ApprovalLink | null> {
	const { data, error } = await supabase.rpc('approval_link_get', { p_token: token });
	if (error) throw new Error(errMessage(error));
	return (data as ApprovalLink | null) ?? null;
}

export async function respondApprovalLink(token: string, status: 'approved' | 'changes_requested', name: string, note: string): Promise<ApprovalLink> {
	const { data, error } = await supabase.rpc('approval_link_respond', {
		p_token: token,
		p_status: status,
		p_name: name,
		p_note: note
	});
	if (error) throw new Error(errMessage(error));
	return data as ApprovalLink;
}

// 2. Apply-to-Collab Funnel
export async function submitBrandApplication(args: {
	brandSlug: string;
	name: string;
	handle: string;
	city: string;
	niche: string;
	followers: number;
	engagement: number;
	reelRate: number;
	pitch: string;
}): Promise<BrandApplication> {
	const { data, error } = await supabase.rpc('brand_apply_submit', {
		p_brand_slug: args.brandSlug,
		p_name: args.name,
		p_handle: args.handle,
		p_city: args.city,
		p_niche: args.niche,
		p_followers: args.followers,
		p_engagement: args.engagement,
		p_reel_rate: args.reelRate,
		p_pitch: args.pitch
	});
	if (error) throw new Error(errMessage(error));
	return data as BrandApplication;
}

export async function listBrandApplications(brandSlug: string): Promise<BrandApplication[]> {
	const { data, error } = await supabase.rpc('brand_applications_list', { p_brand_slug: brandSlug });
	if (error) throw new Error(errMessage(error));
	return (data as BrandApplication[]) ?? [];
}

export async function updateApplicationStatus(id: string, status: 'new' | 'shortlisted' | 'archived'): Promise<BrandApplication> {
	const { data, error } = await supabase.rpc('brand_application_status', { p_id: id, p_status: status });
	if (error) throw new Error(errMessage(error));
	return data as BrandApplication;
}

// 3. Creator CRM Memory
export async function getCreatorMemory(creatorId: number): Promise<CreatorMemory | null> {
	const { data, error } = await supabase.rpc('creator_memory_get', { p_creator: creatorId });
	if (error) throw new Error(errMessage(error));
	return (data as CreatorMemory | null) ?? null;
}

export async function saveCreatorMemory(m: CreatorMemory): Promise<CreatorMemory> {
	const { data, error } = await supabase.rpc('creator_memory_save', {
		p_creator: m.creator_id,
		p_quoted: m.last_quoted,
		p_settled: m.last_settled,
		p_format: m.preferred_format,
		p_notes: m.private_notes
	});
	if (error) throw new Error(errMessage(error));
	return data as CreatorMemory;
}

// 4. Post Watchdog & Multi-Platform (Instagram / YouTube Shorts / Raw UGC)
export async function listPostMonitors(): Promise<PostMonitor[]> {
	const { data, error } = await supabase.rpc('post_monitor_list');
	if (error) throw new Error(errMessage(error));
	return (data as PostMonitor[]) ?? [];
}

export async function savePostMonitor(args: {
	creator: string;
	platform: 'instagram' | 'youtube_shorts' | 'ugc_raw';
	url: string;
	code?: string;
	views48h?: number;
	views7d?: number;
	views30d?: number;
	viralThreshold?: number;
}): Promise<PostMonitor> {
	const { data, error } = await supabase.rpc('post_monitor_upsert', {
		p_creator: args.creator,
		p_platform: args.platform,
		p_url: args.url,
		p_code: args.code ?? '',
		p_views_48h: args.views48h ?? 0,
		p_views_7d: args.views7d ?? 0,
		p_views_30d: args.views30d ?? 0,
		p_viral_threshold: args.viralThreshold ?? 50000
	});
	if (error) throw new Error(errMessage(error));
	return data as PostMonitor;
}

export async function updatePostMonitorStatus(id: string, status: 'live' | 'viral' | 'missing'): Promise<PostMonitor> {
	const { data, error } = await supabase.rpc('post_monitor_status', { p_id: id, p_status: status });
	if (error) throw new Error(errMessage(error));
	return data as PostMonitor;
}

// 5. Pre-Campaign ROI & Budget Simulator (deterministic benchmarks)
export function simulateCampaignRoi(args: {
	budget: number;
	nanoPct: number;
	microPct: number;
	macroPct: number;
	aov: number;
	convRatePct: number;
}) {
	const sum = Math.max(1, args.nanoPct + args.microPct + args.macroPct);
	const wNano = args.nanoPct / sum;
	const wMicro = args.microPct / sum;
	const wMacro = args.macroPct / sum;

	const nanoBudget = args.budget * wNano;
	const microBudget = args.budget * wMicro;
	const macroBudget = args.budget * wMacro;

	// Benchmarks: Nano ~₹6k/creator (₹0.45 CPV), Micro ~₹18k (₹0.58 CPV), Macro ~₹55k (₹0.82 CPV)
	const creators = Math.max(1, Math.round(nanoBudget / 6000) + Math.round(microBudget / 18000) + Math.round(macroBudget / 55000));
	const estViews = Math.round(nanoBudget / 0.45 + microBudget / 0.58 + macroBudget / 0.82);
	const estCpv = estViews > 0 ? args.budget / estViews : 0;
	const estClicks = Math.round(estViews * 0.018);
	const estOrders = Math.round(estClicks * (args.convRatePct / 100));
	const estRevenue = Math.round(estOrders * args.aov);
	const roas = args.budget > 0 ? estRevenue / args.budget : 0;
	const breakEvenOrders = args.aov > 0 ? Math.ceil(args.budget / args.aov) : 0;
	return { creators, estViews, estCpv, estClicks, estOrders, estRevenue, roas, breakEvenOrders };
}

// 6. Bank-Ready Bulk NEFT CSV + Auto-TDS (194J 10% / 194C 2%)
export function downloadBulkNeftCsv(
	brandName: string,
	rows: { creator: string; gross: number; gst: number; tdsPct: number; ref: string }[]
) {
	const header = ['Beneficiary Name', 'Payment Mode', 'Reference', 'Gross Fee (INR)', 'GST (INR)', 'TDS %', 'TDS Deducted (INR)', 'Net Payable (INR)'];
	const lines = [header.join(',')];
	for (const r of rows) {
		const tds = Math.round((r.gross * r.tdsPct) / 100);
		const net = Math.max(0, Math.round(r.gross + r.gst - tds));
		const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
		lines.push([esc(r.creator), esc('NEFT'), esc(r.ref), r.gross, r.gst, `${r.tdsPct}%`, tds, net].join(','));
	}
	const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${slugifyBrand(brandName)}-neft-tds-payouts.csv`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

// 7. 1-Click Campaign Wrap-Up Executive Report PDF
export function openCampaignWrapUpPdf(opts: {
	brandName: string;
	period: string;
	spent: number;
	views: number;
	cpv: number | null;
	creators: number;
	posts: number;
	gst: number;
	tds: number;
	topCreators: { name: string; views: number; spent: number }[];
}) {
	const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]!);
	const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
	const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.brandName)} · Campaign Wrap-Up</title><style>
		body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#17111c;max-width:780px;margin:32px auto;padding:0 24px;line-height:1.5}
		h1{font-family:Georgia,serif;font-weight:400;font-size:34px;margin:4px 0 8px}
		.eb{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#7c5cfa}
		.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
		.kpi{padding:14px;border-radius:12px;border:1px solid #e5dce9;background:#faf7fc}
		.kpi small{display:block;color:#6e6179;font-size:11px;text-transform:uppercase}
		.kpi b{font-size:22px}
		table{width:100%;border-collapse:collapse;margin-top:14px;font-size:13.5px}
		th,td{padding:10px 8px;border-bottom:1px solid #e5dce9;text-align:left}
		th{font-size:11px;text-transform:uppercase;color:#6e6179;letter-spacing:.08em}
	</style></head><body>
		<div class="eb">Miracle Executive Wrap-Up · ${esc(opts.period)}</div>
		<h1>${esc(opts.brandName)} Creator Impact</h1>
		<div class="kpis">
			<div class="kpi"><small>Total Spend</small><b>${inr(opts.spent)}</b></div>
			<div class="kpi"><small>Total Views</small><b>${opts.views.toLocaleString('en-IN')}</b></div>
			<div class="kpi"><small>Cost Per View</small><b>${opts.cpv !== null ? `₹${opts.cpv.toFixed(2)}` : '—'}</b></div>
			<div class="kpi"><small>Creators / Posts</small><b>${opts.creators} / ${opts.posts}</b></div>
		</div>
		<h3>Top Performing Creators</h3>
		<table><thead><tr><th>Creator</th><th>Views</th><th>Spent</th><th>CPV</th></tr></thead><tbody>
			${opts.topCreators.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${c.views.toLocaleString('en-IN')}</td><td>${inr(c.spent)}</td><td>${c.views ? `₹${(c.spent / c.views).toFixed(2)}` : '—'}</td></tr>`).join('')}
		</tbody></table>
		<p style="margin-top:20px;font-size:12px;color:#6e6179">Tax summary: ${inr(opts.gst)} claimable input GST · ${inr(opts.tds)} TDS deducted. Generated from Miracle.</p>
		<script>window.onload=()=>window.print()</script>
	</body></html>`;
	const w = window.open('', '_blank', 'noopener,noreferrer');
	if (!w) return false;
	w.document.open();
	w.document.write(html);
	w.document.close();
	return true;
}
