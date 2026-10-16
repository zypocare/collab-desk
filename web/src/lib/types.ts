import type { Invoice } from './invoice';

export type Stage = 'request' | 'negotiating' | 'confirmed' | 'creating' | 'live' | 'wrapped' | 'declined';
export type CollabType = 'paid' | 'barter' | 'hybrid';
export type PayStatus = 'na' | 'pending' | 'advance' | 'invoiced' | 'paid';

export type Brand = {
	id: string;
	name: string;
	instagram: string;
	website: string;
	category: string;
	gstin: string;
	billing_address: string;
	state: string;
	accounts_email: string;
	created_at: string;
};

export type BrandPrivate = {
	brand_id: string;
	notes: string;
	competitors: string[];
	rate_pay?: number | null;
	rate_brief?: number | null;
	rate_again?: number | null;
	rated_at?: string | null;
};

export type Deliverable = { id: string; collab_id: string; kind: string; qty: number; done: boolean; position: number };

export type QuoteItem = { kind: string; qty: number; rate: number };
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'changes' | 'withdrawn';
export type Quote = {
	id: string;
	collab_id: string;
	version: number;
	items: QuoteItem[];
	usage: string;
	usage_fee: number;
	discount: number;
	total: number;
	advance_pct: number;
	pay_days: number;
	revision_rounds: number;
	exclusivity_days: number;
	valid_until: string | null;
	notes: string;
	status: QuoteStatus;
	sent_at: string | null;
	responded_at: string | null;
	response_note: string;
	accepted_name: string | null;
	accepted_email: string | null;
	accepted_ip?: string | null;
	created_at: string;
};

export type DraftStatus = 'pending' | 'approved' | 'changes';
export type Draft = {
	id: string;
	collab_id: string;
	round: number;
	link: string;
	caption: string;
	note: string;
	status: DraftStatus;
	feedback: string;
	submitted_at: string;
	responded_at: string | null;
	responded_by: string | null;
};

export type Checklist = Partial<Record<'paid_label' | 'ad_tag' | 'brand_tag' | 'link', boolean>>;

export type BriefDetails = { message?: string; hashtags?: string[]; mentions?: string[]; link?: string; dos?: string; donts?: string; references?: string };

export type PackageItem = { kind: string; qty: number };
export type Package = { id: string; name: string; description: string; items: PackageItem[]; price: number; badge: string; active: boolean; position: number; created_at: string };
export type PublicPackage = Pick<Package, 'id' | 'name' | 'description' | 'items' | 'price' | 'badge'>;

export type Message = { id: string; collab_id: string; sender: 'creator' | 'brand'; body: string; created_at: string };
export type ReadMark = { collab_id: string; side: 'creator' | 'brand'; read_at: string };
export type CollabEvent = { id: number; collab_id: string; at: string; kind: string; text: string; visible_to_brand: boolean };

export type Collab = {
	id: string;
	code: string;
	brand_id: string;
	source: 'brand_page' | 'manual' | 'email';
	contact_name: string;
	contact_email: string;
	contact_phone: string;
	type: CollabType;
	stage: Stage;
	fee: number;
	product: string;
	product_value: number;
	usage: string;
	brief: string;
	preferred_live: string | null;
	received_on: string;
	product_date: string | null;
	draft_date: string | null;
	live_date: string | null;
	pay_status: PayStatus;
	pay_received: number;
	invoice_no: string;
	invoiced_on: string | null;
	pay_due: string | null;
	paid_on: string | null;
	follow_date: string | null;
	follow_note: string;
	note_for_brand: string;
	notify_brand: boolean;
	checklist: Checklist;
	created_at: string;
	updated_at: string;
	brand: Brand;
	deliverables: Deliverable[];
	events: CollabEvent[];
	quotes: Quote[];
	drafts: Draft[];
	invoices: Invoice[];
	posts: { matched_by: 'auto' | 'manual'; media: IgMedia }[];
	reports: BrandReport[];
	package_name: string;
	brief_details: BriefDetails;
	usage_ends: string | null;
	usage_ext_days: number;
	usage_ext_price: number;
	usage_ext_status: '' | 'requested' | 'approved' | 'declined';
	ship_carrier: string;
	ship_tracking: string;
	shipped_at: string | null;
	product_received_at: string | null;
	messages: Pick<Message, 'id' | 'sender' | 'created_at'>[];
	reads: Pick<ReadMark, 'side' | 'read_at'>[];
};

export type IgMedia = {
	id: string;
	caption: string;
	media_type: string;
	product_type: string;
	permalink: string;
	posted_at: string;
	thumbnail_url: string;
	likes: number | null;
	comments: number | null;
	saves: number | null;
	shares: number | null;
	reach: number | null;
	views: number | null;
	interactions: number | null;
	insights_at: string | null;
};

