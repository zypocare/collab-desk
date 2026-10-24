// What each list screen shows: its columns, the preset tabs, the filter menus and the actions on rows.
// The rows come from admin_list(kind, ...); every key below is a field of those rows.
import { errMessage, supabase } from '../supabase.ts';
import { ask, askText, toast } from '../ui.svelte.ts';
import { href } from '../router.svelte.ts';
import { STAGE_LABEL, STAGE_TAG, STATUS_LABEL, STATUS_TAG, label } from '../format.ts';

export type Row = Record<string, any>;
export type Col = {
	key: string;
	label: string;
	type?: 'text' | 'num' | 'money' | 'compact' | 'ago' | 'day' | 'when' | 'tag' | 'bool' | 'mono';
	/** Second line under the value (another key of the row). */
	sub?: string;
	/** For type tag: the words and colour for a value. */
	tag?: (v: any, row: Row) => [string, string];
	/** Plain text instead of the value. */
	text?: (row: Row) => string;
	/** A link for this cell (the first column links to the record by default). */
	link?: (row: Row) => string | null;
	nosort?: boolean;
	wrap?: boolean;
};
export type Preset = { id: string; label: string; filters: Record<string, unknown> };
export type FilterDef = { key: string; label: string; options: { label: string; value: unknown }[] };
export type Action = { label: string; danger?: boolean; show?: (row: Row) => boolean; run: (rows: Row[]) => Promise<boolean | void> };
export type ListConfig = {
	id: string;
	kind: string;
	group: string;
	title: string;
	noun: string;
	search: string;
	/** Filters always on for this screen (Sign-ups is the creators list, waiting only). */
	base?: Record<string, unknown>;
	presets: Preset[];
	filters: FilterDef[];
	columns: Col[];
	sort: string;
	desc?: boolean;
	href?: (row: Row) => string | null;
	bulk?: Action[];
	rowActions?: Action[];
	/** A button by the title that makes a new record (for example a ban). */
	create?: { label: string; run: () => Promise<boolean | void> };
};

const status = (v: string): [string, string] => [STATUS_LABEL[v] ?? label(v), STATUS_TAG[v] ?? 't-mute'];
const yes = (on: string, off: string) => (v: boolean): [string, string] => (v ? [on, 't-ok'] : [off, 't-mute']);
const DAYS = (key: string, name: string): FilterDef => ({
	key: `${key}:gte`,
	label: name,
	options: [{ label: 'Last 7 days', value: 'days:7' }, { label: 'Last 30 days', value: 'days:30' }, { label: 'Last 90 days', value: 'days:90' }]
});

// Approve, decline, pause or bring back creators, one by one (each logs and emails as it does in the app).
async function setCreators(rows: Row[], to: 'active' | 'paused' | 'declined', verb: string) {
	const who = rows.length === 1 ? rows[0].name || rows[0].email : `${rows.length} creators`;
	const body =
		to === 'active'
			? 'Anyone waiting gets the welcome email with a link to their studio. Paused creators open for brands again.'
			: to === 'declined'
				? 'They get a kind email saying it isn\'t approved for now. They can ask again.'
				: 'Their page stops taking requests. Their data stays; you can bring them back any time.';
	if (!(await ask({ title: `${verb} ${who}?`, body, ok: verb, danger: to !== 'active' }))) return false;
	let done = 0;
	for (const r of rows) {
		// A declined request is approved the same way as a new one, so the welcome email still goes out.
		if (to === 'active' && r.status === 'declined') {
			const { error } = await supabase.rpc('admin_set_creator', { p_id: r.id, p_status: 'pending' });
			if (error) {
				toast(errMessage(error), true);
				continue;
			}
		}
		const { error } = await supabase.rpc('admin_set_creator', { p_id: r.id, p_status: to });
		if (error) toast(`${r.name || r.email}: ${errMessage(error)}`, true);
		else done++;
	}
	if (done) toast(`${verb}: ${done} creator${done === 1 ? '' : 's'}`);
	return done > 0;
}

const creatorCols: Col[] = [
	{ key: 'name', label: 'Creator', sub: 'email', text: (r) => r.name || r.email },
	{ key: 'status', label: 'Status', type: 'tag', tag: status },
	{ key: 'slug', label: 'Page', type: 'mono', text: (r) => (r.slug ? `${r.slug}.miracleapp.live` : '—') },
	{ key: 'niche', label: 'Niche · city', text: (r) => [r.niche, r.city].filter(Boolean).join(' · ') || '—' },
	{ key: 'followers', label: 'Followers', type: 'compact' },
	{ key: 'collabs', label: 'Collabs', type: 'num' },
	{ key: 'open_collabs', label: 'Open', type: 'num' },
	{ key: 'paid', label: 'Paid to them', type: 'money' },
	{ key: 'instagram', label: 'Instagram', type: 'tag', tag: yes('Linked', 'Not linked') },
	{ key: 'directory', label: 'Directory', type: 'tag', tag: yes('Listed', 'No') },
	{ key: 'last_active', label: 'Last active', type: 'ago' },
	{ key: 'joined', label: 'Joined', type: 'day' }
];

// An action that asks why (for the audit trail), calls one admin function per row, and says how it went.
function withReason(title: string, body: string, ok: string, fn: string, args: (r: Row, reason: string) => Record<string, unknown>, done: string, danger = true) {
	return async (rows: Row[]) => {
		const reason = await askText({ title: rows.length > 1 ? `${title} (${rows.length})` : title, body, ok, danger, input: { label: 'Why (for the audit trail)', required: true } });
		if (reason === null) return false;
		let n = 0;
		for (const r of rows) {
			const { error } = await supabase.rpc(fn, args(r, reason));
			if (error) toast(errMessage(error), true);
			else n++;
		}
		if (n) toast(done);
		return n > 0;
	};
}
const stage = (v: string): [string, string] => [STAGE_LABEL[v] ?? label(v), STAGE_TAG[v] ?? 't-mute'];
const plain = (map: Record<string, string>) => (v: string): [string, string] => [label(v), map[v] ?? 't-mute'];
const collabLink = (r: Row) => (r.collab_id ? href('collabs', r.collab_id) : null);
const creatorLink = (r: Row) => (r.creator_id ? href('creators', r.creator_id) : null);
const STAGES = ['request', 'negotiating', 'confirmed', 'creating', 'live', 'wrapped', 'paused', 'cancelled', 'declined'];
const PAY = ['pending', 'advance', 'invoiced', 'paid', 'na'];
const INVOICE_TAG: Record<string, string> = { paid: 't-ok', partly_paid: 't-warn', sent: 't-info', draft: 't-mute', cancelled: 't-bad' };
const QUOTE_TAG: Record<string, string> = { accepted: 't-ok', sent: 't-info', changes: 't-warn', declined: 't-bad', draft: 't-mute', expired: 't-mute' };
const POST_TAG: Record<string, string> = { scheduled: 't-info', publishing: 't-acc', published: 't-ok', failed: 't-bad', cancelled: 't-mute', on_hold: 't-warn' };
const DRAFT_TAG: Record<string, string> = { pending: 't-warn', approved: 't-ok', changes: 't-bad', draft: 't-mute' };

