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
