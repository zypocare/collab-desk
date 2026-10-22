export type Status = 'pending' | 'active' | 'paused' | 'declined';

export type Overview = {
	creators: Partial<Record<Status, number>> | null;
	brands: number;
	brand_logins: number;
	collabs: number;
	collabs_this_month: number;
	paid_total: number;
	paid_this_month: number;
	emails_today: number;
	emails_failed: number;
	pending: number;
};

export type Creator = {
	id: number;
	/** null: signed up at app.miracleapp.live and picks a link after approval. */
	slug: string | null;
	name: string;
	handle: string;
	niche: string;
	city: string;
	email: string;
	note: string;
	status: Status;
	requested_at: string | null;
	approved_at: string | null;
	created_at: string | null;
	collabs: number;
	brands: number;
	paid: number;
	team: number;
	instagram: boolean;
	last_active: string | null;
	whatsapp?: string;
	languages?: string[];
	signup?: { followers?: string; collabs?: string; heard?: string };
};

export type Brand = {
	id: string;
	name: string;
	category: string | null;
	instagram: string | null;
	website: string | null;
	creator: { id: number; slug: string; name: string };
	collabs: number;
	paid: number;
	logins: number;
	last_collab: string | null;
	created_at: string | null;
};

export type Problem = {
	id: number;
	source: 'app' | 'server' | 'jobs';
	message: string;
	place: string;
	status: 'open' | 'fixed' | 'ignored';
	release: string;
	first_seen: string;
	last_seen: string;
	new: boolean;
	device: string | null;
	times: number;
	people: number;
	/** How many times each of the last 7 days, oldest first. */
	days: number[];
};
export type Problems = { release: string | null; new_today: number; open: number; fixed: number; ignored: number; people: number; visits: number; list: Problem[] };
export type ProblemDetail = Omit<Problem, 'new' | 'device' | 'people' | 'days'> & {
	sample: { stack?: string; steps?: string[]; device?: string; place?: string; ref?: string };
	events: { ref: string; at: string; who: string; device: string; place: string; release: string; note: string }[];
	notes: { ref: string; at: string; who: string; device: string; note: string }[];
};

export type SafetyTarget = {
	key: string;
	kind: 'brand' | 'creator';
	name: string;
	open: boolean;
	last: string;
	reports: number;
	people: number;
	reason: string;
	auto_paused: boolean;
	state: string | null;
	about: { email?: string; joined?: string; instagram?: boolean; requests_2d?: number; slug?: string } | null;
	items: { id: string; by: string; side: string; reason: string; details: string; at: string; status: string; outcome: string }[];
};
export type Safety = {
	targets: SafetyTarget[];
	hits: { kind: string; who: string; n: number; last: string }[];
	limits: { key: string; new: number; trusted: number | null }[];
};
