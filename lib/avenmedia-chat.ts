import { createClient, type User } from '@supabase/supabase-js';
import { offlineSupabaseFetch } from '@/lib/offline-first';

const PUBLIC_SUPABASE_URL = 'https://tgufcpgrbsaxccbkmvhx.supabase.co';
const PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndWZjcGdyYnNheGNjYmttdmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczODU4MDcsImV4cCI6MjEwMjk2MTgwN30.2WlPv_c3Y99n0rd5sFOn0B0xIVI2jxoRFA26gKunmMs';

export type ChatProfile = { id: string; name: string; email: string; role: string; specialty?: string | null; is_active?: boolean };
export type ChatItem = { id: string; title: string; description: string | null; created_by: string | null; created_at: string; status: string; priority: string; task_type: string; client_name: string | null; client_phone: string | null; due_at: string | null };
export type UploadItem = { id: string; task_id: string | null; client_name: string | null; secure_url: string | null; file_url: string | null; cloudinary_public_id: string | null; resource_type: string | null; bytes: number | null; format: string | null; uploaded_at: string; uploaded_by: string | null };
export type RequestLog = { id: string; at: string; method: string; target: string; status: 'pending' | 'success' | 'error'; detail: string; token: 'attached' | 'not-attached' };

const logListeners = new Set<(entry: RequestLog) => void>();
export function subscribeRequestLogs(listener: (entry: RequestLog) => void) { logListeners.add(listener); return () => logListeners.delete(listener); }
export function clearRequestLogs() { /* listeners own their visible history */ }
function requestLog(method: string, target: string, status: RequestLog['status'], detail: string, token: RequestLog['token'] = 'attached') {
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), method, target, status, detail, token } satisfies RequestLog;
  logListeners.forEach(listener => listener(entry));
}

let client: ReturnType<typeof createClient> | null = null;
export function supabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PUBLIC_SUPABASE_ANON_KEY;
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, global: { fetch: offlineSupabaseFetch } });
  return client;
}

async function sessionToken(db: ReturnType<typeof supabase>) {
  const { data } = await db.auth.getSession();
  return data.session?.access_token || '';
}
async function invoke<T>(db: ReturnType<typeof supabase>, body: Record<string, unknown>) {
  const target = `functions/${String(body.action ?? 'unknown')}`;
  const token = await sessionToken(db);
  requestLog('POST', target, 'pending', 'إرسال الطلب إلى Supabase Edge Function', token ? 'attached' : 'not-attached');
  const { data, error } = await db.functions.invoke('cloudinary-upload', { body });
  if (error) { requestLog('POST', target, 'error', error.message, token ? 'attached' : 'not-attached'); throw error; }
  if (data?.error) { requestLog('POST', target, 'error', String(data.error), token ? 'attached' : 'not-attached'); throw new Error(String(data.error)); }
  requestLog('POST', target, 'success', 'تمت الاستجابة بنجاح', token ? 'attached' : 'not-attached');
  return data as T;
}

export async function currentUser(): Promise<User | null> { const db = supabase(); const { data, error } = await db.auth.getSession(); if (error) requestLog('GET', 'auth/session', 'error', error.message); else requestLog('GET', 'auth/session', 'success', data.session?.user ? 'جلسة محلية صالحة' : 'لا توجد جلسة'); return data.session?.user ?? null; }
export async function profiles() { const db = supabase(); requestLog('GET', 'profiles', 'pending', 'جلب أعضاء الفريق من الواجهة المقيّدة'); const { data, error } = await db.rpc('list_active_team'); const active = (data ?? []).filter((person: ChatProfile) => person.is_active !== false) as ChatProfile[]; requestLog('GET', 'profiles', error ? 'error' : 'success', error?.message ?? `${active.length} عضو`); return { data: active, error: error?.message ?? '' }; }
export async function chatItems() { const db = supabase(); requestLog('GET', 'tasks?task_type=chat', 'pending', 'جلب المحادثات'); const { data, error } = await db.from('tasks').select('id,title,description,created_by,created_at,status,priority,task_type,client_name,client_phone,due_at').eq('task_type', 'chat').order('created_at', { ascending: true }); requestLog('GET', 'tasks?task_type=chat', error ? 'error' : 'success', error?.message ?? `${data?.length ?? 0} رسالة`); return { data: (data ?? []) as ChatItem[], error: error?.message ?? '' }; }
export async function allTasks() { const db = supabase(); requestLog('GET', 'tasks', 'pending', 'جلب المهام المسموح بعرضها'); const { data, error } = await (db as any).rpc('get_current_user_tasks', { p_query: null }); requestLog('GET', 'tasks', error ? 'error' : 'success', error?.message ?? `${data?.length ?? 0} مهمة`); return { data: (data ?? []) as ChatItem[], error: error?.message ?? '' }; }
export async function uploadsForTasks(taskIds: string[]) { const db = supabase(); if (!taskIds.length) return { data: [] as UploadItem[], error: '' }; const { data, error } = await db.from('client_uploads').select('id,task_id,client_name,secure_url,file_url,cloudinary_public_id,resource_type,bytes,format,uploaded_at,uploaded_by').in('task_id', taskIds).order('uploaded_at', { ascending: true }); requestLog('GET', 'client_uploads', error ? 'error' : 'success', error?.message ?? `${data?.length ?? 0} ملف`); return { data: (data ?? []) as UploadItem[], error: error?.message ?? '' }; }

