import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type WorkspaceRecord = Record<string, unknown> & { id?: string; record_id?: string };
export type PortfolioElement = { id?: string; element_type: string; content: Record<string, unknown>; [key: string]: unknown };
export type PortfolioPage = { id: string; slug: string; title: string; description?: string | null; published?: boolean; updated_at?: string | null; [key: string]: unknown };

let browserClient: SupabaseClient | null = null;
export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase is not configured');
  browserClient = createClient(url, key);
  return browserClient;
}
export async function loadWorkspaceRecords(): Promise<WorkspaceRecord[]> {
  const { data } = await getSupabaseBrowserClient().from('workspace_records').select('*').order('updated_at', { ascending: false });
  return (data ?? []) as WorkspaceRecord[];
}
export async function createWorkspaceRecord(record: WorkspaceRecord) { return getSupabaseBrowserClient().from('workspace_records').insert(record).select('*').single(); }
export async function updateWorkspaceRecord(id: string, record: WorkspaceRecord) { return getSupabaseBrowserClient().from('workspace_records').update(record).eq('id', id).select('*').single(); }
export async function recordStudioAction(action: Record<string, unknown>) { return getSupabaseBrowserClient().from('studio_actions').insert(action); }
export async function getStudioThemePreference() { const { data } = await getSupabaseBrowserClient().from('studio_preferences').select('theme').limit(1).maybeSingle(); return data?.theme ?? 'light'; }
export async function saveStudioThemePreference(theme: string) { return getSupabaseBrowserClient().from('studio_preferences').upsert({ theme }); }
export async function getPrivatePortfolioMediaUrl(path: string) {
  const { data, error } = await getSupabaseBrowserClient().storage.from('portfolio').createSignedUrl(path, 3600);
  return { url: data?.signedUrl ?? '', error: error?.message ?? '' };
}