const DEALS: Record<string, ListConfig> = {
	brands: {
		id: 'brands', kind: 'brands', group: 'Deals', title: 'Brands', noun: 'brand', search: 'Brand, category, creator, Instagram, email',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'active', label: 'With open collabs', filters: { 'open:gte': 1 } },
			{ id: 'paid', label: 'Have paid', filters: { 'paid:gte': 1 } },
			{ id: 'logins', label: 'With a brand login', filters: { 'logins:gte': 1 } },
			{ id: 'none', label: 'No collabs', filters: { collabs: 0 } }
		],
		filters: [{ key: 'gst', label: 'GSTIN', options: [{ label: 'On file', value: true }, { label: 'Missing', value: false }] }, DAYS('created', 'Added')],
		columns: [
			{ key: 'name', label: 'Brand', sub: 'category' },
			{ key: 'creator', label: 'In studio of', link: creatorLink },
			{ key: 'collabs', label: 'Collabs', type: 'num' },
			{ key: 'open', label: 'Open', type: 'num' },
			{ key: 'paid', label: 'Paid', type: 'money' },
			{ key: 'logins', label: 'Logins', type: 'num' },
			{ key: 'last_collab', label: 'Last collab', type: 'ago' },
			{ key: 'created', label: 'Added', type: 'day' }
		],
		sort: 'created',
		href: (r) => href('brands', r.id)
	},
	collabs: {
		id: 'collabs', kind: 'collabs', group: 'Deals', title: 'Collabs', noun: 'collab', search: 'Code, brand, creator, contact email, product',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'open', label: 'Open', filters: { stage: ['request', 'negotiating', 'confirmed', 'creating', 'live'] } },
			{ id: 'requests', label: 'New requests', filters: { stage: 'request' } },
			{ id: 'unpaid', label: 'Live, not paid', filters: { stage: ['live', 'wrapped'], pay: ['pending', 'advance', 'invoiced'] } },
			{ id: 'held', label: 'Paused or cancelled', filters: { stage: ['paused', 'cancelled'] } }
		],
		filters: [
			{ key: 'stage', label: 'Stage', options: STAGES.map((v) => ({ label: STAGE_LABEL[v], value: v })) },
			{ key: 'pay', label: 'Pay', options: PAY.map((v) => ({ label: label(v), value: v })) },
			{ key: 'type', label: 'Type', options: ['paid', 'barter', 'hybrid'].map((v) => ({ label: label(v), value: v })) },
			{ key: 'source', label: 'Came from', options: ['brand_page', 'manual', 'email', 'retainer'].map((v) => ({ label: label(v), value: v })) },
			DAYS('created', 'Started')
		],
		columns: [
			{ key: 'code', label: 'Collab', type: 'mono' },
			{ key: 'brand', label: 'Brand', link: (r) => (r.brand_id ? href('brands', r.brand_id) : null) },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'stage', label: 'Stage', type: 'tag', tag: stage },
			{ key: 'pay', label: 'Pay', type: 'tag', tag: plain({ paid: 't-ok', advance: 't-info', invoiced: 't-warn' }) },
			{ key: 'fee', label: 'Fee', type: 'money' },
			{ key: 'received', label: 'Received', type: 'money' },
			{ key: 'messages', label: 'Messages', type: 'num' },
			{ key: 'live', label: 'Live date', type: 'day' },
			{ key: 'updated', label: 'Updated', type: 'ago' },
			{ key: 'created', label: 'Started', type: 'day' }
		],
		sort: 'created',
		href: (r) => href('collabs', r.id)
	},
	quotes: {
		id: 'quotes', kind: 'quotes', group: 'Deals', title: 'Quotes', noun: 'quote', search: 'Collab, brand, creator, who accepted',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'sent', label: 'Waiting on brand', filters: { status: 'sent' } },
			{ id: 'accepted', label: 'Accepted', filters: { status: 'accepted' } },
			{ id: 'changes', label: 'Changes asked', filters: { status: 'changes' } }
		],
		filters: [{ key: 'status', label: 'Status', options: Object.keys(QUOTE_TAG).map((v) => ({ label: label(v), value: v })) }, DAYS('created', 'Made')],
		columns: [
			{ key: 'code', label: 'Collab', type: 'mono', text: (r) => `${r.code} v${r.version}` },
			{ key: 'brand', label: 'Brand' },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'total', label: 'Total', type: 'money' },
			{ key: 'status', label: 'Status', type: 'tag', tag: plain(QUOTE_TAG) },
			{ key: 'advance_pct', label: 'Advance', text: (r) => (r.advance_pct ? r.advance_pct + '%' : '—') },
			{ key: 'sent_at', label: 'Sent', type: 'ago' },
			{ key: 'responded_at', label: 'Answered', type: 'ago' },
			{ key: 'accepted_by', label: 'Accepted by', text: (r) => r.accepted_by || '—' }
		],
		sort: 'created',
		href: collabLink
	},
	invoices: {
		id: 'invoices', kind: 'invoices', group: 'Deals', title: 'Invoices', noun: 'invoice', search: 'Invoice number, collab, brand, creator, billed email',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'open', label: 'Waiting to be paid', filters: { status: ['sent', 'partly_paid'] } },
			{ id: 'overdue', label: 'Overdue', filters: { overdue: true } },
			{ id: 'paid', label: 'Paid', filters: { status: 'paid' } },
			{ id: 'noremind', label: 'Reminders off', filters: { reminders: false, status: ['sent', 'partly_paid'] } }
		],
		filters: [
			{ key: 'status', label: 'Status', options: Object.keys(INVOICE_TAG).map((v) => ({ label: label(v), value: v })) },
			{ key: 'kind', label: 'Kind', options: ['advance', 'balance', 'full'].map((v) => ({ label: label(v), value: v })) },
			DAYS('created', 'Made')
		],
		columns: [
			{ key: 'number', label: 'Invoice', type: 'mono', sub: 'code' },
			{ key: 'brand', label: 'Brand' },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'kind', label: 'Kind', text: (r) => label(r.kind) },
			{ key: 'total', label: 'Total', type: 'money' },
			{ key: 'outstanding', label: 'Outstanding', type: 'money' },
			{ key: 'status', label: 'Status', type: 'tag', tag: (v, r) => (r.overdue ? ['Overdue', 't-bad'] : plain(INVOICE_TAG)(v)) },
			{ key: 'due', label: 'Due', type: 'day' },
			{ key: 'reminders', label: 'Reminders', type: 'tag', tag: yes('On', 'Off') },
			{ key: 'paid_on', label: 'Paid on', type: 'day' }
		],
		sort: 'created',
		href: collabLink,
		rowActions: [
			{
				label: 'Stop reminders',
				show: (r) => r.reminders && (r.status === 'sent' || r.status === 'partly_paid'),
				run: withReason('Stop payment reminders?', 'The brand stops getting the polite reminder emails for this invoice. The creator can turn them back on.', 'Stop reminders', 'admin_invoice_reminders', (r, why) => ({ p_id: r.id, p_on: false, p_reason: why }), 'Reminders off', false)
			}
		]
	},
	payments: {
		id: 'payments', kind: 'payments', group: 'Deals', title: 'Payments', noun: 'bank alert', search: 'Payer, reference, invoice, creator, amount',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'matched', label: 'Matched to an invoice', filters: { status: 'matched' } },
			{ id: 'unmatched', label: 'Not matched', filters: { status: 'unmatched' } },
			{ id: 'ignored', label: 'Set aside', filters: { status: 'ignored' } }
		],
		filters: [DAYS('created', 'Received')],
		columns: [
			{ key: 'created', label: 'Received', type: 'when' },
			{ key: 'amount', label: 'Amount', type: 'money' },
			{ key: 'sender', label: 'From' },
			{ key: 'ref', label: 'Reference', type: 'mono' },
			{ key: 'status', label: 'Status', type: 'tag', tag: plain({ matched: 't-ok', unmatched: 't-warn', ignored: 't-mute' }) },
			{ key: 'invoice', label: 'Invoice', type: 'mono', link: collabLink },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'note', label: 'Note', wrap: true, nosort: true }
		],
		sort: 'created',
		href: () => null,
		rowActions: [
			{
				label: 'Set aside',
				show: (r) => r.status === 'unmatched',
				run: withReason('Set this bank alert aside?', 'It stops showing as a payment waiting to be matched. Nothing is sent to anyone.', 'Set aside', 'admin_bank_alert_ignore', (r, why) => ({ p_id: r.id, p_reason: why }), 'Set aside', false)
			}
		]
	},
	drafts: {
		id: 'drafts', kind: 'drafts', group: 'Deals', title: 'Drafts', noun: 'draft', search: 'Collab, brand, creator',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'pending', label: 'Waiting on brand', filters: { status: 'pending' } },
			{ id: 'slow', label: 'Waiting 3+ days', filters: { status: 'pending', 'waiting_days:gte': 3 } },
			{ id: 'approved', label: 'Approved', filters: { status: 'approved' } }
		],
		filters: [{ key: 'status', label: 'Status', options: Object.keys(DRAFT_TAG).map((v) => ({ label: label(v), value: v })) }, DAYS('created', 'Sent')],
		columns: [
			{ key: 'code', label: 'Collab', type: 'mono', text: (r) => `${r.code} · round ${r.round}` },
			{ key: 'brand', label: 'Brand' },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'status', label: 'Status', type: 'tag', tag: plain(DRAFT_TAG) },
			{ key: 'comments', label: 'Comments', type: 'num' },
			{ key: 'submitted_at', label: 'Sent', type: 'ago' },
			{ key: 'responded_at', label: 'Answered', type: 'ago' }
		],
		sort: 'created',
		href: collabLink
	},
	posts: {
		id: 'posts', kind: 'posts', group: 'Deals', title: 'Scheduled posts', noun: 'post', search: 'Collab, brand, creator, error',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'scheduled', label: 'Scheduled', filters: { status: 'scheduled' } },
			{ id: 'failed', label: 'Failed', filters: { status: 'failed' } },
			{ id: 'hold', label: 'On hold', filters: { status: 'on_hold' } },
			{ id: 'published', label: 'Published', filters: { status: 'published' } }
		],
		filters: [DAYS('created', 'Made')],
		columns: [
			{ key: 'publish_at', label: 'Goes out', type: 'when' },
			{ key: 'code', label: 'Collab', type: 'mono' },
			{ key: 'brand', label: 'Brand' },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'status', label: 'Status', type: 'tag', tag: plain(POST_TAG) },
			{ key: 'error', label: 'Error', wrap: true, nosort: true },
			{ key: 'permalink', label: 'Post', nosort: true, text: (r) => (r.permalink ? 'Open' : '—'), link: (r) => r.permalink ?? null }
		],
		sort: 'publish_at',
		href: collabLink,
		rowActions: [
			{
				label: 'Cancel',
				danger: true,
				show: (r) => ['scheduled', 'on_hold', 'failed'].includes(r.status),
				run: withReason('Cancel this post?', "It won't be published. The creator sees it as cancelled by Miracle, with your reason.", 'Cancel post', 'admin_post_cancel', (r, why) => ({ p_id: r.id, p_reason: why }), 'Post cancelled')
			}
		]
	},
	campaigns: {
		id: 'campaigns', kind: 'campaigns', group: 'Deals', title: 'Campaigns', noun: 'campaign', search: 'Campaign, workspace, owner email',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'open', label: 'Open briefs', filters: { open: true } },
			{ id: 'sent', label: 'Sent', filters: { status: 'sent' } },
			{ id: 'draft', label: 'Drafts', filters: { status: 'draft' } }
		],
		filters: [DAYS('created', 'Made')],
		columns: [
			{ key: 'name', label: 'Campaign', sub: 'workspace' },
			{ key: 'status', label: 'Status', type: 'tag', tag: (v, r) => (r.open ? ['Open brief', 't-ok'] : plain({ sent: 't-info' })(v)) },
			{ key: 'budget', label: 'Budget', type: 'money' },
			{ key: 'creators', label: 'Creators', type: 'num' },
			{ key: 'applications', label: 'Applied', type: 'num' },
			{ key: 'collabs', label: 'Collabs', type: 'num' },
			{ key: 'open_until', label: 'Open until', type: 'day' },
			{ key: 'created', label: 'Made', type: 'day' }
		],
		sort: 'created',
		href: (r) => href('campaigns', r.id)
	},
	pools: {
		id: 'pools', kind: 'pools', group: 'Deals', title: 'Pools', noun: 'pool', search: 'Pool, workspace',
		presets: [{ id: 'all', label: 'All', filters: {} }, { id: 'used', label: 'Used in a campaign', filters: { 'campaigns:gte': 1 } }],
		filters: [DAYS('created', 'Made')],
		columns: [
			{ key: 'name', label: 'Pool' },
			{ key: 'workspace', label: 'Workspace', link: (r) => href('workspaces', r.workspace_id) },
			{ key: 'creators', label: 'Creators', type: 'num' },
			{ key: 'on_miracle', label: 'On Miracle', type: 'num' },
			{ key: 'campaigns', label: 'Campaigns', type: 'num' },
			{ key: 'created', label: 'Made', type: 'day' }
		],
		sort: 'created',
		href: (r) => href('workspaces', r.workspace_id)
	},
	retainers: {
		id: 'retainers', kind: 'retainers', group: 'Deals', title: 'Retainers', noun: 'retainer', search: 'Title, brand, creator, contact',
		presets: [{ id: 'all', label: 'All', filters: {} }, { id: 'active', label: 'Running', filters: { active: true } }, { id: 'stopped', label: 'Stopped', filters: { active: false } }],
		filters: [DAYS('created', 'Made')],
		columns: [
			{ key: 'title', label: 'Retainer' },
			{ key: 'brand', label: 'Brand', link: (r) => (r.brand_id ? href('brands', r.brand_id) : null) },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'fee', label: 'Fee a month', type: 'money' },
			{ key: 'months', label: 'Months', type: 'num' },
			{ key: 'starts_on', label: 'Starts', type: 'day' },
			{ key: 'collabs', label: 'Collabs made', type: 'num' },
			{ key: 'active', label: 'State', type: 'tag', tag: yes('Running', 'Stopped') }
		],
		sort: 'created',
		href: creatorLink,
		rowActions: [
			{
				label: 'Stop',
				danger: true,
				show: (r) => r.active,
				run: withReason('Stop this retainer?', 'No new monthly collabs are made from it. Existing collabs stay.', 'Stop', 'admin_retainer_set', (r, why) => ({ p_id: r.id, p_active: false, p_reason: why }), 'Retainer stopped')
			}
		]
	},
	pitches: {
		id: 'pitches', kind: 'pitches', group: 'Deals', title: 'Pitches', noun: 'pitch', search: 'Brand, category, email, creator',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'sent', label: 'Sent', filters: { status: 'sent' } },
			{ id: 'replied', label: 'Replied', filters: { status: ['replied', 'won'] } },
			{ id: 'following', label: 'Following up', filters: { auto_follow: true, status: 'sent' } }
		],
		filters: [
			{ key: 'status', label: 'Status', options: ['idea', 'ready', 'sent', 'replied', 'won', 'not_now', 'skipped'].map((v) => ({ label: label(v), value: v })) },
			DAYS('created', 'Found')
		],
		columns: [
			{ key: 'brand', label: 'Brand', sub: 'email' },
			{ key: 'creator', label: 'For creator', link: creatorLink },
			{ key: 'status', label: 'Status', type: 'tag', tag: plain({ sent: 't-info', replied: 't-ok', won: 't-ok', ready: 't-warn', skipped: 't-mute', not_now: 't-mute' }) },
			{ key: 'followups', label: 'Follow-ups', type: 'num' },
			{ key: 'auto_follow', label: 'Auto follow-up', type: 'tag', tag: yes('On', 'Off') },
			{ key: 'sent_at', label: 'Sent', type: 'ago' },
			{ key: 'replied_at', label: 'Replied', type: 'ago' },
			{ key: 'created', label: 'Found', type: 'day' }
		],
		sort: 'created',
		href: (r) => (r.collab_id ? href('collabs', r.collab_id) : creatorLink(r)),
		rowActions: [
			{
				label: 'Stop follow-ups',
				show: (r) => r.auto_follow,
				run: withReason('Stop follow-ups to this brand?', 'No more automatic follow-up emails go to them for this pitch.', 'Stop', 'admin_pitch_stop', (r, why) => ({ p_id: r.id, p_reason: why }), 'Follow-ups stopped', false)
			}
		]
	}
};

