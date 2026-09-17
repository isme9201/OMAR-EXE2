import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Employee = { id: string; name: string; email: string; role: string; specialty?: string | null };
export type UploadRecord = { id: string; file_name?: string | null; public_url?: string | null; created_at?: string | null; task_id?: string | null };
export type AvenmediaTask = { id: string; title: string; task_type: string; client_name?: string | null; client_phone?: string | null; description?: string | null; status: string; priority: string; due_at?: string | null; assignments?: Employee[] };

type Result<T> = { data: T; error: string };
const empty = <T>(data: T, error = ''): Result<T> => ({ data, error });
function logError(operation: string, error: string) { if (error && typeof console !== 'undefined') console.error(`[Avenmedia][${operation}] ${error}`); }

function client(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

export async function listAvenmediaTasks(): Promise<Result<AvenmediaTask[]>> {
  const db = client(); if (!db) return empty([], 'Supabase is not configured');
  const { data, error } = await db.from('avenmedia_tasks').select('*').order('created_at', { ascending: false });
  const message = error?.message ?? ''; logError('tasks.list', message); return empty((data ?? []) as AvenmediaTask[], message);
}
export async function listEmployees(): Promise<Result<Employee[]>> {
  const db = client(); if (!db) return empty([], 'Supabase is not configured');
  const { data, error } = await db.from('profiles').select('id,name,email,role,specialty').order('name');
  const message = error?.message ?? ''; logError('employees.list', message); return empty((data ?? []) as Employee[], message);
}
export async function listUploadRecords(): Promise<Result<UploadRecord[]>> {
  const db = client(); if (!db) return empty([], 'Supabase is not configured');
  const { data, error } = await db.from('upload_records').select('*').order('created_at', { ascending: false });
  const message = error?.message ?? ''; logError('uploads.list', message); return empty((data ?? []) as UploadRecord[], message);
}
export async function createAvenmediaTask(input: Record<string, unknown>): Promise<Result<AvenmediaTask | null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { employeeIds, ...task } = input;
  const { data, error } = await db.from('avenmedia_tasks').insert(task).select('*').single();
  if (error || !data) { const message = error?.message ?? 'Task creation failed'; logError('tasks.create', message); return empty(null, message); }
  if (Array.isArray(employeeIds) && employeeIds.length) await db.from('task_assignments').insert(employeeIds.map((employee_id) => ({ task_id: data.id, employee_id })));
  return empty(data as AvenmediaTask);
}
export async function updateAvenmediaTask(id: string, input: Record<string, unknown>): Promise<Result<AvenmediaTask | null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { employeeIds, ...task } = input;
  const { data, error } = await db.from('avenmedia_tasks').update(task).eq('id', id).select('*').single();
  if (error || !data) { const message = error?.message ?? 'Task update failed'; logError('tasks.update', message); return empty(null, message); }
  if (Array.isArray(employeeIds)) { await db.from('task_assignments').delete().eq('task_id', id); if (employeeIds.length) await db.from('task_assignments').insert(employeeIds.map((employee_id) => ({ task_id: id, employee_id }))); }
  return empty(data as AvenmediaTask);
}
export async function deleteAvenmediaTask(id: string): Promise<Result<null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { error } = await db.from('avenmedia_tasks').delete().eq('id', id);
  const message = error?.message ?? ''; logError('tasks.delete', message); return empty(null, message);
}
export async function invokeAvenmediaFunction<T>(name: string, body: unknown): Promise<Result<T | null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { data, error } = await db.functions.invoke(name, { body });
  const message = error?.message ?? ''; logError(`function.${name}`, message); return empty((data ?? null) as T | null, message);
}