export type IgAccount = {
	connected: boolean;
	username: string;
	name: string;
	profile_picture_url: string;
	followers: number | null;
	follows: number | null;
	media_count: number | null;
	engagement_rate: number | null;
	avg_views: number | null;
	avg_reach: number | null;
	demographics: Partial<Record<'age' | 'gender' | 'city', Record<string, number>>>;
	token_expires_at: string | null;
	last_sync_at: string | null;
	last_error: string;
};

export type ReportPost = {
	permalink: string; type: string; posted_at: string; thumbnail: string;
	views: number | null; reach: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null; interactions: number | null;
};
export type ReportData = {
	brand: string;
	brand_handle: string;
	code: string;
	creator: { name: string; handle: string; followers: number | null };
	deliverables: string;
	days_after: number;
	posts: ReportPost[];
	totals: { views: number | null; reach: number | null; likes: number; comments: number; saves: number | null; shares: number | null; interactions: number };
	engagement_rate: number | null;
	generated_at: string;
	created_at?: string;
};
export type BrandReport = { id: string; collab_id: string; public_token: string; status: 'ready' | 'sent'; data: ReportData; created_at: string; sent_at: string | null };

export type BankAlert = {
	id: string;
	created_at: string;
	received_at: string | null;
	sender: string;
	amount: number | null;
	ref: string;
	excerpt: string;
	status: 'matched' | 'unmatched' | 'ignored';
	invoice_id: string | null;
	note: string;
};

export type Settings = {
	id: number;
	creator_email: string;
	app_name: string;
	site_url: string;
	display_name: string;
	handle: string;
	niche: string;
	city: string;
	followers: string;
	engagement: string;
	reply_time: string;
	accepting: boolean;
	show_rates: boolean;
	monthly_goal: number;
	rates: Record<string, number>;
	code_prefix: string;
	competitor_window_days: number;
	digest_enabled: boolean;
	telegram_chat_id: string;
	calendar_token: string;
	legal_name: string;
	pan: string;
	gst_registered: boolean;
	gstin: string;
	gst_rate: number;
	sac_code: string;
	state: string;
	address: string;
	upi_id: string;
	bank_details: string;
	invoice_prefix: string;
	invoice_footer: string;
	reminders_enabled: boolean;
	inbox_token: string;
	report_mode: 'review' | 'auto' | 'off';
	barter_mode: 'open' | 'selective' | 'closed';
	barter_min_value: number;
	barter_monthly_cap: number;
	barter_reply_time: string;
	priority_categories: string[];
	ship_name: string;
	ship_address: string;
	ship_phone: string;
	draft_days_after_product: number;
	usage_ext_pct: number;
	weekly_capacity: number;
	away_weeks: string[];
	show_availability: boolean;
	offered_kinds: string[];
};

export type PublicPage = {
	app_name: string;
	display_name: string;
	handle: string;
	niche: string;
	city: string;
	followers: string;
	engagement: string;
	reply_time: string;
	accepting: boolean;
	rates: Record<string, number> | null;
	packages: PublicPackage[];
	/** Content types she offers; brands only see these. */
	offered: string[];
	availability: { start: string; status: 'open' | 'limited' | 'full' | 'away' }[] | null;
	barter: { mode: 'open' | 'selective' | 'closed'; min_value: number; reply_time: string; slots_left: number | null } | null;
	worked_with: string[];
	instagram: {
		username: string;
		followers: number | null;
		engagement_rate: number | null;
		avg_views: number | null;
		avg_reach: number | null;
		demographics: Partial<Record<'age' | 'gender' | 'city', Record<string, number>>>;
		profile_picture_url: string;
		updated_at: string | null;
	} | null;
};

export type Account =
	| { role: 'creator'; email: string }
	| {
			role: 'brand';
			email: string;
			full_name: string;
			phone: string;
			brand: { id: string; name: string; instagram: string; website: string; category: string } | null;
			/** Every brand this login manages (agencies have several). */
			brands: { id: string; name: string }[];
	  };

export type BrandRequest = {
	id: string;
	code: string;
	stage: Stage;
	stage_label: string;
	type: CollabType;
	fee: number;
	product: string;
	product_value: number;
	usage: string;
	brief: string;
	preferred_live: string | null;
	received_on: string;
	draft_date: string | null;
	live_date: string | null;
	pay_status: PayStatus;
	invoice_no: string;
	pay_due: string | null;
	paid_on: string | null;
	note_for_brand: string;
	contact_name: string;
	created_at: string;
	deliverables: { kind: string; qty: number; done: boolean }[];
	events: { at: string; text: string }[];
	quotes: Quote[];
	drafts: Draft[];
	invoices: { number: string; kind: string; total: number; payable: number; status: string; issue_date: string; due_date: string | null; token: string }[];
};

export type Agreement = {
	quote: Quote;
	accepted_ip: string | null;
	code: string;
	type: CollabType;
	product: string;
	product_value: number;
	live_date: string | null;
	preferred_live: string | null;
	brand: { name: string; instagram: string; website: string };
	contact: { name: string; email: string };
	creator: { name: string; handle: string; city: string; app_name: string };
};
