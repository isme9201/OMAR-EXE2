"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Paperclip, Trash2, UploadCloud, X } from "lucide-react";
import { listEmployees, type Employee } from "@/lib/avenmedia";
import { uploadTaskAttachments } from "@/lib/avenmedia-attachments";
import { saveRequest } from "@/lib/avenmedia-requests";
import { AssigneePicker } from "@/components/AssigneePicker";
import { TaskVisibilitySettings } from "@/components/TaskVisibilitySettings";
import { DEFAULT_VISIBLE_TASK_FIELDS, defaultTaskVisibilityMap, type TaskVisibilityField } from "@/lib/task-visibility";

const empty = {
  title: "",
  client_name: "",
  client_phone: "",
  task_type: "photography",
  estimated_cost: "",
  payment_type: "none",
  paid_amount: "",
  payment_method: "",
  payment_note: "",
  requirements: "",
  description: "",
  image_urls: [] as string[],
  status: "new",
  priority: "normal",
  due_at: "",
  employeeIds: [] as string[],
  assignmentPermissions: {} as Record<string, TaskVisibilityField[]>,
};

function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-white/15 dark:bg-[#111a30] dark:text-white ${className}`} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 dark:border-white/15 dark:bg-[#111a30] dark:text-white" />;
}

const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export function RequestCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [form, setForm] = useState({ ...empty, assignmentPermissions: defaultTaskVisibilityMap([]) });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [error, setError] = useState("");
  const [taskId, setTaskId] = useState("");

  useEffect(() => {
    let active = true;
    void listEmployees().then((result) => {
      if (!active) return;
      setEmployees(result.data);
      if (result.error) setError(result.error);
    });
    document.body.style.overflow = "hidden";
    return () => {
      active = false;
      document.body.style.overflow = "";
    };
  }, []);

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
    setUploadPercent(0);
    const result = await uploadTaskAttachments(activeTaskId, label, files, ({ percent }) => setUploadPercent(percent));
    setFiles(result.failed.map((item) => item.file));
    if (result.failed.length) {
      const detail = result.failed.map((item) => `${item.file.name}: ${item.error}`).join(" · ");
      setError(`تم حفظ الطلب، لكن بقيت ملفات لم تكتمل. أعد المحاولة للملفات المتبقية. ${detail}`);
      return false;
    }
    if (result.cleanupError) {
      setError(`تم حفظ الطلب والمرفقات، لكن تعذر إبطال رابط الرفع المؤقت: ${result.cleanupError}`);
      onSaved?.();
      return false;
    }
    return true;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!taskId && !form.client_name.trim()) {
      setError("اسم الزبون مطلوب.");
      return;
    }
    setBusy(true);
    try {
      let activeTaskId = taskId;
      if (!activeTaskId) {
        const result = await saveRequest({
          ...form,
          due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
          assignmentPermissions: form.assignmentPermissions,
        });
        if (result.error || !result.data?.id) {
          setError(result.error || "تعذر حفظ الطلب.");
          return;
        }
        activeTaskId = result.data.id;
        setTaskId(activeTaskId);
        if (!files.length) {
          onSaved?.();
          onClose();
          return;
        }
      }
      const complete = await uploadPendingFiles(activeTaskId, form.title || form.client_name || "طلب جديد");
      if (complete) {
        onSaved?.();
        onClose();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حدث خطأ أثناء حفظ الطلب أو المرفقات.");
    } finally {
      setBusy(false);
    }
  };

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    setFiles((current) => [...current, ...Array.from(selected)]);
    setError("");
  };
  const removeFile = (index: number) => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));

  return <div
    className="fixed inset-0 z-[80] overflow-y-auto bg-[#080d24]/65 p-3 backdrop-blur-sm sm:p-5"
    role="presentation"
    onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
  >
    <section role="dialog" aria-modal="true" aria-labelledby="request-create-title" dir="rtl" className="mx-auto my-2 max-h-[96vh] max-w-5xl overflow-y-auto rounded-3xl border border-indigo-100 bg-[#f8f9ff] p-4 text-[#080d24] shadow-2xl dark:border-white/10 dark:bg-[#172033] dark:text-[#f7f9ff] sm:my-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <span className="font-mono text-xs tracking-widest text-indigo-600 dark:text-indigo-300">AVENMEDIA / NEW REQUEST</span>
          <h2 id="request-create-title" className="mt-1 text-2xl font-black">{taskId ? "الطلب محفوظ — إكمال المرفقات" : "إضافة طلب جديد"}</h2>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق" className="rounded-xl p-2 hover:bg-white disabled:opacity-40 dark:hover:bg-white/10"><X /></button>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">{error}</p>}

      <form onSubmit={submit} className="grid gap-4">
        <label className="grid gap-2 text-sm font-bold">اسم الزبون *
          <Input required disabled={!!taskId} value={form.client_name} onChange={(event) => update("client_name", event.target.value)} placeholder="اسم الزبون أو الشركة" />
        </label>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-bold">عنوان الطلب
            <Input disabled={!!taskId} value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="جلسة تصوير منتجات" />
          </label>
          <label className="grid gap-2 text-sm font-bold">رقم الهاتف
            <Input disabled={!!taskId} value={form.client_phone} onChange={(event) => update("client_phone", event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-bold">سعر التكلفة
            <Input disabled={!!taskId} type="number" min="0" value={form.estimated_cost} onChange={(event) => update("estimated_cost", event.target.value)} />
          </label>
        </div>
        <div className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30 md:grid-cols-4">
          <label className="grid gap-2 text-sm font-bold">نوع الدفع
            <Select disabled={!!taskId} value={form.payment_type} onChange={(event) => update("payment_type", event.target.value)}><option value="none">لم يدفع بعد</option><option value="deposit">عربون</option><option value="full">كامل</option></Select>
          </label>
          <label className="grid gap-2 text-sm font-bold">المدفوع حالياً
            <Input disabled={!!taskId} type="number" min="0" value={form.paid_amount} onChange={(event) => update("paid_amount", event.target.value)} placeholder="اختياري" />
          </label>
          <label className="grid gap-2 text-sm font-bold">طريقة الدفع
            <Input disabled={!!taskId} value={form.payment_method} onChange={(event) => update("payment_method", event.target.value)} placeholder="نقدي، تحويل..." />
          </label>
          <div className="flex items-end"><span className="text-xs font-bold text-amber-800 dark:text-amber-200">تُضاف البيانات المالية إلى سجل المالية.</span></div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-bold">نوع الخدمة
            <Select disabled={!!taskId} value={form.task_type} onChange={(event) => update("task_type", event.target.value)}><option value="design">تصميم</option><option value="photography">تصوير</option><option value="video">فيديو وإنتاج</option><option value="editing">مونتاج</option><option value="marketing">تسويق</option><option value="hr">موارد بشرية</option><option value="accounting">محاسبة</option></Select>
          </label>
          <label className="grid gap-2 text-sm font-bold">الحالة
            <Select disabled={!!taskId} value={form.status} onChange={(event) => update("status", event.target.value)}><option value="new">جديد</option><option value="in_progress">قيد التنفيذ</option><option value="design">قيد التصميم</option><option value="completed">مكتملة</option><option value="cancelled">ملغاة</option></Select>
          </label>
          <label className="grid gap-2 text-sm font-bold">موعد التسليم
            <Input disabled={!!taskId} type="datetime-local" value={form.due_at} onChange={(event) => update("due_at", event.target.value)} />
          </label>
        </div>
        <label className="grid gap-2 text-sm font-bold">التفاصيل
          <textarea disabled={!!taskId} rows={4} value={form.description} onChange={(event) => update("description", event.target.value)} className="rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-white/15 dark:bg-[#111a30]" placeholder="شرح كامل لما يريده الزبون..." />
        </label>
        <label className="grid gap-2 text-sm font-bold">المتطلبات
          <textarea disabled={!!taskId} rows={3} value={form.requirements} onChange={(event) => update("requirements", event.target.value)} className="rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-500 disabled:opacity-60 dark:border-white/15 dark:bg-[#111a30]" placeholder="المقاسات، الألوان، الصيغ، الملاحظات..." />
        </label>
        {!taskId && <>
          <AssigneePicker taskType={form.task_type} employees={employees} selectedIds={form.employeeIds} onToggle={toggleEmployee} />
          <TaskVisibilitySettings employees={employees} selectedIds={form.employeeIds} value={form.assignmentPermissions} onChange={(assignmentPermissions) => update("assignmentPermissions", assignmentPermissions)} />
        </>}
        {!taskId && <label className="grid gap-2 text-sm font-bold">روابط إضافية، رابط في كل سطر
          <textarea rows={2} value={form.image_urls.join("\n")} onChange={(event) => update("image_urls", event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} className="rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-indigo-500 dark:border-white/15 dark:bg-[#111a30]" />
        </label>}

        <section className="rounded-2xl border border-indigo-100 bg-white p-4 dark:border-white/10 dark:bg-[#111a30]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="m-0 flex items-center gap-2 text-sm font-black"><Paperclip className="h-4 text-indigo-600" />صور وفيديوهات ومرفقات الطلب</h3>
              <p className="mb-0 mt-1 text-xs text-slate-500 dark:text-slate-300">تُرفع الملفات الأصلية إلى التخزين وتُربط بسجل الطلب؛ لا تحتاج إلى لصق روابط يدوياً.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-600">
              <UploadCloud className="h-4" />اختيار ملفات
              <input type="file" multiple accept="image/*,video/*" disabled={busy} className="sr-only" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
            </label>
          </div>
          {files.length > 0 && <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {files.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-white/5">
              <span className="min-w-0"><strong className="block truncate">{file.name}</strong><small className="text-slate-500">{formatSize(file.size)}</small></span>
              <button type="button" disabled={busy} onClick={() => removeFile(index)} aria-label={`حذف ${file.name}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40 dark:hover:bg-red-950/30"><Trash2 className="h-4" /></button>
            </li>)}
          </ul>}
          {busy && files.length > 0 && <div className="mt-3"><div className="mb-1 flex justify-between text-[11px] font-bold"><span>جار رفع المرفقات</span><span>{uploadPercent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${uploadPercent}%` }} /></div></div>}
        </section>

        <div className="flex flex-wrap gap-2 pt-2">
          <button disabled={busy} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#080d24] font-black text-white disabled:opacity-50 dark:bg-indigo-600">
            {busy ? <Loader2 className="h-4 animate-spin" /> : <Check className="h-4" />}
            {busy ? "جار الحفظ والرفع…" : taskId ? "إعادة رفع المتبقي / إنهاء" : "حفظ الطلب والمرفقات"}
          </button>
          <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold disabled:opacity-40 dark:border-white/15 dark:bg-white/5">إغلاق</button>
        </div>
      </form>
    </section>
  </div>;
}
