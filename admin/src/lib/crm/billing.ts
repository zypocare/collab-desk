// Words for Miracle's own plans (migration 154): plan limits and features as people read them.
export const LIMIT_LABEL: Record<string, string> = {
	quotes_month: 'Quotes a month',
	invoices_month: 'Invoices a month',
	pitches_month: 'Pitches a month',
	requests_month: 'Requests a month',
	campaigns_month: 'Campaigns a month',
	ai_day: 'AI neurons a day',
	seats: 'Team seats'
};
export const FEATURE_LABEL: Record<string, string> = {
	autopilots: 'Creator autopilots',
	reminders: 'Payment reminders',
	bank_match: 'Bank alert matching',
	insights_page: 'Insights page',
	fan_list: 'Fan list',
	results_reports: 'Results reports',
	open_briefs: 'Open briefs',
	brand_autopilots: 'Brand autopilots',
	sales_tracking: 'Sales tracking',
	turnaround: 'Turnaround clocks',
	workspaces: 'Client workspaces',
	roster: 'Creator roster'
};
export const PERIOD_LABEL: Record<string, string> = { trial: 'Trial', month: 'Monthly', year: 'Yearly', comp: 'Free (given)' };
export const STATUS_TAG: Record<string, string> = { active: 't-ok', pending: 't-mute', cancelled: 't-warn', halted: 't-bad', ended: 't-mute' };
export const KIND_LABEL: Record<string, string> = { creator: 'Creator', workspace: 'Brand workspace', agency: 'Agency login' };
export const subjectHref = (kind: string, id: string) => (kind === 'creator' ? `#/creators/${id}` : kind === 'workspace' ? `#/workspaces/${id}` : `#/brand-logins/${id}`);
