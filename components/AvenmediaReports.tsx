"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, ExternalLink, Loader2, RefreshCw } from "lucide-react";
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
  const [downloaded, setDownloaded] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
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
      const doc = await PDFDocument.create(); const page = doc.addPage([595, 842]); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(.97, .98, 1) });
      page.drawRectangle({ x: 0, y: 760, width: 595, height: 82, color: rgb(.06, .10, .30) });
      try { const logoResponse = await fetch('/manus-storage/photomedia-mark_914adfc6.png'); const logoBytes = new Uint8Array(await logoResponse.arrayBuffer()); const logo = await doc.embedPng(logoBytes); page.drawImage(logo, { x: 45, y: 778, width: 42, height: 42 }); } catch { /* logo is decorative; continue if unavailable */ }
      page.drawText("AVENMEDIA", { x: 100, y: 807, size: 24, font: bold, color: rgb(1, 1, 1) });
      page.drawText("MONTHLY STUDIO STATEMENT", { x: 100, y: 785, size: 10, font, color: rgb(.72, .78, 1) });
      page.drawText(month, { x: 485, y: 798, size: 13, font: bold, color: rgb(1, 1, 1) });
      const cards = [["Income", summary.income, rgb(.15, .35, .85)], ["Expenses", summary.expenses, rgb(.68, .30, .22)], ["Net profit", summary.net, summary.net >= 0 ? rgb(.06, .42, .31) : rgb(.68, .20, .24)], ["Completed tasks", summary.completed, rgb(.30, .25, .60)], ["Open tasks", summary.open, rgb(.66, .43, .12)], ["Attendance", summary.attendance, rgb(.20, .37, .48)]] as const;
      cards.forEach(([label, value, color], index) => { const col = index % 2; const row = Math.floor(index / 2); const x = 45 + col * 260; const y = 652 - row * 125; page.drawRectangle({ x, y, width: 240, height: 98, color: rgb(1, 1, 1), borderColor: rgb(.80, .84, .93), borderWidth: 1 }); page.drawRectangle({ x, y, width: 7, height: 98, color }); page.drawText(label, { x: x + 20, y: y + 66, size: 11, font: bold, color: rgb(.25, .29, .42) }); page.drawText(String(value), { x: x + 20, y: y + 27, size: 23, font: bold, color }); });
      page.drawLine({ start: { x: 45, y: 235 }, end: { x: 550, y: 235 }, thickness: 1, color: rgb(.80, .84, .93) });
      page.drawText("Generated securely by Avenmedia Production Office", { x: 45, y: 205, size: 10, font, color: rgb(.36, .40, .52) });
      page.drawText(new Date().toLocaleDateString('en-GB'), { x: 455, y: 205, size: 10, font, color: rgb(.36, .40, .52) });
      const bytes = await doc.save(); const blob = new Blob([bytes as BlobPart], { type: "application/pdf" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `avenmedia-statement-${month}.pdf`; document.body.appendChild(a); a.click(); a.remove(); setDownloadUrl(url); setDownloaded("تم تنزيل كشف الحساب بنجاح"); window.setTimeout(() => { URL.revokeObjectURL(url); setDownloadUrl(""); }, 120000);
    } catch (cause) { console.error("[Avenmedia][reports][pdf]", cause); setError("تعذر إنشاء ملف PDF"); }
  };
  return <main dir="rtl" className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-3"><div><span className="font-mono text-[10px] tracking-[.18em] text-[#5366e8]">AVENMEDIA / REPORTS</span><h2 className="font-naskh mt-1 text-4xl font-bold">كشف الحساب الشهري</h2><p className="mt-2 text-sm text-slate-500">المهام، الحضور، الإيرادات، المصاريف، والصافي بعد الخصم.</p></div><div className="flex gap-2"><input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3" /><button onClick={() => void load()} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white"><RefreshCw className={busy ? "h-4 animate-spin" : "h-4"} /></button><button onClick={() => void pdf()} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#10194a] px-4 text-sm font-bold text-white disabled:opacity-50"><Download className="h-4" />تنزيل PDF</button></div></header>{(error || downloaded) && <div className={`flex flex-wrap items-center gap-3 rounded-xl p-4 text-sm font-bold ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{error ? error : <><Check className="h-4" />{downloaded}{downloadUrl && <button onClick={() => window.open(downloadUrl, '_blank', 'noopener,noreferrer')} className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-xs"><ExternalLink className="h-3.5" />فتح الملف</button>}</>}</div>}<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(([label, value, tone]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className="text-xs text-slate-500">{label}</span><strong className={`mt-2 block font-mono text-3xl ${tone}`}>{value}</strong></article>)}</section>{busy && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 animate-spin" />تحديث التقرير...</div>}</main>;
}
