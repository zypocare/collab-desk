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
	country: string;
	currency: string;
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
	currency: string;
	inr_rate: number;
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
	file_path: string | null;
	file_type: string;
	comments?: { id: number; at_seconds: number | null; body: string; name: string; author: 'brand' | 'creator' }[];
};

export type Checklist = Partial<Record<'paid_label' | 'ad_tag' | 'brand_tag' | 'link', boolean>>;

/** The AI's ready-to-shoot script for a collab (Brief to Reel script). */
export type ReelScript = {
	hooks: string[];
	hook?: string;
	idea: string;
	scenes: { time: string; shot: string; say: string; text: string }[];
	must: string[];
	avoid: string[];
	caption: string;
	hashtags: string[];
	music: string;
	props: string[];
	style?: string;
	language?: string;
	length?: string;
	made_at?: string;
};

export type BriefDetails = { message?: string; hashtags?: string[]; mentions?: string[]; link?: string; promo?: string; dos?: string; donts?: string; references?: string };

export type PackageItem = { kind: string; qty: number };
export type Package = { id: string; name: string; description: string; items: PackageItem[]; price: number; badge: string; active: boolean; position: number; created_at: string };
export type PublicPackage = Pick<Package, 'id' | 'name' | 'description' | 'items' | 'price' | 'badge'>;

export type DraftComment = { id: number; at: number | null; body: string; name?: string };

export type Message = { id: string; collab_id: string; sender: 'creator' | 'brand'; body: string; created_at: string };
export type ReadMark = { collab_id: string; side: 'creator' | 'brand'; read_at: string };
export type CollabEvent = { id: number; collab_id: string; at: string; kind: string; text: string; visible_to_brand: boolean };

/** Her short link and the brand's promo code for a collab. */
export type CollabLink = { id: string; collab_id: string; slug: string; target: string; promo_code: string; clicks: number; sales: number | null; revenue: number | null; sales_note: string; sales_by: string; sales_at: string | null };

/** A monthly deal: the collab for each month is created on its own. */
export type Retainer = {
	id: string;
	brand_id: string;
	title: string;
	deliverables: { kind: string; qty: number }[];
	fee: number;
	starts_on: string;
	months: number | null;
	live_day: number;
	invoice_when: 'start' | 'live';
	contact_name: string;
	contact_email: string;
	brief: string;
	active: boolean;
	created_at: string;
};

export type Collab = {
	id: string;
	code: string;
	brand_id: string;
	source: 'brand_page' | 'manual' | 'email' | 'retainer';
	retainer_id?: string | null;
	links?: CollabLink[];
	referred_by?: string | null;
	retainer_month?: string | null;
	contact_name: string;
	contact_email: string;
	contact_phone: string;
	type: CollabType;
	stage: Stage;
	fee: number;
	product: string;
	product_value: number;
	/** Barter: a product sent to her, or an experience (a stay, a meal, an event, a service). */
	barter_kind: 'product' | 'experience';
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
	counter_fee: number | null;
	counter_status: '' | 'sent' | 'taken' | 'kept';
	shoot_date: string | null;
	track_token: string;
	track_sent_at: string | null;
	brief_asked_at: string | null;
	live_time: string | null;
	post_alert_at: string | null;
	shot_list: { t: string; done: boolean }[];
	script: ReelScript | null;
	files?: { id: string; label: string; url: string; file_path: string | null; file_type: string; size_bytes: number; created_at: string; downloaded_at: string | null }[];
	files_sent_at: string | null;
	expenses?: { id: string; collab_id: string; label: string; category: 'props' | 'travel' | 'editor' | 'shoot' | 'other'; amount: number; spent_on: string }[];
	ship_carrier: string;
	ship_tracking: string;
	shipped_at: string | null;
	product_received_at: string | null;
	messages: Pick<Message, 'id' | 'sender' | 'body' | 'created_at'>[];
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
	demographics: Partial<Record<'age' | 'gender' | 'city' | 'country', Record<string, number>>>;
	insights?: Record<string, unknown>;
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
	lut_arn: string;
	intl_bank_details: string;
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
	/** For the "Should I take it?" report: home area (travel time only, never shown to brands). */
	home_area: string;
	home_lat: number | null;
	home_lng: number | null;
	travel_mode: 'car' | 'bike' | 'cab' | 'public';
	travel_max_min: number;
	makeup_cost: number;
	outfit_cost: number;
	avoid_brands: string;
	/** Her greeting on phone alerts: "Hey {alert_name}! ...", and an optional line under each. */
	alert_name: string;
	alert_line: string;
	/** Chime and spoken line in the app for new possible collabs and requests. */
	voice_alerts: boolean;
	away_weeks: string[];
	show_availability: boolean;
	offered_kinds: string[];
	show_results: boolean;
	whatsapp: string;
	autopilot_packages: boolean;
	autopilot_invoice: boolean;
	autopilot_dates: boolean;
	autopilot_track: boolean;
	autopilot_counter: boolean;
	autopilot_nudge: boolean;
	autopilot_review: boolean;
	nudge_days: number;
	autopilot_brief: boolean;
	show_insights: boolean;
	/** Stories on the insights page, and her own Story averages to use instead of the app's. */
	insights_stories: boolean;
	story_stats: { avg_views?: number; avg_reach?: number; avg_interactions?: number };
	saved_replies: { id: string; title: string; body: string }[];
	piece_hours: Record<string, number>;
	weekly_hours: number;
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
	results: { brand: string; views: number | null; reach: number | null; likes: number | null; kind: string; permalink: string; thumbnail: string; posted_at: string }[];
	reviews: { rating: number; text: string; name: string; brand: string }[];
	whatsapp: string | null;
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
	invoices: { number: string; kind: string; total: number; payable: number; status: string; issue_date: string; due_date: string | null; token: string; claimed?: boolean; currency?: string }[];
	live_time: string | null;
	product_date: string | null;
	shipped_at: string | null;
	product_received_at: string | null;
	usage_ends: string | null;
	files_sent_at: string | null;
	files: { id: string; label: string; url: string; file_path: string | null; file_type: string; size: number }[];
	report_token: string | null;
	results: { views: number | null; reach: number | null; interactions: number | null; posts: number } | null;
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
	brand: { name: string; instagram: string; website: string; gstin?: string; address?: string; country?: string };
	contact: { name: string; email: string };
	creator: { name: string; handle: string; city: string; app_name: string; legal_name: string; email: string; pan?: string };
};