const OUTBOX_TAG: Record<string, string> = { sent: 't-ok', pending: 't-info', sending: 't-acc', failed: 't-bad', skipped: 't-mute' };
async function outbox(rows: Row[], action: 'retry' | 'skip') {
	const reason = await askText({
		title: action === 'retry' ? `Send ${rows.length === 1 ? 'this email' : rows.length + ' emails'} again?` : `Skip ${rows.length === 1 ? 'this email' : rows.length + ' emails'}?`,
		body: action === 'retry' ? 'They go back in the queue from the first try and the sender runs straight away.' : "They won't be sent. The reason is kept on each one.",
		ok: action === 'retry' ? 'Send again' : 'Skip',
		danger: action === 'skip',
		input: { label: action === 'retry' ? 'Note (optional)' : 'Why', required: action === 'skip' }
	});
	if (reason === null) return false;
	const { data, error } = await supabase.rpc('admin_outbox_set', { p_ids: rows.map((r) => r.id), p_action: action, p_reason: reason });
	if (error) {
		toast(errMessage(error), true);
		return false;
	}
	toast(`${data} email${data === 1 ? '' : 's'} ${action === 'retry' ? 'queued again' : 'skipped'}`);
	return true;
}
const accountLink = (r: Row) => (r.side === 'creator' ? href('creators', r.account_id) : href('workspaces', r.account_id));

