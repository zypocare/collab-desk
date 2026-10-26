import type { Health } from './health';
import type { Invoice } from './invoice';

export type Stage = 'request' | 'negotiating' | 'confirmed' | 'creating' | 'live' | 'wrapped' | 'declined' | 'paused' | 'cancelled';
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
	/** For TDS: the brand's PAN and TAN (on Form 16A and in her 26AS). */
	pan?: string;
	tan?: string;
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

export type DeliverableStatus = 'planned' | 'creating' | 'in_review' | 'approved' | 'published' | 'delivered';
export type DeliverableItem = {
	id: string; deliverable_id: string; collab_id: string; position: number; status: DeliverableStatus;
	due_date: string | null; assigned_to: string; draft_id: string | null; media_id: string | null; completed_at: string | null;
};
export type Deliverable = { id: string; collab_id: string; kind: string; qty: number; done: boolean; position: number; items?: DeliverableItem[] };

export type QuoteItem = { kind: string; qty: number; rate: number };
export type QuoteChoice = { title: string; sub: string; items: QuoteItem[]; usage: string; usage_fee: number; discount: number; total: number; popular?: boolean };
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
	/** Work doesn't start until the advance arrives. */
	wait_advance?: boolean;
	valid_until: string | null;
	notes: string;
	status: QuoteStatus;
	/** Up to three options the brand picks from (Good / Better / Best). */
	options?: QuoteChoice[] | null;
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
	/** The brand's watermarked copy (made on her device), and when the clean file was opened to them. */
	preview_path?: string | null;
	preview_type?: string;
	released_at?: string | null;
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

export type Attachment = { name: string; path: string; type: string; size: number };
export type Message = { id: string; collab_id: string; sender: 'creator' | 'brand'; body: string; created_at: string; attachments?: Attachment[]; auto?: boolean };
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
	qr_id?: string | null;
	retainer_month?: string | null;
	contact_name: string;
	contact_email: string;
	contact_phone: string;
	type: CollabType;
	stage: Stage;
	lifecycle_reason?: string;
	resume_on?: string | null;
	resume_stage?: Stage | null;
	paused_at?: string | null;
	cancelled_at?: string | null;
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
	/** How the brand runs paid ads with her content, and the partnership-ad code she shared. */
	ad_how?: '' | 'partnership' | 'access' | 'repost';
	ad_code?: string;
	ad_code_at?: string | null;
	territory?: string;
	/** What the exclusivity covers (a category or named competitors). */
	excl_scope?: string;
	counter_fee: number | null;
	counter_status: '' | 'sent' | 'taken' | 'kept';
	shoot_date: string | null;
	track_token: string;
	track_sent_at: string | null;
	brief_asked_at: string | null;
	live_time: string | null;
	post_alert_at: string | null;
	shot_list: { t: string; done: boolean }[];
	/** The language(s) the content is in: "Kannada", "English + Kannada", or '' for no preference. */
	content_language: string;
	/** Returning-brand discount (%) on this collab. */
	loyalty_pct: number;
	wrapped_at: string | null;
	rebook_sent_at: string | null;
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
	/** How long people watch a reel on average (ms). */
	avg_watch_ms?: number | null;
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
	/** Audience health and brand safety (what brands see), worked out by the nightly sync. */
	health?: Health | Record<string, never>;
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
	/** The collab's tracked link: taps, and orders from the promo code (when there is one). */
	link?: { clicks: number; promo_code: string; sales: number | null; revenue: number | null };
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
	/** Phone reminders about money still to come in, at these hours (India time). */
	pay_alerts?: boolean;
	pay_alert_hours?: number[];
	/** Fun nudges through the day (India time hours; the evening slot, her hobby, 0 = off). */
	fun_nudges?: boolean;
	fun_from?: number;
	fun_to?: number;
	fun_yoga_hour?: number;
	/** What the evening slot is about ("yoga", "the gym", "a walk"); '' = a stretch break. */
	fun_hobby?: string;
	fun_food?: boolean;
	/** Pitch autopilot: on, how pitches go out, how many new brands a day (1 to 10). */
	pitch_auto?: boolean;
	pitch_mode?: 'approve' | 'auto';
	pitch_daily?: number;
	page_card_v?: number;
	page_card_sig?: string;
	accepting: boolean;
	/** Listed in Discover, where brands on Miracle look for creators. */
	listed?: boolean;
	/** Also in the public creator directory on the website (www.miracleapp.live/creators), for anyone and search engines. */
	directory_listed?: boolean;
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
	/** Her usual payment terms for new quotes (Settings › Invoices & payments). */
	terms_advance_pct?: number;
	terms_pay_days?: number;
	terms_wait_advance?: boolean;
	/** Udyam (MSME) registration: late buyers then owe interest after 45 days. */
	udyam_no?: string;
	/** Her "about" line on her page and in link previews. */
	bio?: string;
	comment_dm_mode?: 'off' | 'ask' | 'auto';
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
	content_languages: string[];
	instant_booking: boolean;
	away_until: string | null;
	away_note: string;
	away_contact: string;
	rebook_offer: boolean;
	rebook_pct: number;
	rebook_days: number;
	demand_pricing: boolean;
	demand_pct: number;
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
	/** Her email list: the sign-up box on her page, and its one line. */
	fan_list_on?: boolean;
	fan_list_pitch?: string;
	/** Alerts when a brand opens a brief that fits her (Pitches > Open briefs). */
	brief_alerts?: boolean;
	/** Growth autopilot: ask before adding the week's reel ideas to the Calendar, or add them straight away. */
	grow_mode?: 'ask' | 'auto';
	/** Other creators can invite her to a collab reel. */
	collab_invites?: boolean;
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
	/** From page_extras(): the languages she creates in, instant booking, and its open weeks. */
	content_languages?: string[];
	instant_booking?: boolean;
	weeks?: { start: string; status: 'open' | 'limited' | 'full' | 'away' }[] | null;
	away_until?: string | null;
	/** Package prices are multiplied by this when her coming weeks are nearly full. */
	demand_factor?: number;
	/** Her "about" line. */
	bio?: string | null;
	/** Her links for followers, and the sign-up box for her email list (null when it's off). */
	links?: { id: string; title: string; url: string }[];
	/** Case studies the brands approved. */
	cases?: import('./caseStudy').PublicCase[];
	fan_list?: { pitch: string | null } | null;
	/** Creator Pro: her page without "Made with Miracle". */
	white_label?: boolean;
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

