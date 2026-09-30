import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/lib/supabase-config';

export type Employee = { id: string; name: string; email: string; role: string; specialty?: string | null };
export type UploadStatus = 'new' | 'viewed' | 'in_progress' | 'delivered' | 'needs_reupload';
export type UploadRecord = { id: string; file_name?: string | null; client_name?: string | null; file_url?: string | null; public_url?: string | null; secure_url?: string | null; created_at?: string | null; uploaded_at?: string | null; task_id?: string | null; bytes?: number | null; format?: string | null; resource_type?: string | null; status?: UploadStatus | null; note?: string | null; viewed_at?: string | null; viewed_by?: string | null };
export type AvenmediaTask = { id: string; title: string; task_type: string; client_name?: string | null; client_phone?: string | null; description?: string | null; status: string; priority: string; due_at?: string | null; created_at?: string; assignments?: Employee[] };
export type AvenmediaAccount = { id: string; name: string; account_type: string; opening_balance: number; is_active: boolean };
export type AvenmediaTransaction = { id: string; account_id: string; direction: 'income' | 'expense'; amount: number; category: string; description: string; transaction_date: string; created_at?: string };

type Result<T> = { data: T; error: string };
const empty = <T>(data: T, error = ''): Result<T> => ({ data, error });

function client(): SupabaseClient | null {
  const { url, key } = supabaseConfig();
  return url && key ? createClient(url, key) : null;
}

export async function listAvenmediaTasks(): Promise<Result<AvenmediaTask[]>> {
  const db = client(); if (!db) return empty([], 'Supabase is not configured');
  const [{ data, error }, { data: assignments, error: assignmentError }, { data: people, error: peopleError }] = await Promise.all([
    db.from('tasks').select('*').order('created_at', { ascending: false }),
    db.from('task_assignments').select('task_id,employee_id'),
    db.from('profiles').select('id,name,email,role,specialty').order('name'),
  ]);
  const employeeMap = new Map(((people ?? []) as Employee[]).map((person) => [person.id, person]));
  const taskAssignments = new Map<string, Employee[]>();
  for (const row of (assignments ?? []) as Array<{ task_id: string; employee_id: string }>) {
    const person = employeeMap.get(row.employee_id); if (!person) continue;
    taskAssignments.set(row.task_id, [...(taskAssignments.get(row.task_id) ?? []), person]);
  }
  const tasks = ((data ?? []) as AvenmediaTask[]).filter((item) => item.task_type !== 'chat').map((item) => ({ ...item, assignments: taskAssignments.get(item.id) ?? [] }));
  return empty(tasks, error?.message || assignmentError?.message || peopleError?.message || '');
}

export async function listEmployees(): Promise<Result<Employee[]>> {
  const db = client(); if (!db) return empty([], 'Supabase is not configured');
  const { data, error } = await db.from('profiles').select('id,name,email,role,specialty').order('name');
  return empty((data ?? []) as Employee[], error?.message ?? '');
}

export async function listUploadRecords(): Promise<Result<UploadRecord[]>> {
  const db = client(); if (!db) return empty([], 'Supabase is not configured');
  const { data, error } = await db.from('client_uploads').select('id,file_name,client_name,file_url,secure_url,created_at,uploaded_at,task_id,bytes,format,resource_type,status,note,viewed_at,viewed_by').order('uploaded_at', { ascending: false });
  return empty(((data ?? []) as UploadRecord[]).map((item) => ({ ...item, public_url: item.secure_url || item.file_url || null })), error?.message ?? '');
}