const SYSTEM: Record<string, ListConfig> = {
	outbox: {
		id: 'outbox', kind: 'outbox', group: 'System', title: 'Emails & outbox', noun: 'email', search: 'Email kind, address, error, creator',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'failed', label: 'Failed', filters: { status: 'failed' } },
			{ id: 'pending', label: 'Waiting', filters: { status: ['pending', 'sending'] } },
			{ id: 'sent', label: 'Sent', filters: { status: 'sent' } },
			{ id: 'skipped', label: 'Skipped', filters: { status: 'skipped' } }
		],
		filters: [{ key: 'status', label: 'Status', options: Object.keys(OUTBOX_TAG).map((v) => ({ label: label(v), value: v })) }, DAYS('created', 'Queued')],
		columns: [
			{ key: 'created', label: 'Queued', type: 'when' },
			{ key: 'kind', label: 'Email', type: 'mono' },
			{ key: 'to', label: 'To' },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'status', label: 'Status', type: 'tag', tag: plain(OUTBOX_TAG) },
			{ key: 'attempts', label: 'Tries', type: 'num' },
			{ key: 'error', label: 'Error', wrap: true, nosort: true },
			{ key: 'sent_at', label: 'Sent', type: 'ago' }
		],
		sort: 'created',
		href: () => null,
		bulk: [
			{ label: 'Send again', show: (r) => r.status === 'failed' || r.status === 'skipped', run: (rows) => outbox(rows, 'retry') },
			{ label: 'Skip', danger: true, show: (r) => r.status === 'failed' || r.status === 'pending', run: (rows) => outbox(rows, 'skip') }
		],
		rowActions: [
			{ label: 'Send again', show: (r) => r.status === 'failed' || r.status === 'skipped', run: (rows) => outbox(rows, 'retry') },
			{ label: 'Skip', danger: true, show: (r) => r.status === 'failed' || r.status === 'pending', run: (rows) => outbox(rows, 'skip') }
		]
	},
	inbound: {
		id: 'inbound', kind: 'inbound', group: 'System', title: 'Inbound mail', noun: 'email', search: 'Sender, subject, action, creator, collab',
		presets: [{ id: 'all', label: 'All', filters: {} }],
		filters: [DAYS('created', 'Received')],
		columns: [
			{ key: 'created', label: 'Received', type: 'when' },
			{ key: 'sender', label: 'From' },
			{ key: 'subject', label: 'Subject', wrap: true },
			{ key: 'action', label: 'What happened', text: (r) => label(r.action) },
			{ key: 'code', label: 'Collab', type: 'mono', link: collabLink },
			{ key: 'creator', label: 'Creator', link: creatorLink }
		],
		sort: 'created',
		href: collabLink
	},
	'ai-usage': {
		id: 'ai-usage', kind: 'ai_usage', group: 'System', title: 'AI usage', noun: 'day', search: 'Account, kind of AI',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'today', label: 'Today', filters: { 'created:gte': 'days:1' } },
			{ id: 'heavy', label: 'Over half their share', filters: { 'share:gte': 50 } },
			{ id: 'gemini', label: 'Used Gemini backup', filters: { 'gemini:gte': 1 } },
			{ id: 'brands', label: 'Brands', filters: { side: 'workspace' } }
		],
		filters: [{ key: 'side', label: 'Side', options: [{ label: 'Creators', value: 'creator' }, { label: 'Brand workspaces', value: 'workspace' }] }, DAYS('created', 'Day')],
		columns: [
			{ key: 'day', label: 'Day', type: 'day' },
			{ key: 'account', label: 'Account', link: accountLink },
			{ key: 'side', label: 'Side', type: 'tag', tag: (v) => [v === 'creator' ? 'Creator' : 'Workspace', v === 'creator' ? 't-ok' : 't-info'] },
			{ key: 'calls', label: 'Calls', type: 'num' },
			{ key: 'cost', label: 'Units used', type: 'num' },
			{ key: 'share', label: 'Of daily share', text: (r) => (r.share !== undefined ? r.share + '%' : '—') },
			{ key: 'gemini', label: 'Gemini calls', type: 'num' },
			{ key: 'capped', label: 'Lower share', text: (r) => (r.capped !== undefined ? String(r.capped) : '—') },
			{ key: 'kinds', label: 'Used for', wrap: true, nosort: true }
		],
		sort: 'created',
		href: accountLink
	},
	instagram: {
		id: 'instagram', kind: 'instagram', group: 'System', title: 'Instagram', noun: 'account', search: 'Username, account, error',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'errors', label: 'With errors', filters: { 'error:gte': '' } },
			{ id: 'expiring', label: 'Login expiring in 7 days', filters: { expiring: true } },
			{ id: 'off', label: 'Disconnected', filters: { connected: false } },
			{ id: 'brands', label: 'Brand accounts', filters: { side: 'workspace' } }
		],
		filters: [{ key: 'side', label: 'Side', options: [{ label: 'Creators', value: 'creator' }, { label: 'Brand workspaces', value: 'workspace' }] }],
		columns: [
			{ key: 'username', label: 'Instagram', text: (r) => (r.username ? '@' + r.username : '—'), link: (r) => (r.username ? `https://instagram.com/${r.username}` : null) },
			{ key: 'account', label: 'Account', link: accountLink },
			{ key: 'side', label: 'Side', type: 'tag', tag: (v) => [v === 'creator' ? 'Creator' : 'Workspace', v === 'creator' ? 't-ok' : 't-info'] },
			{ key: 'followers', label: 'Followers', type: 'compact' },
			{ key: 'connected', label: 'State', type: 'tag', tag: yes('Connected', 'Disconnected') },
			{ key: 'expires', label: 'Login expires', type: 'day' },
			{ key: 'synced', label: 'Last sync', type: 'ago' },
			{ key: 'error', label: 'Last error', wrap: true, nosort: true }
		],
		sort: 'synced',
		href: accountLink
	}
};

const TICKET_TAG: Record<string, string> = { open: 't-bad', waiting: 't-info', solved: 't-ok' };
const TICKET_LABEL: Record<string, string> = { open: 'Your turn', waiting: 'Waiting on them', solved: 'Solved' };
const CATEGORY: Record<string, string> = { collabs: 'Collabs', money: 'Money', instagram: 'Instagram', account: 'Account', bug: 'Bug', idea: 'Idea', brand: 'Booking', other: 'Other' };
export const REASON: Record<string, string> = {
	pay_to_work: 'Asking creators to pay', fake: 'Fake brand', not_paid: "Didn't pay", abuse: 'Rude or threatening', spam: 'Spam',
	not_posted: "Got paid, didn't post", fake_followers: 'Fake followers', no_approval: 'Posted without approval', other: 'Something else'
};
const SOURCE: Record<string, string> = { app: 'App', server: 'Server', jobs: 'Emails & jobs' };
async function addBan() {
	const value = await askText({ title: 'Ban an email or a UPI ID', body: "A banned email can't sign up as a brand, send requests or messages, or ask questions on a creator's page. A banned UPI ID can't be sent in messages.", ok: 'Next', input: { label: 'Email or UPI ID', placeholder: 'name@example.com or name@okbank', required: true } });
	if (value === null) return false;
	// A UPI ID has no dot after the @ (name@okaxis); an email does.
	const k = /^[^@\s]+@[a-z]{2,}$/i.test(value.trim()) ? 'upi' : 'email';
	const reason = await askText({ title: `Ban the ${k === 'upi' ? 'UPI ID' : 'email'} ${value.trim()}?`, ok: 'Ban', danger: true, input: { label: 'Why (for the audit trail)', required: true } });
	if (reason === null) return false;
	const { error } = await supabase.rpc('admin_ban_set', { p_kind: k, p_value: value, p_add: true, p_reason: reason });
	if (error) {
		toast(errMessage(error), true);
		return false;
	}
	toast(`${value.trim()} is banned`);
	return true;
}
async function directoryList(rows: Row[], on: boolean) {
	const reason = await askText({
		title: on ? `List ${rows.length === 1 ? rows[0].name : rows.length + ' creators'} in the directory?` : `Take ${rows.length === 1 ? rows[0].name : rows.length + ' creators'} out of the directory?`,
		body: on ? 'Brands browsing the directory will find them.' : 'Brands stop finding them in the directory. Their pages still work.',
		ok: on ? 'List' : 'Take out',
		input: { label: 'Reason (for the audit trail)' }
	});
	if (reason === null) return false;
	let n = 0;
	for (const r of rows) {
		const { error } = await supabase.rpc('admin_creator_directory', { p_id: r.id, p_listed: on, p_reason: reason });
		if (error) toast(`${r.name}: ${errMessage(error)}`, true);
		else n++;
	}
	if (n) toast(on ? `Listed ${n}` : `Took out ${n}`);
	return n > 0;
}

