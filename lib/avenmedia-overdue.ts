import { PDFDocument, rgb, type PDFImage } from 'pdf-lib';
import { getAuthClient } from '@/lib/avenmedia-auth';
import { embedAvenmediaFonts, enableArabicPdfText } from '@/lib/pdf-arabic';

export type Overdue = { id: string; title: string; client_name: string | null; estimated_cost: number | null; due_at: string; status: string; overdue_days: number; assignees: string };
const text = (e: any) => e?.message || e?.details || (e ? JSON.stringify(e) : '');
export async function listOverdue() { const r = await (getAuthClient() as any).from('avenmedia_overdue_tasks').select('*').order('due_at'); return { data: (r.data || []) as Overdue[], error: text(r.error) }; }
export async function updateTaskStatus(taskId: string, status: string) { const r = await (getAuthClient() as any).rpc('update_task_status', { p_task_id: taskId, p_status: status }); return { data: r.data, error: text(r.error) }; }
export async function listNotifications() { const db = getAuthClient() as any; const r = await db.from('task_notifications').select('id,recipient_id,task_id,notification_type,title,body,read_at,created_at').order('created_at', { ascending: false }).limit(50); return { data: r.data || [], error: text(r.error) }; }
export async function markNotificationRead(id: string) { const r = await (getAuthClient() as any).from('task_notifications').update({ read_at: new Date().toISOString() }).eq('id', id); return { error: text(r.error) }; }

export async function overduePdf(rows: Overdue[]) {
  const doc = await PDFDocument.create(); const pdfFonts = await embedAvenmediaFonts(doc);
 enableArabicPdfText(doc, pdfFonts);
 const { font, bold } = pdfFonts;
  let logo: PDFImage | null = null;
  try { const response = await fetch('/branding/aven-logo-192.png'); if (response.ok) logo = await doc.embedPng(new Uint8Array(await response.arrayBuffer())); } catch { /* continue without decorative logo */ }
  let page = doc.addPage([595, 842]); let y = 720;
  const header = () => {
    page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: rgb(.45, .14, .12) });
    page.drawText('AVENMEDIA', { x: 45, y: 803, size: 25, font: bold, color: rgb(1, 1, 1) });
    page.drawText('سجل الطلبات المتأخرة', { x: 45, y: 783, size: 11, font, color: rgb(1, .82, .78) });
    if (logo) page.drawImage(logo, { x: 510, y: 777, width: 42, height: 42 });
  };
  const nextPage = () => { page = doc.addPage([595, 842]); y = 720; header(); };
  header(); const total = rows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0);
  page.drawText(`عدد الطلبات المتأخرة: ${rows.length}`, { x: 45, y, size: 12, font: bold, color: rgb(.45, .14, .12) });
  page.drawText(`القيمة الإجمالية: ${total.toFixed(2)}`, { x: 350, y, size: 12, font: bold, color: rgb(.45, .14, .12) }); y -= 38;
  rows.forEach((row, index) => {
    if (y < 100) nextPage();
    page.drawRectangle({ x: 42, y: y - 52, width: 510, height: 72, color: rgb(1, 1, 1), borderColor: rgb(.91, .72, .67), borderWidth: 1 });
    page.drawRectangle({ x: 42, y: y - 52, width: 6, height: 72, color: rgb(.68, .30, .22) });
    page.drawText(`${index + 1}. ${row.client_name || 'بدون اسم'} — ${row.title}`.slice(0, 82), { x: 62, y, size: 12, font: bold, color: rgb(.30, .10, .10) });
    page.drawText(`موعد التسليم: ${new Date(row.due_at).toLocaleString('ar-IQ')}   |   التأخير: ${row.overdue_days} يوماً`, { x: 62, y: y - 20, size: 9, font, color: rgb(.45, .25, .23) });
    page.drawText(`القيمة: ${Number(row.estimated_cost || 0).toFixed(2)}   |   المنفذون: ${(row.assignees || '—').slice(0, 45)}`, { x: 62, y: y - 37, size: 9, font, color: rgb(.45, .25, .23) });
    y -= 92;
  });
  return doc.save();
}
