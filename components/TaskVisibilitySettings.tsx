"use client";

import type { Employee } from "@/lib/avenmedia";
import { normalizeSpecialty, specialtyLabel } from "@/lib/specialties";
import {
  DEFAULT_VISIBLE_TASK_FIELDS,
  normalizeVisibleTaskFields,
  TASK_VISIBILITY_FIELDS,
  type TaskVisibilityField,
} from "@/lib/task-visibility";

export function TaskVisibilitySettings({
  employees,
  selectedIds,
  value,
  onChange,
}: {
  employees: Employee[];
  selectedIds: string[];
  value: Record<string, TaskVisibilityField[]>;
  onChange: (value: Record<string, TaskVisibilityField[]>) => void;
}) {
  const selected = employees.filter((employee) => selectedIds.includes(employee.id));

  if (!selectedIds.length) {
    return <div dir="rtl" className="rounded-2xl border border-dashed border-[#cbd4f5] bg-[#f7f9ff] p-4 text-sm text-[#58617e]">
      اختر منفذاً أولاً لتحديد المعلومات التي يمكنه رؤيتها.
    </div>;
  }

  const toggle = (employeeId: string, field: TaskVisibilityField) => {
    const current = normalizeVisibleTaskFields(value[employeeId] ?? DEFAULT_VISIBLE_TASK_FIELDS);
    const next = current.includes(field) ? current.filter((item) => item !== field) : [...current, field];
    onChange({ ...value, [employeeId]: next });
  };

  return <section dir="rtl" aria-label="صلاحيات تفاصيل المهمة" className="grid gap-3 rounded-2xl border border-[#cbd4f5] bg-[#f7f9ff] p-4">
    <div>
      <h3 className="m-0 text-sm font-black text-[#080d24]">تفاصيل المهمة التي يراها كل منفذ</h3>
      <p className="mb-0 mt-1 text-xs leading-5 text-[#58617e]">الإعداد الافتراضي يخفي رقم الهاتف والبيانات المالية. غيّر الحقول لكل موظف على حدة.</p>
    </div>
    {selected.map((employee) => {
      const visibleFields = normalizeVisibleTaskFields(value[employee.id] ?? DEFAULT_VISIBLE_TASK_FIELDS);
      const specialty = employee.specialty ? specialtyLabel(normalizeSpecialty(employee.specialty) ?? employee.specialty) : "غير محدد";
      return <article key={employee.id} className="rounded-xl border border-[#dfe5fb] bg-white p-3">
        <header className="mb-3 flex flex-wrap items-center gap-3 border-b border-[#eef1fb] pb-3">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e6ebff] font-black text-[#142c9b]">{employee.name.slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <strong className="block truncate text-sm text-[#080d24]">{employee.name}</strong>
            <p className="mb-0 mt-1 break-all text-[11px] leading-5 text-[#58617e]">
              {employee.email || "لا يوجد بريد"} · {employee.role || "موظف"} · {specialty}
            </p>
          </div>
          <span className="rounded-full bg-[#e6ebff] px-2.5 py-1 text-[10px] font-bold text-[#142c9b]">{visibleFields.length} حقول ظاهرة</span>
        </header>
        <div className="grid gap-2 sm:grid-cols-2">
          {TASK_VISIBILITY_FIELDS.map((field) => {
            const checked = visibleFields.includes(field.key);
            const inputId = `task-visibility-${employee.id}-${field.key}`;
            return <label key={field.key} htmlFor={inputId} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${checked ? "border-[#9eb2ff] bg-[#f2f5ff]" : "border-[#e5e8f2] bg-white"}`}>
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                onChange={() => toggle(employee.id, field.key)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#3159d8]"
              />
              <span className="min-w-0">
                <span className="block text-xs font-extrabold text-[#080d24]">{field.label}</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-[#69728a]">{field.description}</span>
              </span>
            </label>;
          })}
        </div>
      </article>;
    })}
  </section>;
}
