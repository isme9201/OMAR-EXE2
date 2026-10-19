"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Download, FolderOpen, HardDrive, Loader2, RefreshCw } from "lucide-react";
import {
  buildSqlExport,
  chooseStorageDirectory,
  downloadSqlFile,
  getStoredStorageDirectory,
  localSavingEnabled,
  setLocalSavingEnabled,
  storageDirectorySupport,
  writeSqlToStorageDirectory,
  type ExportTableReport,
} from "@/lib/data-export";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-[#142c9b]" : "bg-[#aeb7d4]"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "right-6" : "right-1"}`} />
    </button>
  );
}

function statusLabel(report: ExportTableReport) {
  if (report.status === "unreadable") return "غير قابل للقراءة";
  if (report.status === "empty") return "فارغ";
  if (report.status === "truncated") return "مقتطع بحد آمن";
  return "تم التصدير";
}

export default function DataStorageSettings() {
  const [savingEnabled, setSavingEnabled] = useState(true);
  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"folder" | "export" | null>(null);
  const [reports, setReports] = useState<ExportTableReport[]>([]);
  const support = useMemo(() => storageDirectorySupport(), []);

  useEffect(() => {
    setSavingEnabled(localSavingEnabled());
    void getStoredStorageDirectory().then((handle) => setDirectoryName(handle?.name ?? null));
  }, []);

  function updateSaving(value: boolean) {
    setSavingEnabled(value);
    setLocalSavingEnabled(value);
    setNotice(value ? "تم تفعيل الحفظ المحلي لهذا المتصفح." : "تم إيقاف الحفظ المحلي الجديد. لا يحذف ذلك البيانات المحلية السابقة.");
  }

  async function pickFolder() {
    setBusy("folder");
    setNotice("");
    try {
      const handle = await chooseStorageDirectory();
      setDirectoryName(handle.name);
      setNotice(`تم حفظ اختيار المجلد: ${handle.name}. هذا لا يغيّر موقع IndexedDB الذي يديره المتصفح.`);
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") setNotice("أُغلق محدد المجلد دون اختيار.");
      else setNotice(error instanceof Error ? error.message : "تعذر اختيار مجلد مدعوم.");
    } finally {
      setBusy(null);
    }
  }

  async function exportData() {
    setBusy("export");
    setNotice("جارٍ قراءة الجداول المرئية لحسابك عبر Supabase وسياسات RLS…");
    setReports([]);
    try {
      const result = await buildSqlExport();
      setReports(result.reports);
      downloadSqlFile(result.sql);
      const saved = await writeSqlToStorageDirectory(result.sql);
      const unreadable = result.reports.filter((report) => report.status === "unreadable").length;
      const warning = unreadable ? ` تعذر قراءة ${unreadable} جدول(جداول)، وقد أُدرج السبب في التقرير.` : "";
      setNotice(`${saved.written ? `${saved.reason}.` : `${saved.reason}. تم تنزيل الملف إلى مجلد التنزيلات.`}${warning}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "تعذر إنشاء ملف SQL.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section dir="rtl" className="space-y-5" aria-labelledby="data-storage-settings-title">
      <div className="rounded-[22px] border border-[#cbd4f5] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6ebff] text-[#142c9b]"><HardDrive className="h-5 w-5" /></span>
          <div>
            <p className="font-mono text-[10px] tracking-[.16em] text-[#58617e]">LOCAL-FIRST / DATA CONTROL</p>
            <h2 id="data-storage-settings-title" className="mt-1 text-xl font-extrabold">التخزين المحلي وتصدير البيانات</h2>
            <p className="mt-2 text-sm leading-6 text-[#58617e]">تحكم واضح في التخزين المحلي، مع تصدير SQL للصفوف التي يستطيع حسابك الحالي قراءتها فقط.</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-5 rounded-2xl border border-[#dfe5fb] bg-[#f7f9ff] p-4">
          <div>
            <strong className="text-sm">السماح بالحفظ المحلي</strong>
            <p className="mt-1 text-xs leading-6 text-[#58617e]">يحفظ هذا التفضيل محلياً للطبقات التي تتحقق منه. إيقافه لا يحذف السجلات المحلية السابقة ولا يغيّر موقع IndexedDB.</p>
          </div>
          <Toggle checked={savingEnabled} onChange={updateSaving} label="السماح بالحفظ المحلي" />
        </div>
      </div>

      <div className="rounded-[22px] border border-[#cbd4f5] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e6ebff] text-[#142c9b]"><FolderOpen className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold">مجلد التصدير الاختياري</h2>
            <p className="mt-1 text-sm leading-6 text-[#58617e]">{support.message}</p>
            <p className="mt-2 text-xs leading-6 text-[#58617e]">لا يمكن للواجهة نقل موقع IndexedDB؛ يظل هذا المجلد وجهة حقيقية لملفات SQL التي تنشئها أنت.</p>
            {directoryName && <p className="mt-2 text-xs font-bold text-[#142c9b]">المجلد المحفوظ: {directoryName}</p>}
          </div>
        </div>
        <button type="button" onClick={() => void pickFolder()} disabled={!support.available || busy !== null} className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#142c9b] px-4 text-sm font-bold text-[#142c9b] disabled:cursor-not-allowed disabled:opacity-50">
          {busy === "folder" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          اختيار مجلد حقيقي
        </button>
      </div>

      <div className="rounded-[22px] border border-[#cbd4f5] bg-white p-5 shadow-sm">
        <h2 className="text-lg font-extrabold">تنزيل SQL</h2>
        <p className="mt-1 text-sm leading-6 text-[#58617e]">يستخدم صفحات من 250 صفاً وحداً أقصى 10,000 صف لكل جدول. لا يستخدم service key ولا ينفذ SQL ولا يغير بيانات الإنتاج.</p>
        <button type="button" onClick={() => void exportData()} disabled={busy !== null} className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#142c9b] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          تنزيل ملف SQL المرئي لحسابي
        </button>
        {notice && <p role="status" className="mt-4 rounded-xl bg-[#f7f9ff] p-3 text-sm leading-6 text-[#41534b]">{notice}</p>}

        {reports.length > 0 && (
          <div className="mt-5 overflow-x-auto rounded-xl border border-[#dfe5fb]">
            <div className="flex items-center gap-2 border-b border-[#dfe5fb] bg-[#f7f9ff] p-3 text-sm font-bold"><RefreshCw className="h-4 w-4 text-[#142c9b]" /> تقرير القراءة والتصدير</div>
            <table className="w-full min-w-[520px] text-right text-xs">
              <thead><tr className="border-b border-[#dfe5fb] text-[#58617e]"><th className="p-3">الجدول</th><th className="p-3">الحالة</th><th className="p-3">الصفوف</th><th className="p-3">التفصيل</th></tr></thead>
              <tbody>{reports.map((report) => <tr key={report.table} className="border-b border-[#eef1fb] last:border-0"><td className="p-3 font-mono">{report.table}</td><td className="p-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-bold ${report.status === "unreadable" ? "bg-red-50 text-red-700" : report.status === "truncated" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{report.status === "unreadable" ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />}{statusLabel(report)}</span></td><td className="p-3">{report.rows.toLocaleString("ar-IQ")}</td><td className="p-3 text-[#58617e]">{report.error ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