/** A creator's request to join Miracle, while it waits for approval (or after it was declined). */
export type CreatorRequest = {
	id: number;
	slug: string;
	status: 'pending' | 'declined';
	name: string;
	handle: string;
	niche: string;
	city: string;
	note: string;
	requested_at: string | null;
	whatsapp?: string;
	languages?: string[];
	signup?: { followers?: string; collabs?: string; heard?: string; niches?: string[] };
};

/** The company a brand gave at sign-up, before working with any creator. */
export type BrandProfile = {
	name: string;
	category: string;
	website: string;
	instagram: string;
	role: string;
	city: string;
	goals: string[];
	legal_name: string;
	gstin: string;
};

/** An account on its way out: deleted and waiting 30 days, closed by Miracle, or paused after reports. */
export type Closing = { kind: 'creator' | 'brand'; state: 'deleting' | 'closed' | 'paused'; name: string; erase_after?: string; owner: boolean };

export type Account = (
	/** needs_link: approved, but hasn't picked name.miracleapp.live yet. */
	| { role: 'creator'; email: string; slug?: string | null; needs_link?: boolean; name?: string; handle?: string }
	/** Asked to join as a creator and not approved yet. */
	| { role: 'pending'; email: string; request: CreatorRequest | null }
	| {
			role: 'brand';
			email: string;
			full_name: string;
			phone: string;
			brand: { id: string; name: string; instagram: string; website: string; category: string } | null;
			/** This creator's brands this login manages (agencies have several). */
			brands: { id: string; name: string }[];
			/** Companies this login has with other creators, to reuse on a first request here. */
			companies?: { id: string; name: string }[];
			/** The company given at sign-up (app.miracleapp.live/signup). */
			profile?: BrandProfile | null;
			/** Every creator this login works with. */
			creators?: BrandCreator[];
	  }
) & { closing?: Closing | null };

/** A creator as a brand sees them: public page facts, plus how much is going on together. */
export type BrandCreator = {
	id: number;
	slug: string;
	name: string;
	niche: string;
	city: string;
	accepting: boolean;
	photo: string | null;
	followers: number | null;
	engagement: number | null;
	handle?: string;
	/** What they make (Reel, Story...) and the languages they create in. */
	kinds?: string[];
	languages?: string[];
	avg_views?: number | null;
	/** Audience health and brand safety, from her Instagram (only when connected). */
	health?: Health | null;
	current?: boolean;
	open?: number;
	waiting?: number;
	done?: number;
};

/** A brand's saved group of creators (with invited Instagram handles of creators not on Miracle yet). */
export type PoolMember = { id: string; handle: string; note: string; tags: string[]; joined: boolean; creator: BrandCreator | null };
export type Pool = { id: string; name: string; created_at: string; members: PoolMember[] };

