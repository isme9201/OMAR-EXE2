import { createClient, type User } from '@supabase/supabase-js';

export type ChatProfile = { id: string; name: string; email: string; role: string; specialty?: string | null; is_active?: boolean };
export type ChatItem = { id: string; title: string; description: string; created_by: string | null; created_at: string; status: string; priority: string; task_type: string; client_name: string | null; client_phone: string | null; due_at: string | null };
export type UploadItem = { id: string; task_id: string | null; client_name: string | null; secure_url: string | null; file_url: string | null; cloudinary_public_id: string | null; resource_type: string | null; bytes: number | null; format: string | null; uploaded_at: string; uploaded_by: string | null };

let client: ReturnType<typeof createClient> | null = null;
export function supabase() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
export async function currentUser(): Promise<User | null> { const db = supabase(); if (!db) return null; const { data } = await db.auth.getUser(); return data.user; }
export async function profiles() { const db = supabase(); if (!db) return { data: [] as ChatProfile[], error: 'Supabase غير مهيأ' }; const { data, error } = await db.from('profiles').select('id,name,email,role,specialty,is_active').eq('is_active', true).order('name'); return { data: (data ?? []) as ChatProfile[], error: error?.message ?? '' }; }
export async function chatItems() { const db = supabase(); if (!db) return { data: [] as ChatItem[], error: 'Supabase غير مهيأ' }; const { data, error } = await db.from('tasks').select('id,title,description,created_by,created_at,status,priority,task_type,client_name,client_phone,due_at').eq('task_type', 'chat').order('created_at', { ascending: true }); return { data: (data ?? []) as ChatItem[], error: error?.message ?? '' }; }
export async function uploadsForTasks(taskIds: string[]) { const db = supabase(); if (!db || taskIds.length === 0) return { data: [] as UploadItem[], error: '' }; const { data, error } = await db.from('client_uploads').select('id,task_id,client_name,secure_url,file_url,cloudinary_public_id,resource_type,bytes,format,uploaded_at,uploaded_by').in('task_id', taskIds).order('uploaded_at', { ascending: true }); return { data: (data ?? []) as UploadItem[], error: error?.message ?? '' }; }

async function invoke<T>(db: NonNullable<ReturnType<typeof supabase>>, body: Record<string, unknown>) {
  const { data, error } = await db.functions.invoke('cloudinary-upload', { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export async function sendChatMessage(recipientId: string, text: string) {
  const db = supabase(); if (!db) throw new Error('Supabase غير مهيأ');
  try {
    const result = await invoke<{ item: ChatItem }>(db, { action: 'create_chat_message', recipientId, text: text.trim() });
    return result.item;
  } catch (error) {
    // Older deployments can still write through the existing manager RLS policy.
    if (!(error instanceof Error) || !error.message.toLowerCase().includes('unknown action')) throw error;
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) throw new Error('يجب تسجيل الدخول أولاً');
    const { data, error: insertError } = await db.from('tasks').insert({ title: text.trim().slice(0, 80), description: text.trim(), task_type: 'chat', status: 'new', priority: 'normal', created_by: auth.user.id, client_name: recipientId } as never).select('id,title,description,created_by,created_at,status,priority,task_type,client_name,client_phone,due_at').single();
    if (insertError || !data) throw insertError ?? new Error('تعذر إرسال الرسالة');
    const assignment = await db.from('task_assignments').insert({ task_id: (data as { id: string }).id, employee_id: recipientId } as never);
    if (assignment.error && assignment.error.code !== '23505') throw assignment.error;
    return data as ChatItem;
  }
}

export async function createTransferTask(recipientId: string, file: File, note: string) {
  const db = supabase(); if (!db) throw new Error('Supabase غير مهيأ');
  let task: ChatItem;
  try {
    const taskResult = await invoke<{ item: ChatItem }>(db, { action: 'create_chat_task', recipientId, title: file.name, description: note.trim() || `ملف مرسل: ${file.name}` });
    task = taskResult.item;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.toLowerCase().includes('unknown action')) throw error;
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) throw new Error('يجب تسجيل الدخول أولاً');
    const { data, error: insertError } = await db.from('tasks').insert({ title: file.name, description: note.trim() || `ملف مرسل: ${file.name}`, task_type: 'chat', status: 'new', priority: 'normal', created_by: auth.user.id, client_name: recipientId } as never).select('id,title,description,created_by,created_at,status,priority,task_type,client_name,client_phone,due_at').single();
    if (insertError || !data) throw insertError ?? new Error('تعذر إنشاء التحويل');
    task = data as ChatItem;
    const assignment = await db.from('task_assignments').insert({ task_id: task.id, employee_id: recipientId } as never);
    if (assignment.error && assignment.error.code !== '23505') throw assignment.error;
  }
  const linkResult = await invoke<{ link: { token: string } }>(db, { action: 'create_link', taskId: task.id, clientName: file.name, ttlHours: 168 });
  const signature = await invoke<{ cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string }>(db, { action: 'sign_upload', token: linkResult.link.token });
  const body = new FormData(); body.append('file', file); body.append('api_key', signature.apiKey); body.append('timestamp', String(signature.timestamp)); body.append('signature', signature.signature); body.append('folder', signature.folder);
  const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`, { method: 'POST', body });
  if (!cloudinaryResponse.ok) throw new Error('رفض Cloudinary رفع الملف');
  const asset = await cloudinaryResponse.json();
  const completed = await invoke<{ upload: UploadItem }>(db, { action: 'complete_upload', token: linkResult.link.token, asset });
  return { task, upload: completed.upload };
}
