import { reloadOnce, reportProblem } from '#lib/problems.ts';

// A page that crashes while loading or showing (an "unknown" error: a bug, not a 404 or an error()
// we threw on purpose): the admin panel hears about it, and the error page shows a reference for it.
export const handleError = async ({ kind, error }: { kind: 'app' | 'framework' | 'unknown'; error: unknown }) => {
	if (kind !== 'unknown') return;
	if (/Failed to fetch dynamically imported module|Importing a module script failed/i.test(String((error as Error)?.message ?? ''))) {
		reloadOnce(error);
		return;
	}
	const ref = await reportProblem(error).catch(() => '');
	return { message: 'Internal Error', ref };
};