/** One brief for many creators: what submit_request takes. fee is per creator (0 = ask for a quote). */
export type CampaignBrief = {
	type: CollabType;
	deliverables: { kind: string; qty: number }[];
	fee: number;
	product: string;
	product_value: number;
	barter_kind: 'product' | 'experience';
	content_language: string[];
	preferred_live: string | null;
	usage: string;
	brief: string;
	brief_details: BriefDetails;
};
export type CampaignSummary = {
	id: string;
	name: string;
	status: 'draft' | 'sent';
	created_at: string;
	sent_at: string | null;
	budget_total: number;
	brief: Partial<CampaignBrief>;
	creators: number;
	agreed: number;
	waiting: number;
	/** Open to applications right now, until open_until. */
	open?: boolean;
	open_until?: string | null;
	applications?: number;
	new_applications?: number;
};
export type CampaignQuote = { id: string; total: number; currency: string; status: 'sent' | 'accepted' | 'changes'; items: { kind: string; qty: number; rate: number }[]; version: number };
export type CampaignRow = {
	id: string;
	handle: string;
	status: 'sent' | 'invited' | 'failed';
	note: string;
	joined: boolean;
	creator: BrandCreator | null;
	code: string | null;
	stage: Stage | null;
	stage_label: string | null;
	fee: number | null;
	live_date: string | null;
	draft_date: string | null;
	pay_status: string | null;
	quote: CampaignQuote | null;
	draft_pending: boolean;
};
export type CampaignBoard = {
	campaign: {
		id: string;
		name: string;
		status: 'draft' | 'sent';
		pool_id: string | null;
		brief: Partial<CampaignBrief>;
		budget_total: number;
		created_at: string;
		sent_at: string | null;
		company: string | null;
		/** Open brief: listed creators can apply until open_until, within budget_min to budget_max per creator. */
		open?: boolean;
		open_until?: string | null;
		budget_min?: number;
		budget_max?: number;
		applications?: number;
		rules?: BriefRules;
	};
	rows: CampaignRow[];
};

/** Everything across every creator a brand works with. */
export type BrandDashboard = {
	name: string | null;
	open: number;
	spent_month: number;
	to_pay: number;
	waiting: { kind: 'quote' | 'draft'; code: string; slug: string; creator: string; amount?: number; currency?: string; round?: number; live_date?: string | null }[];
	live_soon: { code: string; slug: string; creator: string; live_date: string }[];
	creators: BrandCreator[];
};

export type BrandRequest = {
	lifecycle_reason?: string;
	resume_on?: string | null;
	content_language?: string;
	/** An experience (stay, meal, event) is never shipped. */
	barter_kind?: 'product' | 'experience';
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
	deliverables: { kind: string; qty: number; done: boolean; items?: Pick<DeliverableItem, 'position' | 'status' | 'due_date'>[] }[];
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

/** A branded QR code: its own short link, with a scan count. */
export type QrCode = {
	id: string;
	slug: string;
	name: string;
	dest: 'page' | 'request';
	style: Record<string, unknown>;
	scans: number;
	last_scan_at: string | null;
	created_at: string;
};

/** A creator's audience as shares (from what they share from Instagram). */
export type Audience = { women: number | null; age: Record<string, number>; cities: { name: string; pct: number }[] };

/** A creator as Discover sees them: the card, their audience, rates and history with this brand. */
export type DiscoverCreator = BrandCreator & {
	listed: boolean;
	audience: Audience | null;
	rates: Record<string, number> | null;
	with_me: { collabs: number; wrapped: number; fees: number; views: number };
	rating: CreatorRating | null;
	/** Her record on Miracle: paid deals, posts on time, how fast she answers. */
	trust?: { deals: number; posted: number; on_time: number; reply_hours: number | null } | null;
};
/** The brand's private rating of a creator (creators never see it). */
export type CreatorRating = { on_time: number; quality: number; results: number; note: string; updated_at: string };

/** One creator's application to an open brief, as the brand sees it. */
export type CampaignApplication = BrandCreator & {
	application: string;
	rate: number;
	note: string;
	status: 'new' | 'shortlist' | 'no' | 'sent';
	applied_at: string;
	audience: Audience | null;
	rates: Record<string, number> | null;
};

/** An open brief, as a creator sees it. */
/** Who can apply to an open brief (empty = anyone). */
export type BriefRules = { min_followers?: number; max_followers?: number; niches?: string[]; languages?: string[]; cities?: string[] };

export type OpenBrief = {
	id: string;
	name: string;
	brand: string;
	category: string;
	instagram: string;
	verified: boolean;
	brief: Partial<CampaignBrief>;
	budget_min: number;
	budget_max: number;
	open_until: string;
	applied: number;
	mine: { id: string; rate: number; note: string; status: 'new' | 'shortlist' | 'sent' } | null;
	rules?: BriefRules;
	/** Does she fit the rules, and if not, what she's missing. */
	fit?: { ok: boolean; misses: string[] };
};

/** One request in the brand's list across every creator (and its inbox row). */
export type BrandRow = {
	id: string;
	code: string;
	stage: Stage;
	stage_label: string;
	type: CollabType;
	fee: number;
	product_value: number;
	received_on: string;
	live_date: string | null;
	pay_status: PayStatus;
	deliverables: string | null;
	creator: { id: number; name: string; slug: string; photo: string | null };
	/** What waits on the brand: a quote to answer, a draft to approve, an invoice to pay. */
	needs: 'quote' | 'draft' | 'pay' | null;
	quote_total: number | null;
	quote_currency: string | null;
	invoice_due: string | null;
	invoice_amount: number | null;
	unread: number;
	last: { body: string; sender: 'brand' | 'creator'; at: string } | null;
};
