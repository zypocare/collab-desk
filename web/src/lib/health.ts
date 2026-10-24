// Audience health and brand safety, as the nightly Instagram sync works it out (supabase/functions/_shared/health.ts).
// Brands see it in Discover, on applications and requests; the creator sees the same in Grow.
import type { Chip } from './trust.svelte';

export type HealthTone = 'ok' | 'warn' | 'bad' | 'na';
export type HealthCheck = { key: 'reach' | 'engagement' | 'growth' | 'audience'; label: string; score: number | null; tone: HealthTone; value: string; note: string };
export type SafetyFlag = { kind: string; label: string; severity: 'high' | 'medium' | 'low'; why: string; post: { id: string; permalink: string; posted_at: string } };
export type Safety = { level: 'clear' | 'note' | 'review' | 'unchecked'; checked_at: string | null; posts: number; flags: SafetyFlag[] };
export type Health = { v: 1; at: string; score: number | null; grade: 'strong' | 'good' | 'fair' | 'weak' | null; posts: number; checks: HealthCheck[]; safety: Safety };

export const GRADE: Record<NonNullable<Health['grade']>, string> = { strong: 'Strong', good: 'Good', fair: 'Fair', weak: 'Weak' };
export const gradeTone = (g: Health['grade']): HealthTone => (g === 'strong' || g === 'good' ? 'ok' : g === 'fair' ? 'warn' : g === 'weak' ? 'bad' : 'na');
/** Flags grouped by kind (six cocktail posts are one thing to know, not six), most serious first. */
export function safetyGroups(s: Safety | undefined) {
	const out: { kind: string; label: string; severity: SafetyFlag['severity']; why: string; posts: SafetyFlag['post'][] }[] = [];
	for (const f of s?.flags ?? []) {
		const g = out.find((x) => x.kind === f.kind);
		if (g) g.posts.push(f.post);
		else out.push({ kind: f.kind, label: f.label, severity: f.severity, why: f.why, posts: [f.post] });
	}
	return out;
}
export const safetyText = (s: Safety | undefined) => {
	const n = safetyGroups(s).length;
	return !s || s.level === 'unchecked' ? 'Not checked yet' : s.level === 'clear' ? 'Nothing to flag' : s.level === 'note' ? `${n} thing${n === 1 ? '' : 's'} to know` : 'Worth a look';
};
export const isHealth = (h: unknown): h is Health => !!h && typeof h === 'object' && Array.isArray((h as Health).checks);

/** The chips on a creator's ticket: the score, and brand safety when there's something to know. */
export function healthChips(h: Health | null | undefined): Chip[] {
	if (!isHealth(h)) return [];
	const chips: Chip[] = [];
	if (h.score !== null && h.grade) chips.push({ text: `Audience ${h.score} · ${GRADE[h.grade]}`, tone: h.grade === 'weak' ? 'bad' : h.grade === 'fair' ? 'warn' : 'ok' });
	if (h.safety?.level === 'review') chips.push({ text: 'Brand safety: worth a look', tone: 'bad' });
	else if (h.safety?.level === 'note') {
		const n = safetyGroups(h.safety).length;
		chips.push({ text: `Brand safety: ${n} note${n === 1 ? '' : 's'}`, tone: 'warn' });
	}
	return chips;
}