const TRUST: Record<string, ListConfig> = {
	support: {
		id: 'support', kind: 'tickets', group: 'Trust', title: 'Support', noun: 'ticket', search: 'Number, subject, email, name, creator',
		presets: [
			{ id: 'open', label: 'Your turn', filters: { status: 'open' } },
			{ id: 'unread', label: 'Unread', filters: { unread: true } },
			{ id: 'urgent', label: 'Urgent', filters: { priority: 'urgent', status: ['open', 'waiting'] } },
			{ id: 'waiting', label: 'Waiting on them', filters: { status: 'waiting' } },
			{ id: 'solved', label: 'Solved', filters: { status: 'solved' } },
			{ id: 'all', label: 'All', filters: {} }
		],
		filters: [
			{ key: 'side', label: 'From', options: [{ label: 'Creators', value: 'creator' }, { label: 'Brands', value: 'brand' }, { label: 'Others', value: 'other' }] },
			{ key: 'category', label: 'About', options: Object.entries(CATEGORY).map(([v, l]) => ({ label: l, value: v })) },
			DAYS('created', 'Opened')
		],
		columns: [
			{ key: 'number', label: 'Ticket', text: (r) => `#${r.number} ${r.subject}`, sub: 'email' },
			{ key: 'status', label: 'Status', type: 'tag', tag: (v, r) => (r.unread ? ['Unread', 't-bad'] : [TICKET_LABEL[v] ?? label(v), TICKET_TAG[v] ?? 't-mute']) },
			{ key: 'priority', label: 'Priority', type: 'tag', tag: (v) => (v === 'urgent' ? ['Urgent', 't-bad'] : ['Normal', 't-mute']) },
			{ key: 'category', label: 'About', text: (r) => CATEGORY[r.category] ?? label(r.category) },
			{ key: 'side', label: 'From', text: (r) => (r.side === 'creator' ? `Creator${r.creator ? ' · ' + r.creator : ''}` : label(r.side)), link: (r) => (r.creator_id ? href('creators', r.creator_id) : r.user_id && r.side === 'brand' ? href('brand-logins', r.user_id) : null) },
			{ key: 'messages', label: 'Messages', type: 'num' },
			{ key: 'rating', label: 'Rating', text: (r) => (r.rating ? '★'.repeat(r.rating) : '—') },
			{ key: 'updated', label: 'Updated', type: 'ago' },
			{ key: 'created', label: 'Opened', type: 'day' }
		],
		sort: 'updated',
		href: (r) => href('support', r.id)
	},
	safety: {
		id: 'safety', kind: 'safety', group: 'Trust', title: 'Safety', noun: 'reported account', search: 'Name, kind, reason',
		presets: [
			{ id: 'open', label: 'To look at', filters: { open: true } },
			{ id: 'paused', label: 'Paused by themselves', filters: { auto_paused: true } },
			{ id: 'brands', label: 'Brands', filters: { kind: 'brand' } },
			{ id: 'creators', label: 'Creators', filters: { kind: 'creator' } },
			{ id: 'all', label: 'All', filters: {} }
		],
		filters: [{ key: 'reason', label: 'Reason', options: Object.entries(REASON).map(([v, l]) => ({ label: l, value: v })) }, DAYS('created', 'Last report')],
		columns: [
			{ key: 'name', label: 'Reported', sub: 'kind' },
			{ key: 'open', label: 'Status', type: 'tag', tag: (v, r) => (r.state === 'closed' ? ['Closed', 't-mute'] : r.auto_paused ? ['Paused itself', 't-bad'] : v ? ['To look at', 't-warn'] : ['Done', 't-ok']) },
			{ key: 'reason', label: 'Mostly', text: (r) => REASON[r.reason] ?? label(r.reason) },
			{ key: 'reports', label: 'Reports', type: 'num' },
			{ key: 'people', label: 'From people', type: 'num' },
			{ key: 'state', label: 'Account', text: (r) => (r.state === 'no_login' ? 'No login (added by a creator)' : label(r.state)) },
			{ key: 'created', label: 'Last report', type: 'ago' }
		],
		sort: 'created',
		href: (r) => href('safety', r.key)
	},
	bans: {
		id: 'bans', kind: 'bans', group: 'Trust', title: 'Bans', noun: 'ban', search: 'Email, UPI ID, reason',
		presets: [{ id: 'all', label: 'All', filters: {} }, { id: 'email', label: 'Emails', filters: { kind: 'email' } }, { id: 'upi', label: 'UPI IDs', filters: { kind: 'upi' } }],
		filters: [DAYS('created', 'Banned')],
		columns: [
			{ key: 'value', label: 'Banned', type: 'mono' },
			{ key: 'kind', label: 'Kind', type: 'tag', tag: (v) => [v === 'upi' ? 'UPI ID' : 'Email', 't-mute'] },
			{ key: 'reason', label: 'Why', wrap: true },
			{ key: 'created', label: 'Banned', type: 'day' }
		],
		sort: 'created',
		href: () => null,
		create: { label: 'Ban an email or UPI ID', run: addBan },
		rowActions: [
			{ label: 'Lift ban', run: withReason('Lift this ban?', 'The email can be used again, or the UPI ID can be sent in messages again.', 'Lift ban', 'admin_ban_set', (r, why) => ({ p_kind: r.kind, p_value: r.value, p_add: false, p_reason: why }), 'Ban lifted', false) }
		]
	},
	blocks: {
		id: 'blocks', kind: 'blocks', group: 'Trust', title: 'Blocks', noun: 'block', search: 'Creator, workspace, brand',
		presets: [{ id: 'all', label: 'All', filters: {} }, { id: 'creators', label: 'Creators blocking brands', filters: { side: 'creator' } }, { id: 'brands', label: 'Brands blocking creators', filters: { side: 'brand' } }],
		filters: [DAYS('created', 'Blocked')],
		columns: [
			{ key: 'side', label: 'Who blocked', text: (r) => (r.side === 'creator' ? `Creator · ${r.creator ?? '—'}` : `Brand · ${r.workspace ?? r.brand ?? '—'}`), link: (r) => (r.side === 'creator' ? creatorLink(r) : r.workspace_id ? href('workspaces', r.workspace_id) : null) },
			{ key: 'name', label: 'Blocked', text: (r) => (r.side === 'creator' ? (r.workspace ?? r.brand ?? r.name ?? '—') : (r.creator ?? r.name ?? '—')),
				link: (r) => (r.side === 'creator' ? (r.workspace_id ? href('workspaces', r.workspace_id) : r.brand_id ? href('brands', r.brand_id) : null) : creatorLink(r)) },
			{ key: 'created', label: 'Blocked', type: 'day' }
		],
		sort: 'created',
		href: () => null
	},
	problems: {
		id: 'problems', kind: 'problems', group: 'Trust', title: 'Problems', noun: 'problem', search: 'Error, screen, release',
		presets: [
			{ id: 'open', label: 'Open', filters: { status: 'open' } },
			{ id: 'new', label: 'New today', filters: { new: true, status: 'open' } },
			{ id: 'fixed', label: 'Fixed', filters: { status: 'fixed' } },
			{ id: 'ignored', label: 'Ignored', filters: { status: 'ignored' } },
			{ id: 'all', label: 'All', filters: {} }
		],
		filters: [{ key: 'source', label: 'Where', options: Object.entries(SOURCE).map(([v, l]) => ({ label: l, value: v })) }, DAYS('created', 'Last seen')],
		columns: [
			{ key: 'message', label: 'Problem', sub: 'place', wrap: true },
			{ key: 'status', label: 'Status', type: 'tag', tag: (v, r) => (r.new && v === 'open' ? ['New', 't-bad'] : plain({ open: 't-warn', fixed: 't-ok', ignored: 't-mute' })(v)) },
			{ key: 'source', label: 'Where', text: (r) => SOURCE[r.source] ?? r.source },
			{ key: 'week', label: '7 days', type: 'num' },
			{ key: 'people', label: 'People (7 days)', type: 'num' },
			{ key: 'times', label: 'All time', type: 'num' },
			{ key: 'release', label: 'Release', type: 'mono' },
			{ key: 'created', label: 'Last seen', type: 'ago' }
		],
		sort: 'created',
		href: (r) => href('problems', r.id)
	}
};

