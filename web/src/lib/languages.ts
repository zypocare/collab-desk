// Languages she creates content in, and how they're shown (with the native script, so a Kannada or
// Hindi brand sees its own language).
export const LANGUAGES = ['English', 'Kannada', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi'] as const;

const NATIVE: Record<string, string> = {
	Kannada: 'ಕನ್ನಡ',
	Hindi: 'हिंदी',
	Tamil: 'தமிழ்',
	Telugu: 'తెలుగు',
	Malayalam: 'മലയാളം',
	Marathi: 'मराठी',
	Bengali: 'বাংলা',
	Gujarati: 'ગુજરાતી',
	Punjabi: 'ਪੰਜਾਬੀ'
};

/** "Kannada · ಕನ್ನಡ" (English stays as it is). */
export const langLabel = (l: string) => (NATIVE[l] ? `${l} · ${NATIVE[l]}` : l);
/** Just the native script, or the name. */
export const langNative = (l: string) => NATIVE[l] ?? l;

/** A collab's choice as words: "Kannada", "English + Kannada (mixed)", or "" for no preference. */
export const langText = (v: string | null | undefined) => {
	const parts = String(v ?? '').split('+').map((x) => x.trim()).filter(Boolean);
	return parts.length > 1 ? `${parts.join(' + ')} (mixed)` : parts[0] ?? '';
};

/** The Reel script's spoken-language option that fits a collab's language ("Kannada" → "Kannada + English"). */
export function scriptLanguage(v: string | null | undefined): string {
	const p = String(v ?? '').split('+').map((x) => x.trim());
	const own = p.find((x) => x && x !== 'English' && x !== 'Hindi');
	if (own) return `${own} + English`;
	if (p.includes('Hindi')) return p.includes('English') ? 'Hinglish' : 'Hindi';
	return 'English';
}

/** The Reel script's spoken-language options: English, Hinglish, each other language she creates in
 *  mixed with English ("Kannada + English"), and Hindi. */
export function scriptLanguages(own: readonly string[] | null | undefined): string[] {
	const more = (own ?? []).map((x) => x.trim()).filter((x) => x && x !== 'English' && x !== 'Hindi');
	return ['English', 'Hinglish', ...more.map((x) => `${x} + English`), 'Hindi'];
}
