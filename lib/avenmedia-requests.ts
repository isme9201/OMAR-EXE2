import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getAuthClient } from '@/lib/avenmedia-auth';

export type RequestRow = {
  id: string; title: string; client_name: string | null; client_phone: string | null;
  description: string | null; requirements: string | null; estimated_cost: number | null;
  image_urls: string[]; status: string; due_at: string | null; task_type: string;
  priority: string; created_at: string; updated_at?: string;
  assignments?: { employee_id: string; profile?: { id: string; name: string; specialty: string | null } | null }[];
};

function errorText(error: unknown) { if (!error) return ''; const e = error as { message?: string; details?: string; hint?: string; code?: string }; return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' — ') || JSON.stringify(error); }
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
  const payload = { title: input.title, task_type: input.task_type || 'photography', client_name: input.client_name, client_phone: input.client_phone || null, description: input.description || null, requirements: input.requirements || null, estimated_cost: input.estimated_cost ? Number(input.estimated_cost) : null, image_urls: Array.isArray(input.image_urls) ? input.image_urls : [], status: input.status || 'new', priority: input.priority || 'normal', due_at: input.due_at || null, updated_at: new Date().toISOString() };
  const result = id ? await client.from('tasks').update(payload).eq('id', id).select('*').single() : await client.from('tasks').insert({ ...payload, created_by: (await client.auth.getUser()).data.user?.id }).select('*').single();
  if (result.error || !result.data) { console.error('[Avenmedia][requests.save]', result.error); return { data: null, error: errorText(result.error) || 'تعذر حفظ الطلب' }; }
  await client.from('task_assignments').delete().eq('task_id', result.data.id);
  if (employeeIds.length) { const assignments = await client.from('task_assignments').insert(employeeIds.map(employee_id => ({ task_id: result.data.id, employee_id }))); if (assignments.error) return { data: null, error: errorText(assignments.error) }; }
  return { data: result.data as RequestRow, error: '' };
}

export async function removeRequest(id: string) { const result = await db().from('tasks').delete().eq('id', id); if (result.error) console.error('[Avenmedia][requests.delete]', result.error); return { error: errorText(result.error) }; }

export async function makeEmployeeSchedulePdf(employeeName: string, requests: RequestRow[]) {
  const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold); let y = 785;
  const text = (value: string, size = 11, face = font) => { if (y < 60) return; page.drawText(value.slice(0, 100), { x: 48, y, size, font: face, color: rgb(.06, .1, .3) }); y -= size + 11; };
  text('AVENMEDIA', 26, bold); text('Production work schedule', 13, bold); text(`Employee: ${employeeName}`, 13, bold); text(`Printed: ${new Date().toLocaleDateString()}`, 10); y -= 10;
  for (const item of requests) { page.drawRectangle({ x: 48, y: y - 2, width: 14, height: 14, borderColor: rgb(.06, .1, .3), borderWidth: 1 }); text(`${item.title} — Client: ${item.client_name || '—'}`, 12, bold); text(`Status: ${item.status} | Due: ${item.due_at ? new Date(item.due_at).toLocaleString() : '—'}`, 10); text(`Details: ${item.description || '—'}`, 10); y -= 8; }
  return pdf.save();
}
