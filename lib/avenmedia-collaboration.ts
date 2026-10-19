'use client';

import { getAuthClient } from '@/lib/avenmedia-auth';
import { uploadCloudinaryChunks, type CloudinaryUploadProgress } from '@/lib/cloudinary-chunked-upload';

export type MessageType = 'text' | 'image' | 'video' | 'pdf' | 'file' | 'voice';
export type CollaborationEmployee = { id: string; name: string; email: string; role: string; specialty?: string | null; is_active?: boolean; presence?: 'online' | 'away' | 'offline' };
export type SafeOrder = { id: string; title: string; client_name: string | null; client_phone: string | null; due_at: string | null; status: string; task_type: string };
export type Conversation = { id: string; title: string | null; created_by: string; archived_at: string | null; updated_at: string; archived_for_current_user?: boolean; unread_count?: number; members?: CollaborationEmployee[] };
export type MessageReaction = { id?: string; message_id?: string; emoji: string; user_id: string };
export type CollaborationMessage = {
  id: string; conversation_id: string; sender_id: string; body: string; task_id: string | null; created_at: string;
  message_type: MessageType; attachment_url: string | null; attachment_public_id: string | null; attachment_name: string | null;
  attachment_mime_type: string | null; attachment_size_bytes: number | null; attachment_resource_type: string | null;
  attachment_format: string | null; attachment_duration_seconds: number | null; client_message_id: string | null;
  edited_at: string | null; read_at: string | null; reply_to_message_id: string | null; deleted_at?: string | null;
  sender?: CollaborationEmployee; reactions?: MessageReaction[]; bookmarked?: boolean; pinned?: boolean;
};
export type SharedMedia = { id: string; conversation_id: string; upload_id: string; task_id: string | null; sender_id: string; include_order_details: boolean; created_at: string; upload?: { id: string; client_name: string | null; secure_url: string | null; file_url: string | null; resource_type: string | null; format: string | null; bytes: number | null }; order?: SafeOrder | null };
export type ConversationPreference = { user_id: string; conversation_id: string; notifications_enabled: boolean; muted_until: string | null; muted_permanently: boolean; updated_at?: string };
export type ChatUploadProgress = CloudinaryUploadProgress;
export type ChatUploadInput = { conversationId: string; file: File; messageType: MessageType; body?: string; replyToMessageId?: string | null; durationSeconds?: number | null; onProgress?: (progress: ChatUploadProgress) => void; signal?: AbortSignal };
export type Result<T> = { data: T; error: string };

