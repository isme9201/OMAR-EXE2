import { getAuthClient } from '@/lib/avenmedia-auth';
import { DEFAULT_VISIBLE_TASK_FIELDS, normalizeVisibleTaskFields, type TaskVisibilityField } from '@/lib/task-visibility';
import { makeEmployeeSchedulePdf as generateEmployeeSchedulePdf } from '@/lib/avenmedia-pdf';

export type RequestRow = {
  id: string; title: string; client_name: string | null; client_phone: string | null;
  description: string | null; requirements: string | null; estimated_cost: number | null;
  image_urls: string[]; status: string; due_at: string | null; task_type: string;
  priority: string; created_at: string; updated_at?: string;
  payment_type?: 'none' | 'deposit' | 'full'; paid_amount?: number | null; payment_method?: string | null; payment_note?: string | null;
  visible_fields?: TaskVisibilityField[];
  attachments?: Array<{ id: string; file_name: string | null; secure_url: string | null; resource_type: string | null; format: string | null }>;
  assignments?: { employee_id: string; visible_fields?: TaskVisibilityField[]; profile?: { id: string; name: string; specialty: string | null } | null }[];
};

function errorText(error: unknown) {
  if (!error) return '';
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' — ') || JSON.stringify(error);
}
function db() { return getAuthClient() as any; }

export async function listRequests(query = '') {
  const client = db(); const term = query.trim();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { data: [] as RequestRow[], error: 'يجب تسجيل الدخول أولاً' };
  const { data: profile } = await client.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
  const manager = ['admin', 'manager'].includes(String(profile?.role ?? '').toLowerCase());
  const result = manager
    ? await (() => {
      let request = client.from('tasks').select('*, task_assignments(employee_id,visible_fields, profiles:employee_id(id,name,specialty)), client_uploads(id,file_name,secure_url,resource_type,format)').neq('task_type', 'chat').order('created_at', { ascending: false });
      if (term) request = request.or(`title.ilike.%${term}%,client_name.ilike.%${term}%,client_phone.ilike.%${term}%`);
      return request;
    })()
    : await client.rpc('get_current_user_tasks', { p_query: term || null });
  if (result.error) console.error('[Avenmedia][requests.list]', result.error);
  const data = ((result.data ?? []) as Array<RequestRow & { client_uploads?: RequestRow['attachments'] }>).map((row) => ({ ...row, attachments: row.attachments ?? row.client_uploads ?? [] }));
  return { data, error: errorText(result.error) };
}

export async function saveRequest(input: Record<string, unknown>, id?: string) {
  const client = db(); const employeeIds = Array.isArray(input.employeeIds) ? input.employeeIds as string[] : [];
  const requestedPermissions = (input.assignmentPermissions && typeof input.assignmentPermissions === 'object' ? input.assignmentPermissions : {}) as Record<string, unknown>;
  const previousPermissions = new Map<string, unknown>();
  if (id) {
    const previous = await client.from('task_assignments').select('employee_id,visible_fields').eq('task_id', id);
    if (previous.error) return { data: null, error: errorText(previous.error) };
    for (const assignment of (previous.data ?? []) as Array<{ employee_id: string; visible_fields?: unknown }>) previousPermissions.set(assignment.employee_id, assignment.visible_fields);
  }
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const payload = { title: title || 'طلب جديد', task_type: input.task_type || 'photography', client_name: input.client_name, client_phone: input.client_phone || null, description: input.description || null, requirements: input.requirements || null, estimated_cost: input.estimated_cost ? Number(input.estimated_cost) : null, image_urls: Array.isArray(input.image_urls) ? input.image_urls : [], status: input.status || 'new', priority: input.priority || 'normal', due_at: input.due_at || null, payment_type: input.payment_type || 'none', paid_amount: input.paid_amount ? Number(input.paid_amount) : 0, payment_method: input.payment_method || null, payment_note: input.payment_note || null, updated_at: new Date().toISOString() };
  const result = id ? await client.from('tasks').update(payload).eq('id', id).select('*').single() : await client.from('tasks').insert({ ...payload, created_by: (await client.auth.getUser()).data.user?.id }).select('*').single();
  if (result.error || !result.data) { console.error('[Avenmedia][requests.save]', result.error); return { data: null, error: errorText(result.error) || 'تعذر حفظ الطلب' }; }
  const removed = await client.from('task_assignments').delete().eq('task_id', result.data.id);
  if (removed.error) return { data: null, error: errorText(removed.error) };
  if (employeeIds.length) {
    const assignments = await client.from('task_assignments').insert(employeeIds.map(employee_id => ({
      task_id: result.data.id,
      employee_id,
      visible_fields: normalizeVisibleTaskFields(requestedPermissions[employee_id] ?? previousPermissions.get(employee_id) ?? DEFAULT_VISIBLE_TASK_FIELDS),
    })));
    if (assignments.error) {
      if (id && previousPermissions.size) {
        await client.from('task_assignments').insert([...previousPermissions.entries()].map(([employee_id, visible_fields]) => ({ task_id: id, employee_id, visible_fields: normalizeVisibleTaskFields(visible_fields) })));
      } else if (!id) {
        await client.from('tasks').delete().eq('id', result.data.id);
      }
      return { data: null, error: errorText(assignments.error) };
    }
  }
  return { data: result.data as RequestRow, error: '' };
}

export async function removeRequest(id: string) {
  const result = await db().from('tasks').delete().eq('id', id);
  if (result.error) console.error('[Avenmedia][requests.delete]', result.error);
  return { error: errorText(result.error) };
}

export async function makeEmployeeSchedulePdf(employeeName: string, requests: RequestRow[]) {
  return generateEmployeeSchedulePdf(employeeName, requests);
}
