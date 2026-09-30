import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/supabase-config';

export type WorkspaceRecord = Record<string, unknown> & { id?: string; record_id?: string; record_type?: string; payload?: Record<string, unknown> };
export type PortfolioElement = { id: string; element_type: string; content: Record<string, any>; styles: Record<string, any>; x: number; y: number; width: number; height: number; z_index?: number; [key: string]: any };
export type PortfolioPage = { id: string; slug: string; title: string; description?: string | null; published?: boolean; updated_at?: string | null; [key: string]: unknown };

type SupabaseError = { message?: string; details?: string; hint?: string; code?: string };
export function formatSupabaseError(error: unknown) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const item = error as SupabaseError;
  return [item.message, item.details, item.hint, item.code ? `code=${item.code}` : ''].filter(Boolean).join(' — ') || JSON.stringify(error);
}

let browserClient: SupabaseClient | null = null;
export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  const { url, key } = supabaseConfig();
  browserClient = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return browserClient;
}

export async function loadWorkspaceRecords(): Promise<{ data: WorkspaceRecord[]; error: string }> {
  try {
    const { data, error } = await getSupabaseBrowserClient().from('workspace_records').select('*').order('updated_at', { ascending: false });
    return { data: (data ?? []) as WorkspaceRecord[], error: formatSupabaseError(error) };
  } catch (error) {
    return { data: [], error: formatSupabaseError(error) || 'supabase-unavailable' };
  }
}

export async function createWorkspaceRecord(recordType: string, payload: Record<string, unknown>) {
  const db = getSupabaseBrowserClient();
  const { data: auth } = await db.auth.getUser();
  const actorEmail = auth.user?.email?.trim().toLowerCase();
  if (!actorEmail) return { data: null, error: 'جلسة Supabase غير موجودة؛ سجّل الدخول مرة أخرى' };
  const result = await db.from('workspace_records').insert({ actor_email: actorEmail, record_type: recordType, payload }).select('*').single();
  if (result.error) console.error('[Avenmedia][workspace_records.insert]', result.error);
  return { data: result.data as WorkspaceRecord | null, error: formatSupabaseError(result.error) };
}

export async function updateWorkspaceRecord(id: string, record: WorkspaceRecord) {
  const result = await getSupabaseBrowserClient().from('workspace_records').update(record).eq('id', id).select('*').single();
  return { data: result.data, error: formatSupabaseError(result.error) };
}

export async function recordStudioAction(action: string, label: string, payload: Record<string, unknown> = {}) {
  const db = getSupabaseBrowserClient();
  const { data: auth } = await db.auth.getUser();
  const actorEmail = auth.user?.email?.trim().toLowerCase();
  if (!actorEmail) return { data: null, error: 'جلسة Supabase غير موجودة' };
  const result = await db.from('studio_actions').insert({ actor_email: actorEmail, action, label, payload });
  if (result.error) console.error('[Avenmedia][studio_actions.insert]', result.error);
  return { data: result.data, error: formatSupabaseError(result.error) };
}

export async function getStudioThemePreference() {
  const db = getSupabaseBrowserClient(); const { data: auth } = await db.auth.getUser();
  const actorEmail = auth.user?.email?.trim().toLowerCase(); if (!actorEmail) return 'light';
  const { data } = await db.from('studio_preferences').select('theme').eq('actor_email', actorEmail).maybeSingle(); return data?.theme ?? 'light';
}
export async function saveStudioThemePreference(theme: string) {
  const db = getSupabaseBrowserClient(); const { data: auth } = await db.auth.getUser();
  const actorEmail = auth.user?.email?.trim().toLowerCase(); if (!actorEmail) return { error: { message: 'جلسة Supabase غير موجودة' } };
  return db.from('studio_preferences').upsert({ actor_email: actorEmail, theme });
}
export async function getPrivatePortfolioMediaUrl(path: string) {
  const { data, error } = await getSupabaseBrowserClient().storage.from('portfolio').createSignedUrl(path, 3600);
  return { url: data?.signedUrl ?? '', error: formatSupabaseError(error) };
}