const CASE_TAG: Record<string, string> = { published: 't-ok', asked: 't-warn', draft: 't-mute', declined: 't-bad' };
const GROWTH: Record<string, ListConfig> = {
	directory: {
		id: 'directory', kind: 'directory', group: 'Growth', title: 'Directory', noun: 'creator', search: 'Name, email, page, niche, city',
		presets: [
			{ id: 'listed', label: 'Listed', filters: { listed: true } },
			{ id: 'ready', label: 'Ready to list', filters: { listed: false, instagram: true, has_bio: true } },
			{ id: 'unlisted', label: 'Not listed', filters: { listed: false } },
			{ id: 'all', label: 'All active', filters: {} }
		],
		filters: [{ key: 'instagram', label: 'Instagram', options: [{ label: 'Linked', value: true }, { label: 'Not linked', value: false }] }],
		columns: [
			{ key: 'name', label: 'Creator', sub: 'slug' },
			{ key: 'listed', label: 'Directory', type: 'tag', tag: yes('Listed', 'Not listed') },
			{ key: 'niche', label: 'Niche · city', text: (r) => [r.niche, r.city].filter(Boolean).join(' · ') || '—' },
			{ key: 'followers', label: 'Followers', type: 'compact' },
			{ key: 'has_bio', label: 'Bio', type: 'tag', tag: yes('Yes', 'Missing') },
			{ key: 'cases', label: 'Case studies', type: 'num' },
			{ key: 'collabs', label: 'Wrapped collabs', type: 'num' },
			{ key: 'views_30d', label: 'Page views (30d)', type: 'num' }
		],
		sort: 'views_30d',
		href: (r) => href('creators', r.id),
		bulk: [
			{ label: 'List', show: (r) => !r.listed, run: (rows) => directoryList(rows, true) },
			{ label: 'Take out', show: (r) => r.listed, run: (rows) => directoryList(rows, false) }
		],
		rowActions: [
			{ label: 'List', show: (r) => !r.listed, run: (rows) => directoryList(rows, true) },
			{ label: 'Take out', show: (r) => r.listed, run: (rows) => directoryList(rows, false) }
		]
	},
	cases: {
		id: 'cases', kind: 'cases', group: 'Growth', title: 'Case studies', noun: 'case study', search: 'Title, creator, brand, collab',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'published', label: 'Published', filters: { status: 'published' } },
			{ id: 'asked', label: 'Waiting on brand', filters: { status: 'asked' } },
			{ id: 'draft', label: 'Drafts', filters: { status: 'draft' } }
		],
		filters: [DAYS('created', 'Updated')],
		columns: [
			{ key: 'title', label: 'Case study', text: (r) => r.title || 'Untitled' },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'brand', label: 'Brand' },
			{ key: 'code', label: 'Collab', type: 'mono', link: collabLink },
			{ key: 'status', label: 'Status', type: 'tag', tag: plain(CASE_TAG) },
			{ key: 'published_at', label: 'Published', type: 'day' }
		],
		sort: 'created',
		href: collabLink,
		rowActions: [
			{ label: 'Unpublish', danger: true, show: (r) => r.status === 'published',
				run: withReason('Unpublish this case study?', 'It comes off the creator’s page and goes back to a draft they can edit.', 'Unpublish', 'admin_case_unpublish', (r, why) => ({ p_id: r.id, p_reason: why }), 'Unpublished') }
		]
	},
	pages: {
		id: 'pages', kind: 'pages', group: 'Growth', title: 'Creator pages', noun: 'page', search: 'Name, email, page address',
		presets: [{ id: 'all', label: 'All active', filters: {} }, { id: 'fans', label: 'With fans', filters: { 'fans:gte': 1 } }, { id: 'quiet', label: 'No views in 30 days', filters: { views_30d: 0 } }],
		filters: [],
		columns: [
			{ key: 'name', label: 'Creator', sub: 'slug' },
			{ key: 'views_30d', label: 'Views (30d)', type: 'num' },
			{ key: 'fans', label: 'Fans', type: 'num' },
			{ key: 'unsubscribed', label: 'Unsubscribed', type: 'num' },
			{ key: 'broadcasts', label: 'Emails to fans', type: 'num' },
			{ key: 'links', label: 'Links', type: 'num' },
			{ key: 'link_clicks', label: 'Link clicks', type: 'num' },
			{ key: 'qr_scans', label: 'QR scans', type: 'num' }
		],
		sort: 'views_30d',
		href: (r) => href('creators', r.id)
	},
	reels: {
		id: 'reels', kind: 'reels', group: 'Growth', title: 'Reel swaps', noun: 'reel swap', search: 'Creators, idea',
		presets: [{ id: 'all', label: 'All', filters: {} }, { id: 'pending', label: 'Waiting', filters: { status: 'pending' } }, { id: 'accepted', label: 'Accepted', filters: { status: 'accepted' } }],
		filters: [DAYS('created', 'Asked')],
		columns: [
			{ key: 'from', label: 'Asked by', link: (r) => href('creators', r.from_id) },
			{ key: 'to', label: 'Asked', link: (r) => href('creators', r.to_id) },
			{ key: 'idea', label: 'Idea', wrap: true, nosort: true },
			{ key: 'status', label: 'Status', type: 'tag', tag: plain({ pending: 't-warn', accepted: 't-ok', declined: 't-mute', cancelled: 't-mute' }) },
			{ key: 'post_at', label: 'Post on', type: 'day' },
			{ key: 'created', label: 'Asked', type: 'day' }
		],
		sort: 'created',
		href: () => null
	}
};

const ITEM_TAG2: Record<string, string> = { pending: 't-warn', done: 't-ok', auto: 't-info', skipped: 't-mute' };
const AUTOMATION: Record<string, ListConfig> = {
	'autopilot-items': {
		id: 'autopilot-items', kind: 'autopilot_items', group: 'Automation', title: 'Autopilot items', noun: 'item', search: 'What it did, agent, workspace',
		presets: [
			{ id: 'pending', label: 'Waiting for approval', filters: { status: 'pending' } },
			{ id: 'auto', label: 'Done by itself', filters: { status: 'auto' } },
			{ id: 'done', label: 'Approved', filters: { status: 'done' } },
			{ id: 'skipped', label: 'Skipped', filters: { status: 'skipped' } },
			{ id: 'all', label: 'All', filters: {} }
		],
		filters: [{ key: 'kind', label: 'Agent', options: ['shortlist', 'followup', 'draft', 'negotiate', 'rebook', 'watch', 'invite'].map((v) => ({ label: label(v), value: v })) }, DAYS('created', 'Made')],
		columns: [
			{ key: 'created', label: 'When', type: 'when' },
			{ key: 'kind', label: 'Agent', type: 'tag', tag: (v) => [label(v), 't-acc'] },
			{ key: 'title', label: 'What', wrap: true },
			{ key: 'workspace', label: 'Workspace', link: (r) => href('workspaces', r.workspace_id) },
			{ key: 'status', label: 'Status', type: 'tag', tag: (v) => [v === 'pending' ? 'Waiting' : label(v), ITEM_TAG2[v] ?? 't-mute'] },
			{ key: 'note', label: 'Note', wrap: true, nosort: true }
		],
		sort: 'created',
		href: (r) => (r.collab_id ? href('collabs', r.collab_id) : r.campaign_id ? href('campaigns', r.campaign_id) : href('workspaces', r.workspace_id)),
		rowActions: [
			{ label: 'Skip', danger: true, show: (r) => r.status === 'pending',
				run: withReason('Skip this autopilot item?', 'It won’t go ahead. The workspace sees it skipped by Miracle, with your reason.', 'Skip', 'admin_autopilot_item_skip', (r, why) => ({ p_id: r.id, p_reason: why }), 'Skipped') }
		]
	},
	dm: {
		id: 'dm', kind: 'dm_rules', group: 'Automation', title: 'DM auto-replies', noun: 'rule', search: 'Keyword, reply, creator',
		presets: [{ id: 'active', label: 'On', filters: { active: true } }, { id: 'failing', label: 'With failures', filters: { 'failed:gte': 1 } }, { id: 'all', label: 'All', filters: {} }],
		filters: [DAYS('created', 'Made')],
		columns: [
			{ key: 'keyword', label: 'Keyword', type: 'mono' },
			{ key: 'reply', label: 'Reply', wrap: true, nosort: true },
			{ key: 'creator', label: 'Creator', link: creatorLink },
			{ key: 'active', label: 'State', type: 'tag', tag: yes('On', 'Off') },
			{ key: 'sent', label: 'Sent', type: 'num' },
			{ key: 'failed', label: 'Failed', type: 'num' },
			{ key: 'last_error', label: 'Last error', wrap: true, nosort: true }
		],
		sort: 'created',
		href: creatorLink,
		rowActions: [
			{ label: 'Turn off', danger: true, show: (r) => r.active,
				run: withReason('Turn this auto-reply off?', 'Comments with this keyword stop getting the automatic DM. The creator can turn it back on.', 'Turn off', 'admin_dm_rule_off', (r, why) => ({ p_id: r.id, p_reason: why }), 'Rule off') }
		]
	}
};

