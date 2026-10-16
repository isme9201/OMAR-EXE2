import { createClient, type Session, type User } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/supabase-config';

export const SPECIALTIES = [
  { value: 'designer', label: 'مصمم' },
  { value: 'marketing', label: 'مسوق' },
  { value: 'editor', label: 'مونتاج' },
  { value: 'accountant', label: 'محاسب' },
  { value: 'photographer', label: 'مصور' },
  { value: 'hr', label: 'موارد بشرية' },
] as const;

export const REQUEST_TYPES = [
  { value: 'photography', label: 'تصوير', specialties: ['photographer'] },
  { value: 'video', label: 'تصوير فيديو', specialties: ['photographer', 'editor'] },
  { value: 'design', label: 'تصميم', specialties: ['designer'] },
  { value: 'editing', label: 'مونتاج', specialties: ['editor'] },
  { value: 'marketing', label: 'مسوق', specialties: ['marketing'] },
  { value: 'human_resources', label: 'موارد بشرية', specialties: ['hr'] },
  { value: 'accounting', label: 'محاسبة', specialties: ['accountant'] },
] as const;

export function specialtyLabel(value?: string | null) {
  return SPECIALTIES.find((item) => item.value === value)?.label || value || 'بدون تخصص';
}

export function matchesRequestSpecialty(specialty: string | null | undefined, requestType: string) {
  const type = REQUEST_TYPES.find((item) => item.value === requestType);
  return !type || type.specialties.some((item) => item === specialty);
}

function logAuthError(operation: string, error: unknown) {
  if (typeof console !== 'undefined') console.error(`[Avenmedia][auth][${operation}]`, error);
}

let authClient: ReturnType<typeof createClient> | null = null;
export function getAuthClient() {
  if (authClient) return authClient;
  const { url, key } = supabaseConfig();
  authClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return authClient;
}

export async function signIn(email: string, password: string) {
  const db = getAuthClient();
  if (!db) return { data: null, error: 'إعدادات Supabase غير موجودة' };
  const result = await db.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (result.error) logAuthError('sign-in', result.error);
  if (!result.error && typeof window !== 'undefined') window.localStorage.setItem('avenmedia-login-at', String(Date.now()));
  return { data: result.data, error: result.error?.message ?? '' };
}

export async function signOut() {
  const db = getAuthClient();
  if (db) { const result = await db.auth.signOut(); if (result.error) logAuthError('sign-out', result.error); }
  if (typeof window !== 'undefined') window.localStorage.removeItem('avenmedia-login-at');
}

export async function getSession() {
  const db = getAuthClient();
  if (!db) return { session: null as Session | null, user: null as User | null, error: 'Supabase غير مهيأ' };
  const { data, error } = await db.auth.getSession();
  if (typeof window !== 'undefined' && data.session) {
    const started = Number(window.localStorage.getItem('avenmedia-login-at') || Date.now());
    if (Date.now() - started > 31 * 24 * 60 * 60 * 1000) { await signOut(); return { session: null, user: null, error: 'انتهت جلسة الشهر، سجّل الدخول مرة أخرى' }; }
  }
  if (error) logAuthError('get-session', error);
  return { session: data.session, user: data.session?.user ?? null, error: error?.message ?? '' };
}

export function onAuthChange(callback: (session: Session | null) => void) {
  const db = getAuthClient();
  return db?.auth.onAuthStateChange((_event, session) => callback(session)).data.subscription;
}

export async function profileFor(userId: string) {
  const db = getAuthClient();
  if (!db) return { data: null, error: 'Supabase غير مهيأ' };
  const { data, error } = await db.from('profiles').select('id,name,email,role,specialty,is_active').eq('id', userId).maybeSingle();
  if (error) logAuthError('profile', error);
  return { data, error: error?.message ?? '' };
}

export async function toggleAttendance(userId: string) {
  const db = getAuthClient();
  if (!db) return { data: null, error: 'Supabase غير مهيأ' };
  const tables = db as any;
  const { data: open } = await tables.from('attendance_logs').select('id').eq('employee_id', userId).is('check_out', null).order('check_in', { ascending: false }).limit(1).maybeSingle();
  const result = open?.id ? await tables.from('attendance_logs').update({ check_out: new Date().toISOString() }).eq('id', open.id).select('*').single() : await tables.from('attendance_logs').insert({ employee_id: userId }).select('*').single();
  if (result.error) logAuthError('attendance', result.error);
  return result;
}