export async function updateUploadRecord(id: string, input: Pick<UploadRecord, 'status' | 'note'>) {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { data: auth } = await db.auth.getUser();
  const payload = { ...input, ...(input.status === 'viewed' ? { viewed_at: new Date().toISOString(), viewed_by: auth.user?.id ?? null } : {}) };
  const { data, error } = await db.from('client_uploads').update(payload).eq('id', id).select('id,status,note,viewed_at,viewed_by').single();
  if (!error) await db.from('upload_activity').insert({ upload_id: id, action: input.status ? `status.${input.status}` : 'note.update', metadata: input.note ? { note: input.note } : {} });
  return empty(data as Pick<UploadRecord, 'id' | 'status' | 'note' | 'viewed_at' | 'viewed_by'> | null, error?.message ?? '');
}

export async function createAvenmediaTask(input: Record<string, unknown>): Promise<Result<AvenmediaTask | null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { employeeIds, ...task } = input;
  const { data: auth } = await db.auth.getUser();
  const payload = { ...task, created_by: (task.created_by as string | undefined) ?? auth.user?.id };
  const { data, error } = await db.from('tasks').insert(payload).select('*').single();
  if (error || !data) return empty(null, error?.message ?? 'Task creation failed');
  if (Array.isArray(employeeIds) && employeeIds.length) await db.from('task_assignments').insert(employeeIds.map((employee_id) => ({ task_id: data.id, employee_id })));
  return empty(data as AvenmediaTask);
}

export async function updateAvenmediaTask(id: string, input: Record<string, unknown>): Promise<Result<AvenmediaTask | null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { employeeIds, ...task } = input;
  const { data, error } = await db.from('tasks').update(task).eq('id', id).select('*').single();
  if (error || !data) return empty(null, error?.message ?? 'Task update failed');
  if (Array.isArray(employeeIds)) { await db.from('task_assignments').delete().eq('task_id', id); if (employeeIds.length) await db.from('task_assignments').insert(employeeIds.map((employee_id) => ({ task_id: id, employee_id }))); }
  return empty(data as AvenmediaTask);
}

export async function deleteAvenmediaTask(id: string): Promise<Result<null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { error } = await db.from('tasks').delete().eq('id', id);
  return empty(null, error?.message ?? '');
}

export async function listAvenmediaAccounts(): Promise<Result<AvenmediaAccount[]>> {
  const db = client(); if (!db) return empty([], 'Supabase is not configured');
  const { data, error } = await db.from('avenmedia_accounts').select('*').eq('is_active', true).order('name');
  return empty((data ?? []) as AvenmediaAccount[], error?.message ?? '');
}

export async function createAvenmediaAccount(input: Pick<AvenmediaAccount, 'name' | 'account_type' | 'opening_balance'>): Promise<Result<AvenmediaAccount | null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { data: auth } = await db.auth.getUser();
  const { data, error } = await db.from('avenmedia_accounts').insert({ ...input, created_by: auth.user?.id }).select('*').single();
  return empty((data ?? null) as AvenmediaAccount | null, error?.message ?? '');
}

export async function listAvenmediaTransactions(from: string, to: string): Promise<Result<AvenmediaTransaction[]>> {
  const db = client(); if (!db) return empty([], 'Supabase is not configured');
  const { data, error } = await db.from('avenmedia_transactions').select('*').gte('transaction_date', from).lte('transaction_date', to).order('transaction_date', { ascending: false });
  return empty((data ?? []) as AvenmediaTransaction[], error?.message ?? '');
}

export async function createAvenmediaTransaction(input: Omit<AvenmediaTransaction, 'id' | 'created_at'>): Promise<Result<AvenmediaTransaction | null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { data: auth } = await db.auth.getUser();
  const { data, error } = await db.from('avenmedia_transactions').insert({ ...input, created_by: auth.user?.id }).select('*').single();
  return empty((data ?? null) as AvenmediaTransaction | null, error?.message ?? '');
}

export async function invokeAvenmediaFunction<T>(name: string, body: unknown): Promise<Result<T | null>> {
  const db = client(); if (!db) return empty(null, 'Supabase is not configured');
  const { data, error } = await db.functions.invoke(name, { body: body as Record<string, unknown> });
  return empty((data ?? null) as T | null, error?.message ?? '');
}
