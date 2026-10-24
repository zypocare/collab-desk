// What each list screen shows: its columns, the preset tabs, the filter menus and the actions on rows.
// The rows come from admin_list(kind, ...); every key below is a field of those rows.
import { errMessage, supabase } from '../supabase.ts';
import { ask, askText, toast } from '../ui.svelte.ts';
import { href } from '../router.svelte.ts';
import { STATUS_LABEL, STATUS_TAG, label } from '../format.ts';

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
			{ id: 'support', label: 'Support', filters: { kind: ['ticket'] } },
			{ id: 'system', label: 'Limits & problems', filters: { kind: ['limits', 'problem'] } }
		],
		filters: [
			{ key: 'kind', label: 'Record', options: ['creator', 'brand_login', 'workspace', 'ticket', 'problem', 'limits'].map((v) => ({ label: label(v), value: v })) },
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

export function recordHref(kind: string, id: string | null | undefined): string | null {
	if (!id) return null;
	if (kind === 'creator') return href('creators', id);
	if (kind === 'brand_login') return href('brand-logins', id);
	if (kind === 'workspace') return href('workspaces', id);
	if (kind === 'ticket') return href('support');
	if (kind === 'problem') return href('problems');
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
