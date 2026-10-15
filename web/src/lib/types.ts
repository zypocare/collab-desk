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

export type BrandPrivate = { brand_id: string; notes: string; competitors: string[] };

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
};

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
	worked_with: string[];
};

export type Account =
	| { role: 'creator'; email: string }
	| {
			role: 'brand';
			email: string;
			full_name: string;
			phone: string;
			brand: { id: string; name: string; instagram: string; website: string; category: string } | null;
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
