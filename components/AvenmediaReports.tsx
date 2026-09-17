"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getAuthClient } from "@/lib/avenmedia-auth";

type Summary = { income: number; expenses: number; net: number; tasks: number; completed: number; open: number; attendance: number };
type FinanceRow = { entry_type: string; amount: number | string | null };
type TaskRow = { status: string | null };
const empty: Summary = { income: 0, expenses: 0, net: 0, tasks: 0, completed: 0, open: 0, attendance: 0 };

export function AvenmediaReports() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<Summary>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    const db = getAuthClient();
    if (!db) { setError("Supabase غير مهيأ"); console.error("[Avenmedia][reports] Supabase client unavailable"); return; }
    setBusy(true); setError("");
    const start = `${month}-01`;
    const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1).toISOString();
    const tables = db as any;
    const [finance, tasks, attendance] = await Promise.all([
      tables.from("financial_entries").select("entry_type,amount").gte("entry_date", start).lt("entry_date", end),
      tables.from("tasks").select("status").gte("created_at", `${start}T00:00:00Z`).lt("created_at", end),
      tables.from("attendance_logs").select("id").gte("check_in", `${start}T00:00:00Z`).lt("check_in", end),
    ]);
    const queryError = finance.error?.message || tasks.error?.message || attendance.error?.message;
    if (queryError) { setError(queryError); console.error("[Avenmedia][reports][load]", { message: queryError, month }); }
    const rows = (finance.data ?? []) as FinanceRow[];
    const income = rows.filter(x => x.entry_type === "income").reduce((a, x) => a + Number(x.amount || 0), 0);
    const expenses = rows.filter(x => x.entry_type === "expense").reduce((a, x) => a + Number(x.amount || 0), 0);
    const taskRows = (tasks.data ?? []) as TaskRow[];
    const completed = taskRows.filter(x => ["completed", "مكتملة", "done"].includes(String(x.status || "").toLowerCase())).length;
    setSummary({ income, expenses, net: income - expenses, tasks: taskRows.length, completed, open: taskRows.length - completed, attendance: attendance.data?.length ?? 0 });
    setBusy(false);
  };
  useEffect(() => { void load(); }, [month]);
  const cards = useMemo(() => [["الإيرادات", `${summary.income.toFixed(2)}`, "text-emerald-700"], ["الخسائر/المصاريف", `${summary.expenses.toFixed(2)}`, "text-rose-700"], ["الصافي بعد الخصم", `${summary.net.toFixed(2)}`, summary.net >= 0 ? "text-indigo-700" : "text-rose-700"], ["المهام المنجزة", `${summary.completed}/${summary.tasks}`, "text-slate-800"], ["المهام غير المنجزة", `${summary.open}`, "text-amber-700"], ["سجلات الحضور", `${summary.attendance}`, "text-slate-800"]] as const, [summary]);
  const pdf = async () => {
    try {
      const doc = await PDFDocument.create(); const page = doc.addPage([595, 842]); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold); let y = 780;
      const text = (v: string, size = 13, face = font) => { page.drawText(v, { x: 48, y, size, font: face, color: rgb(.06, .10, .30) }); y -= size + 18; };
      text("AVENMEDIA", 28, bold); text(`Monthly studio statement - ${month}`, 14, bold); y -= 10;
      [["Income", summary.income], ["Expenses", summary.expenses], ["Net profit", summary.net], ["Completed tasks", summary.completed], ["Open tasks", summary.open], ["Attendance records", summary.attendance]].forEach(([label, value]) => text(`${label}: ${value}`, 14));
      const bytes = await doc.save(); const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; const blob = new Blob([buffer], { type: "application/pdf" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `avenmedia-statement-${month}.pdf`; a.click(); URL.revokeObjectURL(a.href);
    } catch (cause) { console.error("[Avenmedia][reports][pdf]", cause); setError("تعذر إنشاء ملف PDF"); }
  };
  return <main dir="rtl" className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-3"><div><span className="font-mono text-[10px] tracking-[.18em] text-[#5366e8]">AVENMEDIA / REPORTS</span><h2 className="font-naskh mt-1 text-4xl font-bold">كشف الحساب الشهري</h2><p className="mt-2 text-sm text-slate-500">المهام، الحضور، الإيرادات، المصاريف، والصافي بعد الخصم.</p></div><div className="flex gap-2"><input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3" /><button onClick={() => void load()} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white"><RefreshCw className={busy ? "h-4 animate-spin" : "h-4"} /></button><button onClick={() => void pdf()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#10194a] px-4 text-sm font-bold text-white"><Download className="h-4" />طباعة PDF</button></div></header>{error && <p className="rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, tone]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-xs text-slate-500">{label}</span><strong className={`mt-2 block font-mono text-3xl ${tone}`}>{value}</strong></article>)}</section>{busy && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 animate-spin" />تحديث التقرير...</div>}</main>;
}
