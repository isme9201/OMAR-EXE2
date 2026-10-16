"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, UsersRound } from "lucide-react";
import { SPECIALTIES } from "@/lib/avenmedia-auth";
import type { Employee } from "@/lib/avenmedia";

const groups = [
  { value: "designer", label: "المصممون" },
  { value: "accountant", label: "المحاسبون" },
  { value: "photographer", label: "المصورون" },
  { value: "marketing", label: "التسويق" },
  { value: "hr", label: "الموارد البشرية" },
  { value: "editor", label: "المونتاج" },
];

export function AssigneePicker({ employees, selectedIds, onToggle }: { employees: Employee[]; selectedIds: string[]; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState("designer");
  const selected = useMemo(() => employees.filter((person) => selectedIds.includes(person.id)), [employees, selectedIds]);
  const visible = employees.filter((person) => person.specialty === group || (!person.specialty && group === "other"));
  const labelFor = (value?: string | null) => SPECIALTIES.find((item) => item.value === value)?.label || value || "فريق";
  return <div className="relative" dir="rtl"><span className="text-xs font-bold text-[#52635b]">اختيار المنفذين</span><button type="button" onClick={() => setOpen((value) => !value)} className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-xl border border-[#d9d0c3] bg-white px-3 py-2 text-right text-sm font-bold text-[#17211f]"><UsersRound className="h-4 text-[#0b4d3e]" /><span className="flex-1">{selected.length ? `${selected.length} منفذ محدد` : "اختيار حسب القسم"}</span><ChevronDown className="h-4" /></button>{selected.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{selected.map((person) => <span key={person.id} className="rounded-full bg-[#e3eee9] px-2 py-1 text-[10px] font-bold text-[#0b4d3e]">{person.name}</span>)}</div>}{open && <div className="absolute inset-x-0 top-full z-30 mt-2 grid gap-3 rounded-2xl border border-[#d9d0c3] bg-white p-3 shadow-2xl"><div className="flex flex-wrap gap-1.5">{groups.map((item) => <button type="button" key={item.value} onClick={() => setGroup(item.value)} className={`rounded-lg px-2.5 py-2 text-[11px] font-bold ${group === item.value ? "bg-[#0b4d3e] text-white" : "bg-[#f2eee8] text-[#52635b]"}`}>{item.label}</button>)}</div><div className="max-h-48 overflow-auto">{visible.length ? visible.map((person) => <button type="button" key={person.id} onClick={() => onToggle(person.id)} className={`mb-1 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-right text-xs font-bold ${selectedIds.includes(person.id) ? "border-[#0b4d3e] bg-[#e3eee9] text-[#0b4d3e]" : "border-[#eee6db] bg-white text-[#52635b]"}`}><span className="grid h-6 w-6 place-items-center rounded-full bg-[#efe8de]">{selectedIds.includes(person.id) ? <Check className="h-3" /> : person.name.slice(0, 1)}</span><span className="flex-1">{person.name}</span><small>{labelFor(person.specialty)}</small></button>) : <p className="p-4 text-center text-xs text-[#68776f]">لا توجد حسابات بهذا القسم.</p>}</div><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-[#d9d0c3] py-2 text-xs font-bold text-[#52635b]">إغلاق القائمة</button></div>}</div>;
}