export async function sendChatMessage(recipientId: string, text: string) {
  const db = supabase();
  try { return (await invoke<{ item: ChatItem }>(db, { action: 'create_chat_message', recipientId, text: text.trim() })).item; }
  catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes('unknown action')) throw error;
    const { data: auth } = await db.auth.getSession(); if (!auth.session?.user) throw new Error('يجب تسجيل الدخول أولاً');
    const { data, error: insertError } = await db.from('tasks').insert({ title: text.trim().slice(0, 80), description: text.trim(), task_type: 'chat', status: 'new', priority: 'normal', created_by: auth.session.user.id, client_name: recipientId } as never).select('id,title,description,created_by,created_at,status,priority,task_type,client_name,client_phone,due_at').single();
    if (insertError || !data) throw insertError ?? new Error('تعذر إرسال الرسالة');
    const assignment = await db.from('task_assignments').insert({ task_id: (data as { id: string }).id, employee_id: recipientId } as never); if (assignment.error && assignment.error.code !== '23505') throw assignment.error;
    requestLog('POST', 'tasks/message-fallback', 'success', 'تم حفظ الرسالة'); return data as ChatItem;
  }
}

export async function updateTaskStatus(taskId: string, status: string): Promise<{ id: string; status: string }> { const db = supabase(); const token = await sessionToken(db); requestLog('PATCH', `tasks/${taskId}`, 'pending', `تغيير الحالة إلى ${status}`, token ? 'attached' : 'not-attached'); const { data, error } = await (db as any).rpc('update_task_status', { p_task_id: taskId, p_status: status }); requestLog('PATCH', `tasks/${taskId}`, error ? 'error' : 'success', error?.message ?? 'تم تحديث المهمة', token ? 'attached' : 'not-attached'); if (error) throw error; return data as { id: string; status: string }; }

export async function createTransferTask(recipientId: string, file: File, note: string, onProgress?: (value: number) => void) {
  const db = supabase();
  const taskResult = await invoke<{ item: ChatItem }>(db, { action: 'create_chat_task', recipientId, title: file.name, description: note.trim() || `ملف مرسل: ${file.name}` });
  const task = taskResult.item;
  const linkResult = await invoke<{ link: { token: string } }>(db, { action: 'create_link', taskId: task.id, clientName: file.name, ttlHours: 168 });
  const signature = await invoke<{ cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string }>(db, { action: 'sign_upload', token: linkResult.link.token });
  const body = new FormData(); body.append('file', file); body.append('api_key', signature.apiKey); body.append('timestamp', String(signature.timestamp)); body.append('signature', signature.signature); body.append('folder', signature.folder);
  requestLog('POST', 'cloudinary/auto/upload', 'pending', 'رفع الملف في الخلفية', 'not-attached');
  const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`, { method: 'POST', body });
  if (!response.ok) { requestLog('POST', 'cloudinary/auto/upload', 'error', `HTTP ${response.status}`, 'not-attached'); throw new Error('رفض Cloudinary رفع الملف'); }
  onProgress?.(100); const asset = await response.json(); requestLog('POST', 'cloudinary/auto/upload', 'success', 'تم رفع الملف بجودته الأصلية', 'not-attached');
  const completed = await invoke<{ upload: UploadItem }>(db, { action: 'complete_upload', token: linkResult.link.token, asset }); return { task, upload: completed.upload };
}
