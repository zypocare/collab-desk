// The one engagement figure on Home, My page, the share link and the media kit, the same one Insights leads
// with: her Reels engagement (her last 12 Reels) when Instagram has it, else the rate across all her posts.
// Shown in full, as Insights shows it (4.34%, not 4.3% or 4%).
type WithFormats = { formats?: { reels?: { er?: number | null } } } | Record<string, unknown> | null | undefined;

export function headlineEr(insights: WithFormats, all: number | null | undefined): number | null {
	const reels = (insights as { formats?: { reels?: { er?: number | null } } } | null | undefined)?.formats?.reels?.er;
	const v = typeof reels === 'number' && reels > 0 ? reels : all;
	return typeof v === 'number' && v > 0 ? Number(v) : null;
}

/** 4.34 → "4.34%", 4.3 → "4.3%", 4 → "4%". */
export const erText = (v: number) => `${+Number(v).toFixed(2)}%`;
