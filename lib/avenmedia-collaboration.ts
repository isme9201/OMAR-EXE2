'use client';

import { getAuthClient } from '@/lib/avenmedia-auth';

export type CollaborationEmployee = { id: string; name: string; email: string; role: string; specialty?: string | null; is_active?: boolean };
export type SafeOrder = { id: string; title: string; client_name: string | null; client_phone: string | null; due_at: string | null; status: string; task_type: string };
export type Conversation = { id: string; title: string | null; created_by: string; archived_at: string | null; updated_at: string; members?: CollaborationEmployee[] };
export type CollaborationMessage = { id: string; conversation_id: string; sender_id: string; body: string; task_id: string | null; created_at: string; sender?: CollaborationEmployee };
export type SharedMedia = { id: string; conversation_id: string; upload_id: string; task_id: string | null; sender_id: string; include_order_details: boolean; created_at: string; upload?: { id: string; client_name: string | null; secure_url: string | null; file_url: string | null; resource_type: string | null; format: string | null; bytes: number | null }; order?: SafeOrder | null };

type Result<T> = { data: T; error: string };
const db = () => getAuthClient() as any;
const messageOf = (error: any) => error?.message || error?.details || '';
const ok = <T,>(data: T, error = ''): Result<T> => ({ data, error });

export async function listCollaborationEmployees(): Promise<Result<CollaborationEmployee[]>> {
  const { data, error } = await db().from('profiles').select('id,name,email,role,specialty,is_active').eq('is_active', true).order('name');
  return ok((data ?? []) as CollaborationEmployee[], messageOf(error));
}

export async function listSafeOrders(): Promise<Result<SafeOrder[]>> {
  const { data, error } = await db().from('tasks').select('id,title,client_name,client_phone,due_at,status,task_type').neq('task_type', 'chat').order('created_at', { ascending: false });
  return ok((data ?? []) as SafeOrder[], messageOf(error));
}

export async function findOrCreateConversation(otherUserId: string): Promise<Result<Conversation | null>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(null, 'يجب تسجيل الدخول أولاً');
  const { data: existing, error: existingError } = await db().from('conversation_members').select('conversation_id,conversations(*)').eq('user_id', user.id);
  if (existingError) return ok(null, messageOf(existingError));
  for (const row of existing ?? []) {
    const { data: members } = await db().from('conversation_members').select('user_id').eq('conversation_id', row.conversation_id);
    if ((members ?? []).some((member: { user_id: string }) => member.user_id === otherUserId)) return ok(row.conversations as Conversation);
  }
  const { data: conversation, error } = await db().from('conversations').insert({ created_by: user.id, title: 'محادثة فريق' }).select('*').single();
  if (error || !conversation) return ok(null, messageOf(error) || 'تعذر إنشاء المحادثة');
  const membership = await db().from('conversation_members').insert([{ conversation_id: conversation.id, user_id: user.id }, { conversation_id: conversation.id, user_id: otherUserId }]);
  if (membership.error) return ok(null, messageOf(membership.error));
  return ok(conversation as Conversation);
}

export async function listConversations(): Promise<Result<Conversation[]>> {
  const { data, error } = await db().from('conversations').select('id,title,created_by,archived_at,updated_at,conversation_members(user_id,profiles(id,name,email,role,specialty))').order('updated_at', { ascending: false });
  const rows = (data ?? []).map((item: any) => ({ ...item, members: (item.conversation_members ?? []).map((member: any) => member.profiles).filter(Boolean) }));
  return ok(rows as Conversation[], messageOf(error));
}

export async function listConversationMessages(conversationId: string): Promise<Result<CollaborationMessage[]>> {
  const { data, error } = await db().from('conversation_messages').select('id,conversation_id,sender_id,body,task_id,created_at,sender:profiles(id,name,email,role,specialty)').eq('conversation_id', conversationId).is('deleted_at', null).order('created_at', { ascending: true });
  return ok((data ?? []) as CollaborationMessage[], messageOf(error));
}

export async function sendConversationMessage(conversationId: string, body: string, taskId?: string | null): Promise<Result<CollaborationMessage | null>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user || !body.trim()) return ok(null, 'الرسالة فارغة أو الجلسة منتهية');
  const { data, error } = await db().from('conversation_messages').insert({ conversation_id: conversationId, sender_id: user.id, body: body.trim(), task_id: taskId || null }).select('id,conversation_id,sender_id,body,task_id,created_at').single();
  return ok((data ?? null) as CollaborationMessage | null, messageOf(error));
}

export async function conversationAction(conversationId: string, action: 'archive' | 'delete' | 'block', userId?: string): Promise<Result<boolean>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(false, 'الجلسة منتهية');
  if (action === 'delete') {
    const { error } = await db().from('conversations').delete().eq('id', conversationId);
    return ok(!error, messageOf(error));
  }
  if (action === 'archive') {
    const { error } = await db().from('conversation_members').update({ archived_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', user.id);
    return ok(!error, messageOf(error));
  }
  const { error } = await db().from('conversation_members').update({ blocked_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', userId || user.id);
  return ok(!error, messageOf(error));
}

export async function listConversationMedia(conversationId: string): Promise<Result<SharedMedia[]>> {
  const { data, error } = await db().from('media_shares').select('id,conversation_id,upload_id,task_id,sender_id,include_order_details,created_at,upload:client_uploads(id,client_name,secure_url,file_url,resource_type,format,bytes),order:tasks(id,title,client_name,client_phone,due_at,status,task_type)').eq('conversation_id', conversationId).order('created_at', { ascending: true });
  return ok((data ?? []) as SharedMedia[], messageOf(error));
}

export async function shareMedia(input: { conversationId: string; uploadId: string; taskId?: string | null; includeOrderDetails: boolean }): Promise<Result<SharedMedia | null>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(null, 'الجلسة منتهية');
  const { data, error } = await db().from('media_shares').insert({ conversation_id: input.conversationId, upload_id: input.uploadId, task_id: input.taskId || null, sender_id: user.id, include_order_details: input.includeOrderDetails }).select('id,conversation_id,upload_id,task_id,sender_id,include_order_details,created_at').single();
  return ok((data ?? null) as SharedMedia | null, messageOf(error));
}

export async function listAvailableUploads(): Promise<Result<Array<{ id: string; task_id: string | null; client_name: string | null; secure_url: string | null; file_url: string | null; resource_type: string | null; format: string | null; bytes: number | null }>>> {
  const { data, error } = await db().from('client_uploads').select('id,task_id,client_name,secure_url,file_url,resource_type,format,bytes').order('uploaded_at', { ascending: false });
  return ok(data ?? [], messageOf(error));
}

export async function notifyUsers(recipientIds: string[], title: string, body: string, taskId?: string | null) {
  const user = (await db().auth.getUser()).data.user;
  if (!user || !recipientIds.length) return { error: 'لا يوجد مستلمون' };
  const { error } = await db().from('task_notifications').insert(recipientIds.map(recipient_id => ({ recipient_id, task_id: taskId || null, title, body })));
  return { error: messageOf(error) };
}