const BILL_PERIOD: Record<string, string> = { trial: 'Trial', month: 'Monthly', year: 'Yearly', comp: 'Free (given)' };
const BILL_KIND: Record<string, string> = { creator: 'Creator', workspace: 'Workspace', agency: 'Agency login' };
const billSubject = (r: Row) => (r.kind === 'creator' ? href('creators', r.subject) : r.kind === 'workspace' ? href('workspaces', r.subject) : href('brand-logins', r.subject));
const BILLING: Record<string, ListConfig> = {
	subscriptions: {
		id: 'subscriptions', kind: 'subscriptions', group: 'Billing', title: 'Subscriptions', noun: 'subscription', search: 'Account, email, plan, note',
		presets: [
			{ id: 'live', label: 'Live', filters: { live: true } },
			{ id: 'paid', label: 'Paying', filters: { live: true, source: 'razorpay' } },
			{ id: 'trials', label: 'Trials', filters: { live: true, period: 'trial' } },
			{ id: 'ending', label: 'Ending in 7 days', filters: { live: true, 'days_left:lte': 7 } },
			{ id: 'comps', label: 'Given free', filters: { period: 'comp' } },
			{ id: 'trouble', label: 'Payment failed', filters: { status: 'halted' } },
			{ id: 'all', label: 'All', filters: {} }
		],
		filters: [
			{ key: 'side', label: 'Side', options: [{ label: 'Creators', value: 'creator' }, { label: 'Brands', value: 'brand' }, { label: 'Agencies', value: 'agency' }] },
			{ key: 'period', label: 'Period', options: Object.entries(BILL_PERIOD).map(([v, l]) => ({ label: l, value: v })) },
			{ key: 'status', label: 'Status', options: ['active', 'cancelled', 'halted', 'ended', 'pending'].map((v) => ({ label: label(v), value: v })) },
			DAYS('created', 'Started')
		],
		columns: [
			{ key: 'name', label: 'Account', sub: 'email', link: billSubject },
			{ key: 'kind', label: 'For', text: (r) => BILL_KIND[r.kind] ?? r.kind },
			{ key: 'plan_name', label: 'Plan' },
			{ key: 'period', label: 'Period', type: 'tag', tag: (v, r) => [BILL_PERIOD[v] ?? v, v === 'trial' ? 't-info' : v === 'comp' ? 't-acc' : r.founding ? 't-warn' : 't-ok'] },
			{ key: 'status', label: 'Status', type: 'tag', tag: (v, r) => (r.live ? (v === 'halted' ? ['Payment failed', 't-bad'] : r.cancel_at_end || v === 'cancelled' ? ['Ends at period end', 't-warn'] : ['Live', 't-ok']) : [label(v), 't-mute']) },
			{ key: 'price', label: 'Price', type: 'money' },
			{ key: 'paid', label: 'Paid so far', type: 'money' },
			{ key: 'days_left', label: 'Days left', type: 'num' },
			{ key: 'ends_at', label: 'Ends', type: 'day' },
			{ key: 'note', label: 'Note', wrap: true, nosort: true }
		],
		sort: 'created',
		href: billSubject,
		rowActions: [
			{ label: 'End now', danger: true, show: (r) => r.live && r.source !== 'razorpay',
				run: withReason('End this plan now?', 'The account drops to its free plan straight away. Paid plans end through Razorpay instead.', 'End now', 'admin_billing_end', (r, why) => ({ p_subscription: r.id, p_reason: why }), 'Plan ended') }
		]
	},
	'billing-payments': {
		id: 'billing-payments', kind: 'billing_payments', group: 'Billing', title: 'Plan payments', noun: 'payment', search: 'Invoice number, account, email, plan',
		presets: [{ id: 'all', label: 'All', filters: {} }, { id: 'month', label: 'Last 30 days', filters: { 'created:gte': 'days:30' } }],
		filters: [DAYS('created', 'Paid')],
		columns: [
			{ key: 'created', label: 'Paid', type: 'when' },
			{ key: 'invoice_no', label: 'Invoice', type: 'mono' },
			{ key: 'name', label: 'Account', sub: 'email', link: billSubject },
			{ key: 'plan_name', label: 'Plan' },
			{ key: 'period', label: 'Period', text: (r) => BILL_PERIOD[r.period] ?? r.period },
			{ key: 'amount', label: 'Amount', type: 'money' },
			{ key: 'gst', label: 'GST', type: 'money' },
			{ key: 'net', label: 'Before GST', type: 'money' }
		],
		sort: 'created',
		href: billSubject
	}
};

