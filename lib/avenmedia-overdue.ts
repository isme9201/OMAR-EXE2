import { getAuthClient } from '@/lib/avenmedia-auth';
import { overduePdf as generateOverduePdf } from '@/lib/avenmedia-pdf';

export type Overdue = { id: string; title: string; client_name: string | null; estimated_cost: number | null; due_at: string; status: string; overdue_days: number; assignees: string };
const text = (e: any) => e?.message || e?.details || (e ? JSON.stringify(e) : '');
export async function listOverdue() { const r = await (getAuthClient() as any).from('avenmedia_overdue_tasks').select('*').order('due_at'); return { data: (r.data || []) as Overdue[], error: text(r.error) }; }
export async function updateTaskStatus(taskId: string, status: string) { const r = await (getAuthClient() as any).rpc('update_task_status', { p_task_id: taskId, p_status: status }); return { data: r.data, error: text(r.error) }; }
export async function listNotifications() { const db = getAuthClient() as any; const r = await db.from('task_notifications').select('id,recipient_id,task_id,notification_type,title,body,read_at,created_at').order('created_at', { ascending: false }).limit(50); return { data: r.data || [], error: text(r.error) }; }
export async function markNotificationRead(id: string) { const r = await (getAuthClient() as any).from('task_notifications').update({ read_at: new Date().toISOString() }).eq('id', id); return { error: text(r.error) }; }

export async function overduePdf(rows: Overdue[]) {
  return generateOverduePdf(rows);
}
