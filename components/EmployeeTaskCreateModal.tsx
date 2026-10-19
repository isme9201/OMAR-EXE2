"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Paperclip, Trash2, UploadCloud, X } from "lucide-react";
import { createAvenmediaTask, listEmployees, type Employee } from "@/lib/avenmedia";
import { uploadTaskAttachments } from "@/lib/avenmedia-attachments";
import { AssigneePicker } from "@/components/AssigneePicker";
import { TaskVisibilitySettings } from "@/components/TaskVisibilitySettings";
import { DEFAULT_VISIBLE_TASK_FIELDS, type TaskVisibilityField } from "@/lib/task-visibility";

const emptyForm = {
  title: "",
  task_type: "design",
  client_name: "",
  client_phone: "",
  description: "",
  requirements: "",
  priority: "normal",
  due_at: "",
  employeeIds: [] as string[],
  assignmentPermissions: {} as Record<string, TaskVisibilityField[]>,
};

const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export function EmployeeTaskCreateModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const [form, setForm] = useState({ ...emptyForm });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [taskId, setTaskId] = useState("");
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [employeeError, setEmployeeError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyForm });
    setFiles([]);
    setTaskId("");
    setPercent(0);
    setError("");
    setEmployeeError("");
    let active = true;
    void listEmployees().then((result) => {
      if (!active) return;
      setEmployees(result.data);
      setEmployeeError(result.error);
    });
    document.body.style.overflow = "hidden";
    return () => {
      active = false;
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const update = (key: string, value: unknown) => setForm((old) => ({ ...old, [key]: value }));
  const toggleEmployee = (id: string) => {
    const selected = form.employeeIds.includes(id);
    const nextIds = selected ? form.employeeIds.filter((item) => item !== id) : [...form.employeeIds, id];
    setForm((old) => ({
      ...old,
      employeeIds: nextIds,
      assignmentPermissions: selected
        ? old.assignmentPermissions
        : { ...old.assignmentPermissions, [id]: [...DEFAULT_VISIBLE_TASK_FIELDS] },
    }));
  };

  const uploadPendingFiles = async (activeTaskId: string, label: string) => {
    if (!files.length) return true;
    setPercent(0);
    const result = await uploadTaskAttachments(activeTaskId, label, files, ({ percent: next }) => setPercent(next));
    setFiles(result.failed.map((item) => item.file));
    if (result.failed.length) {
      const reasons = result.failed.map((item) => `${item.file.name}: ${item.error}`).join(" · ");
      setError(`تم حفظ المهمة، لكن بقيت مرفقات لم تكتمل؛ أعد المحاولة للملفات المتبقية. ${reasons}`);
      return false;
    }
    if (result.cleanupError) {
      setError(`تم حفظ المهمة ومرفقاتها، لكن تعذر إبطال رابط الرفع المؤقت: ${result.cleanupError}`);
      onSaved?.();
      return false;
    }
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!taskId && !form.title.trim()) return setError("عنوان المهمة مطلوب.");
    if (!taskId && !form.employeeIds.length) return setError("اختر موظفاً واحداً على الأقل لإسناد المهمة.");
    setBusy(true);
    try {
      let activeTaskId = taskId;
      if (!activeTaskId) {
        const created = await createAvenmediaTask({
          title: form.title.trim(),
          task_type: form.task_type,
          client_name: form.client_name.trim() || "مهمة داخلية",
          client_phone: form.client_phone.trim() || null,
          description: form.description.trim() || null,
          requirements: form.requirements.trim() || null,
          status: "new",
          priority: form.priority,
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          employeeIds: form.employeeIds,
          assignmentPermissions: form.assignmentPermissions,
        });
        if (created.error || !created.data?.id) {
          setError(created.error || "تعذر إنشاء المهمة.");
          return;
        }
        activeTaskId = created.data.id;
        setTaskId(activeTaskId);
        if (!files.length) {
          onSaved?.();
          onClose();
          return;
        }
      }
      const complete = await uploadPendingFiles(activeTaskId, form.title || "مهمة الموظفين");
      if (complete) {
        onSaved?.();
        onClose();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حدث خطأ أثناء حفظ المهمة أو المرفقات.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="fixed inset-0 z-[85] overflow-y-auto bg-[#080d24]/65 p-3 backdrop-blur-sm sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="employee-task-create-title" dir="rtl" className="mx-auto my-2 max-h-[96vh] max-w-4xl overflow-y-auto rounded-3xl border border-indigo-100 bg-[#f8f9ff] p-4 text-[#080d24] shadow-2xl dark:border-white/10 dark:bg-[#172033] dark:text-[#f7f9ff] sm:my-5 sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div><span className="font-mono text-xs tracking-widest text-indigo-600 dark:text-indigo-300">AVENMEDIA / TEAM TASK</span><h2 id="employee-task-create-title" className="mt-1 text-2xl font-black">{taskId ? "المهمة محفوظة — إكمال المرفقات" : "إنشاء مهمة للموظفين"}</h2><p className="mb-0 mt-1 text-xs leading-5 text-slate-500 dark:text-slate-300">حدد المنفذين، راجع بياناتهم، ثم اختر بالضبط ما يظهر لكل شخص.</p></div>
        <button type="button" disabled={busy} onClick={onClose} aria-label="إغلاق" className="rounded-xl p-2 hover:bg-white disabled:opacity-40 dark:hover:bg-white/10"><X /></button>
      </header>
      {(error || employeeError) && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">{error || employeeError}</p>}

      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">عنوان المهمة *
            <input required disabled={!!taskId} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="مثال: تصميم حملة الصيف" className="h-11 rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-indigo-500 dark:border-white/15 dark:bg-[#111a30]" />
          </label>
          <label className="grid gap-2 text-sm font-bold">نوع المهمة
            <select disabled={!!taskId} value={form.task_type} onChange={(event) => update("task_type", event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/15 dark:bg-[#111a30]">
              <option value="design">تصميم</option><option value="photography">تصوير</option><option value="video">فيديو وإنتاج</option><option value="editing">مونتاج</option><option value="marketing">تسويق</option><option value="hr">موارد بشرية</option><option value="accounting">محاسبة</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">اسم العميل (اختياري)
            <input disabled={!!taskId} value={form.client_name} onChange={(event) => update("client_name", event.target.value)} placeholder="اتركه فارغاً لمهمة داخلية" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/15 dark:bg-[#111a30]" />
          </label>
          <label className="grid gap-2 text-sm font-bold">رقم العميل (اختياري)
            <input disabled={!!taskId} value={form.client_phone} onChange={(event) => update("client_phone", event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/15 dark:bg-[#111a30]" />
          </label>
          <label className="grid gap-2 text-sm font-bold">الأولوية
            <select disabled={!!taskId} value={form.priority} onChange={(event) => update("priority", event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/15 dark:bg-[#111a30]"><option value="low">منخفضة</option><option value="normal">عادية</option><option value="high">عالية</option></select>
          </label>
          <label className="grid gap-2 text-sm font-bold">موعد التسليم
            <input disabled={!!taskId} type="datetime-local" value={form.due_at} onChange={(event) => update("due_at", event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-white/15 dark:bg-[#111a30]" />
          </label>
        </div>
        <label className="grid gap-2 text-sm font-bold">تفاصيل المهمة
          <textarea disabled={!!taskId} rows={4} value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="اكتب المطلوب بالتفصيل..." className="rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-500 dark:border-white/15 dark:bg-[#111a30]" />
        </label>
        <label className="grid gap-2 text-sm font-bold">المتطلبات والملاحظات
          <textarea disabled={!!taskId} rows={3} value={form.requirements} onChange={(event) => update("requirements", event.target.value)} placeholder="المقاسات، الصيغ، المراجع، أو أي ملاحظات..." className="rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-500 dark:border-white/15 dark:bg-[#111a30]" />
        </label>
        {!taskId && <>
          <AssigneePicker taskType={form.task_type} employees={employees} selectedIds={form.employeeIds} onToggle={toggleEmployee} />
          <TaskVisibilitySettings employees={employees} selectedIds={form.employeeIds} value={form.assignmentPermissions} onChange={(assignmentPermissions) => update("assignmentPermissions", assignmentPermissions)} />
        </>}

        <section className="rounded-2xl border border-indigo-100 bg-white p-4 dark:border-white/10 dark:bg-[#111a30]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="m-0 flex items-center gap-2 text-sm font-black"><Paperclip className="h-4 text-indigo-600" />مرفقات المهمة</h3><p className="mb-0 mt-1 text-xs text-slate-500 dark:text-slate-300">أرفق صوراً أو فيديوهات أو أي ملف يحتاجه المنفذ.</p></div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-600"><UploadCloud className="h-4" />إضافة ملفات<input type="file" multiple disabled={busy} className="sr-only" onChange={(event) => { if (event.target.files) setFiles((current) => [...current, ...Array.from(event.target.files ?? [])]); event.target.value = ""; }} /></label>
          </div>
          {files.length > 0 && <ul className="mt-3 grid gap-2 sm:grid-cols-2">{files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-white/5"><span className="min-w-0"><strong className="block truncate">{file.name}</strong><small className="text-slate-500">{formatSize(file.size)}</small></span><button type="button" disabled={busy} onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`حذف ${file.name}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"><Trash2 className="h-4" /></button></li>)}</ul>}
          {busy && files.length > 0 && <div className="mt-3"><div className="mb-1 flex justify-between text-[11px] font-bold"><span>جار رفع المرفقات</span><span>{percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${percent}%` }} /></div></div>}
        </section>
        <footer className="flex flex-wrap gap-2 pt-1"><button disabled={busy || (!taskId && !employees.length)} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#080d24] font-black text-white disabled:opacity-50 dark:bg-indigo-600">{busy ? <Loader2 className="h-4 animate-spin" /> : <Check className="h-4" />}{busy ? "جار الحفظ والرفع…" : taskId ? "إعادة رفع المتبقي / إنهاء" : "إنشاء المهمة وإسنادها"}</button><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold disabled:opacity-40 dark:border-white/15 dark:bg-white/5">إلغاء</button></footer>
      </form>
    </section>
  </div>;
}
