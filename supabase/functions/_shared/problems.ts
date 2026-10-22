// Tells the admin panel's Problems tab that something broke in a server function or a job.
// Never throws: reporting a problem must not become a second one.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export async function reportProblem(db: SupabaseClient, source: 'server' | 'jobs', message: string, place = '', stack = '') {
  try {
    await db.rpc('problem_report', { p: { source, message: message.slice(0, 300), place: place.slice(0, 200), stack: stack.slice(0, 4000) } });
  } catch (e) {
    console.error('[problems]', e);
  }
}
