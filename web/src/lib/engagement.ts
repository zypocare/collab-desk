// Follower-based engagement for share cards: prefer Reels, then all recent posts.
// Shown in full, as Insights shows it (4.34%, not 4.3% or 4%).
type WithFormats = { formats?: { reels?: { er?: number | null } } } | Record<string, unknown> | null | undefined;

export function headlineEr(insights: WithFormats, all: number | null | undefined): number | null {
	const reels = (insights as { formats?: { reels?: { er?: number | null } } } | null | undefined)?.formats?.reels?.er;
	const v = typeof reels === 'number' && reels > 0 ? reels : all;
	return typeof v === 'number' && v > 0 ? Number(v) : null;
}

/** 4.34 → "4.34%", 4.3 → "4.3%", 4 → "4%". */
export const erText = (v: number) => `${+Number(v).toFixed(2)}%`;