const db = () => getAuthClient() as any;
const messageOf = (error: any) => error?.message || error?.details || error?.hint || '';
const ok = <T,>(data: T, error = ''): Result<T> => ({ data, error });
const uuid = () => {
  if (typeof crypto === 'undefined') throw new Error('Secure random ID generation is unavailable');
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const messageFields = 'id,conversation_id,sender_id,body,task_id,created_at,message_type,attachment_url,attachment_public_id,attachment_name,attachment_mime_type,attachment_size_bytes,attachment_resource_type,attachment_format,attachment_duration_seconds,client_message_id,edited_at,read_at,reply_to_message_id,deleted_at';

export async function listCollaborationEmployees(): Promise<Result<CollaborationEmployee[]>> {
  const { data, error } = await db().rpc('list_active_team');
  return ok((data ?? []) as CollaborationEmployee[], messageOf(error));
}
export async function listSafeOrders(): Promise<Result<SafeOrder[]>> {
  const { data, error } = await db().from('tasks').select('id,title,client_name,client_phone,due_at,status,task_type').neq('task_type', 'chat').order('created_at', { ascending: false });
  return ok(data ?? [], messageOf(error));
}
export async function getConversation(conversationId: string, roster?: CollaborationEmployee[]): Promise<Result<Conversation | null>> {
  const [{ data, error }, { data: members, error: memberError }] = await Promise.all([
    db().from('conversations').select('id,title,created_by,archived_at,updated_at').eq('id', conversationId).maybeSingle(),
    db().from('conversation_members').select('user_id').eq('conversation_id', conversationId),
  ]);
  const people = roster || (await listCollaborationEmployees()).data;
  const mapped = (members ?? []).map((member: { user_id: string }) => people.find(person => person.id === member.user_id)).filter(Boolean) as CollaborationEmployee[];
  return ok(data ? { ...data, members: mapped } as Conversation : null, messageOf(error || memberError));
}
export async function findOrCreateConversation(otherUserId: string): Promise<Result<Conversation | null>> {
  if (!otherUserId) return ok(null, 'اختر موظفاً لبدء المحادثة');
  const { data: conversationId, error } = await db().rpc('get_or_create_direct_conversation', { p_other_user_id: otherUserId });
  if (error || !conversationId) return ok(null, messageOf(error) || 'تعذر فتح المحادثة المباشرة');
  return getConversation(conversationId);
}
export async function listConversations(includeArchived = false): Promise<Result<Conversation[]>> {
  const { data: authData, error: authError } = await db().auth.getUser();
  if (!authData.user) return ok([], messageOf(authError) || 'الجلسة منتهية');
  const rosterResult = await listCollaborationEmployees();
  const { data, error } = await db().from('conversations').select('id,title,created_by,archived_at,updated_at,conversation_members(user_id,archived_at)').order('updated_at', { ascending: false });
  const rows = (data ?? []).filter((item: any) => item.conversation_members?.some((member: any) => member.user_id === authData.user.id && (includeArchived || !member.archived_at))).map((item: any) => ({ ...item, archived_for_current_user: Boolean(item.conversation_members?.find((member: any) => member.user_id === authData.user.id)?.archived_at), members: (item.conversation_members ?? []).map((member: any) => rosterResult.data.find(person => person.id === member.user_id)).filter(Boolean) }));
  const withUnread = await Promise.all(rows.map(async (row: any) => {
    const { count } = await db().from('conversation_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', row.id).neq('sender_id', authData.user.id).is('read_at', null);
    return { ...row, unread_count: count || 0 };
  }));
  return ok(withUnread as Conversation[], messageOf(error) || rosterResult.error);
}
export async function listConversationMessages(conversationId: string): Promise<Result<CollaborationMessage[]>> {
  const user = (await db().auth.getUser()).data.user;
  const [{ data, error }, { data: reactions }, { data: bookmarks }, { data: pins }] = await Promise.all([
    db().from('conversation_messages').select(messageFields).eq('conversation_id', conversationId).is('deleted_at', null).order('created_at', { ascending: true }),
    db().from('conversation_message_reactions').select('id,message_id,user_id,emoji').eq('conversation_id', conversationId),
    user ? db().from('conversation_message_bookmarks').select('message_id').eq('user_id', user.id) : Promise.resolve({ data: [] }),
    db().from('conversation_message_pins').select('message_id').eq('conversation_id', conversationId),
  ]);
  const reactionRows = (reactions ?? []) as MessageReaction[];
  const bookmarkIds = new Set((bookmarks ?? []).map((row: any) => row.message_id));
  const pinIds = new Set((pins ?? []).map((row: any) => row.message_id));
  const mapped = (data ?? []).map((message: any) => ({ ...message, message_type: message.message_type || 'text', reactions: reactionRows.filter(reaction => reaction.message_id === message.id), bookmarked: bookmarkIds.has(message.id), pinned: pinIds.has(message.id) }));
  return ok(mapped as CollaborationMessage[], messageOf(error));
}
export async function sendConversationMessage(conversationId: string, body: string, taskId?: string | null, options?: { messageType?: MessageType; clientMessageId?: string; replyToMessageId?: string | null }): Promise<Result<CollaborationMessage | null>> {
  const user = (await db().auth.getUser()).data.user;
  const trimmed = body.trim();
  if (!user || !trimmed || trimmed.length > 5000) return ok(null, 'الرسالة فارغة أو أطول من المسموح أو الجلسة منتهية');
  const { data, error } = await db().from('conversation_messages').insert({ conversation_id: conversationId, sender_id: user.id, body: trimmed, task_id: taskId || null, message_type: options?.messageType || 'text', client_message_id: options?.clientMessageId || uuid(), reply_to_message_id: options?.replyToMessageId || null }).select(messageFields).single();
  return ok((data ?? null) as CollaborationMessage | null, messageOf(error));
}
export async function editConversationMessage(messageId: string, body: string): Promise<Result<CollaborationMessage | null>> {
  const { data, error } = await db().rpc('edit_conversation_message', { p_message_id: messageId, p_body: body.trim() });
  return ok((data ?? null) as CollaborationMessage | null, messageOf(error));
}
export async function deleteConversationMessage(messageId: string): Promise<Result<boolean>> {
  const { data, error } = await db().rpc('delete_conversation_message', { p_message_id: messageId });
  return ok(Boolean(data), messageOf(error));
}
export async function markConversationRead(conversationId: string): Promise<Result<number>> {
  const { data, error } = await db().rpc('mark_conversation_read', { p_conversation_id: conversationId });
  return ok(Number(data || 0), messageOf(error));
}
export async function listConversationPreference(conversationId: string): Promise<Result<ConversationPreference | null>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(null, 'الجلسة منتهية');
  const { data, error } = await db().from('conversation_preferences').select('user_id,conversation_id,notifications_enabled,muted_until,muted_permanently,updated_at').eq('user_id', user.id).eq('conversation_id', conversationId).maybeSingle();
  return ok((data ?? { user_id: user.id, conversation_id: conversationId, notifications_enabled: true, muted_until: null, muted_permanently: false }) as ConversationPreference, messageOf(error));
}
export async function setConversationNotifications(conversationId: string, enabled: boolean): Promise<Result<ConversationPreference | null>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(null, 'الجلسة منتهية');
  const { data, error } = await db().from('conversation_preferences').upsert({ user_id: user.id, conversation_id: conversationId, notifications_enabled: enabled }, { onConflict: 'user_id,conversation_id' }).select('user_id,conversation_id,notifications_enabled,muted_until,muted_permanently,updated_at').single();
  return ok((data ?? null) as ConversationPreference | null, messageOf(error));
}
export async function setConversationMute(conversationId: string, duration: 'day' | 'two_days' | 'week' | 'permanent' | 'unmute'): Promise<Result<ConversationPreference | null>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(null, 'الجلسة منتهية');
  const until = duration === 'day' ? new Date(Date.now() + 86400000).toISOString() : duration === 'two_days' ? new Date(Date.now() + 172800000).toISOString() : duration === 'week' ? new Date(Date.now() + 604800000).toISOString() : null;
  const { data, error } = await db().from('conversation_preferences').upsert({ user_id: user.id, conversation_id: conversationId, muted_until: until, muted_permanently: duration === 'permanent' }, { onConflict: 'user_id,conversation_id' }).select('user_id,conversation_id,notifications_enabled,muted_until,muted_permanently,updated_at').single();
  return ok((data ?? null) as ConversationPreference | null, messageOf(error));
}
export async function toggleMessageReaction(conversationId: string, messageId: string, emoji: string, active: boolean): Promise<Result<boolean>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(false, 'الجلسة منتهية');
  const result = active ? await db().from('conversation_message_reactions').delete().eq('conversation_id', conversationId).eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji) : await db().from('conversation_message_reactions').insert({ conversation_id: conversationId, message_id: messageId, user_id: user.id, emoji });
  return ok(!result.error, messageOf(result.error));
}
export async function toggleMessageBookmark(messageId: string, active: boolean): Promise<Result<boolean>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(false, 'الجلسة منتهية');
  const result = active ? await db().from('conversation_message_bookmarks').delete().eq('message_id', messageId).eq('user_id', user.id) : await db().from('conversation_message_bookmarks').insert({ message_id: messageId, user_id: user.id });
  return ok(!result.error, messageOf(result.error));
}
export async function toggleMessagePin(conversationId: string, messageId: string, active: boolean): Promise<Result<boolean>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(false, 'الجلسة منتهية');
  const result = active ? await db().from('conversation_message_pins').delete().eq('conversation_id', conversationId).eq('message_id', messageId) : await db().from('conversation_message_pins').insert({ conversation_id: conversationId, message_id: messageId, pinned_by: user.id });
  return ok(!result.error, messageOf(result.error));
}

