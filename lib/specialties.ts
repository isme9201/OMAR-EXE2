export const SPECIALTIES = [
  { value: 'designer', label: 'مصمم' },
  { value: 'photographer', label: 'مصور' },
  { value: 'marketing', label: 'مسوق' },
  { value: 'hr', label: 'موارد بشرية' },
  { value: 'accountant', label: 'محاسب' },
  { value: 'editor', label: 'مونتاج' },
] as const;

export type SpecialtyKey = (typeof SPECIALTIES)[number]['value'];

function keyOf(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const aliases: Record<string, SpecialtyKey> = {
  designer: 'designer', design: 'designer', 'graphic designer': 'designer',
  'مصمم': 'designer', 'مصممة': 'designer', 'مصمم جرافيك': 'designer', 'مصمم جرافيكي': 'designer', 'تصميم': 'designer', 'تصميم جرافيك': 'designer',
  photographer: 'photographer', photography: 'photographer', photo: 'photographer',
  'مصور': 'photographer', 'مصورة': 'photographer', 'مصور فوتوغرافي': 'photographer', 'تصوير': 'photographer', 'تصوير فوتوغرافي': 'photographer',
  marketing: 'marketing', marketer: 'marketing', 'digital marketing': 'marketing',
  'مسوق': 'marketing', 'مسوقة': 'marketing', 'تسويق': 'marketing', 'مسوق رقمي': 'marketing', 'تسويق رقمي': 'marketing',
  hr: 'hr', 'human resources': 'hr', 'human resource': 'hr', 'hr specialist': 'hr',
  'موارد بشرية': 'hr', 'الموارد البشرية': 'hr', 'شؤون الموظفين': 'hr',
  accountant: 'accountant', accounting: 'accountant', finance: 'accountant',
  'محاسب': 'accountant', 'محاسبة': 'accountant', 'الحسابات': 'accountant', 'حسابات': 'accountant',
  editor: 'editor', editing: 'editor', 'video editor': 'editor', montage: 'editor', postproduction: 'editor',
  'مونتاج': 'editor', 'مونتير': 'editor', 'محرر فيديو': 'editor', 'محررة فيديو': 'editor', 'تحرير فيديو': 'editor',
};

export function normalizeSpecialty(value: unknown): SpecialtyKey | null {
  const key = keyOf(value);
  return aliases[key] ?? null;
}

export function specialtyLabel(value: unknown) {
  const normalized = normalizeSpecialty(value);
  return SPECIALTIES.find((item) => item.value === normalized)?.label ?? (String(value ?? '').trim() || 'غير محدد');
}
