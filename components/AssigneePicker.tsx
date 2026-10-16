"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, UsersRound } from "lucide-react";
import type { Employee } from "@/lib/avenmedia";
import { normalizeSpecialty, SPECIALTIES, specialtyLabel, type SpecialtyKey } from "@/lib/specialties";

type AssigneeGroup = "all" | "production" | SpecialtyKey;
const groups: Array<{ value: AssigneeGroup; label: string }> = [
  { value: "all", label: "كل التخصصات" },
  { value: "production", label: "التصوير والمونتاج" },
  { value: "designer", label: "المصممون" },
  { value: "photographer", label: "المصورون" },
  { value: "marketing", label: "التسويق" },
  { value: "hr", label: "الموارد البشرية" },
  { value: "accountant", label: "المحاسبون" },
  { value: "editor", label: "المونتاج" },
];

export function assigneeGroupForTaskType(taskType: string): AssigneeGroup {
  const value = taskType.trim().toLowerCase();
  if (["photography", "photo", "تصوير", "مصور"].includes(value)) return "photographer";
  if (["video", "فيديو", "انتاج فيديو"].includes(value)) return "production";
  if (["editing", "editor", "montage", "مونتاج"].includes(value)) return "editor";
  if (["marketing", "تسويق"].includes(value)) return "marketing";
  if (["design", "designer", "تصميم", "مصمم"].includes(value)) return "designer";
  if (["accounting", "accountant", "محاسبة", "محاسب"].includes(value)) return "accountant";
  if (["hr", "human resources", "موارد بشرية"].includes(value)) return "hr";
  return "all";
}

export function AssigneePicker({ employees, selectedIds, onToggle, taskType = "photography" }: {
  employees: Employee[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  taskType?: string;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<AssigneeGroup>(() => assigneeGroupForTaskType(taskType));
  const selected = useMemo(() => employees.filter((person) => selectedIds.includes(person.id)), [employees, selectedIds]);
  useEffect(() => setGroup(assigneeGroupForTaskType(taskType)), [taskType]);
  const visible = useMemo(() => employees.filter((person) => {
    const specialty = normalizeSpecialty(person.specialty);
    if (group === "all") return true;
    if (group === "production") return specialty === "photographer" || specialty === "editor";
    return specialty === group;
  }), [employees, group]);
  const groupLabel = groups.find((item) => item.value === group)?.label ?? "كل التخصصات";

  return <div className="relative" dir="rtl">
    <span className="text-xs font-bold text-[#58617e]">اختيار المنفذين</span>
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[#cbd4f5] bg-white px-3 py-2 text-right text-sm font-bold text-[#080d24]">
      <UsersRound className="h-4 text-[#142c9b]" />
      <span className="flex-1">{selected.length ? `${selected.length} منفذ محدد` : `اختيار ${groupLabel}`}</span>
      <ChevronDown className={`h-4 transition ${open ? "rotate-180" : ""}`} />
    </button>
    {selected.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{selected.map((person) => <span key={person.id} className="rounded-full bg-[#e6ebff] px-2 py-1 text-[10px] font-bold text-[#142c9b]">{person.name}</span>)}</div>}
    {open && <div className="absolute inset-x-0 top-full z-30 mt-2 grid gap-3 rounded-2xl border border-[#cbd4f5] bg-white p-3 shadow-2xl">
      <div className="flex flex-wrap gap-1.5">{groups.map((item) => <button type="button" key={item.value} onClick={() => setGroup(item.value)} className={`rounded-lg px-2.5 py-2 text-[11px] font-bold ${group === item.value ? "bg-[#142c9b] text-white" : "bg-[#f2eee8] text-[#58617e]"}`}>{item.label}</button>)}</div>
      <div className="max-h-56 overflow-auto">{visible.length ? visible.map((person) => {
        const isSelected = selectedIds.includes(person.id);
        return <button type="button" key={person.id} onClick={() => onToggle(person.id)} className={`mb-1 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-right text-xs font-bold ${isSelected ? "border-[#142c9b] bg-[#e6ebff] text-[#142c9b]" : "border-[#dfe5fb] bg-white text-[#58617e]"}`}>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#e6ebff]">{isSelected ? <Check className="h-3" /> : person.name.slice(0, 1)}</span>
          <span className="flex-1">{person.name}</span><small>{specialtyLabel(person.specialty)}</small>
        </button>;
      }) : <p className="p-4 text-center text-xs leading-6 text-[#58617e]">لا يوجد موظف بهذا التخصص حالياً. غيّر الفلتر أو أضف حساباً بالتخصص نفسه.</p>}</div>
      <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-[#cbd4f5] py-2 text-xs font-bold text-[#58617e]">إغلاق القائمة</button>
    </div>}
  </div>;
}