async function invokeChatFunction<T>(payload: Record<string, unknown>): Promise<Result<T | null>> {
  const { data, error } = await db().functions.invoke('cloudinary-upload', { body: payload });
  return ok((data ?? null) as T | null, messageOf(error) || (data?.error ? String(data.error) : ''));
}
const resourceTypeFor = (type: MessageType) => type === 'image' ? 'image' : type === 'video' ? 'video' : 'raw';
export async function uploadChatAttachment(input: ChatUploadInput): Promise<Result<CollaborationMessage | null>> {
  const clientMessageId = uuid();
  const signedResult = await invokeChatFunction<{ cloudName: string; apiKey: string; timestamp: number; signature: string; folder?: string; publicId?: string; resourceType?: string }>({ action: 'sign_chat_upload', conversationId: input.conversationId, clientMessageId, resourceType: resourceTypeFor(input.messageType) });
  if (signedResult.error || !signedResult.data) return ok(null, signedResult.error || 'تعذر توقيع رفع الملف');
  let asset;
  try {
    asset = await uploadCloudinaryChunks(input.file, signedResult.data, input.onProgress, { signal: input.signal });
  } catch (error) {
    return ok(null, error instanceof Error ? error.message : 'تعذر إكمال رفع الملف');
  }
  const completed = await invokeChatFunction<{ message: CollaborationMessage }>({ action: 'complete_chat_upload', conversationId: input.conversationId, clientMessageId, body: input.body?.trim() || '', replyToMessageId: input.replyToMessageId || null, messageType: input.messageType, asset: { ...asset, bytes: asset.bytes ?? input.file.size, format: asset.format || input.file.name.split('.').pop() || null, original_filename: input.file.name, mime_type: input.file.type || null, duration_seconds: input.durationSeconds || asset.duration || null } });
  return ok(completed.data?.message || null, completed.error || '');
}
export async function conversationAction(conversationId: string, action: 'archive' | 'unarchive' | 'delete' | 'block', userId?: string): Promise<Result<boolean>> {
  const user = (await db().auth.getUser()).data.user;
  if (!user) return ok(false, 'الجلسة منتهية');
  if (action === 'delete') { const { error } = await db().from('conversations').delete().eq('id', conversationId); return ok(!error, messageOf(error)); }
  if (action === 'archive' || action === 'unarchive') { const { error } = await db().from('conversation_members').update({ archived_at: action === 'archive' ? new Date().toISOString() : null }).eq('conversation_id', conversationId).eq('user_id', user.id); return ok(!error, messageOf(error)); }
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
