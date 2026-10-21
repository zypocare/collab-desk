// Which creator a server function is working for. Since Miracle serves many creators, every timed job
// runs once per active creator, and every request finds its creator: from a private token, from the
// row it is about (its creator_id), or from the signed-in person.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// deno-lint-ignore no-explicit-any
export type Settings = Record<string, any> & { id: number; slug: string; display_name: string; creator_email: string; site_url: string };

/** Every creator the timed jobs should run for. */
export async function activeCreators(db: SupabaseClient): Promise<Settings[]> {
  const { data, error } = await db.from('creator_settings').select('*').eq('status', 'active').order('id');
  if (error) throw error;
  return (data ?? []) as Settings[];
}

/** One creator's settings (null when there is no such creator). */
export async function settingsOf(db: SupabaseClient, creator: number): Promise<Settings | null> {
  const { data } = await db.from('creator_settings').select('*').eq('id', creator).maybeSingle();
  return (data as Settings | null) ?? null;
}

/** The creator whose private token this is (inbox, bank alerts, calendar); null if none matches. */
export async function creatorByToken(db: SupabaseClient, column: 'inbox_token' | 'calendar_token', token: string): Promise<Settings | null> {
  if (!token || token.length < 16) return null;
  const { data } = await db.from('creator_settings').select('*').eq(column, token).maybeSingle();
  return (data as Settings | null) ?? null;
}

/** The creator the signed-in person (the request's Authorization header) is working for. */
export async function creatorOfCaller(req: Request): Promise<number | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/current_creator`, {
    method: 'POST',
    headers: { authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', 'content-type': 'application/json' },
    body: '{}'
  }).catch(() => null);
  const id = r?.ok ? Number(await r.json().catch(() => null)) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The creator's team members who asked for copies of her emails. */
export async function teamCopies(db: SupabaseClient, creator: number): Promise<string[]> {
  const { data } = await db.from('team_members').select('email').eq('creator_id', creator).eq('copy_emails', true);
  return (data ?? []).map((t) => String(t.email));
}