export const LISTS: Record<string, ListConfig> = {
	creators: {
		id: 'creators',
		kind: 'creators',
		group: 'People',
		title: 'Creators',
		noun: 'creator',
		search: 'Name, email, page address, handle, city',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'active', label: 'Active', filters: { status: 'active' } },
			{ id: 'pending', label: 'Waiting approval', filters: { status: 'pending' } },
			{ id: 'paused', label: 'Paused', filters: { status: 'paused' } },
			{ id: 'declined', label: 'Declined', filters: { status: 'declined' } },
			{ id: 'noig', label: 'Instagram not linked', filters: { status: 'active', instagram: false } },
			{ id: 'nocollab', label: 'No collabs yet', filters: { status: 'active', collabs: 0 } }
		],
		filters: [
			{ key: 'status', label: 'Status', options: ['active', 'pending', 'paused', 'declined', 'closed'].map((v) => ({ label: STATUS_LABEL[v] ?? v, value: v })) },
			{ key: 'instagram', label: 'Instagram', options: [{ label: 'Linked', value: true }, { label: 'Not linked', value: false }] },
			{ key: 'directory', label: 'Directory', options: [{ label: 'Listed', value: true }, { label: 'Not listed', value: false }] },
			DAYS('joined', 'Joined')
		],
		columns: creatorCols,
		sort: 'joined',
		href: (r) => href('creators', r.id),
		bulk: [
			{ label: 'Approve', show: (r) => r.status === 'pending' || r.status === 'declined', run: (rows) => setCreators(rows, 'active', 'Approve') },
			{ label: 'Bring back', show: (r) => r.status === 'paused', run: (rows) => setCreators(rows, 'active', 'Bring back') },
			{ label: 'Pause', danger: true, show: (r) => r.status === 'active', run: (rows) => setCreators(rows, 'paused', 'Pause') }
		]
	},
	signups: {
		id: 'signups',
		kind: 'creators',
		group: 'People',
		title: 'Sign-ups',
		noun: 'request',
		search: 'Name, email, handle, city',
		base: { status: 'pending' },
		presets: [
			{ id: 'all', label: 'Waiting', filters: {} },
			{ id: 'week', label: 'This week', filters: { 'requested_at:gte': 'days:7' } },
			{ id: 'ig', label: 'Instagram linked', filters: { instagram: true } }
		],
		filters: [DAYS('requested_at', 'Asked')],
		columns: [
			{ key: 'name', label: 'Creator', sub: 'email', text: (r) => r.name || r.email },
			{ key: 'note', label: 'Their note', wrap: true, nosort: true, text: (r) => r.note || '—' },
			{ key: 'niche', label: 'Niche · city', text: (r) => [r.niche, r.city].filter(Boolean).join(' · ') || '—' },
			{ key: 'followers_said', label: 'Followers (said)', text: (r) => r.followers_said || '—' },
			{ key: 'heard', label: 'Heard from', text: (r) => r.heard || '—' },
			{ key: 'handle', label: 'Instagram', type: 'mono', text: (r) => (r.handle ? '@' + r.handle.replace(/^@/, '') : '—'), link: (r) => (r.handle ? `https://instagram.com/${r.handle.replace(/^@/, '')}` : null) },
			{ key: 'requested_at', label: 'Asked', type: 'ago' }
		],
		sort: 'requested_at',
		desc: false,
		href: (r) => href('creators', r.id),
		bulk: [
			{ label: 'Approve', run: (rows) => setCreators(rows, 'active', 'Approve') },
			{ label: 'Decline', danger: true, run: (rows) => setCreators(rows, 'declined', 'Decline') }
		],
		rowActions: [
			{ label: 'Approve', run: (rows) => setCreators(rows, 'active', 'Approve') },
			{ label: 'Decline', danger: true, run: (rows) => setCreators(rows, 'declined', 'Decline') }
		]
	},
	'creator-teams': {
		id: 'creator-teams',
		kind: 'creator_teams',
		group: 'People',
		title: 'Creator teams',
		noun: 'team member',
		search: 'Name, email, creator',
		presets: [{ id: 'all', label: 'Everyone', filters: {} }],
		filters: [
			{ key: 'role', label: 'Role', options: ['manager', 'assistant', 'accountant'].map((v) => ({ label: label(v), value: v })) },
			{ key: 'creator_status', label: 'Creator status', options: ['active', 'paused'].map((v) => ({ label: STATUS_LABEL[v], value: v })) }
		],
		columns: [
			{ key: 'name', label: 'Member', sub: 'email', text: (r) => r.name || r.email },
			{ key: 'creator', label: 'Works for', link: (r) => href('creators', r.creator_id) },
			{ key: 'role', label: 'Role', type: 'tag', tag: (v) => [label(v), 't-mute'] },
			{ key: 'copy_emails', label: 'Copied on emails', type: 'tag', tag: yes('Yes', 'No') },
			{ key: 'added_at', label: 'Added', type: 'day' },
			{ key: 'last_seen', label: 'Last seen', type: 'ago' }
		],
		sort: 'added_at',
		href: (r) => href('creators', r.creator_id)
	},
	'brand-logins': {
		id: 'brand-logins',
		kind: 'brand_logins',
		group: 'People',
		title: 'Brand logins',
		noun: 'login',
		search: 'Email, name, company, city',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'agency', label: 'In several workspaces', filters: { agency: true } },
			{ id: 'paused', label: 'Paused', filters: { state: 'paused' } },
			{ id: 'reported', label: 'Reported', filters: { 'reports:gte': 1 } },
			{ id: 'nocompany', label: 'No companies yet', filters: { companies: 0 } }
		],
		filters: [
			{ key: 'state', label: 'State', options: ['active', 'paused', 'closed'].map((v) => ({ label: label(v), value: v })) },
			{ key: 'instagram', label: 'Instagram', options: [{ label: 'Connected', value: true }, { label: 'Not connected', value: false }] },
			DAYS('joined', 'Joined')
		],
		columns: [
			{ key: 'email', label: 'Login', sub: 'name' },
			{ key: 'company', label: 'Own company', text: (r) => r.company || '—' },
			{ key: 'state', label: 'State', type: 'tag', tag: status },
			{ key: 'workspaces', label: 'Workspaces', type: 'num' },
			{ key: 'companies', label: 'Companies', type: 'num' },
			{ key: 'collabs', label: 'Asks started', type: 'num' },
			{ key: 'instagram', label: 'Instagram', type: 'tag', tag: yes('Connected', 'No') },
			{ key: 'reports', label: 'Reports', type: 'num' },
			{ key: 'last_active', label: 'Last active', type: 'ago' },
			{ key: 'joined', label: 'Joined', type: 'day' }
		],
		sort: 'joined',
		href: (r) => href('brand-logins', r.id)
	},
	workspaces: {
		id: 'workspaces',
		kind: 'workspaces',
		group: 'People',
		title: 'Brand workspaces',
		noun: 'workspace',
		search: 'Workspace, owner email, category, city',
		presets: [
			{ id: 'all', label: 'All', filters: {} },
			{ id: 'teams', label: 'Teams of 2+', filters: { 'members:gte': 2 } },
			{ id: 'campaigns', label: 'With campaigns', filters: { 'campaigns:gte': 1 } },
			{ id: 'approvals', label: 'Approvals on', filters: { approvals: true } },
			{ id: 'paused', label: 'Paused', filters: { state: 'paused' } }
		],
		filters: [{ key: 'state', label: 'State', options: ['active', 'paused', 'closed'].map((v) => ({ label: label(v), value: v })) }, DAYS('joined', 'Set up')],
		columns: [
			{ key: 'name', label: 'Workspace', sub: 'owner_email' },
			{ key: 'state', label: 'State', type: 'tag', tag: status },
			{ key: 'members', label: 'People', type: 'num' },
			{ key: 'invited', label: 'Invited', type: 'num' },
			{ key: 'companies', label: 'Companies', type: 'num' },
			{ key: 'collabs', label: 'Collabs', type: 'num' },
			{ key: 'campaigns', label: 'Campaigns', type: 'num' },
			{ key: 'autopilots', label: 'Autopilots on', type: 'num' },
			{ key: 'approvals', label: 'Approvals', type: 'tag', tag: yes('On', 'Off') },
			{ key: 'last_active', label: 'Last active', type: 'ago' },
			{ key: 'joined', label: 'Set up', type: 'day' }
		],
		sort: 'joined',
		href: (r) => href('workspaces', r.id)
	},
	audit: {
		id: 'audit',
		kind: 'audit',
		group: 'System',
		title: 'Audit trail',
		noun: 'action',
		search: 'Admin, action, record, reason',
		presets: [
			{ id: 'all', label: 'Everything', filters: {} },
			{ id: 'people', label: 'People', filters: { kind: ['creator', 'brand_login', 'workspace'] } },
			{ id: 'deals', label: 'Deals', filters: { kind: ['collab', 'campaign', 'brand'] } },
			{ id: 'messages', label: 'Messages read', filters: { action: 'read_messages' } },
			{ id: 'support', label: 'Support', filters: { kind: ['ticket'] } },
			{ id: 'system', label: 'Switches, jobs & limits', filters: { kind: ['flag', 'limits', 'job', 'outbox', 'admins', 'problem'] } }
		],
		filters: [
			{ key: 'kind', label: 'Record', options: ['creator', 'brand_login', 'workspace', 'agency', 'collab', 'campaign', 'brand', 'ticket', 'problem', 'ban', 'plan', 'billing', 'subscription', 'flag', 'limits', 'job', 'outbox', 'admins'].map((v) => ({ label: label(v), value: v })) },
			DAYS('at', 'When')
		],
		columns: [
			{ key: 'at', label: 'When', type: 'when' },
			{ key: 'admin', label: 'Admin' },
			{ key: 'action', label: 'Action', type: 'tag', tag: (v: string) => [label(v), /pause|decline|close|remove|safety_close/.test(v) ? 't-bad' : /approve|resume|on$/.test(v) ? 't-ok' : 't-mute'] },
			{ key: 'label', label: 'Record', text: (r) => `${label(r.kind)}${r.label ? ' · ' + r.label : ''}`, link: (r) => recordHref(r.kind, r.record) },
			{ key: 'after', label: 'Change', nosort: true, wrap: true, text: (r) => change(r.before, r.after) },
			{ key: 'reason', label: 'Reason', wrap: true, text: (r) => r.reason || '—' }
		],
		sort: 'at',
		href: () => null
	}
};

Object.assign(LISTS, DEALS, SYSTEM, TRUST, GROWTH, AUTOMATION, BILLING);

export function recordHref(kind: string, id: string | null | undefined): string | null {
	if (kind === 'limits') return href('controls');
	if (!id) return null;
	if (kind === 'creator') return href('creators', id);
	if (kind === 'brand_login' || kind === 'agency') return href('brand-logins', id);
	if (kind === 'workspace') return href('workspaces', id);
	if (kind === 'collab') return href('collabs', id);
	if (kind === 'brand') return href('brands', id);
	if (kind === 'campaign') return href('campaigns', id);
	if (kind === 'flag' || kind === 'limits') return href('controls');
	if (kind === 'job') return href('jobs');
	if (kind === 'outbox') return href('outbox');
	if (kind === 'admins') return href('admins');
	if (kind === 'ticket') return href('support', id);
	if (kind === 'problem') return href('problems', id);
	if (kind === 'ban') return href('bans');
	if (kind === 'plan' || kind === 'billing') return href('plans');
	if (kind === 'subscription') return href('subscriptions');
	return null;
}

/** "status pending → active" from an audit row's before and after. */
export function change(before: Row | null | undefined, after: Row | null | undefined): string {
	const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
	if (!keys.length) return '—';
	const show = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
	return keys
		.slice(0, 4)
		.map((k) => (before && after && k in before && k in after ? `${k} ${show(before[k])} → ${show(after[k])}` : after && k in after ? `${k}: ${show(after[k])}` : `${k} was ${show(before?.[k])}`))
		.join(' · ');
}

export { askText };
