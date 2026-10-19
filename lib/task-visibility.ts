export const TASK_VISIBILITY_FIELDS = [
  { key: 'client_name', label: 'اسم العميل', description: 'اسم الزبون أو الجهة.' },
  { key: 'client_phone', label: 'رقم الهاتف', description: 'رقم اتصال العميل.' },
  { key: 'description', label: 'تفاصيل المهمة', description: 'الوصف الكامل المطلوب للتنفيذ.' },
  { key: 'requirements', label: 'المتطلبات', description: 'المقاسات والصيغ والملاحظات.' },
  { key: 'due_at', label: 'موعد التسليم', description: 'التاريخ والوقت المحددان.' },
  { key: 'attachments', label: 'المرفقات', description: 'الصور والفيديو والملفات المضافة للمهمة.' },
  { key: 'finance', label: 'التكلفة والدفعات', description: 'التكلفة وحالة المبالغ المدفوعة.' },
] as const;

export type TaskVisibilityField = (typeof TASK_VISIBILITY_FIELDS)[number]['key'];

/** Employee-safe defaults; contact numbers and financial details remain private. */
export const DEFAULT_VISIBLE_TASK_FIELDS: TaskVisibilityField[] = [
  'client_name',
  'description',
  'requirements',
  'due_at',
  'attachments',
];

const allowedFields = new Set<string>(TASK_VISIBILITY_FIELDS.map((field) => field.key));

export function normalizeVisibleTaskFields(value: unknown): TaskVisibilityField[] {
  if (!Array.isArray(value)) return [...DEFAULT_VISIBLE_TASK_FIELDS];
  const normalized = [...new Set(value.filter((field): field is TaskVisibilityField => typeof field === 'string' && allowedFields.has(field)))];
  return normalized;
}

export function defaultTaskVisibilityMap(selectedIds: string[]): Record<string, TaskVisibilityField[]> {
  return Object.fromEntries(selectedIds.map((id) => [id, [...DEFAULT_VISIBLE_TASK_FIELDS]]));
}
