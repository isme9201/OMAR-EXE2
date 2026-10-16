import { PDFDocument, rgb, type PDFImage } from 'pdf-lib';
import { getAuthClient } from '@/lib/avenmedia-auth';
import { embedAvenmediaFonts, enableArabicPdfText } from '@/lib/pdf-arabic';

export type RequestRow = {
  id: string; title: string; client_name: string | null; client_phone: string | null;
  description: string | null; requirements: string | null; estimated_cost: number | null;
  image_urls: string[]; status: string; due_at: string | null; task_type: string;
  priority: string; created_at: string; updated_at?: string;
  payment_type?: 'none' | 'deposit' | 'full'; paid_amount?: number | null; payment_method?: string | null; payment_note?: string | null;
  assignments?: { employee_id: string; profile?: { id: string; name: string; specialty: string | null } | null }[];
};

function errorText(error: unknown) {
  if (!error) return '';
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' — ') || JSON.stringify(error);
}
function db() { return getAuthClient() as any; }

export async function listRequests(query = '') {
  const client = db(); const term = query.trim();
  let request = client.from('tasks').select('*, task_assignments(employee_id, profiles:employee_id(id,name,specialty))').neq('task_type', 'chat').order('created_at', { ascending: false });
  if (term) request = request.or(`title.ilike.%${term}%,client_name.ilike.%${term}%,client_phone.ilike.%${term}%`);
  const result = await request;
  if (result.error) console.error('[Avenmedia][requests.list]', result.error);
  return { data: (result.data ?? []) as RequestRow[], error: errorText(result.error) };
}

export async function saveRequest(input: Record<string, unknown>, id?: string) {
  const client = db(); const employeeIds = Array.isArray(input.employeeIds) ? input.employeeIds as string[] : [];
  const payload = { title: input.title || null, task_type: input.task_type || 'photography', client_name: input.client_name, client_phone: input.client_phone || null, description: input.description || null, requirements: input.requirements || null, estimated_cost: input.estimated_cost ? Number(input.estimated_cost) : null, image_urls: Array.isArray(input.image_urls) ? input.image_urls : [], status: input.status || 'new', priority: input.priority || 'normal', due_at: input.due_at || null, payment_type: input.payment_type || 'none', paid_amount: input.paid_amount ? Number(input.paid_amount) : 0, payment_method: input.payment_method || null, payment_note: input.payment_note || null, updated_at: new Date().toISOString() };
  const result = id ? await client.from('tasks').update(payload).eq('id', id).select('*').single() : await client.from('tasks').insert({ ...payload, created_by: (await client.auth.getUser()).data.user?.id }).select('*').single();
  if (result.error || !result.data) { console.error('[Avenmedia][requests.save]', result.error); return { data: null, error: errorText(result.error) || 'تعذر حفظ الطلب' }; }
  await client.from('task_assignments').delete().eq('task_id', result.data.id);
  if (employeeIds.length) { const assignments = await client.from('task_assignments').insert(employeeIds.map(employee_id => ({ task_id: result.data.id, employee_id }))); if (assignments.error) return { data: null, error: errorText(assignments.error) }; }
  return { data: result.data as RequestRow, error: '' };
}

export async function removeRequest(id: string) {
  const result = await db().from('tasks').delete().eq('id', id);
  if (result.error) console.error('[Avenmedia][requests.delete]', result.error);
  return { error: errorText(result.error) };
}

export async function makeEmployeeSchedulePdf(employeeName: string, requests: RequestRow[]) {
  const pdf = await PDFDocument.create();
  const pdfFonts = await embedAvenmediaFonts(pdf);
  enableArabicPdfText(pdf, pdfFonts);
  const { font, bold } = pdfFonts;
  let logo: PDFImage | null = null;
  try { const response = await fetch('/branding/aven-logo-192.png'); if (response.ok) logo = await pdf.embedPng(new Uint8Array(await response.arrayBuffer())); } catch { /* continue without decorative logo */ }
  let page = pdf.addPage([595, 842]); let y = 735;
  const header = () => {
    page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: rgb(.06, .10, .30) });
    page.drawText('AVENMEDIA', { x: 45, y: 803, size: 25, font: bold, color: rgb(1, 1, 1) });
    page.drawText('PRODUCTION WORK SCHEDULE', { x: 45, y: 783, size: 10, font, color: rgb(.72, .78, 1) });
    page.drawText(employeeName.slice(0, 40), { x: 365, y: 803, size: 12, font: bold, color: rgb(1, 1, 1) });
    if (logo) page.drawImage(logo, { x: 510, y: 777, width: 42, height: 42 });
  };
  const newPage = () => { page = pdf.addPage([595, 842]); y = 735; header(); };
  header(); page.drawText(`تاريخ الطباعة: ${new Date().toLocaleDateString('ar-IQ')}`, { x: 45, y, size: 10, font, color: rgb(.36, .40, .52) }); y -= 35;
  for (const item of requests) {
    if (y < 110) newPage();
    page.drawRectangle({ x: 42, y: y - 52, width: 510, height: 72, color: rgb(1, 1, 1), borderColor: rgb(.80, .84, .93), borderWidth: 1 });
    page.drawRectangle({ x: 42, y: y - 52, width: 6, height: 72, color: rgb(.32, .40, .91) });
    page.drawText(`${item.title || 'طلب بدون عنوان'} — ${item.client_name || 'بدون عميل'}`.slice(0, 78), { x: 62, y, size: 12, font: bold, color: rgb(.06, .10, .30) });
    page.drawText(`الحالة: ${item.status}   |   التسليم: ${item.due_at ? new Date(item.due_at).toLocaleString('ar-IQ') : '—'}`.slice(0, 95), { x: 62, y: y - 20, size: 9, font, color: rgb(.36, .40, .52) });
    page.drawText(`التفاصيل: ${(item.description || '—').slice(0, 90)}`, { x: 62, y: y - 37, size: 9, font, color: rgb(.36, .40, .52) });
    y -= 92;
  }
  return pdf.save();
}
